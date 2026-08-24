import { useCallback, useEffect, useRef, useState } from 'react';
import { openLiveSocket } from '@/api';

export type LiveEvent =
  | { type: 'hello'; caseId: string }
  | { type: 'start'; caseName: string; file?: string; ts: number }
  | { type: 'step-start'; name: string; index: number; loop?: { count: number } }
  | {
      type: 'step-end';
      name: string;
      index: number;
      duration: number;
      screenshot?: string | null;
      ok: boolean;
      error?: string;
      loop?: { count: number };
    }
  | { type: 'log'; text: string; level?: string }
  | { type: 'done'; ok: boolean; duration: number }
  | { type: 'error'; message: string };

type StepRow = {
  index: number;
  name: string;
  status: 'running' | 'ok' | 'fail';
  duration?: number;
  error?: string;
};

export function LivePreview({
  caseId,
  onClose,
  onTrigger,
}: {
  caseId: string;
  onClose: () => void;
  onTrigger: () => Promise<unknown>;
}) {
  const [status, setStatus] = useState<'idle' | 'running' | 'pass' | 'fail'>('idle');
  const [steps, setSteps] = useState<StepRow[]>([]);
  const [logs, setLogs] = useState<string[]>([]);
  const [screenshot, setScreenshot] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [duration, setDuration] = useState<number | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const logEndRef = useRef<HTMLDivElement | null>(null);

  // 事件处理用 useCallback 稳定引用，依赖里只放 setState（setState 本身稳定）
  const handleEvent = useCallback((ev: LiveEvent) => {
    switch (ev.type) {
      case 'hello':
        // 连上即可，不做特殊处理
        break;
      case 'start':
        setStatus('running');
        setSteps([]);
        setLogs([`▶ start: ${ev.caseName}`]);
        setScreenshot(null);
        setError(null);
        setDuration(null);
        break;
      case 'step-start': {
        setSteps((prev) => [
          ...prev,
          { index: ev.index, name: ev.name + (ev.loop ? ` × ${ev.loop.count}` : ''), status: 'running' },
        ]);
        setLogs((prev) => [...prev, `… ${ev.index + 1}. ${ev.name} (running)`]);
        break;
      }
      case 'step-end': {
        setSteps((prev) =>
          prev.map((s) =>
            s.index === ev.index
              ? {
                  ...s,
                  status: ev.ok ? 'ok' : 'fail',
                  duration: ev.duration,
                  error: ev.error,
                }
              : s,
          ),
        );
        setLogs((prev) => [
          ...prev,
          `${ev.ok ? '✓' : '✗'} ${ev.index + 1}. ${ev.name} (${ev.duration}ms)${
            ev.error ? ' — ' + ev.error : ''
          }`,
        ]);
        if (ev.screenshot) setScreenshot(ev.screenshot);
        break;
      }
      case 'log':
        setLogs((prev) => [...prev, ev.text]);
        break;
      case 'done':
        setStatus(ev.ok ? 'pass' : 'fail');
        setDuration(ev.duration);
        setLogs((prev) => [
          ...prev,
          `${ev.ok ? '✓ pass' : '✗ fail'} (total ${ev.duration}ms)`,
        ]);
        break;
      case 'error':
        setStatus('fail');
        setError(ev.message);
        setLogs((prev) => [...prev, `✗ error: ${ev.message}`]);
        break;
    }
  }, []);

  // 建立 WS：组件挂载就连，卸载自动断
  useEffect(() => {
    let alive = true;
    let ws: WebSocket | null = null;
    openLiveSocket(
      caseId,
      handleEvent,
      () => alive && setError('WebSocket 连接失败'),
    )
      .then((w) => {
        if (!alive) {
          try { w.close(); } catch { /* ignore */ }
          return;
        }
        ws = w;
        wsRef.current = w;
        w.onclose = () => {
          if (wsRef.current === w) wsRef.current = null;
        };
      })
      .catch(() => {
        if (alive) setError('WebSocket 连接失败');
      });
    return () => {
      alive = false;
      try { ws?.close(); } catch { /* ignore */ }
    };
  }, [caseId, handleEvent]);

  // 日志自动滚到底
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const handleStart = async () => {
    if (status === 'running') return;
    try {
      await onTrigger();
    } catch (e) {
      setStatus('fail');
      setError((e as Error).message);
    }
  };

  return (
    <div
      style={{
        position: 'absolute',
        top: 16,
        right: 16,
        width: 420,
        maxHeight: 'calc(100vh - 32px)',
        background: '#0f172a',
        color: '#e2e8f0',
        borderRadius: 10,
        boxShadow: '0 10px 30px rgba(15,23,42,0.35)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        zIndex: 40,
        fontSize: 12,
      }}
    >
      {/* header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '10px 12px',
          borderBottom: '1px solid #1e293b',
        }}
      >
        <span
          style={{
            padding: '2px 8px',
            borderRadius: 4,
            fontSize: 11,
            fontWeight: 600,
            background:
              status === 'running'
                ? '#f59e0b'
                : status === 'pass'
                ? '#16a34a'
                : status === 'fail'
                ? '#dc2626'
                : '#475569',
            color: '#fff',
          }}
        >
          {status === 'idle' ? 'READY' : status.toUpperCase()}
        </span>
        <span style={{ fontWeight: 600 }}>Live 预览</span>
        {duration != null && (
          <span style={{ color: '#94a3b8', fontSize: 11 }}>{duration} ms</span>
        )}
        <div style={{ flex: 1 }} />
        <button
          onClick={handleStart}
          disabled={status === 'running'}
          style={{
            background: status === 'running' ? '#475569' : '#2563eb',
            color: '#fff',
            border: 'none',
            borderRadius: 4,
            padding: '4px 10px',
            cursor: status === 'running' ? 'not-allowed' : 'pointer',
            fontSize: 12,
          }}
        >
          {status === 'running' ? '运行中…' : '开始预览'}
        </button>
        <button
          onClick={onClose}
          style={{
            background: 'transparent',
            color: '#94a3b8',
            border: 'none',
            cursor: 'pointer',
            fontSize: 16,
            padding: 0,
            lineHeight: 1,
          }}
        >
          ×
        </button>
      </div>

      {/* 截图区 */}
      <div
        style={{
          height: 220,
          background: '#020617',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderBottom: '1px solid #1e293b',
          position: 'relative',
        }}
      >
        {screenshot ? (
          <img
            src={`data:image/jpeg;base64,${screenshot}`}
            alt="browser screenshot"
            style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
          />
        ) : (
          <span style={{ color: '#475569', fontSize: 12 }}>
            {status === 'running' ? '等待第一帧截图…' : '尚未开始运行'}
          </span>
        )}
      </div>

      {/* 步骤区 */}
      <div
        style={{
          maxHeight: 160,
          overflowY: 'auto',
          borderBottom: '1px solid #1e293b',
          padding: '6px 0',
        }}
      >
        {steps.length === 0 ? (
          <div style={{ padding: '8px 12px', color: '#475569' }}>暂无步骤</div>
        ) : (
          steps.map((s) => (
            <div
              key={s.index}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '4px 12px',
                fontFamily: 'monospace',
                color: s.status === 'fail' ? '#fca5a5' : '#e2e8f0',
              }}
            >
              <span
                style={{
                  width: 14,
                  display: 'inline-block',
                  color:
                    s.status === 'ok'
                      ? '#4ade80'
                      : s.status === 'fail'
                      ? '#f87171'
                      : '#fbbf24',
                }}
              >
                {s.status === 'ok' ? '✓' : s.status === 'fail' ? '✗' : '⋯'}
              </span>
              <span style={{ width: 24, color: '#64748b' }}>{s.index + 1}.</span>
              <span style={{ flex: 1 }}>{s.name}</span>
              {s.duration != null && (
                <span style={{ color: '#64748b', fontSize: 11 }}>{s.duration}ms</span>
              )}
            </div>
          ))
        )}
        {error && (
          <div style={{ padding: '4px 12px', color: '#fca5a5', fontFamily: 'monospace' }}>
            {error}
          </div>
        )}
      </div>

      {/* 日志区 */}
      <div
        style={{
          flex: 1,
          minHeight: 80,
          overflowY: 'auto',
          padding: '6px 12px',
          fontFamily: 'monospace',
          fontSize: 11,
          color: '#cbd5e1',
        }}
      >
        {logs.map((line, i) => (
          <div key={i} style={{ whiteSpace: 'pre-wrap' }}>
            {line}
          </div>
        ))}
        <div ref={logEndRef} />
      </div>
    </div>
  );
}
