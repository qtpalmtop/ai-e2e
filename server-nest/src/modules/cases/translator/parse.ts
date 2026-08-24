// 解析阶段：遍历 schema，按节点类型生成 puppeteer 代码片段
// 行为与原 server/src/translator/parse.js 完全一致

const INDENT = '      '; // 6 个空格

function ind(level = 1): string {
  return INDENT + '  '.repeat(level);
}

function jsStr(v: unknown): string {
  if (v === undefined || v === null) return '""';
  return JSON.stringify(String(v));
}

interface FlowNode {
  id: string;
  type: string;
  data?: Record<string, any>;
}
interface FlowEdge {
  id?: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
}
interface Schema {
  nodes: FlowNode[];
  edges: FlowEdge[];
}

function findNode(nodes: FlowNode[], id: string): FlowNode | null {
  return nodes.find((n) => n.id === id) || null;
}

function outgoing(edges: FlowEdge[], fromId: string, sourceHandle?: string) {
  return edges.filter((e) => {
    if (e.source !== fromId) return false;
    if (sourceHandle === undefined) return true;
    return (e.sourceHandle ?? 'out') === sourceHandle;
  });
}

function maybeWrap(
  name: string,
  bodyLines: string[],
  live: boolean,
  depth = 1,
): string[] {
  if (!live) return bodyLines;
  const inner = bodyLines.map((l) => '  ' + l).join('\n');
  return [
    `${ind(depth)}await __step__(page, ${jsStr(name)}, async () => {`,
    inner,
    `${ind(depth)}});`,
  ];
}

function genFromNode(startNode: FlowNode, ctx: Schema, opts: { live?: boolean } = {}): string {
  const { nodes, edges } = ctx;
  const live = !!opts.live;
  const lines: string[] = [];
  const visited = new Set<string>();

  function emit(node: FlowNode | null, depth = 1) {
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
        const expr = data.expression || 'false';
        const trueEdge = outgoing(edges, node.id, 'true')[0];
        const falseEdge = outgoing(edges, node.id, 'false')[0];
        lines.push(`${ind(depth)}// ${label}: if (${expr})`);
        lines.push(`${ind(depth)}if (${expr}) {`);
        if (trueEdge) {
          const tn = findNode(nodes, trueEdge.target);
          lines.push(emitSub(tn, depth + 1, live));
        } else {
          lines.push(`${ind(depth + 1)}// (no true branch)`);
        }
        lines.push(`${ind(depth)}} else {`);
        if (falseEdge) {
          const fn = findNode(nodes, falseEdge.target);
          lines.push(emitSub(fn, depth + 1, live));
        } else {
          lines.push(`${ind(depth + 1)}// (no false branch)`);
        }
        lines.push(`${ind(depth)}}`);
        break;
      }

      case 'loop': {
        const mode = data.mode || 'count';
        const outEdges = outgoing(edges, node.id, 'out');
        const exitEdges = outgoing(edges, node.id, 'exit');
        const bodyStart = outEdges[0] ? findNode(nodes, outEdges[0].target) : null;
        const exitStart = exitEdges[0] ? findNode(nodes, exitEdges[0].target) : null;

        if (mode === 'count') {
          const n = Number(data.count) || 1;
          const header = `${ind(depth)}for (let __i = 0; __i < ${n}; __i++) {`;
          if (live) {
            lines.push(`${ind(depth)}await __loop__(page, ${jsStr(label)}, ${n}, async () => {`);
            lines.push(header);
            if (bodyStart) lines.push(emitSub(bodyStart, depth + 2, live));
            lines.push(`${ind(depth)}});`);
          } else {
            lines.push(`${ind(depth)}// ${label}: loop × ${n}`);
            lines.push(header);
            if (bodyStart) lines.push(emitSub(bodyStart, depth + 1, live));
            lines.push(`${ind(depth)}}`);
          }
        } else {
          const expr = data.whileExpression || 'false';
          lines.push(`${ind(depth)}// ${label}: while (${expr})`);
          lines.push(`${ind(depth)}while (${expr}) {`);
          if (bodyStart) lines.push(emitSub(bodyStart, depth + 1, live));
          lines.push(`${ind(depth)}}`);
        }
        if (exitStart) emit(exitStart, depth);
        break;
      }

      default:
        lines.push(`${ind(depth)}// unknown node type: ${node.type}`);
    }
  }

  function emitSub(node: FlowNode | null, depth: number, live: boolean): string {
    if (!node) return `${ind(depth)}// (empty)`;
    const out: string[] = [];
    let cur: FlowNode | null = node;
    let safety = 0;
    const localVisited = new Set<string>();
    while (cur && safety++ < 200) {
      if (localVisited.has(cur.id)) {
        out.push(`${ind(depth)}// break: cycle detected at ${cur.id}`);
        break;
      }
      localVisited.add(cur.id);

      const data = cur.data || {};
      const label = data.label || cur.type;
      let block: string[];
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

export function parse(schema: Schema, opts: { live?: boolean } = {}): string {
  const startNode = schema.nodes.find((n) => n.type === 'start');
  if (!startNode) {
    return '      // (no start node)';
  }
  return genFromNode(startNode, { nodes: schema.nodes, edges: schema.edges }, opts);
}
