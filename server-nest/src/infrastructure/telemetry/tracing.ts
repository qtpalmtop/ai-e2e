// 必须在所有其他模块之前加载：用 -r ./dist/infrastructure/telemetry/tracing 启动时
// import './infrastructure/telemetry/tracing' 也可（在 main.ts 首行）
//
// 设计要点：
//  1. 仅在 OTEL_EXPORTER_OTLP_ENDPOINT 非空时才注册 OTLP exporter
//  2. 本地开发默认 console exporter，零依赖即可看 span
//  3. 关键 instrumentation：fastify / ioredis / mysql2 — 覆盖核心 IO 路径

import { NodeSDK } from '@opentelemetry/sdk-node';
import { Resource } from '@opentelemetry/resources';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';
import { ConsoleSpanExporter, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { FastifyInstrumentation } from '@opentelemetry/instrumentation-fastify';
import { IORedisInstrumentation } from '@opentelemetry/instrumentation-ioredis';
import { MySQL2Instrumentation } from '@opentelemetry/instrumentation-mysql2';

const serviceName = process.env.OTEL_SERVICE_NAME ?? 'e2e-orchestrator-nest';
const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT?.trim();

const resource = new Resource({
  [SemanticResourceAttributes.SERVICE_NAME]: serviceName,
  [SemanticResourceAttributes.DEPLOYMENT_ENVIRONMENT]:
    process.env.NODE_ENV ?? 'development',
});

const traceExporter = endpoint
  ? new OTLPTraceExporter({ url: `${endpoint.replace(/\/$/, '')}/v1/traces` })
  : new ConsoleSpanExporter();

const sdk = new NodeSDK({
  resource,
  traceExporter,
  // 关闭 SDK 自带的批处理 span processor；自己挂 SimpleSpanProcessor 用于 console exporter
  spanProcessors: endpoint
    ? undefined
    : [new SimpleSpanProcessor(new ConsoleSpanExporter()) as any],
  instrumentations: [
    // 自动 instrumentations 默认包含 http/net/fs 等；这里显式列出来便于按需裁剪
    getNodeAutoInstrumentations({
      '@opentelemetry/instrumentation-fs': { enabled: false }, // fs 太吵，关掉
    }),
    new FastifyInstrumentation(),
    new IORedisInstrumentation(),
    new MySQL2Instrumentation(),
  ],
});

try {
  sdk.start();
  // eslint-disable-next-line no-console
  console.log(`[otel] tracing started (service=${serviceName}, exporter=${endpoint ? 'otlp' : 'console'})`);
} catch (e) {
  // eslint-disable-next-line no-console
  console.error('[otel] init failed', e);
}

process.on('SIGTERM', () => {
  sdk
    .shutdown()
    .catch((e) => console.error('[otel] shutdown error', e))
    .finally(() => process.exit(0));
});
