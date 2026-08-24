import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiCookieAuth, ApiQuery } from '@nestjs/swagger';
import { CasesService } from './cases.service';
import { CreateCaseDto } from './dto/create-case.dto';
import { UpdateCaseDto } from './dto/update-case.dto';
import { CurrentUser, type AuthUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { SpaceRole } from '@prisma/client';
import { CasesLiveService } from './cases.live';

@ApiTags('cases')
@ApiCookieAuth()
@Controller('cases')
export class CasesController {
  constructor(
    private readonly cases: CasesService,
    private readonly live: CasesLiveService,
  ) {}

  @Get()
  @ApiOperation({ summary: '列出某空间下的用例' })
  @ApiQuery({ name: 'spaceId', required: true })
  list(@CurrentUser() u: AuthUser, @Query('spaceId') spaceId: string) {
    return this.cases.list(u.id, spaceId);
  }

  @Post()
  @ApiOperation({ summary: '创建用例' })
  create(@CurrentUser() u: AuthUser, @Body() dto: CreateCaseDto) {
    return this.cases.create(u.id, dto);
  }

  @Get(':id')
  @ApiOperation({ summary: '用例详情' })
  detail(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.cases.getOne(u.id, id);
  }

  @Put(':id')
  @ApiOperation({ summary: '更新用例（保存画布）' })
  update(
    @CurrentUser() u: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateCaseDto,
  ) {
    return this.cases.update(u.id, id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: '删除用例' })
  remove(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.cases.remove(u.id, id);
  }

  @Post(':id/translate')
  @ApiOperation({ summary: '翻译（生成 puppeteer 文件）' })
  translate(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.cases.doTranslate(u.id, id);
  }

  @Post(':id/run')
  @ApiOperation({ summary: '同步运行用例' })
  run(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.cases.doRun(u.id, id);
  }

  // 启动 live 异步运行；事件通过 WS 推送（前端需先连 WS：/ws/cases?caseId=xxx）
  @Post(':id/live-run')
  @ApiOperation({ summary: '异步启动 live 预览运行' })
  liveRun(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    this.live.start(u.id, id);
    return { ok: true, message: 'live run started' };
  }

  // ---------- 编辑锁 ----------
  // 设计：进入画布时 acquire；离开 / 关闭时 release；每 25s heartbeat
  // TTL=60s 无心跳自动过期；冲突时返回 409 + 当前持有者信息

  @Post(':id/acquire-lock')
  @ApiOperation({
    summary: '获取/续期用例编辑锁',
    description: '成功：200；被别人持有且未过期：409，body 含 lockedBy',
  })
  acquireLock(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.cases.acquireLock(u.id, id);
  }

  @Post(':id/release-lock')
  @ApiOperation({ summary: '释放用例编辑锁' })
  releaseLock(
    @CurrentUser() u: AuthUser,
    @Param('id') id: string,
    @Body() body?: { force?: boolean },
  ) {
    return this.cases.releaseLock(u.id, id, { force: body?.force });
  }

  @Post(':id/heartbeat')
  @ApiOperation({ summary: '编辑锁心跳续期（仅持有者可调用）' })
  heartbeat(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.cases.heartbeat(u.id, id);
  }

  @Get(':id/lock')
  @ApiOperation({ summary: '查询用例编辑锁状态' })
  getLock(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.cases.getLockInfo(u.id, id);
  }
}
