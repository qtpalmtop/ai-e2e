// 运行器路由：暴露 POST /api/cases/:id/run
import Router from '@koa/router';
import { runCase } from '../runner/index.js';

export const runnerRouter = new Router({ prefix: '/api/cases' });

runnerRouter.post('/:id/run', async (ctx) => {
  try {
    const r = await runCase(ctx.params.id);
    ctx.body = r;
  } catch (e) {
    ctx.status = 500;
    ctx.body = { ok: false, logs: (e && e.message) || String(e), duration: 0 };
  }
});
