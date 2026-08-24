// Live 运行器：与普通 runner 共用 describe/it 拦截器（兼容模式），
// 唯一差异：
//   1. translate 时传 { live: true }，产物里已注入 __step__/__loop__/__emit__
//   2. 子进程 stdout 按行解析，__EVT__ 前缀的当事件回调，剩余当日志
//
// 这种"按行解析"协议比 IPC 简单可靠：进程间只走纯文本，断连也无副作用

import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs/promises';
import { getCase } from '../storage/fileStore.js';
import { translate } from '../translator/index.js';

export async function liveRun(caseId, onEvent) {
  const c = await getCase(caseId);
  if (!c) throw new Error('case not found');

  const file = await translate(c, { live: true });
  const abs = path.resolve(file);

  onEvent?.({ type: 'start', caseName: c.name, file: abs, ts: Date.now() });

  // 与普通 runner 同一份 wrapper：拦截 describe/it/beforeAll/afterAll，
  // 让 describe 包的整体走 beforeAll → it → afterAll 顺序执行
  const wrapperPath = path.join(path.dirname(abs), `.live-runner-${caseId}.cjs`);
  await fs.writeFile(wrapperPath, buildWrapper(abs), 'utf8');

  const start = Date.now();
  let ok = true;
  try {
    const r = await execNode(wrapperPath, onEvent);
    ok = r.ok;
  } finally {
    await fs.unlink(wrapperPath).catch(() => {});
  }
  onEvent?.({ type: 'done', ok, duration: Date.now() - start });
  return { ok, duration: Date.now() - start };
}

// wrapper 复用普通 runner 的拦截逻辑（但本 runner 不需要 __emit__ 输出 done/fail，）
// 事件由 __step__/__loop__ 在子进程内自己 emit
function buildWrapper(specPath) {
  return [
    "const path = " + JSON.stringify(specPath) + ";",
    "const hasMocha = typeof describe === 'function' && typeof it === 'function';",
    "if (hasMocha) {",
    "  require(path);",
    "} else {",
    "  const calls = [];",
    "  let currentSuite = null;",
    "  global.describe = function (name, fn) {",
    "    const prev = currentSuite;",
    "    const suite = { name: name, beforeAll: [], afterAll: [], tests: [] };",
    "    currentSuite = suite;",
    "    calls.push(function () {",
    "      process.stdout.write('\\n=== ' + name + ' ===\\n');",
    "      return Promise.resolve()",
    "        .then(async function () { for (const h of suite.beforeAll) await h(); })",
    "        .then(async function () {",
    "          for (const t of suite.tests) {",
    "            process.stdout.write('--- ' + t.name + '---\\n');",
    "            try { await t.fn(); process.stdout.write('[ok] ' + t.name + '\\n'); }",
    "            catch (e) { process.stdout.write('[fail] ' + t.name + ': ' + (e && e.message) + '\\n'); throw e; }",
    "          }",
    "        })",
    "        .finally(async function () { for (const h of suite.afterAll) { try { await h(); } catch (e) {} } });",
    "    });",
    "    fn();",
    "    currentSuite = prev;",
    "  };",
    "  global.beforeAll = function (fn) { if (currentSuite) currentSuite.beforeAll.push(fn); };",
    "  global.afterAll = function (fn) { if (currentSuite) currentSuite.afterAll.push(fn); };",
    "  global.it = function (name, fn) { if (currentSuite) currentSuite.tests.push({ name: name, fn: fn }); };",
    "  (async function () {",
    "    try {",
    "      require(path);",
    "      for (const c of calls) await c();",
    "      process.stdout.write('[runner] all done\\n');",
    "    } catch (e) {",
    "      process.stdout.write('[runner] abort: ' + (e && e.message) + '\\n');",
    "      process.exitCode = 1;",
    "    }",
    "  })();",
    "}",
    "",
  ].join("\n");
}

function execNode(filePath, onEvent) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [filePath], {
      cwd: path.resolve(path.dirname(filePath), '../..'),
      env: { ...process.env },
    });
    let ok = true;
    let lineBuf = '';
    child.stdout.on('data', (chunk) => {
      lineBuf += chunk.toString('utf8');
      // 按行切分，保留尾部不完整行
      const lines = lineBuf.split('\n');
      lineBuf = lines.pop() ?? '';
      for (const line of lines) handleLine(line, onEvent);
    });
    child.stderr.on('data', (chunk) => {
      onEvent?.({ type: 'log', level: 'stderr', text: chunk.toString('utf8') });
    });
    child.on('close', () => {
      // 处理尾巴残留
      if (lineBuf) handleLine(lineBuf, onEvent);
      resolve({ ok });
    });
    child.on('error', (e) => {
      onEvent?.({ type: 'error', message: e.message });
      ok = false;
      resolve({ ok });
    });
    // 5 分钟超时
    const tm = setTimeout(() => {
      try { child.kill('SIGKILL'); } catch {}
      onEvent?.({ type: 'error', message: 'timeout after 5min' });
      ok = false;
      resolve({ ok });
    }, 5 * 60 * 1000);
    child.on('close', () => clearTimeout(tm));
  });
}

function handleLine(line, onEvent) {
  if (line.startsWith('__EVT__')) {
    try {
      const obj = JSON.parse(line.slice(7));
      onEvent?.(obj);
    } catch {
      onEvent?.({ type: 'log', text: line });
    }
  } else if (line) {
    onEvent?.({ type: 'log', text: line });
  }
}
