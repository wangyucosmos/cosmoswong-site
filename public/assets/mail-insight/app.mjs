// 邮件名单透视 · 页面逻辑。分析引擎在 engine.mjs（先加载，挂在 globalThis.MailInsight）。
// 数据流：GET /api/mail-insight → 手册 + 期数清单 → 读最新一期渲染；拖入 CSV → 浏览器里算 → 预览 → POST 保存为新一期。
const MI = globalThis.MailInsight;
const $ = id => document.getElementById(id);
const fmt = n => Number(n || 0).toLocaleString('en-US');
const pct = (a, b, d = 1) => b ? (a / b * 100).toFixed(d) + '%' : '–';
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const CC = { GB: '英国', DE: '德国', FR: '法国', NL: '荷兰', US: '美国', ES: '西班牙', IT: '意大利', BE: '比利时', SE: '瑞典', CH: '瑞士', PL: '波兰', AT: '奥地利', CN: '中国', AU: '澳大利亚', FI: '芬兰', CZ: '捷克', HU: '匈牙利', JP: '日本', PT: '葡萄牙', CA: '加拿大', DK: '丹麦', NO: '挪威', IE: '爱尔兰', AE: '阿联酋', KR: '韩国', SG: '新加坡', NZ: '新西兰', MX: '墨西哥', BR: '巴西' };
const HDR = { 'content-type': 'application/json', 'x-tools-request': '1' };

let PB = null, SNAPS = [], cur = null, preview = null;

async function api(path, init = {}) {
  const r = await fetch('/api/mail-insight' + path, { credentials: 'same-origin', ...init });
  if (r.status === 401) { location.href = '/unlock?next=mail-insight'; throw new Error('需要口令'); }
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(body.error || '服务器出错了，请稍后再试');
  return body;
}

// ---------- 小部件 ----------
function bars(el, rows) {
  const max = Math.max(1, ...rows.map(r => r[1]));
  $(el).innerHTML = rows.length ? rows.map(([lab, v, cls, title], i) =>
    `<div class="bar"><span class="lab" title="${esc(title || lab)}">${esc(lab)}</span><div class="track"><div class="fill ${cls || ''}" style="width:${(v / max * 100).toFixed(1)}%;animation-delay:${i * 40}ms${cls === 'muted' ? ';background:var(--muted)' : ''}"></div></div><span class="val">${fmt(v)}</span></div>`).join('')
    : '<p class="muted" style="font-size:13.5px">这一期没有相关数据。</p>';
}
const D = () => preview ? preview.data : cur.data;
const segOf = id => D().segments.find(s => s.id === id) || { id, name: id, sub: 0, unsub: 0 };
const riskX = s => (D().n.unsub && s.sub) ? (s.unsub / D().n.unsub) / (s.sub / D().n.sub) : 0;
const shown = () => (PB.segments || []).filter(s => s.show !== false);
const ruleHtml = s => {
  const tags = [...(s.any?.exact || []), ...(s.any?.contains || []).map(x => x + '…'), ...(s.any?.regex || []).map(x => '规则：' + x)];
  let h = tags.length ? '标签包含其中之一：' + tags.map(t => `<span class="tag">${esc(t)}</span>`).join(' ') : '';
  if (s.all?.length) h += (h ? '<br>' : '') + '同时都有：' + s.all.map(t => `<span class="tag">${esc(t)}</span>`).join(' ');
  if (s.notCustomer) h += '<br>并且不是已购用户';
  if (s.ruleNote) h += `<br><span class="muted">${esc(s.ruleNote)}</span>`;
  return h || '<span class="muted">按订阅时间计算</span>';
};
const catOf = label => (PB.opened?.categories || []).find(c => new RegExp(c.regex, 'i').test(label));

// ---------- 手把手步骤：手册里每个人群的 steps（标题 / 具体操作 / 提示 / 可复制模板），勾选进度只记在这台设备 ----------
const doneKey = (seg, i) => `mi.step.${seg}.${i}`;
const isDone = k => { try { return localStorage.getItem(k) === '1'; } catch { return false; } };
function stepsHtml(info) {
  const steps = info.steps || [];
  if (!steps.length) return '';
  return `<div class="steps"><div class="steps-head"><h4>手把手：下一步怎么做</h4><span class="muted" style="font-size:12.5px">做完一步就勾上；勾选只记在这台设备</span></div>
    <ol>${steps.map((st, i) => {
      const k = doneKey(info.id, i), done = isDone(k);
      return `<li class="step-card${done ? ' done' : ''}">
        <label class="step-top"><input type="checkbox" data-k="${esc(k)}"${done ? ' checked' : ''}><span class="step-n">${i + 1}</span><b>${esc(st.title)}</b>${st.time ? `<span class="chip">${esc(st.time)}</span>` : ''}</label>
        ${st.do?.length ? `<ul>${st.do.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
        ${st.template ? `<div class="tpl"><pre>${esc(st.template)}</pre><button class="copy" type="button" data-t="${esc(st.template)}">复制模板</button></div>` : ''}
        ${st.tip ? `<p class="step-tip"><b>判断标准：</b>${esc(st.tip)}</p>` : ''}
      </li>`;
    }).join('')}</ol></div>`;
}
document.addEventListener('change', e => {
  const cb = e.target.closest('.steps input[type=checkbox]');
  if (!cb) return;
  try { cb.checked ? localStorage.setItem(cb.dataset.k, '1') : localStorage.removeItem(cb.dataset.k); } catch { /* 无痕模式记不住，不影响使用 */ }
  cb.closest('.step-card').classList.toggle('done', cb.checked);
});

// ---------- 结论 ----------
function autoVerdicts() {
  const d = D(), out = [];
  if (d.unsubInLastMonth) out.push([`先看发信频率`, `${d.unsubLastMonth} 有 ${d.unsubInLastMonth} 人退订，由 ${d.unsubCampaignCount} 封不同的邮件触发。每人每周最多 2 封，重发只补一次。`, '#unsub']);
  const hot = shown().filter(s => s.pri === 'now').map(s => segOf(s.id));
  if (hot.length) out.push([`先打离成交最近的人`, hot.map(s => `${s.name} ${fmt(s.sub)} 人`).join('，') + '。他们已经在选，只差一个理由。', '#segments']);
  const cats = {};
  for (const [lab, n] of d.opened) { const c = catOf(lab); if (c) cats[c.name] = (cats[c.name] || 0) + n; }
  const topCat = Object.entries(cats).sort((a, b) => b[1] - a[1])[0];
  if (topCat) out.push([`内容主打「${topCat[0]}」`, `打开最多的邮件里，${topCat[0]}类累计 ${fmt(topCat[1])} 次打开。`, '#interest']);
  const ranked = shown().map(s => segOf(s.id)).filter(s => s.sub >= 30 && d.n.unsub).map(s => [s, riskX(s)]).sort((a, b) => b[1] - a[1]);
  if (ranked.length && ranked[0][1] >= 1.5) out.push([`${ranked[0][0].name}要单独、慢慢养`, `他们在退订人群中的占比是在订人群的 ${ranked[0][1].toFixed(1)} 倍。频率减半，内容为主。`, '#unsub']);
  const safe = ranked[ranked.length - 1];
  if (safe && safe[1] < 0.8) out.push([`${safe[0].name}最不容易退订`, `退订倍数只有 ${safe[1].toFixed(1)}，兴趣对口，适合加码做专属内容。`, '#segments']);
  return out;
}

function renderVerdicts() {
  const ins = !preview && Array.isArray(cur.insights) && cur.insights.length ? cur.insights : null;
  const v = ins ? ins.map(x => [x.title, x.body, x.link || '']) : autoVerdicts();
  $('verdictNote').innerHTML = ins
    ? `<span class="src">Claude 点评</span> 这一期的结论由 Claude 看过数据后写成${cur.insightsBy ? '（' + esc(cur.insightsBy) + '）' : ''}。`
    : '按数据自动生成。想要更深入的点评，把表格发给 Claude。';
  $('verdictList').innerHTML = v.map((x, i) => `<li><span class="k">${i + 1}</span><div><b>${esc(x[0])}</b><span class="muted">${esc(x[1])}</span>${x[2] ? ` <a href="${esc(x[2])}" style="color:var(--accent);font-size:13.5px;white-space:nowrap">看细节 →</a>` : ''}</div></li>`).join('');
}

// ---------- 每期变化 ----------
function renderTrend() {
  const list = SNAPS.slice(0, 6).reverse();
  if (list.length < 2) { $('trendBox').innerHTML = '<p class="muted" style="font-size:14px">目前只有 1 期数据。下次导出新表格并保存后，这里会显示两期之间的变化。</p>'; return; }
  const rows = [
    ['在订人数', s => s.summary.sub, 1],
    ['3 星以上活跃用户', s => s.summary.active, 1],
    ['退订总数', s => s.summary.unsub, -1],
    ['最近一个月退订', s => s.summary.unsubInLastMonth, -1],
    ...shown().map(g => [g.name, s => s.summary.segs?.[g.id] ?? null, 0])
  ];
  const cell = (v, prev, dir) => {
    if (v === null || v === undefined) return '<td class="n muted">–</td>';
    if (prev === null || prev === undefined) return `<td class="n">${fmt(v)}</td>`;
    const dlt = v - prev, cls = !dlt || !dir ? '' : (dlt * dir > 0 ? 'up' : 'down');
    return `<td class="n ${cls}">${fmt(v)}<small>${dlt > 0 ? '+' : ''}${fmt(dlt)}</small></td>`;
  };
  $('trendBox').innerHTML = `<table class="trend"><thead><tr><th>指标</th>${list.map(s => `<th style="text-align:right">${esc(s.label)}</th>`).join('')}</tr></thead><tbody>${
    rows.map(([name, f, dir]) => `<tr><td>${esc(name)}</td>${list.map((s, i) => cell(f(s), i ? f(list[i - 1]) : null, dir)).join('')}</tr>`).join('')}</tbody></table>`;
}

// ---------- 主渲染 ----------
function render() {
  const d = D(), N = d.n.sub, U = d.n.unsub;
  const label = preview ? preview.label + '（预览，未保存）' : cur.label;
  $('dataLabel').textContent = `${label} · 在订 ${fmt(N)} 人`;
  $('eyebrow').textContent = (PB.brand ? PB.brand + ' · ' : '') + '邮件名单 · 人群画像';
  const top3 = d.countries.slice(0, 3).map(c => CC[c[0]] || c[0]).join('、');
  $('lede').textContent = PB.portrait || (top3 ? `以${top3}为主的邮件名单。` : '');
  renderVerdicts();
  renderTrend();

  const newY = segOf('newYear');
  const active = (d.rating[3] || 0) + (d.rating[4] || 0) + (d.rating[5] || 0);
  const hot = shown().filter(s => s.pri === 'now').map(s => segOf(s.id));
  $('kpis').innerHTML = [
    ['', fmt(N), '在订人数'],
    ['warn', pct(active, N), `活跃用户占比（3 星以上，${fmt(active)} 人）`],
    ['', fmt(newY.sub), `${d.latestYear} 年新订阅（占 ${pct(newY.sub, N, 0)}）`],
    ['', fmt(d.customers), `已购用户（其中 ${fmt(d.customersViewingNew)} 人看过产品页）`]
  ].map(k => `<div class="kpi ${k[0]}"><span class="v">${k[1]}</span><span class="l">${esc(k[2])}</span></div>`).join('');
  if (hot.length) $('kpis').innerHTML += `<div class="kpi"><span class="v">${fmt(hot.reduce((a, s) => a + s.sub, 0))}</span><span class="l">高意向：${esc(hot.map(s => s.name).join(' + '))}（有重叠）</span></div>`;

  const ys = Object.entries(d.optinYear).sort().slice(-8);
  const ymax = Math.max(1, ...ys.map(y => y[1]));
  $('yearCols').innerHTML = ys.map(([y, n], i) => `<div class="col"><div class="c ${y === d.latestYear ? 'hl' : ''}" style="height:${(n / ymax * 100).toFixed(1)}%;animation-delay:${i * 50}ms"><span>${fmt(n)}</span></div><small>${esc(y)}</small></div>`).join('');
  bars('ratingBars', [5, 4, 3, 2, 1].map(r => [`${r} 星`, d.rating[r] || 0, r >= 3 ? '' : r === 1 ? 'bad' : 'amber']));
  $('geoNote').textContent = `只有 ${fmt(d.geoKnown)} 人（${pct(d.geoKnown, N, 0)}）带地区信息，可以看大方向。发送时间按主要地区的当地上午。`;
  bars('geoBars', d.countries.slice(0, 10).map(c => [CC[c[0]] || c[0], c[1]]));
  bars('noiseBars', d.noise.slice(0, 8).map(n => [n[0], n[1], 'amber']));
  $('tagNote').textContent = `名单里一共有 ${fmt(d.distinctTags)} 种不同标签。真正有用的是 5 类：购买状态、浏览过的产品、加购没付、打开过哪封邮件、从哪来。`;

  $('segs').innerHTML = shown().map(info => {
    const s = segOf(info.id), x = riskX(s);
    const pri = info.pri === 'now' ? '<span class="chip now">立即做</span>' : info.pri === 'slow' ? '<span class="chip slow">慢热</span>' : '<span class="chip">本月做</span>';
    const risk = !U ? '' : x >= 1.5 ? `<span class="chip risk">退订风险 ×${x.toFixed(1)}</span>` : x > 0 && x <= 0.8 ? `<span class="chip safe">不易退订 ×${x.toFixed(1)}</span>` : `<span class="chip">退订风险 ×${x.toFixed(1)}</span>`;
    return `<article class="seg">
      <button class="head" type="button" aria-expanded="false">
        <div class="row1"><h3>${esc(info.name)}</h3><span class="size">${fmt(s.sub)}<small>人 · ${pct(s.sub, N, 0)}</small></span></div>
        <p class="think">${esc(info.think || '')}</p>
        <div class="chips">${pri}${risk}</div>
        <span class="more">展开写法 ＋</span>
      </button>
      <div class="body">
        <div><h4>在 Mailchimp 里怎么圈</h4><p style="font-size:14px">${ruleHtml(info)}</p></div>
        <div><h4>怎么写</h4><ul style="font-size:14px">${(info.angle || []).map(a => `<li>${esc(a)}</li>`).join('')}</ul></div>
        <div><h4>主题行（可直接复制）</h4>${(info.subj || []).map(t => `<div class="subj"><span>${esc(t)}</span><button class="copy" type="button" data-t="${esc(t)}">复制</button></div>`).join('')}</div>
        <div><h4>别这样做</h4><p class="dont">${esc(info.dont || '')}</p></div>
        ${stepsHtml(info)}
      </div>
    </article>`;
  }).join('');

  const cats = PB.opened?.categories || [];
  $('openLegend').innerHTML = cats.map(c => `<span><i style="background:var(--${c.color === 'amber' ? 'amber' : 'accent'})"></i>${esc(c.name)}</span>`).join('') + '<span><i style="background:var(--muted)"></i>其他</span>';
  $('interestNote').textContent = '名单里记录了谁打开过哪一封邮件。' + (cats.length ? `颜色区分话题：${cats.map(c => c.name).join('、')}。` : '');
  const labels = PB.opened?.labels || {};
  bars('openBars', d.opened.map(o => { const c = catOf(o[0]); return [labels[o[0]] || o[0], o[1], c ? (c.color === 'amber' ? 'amber' : '') : 'muted', o[0]]; }));

  const vw = d.views, vt = Math.max(1, vw.all + vw.some + vw.none);
  $('viewNote').textContent = `${fmt(vw.all + vw.some)} 人看过至少一款产品页，其中 ${fmt(vw.all)} 人全部看过，正在认真比较。`;
  $('viewStack').innerHTML = `<div style="width:${vw.all / vt * 100}%;background:var(--accent)"></div><div style="width:${vw.some / vt * 100}%;background:var(--amber)"></div><div style="flex:1"></div>`;
  $('viewLegend').innerHTML = `<span><i style="background:var(--accent)"></i>全部看过 ${fmt(vw.all)}</span><span><i style="background:var(--amber)"></i>看过部分 ${fmt(vw.some)}</span><span><i style="background:var(--surface-2);border:1px solid var(--line)"></i>没记录 ${fmt(vw.none)}</span>`;
  bars('abandonBars', [...d.abandon].sort((a, b) => b[1] - a[1]).map(a => [a[0], a[1], 'amber']));
  bars('hookBars', d.hooks.map(h => [h[0], h[1]]));

  $('unsubLede').textContent = U ? `${d.unsubLastMonth} 一个月里有 ${d.unsubInLastMonth} 人退订，占全部退订的 ${pct(d.unsubInLastMonth, U, 0)}；触发退订的不同邮件有 ${d.unsubCampaignCount} 封。` : '这一期没有退订名单。导出时一起带上 unsubscribed 那份 CSV 才能做退订诊断。';
  const spam = (d.unsubReasons.find(r => r[0] === 'SPAM') || [0, 0])[1];
  $('unsubKpis').innerHTML = [
    ['bad', fmt(U), '退订人数'],
    ['bad', fmt(d.unsubInLastMonth), `其中 ${d.unsubLastMonth || '最近一个月'} 退订`],
    ['warn', fmt(d.unsubCampaignCount), '触发退订的不同邮件数'],
    ['warn', fmt(spam), '标为垃圾邮件（伤害最大）']
  ].map(k => `<div class="kpi ${k[0]}"><span class="v">${k[1]}</span><span class="l">${esc(k[2])}</span></div>`).join('');

  const cmpIds = PB.compareIds || shown().map(s => s.id);
  const sc = v => Math.min(100, v / 0.75 * 100);
  const cmp = U ? cmpIds.map(segOf).map(s => ({ name: s.name, a: s.sub / N, b: s.unsub / U, x: riskX(s) })).sort((p, q) => q.x - p.x) : [];
  $('dumbbell').innerHTML = cmp.map(r => {
    const lo = Math.min(sc(r.a), sc(r.b)), hi = Math.max(sc(r.a), sc(r.b)), col = r.b > r.a ? 'var(--bad)' : 'var(--good)';
    return `<div class="db-row"><span>${esc(r.name)}<br><small class="muted">在订 ${pct(r.a, 1, 0)} · 退订 ${pct(r.b, 1, 0)}</small></span><div class="db-track"><div class="db-line" style="left:${lo}%;width:${hi - lo}%;background:${col};opacity:.45"></div><div class="db-dot s" style="left:${sc(r.a)}%"></div><div class="db-dot u" style="left:${sc(r.b)}%;background:${col}"></div></div><span class="db-x" style="color:${col}">×${r.x.toFixed(1)}</span></div>`;
  }).join('') || '<p class="muted">没有退订数据。</p>';
  const camps = d.unsubCampaigns, CAP = 8;
  $('campRows').innerHTML = (camps.map((c, i) => `<tr${i >= CAP ? ' class="more-row" hidden' : ''}><td>${esc(c[0])}</td><td class="n">${fmt(c[1])}</td></tr>`).join('') || '<tr><td class="muted" colspan="2">没有数据</td></tr>')
    + (camps.length > CAP ? `<tr><td colspan="2"><button class="btn ghost small" type="button" id="campMore">展开其余 ${camps.length - CAP} 封</button></td></tr>` : '');
  $('quotes').innerHTML = d.unsubComments.length ? d.unsubComments.map(q => `<div class="quote">"${esc(q.length > 220 ? q.slice(0, 220) + '…' : q)}"<small>退订时填写的原因</small></div>`).join('') : '<p class="muted">这一期没有人填写退订理由。</p>';
  bars('reasonBars', d.unsubReasons.map(r => [r[0], r[1], r[0] === 'SPAM' ? 'bad' : 'amber']));

  renderSetup();

  const plan = PB.plan || [];
  $('plan').innerHTML = plan.map(p => `<div class="step"><div class="w">${esc(p.when)}<small>${esc(p.title)}</small></div><ul>${(p.items || []).map(i => `<li>${esc(i)}</li>`).join('')}</ul></div>`).join('');

  const sel = $('docSeg'), keep = sel.value;
  sel.innerHTML = '<option value="all">全部名单 / 不确定</option>' + shown().map(s => `<option value="${esc(s.id)}">${esc(s.name)}（${fmt(segOf(s.id).sub)} 人）</option>`).join('');
  sel.value = keep && [...sel.options].some(o => o.value === keep) ? keep : 'all';
  doctor();

  $('content').hidden = false; $('nav').hidden = false; $('empty').hidden = true; $('loading').hidden = true;
  $('previewBanner').hidden = !preview;
  $('snapSel').disabled = !!preview;
  $('deleteBox').hidden = !!preview || !cur;
}

// ---------- 账户搭建：手册里的 setup（结论 + 若干可折叠分节，每节由通用积木组成）----------
// 积木类型：text / note / table / list / cards / flows。文字里 **加粗**、`标签` 两种标记。
const inl = s => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/`([^`]+)`/g, '<span class="tag">$1</span>');
const FLOW_ST = { new: ['now', '新增'], have: ['safe', '已有方案'], wait: ['slow', '待确认'] };
function blockHtml(b) {
  const h = b.title ? `<h4>${inl(b.title)}</h4>` : '';
  switch (b.type) {
    case 'text': return h + `<p>${inl(b.body)}</p>`;
    case 'note': return h + `<p class="note">${inl(b.body)}</p>`;
    case 'table': return h + `<div class="tscroll"><table><thead><tr>${(b.head || []).map(x => `<th>${inl(x)}</th>`).join('')}</tr></thead><tbody>${(b.rows || []).map(r => `<tr>${r.map(c => `<td>${inl(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
    case 'list': { const t = b.ordered ? 'ol' : 'ul'; return h + `<${t} class="s-list${b.ordered ? ' ord' : ''}">${(b.items || []).map(x => `<li>${inl(x)}</li>`).join('')}</${t}>`; }
    case 'cards': return h + `<div class="s-cards">${(b.items || []).map(c => `<div class="s-card"><span class="big">${inl(c.big)}</span><p>${inl(c.body)}</p></div>`).join('')}</div>`;
    case 'flows': return h + `<div class="s-flows">${(b.items || []).map(f => {
      const st = FLOW_ST[f.status] || FLOW_ST.new;
      return `<article class="s-flow"><div class="s-flow-top"><span class="fid">${esc(f.id || '')}</span><h4>${inl(f.name)}</h4><span class="chip ${st[0]}">${st[1]}</span></div>
        ${f.facts?.length ? `<dl class="s-facts">${f.facts.map(([k, v]) => `<dt>${inl(k)}</dt><dd>${inl(v)}</dd>`).join('')}</dl>` : ''}
        <ol class="s-steps">${(f.steps || []).map(x => `<li class="${x.gate ? 'gate' : ''}"><span class="when">${inl(x.when)}</span><b>${inl(x.what)}</b>${x.why ? `<span class="muted">${inl(x.why)}</span>` : ''}</li>`).join('')}</ol></article>`;
    }).join('')}</div>`;
    default: return '';
  }
}
function renderSetup() {
  const S = PB.setup;
  $('setup').hidden = !S;
  const parts = S?.parts || [];
  if (S) {
    $('setupLede').innerHTML = inl(S.lede || '');
    $('setupVerdict').innerHTML = (S.verdict || []).map((x, i) => `<li><span class="k">${i + 1}</span><div><b>${inl(x.b)}</b><span class="muted">${inl(x.t)}</span></div></li>`).join('');
    $('setupParts').innerHTML = parts.map((p, i) => `<div class="panel s-part" id="setup-${i + 1}"><h3>${inl(p.title)}</h3>${(p.blocks || []).map(blockHtml).join('')}</div>`).join('');
  }
  // 执行手册目录：电脑上是左侧固定目录，手机上是顶部导航里的一排链接
  const groups = [
    ['计划', [['#next', '4 周计划']]],
    ...(S ? [['账户搭建', [['#setup', '三条结论'], ...parts.map((p, i) => ['#setup-' + (i + 1), p.toc || String(p.title).split('：')[0]])]]] : []),
    ['发完复盘', [['#metrics', '看哪 4 个数'], ['#adjust', '看到什么就怎么调'], ['#doctor', '单封诊断器']]]
  ];
  $('toc').innerHTML = groups.map(([g, items]) => `<p class="toc-g">${esc(g)}</p>${items.map(([h, t]) => `<a href="${h}">${inl(t)}</a>`).join('')}`).join('');
  $('linksManual').innerHTML = groups.flatMap(([, items]) => items).map(([h, t]) => `<a href="${h}">${inl(t)}</a>`).join('');
  watchSections();
}

// ---------- 两个视图：名单分析 / 执行手册。按网址里的 #锚点 决定显示哪个，跨视图的链接也能直接跳 ----------
let view = 'analysis';
function setView(v) {
  view = v;
  const m = v === 'manual';
  $('analysis').hidden = m; $('manual').hidden = !m;
  if (PB) $('update').hidden = m;
  $('linksData').hidden = m; $('linksManual').hidden = !m;
  $('tabData').setAttribute('aria-selected', String(!m)); $('tabManual').setAttribute('aria-selected', String(m));
}
function route() {
  if ($('content').hidden) return;
  const id = decodeURIComponent(location.hash.slice(1));
  const el = id && document.getElementById(id);
  if (!el) { setView('analysis'); return; }
  setView($('manual').contains(el) ? 'manual' : 'analysis');
  el.scrollIntoView();
}
addEventListener('hashchange', route);
document.querySelectorAll('.views button').forEach(b => b.addEventListener('click', () => {
  if (location.hash === b.dataset.go) route(); else location.hash = b.dataset.go;
}));

// ---------- 诊断器 ----------
function doctor() {
  const g = id => Math.max(0, +$(id).value || 0);
  const sent = g('docSent'), o = g('docOpen'), c = g('docClick'), u = g('docUnsub'), sp = g('docSpam'), buyRaw = $('docBuy').value, buy = +buyRaw || 0;
  const out = $('docOut');
  if (!sent) { out.innerHTML = '<p class="muted">先填送达人数。</p>'; return; }
  const or = o / sent, cr = c / sent, ur = u / sent, spr = sp / sent, ctor = o ? c / o : 0;
  const lv = (v, bad, ok, inv) => inv ? (v >= bad ? 'bad' : v >= ok ? 'warn' : 'good') : (v < bad ? 'bad' : v < ok ? 'warn' : 'good');
  const L = { bad: ['risk', '偏低'], warn: ['slow', '一般'], good: ['safe', '不错'] };
  const LI = { bad: ['risk', '过高'], warn: ['slow', '注意'], good: ['safe', '正常'] };
  const ms = [
    ['打开率', or, lv(or, .2, .35), L, '主题行和人群是否对得上'],
    ['点击率', cr, lv(cr, .01, .025), L, '内容有没有打动人，最关键'],
    ['点击 / 打开', ctor, lv(ctor, .05, .1), L, '打开的人里有多少人点了'],
    ['退订率', ur, lv(ur, .005, .002, true), LI, '超过 0.5% 说明发错了人或发太勤'],
    ['投诉率', spr, lv(spr, .003, .001, true), LI, '超过 0.1% 会影响以后的送达']
  ];
  let html = ms.map(m => `<div class="metric"><span>${m[0]}</span><span><span class="mv">${(m[1] * 100).toFixed(m[1] < .01 ? 2 : 1)}%</span> <span class="chip ${m[3][m[2]][0]}">${m[3][m[2]][1]}</span></span><span class="ms">${m[4]}</span></div>`).join('');
  if (buyRaw !== '') html += `<div class="metric"><span>点击到成交</span><span class="mv">${c ? (buy / c * 100).toFixed(1) : 0}%</span><span class="ms">点了的人里有多少下单。低于 2% 时要查落地页和价格。</span></div>`;
  const tips = [];
  if (ms[4][2] === 'bad') tips.push('投诉率过高：立刻停止给这群人发推销邮件，检查名单来源，只给最近 3 个月打开过的人发。');
  if (ms[3][2] === 'bad') tips.push('退订率过高：这群人下周停发一次。再发时改成纯内容（教程、实机画面），频率减半。');
  if (ms[0][2] === 'bad') tips.push('打开率低：换主题行（具体画面或问题式，不超过 45 个字符），检查发送时间是不是收件人当地上午。');
  if (ms[0][2] !== 'bad' && ms[1][2] === 'bad') tips.push('打开了但没点：内容不对口。一封只讲一件事、只放一个按钮，先讲使用场景再讲参数。');
  if (buyRaw !== '' && c && buy / c < .02) tips.push('点了但没买：问题在落地页或价格。确认链接直达对应产品，价格和运费写清楚，可以补一封答疑邮件。');
  if (!tips.length && ms[1][2] === 'good' && ms[3][2] === 'good') tips.push('这封效果好。保持这个方向，下个月给这群人加一封同类内容，并把这个话题用到相邻人群上测试。');
  if (!tips.length) tips.push('整体中规中矩。下一封只改一处（主题行或按钮文案）做 A/B 测试，看哪个变量能拉开差距。');
  const segInfo = (PB?.segments || []).find(s => s.id === $('docSeg').value);
  if (segInfo?.dont) tips.push(`这群人（${segInfo.name}）的写法提醒：${segInfo.dont}`);
  out.innerHTML = html + `<div class="advice"><b>下一封怎么调</b>${tips.map(t => `<div style="margin-top:4px">· ${esc(t)}</div>`).join('')}</div>`;
}

// ---------- 期数 ----------
function fillSnapSel() {
  $('snapSel').innerHTML = SNAPS.map(s => `<option value="${esc(s.id)}">${esc(s.label)}${s.source === 'Claude 上传' ? ' · Claude' : ''}</option>`).join('');
  $('snapbar').hidden = !SNAPS.length;
}
async function openSnap(id) {
  $('status').textContent = '';
  cur = await api('/snap/' + encodeURIComponent(id));
  $('snapSel').value = id;
  render();
}
function showEmpty(text) {
  $('loading').hidden = true; $('content').hidden = true; $('nav').hidden = true; $('empty').hidden = false; $('deleteBox').hidden = true;
  if (text) $('emptyText').textContent = text;
}

async function boot() {
  try {
    const r = await api('');
    PB = r.playbook; SNAPS = Array.isArray(r.snapshots) ? r.snapshots : [];
    if (!PB) { showEmpty('分析手册还没有配置，请联系 Claude 先上传手册。'); $('update').hidden = true; return; }
    fillSnapSel();
    if (SNAPS.length) { await openSnap(SNAPS[0].id); route(); } else showEmpty();
  } catch (e) { if (e.message !== '需要口令') { $('loading').textContent = '读取失败：' + e.message; } }
}

// ---------- 上传 ----------
async function loadFiles(files) {
  const st = $('status');
  if (!PB) return;
  st.className = 'status'; st.textContent = '正在读取…';
  const got = { subscribed: [], unsubscribed: [], cleaned: [] }, names = [];
  for (const f of files) {
    if (!/\.csv$/i.test(f.name)) continue;
    const r = MI.toRecords(await f.text());
    if (got[r.kind]) { got[r.kind] = got[r.kind].concat(r.recs); names.push(`${f.name.slice(0, 28)}（${r.kind === 'subscribed' ? '在订' : r.kind === 'unsubscribed' ? '退订' : '无效邮箱'} ${r.recs.length}）`); }
  }
  if (!got.subscribed.length) { st.className = 'status err'; st.textContent = '没找到在订名单。请确认拖入的是 Mailchimp 导出的 subscribed CSV（表头里要有 TAGS 这一列）。'; return; }
  const today = new Date().toISOString().slice(0, 10);
  preview = { data: MI.analyze(got.subscribed, got.unsubscribed, got.cleaned, PB), label: today + ' 导出' };
  $('snapLabel').value = preview.label;
  render();
  st.className = 'status ok'; st.textContent = '已算好：' + names.join('、') + '。请到页面顶部确认并保存。';
  scrollTo({ top: 0, behavior: 'smooth' });
}

$('saveSnap').addEventListener('click', async () => {
  const btn = $('saveSnap');
  btn.disabled = true; btn.textContent = '正在保存…';
  try {
    const label = $('snapLabel').value.trim() || preview.label;
    const r = await api('/snap', { method: 'POST', headers: HDR, body: JSON.stringify({ label, data: preview.data }) });
    SNAPS.unshift(r.snapshot); preview = null; fillSnapSel();
    await openSnap(r.snapshot.id);
    $('status').className = 'status ok'; $('status').textContent = `已保存为新一期"${r.snapshot.label}"。`;
  } catch (e) { $('status').className = 'status err'; $('status').textContent = '保存失败：' + e.message; alertBanner(e.message); }
  finally { btn.disabled = false; btn.textContent = '保存为新一期'; }
});
function alertBanner(msg) { $('previewBanner').querySelector('span').innerHTML = `<b>保存失败：${esc(msg)}</b> 可以再试一次。`; }
$('dropPreview').addEventListener('click', () => { preview = null; $('status').textContent = '已放弃这次的表格。'; if (cur) render(); else showEmpty(); });
$('snapSel').addEventListener('change', e => openSnap(e.target.value).catch(err => { $('status').textContent = err.message; }));

$('delAsk').addEventListener('click', () => { $('delName').textContent = cur.label; $('delConfirm').hidden = false; $('delAsk').hidden = true; });
$('delNo').addEventListener('click', () => { $('delConfirm').hidden = true; $('delAsk').hidden = false; });
$('delYes').addEventListener('click', async () => {
  try {
    await api('/snap/' + encodeURIComponent(cur.id), { method: 'DELETE', headers: HDR });
    const name = cur.label;
    SNAPS = SNAPS.filter(s => s.id !== cur.id); cur = null; fillSnapSel();
    $('delConfirm').hidden = true; $('delAsk').hidden = false;
    if (SNAPS.length) await openSnap(SNAPS[0].id); else showEmpty();
    $('status').className = 'status ok'; $('status').textContent = `已删除"${name}"。`;
  } catch (e) { $('status').className = 'status err'; $('status').textContent = '删除失败：' + e.message; }
});

document.addEventListener('click', e => {
  const cp = e.target.closest('.copy');
  if (cp) {
    const done = () => { cp.textContent = '已复制'; setTimeout(() => cp.textContent = '复制', 1400); };
    const sel = () => { const r = document.createRange(); r.selectNodeContents(cp.previousElementSibling); const s = getSelection(); s.removeAllRanges(); s.addRange(r); cp.textContent = '已选中，按 ⌘C'; };
    try { navigator.clipboard.writeText(cp.dataset.t).then(done, sel); } catch { sel(); }
    return;
  }
  if (e.target.id === 'campMore') {
    document.querySelectorAll('#campRows .more-row').forEach(r => { r.hidden = false; });
    e.target.closest('tr').remove();
    return;
  }
  const h = e.target.closest('.seg button.head');
  if (h) {
    const card = h.parentElement, open = !card.classList.contains('open');
    card.classList.toggle('open', open);
    h.setAttribute('aria-expanded', open);
    h.querySelector('.more').textContent = open ? '收起 －' : '展开写法 ＋';
  }
});
['docSeg', 'docSent', 'docOpen', 'docClick', 'docUnsub', 'docSpam', 'docBuy'].forEach(id => $(id).addEventListener('input', doctor));
$('docForm').addEventListener('submit', e => e.preventDefault());
$('file').addEventListener('change', e => { loadFiles([...e.target.files]); e.target.value = ''; });
$('fileBtn').addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); $('file').click(); } });
const drop = $('drop');
['dragenter', 'dragover'].forEach(t => drop.addEventListener(t, e => { e.preventDefault(); drop.classList.add('over'); }));
['dragleave', 'drop'].forEach(t => drop.addEventListener(t, e => { e.preventDefault(); drop.classList.remove('over'); }));
drop.addEventListener('drop', e => loadFiles([...e.dataTransfer.files]));

const io = new IntersectionObserver(es => es.forEach(en => {
  if (en.isIntersecting) document.querySelectorAll('nav.sec .links a, #toc a').forEach(a => a.classList.toggle('on', a.getAttribute('href') === '#' + en.target.id));
}), { rootMargin: '-45% 0px -50% 0px' });
function watchSections() { io.disconnect(); document.querySelectorAll('main section, .s-part, #adjust').forEach(s => io.observe(s)); }

boot();
