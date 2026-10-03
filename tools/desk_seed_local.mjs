// 给 /desk 的【本地】开发库灌演示数据，只用于本地测试。
// 内容全部是虚构的（「示例省份 A」「示例月度活动」、example.com 链接），不是任何真实项目、省份或文件。
// 用法：node tools/desk_seed_local.mjs        —— 会先清空本地库里的工作台数据，再写入演示数据（需要先跑过 migrations/desk 里的全部迁移）
// ⚠️ 只写 --local，脚本里没有、也不要加 --remote：线上库只跑迁移，不灌演示数据。
import { writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const now = new Date().toISOString();
// 「今天」按 Asia/Shanghai 算（和页面一致）
const TODAY = new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10);
const U = s => { const [y, m, d] = s.split('-').map(Number); return Date.UTC(y, m - 1, d); };
const add = (s, n) => new Date(U(s) + n * 864e5).toISOString().slice(0, 10);
const day = n => add(TODAY, n);
const toWeekday = s => { const w = new Date(U(s)).getUTCDay(); return w === 6 ? add(s, -1) : w === 0 ? add(s, -2) : s; };
const node = (T, off) => { const d = add(T, off); return off !== 0 ? toWeekday(d) : d; };   // 和服务端同一算法：遇到周末提前到周五，上线日本身不挪
const isoWeek = s => {
  const d = new Date(U(s)); d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7) + 3);
  const y = d.getUTCFullYear(), jan4 = new Date(Date.UTC(y, 0, 4));
  return `${y}-W${String(1 + Math.round(((d - jan4) / 864e5 - 3 + ((jan4.getUTCDay() + 6) % 7)) / 7)).padStart(2, '0')}`;
};
const q = v => v == null ? 'NULL' : typeof v === 'number' ? String(v) : `'${String(v).replace(/'/g, "''")}'`;
const J = v => v == null ? null : JSON.stringify(v);
const sql = [];
const ins = (table, row) => sql.push(`INSERT INTO ${table} (${Object.keys(row).join(',')}) VALUES (${Object.values(row).map(q).join(',')});`);
const T = { created_at: now, updated_at: now };

for (const t of ['activities', 'decisions', 'deliverables', 'tasks', 'pendings', 'wins', 'ideas', 'inbox', 'projects', 'timelines', 'checklists', 'prompt_templates', 'links', 'saved_views', 'settings']) sql.push(`DELETE FROM ${t};`);
sql.push(`DELETE FROM sqlite_sequence;`);

/* ---------- 设置与模板（虚构） ---------- */
ins('settings', { key: 'provinces', value: J(['示例省份 A', '示例省份 B', '示例省份 C']), updated_at: now });
ins('settings', { key: 'baselines', value: J({ 客服文档: 240, 活动规则: 120 }), updated_at: now });
// 时间表：三种节点（我要做的 / 要交的 / 等别人给）
const TL = [
  { offset_days: -15, title: '开工：理需求、列待确认', kind: 'task', is_milestone: true },
  { offset_days: -15, title: '思路方案', kind: 'deliverable', deliverable_type: '思路方案', deliverable_name: '示例思路方案' },
  { offset_days: -12, title: '互动组件能不能实现', kind: 'wait', ask_whom: '开发', remind_offset: -15, blocking: true },
  { offset_days: -9, title: '原型', kind: 'deliverable', deliverable_type: '原型', deliverable_name: '示例主页面原型' },
  { offset_days: -9, title: '领导确认原型', kind: 'wait', ask_whom: '领导', remind_offset: -10, blocking: true },
  { offset_days: -6, title: '奖品清单', kind: 'wait', ask_whom: '业务方', remind_offset: -12, blocking: true },
  { offset_days: -6, title: '客服文档', kind: 'deliverable', deliverable_type: '客服文档' },
  { offset_days: -4, title: '动效稿', kind: 'deliverable', deliverable_type: '动效稿' },
  { offset_days: -1, title: '活动规则', kind: 'deliverable', deliverable_type: '活动规则', deliverable_name: '示例活动规则' },
  { offset_days: 0, title: '上线', kind: 'task', is_milestone: true }
];
ins('timelines', { name: '示例月度时间表', kind: '全国月度促活', items: J(TL), sort_order: 0, ...T });
ins('checklists', { name: '示例交付前检查', applies_to: null, items: J(['数字都能回溯到来源', '术语全篇统一', '边界状态都覆盖', '链接逐条点开过']), ...T });
ins('checklists', { name: '示例 Word 检查', applies_to: J(['策划案', '客服文档', '活动规则']), items: J(['没有自动编号', '逐页看过分页']), ...T });
ins('prompt_templates', { name: '示例开工（Codex）', tool: 'Codex', scene: '开工', body: '【示例】先读你自己的项目说明，再开始。\n项目：{{project}}（{{province}}）\n这次要做：{{todo}}\n交付物：\n{{deliverables}}\n已拍板的口径：\n{{pendings_answered}}\n还没确认：\n{{pendings_open}}', ...T });
ins('prompt_templates', { name: '示例收工', tool: null, scene: '收工', body: '项目 {{project}} 收工，请汇报做了什么、下一步是什么。', ...T });
[['示例工具', '示例设计工具', 'https://example.com/design'], ['示例工具', '示例原型工具', 'https://example.com/proto'], ['示例站点', '示例后台', 'https://example.com/admin'], ['示例站点', '示例发布站', 'https://example.org/h5']]
  .forEach(([g, label, url], i) => ins('links', { group_name: g, label, url, sort_order: i, ...T }));

/* ---------- 项目 ---------- */
// [id, 名称, 省份, 状态, 上线(天), 暂定, 截止(天), 下一步, 最近经手]
const P = [
  [1, '示例省份 A · 双十一抽奖模块', '示例省份 A', 'active', 3, 0, 1, '把原型 V2 发群', ['Claude Code']],
  [2, '示例月度活动（下月）', null, 'active', 18, 1, null, '排期，问开发互动组件', ['Codex']],
  [3, '示例月度活动（本月）', null, 'active', 5, 0, null, '等奖品清单到了出客服文档', ['Claude Code', 'Codex']],
  [4, '示例省份 B · 签到改版', '示例省份 B', 'review', 6, 0, 0, '今天下午问领导意见', ['ChatGPT']],   // 旧版的细分状态：页面显示成「进行中」
  [5, '示例省份 C · 客服文档更新', '示例省份 C', 'active', 10, 0, -2, '改完第三章发业务方', ['DeepSeek Harness']],
  [6, '示例省份 A · 积分商城拨测', '示例省份 A', 'active', -1, 0, 2, '补拨测截图', []],          // 原定上线日已过 → 今天页问「上线了吗」
  [7, '示例省份 B · 上月活动复盘', '示例省份 B', 'live', -12, 0, 4, '整理数据', ['Cowork']],
  [8, '示例玩法 · 集卡合成', null, 'active', null, 0, 9, '写玩法说明', []],
  [9, '示例月度活动（下下月，观望）', null, 'watch', 30, 1, null, null, []],                    // 观望：不进今天，但能看排期
  [10, '示例临时需求 · 易拉宝', null, 'done', -20, 0, -21, null, ['Claude Code']],
  [11, '示例临时需求 · 动效稿', null, 'paused', null, 0, null, '等领导定方向', []],
  [12, '个人 · 整理作品集素材', null, 'active', null, 0, 14, '挑 3 个案例', []],
  [13, '示例省份 C · 旧版排期的项目', '示例省份 C', 'plan', 8, 0, null, '旧版时间表生成的重复待办会挂到交付物上', []]
];
for (const [id, title, province, status, launch, tent, due, next, ai] of P) {
  ins('projects', { id, title, province, status, priority: 'mid', requester: province ? '示例业务方' : null, launch_at: launch == null ? null : day(launch), launch_tentative: tent,
    due_at: due == null ? null : day(due), summary: `演示数据（虚构）：${title}`, next_action: next, links: id <= 3 ? J([{ label: '示例原型', url: `https://example.com/proto/${id}` }]) : null,
    local_paths: id <= 3 ? J([`~/示例文件夹/项目${id}`]) : null, last_ai: J(ai), tags: null, notes: '演示数据（虚构）', ...T });
}

/* ---------- 按时间表排期（项目 2、3、9 用新版三种节点；项目 13 模拟旧版：每个节点都生成待办，带交付物的再生成交付物） ---------- */
let tid = 1, did = 1, pid_ = 1;
for (const [pid, Toff, doneBefore] of [[2, 18, -999], [3, 5, -8], [9, 30, -999]]) {
  const Tday = day(Toff);
  TL.forEach((n, i) => {
    const due = node(Tday, n.offset_days), done = n.offset_days < doneBefore;
    if (n.kind === 'deliverable') ins('deliverables', { id: did++, project_id: pid, name: n.deliverable_name || null, type: n.deliverable_type, version: done ? 'V1' : null,
      status: done ? 'done' : pid === 3 && n.offset_days <= -6 ? 'doing' : 'todo', due_at: due, delivered_at: done ? due : null, offset_days: n.offset_days, sort_order: i,
      base: pid === 3 && n.deliverable_type === '客服文档' ? '上月客服文档 V1.1（我手改过）' : null, base_locked: pid === 3 && n.deliverable_type === '客服文档' ? 1 : 0, ...T });
    else if (n.kind === 'wait') ins('pendings', { id: pid_++, project_id: pid, question: n.title, ask_whom: n.ask_whom, status: done ? 'answered' : 'waiting', answer: done ? '演示答复（虚构）' : null,
      answered_at: done ? due : null, blocking: n.blocking ? 1 : 0, need_by: due, remind_from: n.remind_offset == null ? null : node(Tday, n.remind_offset), offset_days: n.offset_days,
      remind_offset: n.remind_offset ?? null, source: 'timeline', nudge_count: pid === 3 && n.title === '奖品清单' ? 1 : 0, last_nudged_at: pid === 3 && n.title === '奖品清单' ? day(-2) : null, ...T });
    else ins('tasks', { id: tid++, project_id: pid, title: n.title, due_at: due, done: done ? 1 : 0, done_at: done ? due : null, sort_order: i, source: 'timeline', offset_days: n.offset_days, milestone: n.is_milestone ? 1 : 0, ...T });
  });
}
{ // 项目 13：旧版排期（迁移 0002 会把重复待办挂到交付物上；这里直接写成迁移之后的样子）
  const Tday = day(8);
  [[-6, '旧版：开工', null], [-3, '旧版：客服文档', '客服文档'], [-1, '旧版：活动规则', '活动规则'], [0, '旧版：上线', null]].forEach(([off, title, type], i) => {
    const due = node(Tday, off);
    let link = null;
    if (type) { link = did; ins('deliverables', { id: did++, project_id: 13, type, status: 'todo', due_at: due, offset_days: off, sort_order: i, ...T }); }
    ins('tasks', { id: tid++, project_id: 13, title, due_at: due, done: 0, sort_order: i, source: 'timeline', offset_days: off, milestone: off === 0 ? 1 : 0, deliverable_id: link, ...T });
  });
}

/* ---------- 其他待办（含逾期、今天、今天已完成） ---------- */
[[1, '原型 V2 改抽奖弹窗', 0, 0], [1, '和设计师对一下切图', 1, 0], [4, '问领导签到改版意见', 0, 0], [5, '客服文档第三章', -2, 0], [6, '补拨测截图', -1, 0],
 [7, '数据复盘表', 3, 0], [8, '写玩法说明', 2, 0], [null, '交周报', 0, 0], [null, '报销', -3, 0], [1, '确认活动时间', 0, 1], [4, '整理反馈', -1, 1], [12, '挑 3 个案例', 10, 0]]
  .forEach(([pid, title, due, done], i) => ins('tasks', { id: tid++, project_id: pid, title, due_at: day(due), done, done_at: done ? TODAY : null, sort_order: 100 + i, source: 'manual', ...T }));

/* ---------- 交付物 ---------- */
[[1, '原型', '示例抽奖模块原型', 'V2', 'doing', 1, 'Claude 版（Codex 版落选）', 0], [1, '活动规则', null, null, 'todo', 2, null, 0], [4, '原型', null, 'V3', 'review', 0, null, 0],
 [5, '客服文档', null, 'V1.1', 'doing', -2, null, 0], [6, '拨测报告', null, null, 'todo', 2, null, 0], [7, '策划案', '复盘', 'V1', 'doing', 4, null, 0], [10, '其他', '易拉宝', 'V2', 'done', -21, null, 0]]
  .forEach(([pid, type, name, version, status, due, base, locked]) => ins('deliverables', { id: did++, project_id: pid, type, name, version, status, due_at: day(due), delivered_at: status === 'done' ? day(due) : null,
    file_hint: '示例文件.docx', base, base_locked: locked, ...T }));

/* ---------- 手动记的待确认（有的写了最晚哪天要） ---------- */
[[1, '抽奖次数上限', '业务方', '示例老师', -5, 1, 'waiting', 1, 1], [1, '活动时间', '业务方', null, -6, 0, 'answered', 0, null], [4, '签到改版用哪一版', '领导', null, -1, 0, 'waiting', 0, 3],
 [5, '客服电话写哪个', '业务方', null, -3, 0, 'waiting', 0, null], [6, '拨测账号', '搭建同事', null, -2, 1, 'waiting', 0, -1], [11, '动效方向', '领导', null, -15, 0, 'waiting', 0, null],
 [4, '页面主色', '设计师', null, -7, 0, 'answered', 0, null]]
  .forEach(([pid, question, ask_whom, ask_name, asked, blocking, status, nudges, need]) => ins('pendings', { id: pid_++, project_id: pid, question, ask_whom, ask_name, asked_at: day(asked), blocking, status,
    nudge_count: nudges, last_nudged_at: nudges ? day(-1) : null, need_by: need == null ? null : day(need), answer: status === 'answered' ? '演示答复（虚构）' : null, answered_at: status === 'answered' ? day(-2) : null, source: 'manual', ...T }));

/* ---------- 已拍板的口径 ---------- */
[[1, '以 Claude 版为底稿，Codex 版不再推进', '我', -3], [3, '活动时间以方案文件第一条为准', '我', -6], [3, '比稿选定 Claude Code 的版本（原型 V1），Codex 的落选', '比稿选定', -10]]
  .forEach(([pid, content, source, d]) => ins('decisions', { project_id: pid, content, source, decided_at: day(d), ...T }));

/* ---------- 动态 ---------- */
[[1, 'progress', '原型 V1 发群', null, -4], [1, 'feedback', '领导：抽奖弹窗再简洁一点', '演示反馈原文（虚构）', -2], [1, 'ai', '开工：原型 V2', null, -1, 'Claude Code'],
 [3, 'ai', '开工：客服文档', null, -3, 'Codex'], [3, 'nudge', '催了一次：奖品清单', null, -2], [4, 'progress', '原型 V3 发群', null, -2], [10, 'deliver', '交付：易拉宝 V2', null, -21]]
  .forEach(([pid, type, summary, content, d, tool]) => ins('activities', { project_id: pid, type, summary, content, tool: tool || null, happened_at: day(d), ...T }));

/* ---------- 玩法创意：过去 8 周各一条（本周没有，好测提醒卡） ---------- */
const ST = ['adopted', 'rejected', 'evaluating', 'submitted', 'submitted', 'rejected', 'adopted', 'draft'];
for (let i = 1; i <= 8; i++) ins('ideas', { week: isoWeek(day(-7 * i)), title: `示例创意 ${i}`, mechanism: '演示数据（虚构）：用户做什么、得到什么', target: ['value', 'stay', 'both', 'other'][i % 4],
  dev_cost: ['light', 'mid', 'heavy'][i % 3], status: ST[i - 1], ...T });

/* ---------- 提效记录：近 6 个月 20 条（类型用交付物类型） ---------- */
const TYPES = ['客服文档', '原型', '策划案', '活动规则', '切图归档', '拨测报告', '其他'];
for (let i = 0; i < 20; i++) {
  const before = [240, 180, 120, 90, 60][i % 5], after = [40, 30, 45, 20, 15][i % 5];
  ins('wins', { happened_at: day(-i * 8), project_id: i % 3 === 0 ? 1 + (i % 7) : null, task: `示例任务 ${i + 1}`, task_type: TYPES[i % TYPES.length],
    tools: J([['Claude Code'], ['Codex', '生成脚本'], ['ChatGPT'], ['Claude Code', '生成脚本']][i % 4]), before_minutes: before, after_minutes: after,
    output: '演示产出（虚构）', portfolio_ok: i % 3 === 0 ? 1 : 0, ...T });
}

/* ---------- 收集箱：5 条（含 emoji、换行、尖括号） ---------- */
['示例业务方：下周要做一个签到活动 🎉\n奖品还没定，先出个思路', '会议记录：\n1. 原型周五前\n2. 客服文档等奖品清单', '<script>alert(1)</script> 这段是测试转义用的',
 '示例老师：抽奖次数改成每天 3 次？', '自己想到：月度活动可以加一个连续打卡']
  .forEach((content, i) => ins('inbox', { content, source: ['微信', '会议', '其他', '微信', '自己想到'][i], created_at: new Date(Date.now() - i * 3600e3).toISOString(), updated_at: now }));

const dir = join(ROOT, '.wrangler', 'tmp'); mkdirSync(dir, { recursive: true });
const file = join(dir, 'desk-seed.sql');
writeFileSync(file, sql.join('\n') + '\n');
execFileSync('npx', ['wrangler@4', 'd1', 'execute', 'cosmoswong-desk', '--local', '--file', file], { cwd: ROOT, stdio: 'inherit' });
console.log(`本地库已写入演示数据：${P.length} 个项目（今天按上海时间是 ${TODAY}）`);
