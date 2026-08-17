// 用例相关 HTTP 接口
import Router from '@koa/router';
import { nanoid } from 'nanoid';
import {
  listCases,
  getCase,
  writeCase,
  deleteCase,
} from '../storage/fileStore.js';
import { translate } from '../translator/index.js';
import { runLiveAndBroadcast } from './live.js';

export const casesRouter = new Router({ prefix: '/api/cases' });

casesRouter.get('/', async (ctx) => {
  ctx.body = await listCases();
});

casesRouter.get('/:id', async (ctx) => {
  const c = await getCase(ctx.params.id);
  if (!c) {
    ctx.status = 404;
    ctx.body = { error: 'case not found' };
    return;
  }
  ctx.body = c;
});

casesRouter.post('/', async (ctx) => {
  const { name, description } = ctx.request.body || {};
  if (!name) {
    ctx.status = 400;
    ctx.body = { error: 'name is required' };
    return;
  }
  const now = Date.now();
  const id = nanoid(10);
  const c = {
    id,
    name,
    description: description || '',
    nodes: [
      { id: nanoid(8), type: 'start', position: { x: 100, y: 200 }, data: { label: '开始' } },
      { id: nanoid(8), type: 'end', position: { x: 700, y: 200 }, data: { label: '结束' } },
    ],
    edges: [],
    createdAt: now,
    updatedAt: now,
  };
  await writeCase(c);
  ctx.body = c;
});

casesRouter.put('/:id', async (ctx) => {
  const existing = await getCase(ctx.params.id);
  if (!existing) {
    ctx.status = 404;
    ctx.body = { error: 'case not found' };
    return;
  }
  const next = {
    ...existing,
    ...ctx.request.body,
    id: existing.id,
    createdAt: existing.createdAt,
    updatedAt: Date.now(),
  };
  await writeCase(next);
  ctx.body = next;
});

casesRouter.delete('/:id', async (ctx) => {
  await deleteCase(ctx.params.id);
  ctx.body = { ok: true };
});

// 翻译：将 schema 转为 puppeteer 文件
casesRouter.post('/:id/translate', async (ctx) => {
  const c = await getCase(ctx.params.id);
  if (!c) {
    ctx.status = 404;
    ctx.body = { error: 'case not found' };
    return;
  }
  const file = await translate(c);
  ctx.body = { ok: true, file };
});

// 启动 live 运行：后端会翻译 → 子进程跑 → 事件通过 WS 推到对应 caseId 的订阅者
// 调用方式：先建立 WS（/api/cases/:id/live），再 POST 此端点
casesRouter.post('/:id/live-run', async (ctx) => {
  const c = await getCase(ctx.params.id);
  if (!c) {
    ctx.status = 404;
    ctx.body = { error: 'case not found' };
    return;
  }
  // 异步执行，立刻返回 202
  runLiveAndBroadcast(ctx.params.id).catch((e) =>
    console.error('[live-run] error:', e),
  );
  ctx.status = 202;
  ctx.body = { ok: true, message: 'live run started' };
});
