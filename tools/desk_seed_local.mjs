// 给 /desk 的【本地】开发库灌演示数据，只用于本地测试。
// 内容全部是虚构的（「示例省份 A」「示例月度活动」、example.com 链接），不是任何真实项目、省份或文件。
// 用法：node tools/desk_seed_local.mjs        —— 会先清空本地库里的工作台数据，再写入演示数据
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

for (const t of ['activities', 'deliverables', 'tasks', 'pendings', 'wins', 'ideas', 'inbox', 'projects', 'timelines', 'checklists', 'prompt_templates', 'links', 'saved_views', 'settings']) sql.push(`DELETE FROM ${t};`);
sql.push(`DELETE FROM sqlite_sequence;`);

/* ---------- 设置与模板（虚构） ---------- */
ins('settings', { key: 'provinces', value: J(['示例省份 A', '示例省份 B', '示例省份 C']), updated_at: now });
const TL = [
  { offset_days: -15, title: '开工：理需求、列待确认', deliverable_type: '思路方案', deliverable_name: '示例思路方案', is_milestone: true },
  { offset_days: -12, title: '找业务方要奖品清单' },
  { offset_days: -9, title: '原型定稿', deliverable_type: '原型', deliverable_name: '示例主页面原型', is_milestone: true },
  { offset_days: -6, title: '拿到奖品清单 → 出客服文档', deliverable_type: '客服文档', is_milestone: true },
  { offset_days: -4, title: '动效稿', deliverable_type: '动效稿' },
  { offset_days: -1, title: '活动规则', deliverable_type: '活动规则', deliverable_name: '示例活动规则' },
  { offset_days: 0, title: '上线', is_milestone: true }
];
ins('timelines', { name: '示例月度时间表', kind: '全国月度促活', items: J(TL), sort_order: 0, ...T });
ins('checklists', { name: '示例交付前检查', applies_to: null, items: J(['数字都能回溯到来源', '术语全篇统一', '边界状态都覆盖', '链接逐条点开过']), ...T });
ins('checklists', { name: '示例 Word 检查', applies_to: J(['策划案', '客服文档', '活动规则']), items: J(['没有自动编号', '逐页看过分页']), ...T });
ins('prompt_templates', { name: '示例开工（Codex）', tool: 'Codex', scene: '开工', body: '【示例】先读你自己的项目说明，再开始。\n项目：{{project}}（{{province}}）\n这次要做：{{todo}}\n交付物：\n{{deliverables}}\n还没确认：\n{{pendings_open}}', ...T });
ins('prompt_templates', { name: '示例收工', tool: null, scene: '收工', body: '项目 {{project}} 收工，请汇报做了什么、下一步是什么。', ...T });
[['示例工具', '示例设计工具', 'https://example.com/design'], ['示例工具', '示例原型工具', 'https://example.com/proto'], ['示例站点', '示例后台', 'https://example.com/admin'], ['示例站点', '示例发布站', 'https://example.org/h5']]
  .forEach(([g, label, url], i) => ins('links', { group_name: g, label, url, sort_order: i, ...T }));

/* ---------- 项目 ---------- */
// [id, 名称, 类型, 省份, 状态, 优先级, 上线(天), 截止(天), 下一步, 最近经手, 月份偏移]
const P = [
  [1, '示例省份 A · 双十一抽奖模块', '省福利中心', '示例省份 A', 'proto', 'high', 3, 1, '把原型 V2 发群', ['Claude Code']],
  [2, '示例月度活动（下月）', '全国月度促活', null, 'plan', 'high', 18, null, '排时间盘子，问后台模板', ['Codex'], 1],
  [3, '示例月度活动（本月）', '全国月度促活', null, 'docs', 'high', 5, null, '等奖品表到了出客服文档', ['Claude Code', 'Codex'], 0],
  [4, '示例省份 B · 签到改版', '省福利中心', '示例省份 B', 'review', 'mid', 6, 0, '今天下午问领导意见', ['ChatGPT']],
  [5, '示例省份 C · 客服文档更新', '省福利中心', '示例省份 C', 'docs', 'mid', 10, -2, '改完第三章发业务方', ['DeepSeek Harness']],
  [6, '示例省份 A · 积分商城拨测', '省福利中心', '示例省份 A', 'test', 'mid', -1, 2, '补拨测截图', []],
  [7, '示例省份 B · 上月活动复盘', '省福利中心', '示例省份 B', 'live', 'low', -12, 4, '整理数据', ['Cowork']],
  [8, '示例玩法 · 集卡合成', '玩法创意', null, 'plan', 'mid', null, 9, '写玩法说明', []],
  [9, '示例玩法 · 三分钟答题', '玩法创意', null, 'need', 'low', null, null, null, []],
  [10, '示例临时需求 · 易拉宝', '临时需求', null, 'done', 'low', -20, -21, null, ['Claude Code']],
  [11, '示例临时需求 · 动效稿', '临时需求', null, 'paused', 'low', null, null, '等领导定方向', []],
  [12, '个人 · 整理作品集素材', '个人', null, 'need', 'low', null, 14, '挑 3 个案例', []]
];
const mon = n => { const [y, m] = TODAY.split('-').map(Number); const d = new Date(Date.UTC(y, m - 1 + n, 1)); return d.toISOString().slice(0, 7); };
for (const [id, title, kind, province, status, priority, launch, due, next, ai, month] of P) {
  ins('projects', { id, title, kind, province, status, priority, requester: kind === '省福利中心' ? '示例业务方' : kind === '全国月度促活' ? '示例领导' : null,
    launch_at: launch == null ? null : day(launch), due_at: due == null ? null : day(due), month: month == null ? null : mon(month),
    summary: `演示数据（虚构）：${title}`, next_action: next, links: id <= 3 ? J([{ label: '示例原型', url: `https://example.com/proto/${id}` }]) : null,
    local_paths: id <= 3 ? J([`~/示例文件夹/项目${id}`]) : null, last_ai: J(ai), tags: id % 4 === 0 ? J(['演示']) : null, notes: '演示数据（虚构）', ...T });
}

/* ---------- 两个月度项目按时间表生成节点（和服务端同一算法：遇到周末提前到周五，上线日本身不挪） ---------- */
let tid = 1, did = 1;
const node = (Tday, off) => { const d = add(Tday, off); return off !== 0 ? toWeekday(d) : d; };
for (const [pid, Toff, doneBefore] of [[2, 18, -999], [3, 5, -8]]) {
  const Tday = day(Toff);
  TL.forEach((n, i) => {
    const due = node(Tday, n.offset_days), done = n.offset_days < doneBefore ? 1 : 0;
    ins('tasks', { id: tid++, project_id: pid, title: n.title, due_at: due, done, done_at: done ? due : null, sort_order: i, source: 'timeline', offset_days: n.offset_days, milestone: n.is_milestone ? 1 : 0, ...T });
    if (n.deliverable_type) ins('deliverables', { id: did++, project_id: pid, name: n.deliverable_name || null, type: n.deliverable_type, version: done ? 'V1' : null,
      status: done ? 'done' : n.offset_days < -4 && pid === 3 ? 'doing' : 'todo', due_at: due, delivered_at: done ? due : null, offset_days: n.offset_days, sort_order: i, ...T });
  });
}

/* ---------- 其他待办（含逾期、今天、今天已完成） ---------- */
[[1, '原型 V2 改抽奖弹窗', 0, 0], [1, '和设计师对一下切图', 1, 0], [4, '问领导签到改版意见', 0, 0], [5, '客服文档第三章', -2, 0], [6, '补拨测截图', -1, 0],
 [7, '数据复盘表', 3, 0], [8, '写玩法说明', 2, 0], [null, '交周报', 0, 0], [null, '报销', -3, 0], [1, '确认活动时间', 0, 1], [4, '整理反馈', -1, 1], [12, '挑 3 个案例', 10, 0]]
  .forEach(([pid, title, due, done], i) => ins('tasks', { id: tid++, project_id: pid, title, due_at: day(due), done, done_at: done ? TODAY : null, sort_order: 100 + i, source: 'manual', ...T }));

/* ---------- 交付物 ---------- */
[[1, '原型', '示例抽奖模块原型', 'V2', 'doing', 1], [1, '活动规则', null, null, 'todo', 2], [4, '原型', null, 'V3', 'review', 0], [5, '客服文档', null, 'V1.1', 'doing', -2],
 [6, '拨测报告', null, null, 'todo', 2], [7, '策划案', '复盘', 'V1', 'doing', 4], [10, '其他', '易拉宝', 'V2', 'done', -21]]
  .forEach(([pid, type, name, version, status, due]) => ins('deliverables', { id: did++, project_id: pid, type, name, version, status, due_at: day(due), delivered_at: status === 'done' ? day(due) : null, file_hint: '示例文件.docx', ...T }));

/* ---------- 待确认（等了 1 / 4 / 9 天，卡交付的） ---------- */
[[3, '奖品表', '业务方', '示例老师', -9, 1, 'waiting', 2], [3, '奖池要不要分开', '业务方', null, -4, 0, 'waiting', 0], [1, '抽奖次数上限', '业务方', '示例老师', -5, 1, 'waiting', 1],
 [4, '签到改版用哪一版', '领导', null, -1, 0, 'waiting', 0], [5, '客服电话写哪个', '业务方', null, -3, 0, 'waiting', 0], [6, '拨测账号', '搭建同事', null, -2, 1, 'waiting', 0],
 [11, '动效方向', '领导', null, -15, 0, 'waiting', 0], [1, '活动时间', '业务方', null, -6, 0, 'answered', 0], [4, '页面主色', '设计师', null, -7, 0, 'answered', 0]]
  .forEach(([pid, question, ask_whom, ask_name, asked, blocking, status, nudges], i) => ins('pendings', { id: i + 1, project_id: pid, question, ask_whom, ask_name, asked_at: day(asked), blocking, status, nudge_count: nudges,
    last_nudged_at: nudges ? day(-1) : null, answer: status === 'answered' ? '演示答复（虚构）' : null, answered_at: status === 'answered' ? day(-2) : null, ...T }));

/* ---------- 时间线 ---------- */
[[1, 'progress', '原型 V1 发群', null, -4], [1, 'feedback', '领导：抽奖弹窗再简洁一点', '演示反馈原文（虚构）', -2], [1, 'ai', '开工：原型 V2', null, -1, 'Claude Code'],
 [3, 'ai', '开工：客服文档', null, -3, 'Codex'], [3, 'nudge', '催了一次：奖品表', null, -1], [4, 'progress', '原型 V3 发群', null, -2], [10, 'deliver', '交付：易拉宝 V2', null, -21]]
  .forEach(([pid, type, summary, content, d, tool]) => ins('activities', { project_id: pid, type, summary, content, tool: tool || null, happened_at: day(d), ...T }));

/* ---------- 玩法创意：过去 8 周各一条（本周没有，好测提醒卡） ---------- */
const ST = ['adopted', 'rejected', 'evaluating', 'submitted', 'submitted', 'rejected', 'adopted', 'draft'];
for (let i = 1; i <= 8; i++) ins('ideas', { week: isoWeek(day(-7 * i)), title: `示例创意 ${i}`, mechanism: '演示数据（虚构）：用户做什么、得到什么', target: ['value', 'stay', 'both', 'other'][i % 4],
  dev_cost: ['light', 'mid', 'heavy'][i % 3], status: ST[i - 1], ...T });

/* ---------- 提效记录：近 6 个月 20 条 ---------- */
const TYPES = ['Word 文档', '原型', '策划', '规则更新', '切图归档', '拨测', '数据整理'];
for (let i = 0; i < 20; i++) {
  const before = [240, 180, 120, 90, 60][i % 5], after = [40, 30, 45, 20, 15][i % 5];
  ins('wins', { happened_at: day(-i * 8), project_id: i % 3 === 0 ? 1 + (i % 7) : null, task: `示例任务 ${i + 1}`, task_type: TYPES[i % TYPES.length],
    tools: J([['Claude Code'], ['Codex', '生成脚本'], ['ChatGPT'], ['Claude Code', '生成脚本']][i % 4]), before_minutes: before, after_minutes: after,
    output: '演示产出（虚构）', portfolio_ok: i % 3 === 0 ? 1 : 0, ...T });
}

/* ---------- 收集箱：5 条（含 emoji、换行、尖括号） ---------- */
['示例业务方：下周要做一个签到活动 🎉\n奖品还没定，先出个思路', '会议记录：\n1. 原型周五前\n2. 客服文档等奖品表', '<script>alert(1)</script> 这段是测试转义用的',
 '示例老师：抽奖次数改成每天 3 次？', '自己想到：月度活动可以加一个连续打卡']
  .forEach((content, i) => ins('inbox', { content, source: ['微信', '会议', '其他', '微信', '自己想到'][i], created_at: new Date(Date.now() - i * 3600e3).toISOString(), updated_at: now }));

const dir = join(ROOT, '.wrangler', 'tmp'); mkdirSync(dir, { recursive: true });
const file = join(dir, 'desk-seed.sql');
writeFileSync(file, sql.join('\n') + '\n');
execFileSync('npx', ['wrangler@4', 'd1', 'execute', 'cosmoswong-desk', '--local', '--file', file], { cwd: ROOT, stdio: 'inherit' });
console.log(`本地库已写入演示数据：${P.length} 个项目（今天按上海时间是 ${TODAY}）`);
