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
  if (d.layout === 'workspace-v2') {
    const p=d.workspace, idRE=/^[a-zA-Z][a-zA-Z0-9_-]*$/;
    if(!isObj(p)||!isObj(p.data)||!isObj(p.view)||!Array.isArray(p.template))return ['工作区载荷缺少 data/view/template'];
    const v=p.view, data=p.data;
    for(const k of ['tools','workspaces','scenarios','commands','topics','issues','repos'])if(!Array.isArray(data[k]))errs.push('工作区数据缺少数组：'+k);
    if(!/^\d{4}-\d{2}-\d{2}$/.test(p.snapshot||''))errs.push('工作区快照日期格式不对');
    const list=Array.isArray(v.nodes)?v.nodes:[], ids=list.map(n=>n.id);
    if(!ids.length||ids.some(id=>!idRE.test(id))||new Set(ids).size!==ids.length)errs.push('工作区节点 ID 缺失、重复或格式不对');
    for(const n of list){
      if(!['x','y','w','h'].every(k=>Number.isFinite(n[k]))||n.w<=0||n.h<=0)errs.push('工作区节点坐标或尺寸不对');
      if(n.tool!==undefined&&(!Number.isInteger(n.tool)||!data.tools?.[n.tool]))errs.push('工作区工具节点引用不存在');
    }
    for(const id of ['you','local','cloud','global','project','native','knowledge','github'])if(!ids.includes(id)||!isObj(v.resources?.[id]))errs.push('缺少工作区资源节点或说明：'+id);
    for(const k of ['toolIds','tokens','toolRead','toolWrite'])if(!Array.isArray(v[k])||v[k].length!==data.tools?.length)errs.push('工具索引长度不一致：'+k);
    for(const id of v.toolIds||[])if(!ids.includes(id))errs.push('工具索引指向不存在的节点');
    if(!Array.isArray(v.layers)||!v.layers.length||typeof p.sourcesHTML!=='string')errs.push('工作区缺少分层与来源信息');
    for(const topic of Array.isArray(data.topics)?data.topics:[])if(topic.date!==null&&!/^\d{4}-\d{2}-\d{2}$/.test(topic.date||''))errs.push('工作区进度日期格式不对');
    const required=['tool-picker','map-nodes','map-edges','map-context','layer-labels','map-caption','map-tip','mobile-map','inspector','view-map','view-progress','view-routing','tab-map','tab-progress','tab-routing','board','board-status','board-summary','filters','search','scenario-menu','scenario-result','commands-grid','audit-dialog','audit-tabs','audit-title','audit-body','close-audit','toast'];
    const templateIDs=[];
    function walk(items){for(const n of items){if(typeof n==='string')continue;if(!isObj(n)||typeof n.tag!=='string'||!Array.isArray(n.children)){errs.push('模板节点结构不对');continue;}if(n.attrs?.id)templateIDs.push(n.attrs.id);if(['script','iframe','object','embed','style','link','img'].includes(n.tag))errs.push('模板包含禁止元素');if(Object.keys(n.attrs||{}).some(k=>/^on/i.test(k)||k==='style'))errs.push('模板包含内联事件或样式');walk(n.children);}}
    walk(p.template);
    if(new Set(templateIDs).size!==templateIDs.length)errs.push('模板包含重复 ID');
    for(const id of required)if(!templateIDs.includes(id))errs.push('模板缺少必要节点：'+id);
  }

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
