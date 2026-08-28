/**
 * 生成 1000+ 节点的大型用例数据并写入公共空间
 *
 * 用法：node scripts/gen-large-case.mjs
 * 前提：后端已启动在 localhost:4000，且已 seed（admin/admin123 / space-common）
 */
const BASE = 'http://localhost:4000/api';

// ---------- 1. 登录拿 cookie ----------
async function login() {
  const res = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'admin123' }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`login failed: ${res.status} ${text}`);
  }
  // 从 set-cookie 头提取 cookie
  const setCookie = res.headers.get('set-cookie') || '';
  const cookie = setCookie.split(';')[0];
  if (!cookie) throw new Error('no cookie in login response');
  console.log('[login] OK, cookie:', cookie.substring(0, 30) + '...');
  return cookie;
}

// ---------- 2. 生成 1000+ 节点 + 边 ----------
function genLargeSchema() {
  const NODE_TYPES = [
    'openPage',
    'inputText',
    'clickElement',
    'hoverElement',
    'wait',
    'condition',
    'loop',
  ];

  const totalNodes = 1200; // 1200 节点
  const cols = 30; // 网格列数
  const gapX = 220;
  const gapY = 120;

  const nodes = [];
  const edges = [];

  // start 节点
  const startId = 'n-start';
  nodes.push({
    id: startId,
    type: 'start',
    position: { x: 0, y: 0 },
    data: { label: '开始' },
  });

  // 1200 个操作节点，网格布局
  let prevId = startId;
  for (let i = 0; i < totalNodes; i++) {
    const id = `n-${i}`;
    const type = NODE_TYPES[i % NODE_TYPES.length];
    const col = i % cols;
    const row = Math.floor(i / cols);
    const data = { label: `节点${i}` };
    if (type === 'openPage') data.url = `https://example.com/page${i}`;
    if (type === 'inputText') data.selector = `#input-${i}`;
    if (type === 'clickElement') data.selector = `#btn-${i}`;
    if (type === 'wait') data.duration = 500;
    nodes.push({
      id,
      type,
      position: { x: (col + 1) * gapX, y: row * gapY },
      data,
    });
    // 前一个连到当前
    edges.push({
      id: `e-${prevId}-${id}`,
      source: prevId,
      target: id,
    });
    prevId = id;
  }

  // end 节点
  const endId = 'n-end';
  nodes.push({
    id: endId,
    type: 'end',
    position: { x: (totalNodes + 1) * gapX, y: 0 },
    data: { label: '结束' },
  });
  edges.push({ id: `e-${prevId}-${endId}`, source: prevId, target: endId });

  console.log(`[gen] nodes=${nodes.length}, edges=${edges.length}`);
  return { nodes, edges };
}

// ---------- 3. 创建用例 ----------
async function createCase(cookie, spaceId, name, schema) {
  const res = await fetch(`${BASE}/cases`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: cookie,
    },
    body: JSON.stringify({ spaceId, name, schema }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`create case failed: ${res.status} ${text}`);
  }
  const data = await res.json();
  console.log(`[create] case id=${data.id}, name="${data.name}"`);
  return data;
}

// ---------- main ----------
async function main() {
  const cookie = await login();
  const schema = genLargeSchema();
  const result = await createCase(
    cookie,
    'space-common',
    '性能测试-1200节点',
    { id: 'large-case', name: '性能测试-1200节点', ...schema },
  );
  console.log('\n=== 完成 ===');
  console.log(`用例 ID: ${result.id}`);
  console.log(`节点数: ${schema.nodes.length}`);
  console.log(`连线数: ${schema.edges.length}`);
  console.log(`\n在前端访问: http://localhost:5173，登录 admin/admin123 后打开该用例`);
}

main().catch((e) => {
  console.error('[fatal]', e.message);
  process.exit(1);
});
