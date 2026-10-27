// 所有请求先经过共用口令门检查；公开静态页面原样交给ASSETS，/api/*交给各应用接口。
// 另有工具箱口令门（src/tools-gate.js：/api/tools/login、/go/*、/marquee）。
// 三个功能：/subs 订阅倒计时页、/kol KOL 工作台（路由在 src/kol/，数据在 D1）、/desk 我的工作台（路由在 src/desk/，数据在另一个 D1）。
// 下面是 /subs 的部分：
//   - 密码存在 Worker secret SUBS_PASSWORD，登录 cookie 用 SUBS_COOKIE_KEY 签名；两个都不进仓库
//   - 订阅数据存在 KV（binding SUBS，key "list"），不进仓库——仓库是公开的
//   - 换密码：printf '%s' '新密码' | npx wrangler secret put SUBS_PASSWORD（旧登录会随之全部失效）

import { json, safeEq, hmac } from './shared.js';
import { kolApi } from './kol/api.js';
import { deskApi } from './desk/api.js';
import { api as attendanceApi } from './attendance/api.mjs';
import { secure as attendanceSecure } from './attendance/security.mjs';
import { toolsGate } from './tools-gate.js';
import { mailInsightApi } from './mail-insight/api.js';
import { englishApi } from './english/api.js';
import { toolmapApi } from './toolmap/api.js';
import { protectedPath } from '../public/assets/tools-next.mjs';

const COOKIE = 'subs_session';
const SESSION_DAYS = 30;
const MAX_FAILS = 10;          // 同一 IP 15 分钟内最多输错 10 次
const FAIL_WINDOW = 900;
const MAX_BYTES = 64 * 1024;   // 订阅清单上限，防止误写入大文件

// 签名 key 里混入密码本身：换密码后旧 cookie 自动作废
const sign = (env, msg) => hmac(env.SUBS_COOKIE_KEY + '\u0000' + env.SUBS_PASSWORD, msg);

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
    const rawPath = new URL(req.url).pathname;
    let decodedPath;
    try { decodedPath = rawPath.startsWith('/go/') ? rawPath : decodeURIComponent(rawPath); } catch { return json({ error: '地址不正确' }, 400); }
    if (/[\\\u0000-\u001f\u007f]/.test(decodedPath)) return json({ error: '地址不正确' }, 400);
    if (!rawPath.startsWith('/go/') && decodedPath.includes('%')) return json({ error: '地址不正确' }, 400);
    const path = decodedPath.replace(/\/+/g, '/').replace(/\/+$/, '');
    if (path === '/api/attendance' || path.startsWith('/api/attendance/')) {
      if (new URL(req.url).protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(new URL(req.url).hostname)) return Response.redirect(req.url.replace(/^http:/, 'https:'), 308);
      return attendanceSecure(await attendanceApi(req, env.ATTENDANCE_DB));
    }
    if (path === '/api/subs' || path.startsWith('/api/subs/')) return subsApi(req, env, path);
    if (path === '/api/kol' || path.startsWith('/api/kol/')) return kolApi(req, env, path);
    if (path === '/api/desk' || path.startsWith('/api/desk/')) return deskApi(req, env, path);
    if (path === '/api/mail-insight' || path.startsWith('/api/mail-insight/')) return mailInsightApi(req, env, path);   // 邮件名单透视（工具箱口令）
    if (path === '/api/english' || path.startsWith('/api/english/')) return englishApi(req, env, path);   // 英语从零学的学习进度（工具箱口令）
    if (path === '/api/toolmap' || path.startsWith('/api/toolmap/')) return toolmapApi(req, env, path);   // 工具地图内容（工具箱口令）
    const gated = await toolsGate(req, env, path);   // 工具箱口令门：/api/tools/login、/go/*、/marquee（见 src/tools-gate.js）
    if (gated) return gated;
    if (path.startsWith('/api/')) return json({ error: '没有这个接口' }, 404);
    const response = await env.ASSETS.fetch(req);
    if (!protectedPath(path)) return response;
    const headers = new Headers(response.headers);
    headers.set('Cache-Control', 'private, no-store');
    headers.set('X-Robots-Tag', 'noindex, nofollow');
    headers.append('Vary', 'Cookie');
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  }
};
