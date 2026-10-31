// 工具箱口令门：node --test tests/tools/*.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../../src/worker.js';

const kv = () => { const m = new Map(); return { get: async k => m.get(k) ?? null, put: async (k, v) => { m.set(k, v); }, delete: async k => { m.delete(k); } }; };
const env = (extra = {}) => ({ TOOLS_PASSWORD: 'test-pass-123', RESUME_PASSWORD: 'resume-pass-456', TOOLS_COOKIE_KEY: 'test-key', SUBS: kv(), ASSETS: { fetch: async req => new Response('asset:' + new URL(req.url).pathname) }, ...extra });
const call = (e, path, init = {}) => worker.fetch(new Request('https://cosmoswong.com' + path, init), e);
const login = (e, password, headers = {}, next) => call(e, '/api/tools/login', { method: 'POST', headers: { 'content-type': 'application/json', 'x-tools-request': '1', origin: 'https://cosmoswong.com', 'cf-connecting-ip': '1.2.3.4', ...headers }, body: JSON.stringify({ password, next }) });
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
  assert.equal((await call(e, '/english')).headers.get('location'), '/unlock?next=english');
  assert.equal((await call(e, '/english.html')).status, 302);
  assert.equal((await call(e, '/assets/english/words.js')).status, 401);
  assert.equal((await call(e, '/go/english')).headers.get('location'), '/unlock?next=english');
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
  assert.equal((await call(e, '/go/english', c)).headers.get('location'), '/english');
  assert.equal(await (await call(e, '/english', c)).text(), 'asset:/english');
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

test('简历和所有知识库页面未登录被拦，next保留原页面及查询',async()=>{
 const e=env();for(const path of ['/resume','/resume.html','/resume.pdf','/resume/','/knowledge','/knowledge/','/knowledge/overview','/knowledge/xxx.html','/knowledge/overview?view=full']){
  const r=await call(e,path);assert.equal(r.status,302);const next=new URL(r.headers.get('location'),'https://cosmoswong.com');assert.equal(next.pathname,'/unlock');assert.equal(next.searchParams.get('next'),path);assert.equal(r.headers.get('cache-control'),'no-store');
 }
});
test('简历单独一把锁：工具箱口令和凭证都打不开简历，简历凭证也打不开工具',async()=>{
 const e=env(),tools={headers:{cookie:cookieOf(await login(e,'test-pass-123'))}};
 for(const path of ['/resume','/resume.html','/resume.pdf'])assert.equal((await call(e,path,tools)).status,302,path);
 assert.equal((await login(e,'test-pass-123',{},'/resume')).status,401);
 const ok=await login(e,'resume-pass-456',{},'/resume.pdf');assert.equal(ok.status,200);assert.equal((await ok.json()).redirect,'/resume.pdf');assert.match(ok.headers.get('set-cookie'),/^resume_session=/);
 const c={headers:{cookie:cookieOf(ok)}};
 for(const path of ['/resume','/resume.html','/resume.pdf']){const r=await call(e,path,c);assert.equal(r.status,200);assert.equal(r.headers.get('cache-control'),'private, no-store');}
 for(const path of ['/knowledge/','/go/travel','/marquee'])assert.equal((await call(e,path,c)).status,302,path);
 assert.equal((await login(e,'resume-pass-456')).status,401);
 e.RESUME_PASSWORD='changed';assert.equal((await call(e,'/resume',c)).status,302);
 e.RESUME_PASSWORD=undefined;assert.equal((await login(e,'x',{},'/resume')).status,500);assert.equal((await call(e,'/resume',c)).status,302);
});
test('一份旧格式tools_session在知识库与健身入口共用，响应不共享缓存',async()=>{
 const e=env(),ok=await login(e,'test-pass-123'),c={headers:{cookie:cookieOf(ok)}};
 for(const path of ['/knowledge/','/knowledge/overview']){const r=await call(e,path,c);assert.equal(r.status,200);assert.equal(r.headers.get('cache-control'),'private, no-store');assert.match(r.headers.get('x-robots-tag'),/noindex/);assert.match(r.headers.get('vary'),/Cookie/);assert.match(await r.text(),/^asset:/);}
 assert.equal((await call(e,'/go/fitness',c)).headers.get('location'),'https://jianshen.cosmoswong.com');assert.equal((await call(e,'/go/fitness')).headers.get('location'),'/unlock?next=fitness');
 for(const path of ['/attendance','/','/portfolio'])assert.equal((await call(e,path)).status,200);
});
test('编码与重复斜杠不能绕过保护',async()=>{
 const e=env();for(const path of ['/%72esume.pdf','/re%73ume','/know%6cedge/overview','/knowledge%2foverview','//resume','/knowledge//overview'])assert.equal((await call(e,path)).status,302,path);
 for(const path of ['/%2572esume','/knowledge/%5coverview'])assert.equal((await call(e,path)).status,400,path);
});
