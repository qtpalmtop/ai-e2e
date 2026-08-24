// 输出阶段：把 parse 阶段产出的 body 字符串塞进骨架，并写入磁盘
// 单一职责：拼接 + 持久化
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { prepare } from './prepare';
import { parse } from './parse';

export const OUTPUT_DIR = path.resolve(process.cwd(), 'cases-output');

export interface TranslateInput {
  id: string;
  name: string;
  nodes: any[];
  edges: any[];
}
export interface TranslateOpts {
  live?: boolean;
}

export async function translate(
  schema: TranslateInput,
  opts: TranslateOpts = {},
): Promise<string> {
  const skeleton = prepare(schema.name, opts);
  const body = parse({ nodes: schema.nodes, edges: schema.edges }, opts);
  const finalCode = skeleton.replace('__BODY__', body);
  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  const suffix = opts.live ? '.live.spec.cjs' : '.spec.cjs';
  const file = path.join(OUTPUT_DIR, `${schema.id}${suffix}`);
  await fs.writeFile(file, finalCode, 'utf8');
  return file;
}
