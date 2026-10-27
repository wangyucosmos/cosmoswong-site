// /api/toolmap 工具地图的数据接口（工具箱口令门保护，凭证 tools_session）。
// 数据存在 KV（binding SUBS，前缀 tm:），不进仓库（仓库是公开的）：
//   tm:claude   Claude 版地图内容
//   tm:codex    Codex 版地图内容
// 网页只读；内容只用本机脚本写：node tools/toolmap_upload.mjs <claude|codex> <JSON 路径> [--local]
import { json } from '../shared.js';
import { toolsAuthed } from '../tools-gate.js';

export const VERSIONS = ['claude', 'codex'];

export async function toolmapApi(req, env, path) {
  if (!(await toolsAuthed(req, env))) return json({ error: '需要口令' }, 401);
  if (path !== '/api/toolmap') return json({ error: '没有这个接口' }, 404);
  if (req.method !== 'GET') return json({ error: '不支持的请求' }, 405);
  const v = new URL(req.url).searchParams.get('v') || 'claude';
  if (!VERSIONS.includes(v)) return json({ error: '没有这个版本' }, 400);
  const raw = await env.SUBS.get('tm:' + v);
  if (!raw) return json({ empty: true }, 200, { 'x-robots-tag': 'noindex' });
  try { JSON.parse(raw); } catch { return json({ error: '内容格式坏了，请重新上传' }, 500); }
  return new Response(raw, { headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'private, no-store', 'x-robots-tag': 'noindex' } });
}
