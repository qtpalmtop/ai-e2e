// WebSocket 网关：/ws/cases?caseId=xxx&token=xxx
// 设计：
//  - path 固定 /ws/cases（不暴露在 /api 前缀下，绕过 setGlobalPrefix）
//  - 客户端用 query.caseId 标识订阅哪个 case
//  - 认证：支持从 query.token 传 JWT（cookie 在 WS 中带过去比较麻烦，备一条 query 通道）
//    cookie 仍优先：WsAdapter 走的是 ws 库，握手时 cookie 在 req.headers.cookie
import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import type { IncomingMessage } from 'node:http';
import { JwtService } from '@nestjs/jwt';
import { Logger } from '@nestjs/common';
import type { WebSocket, WebSocketServer as WSServer } from 'ws';
import { CasesLiveService } from './cases.live';

@WebSocketGateway({
  path: '/ws/cases',
  // 允许任意 origin（cookie 鉴权决定可见性）
  cors: { origin: true, credentials: true },
})
export class CasesGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server!: WSServer;
  private readonly logger = new Logger(CasesGateway.name);

  constructor(
    private readonly live: CasesLiveService,
    private readonly jwt: JwtService,
  ) {}

  async handleConnection(client: WebSocket, req: IncomingMessage) {
    try {
      const url = new URL(req.url ?? '/', 'http://localhost');
      const caseId = url.searchParams.get('caseId');
      if (!caseId) {
        client.close(1008, 'caseId required');
        return;
      }

      // 认证：cookie 优先，query.token 兜底
      const cookieName = process.env.COOKIE_NAME ?? 'e2e_token';
      const cookies = parseCookies(req.headers.cookie ?? '');
      const token =
        cookies[cookieName] ?? url.searchParams.get('token') ?? undefined;
      if (!token) {
        client.close(1008, 'unauthorized');
        return;
      }
      try {
        await this.jwt.verifyAsync(token);
      } catch {
        client.close(1008, 'unauthorized');
        return;
      }

      this.live.register(caseId, client);
    } catch (e: any) {
      this.logger.error(`ws connect error: ${e?.message}`);
      try {
        client.close(1011, 'internal error');
      } catch {
        /* ignore */
      }
    }
  }

  handleDisconnect(client: WebSocket) {
    // CasesLiveService.register 时已经把 cleanup 挂在 ws.on('close')，这里不再处理
  }
}

function parseCookies(header: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const [k, ...rest] = part.trim().split('=');
    if (!k) continue;
    out[k] = decodeURIComponent(rest.join('='));
  }
  return out;
}
