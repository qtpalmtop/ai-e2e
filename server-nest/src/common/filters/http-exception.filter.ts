// 全局异常过滤器：把任意 error 翻译成 { code, message } 形态，方便前端统一处理
import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const req = ctx.getRequest<FastifyRequest>();
    const res = ctx.getResponse<FastifyReply>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string = 'Internal Server Error';
    let code = 'INTERNAL_ERROR';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const r = exception.getResponse() as any;
      message = typeof r === 'string' ? r : (r?.message ?? exception.message);
      code = typeof r === 'object' && r?.code ? r.code : `HTTP_${status}`;
    } else if (exception instanceof Error) {
      message = exception.message;
    }

    if (status >= 500) {
      this.logger.error(`${req.method} ${req.url} ${status} ${message}`, (exception as Error)?.stack);
    } else {
      this.logger.warn(`${req.method} ${req.url} ${status} ${message}`);
    }

    res.status(status).send({
      code,
      message,
      path: req.url,
      ts: Date.now(),
    });
  }
}
