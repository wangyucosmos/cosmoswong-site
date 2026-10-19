// /api/english/progress 英语从零学的学习进度（2026-10-19，工具箱口令门保护，凭证 tools_session）。
// 只有一份进度（站长自己用），存 KV（binding SUBS，key en:progress），不进仓库。
//   GET  → { data, version }；还没存过时 data 为 null、version 为 0
//   PUT  { base, data } → base 必须等于当前 version，否则 409 并带回最新的 { data, version }，
//        由页面合并后重试。合并规则在浏览器里（public/assets/english/app.js 的 mergeDoc）。
import { json } from '../shared.js';
import { toolsAuthed } from '../tools-gate.js';

const KEY = 'en:progress';
const MAX_BYTES = 2 * 1024 * 1024;

async function read(env) {
  const raw = await env.SUBS.get(KEY);
  if (!raw) return { data: null, version: 0 };
  try { const o = JSON.parse(raw); return { data: o.data ?? null, version: Number(o.version) || 0 }; }
  catch { return { data: null, version: 0 }; }
}

export async function englishApi(req, env, path) {
  if (path !== '/api/english/progress') return json({ error: '没有这个接口' }, 404);
  if (!(await toolsAuthed(req, env))) return json({ error: '需要口令' }, 401);
  const noStore = { 'cache-control': 'private, no-store' };
  if (req.method === 'GET') return json(await read(env), 200, noStore);
  if (req.method !== 'PUT') return json({ error: '不支持的请求' }, 405);
  const url = new URL(req.url), origin = req.headers.get('origin');
  if ((origin && origin !== url.origin) || req.headers.get('x-tools-request') !== '1') return json({ error: '请求来源不对' }, 403);
  const text = await req.text();
  if (text.length > MAX_BYTES) return json({ error: '进度数据太大' }, 413);
  let body;
  try { body = JSON.parse(text); } catch { return json({ error: '数据格式不对' }, 400); }
  const data = body?.data;
  if (!data || typeof data !== 'object' || Array.isArray(data) || typeof data.cards !== 'object') return json({ error: '数据格式不对' }, 400);
  const cur = await read(env);
  if (Number(body.base) !== cur.version) return json({ error: '别的设备刚更新过', ...cur }, 409, noStore);
  const version = cur.version + 1;
  await env.SUBS.put(KEY, JSON.stringify({ version, data, updatedAt: new Date().toISOString() }));
  return json({ version }, 200, noStore);
}
