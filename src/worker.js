// cosmoswong.com 的服务端：只接 /api/*（wrangler.toml 的 run_worker_first），其余请求都是静态资源，不经过这里。
// 目前只有一个功能：/subs 订阅倒计时页的密码门与数据读写。
//   - 密码存在 Worker secret SUBS_PASSWORD，登录 cookie 用 SUBS_COOKIE_KEY 签名；两个都不进仓库
//   - 订阅数据存在 KV（binding SUBS，key "list"），不进仓库——仓库是公开的
//   - 换密码：printf '%s' '新密码' | npx wrangler secret put SUBS_PASSWORD（旧登录会随之全部失效）

const COOKIE = 'subs_session';
const SESSION_DAYS = 30;
const MAX_FAILS = 10;          // 同一 IP 15 分钟内最多输错 10 次
const FAIL_WINDOW = 900;
const MAX_BYTES = 64 * 1024;   // 订阅清单上限，防止误写入大文件

const json = (data, status = 200, headers = {}) => new Response(JSON.stringify(data), {
  status,
  headers: {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-robots-tag': 'noindex',
    ...headers
  }
});

const enc = new TextEncoder();
const b64url = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

// 长度无关的比较：先各自取哈希再逐字节比，避免按长度提前返回
async function safeEq(a, b) {
  const [x, y] = await Promise.all([a, b].map(s => crypto.subtle.digest('SHA-256', enc.encode(String(s)))));
  const u = new Uint8Array(x), v = new Uint8Array(y);
  let diff = 0;
  for (let i = 0; i < u.length; i++) diff |= u[i] ^ v[i];
  return diff === 0;
}

// 签名 key 里混入密码本身：换密码后旧 cookie 自动作废
async function sign(env, msg) {
  const key = await crypto.subtle.importKey('raw', enc.encode(env.SUBS_COOKIE_KEY + '\u0000' + env.SUBS_PASSWORD),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64url(await crypto.subtle.sign('HMAC', key, enc.encode(msg)));
}

async function isAuthed(req, env) {
  const m = (req.headers.get('cookie') || '').match(new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`));
  if (!m) return false;
  const [exp, sig] = m[1].split('.');
  if (!exp || !sig || Number(exp) < Date.now() / 1000) return false;
  return safeEq(sig, await sign(env, 'subs:' + exp));
}

const cookie = (value, maxAge) =>
  `${COOKIE}=${value}; Path=/api/subs; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`;

async function login(req, env) {
  const ip = req.headers.get('cf-connecting-ip') || 'unknown';
  const rlKey = 'rl:' + ip;
  const fails = Number(await env.SUBS.get(rlKey)) || 0;
  if (fails >= MAX_FAILS) return json({ error: '输错次数太多，请 15 分钟后再试' }, 429);

  let password = '';
  try { password = String((await req.json()).password || ''); } catch { /* 空密码按输错处理 */ }
  if (!password || !(await safeEq(password, env.SUBS_PASSWORD))) {
    await env.SUBS.put(rlKey, String(fails + 1), { expirationTtl: FAIL_WINDOW });
    return json({ error: '密码不对' }, 401);
  }
  await env.SUBS.delete(rlKey);
  const exp = Math.floor(Date.now() / 1000) + SESSION_DAYS * 86400;
  return json({ ok: true }, 200, { 'set-cookie': cookie(`${exp}.${await sign(env, 'subs:' + exp)}`, SESSION_DAYS * 86400) });
}

// 只收认得的字段，其余丢掉；日期必须是 YYYY-MM-DD 或空
const CYCLES = ['月', '季', '半年', '年', '一次性'];
const VERDICTS = ['续订', '待定', '停掉'];
function clean(list) {
  if (!Array.isArray(list)) throw new Error('数据格式不对');
  return list.slice(0, 200).map(x => ({
    id: String(x.id || crypto.randomUUID()).slice(0, 40),
    name: String(x.name || '').slice(0, 60),
    purpose: String(x.purpose || '').slice(0, 120),
    price: Number.isFinite(+x.price) && x.price !== '' ? +x.price : null,
    currency: x.currency === 'USD' ? 'USD' : 'CNY',
    cycle: CYCLES.includes(x.cycle) ? x.cycle : '月',
    next: /^\d{4}-\d{2}-\d{2}$/.test(x.next || '') ? x.next : '',
    auto: !!x.auto,
    verdict: VERDICTS.includes(x.verdict) ? x.verdict : '待定',
    cancel: String(x.cancel || '').slice(0, 200),
    note: String(x.note || '').slice(0, 300)
  }));
}

async function subsApi(req, env, path) {
  if (!env.SUBS_PASSWORD || !env.SUBS_COOKIE_KEY) return json({ error: '服务端还没设置密码' }, 500);
  if (path === '/api/subs/login' && req.method === 'POST') return login(req, env);
  if (path === '/api/subs/logout' && req.method === 'POST') return json({ ok: true }, 200, { 'set-cookie': cookie('', 0) });
  if (path !== '/api/subs') return json({ error: '没有这个接口' }, 404);
  if (!(await isAuthed(req, env))) return json({ error: '需要密码' }, 401);

  if (req.method === 'GET') {
    const raw = await env.SUBS.get('list');
    return json({ items: raw ? JSON.parse(raw) : [], updatedAt: (await env.SUBS.get('updatedAt')) || null });
  }
  if (req.method === 'PUT') {
    const text = await req.text();
    if (text.length > MAX_BYTES) return json({ error: '数据太大' }, 413);
    let items;
    try { items = clean(JSON.parse(text).items); } catch (e) { return json({ error: e.message || '数据格式不对' }, 400); }
    const now = new Date().toISOString();
    await env.SUBS.put('list', JSON.stringify(items));
    await env.SUBS.put('updatedAt', now);
    return json({ ok: true, items, updatedAt: now });
  }
  return json({ error: '不支持的请求' }, 405);
}

export default {
  async fetch(req, env) {
    const path = new URL(req.url).pathname.replace(/\/+$/, '');
    if (path === '/api/subs' || path.startsWith('/api/subs/')) return subsApi(req, env, path);
    if (path.startsWith('/api/')) return json({ error: '没有这个接口' }, 404);
    return env.ASSETS.fetch(req);
  }
};
