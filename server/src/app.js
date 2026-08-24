import Koa from 'koa';
import bodyParser from 'koa-bodyparser';
import cors from '@koa/cors';
import http from 'node:http';
import { casesRouter } from './routes/cases.js';
import { runnerRouter } from './routes/runner.js';
import { formSchemasRouter } from './routes/formSchemas.js';
import { attachLiveWss } from './routes/live.js';

const app = new Koa();

app.use(cors());
app.use(bodyParser({ jsonLimit: '2mb' }));

// 简易日志
app.use(async (ctx, next) => {
  const t = Date.now();
  try {
    await next();
  } catch (e) {
    console.error('[error]', e);
    ctx.status = e.status || 500;
    ctx.body = { error: e.message };
  } finally {
    console.log(`${ctx.method} ${ctx.url} ${ctx.status} ${Date.now() - t}ms`);
  }
});

app.use(casesRouter.routes()).use(casesRouter.allowedMethods());
app.use(runnerRouter.routes()).use(runnerRouter.allowedMethods());
app.use(formSchemasRouter.routes()).use(formSchemasRouter.allowedMethods());

const port = Number(process.env.PORT || 4000);
const server = http.createServer(app.callback());
attachLiveWss(server);
server.listen(port, () => {
  console.log(`E2E orchestrator server listening on http://localhost:${port}`);
});
