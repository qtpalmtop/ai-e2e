// 表单设计器 HTTP 接口
import Router from '@koa/router';
import { readAll, getOne, setOne, resetAll } from '../storage/formSchemaStore.js';

export const formSchemasRouter = new Router({ prefix: '/api/form-schemas' });

formSchemasRouter.get('/', async (ctx) => {
  ctx.body = await readAll();
});

formSchemasRouter.get('/:type', async (ctx) => {
  const schema = await getOne(ctx.params.type);
  ctx.body = schema;
});

formSchemasRouter.put('/:type', async (ctx) => {
  const { type } = ctx.params;
  const body = ctx.request.body;
  if (!body || !Array.isArray(body.atoms)) {
    ctx.status = 400;
    ctx.body = { error: 'invalid schema: atoms must be an array' };
    return;
  }
  // 基础形状校验
  for (const a of body.atoms) {
    if (!a.id || !a.type || !a.name || !a.label) {
      ctx.status = 400;
      ctx.body = { error: `atom 缺少必要字段 (id/type/name/label): ${JSON.stringify(a)}` };
      return;
    }
  }
  ctx.body = await setOne(type, body);
});

formSchemasRouter.post('/reset', async (ctx) => {
  ctx.body = await resetAll();
});
