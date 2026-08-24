// 本地运行器：spawn 子进程执行翻译产出的 .spec.cjs
// 与原 server/src/runner/index.js 行为一致；改为 TS + 通用化（接受 schema 而非 fileStore id）
import { spawn } from 'node:child_process';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import { translate, OUTPUT_DIR } from '../translator/translate';

export interface RunResult {
  ok: boolean;
  logs: string;
  duration: number;
  file: string;
}

export async function runCase(schema: {
  id: string;
  name: string;
  nodes: any[];
  edges: any[];
}): Promise<RunResult> {
  const file = await translate(schema);
  const abs = path.resolve(file);

  const wrapperPath = path.join(OUTPUT_DIR, `.runner-${schema.id}.cjs`);
  await fs.writeFile(wrapperPath, buildWrapper(abs), 'utf8');

  const start = Date.now();
  let logs = '';
  try {
    logs = await execNode(wrapperPath);
  } finally {
    await fs.unlink(wrapperPath).catch(() => {});
  }
  const duration = Date.now() - start;
  const ok = !/\[case\] failed/.test(logs) && !/\[runner\] abort/.test(logs);
  return { ok, logs, duration, file: abs };
}

function buildWrapper(specPath: string): string {
  return [
    '// AUTO wrapper for: ' + specPath,
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
    "      console.log('\\n=== ' + name + ' ===');",
    '      return Promise.resolve()',
    '        .then(async function () {',
    '          for (const h of suite.beforeAll) await h();',
    '        })',
    '        .then(async function () {',
    '          for (const t of suite.tests) {',
    "            console.log('--- ' + t.name + ' ---');",
    '            try {',
    '              await t.fn();',
    "              console.log('[ok] ' + t.name);",
    '            } catch (e) {',
    "              console.log('[fail] ' + t.name + ': ' + (e && e.message));",
    '              throw e;',
    '            }',
    '          }',
    '        })',
    '        .finally(async function () {',
    '          for (const h of suite.afterAll) {',
    "            try { await h(); } catch (e) { console.log('[afterAll err]', e.message); }",
    '          }',
    '        });',
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
    '      for (const c of calls) {',
    '        await c();',
    '      }',
    "      console.log('[runner] all done');",
    '    } catch (e) {',
    "      console.log('[runner] abort: ' + (e && e.message));",
    "      if (e && /spawn.*Unknown system error -88|No such file|ENOENT|EACCES/.test(e.message)) {",
    "        console.log('[runner] hint: Puppeteer/Chromium failed to launch.');",
    "        console.log('[runner]       Try: npx puppeteer browsers install chrome');",
    "        console.log('[runner]       Or set PUPPETEER_EXECUTABLE_PATH to your local Chrome.');",
    "        console.log('[runner]       On macOS you may also need: xattr -d com.apple.quarantine <chrome>');",
    '      }',
    '      process.exitCode = 1;',
    '    }',
    '  })();',
    '}',
    '',
  ].join('\n');
}

function execNode(filePath: string): Promise<string> {
  return new Promise((resolve) => {
    const env: NodeJS.ProcessEnv = { ...process.env };
    if (!env.PUPPETEER_EXECUTABLE_PATH) {
      const candidates = [
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        '/Applications/Chromium.app/Contents/MacOS/Chromium',
        '/usr/bin/google-chrome',
        '/usr/bin/chromium-browser',
        '/usr/bin/chromium',
      ];
      const found = candidates.find((p) => {
        try {
          require('node:fs').accessSync(p);
          return true;
        } catch {
          return false;
        }
      });
      if (found) env.PUPPETEER_EXECUTABLE_PATH = found;
    }

    const child = spawn(process.execPath, [filePath], {
      cwd: path.resolve(path.dirname(filePath), '..'),
      env,
    });
    let out = '';
    child.stdout.on('data', (d) => (out += d.toString()));
    child.stderr.on('data', (d) => (out += d.toString()));
    child.on('close', () => resolve(out));
    child.on('error', (e) => {
      out += '\n[runner] spawn error: ' + e.message;
      resolve(out);
    });
    const tm = setTimeout(() => {
      try {
        child.kill('SIGKILL');
      } catch {
        /* ignore */
      }
      out += '\n[runner] timeout: killed after 5min';
      resolve(out);
    }, 5 * 60 * 1000);
    child.on('close', () => clearTimeout(tm));
  });
}
