// 工具箱口令门（2026-10-12 用户要求）：工具箱里的工具，别人能看到卡片，点进去要先输口令。
//   - 工具箱卡片统一链到 /go/<id>：有口令凭证 → 302 跳到真实地址；没有 → 跳 /unlock?next=<id> 输口令。
//     真实地址只写在下面的 TARGETS 里（服务端），不出现在公开页面。
//   - /marquee 本身也挡：直接输网址没有凭证同样进不去。
//   - /attendance 补时计算器例外：同事用直链，不要口令（只有从工具箱点进去才经过口令门）。
//   - 口令是 Worker secret TOOLS_PASSWORD，凭证签名 key 是 TOOLS_COOKIE_KEY，都不进仓库（仓库是公开的）。
//     设置 / 换口令：HTTPS_PROXY=http://127.0.0.1:7897 npx wrangler@4 secret put TOOLS_PASSWORD（旧凭证随之全部失效）
//   - 输对一次，这台设备 365 天免输；同一 IP 15 分钟输错 10 次锁定（计数复用 SUBS 这个 KV，key 前缀 tools-rl:）。
import { json, safeEq, hmac } from './shared.js';

export const TARGETS = {
  attendance: '/attendance',
  'cosmos-os': 'https://github.com/wangyucosmos/Cosmos-Toolbox',
  travel: 'https://indonesia.cosmoswong.com',
  'h5-editor': 'https://h5.cosmoswong.com/editor/',
  marquee: '/marquee'
};

const COOKIE = 'tools_session';
const SESSION_DAYS = 365;
const MAX_FAILS = 10;
const FAIL_WINDOW = 900;

const sign = (env, msg) => hmac(env.TOOLS_COOKIE_KEY + '\u0000' + env.TOOLS_PASSWORD, msg);
const ready = env => !!(env.TOOLS_PASSWORD && env.TOOLS_COOKIE_KEY);

export async function toolsAuthed(req, env) {
  if (!ready(env)) return false;
  const m = (req.headers.get('cookie') || '').match(new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`));
  if (!m) return false;
  const [exp, sig] = m[1].split('.');
  if (!exp || !sig || !(Number(exp) > Date.now() / 1000)) return false;
  return safeEq(sig, await sign(env, 'tools:' + exp));
}

const cookie = (value, maxAge) =>
  `${COOKIE}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;

const redirect = (to, extra = {}) => new Response(null, {
  status: 302,
  headers: { location: to, 'cache-control': 'no-store', 'x-robots-tag': 'noindex', ...extra }
});

const unlockUrl = id => '/unlock?next=' + encodeURIComponent(id);

// POST /api/tools/login {password}
async function login(req, env) {
  const url = new URL(req.url);
  const origin = req.headers.get('origin');
  if ((origin && origin !== url.origin) || req.headers.get('x-tools-request') !== '1') return json({ error: '请求来源不对' }, 403);
  const ip = req.headers.get('cf-connecting-ip') || 'unknown';
  const rlKey = 'tools-rl:' + ip;
  const fails = Number(await env.SUBS.get(rlKey)) || 0;
  if (fails >= MAX_FAILS) return json({ error: '输错次数太多，请 15 分钟后再试' }, 429);
  let password = '';
  try { password = String((await req.json()).password || ''); } catch { /* 空口令按输错处理 */ }
  if (!password || !(await safeEq(password, env.TOOLS_PASSWORD))) {
    await env.SUBS.put(rlKey, String(fails + 1), { expirationTtl: FAIL_WINDOW });
    return json({ error: '口令不对' }, 401);
  }
  await env.SUBS.delete(rlKey);
  const exp = Math.floor(Date.now() / 1000) + SESSION_DAYS * 86400;
  return json({ ok: true }, 200, { 'set-cookie': cookie(`${exp}.${await sign(env, 'tools:' + exp)}`, SESSION_DAYS * 86400) });
}

// 返回 Response 表示已处理；返回 null 表示不归这里管
export async function toolsGate(req, env, path) {
  if (path === '/api/tools/login') {
    if (!ready(env)) return json({ error: '服务端还没设置口令' }, 500);
    return req.method === 'POST' ? login(req, env) : json({ error: '不支持的请求' }, 405);
  }
  if (path === '/go' || path.startsWith('/go/')) {
    let id = '';
    try { id = decodeURIComponent(path.slice(4)); } catch { /* 乱码地址当作不存在 */ }
    if (!Object.hasOwn(TARGETS, id)) return redirect('/tools');
    return (await toolsAuthed(req, env)) ? redirect(TARGETS[id]) : redirect(unlockUrl(id));
  }
  if (path === '/marquee' || path === '/marquee.html' || path.startsWith('/assets/marquee/')) {
    if (await toolsAuthed(req, env)) return null;   // 放行，交给静态资源
    if (path.startsWith('/assets/')) return json({ error: '需要口令' }, 401);
    return redirect(unlockUrl('marquee'));
  }
  return null;
}
