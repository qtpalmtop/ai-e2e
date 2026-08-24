import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { SpaceRole } from '@prisma/client';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { RedisService } from '../../infrastructure/redis/redis.service';
import { translate } from './translator/translate';
import { runCase } from './runner/runCase';
import { liveRun, type LiveEvent } from './runner/liveRun';
import type { CreateCaseDto } from './dto/create-case.dto';
import type { UpdateCaseDto } from './dto/update-case.dto';
import { nanoid } from 'nanoid';

/** 锁 TTL：超过这个时间没有 heartbeat 就视为过期，允许抢占 */
const LOCK_TTL_MS = 60_000;

@Injectable()
export class CasesService {
  private readonly logger = new Logger(CasesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  // 列出某空间下的用例
  async list(actorId: string, spaceId: string) {
    const role = await this.assertMember(actorId, spaceId);
    if (role === SpaceRole.VIEWER) {
      // viewer 只读，但 list 允许
    }
    const cases = await this.prisma.case.findMany({
      where: { spaceId },
      orderBy: { updatedAt: 'desc' },
    });
    return cases.map(toSummary);
  }

  // 详情
  async getOne(actorId: string, id: string) {
    const c = await this.prisma.case.findUnique({ where: { id } });
    if (!c) throw new NotFoundException('case not found');
    await this.assertMember(actorId, c.spaceId);
    return toFull(c);
  }

  // 创建
  async create(actorId: string, dto: CreateCaseDto) {
    const role = await this.assertMember(actorId, dto.spaceId);
    if (role === SpaceRole.VIEWER) {
      throw new ForbiddenException('viewer cannot create cases');
    }
    const now = new Date();
    const id = nanoid(10);
    const initialSchema = dto.schema ?? defaultSchema(id, dto.name);
    const c = await this.prisma.case.create({
      data: {
        id,
        spaceId: dto.spaceId,
        creatorId: actorId,
        name: dto.name,
        schema: initialSchema as any,
      },
    });
    return toFull(c);
  }

  // 更新
  async update(actorId: string, id: string, dto: UpdateCaseDto) {
    const c = await this.prisma.case.findUnique({ where: { id } });
    if (!c) throw new NotFoundException('case not found');
    const role = await this.assertMember(actorId, c.spaceId);
    if (role === SpaceRole.VIEWER) {
      throw new ForbiddenException('viewer cannot edit cases');
    }
    // 编辑锁校验：只有当前锁持有者（或锁已过期）才能保存
    await this.assertLockHolder(actorId, c);
    const next = await this.prisma.case.update({
      where: { id },
      data: {
        name: dto.name ?? c.name,
        schema: (dto.schema ?? c.schema) as any,
        // 保存即续期：避免"保存时锁因 heartbeat 偶发失败而变得过老，
        // 被人抢走"这种时序问题。assertLockHolder 已经判断过合法性（自己持锁或锁已过期），
        // 这里更新 lockedAt 不会让任何"非自己"的锁被悄悄续期。
        lockedAt: new Date(),
      },
    });
    // 失效缓存（画布摘要等）
    await this.redis.del(`case:${id}:summary`);
    return toFull(next);
  }

  /**
   * 校验 actor 是否是当前用例的合法锁持有者（或锁已过期可抢占）
   * 供 update / 等写操作前置调用
   */
  private async assertLockHolder(actorId: string, c: any) {
    const lockedBy = c.lockedByUserId as string | null;
    const lockedAt = c.lockedAt ? c.lockedAt.getTime() : 0;
    const expired = lockedBy && Date.now() - lockedAt > LOCK_TTL_MS;
    if (lockedBy && lockedBy !== actorId && !expired) {
      const holder = await this.prisma.user.findUnique({
        where: { id: lockedBy },
        select: { id: true, username: true, nickname: true },
      });
      throw new ConflictException({
        message: 'case is locked by another user',
        lockedBy: holder,
      });
    }
  }

  // 删除
  async remove(actorId: string, id: string) {
    const c = await this.prisma.case.findUnique({ where: { id } });
    if (!c) throw new NotFoundException('case not found');
    const role = await this.assertMember(actorId, c.spaceId);
    if (role === SpaceRole.VIEWER) {
      throw new ForbiddenException('viewer cannot delete cases');
    }
    await this.prisma.case.delete({ where: { id } });
    return { ok: true };
  }

  // 翻译
  async doTranslate(actorId: string, id: string) {
    const c = await this.requireCaseForRead(actorId, id);
    const file = await translate({
      id: c.id,
      name: c.name,
      nodes: (c.schema as any).nodes ?? [],
      edges: (c.schema as any).edges ?? [],
    });
    return { ok: true, file };
  }

  // 同步运行
  async doRun(actorId: string, id: string) {
    const c = await this.requireCaseForRead(actorId, id);
    try {
      return await runCase({
        id: c.id,
        name: c.name,
        nodes: (c.schema as any).nodes ?? [],
        edges: (c.schema as any).edges ?? [],
      });
    } catch (e: any) {
      return { ok: false, logs: e?.message ?? String(e), duration: 0, file: '' };
    }
  }

  // 启动 live 异步运行（事件通过 onEvent 回调）
  startLive(
    actorId: string,
    id: string,
    onEvent: (e: LiveEvent) => void,
  ): Promise<{ ok: boolean; duration: number }> {
    return this.prisma.case
      .findUnique({ where: { id } })
      .then(async (c) => {
        if (!c) {
          onEvent({ type: 'error', message: 'case not found' });
          return { ok: false, duration: 0 };
        }
        await this.assertMember(actorId, c.spaceId);
        return liveRun(
          {
            id: c.id,
            name: c.name,
            nodes: (c.schema as any).nodes ?? [],
            edges: (c.schema as any).edges ?? [],
          },
          onEvent,
        );
      });
  }

  // ---------- 编辑锁 ----------
  /**
   * 获取锁（原子操作，避免并发 race）：
   *  - 锁为空：直接获取
   *  - 锁是自己：续期
   *  - 锁是别人但已过期：抢占
   *  - 锁是别人未过期：抛 409，body 带 { lockedBy: {id,username,nickname} }
   *
   * 关键：用 updateMany + WHERE 条件实现原子抢占。
   * 多并发请求同时执行时，只有一个能命中 WHERE，其他都返回 count=0。
   */
  async acquireLock(actorId: string, caseId: string) {
    await this.requireCaseForRead(actorId, caseId);
    const now = new Date();
    const nowMs = now.getTime();
    const expiry = new Date(nowMs - LOCK_TTL_MS);

    // 原子抢占：WHERE 命中条件 = (锁空) OR (锁是自己) OR (锁过期且不是自己)
    // updateMany 会确保只有 1 个并发请求能成功（其他 WHERE 不匹配，count=0）
    const result = await this.prisma.case.updateMany({
      where: {
        id: caseId,
        OR: [
          { lockedByUserId: null },
          { lockedByUserId: actorId },
          {
            // 锁过期且不是自己持有
            AND: [
              { NOT: { lockedByUserId: actorId } },
              { lockedAt: { lt: expiry } },
            ],
          },
        ],
      },
      data: { lockedByUserId: actorId, lockedAt: now },
    });

    if (result.count === 0) {
      // 抢占失败：被别人持有且未过期
      const fresh = await this.prisma.case.findUnique({ where: { id: caseId } });
      const lockedBy = fresh?.lockedByUserId ?? null;
      const holder = lockedBy
        ? await this.prisma.user.findUnique({
            where: { id: lockedBy },
            select: { id: true, username: true, nickname: true },
          })
        : null;
      this.logger.warn(
        `lock denied: case=${caseId} by=${actorId}, held by=${lockedBy}`,
      );
      throw new ConflictException({
        message: 'case is locked by another user',
        lockedBy: holder,
      });
    }

    const next = await this.prisma.case.findUnique({ where: { id: caseId } });
    this.logger.log(`lock acquired: case=${caseId} by=${actorId}`);
    return toLockInfo(next!, actorId);
  }

  /**
   * 释放锁：默认**条件释放**（只清空 5秒前没续期过的锁），
   * 避免 unmount 期间被新页面续期后又误释放，导致其他用户乘虚而入。
   *
   * 关键场景：
   *  - 路由切换/快速刷新：旧 tryAcquire 完成后不能立即 releaseLock，
   *    否则新 page 在 mount+tryAcquire 之间存在锁被清空的窗口，Admin 会抢到锁。
   *  - 关标签页：beforeunload + sendBeacon 走 force=true 立即释放。
   *  - 真正离开超过 5s：lockedAt < cutoff，条件释放生效。
   */
  async releaseLock(actorId: string, caseId: string, opts?: { force?: boolean }) {
    await this.requireCaseForRead(actorId, caseId);
    const force = opts?.force === true;

    if (force) {
      // 强制释放：仅清空锁是自己的（用于 beforeunload + sendBeacon 关标签页）
      const result = await this.prisma.case.updateMany({
        where: { id: caseId, lockedByUserId: actorId },
        data: { lockedByUserId: null, lockedAt: null },
      });
      if (result.count > 0) {
        this.logger.log(`lock force-released: case=${caseId} by=${actorId}`);
      }
      return { ok: true, released: result.count > 0 };
    }

    // 条件释放：只清空锁是自己的、且 lockedAt < 5秒前
    // 这样新 page 在 5s 内 mount 续期后，lockedAt 是新时间，cutoff 比较旧，
    // lockedAt > cutoff → count=0，不释放；锁保留给续期者。
    const cutoff = new Date(Date.now() - 5_000);
    const result = await this.prisma.case.updateMany({
      where: {
        id: caseId,
        lockedByUserId: actorId,
        lockedAt: { lt: cutoff },
      },
      data: { lockedByUserId: null, lockedAt: null },
    });

    if (result.count === 0) {
      this.logger.debug(
        `releaseLock no-op: case=${caseId} by=${actorId} (recently renewed or not holder)`,
      );
    } else {
      this.logger.log(`lock released: case=${caseId} by=${actorId}`);
    }
    return { ok: true, released: result.count > 0 };
  }

  /** 心跳续期：只有持有者能续期 */
  async heartbeat(actorId: string, caseId: string) {
    const c = await this.requireCaseForRead(actorId, caseId);
    if (c.lockedByUserId !== actorId) {
      throw new ForbiddenException('not the lock holder');
    }
    await this.prisma.case.update({
      where: { id: caseId },
      data: { lockedAt: new Date() },
    });
    return { ok: true, ttlMs: LOCK_TTL_MS };
  }

  /** 查锁状态 */
  async getLockInfo(actorId: string, caseId: string) {
    const c = await this.prisma.case.findUnique({ where: { id: caseId } });
    if (!c) throw new NotFoundException('case not found');
    await this.assertMember(actorId, c.spaceId);
    const lockedBy = c.lockedByUserId
      ? await this.prisma.user.findUnique({
          where: { id: c.lockedByUserId },
          select: { id: true, username: true, nickname: true },
        })
      : null;
    const ageMs = c.lockedAt ? Date.now() - c.lockedAt.getTime() : 0;
    const mine = c.lockedByUserId === actorId;
    return {
      lockedBy,
      lockedAt: c.lockedAt?.getTime() ?? null,
      ageMs,
      expired: ageMs > LOCK_TTL_MS,
      mine,
      ttlMs: LOCK_TTL_MS,
    };
  }

  // ---------- helpers ----------

  private async assertMember(userId: string, spaceId: string) {
    const m = await this.prisma.spaceMember.findUnique({
      where: { spaceId_userId: { spaceId, userId } },
    });
    if (!m) throw new ForbiddenException('not a space member');
    return m.role;
  }

  private async requireCaseForRead(actorId: string, id: string) {
    const c = await this.prisma.case.findUnique({ where: { id } });
    if (!c) throw new NotFoundException('case not found');
    await this.assertMember(actorId, c.spaceId);
    return c;
  }
}

function defaultSchema(id: string, name: string) {
  return {
    id,
    name,
    nodes: [
      { id: nanoid(8), type: 'start', position: { x: 100, y: 200 }, data: { label: '开始' } },
      { id: nanoid(8), type: 'end', position: { x: 700, y: 200 }, data: { label: '结束' } },
    ],
    edges: [],
  };
}

function toSummary(c: any) {
  return {
    id: c.id,
    name: c.name,
    spaceId: c.spaceId,
    updatedAt: c.updatedAt.getTime(),
    createdAt: c.createdAt.getTime(),
  };
}
function toFull(c: any) {
  return {
    ...toSummary(c),
    schema: c.schema,
    lockedBy: c.lockedByUserId
      ? { userId: c.lockedByUserId, lockedAt: c.lockedAt?.getTime() ?? null }
      : null,
  };
}

function toLockInfo(c: any, actorId: string) {
  return {
    lockedBy: c.lockedByUserId
      ? { userId: c.lockedByUserId, lockedAt: c.lockedAt?.getTime() ?? null }
      : null,
    mine: c.lockedByUserId === actorId,
    ttlMs: LOCK_TTL_MS,
  };
}
