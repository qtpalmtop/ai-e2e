import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { SpaceRole } from '@prisma/client';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import type { CreateSpaceDto } from './dto/create-space.dto';
import type { AddMemberDto } from './dto/add-member.dto';

@Injectable()
export class SpacesService {
  constructor(private readonly prisma: PrismaService) {}

  /** 当前用户能看到的空间（作为 member 的）+ 自己在每个空间的角色 */
  async listMySpaces(userId: string) {
    const memberships = await this.prisma.spaceMember.findMany({
      where: { userId },
      include: { space: true },
      orderBy: [{ space: { isDefault: 'desc' } }, { space: { createdAt: 'asc' } }],
    });
    return memberships.map((m) => ({
      id: m.space.id,
      name: m.space.name,
      isDefault: m.space.isDefault,
      description: m.space.description,
      role: m.role,
      createdAt: m.space.createdAt.getTime(),
    }));
  }

  /** 空间详情（含成员） */
  async getSpace(userId: string, spaceId: string) {
    await this.assertMember(userId, spaceId);
    const space = await this.prisma.space.findUnique({ where: { id: spaceId } });
    if (!space) throw new NotFoundException('space not found');
    const members = await this.prisma.spaceMember.findMany({
      where: { spaceId },
      include: { user: { select: { id: true, username: true, nickname: true } } },
      orderBy: { createdAt: 'asc' },
    });
    return {
      ...space,
      members: members.map((m) => ({
        userId: m.userId,
        username: m.user.username,
        nickname: m.user.nickname,
        role: m.role,
        joinedAt: m.createdAt.getTime(),
      })),
    };
  }

  /** 新建空间（创建人自动 OWNER） */
  async create(userId: string, dto: CreateSpaceDto) {
    const space = await this.prisma.$transaction(async (tx) => {
      const s = await tx.space.create({
        data: {
          name: dto.name,
          description: dto.description,
          isDefault: false,
        },
      });
      await tx.spaceMember.create({
        data: { spaceId: s.id, userId, role: SpaceRole.OWNER },
      });
      return s;
    });
    return space;
  }

  /** 空间内新增成员：仅 OWNER 可操作 */
  async addMember(actorId: string, spaceId: string, dto: AddMemberDto) {
    const role = await this.assertMember(actorId, spaceId);
    if (role !== SpaceRole.OWNER) {
      throw new ForbiddenException('only owner can add members');
    }
    const user = await this.prisma.user.findUnique({
      where: { username: dto.username },
    });
    if (!user) throw new BadRequestException('user not found');

    await this.prisma.spaceMember.upsert({
      where: { spaceId_userId: { spaceId, userId: user.id } },
      create: { spaceId, userId: user.id, role: dto.role },
      update: { role: dto.role },
    });
    return { ok: true };
  }

  /** 移除成员：仅 OWNER，且不能移除自己 */
  async removeMember(actorId: string, spaceId: string, targetUserId: string) {
    const role = await this.assertMember(actorId, spaceId);
    if (role !== SpaceRole.OWNER) {
      throw new ForbiddenException('only owner can remove members');
    }
    if (targetUserId === actorId) {
      throw new BadRequestException('cannot remove self');
    }
    await this.prisma.spaceMember
      .delete({
        where: { spaceId_userId: { spaceId, userId: targetUserId } },
      })
      .catch(() => null);
    return { ok: true };
  }

  /** 公共：确认 user 是 space 成员，返回 role */
  async assertMember(userId: string, spaceId: string): Promise<SpaceRole> {
    const m = await this.prisma.spaceMember.findUnique({
      where: { spaceId_userId: { spaceId, userId } },
    });
    if (!m) throw new ForbiddenException('not a space member');
    return m.role;
  }
}
