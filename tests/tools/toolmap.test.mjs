// 工具地图：node --test tests/tools/*.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../../src/worker.js';
import { validate } from '../../tools/toolmap_upload.mjs';
import '../../public/assets/render.js';

const kv = () => { const m = new Map(); return { get: async k => m.get(k) ?? null, put: async (k, v) => { m.set(k, v); }, delete: async k => { m.delete(k); } }; };
const env = () => ({ TOOLS_PASSWORD: 'test-pass-123', TOOLS_COOKIE_KEY: 'test-key', SUBS: kv(), ASSETS: { fetch: async req => new Response('asset:' + new URL(req.url).pathname) } });
const call = (e, path, init = {}) => worker.fetch(new Request('https://cosmoswong.com' + path, init), e);
const W = { 'content-type': 'application/json', 'x-tools-request': '1', origin: 'https://cosmoswong.com' };
const login = async e => (await call(e, '/api/tools/login', { method: 'POST', headers: W, body: JSON.stringify({ password: 'test-pass-123' }) })).headers.get('set-cookie').split(';')[0];
const sample = { title: '示例地图', map: { rows: [{ y: 52, label: '第一层' }], nodes: { a: { r: 0, x: 200, t: '甲', s: '示例', c: 'ai' }, b: { r: 0, x: 500, t: '乙', s: '示例', c: 'kb' } }, edges: [['a', 'b']], flows: [{ id: 'f', name: '示例流程', steps: [{ t: '一', d: '说明', n: ['a', 'b'], e: [['a', 'b']] }] }] } };

test('没凭证：页面跳口令页，脚本和接口 401', async () => {
  const e = env();
  for (const p of ['/toolmap', '/toolmap.html', '/go/toolmap']) {
    const r = await call(e, p);
    assert.equal(r.status, 302); assert.equal(r.headers.get('location'), '/unlock?next=toolmap');
  }
  assert.equal((await call(e, '/assets/toolmap/app.js')).status, 401);
  assert.equal((await call(e, '/api/toolmap')).status, 401);
  assert.equal((await call(e, '/api/toolmap?v=codex')).status, 401);
});

test('有凭证：页面放行，两个版本各读各的，没内容回 empty', async () => {
  const e = env();
  const cookie = await login(e);
  assert.equal((await call(e, '/go/toolmap', { headers: { cookie } })).headers.get('location'), '/toolmap');
  assert.equal(await (await call(e, '/toolmap', { headers: { cookie } })).text(), 'asset:/toolmap');
  assert.deepEqual(await (await call(e, '/api/toolmap?v=codex', { headers: { cookie } })).json(), { empty: true });
  await e.SUBS.put('tm:claude', JSON.stringify(sample));
  const r = await call(e, '/api/toolmap?v=claude', { headers: { cookie } });
  assert.equal(r.status, 200); assert.equal(r.headers.get('cache-control'), 'private, no-store');
  assert.equal((await r.json()).title, '示例地图');
  assert.deepEqual(await (await call(e, '/api/toolmap', { headers: { cookie } })).json(), sample);   // 默认 claude
  assert.deepEqual(await (await call(e, '/api/toolmap?v=codex', { headers: { cookie } })).json(), { empty: true });
});

test('接口只读、只认两个版本', async () => {
  const e = env();
  const cookie = await login(e);
  assert.equal((await call(e, '/api/toolmap?v=../tm', { headers: { cookie } })).status, 400);
  assert.equal((await call(e, '/api/toolmap/x', { headers: { cookie } })).status, 404);
  assert.equal((await call(e, '/api/toolmap', { method: 'PUT', headers: { ...W, cookie }, body: '{}' })).status, 405);
});

test('导航：去掉 KOL 工作台入口、换成工具地图；/kol 页面照常放行', async () => {
  const items = globalThis.RENDER.navItems({ trips: [], tools: [], bookmarks: [] }).map(([h]) => h);
  assert.ok(!items.includes('/kol'));
  assert.equal(items.indexOf('/toolmap'), items.indexOf('/subs') + 1);
  assert.equal(await (await call(env(), '/kol')).text(), 'asset:/kol');
});

test('上传前检查：连线和流程不能指向不存在的节点', () => {
  assert.deepEqual(validate(sample), []);
  const bad = structuredClone(sample);
  bad.map.edges.push(['a', 'zz']);
  bad.map.flows[0].steps[0].n.push('yy');
  bad.map.nodes.a.c = 'xx';
  assert.equal(validate(bad).length, 3);
  assert.ok(validate([]).length);
});
