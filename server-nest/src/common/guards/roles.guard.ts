// 角色 / 空间权限守卫
// 流程：
//  1. JwtAuthGuard 已经把 req.user 放好
//  2. 本 Guard 拿 URL 中的 :spaceId（params.spaceId 或 params.id 当作 caseId 时通过 service 自解析）
//  3. 查 SpaceMember，得到当前 user 在该空间的 role
//  4. 比对 @Roles(...) 注解；不匹配 → 403
//
// 复用：Spaces/Cases/FormSchemas 的写操作都加 @Roles(SpaceRole.OWNER, SpaceRole.EDITOR)
import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { FastifyRequest } from 'fastify';
import { SpaceRole } from '@prisma/client';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { ROLES_KEY } from '../decorators/roles.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<SpaceRole[] | undefined>(ROLES_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const req = ctx.switchToHttp().getRequest<FastifyRequest & { user?: { id: string }; spaceRole?: SpaceRole }>();
    if (!req.user) throw new ForbiddenException('no auth user');

    const spaceId = await resolveSpaceIdFromRequest(req, this.prisma);
    if (!spaceId) throw new NotFoundException('space not found');

    const member = await this.prisma.spaceMember.findUnique({
      where: { spaceId_userId: { spaceId, userId: req.user.id } },
    });
    if (!member) throw new ForbiddenException('not a space member');
    if (!required.includes(member.role)) {
      throw new ForbiddenException(
        `role ${member.role} not in [${required.join(',')}]`,
      );
    }
    // 挂到 req 便于 controller 取用
    req.spaceRole = member.role;
    return true;
  }
}

/**
 * 从 req 中解析出当前操作的 spaceId：
 *  - params.spaceId（/spaces/:spaceId/...）
 *  - body.spaceId
 *  - query.spaceId
 *  - params.id（视为 caseId/formSchemaId，service 内已有授权，这里兜底再去查）
 */
async function resolveSpaceIdFromRequest(
  req: any,
  prisma: PrismaService,
): Promise<string | null> {
  const direct =
    req.params?.spaceId ?? req.body?.spaceId ?? req.query?.spaceId;
  if (direct) return String(direct);

  // 兜底：/:id 当作 caseId/formSchemaId 反查 spaceId
  const id = req.params?.id;
  if (!id) return null;

  // 先按 case 查
  const c = await prisma.case.findUnique({ where: { id } });
  if (c) return c.spaceId;
  const fs = await prisma.formSchema.findUnique({ where: { id } });
  if (fs) return fs.spaceId;
  return null;
}
