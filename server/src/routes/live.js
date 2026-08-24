// Live 预览：把每个 case 的运行过程以 WebSocket 推给前端
// 事件协议（JSON 行）：
//   {"type":"start","caseName":"..."}
//   {"type":"step","name":"打开页面","index":1,"screenshot":"<base64>","duration":123}
//   {"type":"log","text":"..."}
//   {"type":"done","ok":true,"duration":700}
//   {"type":"error","message":"..."}

import { WebSocketServer } from 'ws';
import { liveRun } from '../runner/live.js';

const wss = new WebSocketServer({ noServer: true });

// caseId -> Set<WebSocket>
const clients = new Map();

export function attachLiveWss(server) {
  server.on('upgrade', (req, socket, head) => {
    // /api/cases/:id/live
    const m = req.url && req.url.match(/^\/api\/cases\/([^/]+)\/live$/);
    if (!m) return; // 让其他 upgrade 走默认
    wss.handleUpgrade(req, socket, head, (ws) => {
      const id = decodeURIComponent(m[1]);
      if (!clients.has(id)) clients.set(id, new Set());
      clients.get(id).add(ws);
      ws.on('close', () => {
        clients.get(id)?.delete(ws);
        if (clients.get(id)?.size === 0) clients.delete(id);
      });
      ws.send(JSON.stringify({ type: 'hello', caseId: id }));
    });
  });
}

export function emitTo(caseId, event) {
  const set = clients.get(caseId);
  if (!set) return;
  const msg = JSON.stringify(event);
  for (const ws of set) {
    try { ws.send(msg); } catch { /* ignore */ }
  }
}

// 启动一次 live 运行
export async function runLiveAndBroadcast(caseId) {
  try {
    await liveRun(caseId, (event) => emitTo(caseId, event));
  } catch (e) {
    emitTo(caseId, { type: 'error', message: e.message });
  }
}
