/* 我的工作台 · v5 仪表盘与工作流
   - 今天页顶部「焦点」：一个项目（默认是最近要上线的）还有几天、今天该做什么、做到哪了。
     三种风格画法不同：经典 = 三根进度条；精密 = 交付节点轨道 + 数字；玻璃 = 三个圆环（要交的 / 等别人给的 / 排期节点）。
     下面一排是其他进行中的项目，点一下就把焦点换过去（记在这台设备）。
   - 周报：本周勾掉的、交付的、进行中项目的下一步、在等谁、下周要交的，拼成一段能直接粘贴的文字。
   - 一次催完：「在等谁」里该催的，按人合成一段话，复制一次就能发。
   - 开工包：上次类似的项目、时间表、相关笔记、参考素材，一页看完，一键复制给 AI。 */
(() => {
  const D = window.DESK;
  const { esc } = D;
  D.skin = () => document.documentElement.dataset.skin || 'classic';

  /* ================= 焦点项目 ================= */
  const activeProjects = () => D.state.projects.filter(p => !p.archived_at && ['active', 'live'].includes(D.normStatus(p.status)));
  const nextDue = p => D.delivsOf(p.id).filter(d => d.status !== 'done' && d.due_at).map(d => d.due_at).sort()[0] || '';
  // 先看还没上线的（按上线日），再看没定上线日的（按最近要交的），已经过了上线日的放最后（今天页会单独问「上线了吗」）
  const urgency = p => { const t = D.today(); return p.launch_at && p.launch_at >= t ? '0' + p.launch_at : !p.launch_at ? '1' + (nextDue(p) || '9999') : '2' + p.launch_at; };
  D.dashProjects = () => [...activeProjects()].sort((a, b) => (D.normStatus(a.status) === 'active' ? 0 : 1) - (D.normStatus(b.status) === 'active' ? 0 : 1) || urgency(a).localeCompare(urgency(b)) || a.id - b.id);
  D.focusProject = () => {
    const list = D.dashProjects(); if (!list.length) return null;
    const pick = D.pref.get('today.focus', null);
    return list.find(p => p.id === pick) || list[0];
  };
  // 一个项目的几项进度
  D.projStats = p => {
    const dl = D.delivsOf(p.id), pd = D.pendingsOf(p.id).filter(x => x.status !== 'dropped'), nodes = D.scheduleOf(p.id);
    const waiting = D.sortWaiting(pd.filter(x => x.status === 'waiting' && !D.pendState(x).later));
    return {
      deliv: { done: dl.filter(d => d.status === 'done').length, total: dl.length },
      wait: { done: pd.filter(x => x.status === 'answered').length, total: pd.length, open: waiting, block: waiting.filter(x => x.blocking).length },
      nodes: { done: nodes.filter(n => n.done).length, total: nodes.length, list: nodes },
      days: p.launch_at ? D.diffDays(p.launch_at, D.today()) : null
    };
  };
  const ratio = r => r.total ? r.done / r.total : 0;
  const pie = (r, color = 'var(--accent)') => `<span class="pie" style="--p:${Math.round(ratio(r) * 100)}%;--c:${color}" aria-hidden="true"></span>`;
  D.pie = pie;
  const tLabel = p => { if (!p.launch_at) return '未定'; const d = D.diffDays(p.launch_at, D.today()); return d === 0 ? '今天' : d > 0 ? `T−${d}` : `+${-d}`; };
  D.tLabel = tLabel;

  // 节点轨道：交付物 / 里程碑 / 上线，太多时只留「最近做完的 3 个 + 接下来的 7 个」
  function track(p, s) {
    const today = D.today();
    let nodes = s.nodes.list.filter(n => n.kind !== 'wait');
    if (!nodes.length) nodes = D.delivsOf(p.id).filter(d => d.due_at).sort((a, b) => a.due_at.localeCompare(b.due_at)).map(d => ({ kind: 'deliverable', date: d.due_at, title: D.delivLabel(d), done: d.status === 'done' }));
    if (!nodes.length) return '';
    const first = nodes.findIndex(n => !n.done);
    if (nodes.length > 10) { const k = first < 0 ? nodes.length : first; nodes = nodes.slice(Math.max(0, k - 3), Math.max(0, k - 3) + 10); }
    const cur = nodes.find(n => !n.done);
    const cells = nodes.map(n => {
      const st = n.done ? 'done' : n === cur ? 'now' : n.date < today ? 'late' : '';
      return `<div class="tk ${st}" title="${esc(`${D.fmtDate(n.date)} ${n.title}`)}"><div class="bar"></div><div class="l">${esc(D.firstLine(n.title, 9))}</div><div class="d">${esc(n.date.slice(5).replace('-', '.'))}</div></div>`;
    });
    if (p.launch_at && !nodes.some(n => n.date === p.launch_at && /上线/.test(n.title))) cells.push(`<div class="tk launch"><div class="bar"></div><div class="l">上线</div><div class="d">${esc(p.launch_at.slice(5).replace('-', '.'))}</div></div>`);
    return `<div class="track" style="--n:${cells.length}">${cells.join('')}</div>`;
  }
  // 三个圆环（玻璃风）
  function rings(s) {
    const R = [[74, s.deliv, 'r1'], [55, s.wait, 'r2'], [36, s.nodes, 'r3']];
    return `<svg class="rings" viewBox="0 0 168 168" aria-hidden="true"><defs>
      <linearGradient id="dash-r1"><stop offset="0" stop-color="#ff2d55"/><stop offset="1" stop-color="#ff6b3d"/></linearGradient>
      <linearGradient id="dash-r2"><stop offset="0" stop-color="#ff9f0a"/><stop offset="1" stop-color="#ffd60a"/></linearGradient>
      <linearGradient id="dash-r3"><stop offset="0" stop-color="#30d158"/><stop offset="1" stop-color="#66e3c4"/></linearGradient></defs>
      ${R.map(([r, v, c]) => { const C = 2 * Math.PI * r, k = v.total ? Math.max(0.02, ratio(v)) : 0; return `<circle class="rt ${c}" cx="84" cy="84" r="${r}"/><circle class="rp ${c}" cx="84" cy="84" r="${r}" stroke="url(#dash-${c})" stroke-dasharray="${C.toFixed(1)}" stroke-dashoffset="${(C * (1 - k)).toFixed(1)}" style="--c0:${C.toFixed(1)}"/>`; }).join('')}</svg>`;
  }
  const meters = s => [['要交的', s.deliv, 'm1'], ['等别人给的', s.wait, 'm2'], ['排期节点', s.nodes, 'm3']].map(([l, v, c]) => `<div class="meter ${c}"><span class="ml"><i></i>${l}</span><b>${v.total ? `${v.done} / ${v.total}` : '—'}</b><span class="mb"><i style="width:${Math.round(ratio(v) * 100)}%"></i></span></div>`).join('');

  D.dashCard = () => {
    const p = D.focusProject();
    if (!p) return '';
    const s = D.projStats(p), skin = D.skin(), today = D.today();
    const d = s.days, nn = D.nextNode(p.id);
    const big = d == null ? '上线日未定' : d > 0 ? `还有 <em>${d} 天</em>` : d === 0 ? '<em>今天</em>上线' : `已过上线日 <em>${-d} 天</em>`;
    const doNow = p.next_action || (nn ? `${nn.date <= today ? '今天该' : `${D.fmtDate(nn.date)}前`}${nn.kind === 'deliverable' ? '交' : ''}${nn.title}` : '');
    const w = s.wait.open[0];
    const sum = [s.deliv.total ? `要交的 ${s.deliv.total} 件里已经交了 ${s.deliv.done} 件` : '还没有登记交付物',
      w ? `「${D.firstLine(w.question, 16)}」还在等${w.ask_whom || '对方'}${D.pendState(w).level === 'danger' ? '，已经过了最晚日期' : ''}` : s.wait.total ? '等别人给的都到齐了' : ''].filter(Boolean).join('；') + '。';
    const others = D.dashProjects();
    const strip = others.length > 1 ? `<div class="dstrip">${others.slice(0, 6).map(x => { const ps = D.projStats(x); return `<button type="button" class="dp${x.id === p.id ? ' on' : ''}" data-focus="${x.id}" title="${esc(x.title)}">${pie(ps.deliv)}<span class="dpt">${esc(x.title)}</span><span class="dpd ${ps.days != null && ps.days <= 3 ? 'hot' : ''}">${esc(tLabel(x))}</span></button>`; }).join('')}</div>` : '';
    const stats = `<div class="dstats"><div><b>${s.deliv.done}/${s.deliv.total}</b><span>要交的</span></div><div class="${s.wait.block ? 'bad' : ''}"><b>${s.wait.block || s.wait.open.length}</b><span>${s.wait.block ? '卡交付' : '在等'}</span></div><div><b>${p.launch_at ? esc(p.launch_at.slice(5).replace('-', '.')) : '—'}</b><span>${p.launch_tentative ? '暂定上线' : '上线日'}</span></div></div>`;
    const legend = `<div class="dlegend">${[['要交的', s.deliv, 'r1'], ['等别人给的', s.wait, 'r2'], ['排期节点', s.nodes, 'r3']].map(([l, v, c]) => `<div><i class="${c}"></i>${l}<b>${v.total ? `${v.done} / ${v.total}` : '—'}</b></div>`).join('')}</div>`;
    const text = `<div class="dtext"><div class="eyebrow"><span class="live"></span>${d != null && d >= 0 ? '下一个上线' : '焦点项目'} · <button type="button" class="link-btn" data-open-project="${p.id}">${esc(p.title)}</button></div>
      <div class="dbig">${big}${doNow ? `<span class="dnow">，${esc(D.firstLine(doNow, 30))}</span>` : ''}</div>
      <p class="dsum">${esc(sum)}</p></div>`;
    const visual = skin === 'glass' ? `<div class="dvis">${rings(s)}</div>` : '';
    return `<section class="card-box dash s12 lift" data-skin-dash="${skin}">
      ${skin === 'glass' ? `<div class="dgrid">${visual}<div>${text}${legend}</div></div>` : skin === 'precise' ? `${text}${stats}${track(p, s)}` : `<div class="dgrid">${text}<div class="meters">${meters(s)}</div></div>`}
      ${strip}</section>`;
  };

  /* ================= 通用的大弹窗 ================= */
  const sheet = () => D.$('#sheet');
  D.openSheet = (title, html, { wide = true } = {}) => {
    D.$('#sheet-title').textContent = title;
    D.$('#sheet-body').innerHTML = html;
    sheet().classList.toggle('wide', wide);
    if (!sheet().open) sheet().showModal();
    return D.$('#sheet-body');
  };

  /* ================= 周报 ================= */
  D.weeklyText = (today = D.today()) => {
    const mon = D.weekMonday(today), nextMon = D.addDays(mon, 7), nextSun = D.addDays(mon, 13);
    const inWeek = s => s && s >= mon && s <= today;
    const pn = id => id ? D.projectName(id) : '';
    const doneDel = D.state.deliverables.filter(d => d.status === 'done' && inWeek(d.delivered_at));
    const doneTask = D.state.tasks.filter(t => t.done && !t.deliverable_id && inWeek(t.done_at));
    const lines = [`本周工作小结（${D.fmtDate(mon)}—${D.fmtDate(today)}）`, ''];
    lines.push('一、完成');
    if (!doneDel.length && !doneTask.length) lines.push('- （本周还没有勾掉的事）');
    const byProj = new Map();
    for (const d of doneDel) { const k = pn(d.project_id); if (!byProj.has(k)) byProj.set(k, []); byProj.get(k).push(`交付 ${D.delivLabel(d)}`); }
    for (const t of doneTask) { const k = pn(t.project_id); if (!byProj.has(k)) byProj.set(k, []); byProj.get(k).push(t.title); }
    for (const [k, items] of byProj) lines.push(`- ${k ? `【${k}】` : ''}${items.join('；')}`);
    lines.push('', '二、进行中');
    const act = D.dashProjects();
    if (!act.length) lines.push('- （没有进行中的项目）');
    for (const p of act) {
      const s = D.projStats(p);
      lines.push(`- 【${p.title}】${p.launch_at ? `${D.fmtDate(p.launch_at)}${p.launch_tentative ? '（暂定）' : ''}上线；` : ''}交付 ${s.deliv.done}/${s.deliv.total}${p.next_action ? `；下一步：${p.next_action}` : ''}`);
    }
    const waits = D.sortWaiting(D.state.pendings.filter(x => x.status === 'waiting' && D.projOk(x.project_id) && !D.pendState(x).later));
    if (waits.length) {
      lines.push('', '三、需要协调');
      for (const x of waits.slice(0, 8)) lines.push(`- ${x.question}（${x.ask_whom || '—'}${x.blocking ? '，影响交付' : ''}${x.need_by ? `，${D.fmtDate(x.need_by)}前要` : ''}）${x.project_id ? ` — ${pn(x.project_id)}` : ''}`);
    }
    const nextD = D.state.deliverables.filter(d => d.status !== 'done' && d.due_at && d.due_at >= nextMon && d.due_at <= nextSun && D.projOk(d.project_id));
    const nextL = D.state.projects.filter(p => p.launch_at && p.launch_at >= nextMon && p.launch_at <= nextSun && D.projOk(p.id));
    lines.push('', `${waits.length ? '四' : '三'}、下周计划`);
    if (!nextD.length && !nextL.length) lines.push('- （下周还没有排到期的交付）');
    for (const x of [...nextD.map(d => ({ date: d.due_at, t: `交 ${D.delivLabel(d)}（${pn(d.project_id)}）` })), ...nextL.map(p => ({ date: p.launch_at, t: `${p.title} ${p.launch_tentative ? '暂定' : ''}上线` }))].sort((a, b) => a.date.localeCompare(b.date)))
      lines.push(`- ${D.fmtDate(x.date)}（${D.wk(x.date)}）${x.t}`);
    return lines.join('\n');
  };
  function openWeekly() {
    const body = D.openSheet('生成周报', `<p class="muted small">按这周勾掉的待办、交付的东西、进行中项目的下一步和在等谁拼好了。可以先改再复制。</p>
      <textarea class="mono-text" rows="18" data-weekly aria-label="周报">${esc(D.weeklyText())}</textarea>
      <div class="row end"><button type="button" class="btn sm ghost" data-sheet-close>关闭</button><button type="button" class="btn sm" data-weekly-copy>${D.icon('copy', 'sm')}复制周报</button></div>`);
    body.querySelector('[data-weekly-copy]').onclick = () => D.copy(body.querySelector('[data-weekly]').value, '周报');
  }
  D.weekly = { open: openWeekly };

  /* ================= 一次催完：按人合成一段话 ================= */
  const HONOR = /(老师|总|经理|主任|领导|姐|哥|同学|老板)$/;
  const whoOf = x => { const n = (x.ask_name || '').trim(); return n ? (HONOR.test(n) ? n : n + '老师') : x.ask_whom === '领导' ? '领导' : '您好'; };
  D.nudgeDue = () => D.sortWaiting(D.state.pendings.filter(x => x.status === 'waiting' && D.projOk(x.project_id) && !D.pendState(x).later
    && (D.pendState(x).level || x.blocking)));
  D.nudgeGroups = () => {
    const g = new Map();
    for (const x of D.nudgeDue()) { const k = (x.ask_name || '').trim() || x.ask_whom || '其他'; if (!g.has(k)) g.set(k, []); g.get(k).push(x); }
    return [...g.entries()].map(([k, items]) => {
      if (items.length === 1) return { k, items, text: D.nudgeText(items[0]) };
      const again = items.some(x => (x.nudge_count || 0) >= 1);
      const body = items.map((x, i) => { const p = x.project_id && D.project(x.project_id); const q = String(x.question || '').trim().replace(/[？?。.!！\s]+$/, '');
        return `${i + 1}. ${p ? p.title.replace(/[（(].*?[)）]/g, '').trim() + '：' : ''}${q}${x.need_by ? `（${D.fmtDate(x.need_by)}前要）` : ''}`; }).join('\n');
      return { k, items, text: `${whoOf(items[0])}，${again ? '不好意思再跟您确认一下，' : ''}有几件事想跟您确认：\n${body}\n方便的话今天给我回一下，谢谢～` };
    });
  };
  function openNudgeAll() {
    const groups = D.nudgeGroups();
    if (!groups.length) return D.toast('现在没有该催的事');
    const body = D.openSheet('一次催完', `<p class="muted small">过了最晚日期、快到期、卡交付的，按问谁合成了一段话。复制后会给里面每一条记一次催办。</p>
      ${groups.map((g, i) => `<section class="ngroup" data-ng="${i}"><h4>${esc(g.k)} <small class="muted">${g.items.length} 件</small></h4>
        <textarea rows="${Math.min(9, g.items.length + 3)}" aria-label="给${esc(g.k)}的话">${esc(g.text)}</textarea>
        <div class="row end"><button type="button" class="btn sm" data-ng-copy="${i}">${D.icon('copy', 'sm')}复制并记 ${g.items.length} 次催办</button></div></section>`).join('')}`, { wide: false });
    body.onclick = async e => {
      const b = e.target.closest('[data-ng-copy]'); if (!b) return;
      const g = groups[Number(b.dataset.ngCopy)], text = body.querySelector(`[data-ng="${b.dataset.ngCopy}"] textarea`).value.trim();
      await D.copy(text, `给${g.k}的催办`);
      b.disabled = true; b.textContent = '已复制';
      for (const x of g.items) {
        try { const r = await D.api('POST', `/pendings/${x.id}/nudge`, { date: D.today(), text }); D.put('pendings', r.item); if (r.activity) D.emit('activity', r.activity); }
        catch (err) { D.fail(err); break; }
      }
      D.render();
    };
  }
  D.nudgeAll = { open: openNudgeAll };

  /* ================= 开工包 ================= */
  const words = t => String(t || '').replace(/[（(].*?[)）]/g, ' ').split(/[\s·：:，,、「」『』—\-_/]+/).filter(w => w.length >= 2 && !/^\d+$/.test(w) && !/^(示例|活动|项目|20\d\d)$/.test(w));
  D.similarProjects = (p, n = 3) => {
    const mine = words(p.title);
    return D.state.projects.filter(x => x.id !== p.id).map(x => {
      let s = 0;
      if (p.kind && x.kind === p.kind) s += 3;
      if (p.province && x.province === p.province) s += 3;
      const tw = words(x.title); for (const w of mine) if (tw.some(v => v.includes(w) || w.includes(v))) s += 2;
      if (D.normStatus(x.status) === 'done') s += 1;
      return { x, s };
    }).filter(r => r.s >= 3).sort((a, b) => b.s - a.s || (b.x.launch_at || '').localeCompare(a.x.launch_at || '')).slice(0, n).map(r => r.x);
  };
  D.kickpackText = p => {
    const L = [`# 开工包：${p.title}`, '', '## 这个项目',
      `- 省份 / 类型：${p.province || '全国'} / ${p.kind || '—'}`,
      `- 上线日：${p.launch_at ? `${p.launch_at}${p.launch_tentative ? '（暂定）' : ''}` : '未定'}`,
      p.summary ? `- 一句话需求：${p.summary.replace(/\s+/g, ' ')}` : '', p.next_action ? `- 下一步：${p.next_action}` : ''].filter(Boolean);
    const settled = D.settledOf(p.id);
    if (settled.length) L.push('', '## 已拍板的口径', ...settled.map(x => `- ${x.kind === 'decision' ? `${x.who}定` : `${x.who}答复`}：${x.text}`));
    const w = D.waitingOf(p.id);
    if (w.length) L.push('', '## 还在等的（没定的不要自己编，标「待确认」）', ...w.map(x => `- ${x.question}（问${x.ask_whom || '—'}）`));
    const sim = D.similarProjects(p);
    if (sim.length) L.push('', '## 上次类似的项目（参考结构和做法，不要照搬数值）', ...sim.map(x => { const dl = D.delivsOf(x.id).filter(d => d.status === 'done'); return `- ${x.title}${x.launch_at ? `（${x.launch_at} 上线）` : ''}${dl.length ? `：交付了 ${dl.map(D.delivLabel).join('、')}` : ''}${x.summary ? `；${D.firstLine(x.summary, 60)}` : ''}`; }));
    const notes = D.kbRelated ? D.kbRelated(p) : [];
    if (notes.length) L.push('', '## 知识库里相关的笔记（先读这些）', ...notes.map(n => `- ${n.path}（${n.title}）`));
    const ref = D.assetSuggest ? D.assetSuggest(p, 12) : [];
    const dirs = [...new Set(ref.map(f => f.path.split('/').slice(0, -1).join('/')))].slice(0, 6);
    if (dirs.length) L.push('', `## 可以参考的素材文件夹（在「${D.assets.rootName}」下）`, ...dirs.map(d => `- ${d}`));
    return L.join('\n');
  };
  function openKickpack(p) {
    const sim = D.similarProjects(p), notes = D.kbRelated ? D.kbRelated(p) : [], ref = D.assetSuggest ? D.assetSuggest(p, 8) : [];
    const nodes = D.scheduleOf(p.id), tls = D.state.timelines.filter(t => !t.kind || t.kind === p.kind);
    D.kickRef = ref;
    const body = D.openSheet(`开工包 · ${p.title}`, `<div class="kp">
      <section><h4>${D.icon('folders', 'sm')}上次类似的项目</h4>${sim.length ? `<ul class="kp-list">${sim.map(x => { const dl = D.delivsOf(x.id).filter(d => d.status === 'done'); return `<li><button type="button" class="link-btn" data-open-project="${x.id}">${esc(x.title)}</button> ${D.statusChip(x.status)}<small class="muted">${x.launch_at ? esc(D.fmtDate(x.launch_at)) + ' 上线 · ' : ''}${dl.length ? '交付了 ' + esc(dl.map(D.delivLabel).join('、')) : '没登记交付物'}</small></li>`; }).join('')}</ul>` : '<p class="muted small">没找到同省份或同类型的过往项目。</p>'}</section>
      <section><h4>${D.icon('calendar', 'sm')}排期</h4>${nodes.length ? `<p class="small">已经排了 ${nodes.length} 个节点，做完 ${nodes.filter(n => n.done).length} 个。</p>` : `<p class="muted small">还没排期。${tls.length ? `可以用「${esc(tls[0].name)}」一键排。` : ''}</p><button type="button" class="tb" data-kp-sched>去排期</button>`}</section>
      <section><h4>${D.icon('book', 'sm')}知识库里相关的笔记</h4>${!D.kb?.files.length ? '<p class="muted small">知识库还没接进工作台。</p>' : notes.length ? `<ul class="kp-list">${notes.map(n => `<li><button type="button" class="link-btn" data-kb-open="${esc(n.path)}">${esc(n.title)}</button><small class="muted">${esc(n.path)}</small></li>`).join('')}</ul>` : '<p class="muted small">没找到明显相关的笔记。</p>'}</section>
      <section><h4>${D.icon('image', 'sm')}可以参考的素材</h4>${!D.assets?.files.length ? '<p class="muted small">素材库还没连上本机文件夹。</p>' : ref.length ? `<div class="thumbs kp-thumbs">${ref.map((x, i) => D.assetThumb(x, i, 'kick')).join('')}</div>` : '<p class="muted small">没找到明显相关的素材。</p>'}</section>
      </div>
      <div class="row end"><button type="button" class="btn sm ghost" data-sheet-close>关闭</button><button type="button" class="btn sm" data-kp-copy>${D.icon('copy', 'sm')}复制开工包给 AI</button></div>`);
    body.querySelector('[data-kp-copy]').onclick = () => D.copy(D.kickpackText(p), '开工包');
    const sb = body.querySelector('[data-kp-sched]'); if (sb) sb.onclick = () => { sheet().close(); D.app.openProject(p.id, 'schedule'); };
    D.hydrateThumbs?.(body, ref);
  }
  D.kickpack = { open: openKickpack };

  /* ================= 事件 ================= */
  document.addEventListener('click', e => {
    const f = e.target.closest('[data-focus]');
    if (f) { D.pref.set('today.focus', Number(f.dataset.focus)); return D.render(true); }
    if (e.target.closest('[data-weekly-open]')) return openWeekly();
    if (e.target.closest('[data-nudge-all]')) return openNudgeAll();
    const k = e.target.closest('[data-kickpack]'); if (k) return openKickpack(D.project(k.dataset.kickpack));
    if (e.target.closest('[data-sheet-close]')) return sheet().close();
    if (sheet()?.open && (e.target.closest('#sheet [data-open-project]') || e.target.closest('#sheet [data-kb-open]'))) sheet().close();
  });
})();
