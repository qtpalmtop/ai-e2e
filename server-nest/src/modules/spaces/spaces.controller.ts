import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiCookieAuth } from '@nestjs/swagger';
import { SpacesService } from './spaces.service';
import { CreateSpaceDto } from './dto/create-space.dto';
import { AddMemberDto } from './dto/add-member.dto';
import { CurrentUser, type AuthUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { SpaceRole } from '@prisma/client';

@ApiTags('spaces')
@ApiCookieAuth()
@Controller('spaces')
export class SpacesController {
  constructor(private readonly spaces: SpacesService) {}

  @Get()
  @ApiOperation({ summary: '当前用户所在的所有空间' })
  list(@CurrentUser() u: AuthUser) {
    return this.spaces.listMySpaces(u.id);
  }

  @Post()
  @ApiOperation({ summary: '创建空间（创建人自动 OWNER）' })
  create(@CurrentUser() u: AuthUser, @Body() dto: CreateSpaceDto) {
    return this.spaces.create(u.id, dto);
  }

  @Get(':spaceId')
  @ApiOperation({ summary: '空间详情（含成员列表）' })
  detail(@CurrentUser() u: AuthUser, @Param('spaceId') spaceId: string) {
    return this.spaces.getSpace(u.id, spaceId);
  }

  @Post(':spaceId/members')
  @Roles(SpaceRole.OWNER)
  @ApiOperation({ summary: '添加/更新成员（仅 OWNER）' })
  addMember(
    @CurrentUser() u: AuthUser,
    @Param('spaceId') spaceId: string,
    @Body() dto: AddMemberDto,
  ) {
    return this.spaces.addMember(u.id, spaceId, dto);
  }

  @Delete(':spaceId/members/:userId')
  @Roles(SpaceRole.OWNER)
  @ApiOperation({ summary: '移除成员（仅 OWNER）' })
  removeMember(
    @CurrentUser() u: AuthUser,
    @Param('spaceId') spaceId: string,
    @Param('userId') userId: string,
  ) {
    return this.spaces.removeMember(u.id, spaceId, userId);
  }
}
