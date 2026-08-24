// Live 事件服务：管理 "caseId -> Set<WebSocket>" 订阅关系
//  - 前端 WS 连接时 register(client, caseId)
//  - CasesController.liveRun() 启动时调用 start(actorId, caseId)
//  - 事件通过 emitTo(caseId, event) 推给所有订阅者
import { Injectable, Logger } from '@nestjs/common';
import { WebSocket } from 'ws';
import { CasesService } from './cases.service';
import type { LiveEvent } from './runner/liveRun';

@Injectable()
export class CasesLiveService {
  private readonly logger = new Logger(CasesLiveService.name);
  // caseId -> Set<WebSocket>
  private clients = new Map<string, Set<WebSocket>>();

  constructor(private readonly cases: CasesService) {}

  register(caseId: string, ws: WebSocket) {
    if (!this.clients.has(caseId)) this.clients.set(caseId, new Set());
    this.clients.get(caseId)!.add(ws);
    ws.on('close', () => this.unregister(caseId, ws));
    ws.send(JSON.stringify({ type: 'hello', caseId }));
  }

  unregister(caseId: string, ws: WebSocket) {
    this.clients.get(caseId)?.delete(ws);
    if (this.clients.get(caseId)?.size === 0) this.clients.delete(caseId);
  }

  emitTo(caseId: string, event: LiveEvent) {
    const set = this.clients.get(caseId);
    if (!set) return;
    const msg = JSON.stringify(event);
    for (const ws of set) {
      try {
        ws.send(msg);
      } catch {
        /* ignore */
      }
    }
  }

  /** 启动一个 case 的 live 运行：订阅者会持续收到事件 */
  start(actorId: string, caseId: string) {
    this.cases
      .startLive(actorId, caseId, (e) => this.emitTo(caseId, e))
      .catch((e) => {
        this.logger.error(`live run error: ${e?.message}`);
        this.emitTo(caseId, { type: 'error', message: e?.message ?? String(e) });
      });
  }
}
