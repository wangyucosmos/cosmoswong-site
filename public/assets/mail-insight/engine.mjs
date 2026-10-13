// 邮件名单透视 · 分析引擎（浏览器、Worker、本机脚本共用）。
// 只认 Mailchimp segment 导出的 CSV。人群规则、标签名、写法建议都来自"分析手册"（playbook，存在 KV，不进仓库），
// 这里只有通用逻辑；输出只含汇总数字，不含任何邮箱。

export function parseCSV(text) {
  const rows = []; let row = [], f = '', q = false;
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; }
      else f += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(f); f = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(f); f = '';
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
    } else f += c;
  }
  if (f !== '' || row.length) { row.push(f); rows.push(row); }
  return rows;
}

const splitTags = s => s ? new Set((parseCSV(s)[0] || []).map(t => t.trim()).filter(Boolean)) : new Set();

// 识别文件类型：有 UNSUB_TIME 是退订名单，有 CLEAN_TIME 是无效邮箱，否则是在订名单
export function toRecords(text) {
  const rows = parseCSV(text);
  if (!rows.length) return { kind: 'empty', recs: [] };
  const h = rows[0], idx = n => h.indexOf(n);
  const iT = idx('TAGS');
  if (iT < 0) return { kind: 'unknown', recs: [] };
  const iR = idx('MEMBER_RATING'), iO = idx('OPTIN_TIME'), iC = idx('CC');
  const iUT = idx('UNSUB_TIME'), iUC = idx('UNSUB_CAMPAIGN_TITLE'), iUR = idx('UNSUB_REASON'), iUO = idx('UNSUB_REASON_OTHER');
  const kind = iUT >= 0 ? 'unsubscribed' : idx('CLEAN_TIME') >= 0 ? 'cleaned' : 'subscribed';
  const get = (r, i) => i >= 0 ? (r[i] || '') : '';
  return {
    kind,
    recs: rows.slice(1).map(r => ({
      tags: splitTags(r[iT]), rating: +get(r, iR) || 0, optin: get(r, iO), cc: get(r, iC),
      unsubTime: get(r, iUT), unsubCampaign: get(r, iUC), unsubReason: get(r, iUR), unsubOther: get(r, iUO)
    }))
  };
}

// 标签匹配器：{ exact: [...], contains: [...], regex: [...], ci: true }，任一命中即为真
export function matcher(m) {
  if (!m) return () => false;
  const ci = !!m.ci, ex = new Set(m.exact || []);
  const co = (m.contains || []).map(s => ci ? s.toLowerCase() : s);
  const re = (m.regex || []).map(s => new RegExp(s, ci ? 'i' : ''));
  return tags => {
    for (const t of tags) {
      if (ex.has(t)) return true;
      const tt = ci ? t.toLowerCase() : t;
      if (co.some(c => tt.includes(c)) || re.some(r => r.test(t))) return true;
    }
    return false;
  };
}

// 人群规则：any（命中其一）且 all（全部都有）且不命中 none；notCustomer 表示排除已购用户
export function segmentTest(s, isCustomer) {
  const any = s.any ? matcher(s.any) : null, none = s.none ? matcher(s.none) : null, all = s.all || [];
  return t => (!any || any(t)) && all.every(x => t.has(x)) && (!none || !none(t)) && (!s.notCustomer || !isCustomer(t));
}

const inc = (o, k, v = 1) => { o[k] = (o[k] || 0) + v; };
const topN = (o, n) => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, n);
const EMAIL = /[\w.+-]+@[\w-]+(\.[\w-]+)+/g;
export const scrub = s => String(s).replace(EMAIL, '[邮箱]');

export function analyze(sub, unsub, cleaned, pb) {
  const N = sub.length, U = unsub.length;
  const isCustomer = matcher(pb.customer);
  const latestYear = sub.map(r => r.optin.slice(0, 4)).filter(Boolean).sort().pop() || '';
  const segments = (pb.segments || []).map(s => {
    const t = segmentTest(s, isCustomer);
    return { id: s.id, name: s.name, sub: sub.filter(r => t(r.tags)).length, unsub: unsub.filter(r => t(r.tags)).length };
  });
  segments.push({ id: 'newYear', name: latestYear + ' 年新订阅', sub: sub.filter(r => r.optin.startsWith(latestYear)).length, unsub: unsub.filter(r => r.optin.startsWith(latestYear)).length });

  const rating = {}, optinYear = {}, cc = {}, opened = {}, hooks = {}, tagCount = {};
  const openedRe = pb.opened?.regex ? new RegExp(pb.opened.regex) : null;
  const hookPrefixes = Object.entries(pb.hooks?.prefixes || {});
  for (const r of sub) {
    inc(rating, r.rating);
    if (r.optin) inc(optinYear, r.optin.slice(0, 4));
    if (r.cc) inc(cc, r.cc);
    for (const x of r.tags) {
      inc(tagCount, x);
      if (openedRe && openedRe.test(x)) inc(opened, x);
      const hp = hookPrefixes.find(([p]) => x.startsWith(p));
      if (hp) inc(hooks, hp[1] + x.slice(hp[0].length));
    }
  }
  const viewTags = pb.views?.tags || [];
  const views = { all: 0, some: 0, none: 0 };
  for (const r of sub) {
    const k = viewTags.filter(x => r.tags.has(x)).length;
    if (viewTags.length && k === viewTags.length) views.all++; else if (k) views.some++; else views.none++;
  }
  const customers = sub.filter(r => isCustomer(r.tags));
  const uMonth = {}, uCamp = {}, uReason = {};
  for (const r of unsub) {
    if (r.unsubTime) inc(uMonth, r.unsubTime.slice(0, 7));
    if (r.unsubCampaign && r.unsubCampaign !== 'n/a') inc(uCamp, r.unsubCampaign);
    inc(uReason, r.unsubReason || '未填写');
  }
  const lastMonth = Object.keys(uMonth).sort().pop() || '';
  return {
    n: { sub: N, unsub: U, cleaned: cleaned.length },
    rating, optinYear, latestYear,
    countries: topN(cc, 12), geoKnown: Object.values(cc).reduce((a, b) => a + b, 0),
    segments,
    customers: customers.length,
    customersViewingNew: customers.filter(r => viewTags.some(v => r.tags.has(v))).length,
    views,
    abandon: (pb.abandon || []).map(a => [a.name, tagCount[a.tag] || 0]),
    opened: topN(opened, 10), hooks: topN(hooks, 10),
    distinctTags: Object.keys(tagCount).length,
    noise: (pb.noise || []).filter(k => tagCount[k]).map(k => [k, tagCount[k]]),
    unsubMonth: Object.entries(uMonth).sort(),
    unsubLastMonth: lastMonth, unsubInLastMonth: uMonth[lastMonth] || 0,
    unsubCampaigns: topN(uCamp, 20).map(([k, v]) => [scrub(k), v]), unsubCampaignCount: Object.keys(uCamp).length,
    unsubReasons: topN(uReason, 6),
    unsubComments: unsub.map(r => r.unsubOther).filter(Boolean).slice(0, 8).map(scrub)
  };
}

// 存进期数清单的摘要：用来画"每期变化"，不用把每一期全文都拉下来
export function summarize(d) {
  const n = d?.n || {}, r = d?.rating || {}, segs = {};
  for (const s of Array.isArray(d?.segments) ? d.segments : []) if (s && typeof s.id === 'string') segs[s.id.slice(0, 40)] = Number(s.sub) || 0;
  return {
    sub: Number(n.sub) || 0, unsub: Number(n.unsub) || 0,
    active: (Number(r[3]) || 0) + (Number(r[4]) || 0) + (Number(r[5]) || 0),
    unsubInLastMonth: Number(d?.unsubInLastMonth) || 0, unsubLastMonth: String(d?.unsubLastMonth || '').slice(0, 7),
    segs
  };
}

globalThis.MailInsight = { parseCSV, toRecords, matcher, segmentTest, analyze, summarize, scrub };
