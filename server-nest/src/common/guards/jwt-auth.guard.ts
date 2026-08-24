// JWT 鉴权：解析 cookie 中的 token，挂到 req.user
// 由 auth.module.ts 通过 APP_GUARD 全局注册，自动作用于所有 controller
// 公开接口用 @Public() 跳过
import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { FastifyRequest } from 'fastify';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import type { AuthUser } from '../decorators/current-user.decorator';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (isPublic) return true;

    const req = ctx.switchToHttp().getRequest<FastifyRequest & { user?: AuthUser }>();
    const cookieName = process.env.COOKIE_NAME ?? 'e2e_token';
    const token =
      (req.cookies?.[cookieName] as string | undefined) ??
      (extractBearer(req.headers?.authorization as string | undefined));

    if (!token) throw new UnauthorizedException('missing token');

    try {
      const payload = await this.jwt.verifyAsync<{ sub: string; username: string }>(token);
      req.user = { id: payload.sub, username: payload.username };
      return true;
    } catch {
      throw new UnauthorizedException('invalid token');
    }
  }
}

function extractBearer(h?: string): string | undefined {
  if (!h) return undefined;
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m?.[1];
}
