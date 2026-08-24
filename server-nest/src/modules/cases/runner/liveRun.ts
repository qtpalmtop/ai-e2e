// Live 运行器：翻译为 live 模式，事件通过 onEvent 回调抛出
// 行为与原 server/src/runner/live.js 一致
import { spawn } from 'node:child_process';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import { translate, OUTPUT_DIR } from '../translator/translate';

export type LiveEvent =
  | { type: 'start'; caseName: string; file: string; ts: number }
  | { type: 'log'; level?: string; text: string }
  | { type: 'step-start'; name: string; index: number; loop?: { count: number } }
  | {
      type: 'step-end';
      name: string;
      index: number;
      duration: number;
      screenshot: string | null;
      ok: boolean;
      error?: string;
    }
  | { type: 'error'; message: string }
  | { type: 'done'; ok: boolean; duration: number };

export async function liveRun(
  schema: { id: string; name: string; nodes: any[]; edges: any[] },
  onEvent: (e: LiveEvent) => void,
): Promise<{ ok: boolean; duration: number }> {
  const file = await translate(schema, { live: true });
  const abs = path.resolve(file);

  onEvent({ type: 'start', caseName: schema.name, file: abs, ts: Date.now() });

  const wrapperPath = path.join(OUTPUT_DIR, `.live-runner-${schema.id}.cjs`);
  await fs.writeFile(wrapperPath, buildWrapper(abs), 'utf8');

  const start = Date.now();
  let ok = true;
  try {
    const r = await execNode(wrapperPath, onEvent);
    ok = r.ok;
  } finally {
    await fs.unlink(wrapperPath).catch(() => {});
  }
  onEvent({ type: 'done', ok, duration: Date.now() - start });
  return { ok, duration: Date.now() - start };
}

function buildWrapper(specPath: string): string {
  return [
    'const path = ' + JSON.stringify(specPath) + ';',
    "const hasMocha = typeof describe === 'function' && typeof it === 'function';",
    'if (hasMocha) {',
    '  require(path);',
    '} else {',
    '  const calls = [];',
    '  let currentSuite = null;',
    '  global.describe = function (name, fn) {',
    '    const prev = currentSuite;',
    '    const suite = { name: name, beforeAll: [], afterAll: [], tests: [] };',
    '    currentSuite = suite;',
    '    calls.push(function () {',
    "      process.stdout.write('\\n=== ' + name + '===\\n');",
    '      return Promise.resolve()',
    '        .then(async function () { for (const h of suite.beforeAll) await h(); })',
    '        .then(async function () {',
    '          for (const t of suite.tests) {',
    "            process.stdout.write('--- ' + t.name + '---\\n');",
    '            try { await t.fn(); process.stdout.write("[ok] " + t.name + "\\n"); }',
    '            catch (e) { process.stdout.write("[fail] " + t.name + ": " + (e && e.message) + "\\n"); throw e; }',
    '          }',
    '        })',
    '        .finally(async function () { for (const h of suite.afterAll) { try { await h(); } catch (e) {} } });',
    '    });',
    '    fn();',
    '    currentSuite = prev;',
    '  };',
    '  global.beforeAll = function (fn) { if (currentSuite) currentSuite.beforeAll.push(fn); };',
    '  global.afterAll = function (fn) { if (currentSuite) currentSuite.afterAll.push(fn); };',
    '  global.it = function (name, fn) { if (currentSuite) currentSuite.tests.push({ name: name, fn: fn }); };',
    '  (async function () {',
    '    try {',
    '      require(path);',
    '      for (const c of calls) await c();',
    "      process.stdout.write('[runner] all done\\n');",
    '    } catch (e) {',
    "      process.stdout.write('[runner] abort: ' + (e && e.message) + '\\n');",
    '      process.exitCode = 1;',
    '    }',
    '  })();',
    '}',
    '',
  ].join('\n');
}

function execNode(
  filePath: string,
  onEvent: (e: LiveEvent) => void,
): Promise<{ ok: boolean }> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [filePath], {
      cwd: path.resolve(path.dirname(filePath), '..'),
      env: { ...process.env },
    });
    let ok = true;
    let lineBuf = '';
    child.stdout.on('data', (chunk) => {
      lineBuf += chunk.toString('utf8');
      const lines = lineBuf.split('\n');
      lineBuf = lines.pop() ?? '';
      for (const line of lines) handleLine(line, onEvent);
    });
    child.stderr.on('data', (chunk) => {
      onEvent({ type: 'log', level: 'stderr', text: chunk.toString('utf8') });
    });
    child.on('close', () => {
      if (lineBuf) handleLine(lineBuf, onEvent);
      resolve({ ok });
    });
    child.on('error', (e) => {
      onEvent({ type: 'error', message: e.message });
      ok = false;
      resolve({ ok });
    });
    const tm = setTimeout(() => {
      try {
        child.kill('SIGKILL');
      } catch {
        /* ignore */
      }
      onEvent({ type: 'error', message: 'timeout after 5min' });
      ok = false;
      resolve({ ok });
    }, 5 * 60 * 1000);
    child.on('close', () => clearTimeout(tm));
  });
}

function handleLine(line: string, onEvent: (e: LiveEvent) => void) {
  if (line.startsWith('__EVT__')) {
    try {
      const obj = JSON.parse(line.slice(7));
      onEvent(obj as LiveEvent);
    } catch {
      onEvent({ type: 'log', text: line });
    }
  } else if (line) {
    onEvent({ type: 'log', text: line });
  }
}
