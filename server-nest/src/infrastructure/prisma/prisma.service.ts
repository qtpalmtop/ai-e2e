// Prisma Service：单例 + 优雅关闭
// 用 PrismaClient 直接代理，避免维护一份 mirror
//
// 启动期不强制连接（生产请保持 $connect 失败时 throw）
// 开发期可能 DB 还没起好（docker compose up 之前 nest start 已经跑起来了），
// 这种情况下只 warn，业务真正打到 DB 时再报错更友好
import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit() {
    try {
      await this.$connect();
      this.logger.log('Prisma connected');
    } catch (e: any) {
      this.logger.warn(
        `Prisma connect failed at startup: ${e?.message ?? e}. ` +
          'Will retry on first query. Make sure MySQL/Redis are up.',
      );
    }
  }

  async onModuleDestroy() {
    try {
      await this.$disconnect();
    } catch {
      /* ignore */
    }
  }
}
