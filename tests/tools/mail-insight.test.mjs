// 邮件名单透视：node --test tests/tools/*.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../../src/worker.js';
import { analyze, toRecords } from '../../public/assets/mail-insight/engine.mjs';

const kv = () => { const m = new Map(); return { m, get: async k => m.get(k) ?? null, put: async (k, v) => { m.set(k, v); }, delete: async k => { m.delete(k); } }; };
const env = () => ({ TOOLS_PASSWORD: 'test-pass-123', TOOLS_COOKIE_KEY: 'test-key', SUBS: kv(), ASSETS: { fetch: async req => new Response('asset:' + new URL(req.url).pathname) } });
const call = (e, path, init = {}) => worker.fetch(new Request('https://cosmoswong.com' + path, init), e);
const W = { 'content-type': 'application/json', 'x-tools-request': '1', origin: 'https://cosmoswong.com' };
async function authed(e) {
  const r = await call(e, '/api/tools/login', { method: 'POST', headers: { ...W, 'cf-connecting-ip': '1.2.3.4' }, body: JSON.stringify({ password: 'test-pass-123' }) });
  return r.headers.get('set-cookie').split(';')[0];
}

test('没口令：页面跳口令页、脚本 401、接口 401', async () => {
  const e = env();
  assert.equal((await call(e, '/mail-insight')).headers.get('location'), '/unlock?next=mail-insight');
  assert.equal((await call(e, '/go/mail-insight')).headers.get('location'), '/unlock?next=mail-insight');
  assert.equal((await call(e, '/assets/mail-insight/app.mjs')).status, 401);
  assert.equal((await call(e, '/api/mail-insight')).status, 401);
  assert.equal((await call(e, '/api/mail-insight/snap', { method: 'POST', headers: W, body: '{}' })).status, 401);
});

test('有口令：上传一期 → 清单有摘要 → 能读 → 邮箱被抹掉 → 能删', async () => {
  const e = env(), cookie = await authed(e);
  assert.equal((await call(e, '/go/mail-insight', { headers: { cookie } })).headers.get('location'), '/mail-insight');
  assert.equal(await (await call(e, '/mail-insight', { headers: { cookie } })).text(), 'asset:/mail-insight');
  const data = { n: { sub: 10, unsub: 2, cleaned: 0 }, rating: { 2: 8, 3: 2 }, segments: [{ id: 'a', name: 'A', sub: 4, unsub: 1 }], unsubComments: ['联系我 someone@example.com'] };
  const r = await call(e, '/api/mail-insight/snap', { method: 'POST', headers: { ...W, cookie }, body: JSON.stringify({ label: '第一期', data }) });
  assert.equal(r.status, 200);
  const { snapshot } = await r.json();
  assert.equal(snapshot.summary.sub, 10); assert.equal(snapshot.summary.active, 2); assert.equal(snapshot.summary.segs.a, 4);
  const list = await (await call(e, '/api/mail-insight', { headers: { cookie } })).json();
  assert.equal(list.snapshots.length, 1);
  const snap = await (await call(e, '/api/mail-insight/snap/' + snapshot.id, { headers: { cookie } })).json();
  assert.equal(snap.data.unsubComments[0], '联系我 [邮箱]');
  assert.equal((await call(e, '/api/mail-insight/snap/' + snapshot.id, { method: 'DELETE', headers: { ...W, cookie } })).status, 200);
  assert.equal((await (await call(e, '/api/mail-insight', { headers: { cookie } })).json()).snapshots.length, 0);
});

test('跨站或缺防伪头的写入 403；空数据 400；坏 id 404', async () => {
  const e = env(), cookie = await authed(e);
  const body = JSON.stringify({ data: { n: { sub: 1 } } });
  assert.equal((await call(e, '/api/mail-insight/snap', { method: 'POST', headers: { ...W, cookie, origin: 'https://evil.example' }, body })).status, 403);
  assert.equal((await call(e, '/api/mail-insight/snap', { method: 'POST', headers: { 'content-type': 'application/json', cookie }, body })).status, 403);
  assert.equal((await call(e, '/api/mail-insight/snap', { method: 'POST', headers: { ...W, cookie }, body: JSON.stringify({ data: { n: { sub: 0 } } }) })).status, 400);
  assert.equal((await call(e, '/api/mail-insight/snap/../../x', { headers: { cookie } })).status, 404);
});

test('引擎：按手册规则分群，输出不含邮箱', () => {
  const csv = 'Email Address,MEMBER_RATING,OPTIN_TIME,CC,TAGS\n'
    + 'a@x.com,2,2026-01-01,DE,"Customer,View A"\n'
    + 'b@x.com,4,2025-01-01,GB,"View A,View B,Opened Fly EDM"\n';
  const pb = { customer: { exact: ['Customer'] }, views: { tags: ['View A', 'View B'] }, opened: { regex: '^Opened ' },
    segments: [{ id: 'both', name: '都看过', all: ['View A', 'View B'] }, { id: 'lead', name: '潜客', any: { contains: ['view'], ci: true }, notCustomer: true }] };
  const d = analyze(toRecords(csv).recs, [], [], pb);
  assert.deepEqual(d.segments.map(s => [s.id, s.sub]), [['both', 1], ['lead', 1], ['newYear', 1]]);
  assert.equal(d.customers, 1); assert.equal(d.views.all, 1); assert.deepEqual(d.opened, [['Opened Fly EDM', 1]]);
  assert.ok(!JSON.stringify(d).includes('@'));
});
