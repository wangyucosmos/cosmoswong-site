// /api/mail-insight/* 邮件名单透视的数据接口（工具箱口令门保护，凭证 tools_session）。
// 数据存在 KV（binding SUBS，前缀 mi:），不进仓库：
//   mi:playbook        分析手册（人群规则、写法建议、主题行、行动计划）。只用 wrangler 写，网页只读
//   mi:index           期数清单 [{ id, label, createdAt, source, summary }]，新的在前
//   mi:snap:<id>       每一期的汇总数字 { id, label, createdAt, source, data, insights? }
// 网页能做：读手册和期数、读某一期、上传新一期（浏览器里算好的汇总数字）、删除某一期。
import { json } from '../shared.js';
import { toolsAuthed } from '../tools-gate.js';
import { summarize, scrub } from '../../public/assets/mail-insight/engine.mjs';

const MAX_BYTES = 256 * 1024;
const MAX_SNAPS = 120;
const ID = /^[0-9]{8}-[0-9]{6}-[a-z0-9]{4}$/;

const readJSON = async (env, key, fallback) => {
  const raw = await env.SUBS.get(key);
  if (!raw) return fallback;
  try { return JSON.parse(raw); } catch { return fallback; }
};

// 递归清洗：字符串里的邮箱一律抹掉，限制深度和长度
function clean(v, depth = 0) {
  if (depth > 6) return null;
  if (typeof v === 'string') return scrub(v).slice(0, 500);
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  if (typeof v === 'boolean' || v === null) return v;
  if (Array.isArray(v)) return v.slice(0, 200).map(x => clean(x, depth + 1));
  if (typeof v === 'object') {
    const o = {};
    for (const [k, x] of Object.entries(v).slice(0, 200)) o[scrub(k).slice(0, 120)] = clean(x, depth + 1);
    return o;
  }
  return null;
}

const newId = () => {
  const d = new Date(), p = n => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}-${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}-${crypto.randomUUID().slice(0, 4)}`;
};

export async function mailInsightApi(req, env, path) {
  if (!(await toolsAuthed(req, env))) return json({ error: '需要口令' }, 401);
  const url = new URL(req.url);
  if (req.method !== 'GET') {
    const origin = req.headers.get('origin');
    if ((origin && origin !== url.origin) || req.headers.get('x-tools-request') !== '1') return json({ error: '请求来源不对' }, 403);
  }

  if (path === '/api/mail-insight' && req.method === 'GET') {
    return json({ playbook: await readJSON(env, 'mi:playbook', null), snapshots: await readJSON(env, 'mi:index', []) });
  }

  if (path === '/api/mail-insight/snap' && req.method === 'POST') {
    const text = await req.text();
    if (text.length > MAX_BYTES) return json({ error: '数据太大' }, 413);
    let body;
    try { body = JSON.parse(text); } catch { return json({ error: '数据格式不对' }, 400); }
    const data = clean(body?.data);
    if (!data || typeof data !== 'object' || !data.n || !(Number(data.n.sub) > 0)) return json({ error: '没有在订名单的数据' }, 400);
    const id = newId();
    const snap = {
      id, label: scrub(String(body.label || '').trim()).slice(0, 60) || id.slice(0, 8),
      createdAt: new Date().toISOString(), source: '网页上传', data
    };
    const index = (await readJSON(env, 'mi:index', [])).filter(x => x && x.id);
    if (index.length >= MAX_SNAPS) return json({ error: `最多保存 ${MAX_SNAPS} 期，请先删掉旧的` }, 409);
    await env.SUBS.put('mi:snap:' + id, JSON.stringify(snap));
    index.unshift({ id, label: snap.label, createdAt: snap.createdAt, source: snap.source, summary: summarize(data) });
    await env.SUBS.put('mi:index', JSON.stringify(index));
    return json({ ok: true, snapshot: index[0] });
  }

  const m = path.match(/^\/api\/mail-insight\/snap\/([^/]+)$/);
  if (m && ID.test(m[1])) {
    const key = 'mi:snap:' + m[1];
    if (req.method === 'GET') {
      const snap = await readJSON(env, key, null);
      return snap ? json(snap) : json({ error: '没有这一期' }, 404);
    }
    if (req.method === 'DELETE') {
      const index = await readJSON(env, 'mi:index', []);
      await env.SUBS.delete(key);
      await env.SUBS.put('mi:index', JSON.stringify(index.filter(x => x && x.id !== m[1])));
      return json({ ok: true });
    }
  }
  return json({ error: '没有这个接口' }, 404);
}
