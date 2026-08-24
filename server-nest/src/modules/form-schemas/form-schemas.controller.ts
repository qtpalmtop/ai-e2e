import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiCookieAuth, ApiQuery } from '@nestjs/swagger';
import { FormSchemasService } from './form-schemas.service';
import { UpsertFormSchemaDto } from './dto/upsert-form-schema.dto';
import { CurrentUser, type AuthUser } from '../../common/decorators/current-user.decorator';

@ApiTags('form-schemas')
@ApiCookieAuth()
@Controller('form-schemas')
export class FormSchemasController {
  constructor(private readonly svc: FormSchemasService) {}

  @Get()
  @ApiOperation({ summary: '列出某空间下所有节点类型的表单 schema' })
  @ApiQuery({ name: 'spaceId', required: true })
  list(@CurrentUser() u: AuthUser, @Query('spaceId') spaceId: string) {
    return this.svc.listAll(u.id, spaceId);
  }

  @Get(':nodeType')
  @ApiOperation({ summary: '获取某节点类型表单 schema' })
  getOne(
    @CurrentUser() u: AuthUser,
    @Query('spaceId') spaceId: string,
    @Param('nodeType') nodeType: string,
  ) {
    return this.svc.getOne(u.id, spaceId, nodeType);
  }

  @Put(':nodeType')
  @ApiOperation({ summary: '保存（upsert）某节点类型表单 schema' })
  save(
    @CurrentUser() u: AuthUser,
    @Query('spaceId') spaceId: string,
    @Param('nodeType') nodeType: string,
    @Body() dto: UpsertFormSchemaDto,
  ) {
    return this.svc.upsert(u.id, spaceId, nodeType, dto.atoms);
  }

  @Post('reset')
  @ApiOperation({ summary: '重置空间内全部表单 schema 为默认' })
  @ApiQuery({ name: 'spaceId', required: true })
  reset(@CurrentUser() u: AuthUser, @Query('spaceId') spaceId: string) {
    return this.svc.resetAll(u.id, spaceId);
  }
}
