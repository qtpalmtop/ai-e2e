import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

// Global：让所有模块都能直接 inject PrismaService，不用每个 module 重复 import
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
