// 英语从零学进度接口：node --test tests/english/*.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../../src/worker.js';

const kv = () => { const m = new Map(); return { get: async k => m.get(k) ?? null, put: async (k, v) => { m.set(k, v); }, delete: async k => { m.delete(k); } }; };
const env = () => ({ TOOLS_PASSWORD: 'test-pass-123', TOOLS_COOKIE_KEY: 'test-key', SUBS: kv(), ASSETS: { fetch: async req => new Response('asset:' + new URL(req.url).pathname) } });
const call = (e, path, init = {}) => worker.fetch(new Request('https://cosmoswong.com' + path, init), e);
async function cookie(e) {
  const r = await call(e, '/api/tools/login', { method: 'POST', headers: { 'content-type': 'application/json', 'x-tools-request': '1', origin: 'https://cosmoswong.com', 'cf-connecting-ip': '1.2.3.4' }, body: JSON.stringify({ password: 'test-pass-123' }) });
  return r.headers.get('set-cookie').split(';')[0];
}
const put = (e, c, body, extra = {}) => call(e, '/api/english/progress', { method: 'PUT', headers: { cookie: c, 'content-type': 'application/json', 'x-tools-request': '1', origin: 'https://cosmoswong.com', ...extra }, body: JSON.stringify(body) });

test('没口令凭证：读写都 401', async () => {
  const e = env();
  assert.equal((await call(e, '/api/english/progress')).status, 401);
  assert.equal((await call(e, '/api/english/progress', { method: 'PUT', body: '{}' })).status, 401);
});

test('读写进度：版本号递增，旧版本写入返回 409 并带回最新数据', async () => {
  const e = env(), c = await cookie(e);
  let r = await call(e, '/api/english/progress', { headers: { cookie: c } });
  assert.deepEqual(await r.json(), { data: null, version: 0 });
  r = await put(e, c, { base: 0, data: { cards: { hello: { box: 1 } } } });
  assert.equal(r.status, 200); assert.equal((await r.json()).version, 1);
  r = await put(e, c, { base: 0, data: { cards: {} } });
  assert.equal(r.status, 409);
  const body = await r.json();
  assert.equal(body.version, 1); assert.deepEqual(body.data.cards, { hello: { box: 1 } });
  r = await call(e, '/api/english/progress', { headers: { cookie: c } });
  assert.equal((await r.json()).version, 1);
});

test('写入要同源和请求头；格式不对 400', async () => {
  const e = env(), c = await cookie(e);
  assert.equal((await put(e, c, { base: 0, data: { cards: {} } }, { origin: 'https://evil.example' })).status, 403);
  assert.equal((await put(e, c, { base: 0, data: { cards: {} } }, { 'x-tools-request': '0' })).status, 403);
  assert.equal((await put(e, c, { base: 0, data: [] })).status, 400);
  assert.equal((await put(e, c, { base: 0 })).status, 400);
});
