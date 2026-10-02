// /kol 各表的字段定义与校验：只收认得的字段，按类型和长度规整；不合格的直接报错（中文提示给页面显示）。

export const STATUSES = ['todo', 'contacted', 'talking', 'sampled', 'published', 'won', 'paused'];
export const PRIORITIES = ['high', 'mid', 'low'];
export const ACT_TYPES = ['email_out', 'reply_in', 'dm', 'call', 'sample', 'publish', 'deal', 'note'];
export const CONTACT_TYPES = ['email_out', 'dm', 'call'];   // 这几类记录会更新 KOL 的「上次联系」
export const SCENES = ['outreach', 'follow1', 'follow2', 'sample', 'publish', 'settle', 'decline'];
const YNU = ['yes', 'no', 'unknown'];

const t = (max, label) => ({ type: 'text', max, label });
const enumOf = (values, label) => ({ type: 'enum', values, label });

export const TABLES = {
  kols: {
    name: { ...t(120, '名称'), required: true },
    handle: t(120, '账号'),
    platform: t(30, '平台'),
    profile_url: { type: 'url', label: '主页链接' },
    other_links: { type: 'links', label: '其他链接' },
    followers: { type: 'int', label: '粉丝量' },
    avg_views: { type: 'int', label: '平均播放' },
    engagement_rate: { type: 'num', label: '互动率' },
    country: { type: 'country', label: '国家' },
    language: { type: 'lang', label: '语言' },
    category: { type: 'list', max: 30, label: '品类' },
    email: { type: 'email', label: '邮箱' },
    contact_other: t(300, '其他联系方式'),
    status: { ...enumOf(STATUSES, '状态'), required: true, def: 'todo' },
    priority: enumOf(PRIORITIES, '优先级'),
    rating: enumOf(['A', 'B', 'C'], '初筛评级'),
    can_sell: enumOf(YNU, '带货权限'),
    promoted_similar: enumOf(YNU, '推过同类'),
    first_contact_at: { type: 'date', label: '首次联系' },
    last_contact_at: { type: 'date', label: '上次联系' },
    next_followup_at: { type: 'date', label: '下次跟进' },
    quote: { type: 'num', label: '报价' },
    quote_note: t(200, '报价说明'),
    coop_type: t(30, '合作方式'),
    source: t(30, '来源'),
    source_url: { type: 'url', label: '信息来源链接' },
    reason: t(500, '为什么值得关注'),
    blocker: t(300, '卡点'),
    crm_synced: { type: 'bool', label: '已录入 CRM' },
    do_not_contact: { type: 'bool', label: '勿再联系' },
    tags: { type: 'list', max: 30, label: '标签' },
    notes: t(5000, '备注'),
    data_updated_at: { type: 'date', label: '数据核实日期' },
    sort_order: { type: 'order', label: '排序' }
  },
  kol_tasks: {
    kol_id: { type: 'int', required: true, label: 'KOL' },
    title: { ...t(200, '子任务'), required: true },
    due_at: { type: 'date', label: '截止日期' },
    done: { type: 'bool', label: '完成' }
  },
  activities: {
    kol_id: { type: 'int', required: true, label: 'KOL' },
    type: { ...enumOf(ACT_TYPES, '类型'), required: true },
    summary: t(500, '摘要'),
    content: t(20000, '内容'),
    happened_at: { type: 'date', required: true, label: '日期' }
  },
  deals: {
    kol_id: { type: 'int', required: true, label: 'KOL' },
    platform: t(30, '平台'),
    content_url: { type: 'url', label: '视频链接' },
    product_link: { type: 'url', label: '带货链接' },
    published_at: { type: 'date', label: '发布日期' },
    views: { type: 'int', label: '播放量' },
    orders: { type: 'int', label: '订单数' },
    gmv_eur: { type: 'num', label: '成交额' },
    returns: { type: 'int', label: '退货数' },
    net_gmv_eur: { type: 'num', label: '净成交额' },
    commission_rate: { type: 'num', label: '分成比例' },
    commission_eur: { type: 'num', label: '分成金额' },
    commission_manual: { type: 'bool', label: '手填分成' },
    settle_status: { ...enumOf(['unsettled', 'settled'], '结算状态'), def: 'unsettled' },
    period: { type: 'month', label: '结算月份' },
    notes: t(2000, '备注')
  },
  templates: {
    name: { ...t(80, '模板名'), required: true },
    scene: { ...enumOf(SCENES, '场景'), required: true },
    language: { type: 'lang', required: true, label: '语言' },
    subject: t(300, '主题'),
    body: t(20000, '正文')
  },
  saved_views: {
    name: { ...t(40, '视图名'), required: true },
    icon: t(8, '图标'),
    type: { ...enumOf(['list', 'board'], '视图类型'), def: 'list' },
    config: { type: 'json', max: 8000, label: '视图配置' }
  },
  keywords: {
    category: { ...t(30, '品类'), required: true },
    language: { type: 'lang', required: true, label: '语言' },
    keyword: { ...t(120, '关键词'), required: true }
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
    case 'int': {
      const n = typeof raw === 'number' ? raw : Number(String(raw).replace(/[,\s]/g, ''));
      if (!Number.isFinite(n) || n < 0 || n > 1e12) bad();
      return Math.round(n);
    }
    case 'num': {
      const n = typeof raw === 'number' ? raw : Number(String(raw).replace(/[,\s%€]/g, ''));
      if (!Number.isFinite(n) || Math.abs(n) > 1e12) bad();
      return Math.round(n * 100) / 100;
    }
    case 'order': {
      const n = Number(raw);
      if (!Number.isFinite(n) || Math.abs(n) > 1e15) bad();
      return n;
    }
    case 'bool': return raw === true || raw === 1 || raw === '1' || raw === 'true' ? 1 : 0;
    case 'date': { const s = String(raw).trim().slice(0, 10); if (!validDate(s)) bad(); return s; }
    case 'month': { const s = String(raw).trim(); if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(s)) bad(); return s; }
    case 'enum': { const s = String(raw).trim(); if (!spec.values.includes(s)) bad(); return s; }
    case 'country': { const s = String(raw).trim().toUpperCase(); if (!/^[A-Z]{2}$/.test(s)) bad(); return s; }
    case 'lang': { const s = String(raw).trim().toLowerCase(); if (!/^[a-z]{2,3}$/.test(s)) bad(); return s; }
    case 'email': {
      const s = String(raw).trim();
      if (s.length > 200 || !/^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/.test(s)) bad();
      return s;
    }
    case 'url': {
      const s = String(raw).trim();
      if (s.length > 500) throw new Invalid(`${spec.label}太长了`);
      let u; try { u = new URL(s); } catch { bad(); }
      if (u.protocol !== 'https:' && u.protocol !== 'http:') bad();   // 只认网页链接，挡掉 javascript: 之类
      return s;
    }
    case 'list': {
      const arr = Array.isArray(raw) ? raw : String(raw).split(/[,，、;；|]/);
      const out = [...new Set(arr.map(x => String(x).trim()).filter(Boolean))];
      if (out.length > 20 || out.some(x => x.length > spec.max)) throw new Invalid(`${spec.label}太多或太长`);
      return out.length ? JSON.stringify(out) : null;
    }
    case 'links': {
      const arr = Array.isArray(raw) ? raw : (() => { try { return JSON.parse(raw); } catch { bad(); } })();
      if (!Array.isArray(arr) || arr.length > 20) bad();
      const out = arr.map(x => ({ label: String(x?.label || '').trim().slice(0, 30), url: cleanValue({ type: 'url', label: spec.label }, x?.url) }))
        .filter(x => x.url);
      return out.length ? JSON.stringify(out) : null;
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

/* ---------- 查重用的规整键 ---------- */
export function urlKey(u) {
  if (!u) return null;
  try {
    const x = new URL(u);
    return (x.hostname.replace(/^(www\.|m\.|mobile\.)/, '') + x.pathname.replace(/\/+$/, '')).toLowerCase();
  } catch { return null; }
}
export const handleKey = (platform, handle) =>
  platform && handle ? `${String(platform).toLowerCase()}|${String(handle).trim().replace(/^@/, '').toLowerCase()}` : null;
export const emailKey = e => e ? String(e).trim().toLowerCase() : null;
