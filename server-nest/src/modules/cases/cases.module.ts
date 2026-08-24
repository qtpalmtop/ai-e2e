import { Module } from '@nestjs/common';
import { CasesService } from './cases.service';
import { CasesController } from './cases.controller';
import { CasesGateway } from './cases.gateway';
import { CasesLiveService } from './cases.live';

@Module({
  // JwtModule 已在 AppModule 全局注册
  controllers: [CasesController],
  providers: [CasesService, CasesController, CasesLiveService, CasesGateway],
  exports: [CasesService],
})
export class CasesModule {}
