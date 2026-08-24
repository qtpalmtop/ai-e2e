// 在导入任何业务代码前初始化 OTel —— 必须放在第一行
import './infrastructure/telemetry/tracing';
// 显式加载 .env 到 process.env（ConfigModule 也会加载，但要在 ProcessEnv 派生子进程前可用）
import * as dotenv from 'dotenv';
import * as path from 'node:path';
dotenv.config({ path: path.resolve(__dirname, '../.env') });
// reflect-metadata 是 NestJS 装饰器元数据反射的基础
import 'reflect-metadata';

import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { WsAdapter } from '@nestjs/platform-ws';
import { ValidationPipe, Logger } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import fastifyCookie from '@fastify/cookie';
import { AppModule } from './app.module';

async function bootstrap() {
  const adapter = new FastifyAdapter({
    logger: false,
    bodyLimit: 4 * 1024 * 1024, // 画布 schema 可能较大
  });
  // Fastify 不像 Express 那样要手动加 cookie，这里用 @fastify/cookie 插件
  await adapter.register(fastifyCookie as any, {});

  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    adapter,
    { bufferLogs: true },
  );

  // 跨域：开发期允许携带凭证（cookie）→ 必填 credentials: true 且 origin 不能为 *
  const origins = (process.env.CORS_ORIGIN ?? 'http://localhost:5173')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  app.enableCors({
    origin: origins,
    credentials: true,
  });

  // 全局校验 + 自动类型转换
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: false,
    }),
  );

  // 全局 API 前缀（不影响 Swagger UI 的访问路径）
  app.setGlobalPrefix('api', {
    exclude: ['/health'],
  });

  // WebSocket：用 platform-ws 的 WsAdapter（不依赖 socket.io）
  app.useWebSocketAdapter(new WsAdapter(app));

  // Swagger
  const docConfig = new DocumentBuilder()
    .setTitle('E2E Orchestrator API')
    .setDescription('可视化用例编排后端：用户 / 空间 / 用例 / 表单设计')
    .setVersion('0.1.0')
    .addCookieAuth(process.env.COOKIE_NAME ?? 'e2e_token')
    .addTag('auth')
    .addTag('spaces')
    .addTag('cases')
    .addTag('form-schemas')
    .build();
  const document = SwaggerModule.createDocument(app, docConfig);
  SwaggerModule.setup('docs', app, document);

  // /health：K8s/PM2 探针（不挂 api 前缀）
  const fastify = app.getHttpAdapter().getInstance();
  fastify.get('/health', async () => ({ ok: true, ts: Date.now() }));

  const port = Number(process.env.PORT ?? 4000);
  await app.listen(port, '0.0.0.0');
  Logger.log(`E2E orchestrator listening on http://localhost:${port}`, 'Bootstrap');
  Logger.log(`Swagger docs:        http://localhost:${port}/docs`, 'Bootstrap');
}

bootstrap().catch((e) => {
  // eslint-disable-next-line no-console
  console.error('[bootstrap] fatal:', e);
  process.exit(1);
});
