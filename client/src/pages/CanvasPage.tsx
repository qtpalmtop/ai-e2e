import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { FlowCanvas } from '@/components/FlowCanvas';
import { LivePreview } from '@/components/LivePreview';
import { api } from '@/api';
import type { CaseSchema, ValidationError } from '@/types/schema';

export function CanvasPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [data, setData] = useState<CaseSchema | null>(null);
  const [loading, setLoading] = useState(true);
  const [runResult, setRunResult] = useState<{ ok: boolean; logs: string; duration: number } | null>(null);
  const [running, setRunning] = useState(false);
  const [showLive, setShowLive] = useState(false);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    api
      .getCase(id)
      .then(setData)
      .catch((e) => alert(`加载失败：${e.message}`))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading || !data) {
    return <div style={{ padding: 24, color: '#64748b' }}>加载中...</div>;
  }

  const handleSave = async (next: CaseSchema, _errors: ValidationError[]) => {
    const saved = await api.updateCase(data.id, next);
    setData(saved);
  };

  const handleRun = async () => {
    setRunning(true);
    setRunResult(null);
    try {
      // 先翻译，再运行（翻译是运行的前置条件）
      await api.translate(data.id);
      const r = await api.run(data.id);
      setRunResult(r);
    } catch (e) {
      setRunResult({ ok: false, logs: (e as Error).message, duration: 0 });
    } finally {
      setRunning(false);
    }
  };

  const handleLiveRun = async () => {
    // 先翻译一次，保证磁盘上是最新产物
    await api.translate(data.id);
    await api.liveRun(data.id);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          padding: '10px 16px',
          borderBottom: '1px solid #e2e8f0',
          background: '#fff',
          gap: 12,
        }}
      >
        <Link to="/" style={{ color: '#0f172a', textDecoration: 'none', fontSize: 14 }}>
          ← 返回列表
        </Link>
        <div style={{ fontWeight: 600, fontSize: 16 }}>{data.name}</div>
        <div style={{ flex: 1 }} />
        <button
          onClick={() => setShowLive((v) => !v)}
          style={{
            background: showLive ? '#0f172a' : '#fff',
            color: showLive ? '#fff' : '#0f172a',
            border: '1px solid #cbd5e1',
            padding: '4px 12px',
            borderRadius: 6,
            cursor: 'pointer',
            fontSize: 12,
          }}
        >
          {showLive ? '隐藏预览' : '实时预览'}
        </button>
        <button
          onClick={() => navigate('/')}
          style={{
            background: '#fff',
            color: '#0f172a',
            border: '1px solid #cbd5e1',
            padding: '4px 12px',
            borderRadius: 6,
            cursor: 'pointer',
            fontSize: 12,
          }}
        >
          完成
        </button>
      </header>

      <div style={{ flex: 1, position: 'relative' }}>
        <FlowCanvas initial={data} onSave={handleSave} onRun={handleRun} />

        {running && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: 'rgba(15,23,42,0.5)',
              zIndex: 50,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#fff',
              fontSize: 16,
            }}
          >
            正在运行测试...
          </div>
        )}

        {runResult && !running && (
          <RunResultPanel result={runResult} onClose={() => setRunResult(null)} />
        )}

        {showLive && data && (
          <LivePreview
            caseId={data.id}
            onClose={() => setShowLive(false)}
            onTrigger={handleLiveRun}
          />
        )}
      </div>
    </div>
  );
}

function RunResultPanel({
  result,
  onClose,
}: {
  result: { ok: boolean; logs: string; duration: number };
  onClose: () => void;
}) {
  return (
    <div
      style={{
        position: 'absolute',
        bottom: 16,
        left: 16,
        right: 16,
        maxHeight: 240,
        background: '#0f172a',
        color: '#e2e8f0',
        borderRadius: 8,
        padding: 12,
        zIndex: 30,
        fontFamily: 'monospace',
        fontSize: 12,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          marginBottom: 8,
          fontFamily: 'system-ui',
        }}
      >
        <span
          style={{
            padding: '2px 8px',
            borderRadius: 4,
            background: result.ok ? '#16a34a' : '#dc2626',
            color: '#fff',
            fontSize: 12,
          }}
        >
          {result.ok ? 'PASS' : 'FAIL'}
        </span>
        <span style={{ color: '#94a3b8' }}>耗时 {result.duration} ms</span>
        <div style={{ flex: 1 }} />
        <button
          onClick={onClose}
          style={{
            background: 'transparent',
            color: '#94a3b8',
            border: 'none',
            cursor: 'pointer',
            fontSize: 16,
          }}
        >
          ×
        </button>
      </div>
      <pre style={{ flex: 1, overflow: 'auto', margin: 0, whiteSpace: 'pre-wrap' }}>
        {result.logs}
      </pre>
    </div>
  );
}
