// /kol 的密码门。和 /subs 同一套做法，但密码、cookie、限流记录都分开：
//   - 密码：Worker secret KOL_PASSWORD（不进仓库）
//   - 会话 cookie：kol_session = <过期时间>.<HMAC 签名>，只发给 /api/kol，HttpOnly + Secure + SameSite=Strict，30 天
//   - 签名 key = D1 里首次登录时随机生成的 key + 密码本身 → 换密码后旧登录全部失效
//   - 同一 IP 15 分钟内输错 10 次锁定（记录在 D1 login_fails 表）
import { json, safeEq, hmac, b64url } from '../shared.js';

const COOKIE = 'kol_session';
const SESSION_DAYS = 30;
const MAX_FAILS = 10;
const FAIL_WINDOW = 900;

async function cookieKey(env) {
  const row = await env.KOL_DB.prepare("SELECT value FROM kol_meta WHERE key = 'cookie_key'").first();
  if (row) return row.value;
  const fresh = b64url(crypto.getRandomValues(new Uint8Array(32)));
  await env.KOL_DB.prepare("INSERT OR IGNORE INTO kol_meta (key, value) VALUES ('cookie_key', ?)").bind(fresh).run();
  return (await env.KOL_DB.prepare("SELECT value FROM kol_meta WHERE key = 'cookie_key'").first()).value;
}
const sign = async (env, msg) => hmac((await cookieKey(env)) + '\u0000' + env.KOL_PASSWORD, msg);

export async function isAuthed(req, env) {
  const m = (req.headers.get('cookie') || '').match(new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`));
  if (!m) return false;
  const [exp, sig] = m[1].split('.');
  if (!exp || !sig || !/^\d+$/.test(exp) || Number(exp) < Date.now() / 1000) return false;
  return safeEq(sig, await sign(env, 'kol:' + exp));
}

const cookie = (value, maxAge) =>
  `${COOKIE}=${value}; Path=/api/kol; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`;

export async function login(req, env) {
  const ip = req.headers.get('cf-connecting-ip') || 'unknown';
  const now = Math.floor(Date.now() / 1000);
  const db = env.KOL_DB;
  const rec = await db.prepare('SELECT count, window_start FROM login_fails WHERE ip = ?').bind(ip).first();
  const fresh = !rec || now - rec.window_start > FAIL_WINDOW;
  if (!fresh && rec.count >= MAX_FAILS) {
    const wait = Math.ceil((rec.window_start + FAIL_WINDOW - now) / 60);
    return json({ error: `输错次数太多，已锁定，请 ${wait} 分钟后再试` }, 429);
  }

  let password = '';
  try { password = String((await req.json()).password || ''); } catch { /* 空密码按输错处理 */ }
  if (!password || !(await safeEq(password, env.KOL_PASSWORD))) {
    if (fresh) await db.prepare('INSERT OR REPLACE INTO login_fails (ip, count, window_start) VALUES (?, 1, ?)').bind(ip, now).run();
    else await db.prepare('UPDATE login_fails SET count = count + 1 WHERE ip = ?').bind(ip).run();
    const left = MAX_FAILS - (fresh ? 1 : rec.count + 1);
    return json({ error: left > 0 ? `密码不对，还能再试 ${left} 次` : '密码不对，已锁定 15 分钟' }, 401);
  }
  await db.prepare('DELETE FROM login_fails WHERE ip = ? OR window_start < ?').bind(ip, now - FAIL_WINDOW).run();
  const exp = now + SESSION_DAYS * 86400;
  return json({ ok: true }, 200, { 'set-cookie': cookie(`${exp}.${await sign(env, 'kol:' + exp)}`, SESSION_DAYS * 86400) });
}

export const logout = () => json({ ok: true }, 200, { 'set-cookie': cookie('', 0) });

// 写操作防 CSRF：必须带自定义头（跨站表单和简单请求带不上），有 Origin 时还必须同源
export function csrfOk(req) {
  if (req.method === 'GET' || req.method === 'HEAD') return true;
  if (req.headers.get('x-kol-request') !== '1') return false;
  const origin = req.headers.get('origin');
  return !origin || origin === new URL(req.url).origin;
}
