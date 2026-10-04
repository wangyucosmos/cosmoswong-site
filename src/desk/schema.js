// /desk 各表的字段定义与校验：只收认得的字段，按类型和长度规整；不合格的直接报错（中文提示给页面显示）。
// 写法照 src/kol/schema.js，多了几种类型：sint（可为负的整数，如 T−14）、week（ISO 周）、paths（本机路径清单）、iso（时间戳）。

// v2 页面只用 active / live / done / paused / watch 五个；旧版的 need / plan / proto / review / docs / test 仍然有效（显示成「进行中」），回退到 v1 时数据照样能用
export const STATUSES = ['active', 'watch', 'need', 'plan', 'proto', 'review', 'docs', 'test', 'live', 'done', 'paused'];
export const PRIORITIES = ['high', 'mid', 'low'];
export const DELIV_STATUSES = ['todo', 'doing', 'review', 'done'];
export const PEND_STATUSES = ['waiting', 'answered', 'dropped'];
export const ACT_TYPES = ['progress', 'deliver', 'feedback', 'nudge', 'ai', 'note'];
export const IDEA_TARGETS = ['value', 'stay', 'both', 'other'];
export const IDEA_COSTS = ['light', 'mid', 'heavy'];
export const IDEA_STATUSES = ['draft', 'submitted', 'evaluating', 'adopted', 'rejected'];
export const TASK_SOURCES = ['manual', 'timeline', 'inbox'];
export const RESOURCE_KINDS = ['folder', 'tool', 'doc'];

const t = (max, label) => ({ type: 'text', max, label });
const enumOf = (values, label) => ({ type: 'enum', values, label });

export const TABLES = {
  projects: {
    title: { ...t(120, '项目名'), required: true },
    kind: t(30, '类型'),
    province: t(30, '省份'),
    month: { type: 'month', label: '所属月份' },
    status: { ...enumOf(STATUSES, '状态'), required: true, def: 'active' },
    priority: enumOf(PRIORITIES, '优先级'),
    requester: t(60, '需求方'),
    launch_at: { type: 'date', label: '上线日' },
    launch_tentative: { type: 'bool', label: '上线日暂定' },
    due_at: { type: 'date', label: '截止日' },
    summary: t(2000, '一句话需求'),
    next_action: t(300, '下一步'),
    links: { type: 'links', label: '链接' },
    local_paths: { type: 'paths', label: '本机路径' },
    last_ai: { type: 'list', max: 40, label: '最近经手' },
    tags: { type: 'list', max: 30, label: '标签' },
    notes: t(5000, '备注'),
    sort_order: { type: 'order', label: '排序' },
    archived_at: { type: 'iso', label: '归档时间' },
    compare: { type: 'json', max: 2000, label: '比稿' }
  },
  deliverables: {
    project_id: { type: 'int', required: true, label: '项目' },
    name: t(80, '名称'),
    type: { ...t(30, '交付物类型'), required: true },
    version: t(20, '版本'),
    status: { ...enumOf(DELIV_STATUSES, '状态'), required: true, def: 'todo' },
    due_at: { type: 'date', label: '截止日' },
    delivered_at: { type: 'date', label: '交付日' },
    file_hint: t(300, '文件位置'),
    notes: t(2000, '备注'),
    checklist_state: { type: 'json', max: 20000, label: '检查清单' },
    offset_days: { type: 'sint', label: '相对上线日' },
    sort_order: { type: 'order', label: '排序' },
    base: t(200, '当前底稿'),
    base_locked: { type: 'bool', label: '底稿 AI 不得改动' },
    checked: { type: 'bool', label: '交付前已确认' }
  },
  tasks: {
    project_id: { type: 'int', label: '项目' },
    title: { ...t(200, '待办'), required: true },
    due_at: { type: 'date', label: '截止日' },
    done: { type: 'bool', label: '完成' },
    sort_order: { type: 'order', label: '排序' },
    source: { ...enumOf(TASK_SOURCES, '来源'), def: 'manual' },
    offset_days: { type: 'sint', label: '相对上线日' },
    milestone: { type: 'bool', label: '里程碑' },
    deliverable_id: { type: 'int', label: '对应交付物' }
  },
  pendings: {
    project_id: { type: 'int', label: '项目' },
    question: { ...t(500, '要确认什么'), required: true },
    ask_whom: t(30, '问谁'),
    ask_name: t(40, '名字'),
    asked_at: { type: 'date', label: '问的日期' },
    last_nudged_at: { type: 'date', label: '上次催' },
    nudge_count: { type: 'int', label: '催办次数', def: 0 },
    answer: t(5000, '答复'),
    answered_at: { type: 'date', label: '答复日期' },
    status: { ...enumOf(PEND_STATUSES, '状态'), required: true, def: 'waiting' },
    blocking: { type: 'bool', label: '卡交付' },
    need_by: { type: 'date', label: '最晚哪天要' },
    remind_from: { type: 'date', label: '从哪天开始催' },
    offset_days: { type: 'sint', label: '相对上线日' },
    remind_offset: { type: 'sint', label: '开始催（相对上线日）' },
    source: t(20, '来源')
  },
  decisions: {
    project_id: { type: 'int', required: true, label: '项目' },
    content: { ...t(1000, '拍板的内容'), required: true },
    source: t(40, '谁定的'),
    decided_at: { type: 'date', required: true, label: '日期' }
  },
  activities: {
    project_id: { type: 'int', required: true, label: '项目' },
    type: { ...enumOf(ACT_TYPES, '类型'), required: true },
    summary: t(500, '摘要'),
    content: t(50000, '内容'),
    tool: t(40, '工具'),
    happened_at: { type: 'date', required: true, label: '日期' }
  },
  ideas: {
    week: { type: 'week', required: true, label: '周' },
    title: { ...t(120, '创意名'), required: true },
    mechanism: t(3000, '玩法机制'),
    target: enumOf(IDEA_TARGETS, '考核方向'),
    dev_cost: enumOf(IDEA_COSTS, '开发量'),
    status: { ...enumOf(IDEA_STATUSES, '状态'), required: true, def: 'draft' },
    file_hint: t(300, '文件位置'),
    notes: t(3000, '备注')
  },
  wins: {
    happened_at: { type: 'date', required: true, label: '日期' },
    project_id: { type: 'int', label: '项目' },
    task: { ...t(200, '做了什么'), required: true },
    task_type: t(30, '任务类型'),
    tools: { type: 'list', max: 40, label: '用了什么' },
    before_minutes: { type: 'int', label: '以前多久' },
    after_minutes: { type: 'int', label: '这次多久' },
    output: t(500, '产出'),
    portfolio_ok: { type: 'bool', label: '可上作品集' },
    note: t(2000, '备注'),
    deliverable_id: { type: 'int', label: '对应交付物' }
  },
  inbox: {
    content: { ...t(20000, '内容'), required: true },
    source: t(20, '来源'),
    processed_at: { type: 'iso', label: '处理时间' },
    converted_to: t(40, '转成了')
  },
  timelines: {
    name: { ...t(60, '模板名'), required: true },
    kind: t(30, '适用类型'),
    items: { type: 'timeline', required: true, label: '节点' },
    sort_order: { type: 'order', label: '排序' }
  },
  checklists: {
    name: { ...t(60, '清单名'), required: true },
    applies_to: { type: 'list', max: 30, label: '适用交付物' },
    items: { type: 'strings', max: 300, count: 100, required: true, label: '检查项' }
  },
  prompt_templates: {
    name: { ...t(60, '模板名'), required: true },
    tool: t(40, '工具'),
    scene: t(20, '场景'),
    body: { ...t(20000, '正文'), required: true }
  },
  links: {
    group_name: t(30, '分组'),
    label: { ...t(60, '名称'), required: true },
    url: { type: 'url', required: true, label: '链接' },
    pinned: { type: 'bool', label: '钉到今天页' },
    sort_order: { type: 'order', label: '排序' }
  },
  // v3：资源（本机文件夹 / 本地小工具 / 文档），只存路径，网页不访问
  resources: {
    kind: { ...enumOf(RESOURCE_KINDS, '资源类型'), required: true },
    group_name: t(30, '分组'),
    label: { ...t(80, '名称'), required: true },
    path: { ...t(500, '路径'), required: true },
    province: t(30, '省份'),
    note: t(300, '说明'),
    pinned: { type: 'bool', label: '钉到今天页' },
    sort_order: { type: 'order', label: '排序' }
  },
  saved_views: {
    name: { ...t(40, '视图名'), required: true },
    icon: t(8, '图标'),
    type: { ...enumOf(['list', 'board'], '视图类型'), def: 'list' },
    config: { type: 'json', max: 8000, label: '视图配置' }
  }
};

export class Invalid extends Error {}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const validDate = s => DATE.test(s) && !Number.isNaN(Date.parse(s + 'T00:00:00Z')) && new Date(s + 'T00:00:00Z').toISOString().slice(0, 10) === s;

function cleanValue(spec, raw, key) {
  const empty = raw === null || raw === undefined || raw === '';
  if (empty) {
    if (spec.type === 'bool') return 0;
    if (spec.required && spec.def === undefined) throw new Invalid(`${spec.label}不能空`);
    return spec.def ?? null;
  }
  const bad = () => { throw new Invalid(`${spec.label}的格式不对`); };
  switch (spec.type) {
    case 'text': {
      const s = String(raw).trim();
      if (s.length > spec.max) throw new Invalid(`${spec.label}太长了（最多 ${spec.max} 字）`);
      if (!s && spec.required) throw new Invalid(`${spec.label}不能空`);
      return s || null;
    }
    case 'int': case 'sint': {
      const n = typeof raw === 'number' ? raw : Number(String(raw).replace(/[,\s]/g, ''));
      if (!Number.isFinite(n) || (spec.type === 'int' && n < 0) || Math.abs(n) > 1e9) bad();
      return Math.round(n);
    }
    case 'order': {
      const n = Number(raw);
      if (!Number.isFinite(n) || Math.abs(n) > 1e15) bad();
      return n;
    }
    case 'bool': return raw === true || raw === 1 || raw === '1' || raw === 'true' ? 1 : 0;
    case 'date': { const s = String(raw).trim().slice(0, 10); if (!validDate(s)) bad(); return s; }
    case 'month': { const s = String(raw).trim(); if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(s)) bad(); return s; }
    case 'week': { const s = String(raw).trim(); if (!/^\d{4}-W(0[1-9]|[1-4]\d|5[0-3])$/.test(s)) bad(); return s; }
    case 'iso': { const s = String(raw).trim(); if (s.length > 40 || Number.isNaN(Date.parse(s))) bad(); return new Date(s).toISOString(); }
    case 'enum': { const s = String(raw).trim(); if (!spec.values.includes(s)) bad(); return s; }
    case 'url': {
      const s = String(raw).trim();
      if (s.length > 1000) throw new Invalid(`${spec.label}太长了`);
      let u; try { u = new URL(s); } catch { bad(); }
      if (u.protocol !== 'https:' && u.protocol !== 'http:') bad();   // 只认网页链接，挡掉 javascript: 之类
      return s;
    }
    case 'list': {
      const arr = Array.isArray(raw) ? raw : String(raw).split(/[,，、;；|]/);
      const out = [...new Set(arr.map(x => String(x).trim()).filter(Boolean))];
      if (out.length > 30 || out.some(x => x.length > spec.max)) throw new Invalid(`${spec.label}太多或太长`);
      return out.length ? JSON.stringify(out) : null;
    }
    case 'strings': {   // 检查项：保留顺序，允许重复以外的任何文字
      const arr = Array.isArray(raw) ? raw : (() => { try { return JSON.parse(raw); } catch { return String(raw).split('\n'); } })();
      if (!Array.isArray(arr)) bad();
      const out = [...new Set(arr.map(x => String(x ?? '').trim()).filter(Boolean))];
      if (out.length > spec.count || out.some(x => x.length > spec.max)) throw new Invalid(`${spec.label}太多或太长（最多 ${spec.count} 条、每条 ${spec.max} 字）`);
      if (!out.length && spec.required) throw new Invalid(`${spec.label}不能空`);
      return JSON.stringify(out);
    }
    case 'links': {
      const arr = Array.isArray(raw) ? raw : (() => { try { return JSON.parse(raw); } catch { bad(); } })();
      if (!Array.isArray(arr) || arr.length > 30) bad();
      const out = arr.map(x => ({ label: String(x?.label || '').trim().slice(0, 40), url: cleanValue({ type: 'url', label: spec.label }, x?.url) }))
        .filter(x => x.url);
      return out.length ? JSON.stringify(out) : null;
    }
    case 'paths': {
      const arr = Array.isArray(raw) ? raw : (() => { try { return JSON.parse(raw); } catch { return String(raw).split('\n'); } })();
      if (!Array.isArray(arr)) bad();
      const out = [...new Set(arr.map(x => String(x ?? '').trim()).filter(Boolean))];
      if (out.length > 30 || out.some(x => x.length > 500)) throw new Invalid(`${spec.label}太多或太长`);
      return out.length ? JSON.stringify(out) : null;
    }
    case 'timeline': {
      const arr = Array.isArray(raw) ? raw : (() => { try { return JSON.parse(raw); } catch { bad(); } })();
      if (!Array.isArray(arr) || !arr.length || arr.length > 60) throw new Invalid(`${spec.label}要有 1–60 个`);
      const out = arr.map((x, i) => {
        const off = Number(x?.offset_days);
        if (!Number.isInteger(off) || Math.abs(off) > 365) throw new Invalid(`第 ${i + 1} 个节点的天数不对（要是 −365 到 365 的整数）`);
        const title = String(x?.title || '').trim();
        if (!title || title.length > 200) throw new Invalid(`第 ${i + 1} 个节点要写做什么（最多 200 字）`);
        const yes = v => v === true || v === 1 || v === '1' || v === 'true';
        const dt = String(x?.deliverable_type || '').trim(), dn = String(x?.deliverable_name || '').trim();
        if (dt.length > 30 || dn.length > 80) throw new Invalid(`第 ${i + 1} 个节点的交付物名太长`);
        // kind：task 我要做的 / deliverable 要交的 / wait 等别人给的（没写 kind 的旧模板：有交付物类型就是 deliverable，否则 task）
        const kind = ['task', 'deliverable', 'wait'].includes(x?.kind) ? x.kind : dt ? 'deliverable' : 'task';
        if (kind === 'deliverable' && !dt) throw new Invalid(`第 ${i + 1} 个节点是「要交的」，要选交付物类型`);
        const node = { offset_days: off, title, kind };
        if (kind === 'deliverable') { node.deliverable_type = dt; if (dn) node.deliverable_name = dn; }
        if (kind === 'wait') {
          const who = String(x?.ask_whom || '').trim();
          if (who.length > 30) throw new Invalid(`第 ${i + 1} 个节点的「问谁」太长`);
          if (who) node.ask_whom = who;
          if (x?.remind_offset !== undefined && x?.remind_offset !== null && x?.remind_offset !== '') {
            const r = Number(x.remind_offset);
            if (!Number.isInteger(r) || Math.abs(r) > 365 || r > off) throw new Invalid(`第 ${i + 1} 个节点「从哪天开始催」要早于或等于最晚日期`);
            node.remind_offset = r;
          }
          if (yes(x?.blocking)) node.blocking = true;
        }
        if (yes(x?.is_milestone)) node.is_milestone = true;
        return node;
      });
      return JSON.stringify(out);
    }
    case 'json': {
      const s = typeof raw === 'string' ? raw : JSON.stringify(raw);
      if (s.length > spec.max) throw new Invalid(`${spec.label}太大了`);
      try { JSON.parse(s); } catch { bad(); }
      return s;
    }
  }
  throw new Invalid(`不认识的字段 ${key}`);
}

// partial=true：只校验传进来的字段（用于修改）；false：所有字段都过一遍（用于新增，缺省按空值处理）
export function clean(table, input, partial = false) {
  const specs = TABLES[table];
  if (!input || typeof input !== 'object') throw new Invalid('数据格式不对');
  const out = {};
  for (const [key, spec] of Object.entries(specs)) {
    if (partial && !(key in input)) continue;
    out[key] = cleanValue(spec, input[key], key);
  }
  return out;
}

// 表里存成 JSON 文本的列：读出来给页面前先解析
export const JSON_COLS = {
  projects: ['links', 'local_paths', 'last_ai', 'tags', 'compare'],
  deliverables: ['checklist_state'],
  wins: ['tools'],
  timelines: ['items'],
  checklists: ['applies_to', 'items'],
  saved_views: []
};
