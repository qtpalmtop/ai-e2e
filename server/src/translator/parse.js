// 解析阶段：遍历 schema，按节点类型生成对应的 puppeteer 代码片段
// 全部累积在内存中（body 字符串），由 output 阶段填入骨架
//
// 支持两种 emit 模式：
//   - 普通模式（默认）：直接生成 await 序列
//   - live 模式：每个动作节点包在 __step__(name, async () => { ... }) 里，
//     让子进程在每步结束截图并把事件写到 stdout
//
// 公共参数：opts.live 决定是否走 live 模式

const INDENT = '      '; // 6 个空格，对齐到 it(...) 内部

function ind(level = 1) {
  return INDENT + '  '.repeat(level);
}

function jsStr(v) {
  if (v === undefined || v === null) return '""';
  return JSON.stringify(String(v));
}

function findNode(nodes, id) {
  return nodes.find((n) => n.id === id) || null;
}

function outgoing(edges, fromId, sourceHandle) {
  return edges.filter((e) => {
    if (e.source !== fromId) return false;
    if (sourceHandle === undefined) return true;
    return (e.sourceHandle ?? 'out') === sourceHandle;
  });
}

// 在 live 模式下，把一组代码行包成 __step__ 调用；普通模式直接返回
function maybeWrap(name, bodyLines, live, depth = 1) {
  if (!live) return bodyLines;
  const inner = bodyLines.map((l) => '  ' + l).join('\n');
  return [
    `${ind(depth)}await __step__(page, ${jsStr(name)}, async () => {`,
    inner,
    `${ind(depth)}});`,
  ];
}

// 递归生成从 start 节点开始的代码串
function genFromNode(startNode, ctx, opts = {}) {
  const { nodes, edges } = ctx;
  const live = !!opts.live;
  const lines = [];
  const visited = new Set();

  function emit(node, depth = 1) {
    if (!node) return;
    if (visited.has(node.id) && node.type !== 'loop' && node.type !== 'condition') {
      lines.push(`${ind(depth)}// skip already-visited ${node.type}`);
      return;
    }
    visited.add(node.id);
    const data = node.data || {};
    const label = data.label || node.type;

    switch (node.type) {
      case 'start':
      case 'end':
        // 开始/结束是流程标记，不算"动作步"，不打 step 事件
        lines.push(`${ind(depth)}// ${label}`);
        const nextEdges = outgoing(edges, node.id, 'out');
        if (nextEdges[0]) emit(findNode(nodes, nextEdges[0].target), depth);
        break;

      case 'openPage': {
        const url = data.url || '';
        const block = [
          `${ind(depth)}// ${label}: open ${url}`,
          `${ind(depth)}await page.goto(${jsStr(url)}, { waitUntil: 'networkidle2', timeout: 30000 });`,
        ];
        lines.push(...maybeWrap(label, block, live, depth));
        const ne = outgoing(edges, node.id, 'out');
        if (ne[0]) emit(findNode(nodes, ne[0].target), depth);
        break;
      }

      case 'inputText': {
        const sel = data.selector || '';
        const text = data.text || '';
        const delay = Number(data.delay) || 0;
        const block = [
          `${ind(depth)}// ${label}: type into ${sel}`,
          `${ind(depth)}await page.waitForSelector(${jsStr(sel)});`,
          `${ind(depth)}await page.click(${jsStr(sel)}, { clickCount: 3 });`,
          `${ind(depth)}await page.type(${jsStr(sel)}, ${jsStr(text)}, { delay: ${delay} });`,
        ];
        lines.push(...maybeWrap(label, block, live, depth));
        const ne = outgoing(edges, node.id, 'out');
        if (ne[0]) emit(findNode(nodes, ne[0].target), depth);
        break;
      }

      case 'clickElement': {
        const sel = data.selector || '';
        const waitAfter = Number(data.waitAfter) || 0;
        const block = [
          `${ind(depth)}// ${label}: click ${sel}`,
          `${ind(depth)}await page.waitForSelector(${jsStr(sel)});`,
          `${ind(depth)}await page.click(${jsStr(sel)});`,
        ];
        if (waitAfter > 0) block.push(`${ind(depth)}await new Promise(r => setTimeout(r, ${waitAfter}));`);
        lines.push(...maybeWrap(label, block, live, depth));
        const ne = outgoing(edges, node.id, 'out');
        if (ne[0]) emit(findNode(nodes, ne[0].target), depth);
        break;
      }

      case 'hoverElement': {
        const sel = data.selector || '';
        const delay = Number(data.delay) || 0;
        const block = [
          `${ind(depth)}// ${label}: hover ${sel}`,
          `${ind(depth)}await page.waitForSelector(${jsStr(sel)});`,
          `${ind(depth)}await page.hover(${jsStr(sel)});`,
        ];
        if (delay > 0) block.push(`${ind(depth)}await new Promise(r => setTimeout(r, ${delay}));`);
        lines.push(...maybeWrap(label, block, live, depth));
        const ne = outgoing(edges, node.id, 'out');
        if (ne[0]) emit(findNode(nodes, ne[0].target), depth);
        break;
      }

      case 'wait': {
        const ms = Number(data.duration) || 0;
        const block = [
          `${ind(depth)}// ${label}: wait ${ms}ms`,
          `${ind(depth)}await new Promise(r => setTimeout(r, ${ms}));`,
        ];
        lines.push(...maybeWrap(label, block, live, depth));
        const ne = outgoing(edges, node.id, 'out');
        if (ne[0]) emit(findNode(nodes, ne[0].target), depth);
        break;
      }

      case 'condition': {
        // 条件节点自身不构成 step，其内部分支步仍走 step 包装
        const expr = data.expression || 'false';
        const trueEdge = outgoing(edges, node.id, 'true')[0];
        const falseEdge = outgoing(edges, node.id, 'false')[0];
        lines.push(`${ind(depth)}// ${label}: if (${expr})`);
        lines.push(`${ind(depth)}if (${expr}) {`);
        if (trueEdge) {
          const tn = findNode(nodes, trueEdge.target);
          const sub = emitSub(tn, ctx, depth + 1, live);
          lines.push(sub);
        } else {
          lines.push(`${ind(depth + 1)}// (no true branch)`);
        }
        lines.push(`${ind(depth)}} else {`);
        if (falseEdge) {
          const fn = findNode(nodes, falseEdge.target);
          const sub = emitSub(fn, ctx, depth + 1, live);
          lines.push(sub);
        } else {
          lines.push(`${ind(depth + 1)}// (no false branch)`);
        }
        lines.push(`${ind(depth)}}`);
        break;
      }

      case 'loop': {
        // 循环节点本身打个 step（表示进入循环），body 内节点各自再 step
        const mode = data.mode || 'count';
        const outEdges = outgoing(edges, node.id, 'out');
        const exitEdges = outgoing(edges, node.id, 'exit');
        const bodyStart = outEdges[0] ? findNode(nodes, outEdges[0].target) : null;
        const exitStart = exitEdges[0] ? findNode(nodes, exitEdges[0].target) : null;

        if (mode === 'count') {
          const n = Number(data.count) || 1;
          const header = `${ind(depth)}for (let __i = 0; __i < ${n}; __i++) {`;
          if (live) {
            // 整个 for 循环包成一步，每一轮后都截图
            lines.push(`${ind(depth)}await __loop__(page, ${jsStr(label)}, ${n}, async () => {`);
            lines.push(header);
            if (bodyStart) {
              const sub = emitSub(bodyStart, ctx, depth + 2, live);
              lines.push(sub);
            }
            lines.push(`${ind(depth)}});`);
          } else {
            lines.push(`${ind(depth)}// ${label}: loop × ${n}`);
            lines.push(header);
            if (bodyStart) {
              const sub = emitSub(bodyStart, ctx, depth + 1, live);
              lines.push(sub);
            }
            lines.push(`${ind(depth)}}`);
          }
        } else {
          const expr = data.whileExpression || 'false';
          lines.push(`${ind(depth)}// ${label}: while (${expr})`);
          lines.push(`${ind(depth)}while (${expr}) {`);
          if (bodyStart) {
            const sub = emitSub(bodyStart, ctx, depth + 1, live);
            lines.push(sub);
          }
          lines.push(`${ind(depth)}}`);
        }
        if (exitStart) emit(exitStart, depth);
        break;
      }

      default:
        lines.push(`${ind(depth)}// unknown node type: ${node.type}`);
    }
  }

  // 递归生成某节点开始到结束（或回到已知节点）的子代码
  function emitSub(node, ctx, depth, live) {
    if (!node) return `${ind(depth)}// (empty)`;
    const out = [];
    let cur = node;
    let safety = 0;
    const localVisited = new Set();
    while (cur && safety++ < 200) {
      if (localVisited.has(cur.id)) {
        out.push(`${ind(depth)}// break: cycle detected at ${cur.id}`);
        break;
      }
      localVisited.add(cur.id);

      const data = cur.data || {};
      const label = data.label || cur.type;
      let block;
      switch (cur.type) {
        case 'end':
          out.push(`${ind(depth)}// ${label}`);
          return out.join('\n');
        case 'start':
          out.push(`${ind(depth)}// ${label}`);
          break;
        case 'openPage':
          block = [
            `${ind(depth)}// ${label}: open ${data.url}`,
            `${ind(depth)}await page.goto(${jsStr(data.url)}, { waitUntil: 'networkidle2', timeout: 30000 });`,
          ];
          out.push(...maybeWrap(label, block, live, depth));
          break;
        case 'inputText':
          block = [
            `${ind(depth)}// ${label}: type into ${data.selector}`,
            `${ind(depth)}await page.waitForSelector(${jsStr(data.selector)});`,
            `${ind(depth)}await page.click(${jsStr(data.selector)}, { clickCount: 3 });`,
            `${ind(depth)}await page.type(${jsStr(data.selector)}, ${jsStr(data.text)}, { delay: ${Number(data.delay) || 0} });`,
          ];
          out.push(...maybeWrap(label, block, live, depth));
          break;
        case 'clickElement':
          block = [
            `${ind(depth)}// ${label}: click ${data.selector}`,
            `${ind(depth)}await page.waitForSelector(${jsStr(data.selector)});`,
            `${ind(depth)}await page.click(${jsStr(data.selector)});`,
          ];
          if (Number(data.waitAfter) > 0) block.push(`${ind(depth)}await new Promise(r => setTimeout(r, ${Number(data.waitAfter)}));`);
          out.push(...maybeWrap(label, block, live, depth));
          break;
        case 'hoverElement':
          block = [
            `${ind(depth)}// ${label}: hover ${data.selector}`,
            `${ind(depth)}await page.waitForSelector(${jsStr(data.selector)});`,
            `${ind(depth)}await page.hover(${jsStr(data.selector)});`,
          ];
          if (Number(data.delay) > 0) block.push(`${ind(depth)}await new Promise(r => setTimeout(r, ${Number(data.delay)}));`);
          out.push(...maybeWrap(label, block, live, depth));
          break;
        case 'wait':
          block = [
            `${ind(depth)}// ${label}: wait ${data.duration}ms`,
            `${ind(depth)}await new Promise(r => setTimeout(r, ${Number(data.duration) || 0}));`,
          ];
          out.push(...maybeWrap(label, block, live, depth));
          break;
        default:
          // condition/loop inside sub: 不展开
          out.push(`${ind(depth)}// (nested ${cur.type} not inlined here)`);
          return out.join('\n');
      }
      const nexts = outgoing(edges, cur.id, 'out');
      if (!nexts[0]) return out.join('\n');
      cur = findNode(nodes, nexts[0].target);
    }
    return out.join('\n');
  }

  emit(startNode, 1);
  return lines.join('\n');
}

/**
 * 解析入口
 * @param {object} schema - 用例 schema
 * @param {object} opts - { live: boolean }
 * @returns {string} 生成的 puppeteer 代码体
 */
export function parse(schema, opts = {}) {
  const startNode = schema.nodes.find((n) => n.type === 'start');
  if (!startNode) {
    return '      // (no start node)';
  }
  const ctx = { nodes: schema.nodes, edges: schema.edges };
  return genFromNode(startNode, ctx, opts);
}
