import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { PrismaModule } from './infrastructure/prisma/prisma.module';
import { RedisModule } from './infrastructure/redis/redis.module';
import { AuthModule } from './modules/auth/auth.module';
import { SpacesModule } from './modules/spaces/spaces.module';
import { CasesModule } from './modules/cases/cases.module';
import { FormSchemasModule } from './modules/form-schemas/form-schemas.module';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';

@Module({
  imports: [
    // 全局配置（env 已在进程启动前由 .env 载入；这里再走 ConfigModule 以便 @nestjs/config DI）
    ConfigModule.forRoot({ isGlobal: true }),

    // 全局 JwtModule：让 JwtAuthGuard / CasesGateway 在任何 module 中都能 inject JwtService
    JwtModule.registerAsync({
      global: true,
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (cfg: ConfigService) => ({
        secret: cfg.get<string>('JWT_SECRET') ?? 'dev-only-secret',
        signOptions: { expiresIn: cfg.get<string>('JWT_EXPIRES_IN') ?? '7d' },
      }),
    }),

    PrismaModule,
    RedisModule,

    AuthModule,
    SpacesModule,
    CasesModule,
    FormSchemasModule,
  ],
  providers: [
    // 默认开启 JWT 鉴权，@Public() 标注的接口跳过
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    // 角色守卫：按 @Roles() 注解触发
    { provide: APP_GUARD, useClass: RolesGuard },
    // 全局异常过滤器
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
  ],
})
export class AppModule {}
