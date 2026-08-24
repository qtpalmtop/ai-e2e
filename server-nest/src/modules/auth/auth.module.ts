import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';

@Module({
  // JwtModule 在 AppModule 中已 global 注册，这里不用再 import
  // 全局 Guard / Filter 已统一在 AppModule.providers 注册
  controllers: [AuthController],
  providers: [AuthService],
  exports: [AuthService],
})
export class AuthModule {}
