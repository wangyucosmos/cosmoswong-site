// /desk 的密码门。照 /kol（src/kol/auth.js）同一套做法，但密码、cookie、限流记录、请求头全部分开：
//   - 初始密码：Worker secret DESK_PASSWORD（不进仓库）
//   - 在页面「设置 → 改密码」改过之后：新密码以 PBKDF2 加盐哈希存在 D1 desk_meta（key = password_hash），登录优先认它；
//     忘了新密码：删掉 D1 里这一行就回到 secret 里的初始密码（命令见 AGENTS.md）
//   - 会话 cookie：desk_session = <过期时间>.<HMAC 签名>，只发给 /api/desk，HttpOnly + Secure + SameSite=Strict，30 天
//   - 签名 key = D1 里首次登录时随机生成的 key + 当前密码（哈希或 secret）→ 改密码后旧登录全部失效
//   - 同一 IP 15 分钟内输错 10 次锁定（记录在 D1 login_fails 表；登录和改密码共用）
// 没有改动 /kol 的文件：共用的只有 src/shared.js 里的小工具。
import { json, safeEq, hmac, b64url } from '../shared.js';

const COOKIE = 'desk_session';
const SESSION_DAYS = 30;
const MAX_FAILS = 10;
const FAIL_WINDOW = 900;
const PBKDF2_ITER = 30000;   // Workers 免费版每次请求 CPU 上限 10ms；这个次数本机实测约 4ms（同 /kol）
const enc = new TextEncoder();

// 一次读出会话签名 key 和（如果改过密码）密码哈希；签名 key 不存在就生成
async function meta(env) {
  const db = env.DESK_DB;
  const read = async () => Object.fromEntries((await db.prepare("SELECT key, value FROM desk_meta WHERE key IN ('cookie_key', 'password_hash')").all()).results.map(r => [r.key, r.value]));
  let m = await read();
  if (!m.cookie_key) {
    await db.prepare("INSERT OR IGNORE INTO desk_meta (key, value) VALUES ('cookie_key', ?)").bind(b64url(crypto.getRandomValues(new Uint8Array(32)))).run();
    m = await read();
  }
  return m;
}
const sign = (env, m, msg) => hmac(m.cookie_key + '\u0000' + (m.password_hash || env.DESK_PASSWORD), msg);

async function pbkdf2(password, salt, iterations) {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  return b64url(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256));
}
const fromB64url = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
// 存储格式：pbkdf2 / sha256 / 次数 / 盐 / 哈希，用 $ 连接（以后要加次数，旧哈希照样能验）
const SEP = '$';
async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return ['pbkdf2', 'sha256', PBKDF2_ITER, b64url(salt), await pbkdf2(password, salt, PBKDF2_ITER)].join(SEP);
}
async function checkPassword(env, m, password) {
  if (!password) return false;
  if (!m.password_hash) return safeEq(password, env.DESK_PASSWORD);
  const [, , iter, salt, hash] = m.password_hash.split(SEP);
  return safeEq(await pbkdf2(password, fromB64url(salt), Number(iter)), hash);
}

const cookie = (value, maxAge) =>
  `${COOKIE}=${value}; Path=/api/desk; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`;
const newSession = async (env, m) => {
  const exp = Math.floor(Date.now() / 1000) + SESSION_DAYS * 86400;
  return cookie(`${exp}.${await sign(env, m, 'desk:' + exp)}`, SESSION_DAYS * 86400);
};

export async function isAuthed(req, env) {
  const c = (req.headers.get('cookie') || '').match(new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`));
  if (!c) return false;
  const [exp, sig] = c[1].split('.');
  if (!exp || !sig || !/^\d+$/.test(exp) || Number(exp) < Date.now() / 1000) return false;
  return safeEq(sig, await sign(env, await meta(env), 'desk:' + exp));
}

/* ---------- 输错限流（登录和改密码共用）：同一 IP 15 分钟 10 次 ---------- */
async function gate(db, ip) {
  const now = Math.floor(Date.now() / 1000);
  const rec = await db.prepare('SELECT count, window_start FROM login_fails WHERE ip = ?').bind(ip).first();
  const fresh = !rec || now - rec.window_start > FAIL_WINDOW;
  const locked = !fresh && rec.count >= MAX_FAILS;
  return { now, rec, fresh, locked, wait: locked ? Math.ceil((rec.window_start + FAIL_WINDOW - now) / 60) : 0 };
}
async function recordFail(db, ip, g) {
  if (g.fresh) await db.prepare('INSERT OR REPLACE INTO login_fails (ip, count, window_start) VALUES (?, 1, ?)').bind(ip, g.now).run();
  else await db.prepare('UPDATE login_fails SET count = count + 1 WHERE ip = ?').bind(ip).run();
  return MAX_FAILS - (g.fresh ? 1 : g.rec.count + 1);
}

export async function login(req, env) {
  const ip = req.headers.get('cf-connecting-ip') || 'unknown';
  const db = env.DESK_DB;
  const g = await gate(db, ip);
  if (g.locked) return json({ error: `输错次数太多，已锁定，请 ${g.wait} 分钟后再试` }, 429);

  let password = '';
  try { password = String((await req.json()).password || ''); } catch { /* 空密码按输错处理 */ }
  const m = await meta(env);
  if (!(await checkPassword(env, m, password))) {
    const left = await recordFail(db, ip, g);
    return json({ error: left > 0 ? `密码不对，还能再试 ${left} 次` : '密码不对，已锁定 15 分钟' }, 401);
  }
  await db.prepare('DELETE FROM login_fails WHERE ip = ? OR window_start < ?').bind(ip, g.now - FAIL_WINDOW).run();
  return json({ ok: true }, 200, { 'set-cookie': await newSession(env, m) });
}

// 改密码：必须已登录 + 原密码正确（输错同样计入 10 次锁定）。改完旧登录全部失效，当前这台设备发新 cookie 保持登录。
// 错误一律用 400 / 429（不用 401，免得页面以为登录过期）
export async function changePassword(req, env) {
  const ip = req.headers.get('cf-connecting-ip') || 'unknown';
  const db = env.DESK_DB;
  const g = await gate(db, ip);
  if (g.locked) return json({ error: `输错次数太多，已锁定，请 ${g.wait} 分钟后再试` }, 429);
  let body = {};
  try { body = await req.json(); } catch { /* 按空处理 */ }
  const oldPw = String(body.old || ''), newPw = String(body.new || '');
  const m = await meta(env);
  if (!(await checkPassword(env, m, oldPw))) {
    const left = await recordFail(db, ip, g);
    return json({ error: left > 0 ? `原密码不对，还能再试 ${left} 次` : '原密码不对，已锁定 15 分钟' }, 400);
  }
  if (newPw.length < 8) return json({ error: '新密码至少 8 位' }, 400);
  if (newPw.length > 128) return json({ error: '新密码太长了（最多 128 位）' }, 400);
  if (newPw === oldPw) return json({ error: '新密码和原密码一样' }, 400);
  const hash = await hashPassword(newPw);
  await db.prepare("INSERT OR REPLACE INTO desk_meta (key, value) VALUES ('password_hash', ?)").bind(hash).run();
  await db.prepare('DELETE FROM login_fails WHERE ip = ?').bind(ip).run();
  return json({ ok: true }, 200, { 'set-cookie': await newSession(env, { ...m, password_hash: hash }) });
}

export const logout = () => json({ ok: true }, 200, { 'set-cookie': cookie('', 0) });

// 写操作防 CSRF：必须带自定义头（跨站表单和简单请求带不上），有 Origin 时还必须同源
export function csrfOk(req) {
  if (req.method === 'GET' || req.method === 'HEAD') return true;
  if (req.headers.get('x-desk-request') !== '1') return false;
  const origin = req.headers.get('origin');
  return !origin || origin === new URL(req.url).origin;
}
