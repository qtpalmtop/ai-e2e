// 文件存储：每个 case 一个 JSON 文件
// 适合单机 / 本地开发，零依赖

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../../data');
const CASES_DIR = path.join(ROOT, 'cases');
const OUTPUT_DIR = path.join(ROOT, 'output');

await fs.mkdir(CASES_DIR, { recursive: true });
await fs.mkdir(OUTPUT_DIR, { recursive: true });

export function caseFilePath(id) {
  return path.join(CASES_DIR, `${id}.json`);
}

export function outputFilePath(id, opts = {}) {
  const suffix = opts.live ? '.live.spec.cjs' : '.spec.cjs';
  return path.join(OUTPUT_DIR, `${id}${suffix}`);
}

export async function listCases() {
  const files = await fs.readdir(CASES_DIR);
  const out = [];
  for (const f of files) {
    if (!f.endsWith('.json')) continue;
    try {
      const raw = await fs.readFile(path.join(CASES_DIR, f), 'utf8');
      const c = JSON.parse(raw);
      out.push({
        id: c.id,
        name: c.name,
        description: c.description,
        updatedAt: c.updatedAt,
        createdAt: c.createdAt,
      });
    } catch {
      // 损坏文件跳过
    }
  }
  out.sort((a, b) => b.updatedAt - a.updatedAt);
  return out;
}

export async function getCase(id) {
  try {
    const raw = await fs.readFile(caseFilePath(id), 'utf8');
    return JSON.parse(raw);
  } catch (e) {
    if (e.code === 'ENOENT') return null;
    throw e;
  }
}

export async function writeCase(c) {
  await fs.writeFile(caseFilePath(c.id), JSON.stringify(c, null, 2), 'utf8');
}

export async function deleteCase(id) {
  try {
    await fs.unlink(caseFilePath(id));
    await fs.unlink(outputFilePath(id)).catch(() => {});
  } catch (e) {
    if (e.code !== 'ENOENT') throw e;
  }
}

export { OUTPUT_DIR, CASES_DIR };
