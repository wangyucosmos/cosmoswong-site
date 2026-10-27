// 上传工具地图内容到 KV（不用重新部署）。内容 JSON 放在仓库外，绝不提交进本仓库。
//   线上：HTTPS_PROXY=http://127.0.0.1:7897 node tools/toolmap_upload.mjs claude <JSON 路径>
//   本地：node tools/toolmap_upload.mjs claude <JSON 路径> --local   （给 wrangler dev 用）
//   只检查不上传：加 --check
// 写进 KV binding SUBS 的 tm:<版本>，页面经 /api/toolmap?v=<版本> 读取。
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const VERSIONS = ['claude', 'codex'];
const MAX_BYTES = 512 * 1024;
const NODE_COLORS = ['you', 'ai', 'ws', 'mem', 'kb', 'gh'];

export function validate(d) {
  const errs = [];
  const isObj = x => x && typeof x === 'object' && !Array.isArray(x);
  if (!isObj(d)) return ['顶层必须是对象'];
  if (typeof d.title !== 'string' || !d.title) errs.push('缺 title');
  const m = d.map;
  if (m !== undefined) {
    if (!Array.isArray(m.rows) || !m.rows.length) errs.push('map.rows 必须是非空数组');
    const nodes = isObj(m.nodes) ? m.nodes : (errs.push('map.nodes 必须是对象'), {});
    const has = id => Object.hasOwn(nodes, id);
    for (const [id, n] of Object.entries(nodes)) {
      if (!Number.isInteger(n.r) || !m.rows?.[n.r]) errs.push(`节点 ${id} 的层号 r 不对`);
      if (!Number.isFinite(n.x)) errs.push(`节点 ${id} 缺 x`);
      if (!NODE_COLORS.includes(n.c)) errs.push(`节点 ${id} 的类型 c 只能是 ${NODE_COLORS.join('/')}`);
    }
    (m.edges || []).forEach((e, i) => { if (!Array.isArray(e) || !has(e[0]) || !has(e[1])) errs.push(`连线 #${i} 指向不存在的节点：${JSON.stringify(e)}`); });
    for (const id of Object.keys(m.info || {})) if (!has(id)) errs.push(`info 里的 ${id} 不是节点`);
    (m.flows || []).forEach(f => (f.steps || []).forEach((st, i) => {
      for (const id of st.n || []) if (!has(id)) errs.push(`流程「${f.name}」第 ${i + 1} 步用到不存在的节点 ${id}`);
      for (const e of st.e || []) if (!has(e[0]) || !has(e[1])) errs.push(`流程「${f.name}」第 ${i + 1} 步的连线 ${JSON.stringify(e)} 指向不存在的节点`);
    }));
  }
  for (const it of d.board?.items || []) if (!/^\d{4}-\d{2}-\d{2}$/.test(it.d || '')) errs.push(`进度「${it.t}」的日期 d 要写成 YYYY-MM-DD`);
  return errs;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const [version, file] = args.filter(a => !a.startsWith('--'));
  if (!VERSIONS.includes(version) || !file) {
    console.error('用法：node tools/toolmap_upload.mjs <claude|codex> <JSON 路径> [--local] [--check]');
    process.exit(1);
  }
  let data;
  try { data = JSON.parse(readFileSync(file, 'utf8')); } catch (e) { console.error('读不了 JSON：' + e.message); process.exit(1); }
  const errs = validate(data);
  if (errs.length) { console.error('内容有问题，没有上传：\n- ' + errs.join('\n- ')); process.exit(1); }
  const body = JSON.stringify(data);
  if (Buffer.byteLength(body) > MAX_BYTES) { console.error('内容超过 512KB，没有上传'); process.exit(1); }
  if (args.includes('--check')) { console.log('检查通过（没有上传）'); process.exit(0); }
  const tmp = mkdtempSync(join(tmpdir(), 'toolmap-'));
  const out = join(tmp, 'data.json');
  writeFileSync(out, body);
  try {
    execFileSync('npx', ['--yes', 'wrangler@4.131.0', 'kv', 'key', 'put', 'tm:' + version, '--path', out, '--binding', 'SUBS', args.includes('--local') ? '--local' : '--remote'], { cwd: ROOT, stdio: 'inherit' });
  } finally { rmSync(tmp, { recursive: true, force: true }); }
  console.log(`已上传 ${version} 版到 ${args.includes('--local') ? '本地' : '线上'} KV（tm:${version}）`);
}
