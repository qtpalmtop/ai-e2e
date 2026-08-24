import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { FlowCanvas } from '@/components/FlowCanvas';
import { LivePreview } from '@/components/LivePreview';
import { cases as casesApi } from '@/api';
import { useAuthStore } from '@/store/authStore';
import type { CaseSchema, ValidationError } from '@/types/schema';

const HEARTBEAT_MS = 5_000;

/** 锁状态：
 *  - editing：我持有锁（可写）
 *  - viewing：被别人持有（只读）
 *
 * 进入页面默认是 editing（乐观锁），只有真的检测到 409 冲突才切到 viewing。
 */
type LockHolder = { id: string; username: string; nickname?: string | null };
type LockState = { kind: 'editing' } | { kind: 'viewing'; by: LockHolder };

export function CanvasPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const me = useAuthStore((s) => s.me);
  const [data, setData] = useState<CaseSchema | null>(null);
  const [loading, setLoading] = useState(true);
  const [runResult, setRunResult] = useState<{ ok: boolean; logs: string; duration: number } | null>(null);
  const [running, setRunning] = useState(false);
  const [showLive, setShowLive] = useState(false);
  // 进入页面默认是 editing（乐观锁）：编辑者进入即获得编辑权
  const [lockState, setLockState] = useState<LockState>({ kind: 'editing' });

  // 持有锁的标志位：true 时不释放（避免 unmount 时多次 release）
  const holdsLockRef = useRef(false);

  // ---------- 拉数据 ----------
  useEffect(() => {
    if (!id) return;
    setLoading(true);
    casesApi
      .get(id)
      .then((c) => setData(c.schema))
      .catch((e: Error) => alert(`加载失败：${e.message}`))
      .finally(() => setLoading(false));
  }, [id]);

  // ---------- 获取/续期/释放/心跳 ----------
  /**
   * 设计要点：
   * - 进入页面立即 tryAcquire，成功 → editing；409 → viewing（看到具体用户）
   * - editing 状态每 5s 发心跳续期；viewing 状态每 5s 重试 tryAcquire（前任编辑者离开后可接管）
   * - **unmount 时不立即 releaseLock**，而是启动 5s 延迟释放：
   *   - 路由切换/快速刷新：5s 内新页面 mount，tryAcquire 续期成功，延迟释放触发时
   *     后端"5秒前没续期"条件不命中（lockedAt 是新时间），不释放
   *   - 真正离开超过 5s：定时器到期，后端条件释放生效
   * - 关闭标签页：beforeunload + sendBeacon 走 force=true 立即释放
   * - 关键修复：去掉"tryAcquire 完成后 alive=false 立即 releaseLock"的路径，
   *   那个路径会在旧 page unmount 后立即清空锁，给其他用户抢占窗口
   *   （李霖刷新编辑态后，Admin 刷新只读态偶现拿到锁就是这个 race）
   */
  useEffect(() => {
    if (!id) return;
    let alive = true;
    let hb: ReturnType<typeof setInterval> | null = null;

    // 统一的 5秒延迟释放：后端 releaseLock 默认是条件释放（lockedAt < 5秒前才清空）
    // 新 page 在 5s 内 mount 续期后 lockedAt 是新时间，> cutoff，后端不会误释放
    const scheduleDelayedRelease = () => {
      setTimeout(() => {
        casesApi.releaseLock(id).catch(() => {});
      }, 5_000);
    };

    const tryAcquire = async (): Promise<void> => {
      if (!alive) return;
      try {
        await casesApi.acquireLock(id);
        if (!alive) {
          // 组件已 unmount：此时后端锁已设置但没人续期
          // 不立即释放（会给其他用户抢占窗口），启动 5秒延迟释放
          // - 5s 内新 page mount → tryAcquire 续期成功，延迟释放触发时后端不会误清空
          // - 5s 内没人续期 → 后端条件释放生效
          scheduleDelayedRelease();
          return;
        }
        // 二次校验：连续 2 次 getLock 都返回 mine=true 才确认持有，
        // 避免单次 getLock 在 race 窗口读到"刚好被自己抢到的瞬间"误判为已持有
        // （任何一次返回非 mine，都视为失败，进入 catch 重新评估）
        const info1 = await casesApi.getLock(id);
        if (!info1.mine) {
          throw new Error(
            `409 Conflict: ${JSON.stringify({
              message: 'lock not owned after acquire (1st check)',
              lockedBy: info1.lockedBy,
            })}`,
          );
        }
        // 100ms 后再确认一次，给前一次 getLock 与后端真实状态之间的瞬时窗口留 buffer
        await new Promise((r) => setTimeout(r, 100));
        if (!alive) {
          scheduleDelayedRelease();
          return;
        }
        const info2 = await casesApi.getLock(id);
        if (!info2.mine) {
          throw new Error(
            `409 Conflict: ${JSON.stringify({
              message: 'lock not owned after acquire (2nd check)',
              lockedBy: info2.lockedBy,
            })}`,
          );
        }
        holdsLockRef.current = true;
        setLockState({ kind: 'editing' });
      } catch (e: any) {
        if (!alive) return;
        const msg: string = e?.message ?? '';
        if (!/^409/.test(msg)) {
          // 非冲突错误（网络抖动等）：保持当前状态
          console.warn('acquireLock non-409 error:', msg);
          return;
        }
        // 冲突 409：优先调 getLock 拿 holder（最准确，不依赖错误消息格式）
        let by: LockHolder = { id: '?', username: '其他用户', nickname: null };
        let lockEmpty = false;
        try {
          const info = await casesApi.getLock(id);
          if (info.lockedBy) {
            by = {
              id: info.lockedBy.id,
              username: info.lockedBy.username,
              nickname: info.lockedBy.nickname,
            };
          } else {
            // 锁已空（对方刚释放）：立即重试 tryAcquire 抢回，不切 viewing
            lockEmpty = true;
          }
        } catch {
          // getLock 失败：用错误消息解析作为最后兜底
          by = parseLockedByFromError(msg);
        }
        if (lockEmpty) {
          // 200ms 后重试，可能抢到锁
          setTimeout(() => {
            if (alive) tryAcquire();
          }, 200);
          return;
        }
        holdsLockRef.current = false;
        setLockState({ kind: 'viewing', by });
      }
    };

    // 首次进入：立即尝试获取
    tryAcquire();

    // 5s 周期：editing → heartbeat 续期；viewing → 持续重试 acquireLock
    hb = setInterval(async () => {
      if (!alive) return;
      if (holdsLockRef.current) {
        try {
          await casesApi.heartbeat(id);
        } catch {
          // 心跳失败：说明当前持有者身份已失效（锁被别人抢走 / 锁已过期被释放）
          // 必须立刻放弃持有身份、调 tryAcquire 重新评估，否则会一直卡在"自以为 editing"
          // - 锁空/自己 → acquireLock 续期成功，恢复 editing
          // - 锁被别人 → acquireLock 409，catch 块切到 viewing 并显示真正持有者
          holdsLockRef.current = false;
          tryAcquire();
        }
      } else {
        // viewing 态：重试 acquireLock，前任编辑者离开后可抢回
        tryAcquire();
      }
    }, HEARTBEAT_MS);

    // 关闭标签页时立即释放（用 sendBeacon 在 unload 时仍能送达，force=true 立即释放）
    const releaseOnUnload = () => {
      if (!holdsLockRef.current) return;
      holdsLockRef.current = false;
      try {
        const url = `/api/cases/${id}/release-lock`;
        // force=true：让后端立即清空锁（关标签页时不能等 5s 条件释放）
        const blob = new Blob(
          [JSON.stringify({ force: true })],
          { type: 'application/json' },
        );
        navigator.sendBeacon?.(url, blob);
      } catch {
        /* ignore */
      }
    };
    window.addEventListener('beforeunload', releaseOnUnload);

    return () => {
      alive = false;
      window.removeEventListener('beforeunload', releaseOnUnload);
      if (hb) clearInterval(hb);
      if (holdsLockRef.current) {
        holdsLockRef.current = false;
        // 延迟 5s 释放：给路由切换/快速刷新留续期窗口
        // - 5s 内新 page mount → tryAcquire 续期成功，延迟释放触发时后端条件不命中，不释放
        // - 5s 内没人续期 → 后端条件释放生效
        scheduleDelayedRelease();
      }
    };
  }, [id]);

  if (loading || !data) {
    return <div style={{ padding: 24, color: '#64748b' }}>加载中...</div>;
  }

  const isReadOnly = lockState.kind === 'viewing';
  /** 冲突用户显示名：优先昵称；都没有时回退到 username */
  const holderName =
    lockState.kind === 'viewing'
      ? (lockState.by.nickname?.trim() || lockState.by.username || '其他用户')
      : '';
  /** 冲突用户的次要标识：username（仅当 nickname 已显示时补充，避免重复） */
  const holderSecondary =
    lockState.kind === 'viewing' && lockState.by.nickname
      ? `（@${lockState.by.username}）`
      : '';

  const handleSave = async (next: CaseSchema, _errors: ValidationError[]) => {
    if (isReadOnly) {
      alert(`当前用例正在被「${holderName}」编辑，无法保存`);
      return;
    }
    try {
      const saved = await casesApi.update(data.id, { schema: next });
      setData(saved.schema);
    } catch (e: any) {
      const msg = e?.message ?? '';
      if (msg.includes('409') || msg.includes('locked')) {
        // 锁被抢占了
        alert('保存失败：编辑锁已被其他用户抢占');
        // 切到只读模式
        setLockState({
          kind: 'viewing',
          by: { id: '?', username: '其他用户', nickname: null },
        });
      } else {
        alert(`保存失败：${msg}`);
      }
    }
  };

  const handleRun = async () => {
    setRunning(true);
    setRunResult(null);
    try {
      await casesApi.translate(data.id);
      const r = await casesApi.run(data.id);
      setRunResult(r);
    } catch (e) {
      setRunResult({ ok: false, logs: (e as Error).message, duration: 0 });
    } finally {
      setRunning(false);
    }
  };

  const handleLiveRun = async () => {
    await casesApi.translate(data.id);
    await casesApi.liveRun(data.id);
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

        {/* 锁状态徽章 */}
        <LockBadge state={lockState} myName={me?.nickname || me?.username} />

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

      {isReadOnly && (
        <div
          data-testid="lock-banner"
          style={{
            background: '#fef2f2',
            color: '#991b1b',
            borderBottom: '1px solid #fecaca',
            padding: '10px 16px',
            fontSize: 13,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
          }}
        >
          <span
            aria-hidden
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 22,
              height: 22,
              borderRadius: '50%',
              background: '#fee2e2',
              color: '#b91c1c',
              fontSize: 14,
            }}
          >
            🔒
          </span>
          <span style={{ fontWeight: 700 }}>只读模式</span>
          <span>
            用户
            <b style={{ margin: '0 4px' }}>{holderName}</b>
            <span style={{ color: '#b45309' }}>{holderSecondary}</span>
            正在编辑此用例，你暂时无法修改。
          </span>
        </div>
      )}

      <div style={{ flex: 1, position: 'relative' }}>
        <FlowCanvas
          initial={data}
          onSave={handleSave}
          onRun={handleRun}
          readOnly={isReadOnly}
        />

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

/**
 * 从后端 4xx 错误消息中解析 lockedBy。
 * 消息格式形如：`409 Conflict: {"statusCode":409,...,"lockedBy":{"id":"..","username":"..","nickname":".."}}`
 * 解析失败时返回兜底值（让调用方决定是否要再调 getLock 兜底）。
 */
function parseLockedByFromError(msg: string): LockHolder {
  const fallback: LockHolder = { id: '?', username: '其他用户', nickname: null };
  // 1) 优先尝试匹配完整的 lockedBy JSON（处理可能的转义引号）
  const m = msg.match(/"lockedBy"\s*:\s*(\{[^{}]+\})/);
  if (m) {
    try {
      const o = JSON.parse(m[1]);
      if (o && (o.username || o.id)) {
        return { id: o.id, username: o.username, nickname: o.nickname ?? null };
      }
    } catch {
      /* fallthrough */
    }
  }
  // 2) 退而求其次：尝试匹配 username/nickname 字段
  const u = msg.match(/"username"\s*:\s*"([^"]+)"/);
  const n = msg.match(/"nickname"\s*:\s*"([^"]+)"/);
  const id = msg.match(/"id"\s*:\s*"([^"]+)"/);
  if (u) {
    return { id: id?.[1] ?? '?', username: u[1], nickname: n?.[1] ?? null };
  }
  return fallback;
}

/**
 * 用 sessionStorage 跨刷新保持"我曾是这个用例的锁持有者"标记。
 * key 同时带 caseId 和 userId，避免同浏览器切换账号时不同用户读到彼此的标记。
 * （当前未启用：保留以备后用）
 */
const _lockHolderKeyUnused = (caseId?: string, userId?: string) =>
  `case-lock:holder:${caseId ?? ''}:${userId ?? ''}`;

function LockBadge({
  state,
  myName,
}: {
  state: LockState;
  myName?: string;
}) {
  if (state.kind === 'editing') {
    return (
      <span style={badgeStyle('#dcfce7', '#15803d')}>
        🔒 我正在编辑（{myName}）
      </span>
    );
  }
  // viewing：明确显示冲突用户（昵称 + @username）
  const by = state.by;
  const primary = by.nickname?.trim() || by.username || '其他用户';
  const secondary = by.nickname?.trim() ? ` @${by.username}` : '';
  return (
    <span style={badgeStyle('#fef3c7', '#92400e')} title={`userId=${by.id}`}>
      🚫 {primary}{secondary} 正在编辑
    </span>
  );
}

const badgeStyle = (bg: string, color: string): React.CSSProperties => ({
  background: bg,
  color,
  padding: '2px 10px',
  borderRadius: 999,
  fontSize: 11,
  fontWeight: 500,
});

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
