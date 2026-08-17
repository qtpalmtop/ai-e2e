// 表单 schema 存储
// 单文件：server/data/form-schemas.json
// 结构：{ openPage: { atoms: [...] }, inputText: {...}, ... }

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../../data');
const FILE = path.join(ROOT, 'form-schemas.json');

// 默认表单 schema — 与原 nodeSchemas.ts 行为一致
const DEFAULT_SCHEMAS = {
  start: { atoms: [] },
  end: { atoms: [] },
  openPage: {
    atoms: [
      {
        id: 'a-url',
        type: 'url',
        name: 'url',
        label: '目标 URL',
        required: true,
        placeholder: 'https://example.com/login',
        rules: [],
      },
      {
        id: 'a-waitFor',
        type: 'boolean',
        name: 'waitForSelector',
        label: '等待关键元素',
        required: false,
        defaultValue: true,
        rules: [],
      },
      {
        id: 'a-selector',
        type: 'selector',
        name: 'readySelector',
        label: '关键元素选择器',
        required: false,
        placeholder: '#app, .main',
        help: '勾选"等待关键元素"时使用',
        rules: [
          {
            type: 'visible',
            when: { field: 'waitForSelector', op: 'truthy' },
          },
        ],
      },
    ],
  },
  inputText: {
    atoms: [
      { id: 'a-sel', type: 'selector', name: 'selector', label: '元素选择器', required: true, placeholder: '#input', rules: [] },
      { id: 'a-text', type: 'textarea', name: 'text', label: '输入内容', required: true, placeholder: '可使用 {{var}} 占位', rules: [] },
      { id: 'a-delay', type: 'delay', name: 'delay', label: '执行前等待 (ms)', required: false, defaultValue: 0, rules: [] },
    ],
  },
  clickElement: {
    atoms: [
      { id: 'a-sel', type: 'selector', name: 'selector', label: '元素选择器', required: true, placeholder: '#submit', rules: [] },
      { id: 'a-wait', type: 'delay', name: 'waitAfter', label: '点击后等待 (ms)', required: false, defaultValue: 0, rules: [] },
      { id: 'a-pre', type: 'delay', name: 'delay', label: '点击前等待 (ms)', required: false, defaultValue: 0, rules: [] },
    ],
  },
  hoverElement: {
    atoms: [
      { id: 'a-sel', type: 'selector', name: 'selector', label: '元素选择器', required: true, placeholder: '.item', rules: [] },
      { id: 'a-delay', type: 'delay', name: 'delay', label: '执行前等待 (ms)', required: false, defaultValue: 0, rules: [] },
    ],
  },
  wait: {
    atoms: [
      { id: 'a-d', type: 'delay', name: 'duration', label: '等待时长 (ms)', required: true, defaultValue: 1000, rules: [] },
    ],
  },
  condition: {
    atoms: [
      { id: 'a-exp', type: 'code', name: 'expression', label: '条件表达式', required: true, placeholder: 'page.url() === "..."', help: 'true 走 True 分支，否则 False', rules: [] },
    ],
  },
  loop: {
    atoms: [
      {
        id: 'a-mode',
        type: 'select',
        name: 'mode',
        label: '循环模式',
        required: true,
        defaultValue: 'count',
        options: [
          { label: '按次数', value: 'count' },
          { label: '按条件 (while)', value: 'while' },
        ],
        rules: [],
      },
      {
        id: 'a-count',
        type: 'number',
        name: 'count',
        label: '循环次数',
        required: false,
        defaultValue: 1,
        min: 1,
        max: 10000,
        rules: [
          { type: 'visible', when: { field: 'mode', op: 'eq', value: 'count' } },
          { type: 'required', when: { field: 'mode', op: 'eq', value: 'count' }, message: '次数模式下循环次数 ≥ 1' },
        ],
      },
      {
        id: 'a-while',
        type: 'code',
        name: 'whileExpression',
        label: 'while 条件',
        required: false,
        placeholder: '当条件为 true 时继续循环',
        rules: [
          { type: 'visible', when: { field: 'mode', op: 'eq', value: 'while' } },
          { type: 'required', when: { field: 'mode', op: 'eq', value: 'while' }, message: 'while 模式下条件必填' },
        ],
      },
    ],
  },
};

await fs.mkdir(ROOT, { recursive: true });

export async function readAll() {
  try {
    const raw = await fs.readFile(FILE, 'utf8');
    return JSON.parse(raw);
  } catch (e) {
    if (e.code !== 'ENOENT') throw e;
    // 首次访问，落盘默认
    await fs.writeFile(FILE, JSON.stringify(DEFAULT_SCHEMAS, null, 2), 'utf8');
    return DEFAULT_SCHEMAS;
  }
}

export async function getOne(type) {
  const all = await readAll();
  return all[type] ?? { atoms: [] };
}

export async function setOne(type, schema) {
  const all = await readAll();
  all[type] = schema;
  await fs.writeFile(FILE, JSON.stringify(all, null, 2), 'utf8');
  return schema;
}

export async function resetAll() {
  await fs.writeFile(FILE, JSON.stringify(DEFAULT_SCHEMAS, null, 2), 'utf8');
  return DEFAULT_SCHEMAS;
}
