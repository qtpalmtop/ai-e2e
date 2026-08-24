import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { RedisService } from '../../infrastructure/redis/redis.service';
import type { RegisterDto } from './dto/register.dto';
import type { LoginDto } from './dto/login.dto';
import { Prisma, SpaceRole } from '@prisma/client';

const COMMON_SPACE_NAME = 'common';
const COOKIE_DEFAULT_TTL_SEC = 7 * 24 * 60 * 60;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly redis: RedisService,
  ) {}

  async register(dto: RegisterDto) {
    const existing = await this.prisma.user.findUnique({
      where: { username: dto.username },
    });
    if (existing) throw new ConflictException('username already taken');

    const passwordHash = await bcrypt.hash(dto.password, 10);

    // 注册事务：建用户 + 加入 common 默认空间（owner）
    const user = await this.prisma.$transaction(async (tx) => {
      const u = await tx.user.create({
        data: {
          username: dto.username,
          password: passwordHash,
          nickname: dto.nickname ?? dto.username,
        },
      });
      const common = await this.ensureCommonSpace(tx);
      await tx.spaceMember.create({
        data: { spaceId: common.id, userId: u.id, role: SpaceRole.OWNER },
      });
      return u;
    });

    return this.signAndSetCookie({ id: user.id, username: user.username });
  }

  async login(dto: LoginDto) {
    // 简易限流：同 ip + username，30s 内最多 10 次
    const limited = await this.redis.hitRateLimit(
      `login:${dto.username}`,
      10,
      30_000,
    );
    if (limited) {
      throw new UnauthorizedException('too many attempts, slow down');
    }

    const user = await this.prisma.user.findUnique({
      where: { username: dto.username },
    });
    if (!user || user.status !== 1) {
      throw new UnauthorizedException('invalid credentials');
    }
    const ok = await bcrypt.compare(dto.password, user.password);
    if (!ok) throw new UnauthorizedException('invalid credentials');

    return this.signAndSetCookie({ id: user.id, username: user.username });
  }

  async me(userId: string) {
    const u = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        username: true,
        nickname: true,
        createdAt: true,
        memberships: {
          include: { space: { select: { id: true, name: true, isDefault: true } } },
        },
      },
    });
    if (!u) throw new BadRequestException('user not found');
    return {
      id: u.id,
      username: u.username,
      nickname: u.nickname,
      createdAt: u.createdAt.getTime(),
      spaces: u.memberships.map((m) => ({
        id: m.space.id,
        name: m.space.name,
        isDefault: m.space.isDefault,
        role: m.role,
      })),
    };
  }

  async logout(res: any) {
    res.clearCookie(this.cookieName(), { path: '/' });
    return { ok: true };
  }

  /**
   * 签发一个短期（5 分钟）JWT 给前端用于 WebSocket 鉴权
   * 用途：httpOnly cookie 在跨域 WS 握手中不会被浏览器带上，
   *       所以单独开一个端点让前端拿到短期 token 拼到 ws url 的 query 上
   */
  async issueWsToken(user: { id: string; username: string }) {
    const token = await this.jwt.signAsync(
      { sub: user.id, username: user.username, scope: 'ws' },
      { expiresIn: '5m' },
    );
    return { token, expiresIn: 300 };
  }

  // ---------- helpers ----------

  private cookieName() {
    return this.config.get<string>('COOKIE_NAME') ?? 'e2e_token';
  }

  private async signAndSetCookie(user: { id: string; username: string }) {
    const token = await this.jwt.signAsync({
      sub: user.id,
      username: user.username,
    });
    return {
      token,
      cookie: {
        name: this.cookieName(),
        value: token,
        options: {
          httpOnly: true,
          // 开发期 secure=false（HTTP）；生产请设 true
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax' as const,
          path: '/',
          maxAge: COOKIE_DEFAULT_TTL_SEC * 1000,
        },
      },
      user,
    };
  }

  /**
   * 确保存在一个 isDefault=true 的 "common" 空间，所有新用户注册时自动绑定为 OWNER
   */
  private async ensureCommonSpace(
    tx: Prisma.TransactionClient,
  ): Promise<{ id: string }> {
    const existed = await tx.space.findFirst({ where: { isDefault: true } });
    if (existed) return existed;
    return tx.space.create({
      data: { name: COMMON_SPACE_NAME, isDefault: true, description: '默认公共空间' },
    });
  }
}
