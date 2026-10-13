// 工具箱口令门：node --test tests/tools/*.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../../src/worker.js';

const kv = () => { const m = new Map(); return { get: async k => m.get(k) ?? null, put: async (k, v) => { m.set(k, v); }, delete: async k => { m.delete(k); } }; };
const env = (extra = {}) => ({ TOOLS_PASSWORD: 'test-pass-123', TOOLS_COOKIE_KEY: 'test-key', SUBS: kv(), ASSETS: { fetch: async req => new Response('asset:' + new URL(req.url).pathname) }, ...extra });
const call = (e, path, init = {}) => worker.fetch(new Request('https://cosmoswong.com' + path, init), e);
const login = (e, password, headers = {}) => call(e, '/api/tools/login', { method: 'POST', headers: { 'content-type': 'application/json', 'x-tools-request': '1', origin: 'https://cosmoswong.com', 'cf-connecting-ip': '1.2.3.4', ...headers }, body: JSON.stringify({ password }) });
const cookieOf = r => r.headers.get('set-cookie').split(';')[0];

test('没凭证：/go/* 跳口令页，/marquee 跳口令页，marquee 资源 401', async () => {
  const e = env();
  for (const id of ['attendance', 'cosmos-os', 'travel', 'h5-editor', 'marquee']) {
    const r = await call(e, '/go/' + id);
    assert.equal(r.status, 302); assert.equal(r.headers.get('location'), '/unlock?next=' + id);
  }
  assert.equal((await call(e, '/marquee')).headers.get('location'), '/unlock?next=marquee');
  assert.equal((await call(e, '/marquee.html')).status, 302);
  assert.equal((await call(e, '/assets/marquee/app.js')).status, 401);
});

test('补时计算器直链不要口令；其他页面不受影响', async () => {
  const e = env();
  assert.equal(await (await call(e, '/attendance')).text(), 'asset:/attendance');
  assert.equal(await (await call(e, '/tools')).text(), 'asset:/tools');
  assert.equal(await (await call(e, '/')).text(), 'asset:/');
});

test('口令对：365 天凭证，之后 /go 跳真实地址、/marquee 放行', async () => {
  const e = env();
  const r = await login(e, 'test-pass-123');
  assert.equal(r.status, 200);
  const sc = r.headers.get('set-cookie');
  assert.match(sc, /HttpOnly/); assert.match(sc, /Secure/); assert.match(sc, /Max-Age=31536000/); assert.match(sc, /Path=\//);
  const c = { headers: { cookie: cookieOf(r) } };
  assert.equal((await call(e, '/go/travel', c)).headers.get('location'), 'https://indonesia.cosmoswong.com');
  assert.equal((await call(e, '/go/attendance', c)).headers.get('location'), '/attendance');
  assert.equal(await (await call(e, '/marquee', c)).text(), 'asset:/marquee');
  assert.equal(await (await call(e, '/assets/marquee/app.js', c)).text(), 'asset:/assets/marquee/app.js');
});

test('口令错、伪造凭证、换口令后旧凭证都不行；未知 id 回工具箱', async () => {
  const e = env();
  assert.equal((await login(e, 'wrong')).status, 401);
  const forged = { headers: { cookie: 'tools_session=9999999999.abc' } };
  assert.equal((await call(e, '/go/travel', forged)).headers.get('location'), '/unlock?next=travel');
  const ok = await login(e, 'test-pass-123');
  const c = { headers: { cookie: cookieOf(ok) } };
  e.TOOLS_PASSWORD = 'changed-pass';
  assert.equal((await call(e, '/go/travel', c)).headers.get('location'), '/unlock?next=travel');
  assert.equal((await call(e, '/go/nope')).headers.get('location'), '/tools');
  assert.equal((await call(e, '/go/%E0%A4%A')).headers.get('location'), '/tools');
});

test('跨站或缺防伪头 403；输错 10 次锁定', async () => {
  const e = env();
  assert.equal((await login(e, 'test-pass-123', { origin: 'https://evil.example' })).status, 403);
  assert.equal((await login(e, 'test-pass-123', { 'x-tools-request': '' })).status, 403);
  for (let i = 0; i < 10; i++) assert.equal((await login(e, 'bad')).status, 401);
  assert.equal((await login(e, 'test-pass-123')).status, 429);
});

test('没设置 secret 时一律进不去', async () => {
  const e = env({ TOOLS_PASSWORD: undefined });
  assert.equal((await login(e, 'x')).status, 500);
  assert.equal((await call(e, '/go/travel')).headers.get('location'), '/unlock?next=travel');
});
