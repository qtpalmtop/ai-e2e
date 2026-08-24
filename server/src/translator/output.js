// 输出阶段：把解析阶段产出的 body 字符串塞进骨架，并写入磁盘
// 单一职责：拼接 + 持久化，不做任何业务逻辑

import fs from 'node:fs/promises';
import path from 'node:path';
import { prepare } from './prepare.js';
import { parse } from './parse.js';
import { outputFilePath } from '../storage/fileStore.js';

export async function translate(schema, opts = {}) {
  // 1. 准备骨架
  const skeleton = prepare(schema.name, opts);

  // 2. 解析生成 body
  const body = parse(schema, opts);

  // 3. 替换占位并写入
  const finalCode = skeleton.replace('__BODY__', body);
  const file = outputFilePath(schema.id, opts);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, finalCode, 'utf8');

  return file;
}
