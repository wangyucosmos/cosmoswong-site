/* 我的工作台 · 项目（v2）
   - 项目列表：按省份分组的卡片，已交付的折起来（不再是可配置列的表格和看板）
   - 项目页：一页从上往下读——下一步 → 待确认 → 已拍板的口径 → 交付物 → 待办；右边是 AI 交接（点工具名就复制开工提示词、比稿、回填）、排期、动态、资料
   - v5：不再问用时（交付日期、版本本来就记着，「记录 → 交付记录」里能看）；交付前检查只提醒，不拦着
   - v5：项目页加「开工包」（dash.js）和「参考素材」（素材库里钉住的 + 推荐的） */
(() => {
  const D = window.DESK;
  const { esc } = D;
  const ORDER = { active: 0, live: 1, watch: 2, paused: 3, done: 4 };
  const aiDraft = {};   // 项目 id → { tool, text, todo, compare: {工具: 提示词} }（只在这次打开页面期间有效）

  D.matchSearchP = (p, q) => {
    if (!q) return true;
    const hay = [p.title, p.summary, p.next_action, p.notes, p.requester, p.province, (p.tags || []).join(' '),
      ...D.pendingsOf(p.id).map(x => x.question), ...D.decisionsOf(p.id).map(x => x.content)].join('\n').toLowerCase();
    return q.toLowerCase().split(/\s+/).filter(Boolean).every(w => hay.includes(w));
  };

  /* ================= 项目列表 ================= */
  function card(p) {
    const st = D.normStatus(p.status), g = D.progressOf(p.id), w = D.waitingOf(p.id), block = w.some(x => x.blocking), nn = D.nextNode(p.id);
    const late = p.launch_at && p.launch_at < D.today() && st === 'active';
    const soon = p.launch_at && st === 'active' && D.diffDays(p.launch_at, D.today()) >= 0 && D.diffDays(p.launch_at, D.today()) <= 7;
    return `<article class="pcard st-${st}" data-open-project="${p.id}" tabindex="0" aria-label="${esc(p.title)}">
      <header><h4>${esc(p.title)}</h4>${D.statusChip(p.status)}</header>
      ${p.launch_at ? `<p class="pl due ${late ? 'overdue' : soon ? 'soon' : ''}">${D.icon('diamond', 'sm')} ${esc(D.launchText(p))}</p>` : st === 'done' ? (p.month ? `<p class="pl muted">${D.icon('calendar', 'sm')} ${esc(p.month.replace('-', ' 年 ').replace(/ 0?(\d+)$/, ' $1'))} 月</p>` : '') : `<p class="pl muted">${D.icon('calendar', 'sm')} 上线日未定</p>`}
      ${p.next_action ? `<span class="pn">${esc(p.next_action)}</span>` : p.summary && st === 'done' ? `<span class="pn">${esc(D.firstLine(p.summary, 60))}</span>` : ''}
      <footer>${g.total ? `<span class="prog${g.done === g.total ? ' full' : ''}">${D.icon('box', 'sm')} ${g.done}/${g.total}</span><span class="bar"><i style="width:${Math.round(g.done / g.total * 100)}%"></i></span>` : ''}${w.length ? `<span class="cnt${block ? ' block' : ''}">${D.icon('hourglass', 'sm')} 在等 ${w.length}${block ? ' · 卡交付' : ''}</span>` : ''}${nn && st !== 'done' ? `<span class="muted small">下一个：${esc(D.offsetLabel(nn.off))} ${esc(D.firstLine(nn.title, 16))}</span>` : ''}</footer>
    </article>`;
  }
  D.renderProjects = (view, el) => {
    const list = D.state.projects.filter(p => D.matchSearchP(p, D.pq));
    const live = list.filter(p => !p.archived_at), archived = list.filter(p => p.archived_at);
    const provs = D.cfg().provinces, keyOf = p => p.province || '';
    const keys = [...provs.filter(v => live.some(p => keyOf(p) === v)), ...[...new Set(live.map(keyOf))].filter(v => v && !provs.includes(v)), ...(live.some(p => !keyOf(p)) ? [''] : [])];
    const groups = keys.map(k => {
      const ps = live.filter(p => keyOf(p) === k).sort((a, b) => ORDER[D.normStatus(a.status)] - ORDER[D.normStatus(b.status)] || (a.launch_at || '9999').localeCompare(b.launch_at || '9999') || a.id - b.id);
      const open = ps.filter(p => D.normStatus(p.status) !== 'done'), done = ps.filter(p => D.normStatus(p.status) === 'done');
      // 这个省现在没有在做的：直接摆出过往项目（来新需求时一眼看到上次做了什么）；有在做的：过往的折起来
      const act = open.filter(p => ['active', 'live'].includes(D.normStatus(p.status))).length, other = open.length - act;
      const shown = open.length + (act ? 0 : done.length);
      return `<section class="pgroup${shown > 2 ? ' wide' : ''}"><h3>${k ? esc(k) : '全国 / 没填省份'} <span class="gcount">${[act ? `进行中 ${act}` : '', other ? `暂缓 / 观望 ${other}` : '', done.length ? `已交付 ${done.length}` : ''].filter(Boolean).join(' · ')}</span></h3>
        ${open.length ? `<div class="pcards">${open.map(card).join('')}</div>` : ''}
        ${done.length ? (act ? `<details class="done-fold" ${D.pq ? 'open' : ''}><summary>已交付 ${done.length} 个</summary><div class="pcards">${done.map(card).join('')}</div></details>` : `<div class="pcards">${done.map(card).join('')}</div>`) : ''}</section>`;
    }).join('');
    el.innerHTML = `<div class="page projects">
      <div class="ptools"><input class="filter" type="search" data-pfilter data-keep-focus="pq" value="${esc(D.pq || '')}" placeholder="筛选：项目名、待确认、拍板的口径…" aria-label="筛选项目"><span class="muted small hint-text">按省份分组；已交付的折起来了，点开就能看到上次做了什么。</span></div>
      ${groups ? `<div class="pgroups">${groups}</div>` : (D.state.projects.length ? '<p class="empty-state">没有符合条件的项目。</p>'
        : `<div class="empty-state"><div class="big-i">${D.icon('folders')}</div><p>还没有项目。</p><p>把业务方的需求粘进收集箱，让 AI 拆完贴回来；或者直接新建一个。</p><p><button type="button" class="btn" data-new-project>＋ 新建项目</button></p></div>`)}
      ${archived.length ? `<details class="done-fold"><summary>已归档 ${archived.length} 个</summary><div class="pcards">${archived.map(card).join('')}</div></details>` : ''}
    </div>`;
  };

  /* ================= 项目页 ================= */
  const fold = id => D.pref.get('fold.' + id, null);
  const sec = (id, title, body, { folded, extra = '', cls = '' } = {}) => {
    if (folded === undefined) return `<section class="psec ${cls}" id="sec-${id}"><h3>${title}${extra}</h3>${body}</section>`;
    const open = fold(id) ?? !folded;
    return `<details class="psec ${cls}" id="sec-${id}" data-fold="${id}" ${open ? 'open' : ''}><summary><h3>${title}${extra}</h3></summary>${body}</details>`;
  };

  function nowBlock(p) {
    const nn = D.nextNode(p.id), st = D.normStatus(p.status);
    const ask = st === 'active' && p.launch_at && p.launch_at < D.today();
    return `${ask ? `<div class="ask-launch" data-launch-ask="${p.id}"><span>${D.icon('rocket', 'sm')} ${p.launch_tentative ? '暂定' : '原定'} ${esc(D.fmtDate(p.launch_at))} 上线，已经过了：上线了吗？</span>
        <span class="row-btns"><button type="button" class="btn sm" data-launched>已上线</button><button type="button" class="btn sm ghost" data-reschedule>改期</button></span></div>` : ''}
      ${st === 'watch' ? `<p class="hint">${D.icon('eye', 'sm')} 观望中：不一定是你做，这个项目的事不会出现在「今天」。轮到你做了，把状态改成「进行中」。</p>` : ''}
      <section class="psec now"><label class="fl" for="p-next">下一步（写成能直接动手的一句话）</label>
        <input id="p-next" data-f="next_action" value="${esc(p.next_action || '')}" maxlength="300" placeholder="如：周二前把原型 V2 发群">
        ${nn ? `<p class="muted small nn">${D.icon('target', 'sm')} 下一个节点：<b>${esc(D.offsetLabel(nn.off))} ${D.KIND_ICON[nn.kind]} ${esc(nn.title)}</b>（${esc(D.fmtDate(nn.date))} ${D.wk(nn.date)}${nn.date < D.today() ? `，已过 ${D.diffDays(D.today(), nn.date)} 天` : ''}）</p>` : ''}
      </section>`;
  }

  function pendBlock(p) {
    const all = D.pendingsOf(p.id).filter(x => x.status === 'waiting');
    const later = all.filter(x => D.pendState(x).later), now = D.sortWaiting(all.filter(x => !D.pendState(x).later));
    return sec('pendings', '在等谁', `${now.length ? `<ul class="wlist">${now.map(x => D.pendingRow(x, { showProject: false })).join('')}</ul>` : '<p class="muted">现在没有要催的事。业务方口头说了、还没定下来的口径，都可以记在这里。</p>'}
      ${later.length ? `<details class="later-box"><summary>还没到催的时候（${later.length}）</summary><ul class="wlist">${later.map(x => D.pendingRow(x, { showProject: false })).join('')}</ul></details>` : ''}
      ${D.pendingForm(p.id)}`, { extra: ` <span class="gcount">${all.length}</span>` });
  }

  function settledBlock(p) {
    const list = D.settledOf(p.id);
    const dropped = D.pendingsOf(p.id).filter(x => x.status === 'dropped');
    return sec('settled', '已拍板的口径', `<p class="muted small hint-text">业务方的答复和你自己的决定都在这里，生成开工提示词时每个 AI 都会看到，免得几个 AI 各按各的记录走。</p>
      <ul class="settled">${list.map(x => `<li data-settled="${x.kind}:${x.ref.id}"><span class="sd">${esc(x.date ? D.fmtDate(x.date) : '')}</span><span class="sw">${esc(x.kind === 'decision' ? x.who + '定' : x.who + '答复')}</span><span class="st-text">${esc(x.text)}</span>${x.kind === 'decision' ? '<button type="button" class="x" data-dec-del aria-label="删除">×</button>' : '<button type="button" class="icon" data-pmore-settled title="编辑或重新打开" aria-label="更多">⋯</button>'}</li>`).join('') || '<li class="muted">还没有。</li>'}</ul>
      <form class="add-row" data-dec-add><input name="content" maxlength="1000" placeholder="＋ 记一条拍板的，如：以 Claude 版为底稿，Codex 版不再推进" aria-label="拍板的内容">
        <select name="source" aria-label="谁定的">${D.selectOpts(['我', '领导', '业务方', '设计师', '搭建同事', '开发'], '我')}</select><input name="date" type="date" value="${D.today()}" aria-label="日期"><button class="tb">记下</button></form>
      ${dropped.length ? `<details class="later-box"><summary>不需要了的待确认（${dropped.length}）</summary><ul class="wlist">${dropped.map(x => D.pendingRow(x, { showProject: false })).join('')}</ul></details>` : ''}`,
      { extra: ` <span class="gcount">${list.length}</span>` });
  }

  function delivBlock(p) {
    const list = D.delivsOf(p.id), g = D.progressOf(p.id);
    return sec('delivs', '交付物', `<ul class="dlist">${list.map(d => {
      const r = d.status === 'done' ? { text: d.delivered_at ? `${D.fmtDate(d.delivered_at)} 交付` : '已交付', cls: 'ok' } : D.rel(d.due_at);
      return `<li class="ditem${d.status === 'done' ? ' done' : ''}" data-deliv="${d.id}">
        <div class="drow">
          <button type="button" class="pickbtn slim" data-dpick="status" title="状态">${D.delivChip(d.status)}</button>
          <input class="dname-in" data-df="name" value="${esc(d.name || '')}" placeholder="${esc(d.type)}" maxlength="80" aria-label="名称">
          <button type="button" class="pickbtn slim" data-dpick="type" title="类型">${esc(d.type)}</button>
          <input class="dver" data-df="version" value="${esc(d.version || '')}" placeholder="版本" maxlength="20" aria-label="版本">
          <button type="button" class="tb slim" data-ddue title="截止日">${d.offset_days != null ? `<small class="muted">${esc(D.offsetLabel(d.offset_days))}</small> ` : ''}<span class="due ${r.cls}">${esc(r.text || '截止日')}</span></button>
          <button type="button" class="icon" data-dmore aria-label="更多">${D.icon('more')}</button>
        </div>
        <div class="drow2">
          <label class="lbl inline grow">底稿<input data-df="base" value="${esc(d.base || '')}" maxlength="200" placeholder="哪一版、谁做的，如：Figma 手改版 3" aria-label="当前底稿"></label>
          <label class="lbl inline grow">位置<input data-df="file_hint" value="${esc(d.file_hint || '')}" maxlength="300" placeholder="文件名或文件夹" aria-label="文件位置"></label>
        </div>
        <div class="drow3">
          <label class="check" title="写进提示词：这一版是你手改的，AI 只能改你指定的地方，其余原样保留"><input type="checkbox" data-dcheck="base_locked" ${d.base_locked ? 'checked' : ''}> 我手改的，AI 不得改动</label>
          ${d.status !== 'done' ? `<button type="button" class="btn sm" data-deliver>${D.icon('check', 'sm')}标成已交付</button>` : ''}
        </div>
      </li>`;
    }).join('') || '<li class="muted">还没有交付物。用右边「排期」一键生成，或者在下面手动加。</li>'}</ul>
      <form class="add-row" data-deliv-add>
        <select name="type" aria-label="交付物类型">${D.selectOpts(D.cfg().deliverable_types, '')}</select>
        <input name="name" placeholder="名称（可不填）" maxlength="80" aria-label="名称">
        <input name="version" placeholder="版本" maxlength="20" aria-label="版本" class="w80">
        <input name="due" type="date" aria-label="截止日">
        <button class="tb">添加</button></form>`, { extra: g.total ? ` <span class="gcount">${g.done}/${g.total}</span>` : '' });
  }

  function taskBlock(p) {
    const list = D.openTasks(p.id).sort((a, b) => a.done - b.done || (a.due_at || '9999').localeCompare(b.due_at || '9999') || a.id - b.id);
    const open = list.filter(t => !t.done), done = list.filter(t => t.done);
    const row = t => { const r = t.done ? { text: '', cls: '' } : D.rel(t.due_at);
      return `<li class="${t.done ? 'done' : ''}" data-task="${t.id}"><label><input type="checkbox" data-task-done ${t.done ? 'checked' : ''}> <span>${t.milestone ? D.icon('flag', 'sm') + ' ' : ''}${esc(t.title)}</span></label>
        ${t.offset_days != null ? `<small class="muted">${esc(D.offsetLabel(t.offset_days))}</small>` : ''}
        <button type="button" class="tb slim" data-tdue><span class="due ${r.cls}">${esc(t.due_at ? (t.done ? D.fmtDate(t.due_at) : r.text) : '日期')}</span></button>
        <button type="button" class="x" data-task-del aria-label="删除待办">×</button></li>`; };
    return sec('tasks', '待办', `<ul class="tasks">${open.map(row).join('') || '<li class="muted">没有没做完的待办。</li>'}</ul>
      ${done.length ? `<details class="later-box"><summary>做完的（${done.length}）</summary><ul class="tasks">${done.map(row).join('')}</ul></details>` : ''}
      <form class="sub-add" data-task-add><input name="title" placeholder="＋ 添加待办，回车保存" maxlength="200" aria-label="新待办"><input name="due" type="date" aria-label="截止日期"><button class="tb">添加</button></form>`,
      { extra: ` <span class="gcount">${open.length}</span>` });
  }

  function aiBlock(p) {
    const st = aiDraft[p.id] || {};
    const tools = D.cfg().ai_tools.filter(x => x !== '我自己');
    const cmp = p.compare;
    return sec('ai', 'AI 交接', `
      <input class="todo-in" data-ai-todo value="${esc(st.todo ?? '')}" maxlength="200" placeholder="这次要 AI 做什么，如：按领导意见改原型 V2 的抽奖模块" aria-label="这次要做什么">
      <div class="kick"><span class="muted small">点工具名 → 开工提示词直接复制好：</span>${tools.map(t => `<button type="button" class="btn sm ghost" data-kick="${esc(t)}">${esc(t)}</button>`).join('')}</div>
      <div class="row wrap ai-more"><button type="button" class="tb" data-backfill>${D.icon('download', 'sm')} 贴回 AI 收工汇报</button><button type="button" class="tb" data-compare-start>${D.icon('layers', 'sm')} 比稿</button>
        <button type="button" class="tb" data-other>其他模板 ▾</button><button type="button" class="tb" data-progress-copy>复制成 进度.md 条目</button>${D.ghReady?.() ? `<button type="button" class="tb" data-progress-push>${D.icon('upload', 'sm')} 回写到 进度.md</button>` : ''}</div>
      ${cmp ? `<div class="cmp"><p><b>比稿中</b>：${esc((cmp.tools || []).join('、'))}${cmp.scope ? `（${esc(cmp.scope)}）` : ''} · ${esc(D.fmtDate(cmp.started_at))} 开始</p>
        <div class="row wrap">${(cmp.tools || []).map(t => `<button type="button" class="btn sm" data-choose="${esc(t)}">选定 ${esc(t)} 版</button>`).join('')}
          <button type="button" class="tb" data-compare-regen>重新复制比稿开工词</button><button type="button" class="link-btn danger small" data-compare-cancel>放弃比稿</button></div>
        ${st.compare ? `<div class="cmp-prompts">${Object.entries(st.compare).map(([t, text]) => `<details><summary>${esc(t)} 的比稿开工词 <button type="button" class="tb slim" data-copy-cmp="${esc(t)}">复制</button></summary><pre class="md-out">${esc(text)}</pre></details>`).join('')}</div>` : ''}</div>` : ''}
      ${st.text ? `<div class="draft"><p class="muted small">${esc(st.label || `已复制给 ${st.tool}`)}：可以在框里改，改完点「再复制一次」。${st.tplName ? ` 模板：<button type="button" class="link-btn small" data-swap-tpl>${esc(st.tplName)} ▾</button>` : ''}</p>
        <textarea data-ai-out rows="10" aria-label="生成的提示词">${esc(st.text)}</textarea><div class="row"><button type="button" class="btn sm" data-recopy>再复制一次</button></div></div>` : ''}`);
  }

  // 知识库里和这个项目有关的笔记（按省份、项目名里的词找；知识库没接上时给个入口）
  function notesBlock(p) {
    if (!D.kb) return '';
    if (!D.kb.files.length) return sec('notes', '相关笔记', `<p class="muted small">把知识库接进工作台后，这里会自动列出和这个项目有关的规则、上次的记录。</p><button type="button" class="tb" data-goto="kb">${D.icon('book', 'sm')} 去接知识库</button>`, { folded: true });
    const list = D.kbRelated(p);
    return sec('notes', '相关笔记', list.length ? `<ul class="notes">${list.map(n => `<li><button type="button" class="link-btn" data-kb-open="${esc(n.path)}">${esc(n.title)}</button><small class="muted">${esc(n.snippet)}</small></li>`).join('')}</ul>` : '<p class="muted small">知识库里没找到明显相关的笔记。</p>', { folded: !list.length, extra: list.length ? ` <span class="gcount">${list.length}</span>` : '' });
  }

  function scheduleBlock(p) {
    const nodes = D.scheduleOf(p.id), tls = [...D.state.timelines, D.GENERIC_TIMELINE], today = D.today();
    return sec('schedule', `排期`, `${nodes.length ? `<ol class="sched-list">${nodes.map(n => `<li class="k-${n.kind}${n.done ? ' done' : ''}${!n.done && n.date < today ? ' late' : ''}">
        <span class="sd">${esc(D.fmtDate(n.date))} ${D.wk(n.date)}</span><span class="so">${esc(D.offsetLabel(n.off))}</span><span class="si">${D.KIND_ICON[n.kind]}</span>
        <span class="stt">${esc(n.title)}${n.kind === 'wait' ? ` <small class="muted">问${esc(n.ref.ask_whom || '—')}${n.ref.remind_from ? `，${esc(D.fmtDate(n.ref.remind_from))} 起催` : ''}</small>` : ''}</span></li>`).join('')}</ol>`
        : '<p class="muted">还没有排期。填上线日、选一个时间表，下面一键生成：要做的变成待办，要交的变成交付物，等别人给的变成「在等谁」。</p>'}
      <form class="sched" data-schedule>
        <label class="lbl">时间表<select name="tl">${tls.map((t, i) => `<option value="${i}">${esc(t.name)}${t.builtin ? '（内置示例）' : ''}</option>`).join('')}</select></label>
        <label class="lbl">上线日 T<input type="date" name="T" value="${esc(p.launch_at || '')}"></label>
        <label class="check"><input type="checkbox" name="weekend" checked> 遇到周末提前到周五</label>
        <button class="btn sm ${nodes.length ? 'ghost' : ''}">${nodes.length ? '再套一次（会新增一套）' : '一键排期'}</button>
      </form>`, { folded: !(nodes.length && D.normStatus(p.status) === 'watch'), extra: nodes.length ? ` <span class="gcount">${nodes.filter(n => !n.done).length}/${nodes.length}</span>` : '' });
  }

  function actBlock(p) {
    const list = D.acts[p.id];
    return sec('acts', '动态', `<form class="add-row" data-act-add><select name="type" aria-label="类型">${D.ACT_TYPES.filter(a => ['progress', 'feedback', 'note'].includes(a.key)).map(a => `<option value="${a.key}">${esc(a.label)}</option>`).join('')}</select>
        <input name="summary" maxlength="500" placeholder="记一笔，如：领导说抽奖弹窗再简洁一点" aria-label="摘要"><button class="tb">记下</button></form>
      <ol class="timeline">${!list ? '<li class="muted">正在读取…</li>' : list.length ? list.slice(0, 30).map(a => `<li data-act-id="${a.id}">
        <span class="ticon">${D.icon(D.actOf(a.type).icon)}</span>
        <div class="tbody"><div class="thead"><b>${esc(D.actOf(a.type).label)}</b>${a.tool ? `<span class="tag">${esc(a.tool)}</span>` : ''}<span class="muted">${esc(D.fmtDate(a.happened_at))}</span>
          <span class="grow"></span><button type="button" class="link-btn danger" data-act-del>删除</button></div>
          ${a.summary ? `<p>${esc(a.summary)}</p>` : ''}
          ${a.content ? `<details><summary>查看全文</summary><pre>${esc(a.content)}</pre></details>` : ''}</div></li>`).join('') : '<li class="muted">还没有动态。开工、催办、答复、交付、回填都会自动记在这里。</li>'}</ol>`,
      { folded: true, extra: list ? ` <span class="gcount">${list.length}</span>` : '' });
  }

  function infoBlock(p) {
    const F = (label, inner, cls = '') => `<div class="fld ${cls}"><span class="fl">${esc(label)}</span>${inner}</div>`;
    return sec('info', '资料', `<div class="fgrid">
      ${F('一句话需求', `<textarea data-f="summary" rows="2" maxlength="2000">${esc(p.summary || '')}</textarea>`, 'wide')}
      ${F('需求方', `<input data-f="requester" value="${esc(p.requester || '')}" maxlength="60" placeholder="如：省公司业务方">`)}
      ${F('类型', `<button type="button" class="pickbtn" data-pick="kind">${D.kindChip(p.kind) || '<span class="muted">选择…</span>'}</button>`)}
      ${F('所属月份', `<input type="month" data-f="month" value="${esc(p.month || '')}">`)}
      ${F('最近经手', `<button type="button" class="pickbtn" data-pick="last_ai">${(p.last_ai || []).map(x => `<span class="tag">${esc(x)}</span>`).join('') || '<span class="muted">选择…</span>'}</button>`)}
      </div>
      <h4>链接</h4><ul class="links">${(p.links || []).map((l, i) => `<li>${D.link(l.url, l.label || l.url)}<button type="button" class="x" data-link-del="${i}" aria-label="删除链接">×</button></li>`).join('') || '<li class="muted">还没有（Figma、动效稿、后台……）</li>'}</ul>
      <form class="link-add" data-link-add><input name="label" placeholder="名称，如 Figma" maxlength="40" aria-label="链接名称"><input name="url" type="url" placeholder="https://…" aria-label="链接地址"><button class="tb">添加</button></form>
      <h4>本机路径 <small class="muted">只显示和复制，网页不会去访问</small></h4><ul class="links">${(p.local_paths || []).map((l, i) => `<li><span class="mono path">${esc(l)}</span><span><button type="button" class="tb" data-path-copy="${i}">复制</button><button type="button" class="x" data-path-del="${i}" aria-label="删除路径">×</button></span></li>`).join('') || '<li class="muted">还没有</li>'}</ul>
      <form class="link-add one" data-path-add><input name="path" placeholder="~/Documents/…" maxlength="500" aria-label="本机路径"><button class="tb">添加</button></form>
      <div class="fgrid">${F('标签（逗号分隔）', `<input data-f="tags" value="${esc((p.tags || []).join(', '))}">`, 'wide')}${F('备注', `<textarea data-f="notes" rows="3" maxlength="5000">${esc(p.notes || '')}</textarea>`, 'wide')}</div>`, { folded: true });
  }

  // 素材库里钉住的参考图 + 推荐的（素材库没连上就不显示）
  function refBlock(p) {
    const r = D.assetsProjectBlock?.(p); if (!r) return '';
    return sec('refs', '参考素材', r.html, { folded: !r.n, extra: r.n ? ` <span class="gcount">${r.pinned ? `钉住 ${r.pinned} · ` : ''}${r.n}</span>` : '' });
  }
  // 以前记过用时的项目才显示（v5 起不再问用时）
  function winBlock(p) {
    const list = D.state.wins.filter(w => w.project_id === p.id).sort((a, b) => b.happened_at.localeCompare(a.happened_at));
    if (!list.length) return '';
    const saved = list.reduce((a, w) => a + (D.saved(w) || 0), 0);
    return sec('wins', '用时记录', `${list.length ? `<ul class="winlist">${list.map(w => `<li data-win="${w.id}"><span>${esc(D.fmtDate(w.happened_at))}</span><span class="grow">${esc(w.task)}</span><span class="muted">${esc(D.fmtMinutes(w.before_minutes))} → ${esc(D.fmtMinutes(w.after_minutes))}</span><b>${esc(D.fmtMinutes(D.saved(w)))}</b></li>`).join('')}</ul>`
      : ''}<button type="button" class="tb" data-win-add>＋ 记一条</button>`,
      { folded: true, extra: ` <span class="gcount">省了 ${esc(D.fmtMinutes(saved))}</span>` });
  }

  // 上线倒计时小圆环：离上线越近圈越满（按 30 天算满）
  function countdown(p, late) {
    const d = D.diffDays(p.launch_at, D.today()), k = late ? 1 : Math.max(0.04, Math.min(1, 1 - d / 30)), C = 2 * Math.PI * 9;
    return `<span class="countdown${late ? ' late' : ''}" title="${esc(D.fmtDateW(p.launch_at))}"><svg viewBox="0 0 22 22" aria-hidden="true"><circle class="tr" cx="11" cy="11" r="9"/><circle class="pr" cx="11" cy="11" r="9" stroke-dasharray="${C.toFixed(1)}" stroke-dashoffset="${(C * (1 - k)).toFixed(1)}"/></svg>${esc(D.launchText(p))}</span>`;
  }
  D.renderProject = (view, el) => {
    const p = D.project(view.pid);
    if (!p) { el.innerHTML = '<div class="page"><p class="empty-state">这个项目不存在或已删除。<button type="button" class="link-btn" data-goto="projects">回到项目列表</button></p></div>'; return; }
    if (!D.acts[p.id]) D.loadActs(p.id).then(() => { if (D.current?.pid === p.id) D.render(); });
    const late = p.launch_at && D.normStatus(p.status) === 'active' && p.launch_at < D.today();
    el.innerHTML = `<div class="page ppage" data-pid="${p.id}">
      <div class="phead">
        <input class="ptitle" data-f="title" value="${esc(p.title)}" maxlength="120" aria-label="项目名">
        <button type="button" class="pickbtn" data-pick="status" title="状态">${D.statusChip(p.status)} ▾</button>
        <button type="button" class="btn sm ghost" data-kickpack="${p.id}" title="上次类似的项目、相关笔记、参考素材，一页看完，一键复制给 AI">${D.icon('layers', 'sm')}开工包</button>
        <button type="button" class="icon" data-pmenu aria-label="更多操作">⋯</button></div>
      <div class="pmeta">
        <button type="button" class="pickbtn slim" data-pick="province">${esc(p.province || '全国 / 没填省份')} ▾</button>
        <label class="lbl inline">上线<input type="date" data-f="launch_at" value="${esc(p.launch_at || '')}" aria-label="上线日"></label>
        <label class="check"><input type="checkbox" data-f="launch_tentative" ${p.launch_tentative ? 'checked' : ''}> 暂定</label>
        ${p.launch_at ? countdown(p, late) : ''}
        <label class="lbl inline">我这边截止<input type="date" data-f="due_at" value="${esc(p.due_at || '')}" aria-label="截止日"></label>
        ${p.archived_at ? '<span class="tag">已归档</span>' : ''}
      </div>
      ${p.summary ? `<p class="psum">${esc(p.summary)}</p>` : ''}
      <div class="pgrid">
        <div class="pcol">${nowBlock(p)}${pendBlock(p)}${settledBlock(p)}${delivBlock(p)}${taskBlock(p)}</div>
        <div class="pcol">${aiBlock(p)}${notesBlock(p)}${refBlock(p)}${scheduleBlock(p)}${actBlock(p)}${infoBlock(p)}${winBlock(p)}</div>
      </div></div>`;
  };

  /* ================= 改上线日 / 一键排期 ================= */
  D.GENERIC_TIMELINE = { builtin: true, name: '通用示例：开工 T−7 / 交付 T−1 / 上线 T', items: [
    { offset_days: -7, title: '开工：理清需求、列待确认', kind: 'task', is_milestone: true },
    { offset_days: -1, title: '交付', kind: 'deliverable', deliverable_type: '其他', deliverable_name: '交付物' },
    { offset_days: 0, title: '上线', kind: 'task', is_milestone: true }
  ] };
  D.applyTimeline = async (pid, tl, T, weekend = true) => {
    const r = await D.api('POST', `/projects/${pid}/schedule`, { mode: 'apply', launch_at: T, weekend, items: tl.items });
    D.applySubtree(r);
    D.toast(`已按「${tl.name}」排好 ${r.created} 个节点`);
  };
  // 改上线日：有时间表节点时，问要不要整体顺移没完成的节点（待办、交付物、等别人给的）
  D.setLaunch = async (p, v) => {
    if ((v || null) === (p.launch_at || null)) return;
    const nodes = D.scheduleOf(p.id).filter(n => !n.done);
    if (v && nodes.length && p.launch_at) {
      const shift = await D.confirm(`上线日改成 ${D.fmtDateW(v)}。要不要把 ${nodes.length} 个还没完成的节点（待办、交付物、等别人给的）一起按新上线日顺移？已完成的不动；遇到周末提前到周五。`, '一起顺移', { danger: false });
      if (shift) {
        try { const r = await D.api('POST', `/projects/${p.id}/schedule`, { mode: 'shift', launch_at: v, weekend: true }); D.applySubtree(r); D.toast(`已顺移 ${r.shifted} 个节点`); return; }
        catch (e) { return D.fail(e); }
      }
    }
    D.patch('projects', p.id, { launch_at: v }).catch(() => {});
  };

  /* ================= 标成已交付：一句确认（v5 起不问用时；交付日期和版本自动记着） ================= */
  D.deliver = d => new Promise(resolve => {
    const lists = D.checklistsFor(d.type);
    const dlg = D.$('#deliver');
    D.$('#deliver-title').textContent = `「${D.delivLabel(d)}」标成已交付`;
    D.$('#deliver-form').innerHTML = `
      <label class="check big"><input type="checkbox" name="checked"> 已让 AI 跑过交付前检查（Word 类也逐页看过）</label>
      ${lists.length ? `<details class="muted small"><summary>看一眼检查清单</summary>${lists.map(cl => `<p><b>${esc(cl.name)}</b></p><ul>${(cl.items || []).map(i => `<li>${esc(i)}</li>`).join('')}</ul>`).join('')}</details>` : ''}
      <p class="muted small">交付日期${d.version ? `和版本（${esc(d.version)}）` : ''}会自动记下，在「记录 → 交付记录」里能看到。</p>
      <div class="row end"><button type="button" class="btn sm ghost" data-dlv-cancel>取消</button><button type="submit" class="btn sm">标成已交付</button></div>`;
    const f = D.$('#deliver-form');
    let done = false;
    const finish = v => { if (done) return; done = true; dlg.close(); resolve(v); };
    f.onsubmit = async e => {
      e.preventDefault();
      const btn = f.querySelector('[type=submit]'); btn.disabled = true;
      try { await D.patch('deliverables', d.id, { status: 'done', checked: f.checked.checked ? 1 : 0 }); D.toast('已交付'); finish(true); }
      catch (err) { D.fail(err); btn.disabled = false; }
    };
    f.querySelector('[data-dlv-cancel]').onclick = () => finish(false);
    dlg.oncancel = () => finish(false);
    dlg.showModal();
    f.querySelector('[type=submit]').focus();
  });

  /* ================= 回填：把 AI 的收工汇报贴回来 ================= */
  function openBackfill(p) {
    const dlg = D.$('#backfill'), body = D.$('#backfill-body');
    D.$('#backfill-title').textContent = `贴回 AI 收工汇报 · ${p.title}`;
    const tools = D.cfg().ai_tools.filter(x => x !== '我自己');
    const st = aiDraft[p.id] || {};
    const step1 = (text = '', tool = st.tool || p.last_ai?.[0] || tools[0]) => {
      body.onchange = null;
      body.innerHTML = `<p class="muted small">把 AI 收工时的汇报整段贴进来。开工提示词里已经要求它在最后附上【回填工作台】那一段；识别后先给你看要更新哪些，确认了才写进去。</p>
        <label class="lbl inline">哪个 AI 写的<select name="tool">${D.selectOpts(tools, tool)}</select></label>
        <textarea name="text" rows="12" maxlength="50000" placeholder="整段粘贴 AI 的收工汇报" aria-label="收工汇报">${esc(text)}</textarea>
        <div class="row end"><button type="button" class="btn sm ghost" data-bf-close>取消</button><button type="button" class="btn sm" data-bf-parse>识别</button></div>`;
      body.querySelector('textarea').focus();
    };
    const step2 = (text, tool) => {
      const r = D.parseBackfill(text, p, tool);
      body.innerHTML = `${r.found ? '<p>识别到下面这些更新，不要的取消勾选：</p>' : '<p class="warn">没找到【回填工作台】这一段，只能把整段汇报存进动态。下次开工用工作台生成的提示词，AI 就会按格式写。</p>'}
        <ul class="bf-list">${r.items.map(it => `<li><label class="check"><input type="checkbox" data-bf="${it.id}" ${it.checked ? 'checked' : ''}> <span>${esc(it.label)}</span></label>
          ${it.win ? `<span class="row wrap bf-win"><label class="lbl inline">这次<input type="number" class="w80" data-bf-after value="${esc(it.op.data.after_minutes ?? '')}"> 分钟</label><label class="lbl inline">以前<input type="number" class="w80" data-bf-before value="${esc(it.op.data.before_minutes ?? D.cfg().baselines[it.op.data.task_type] ?? '')}"> 分钟</label></span>` : ''}</li>`).join('')}</ul>
        <div class="row end"><button type="button" class="btn sm ghost" data-bf-back>返回修改</button><button type="button" class="btn sm" data-bf-apply>应用勾选的 ${r.items.length} 项</button></div>`;
      const refresh = () => { const b = body.querySelector('[data-bf-apply]'); if (b) b.textContent = `应用勾选的 ${body.querySelectorAll('[data-bf]:checked').length} 项`; };
      body.onchange = refresh;
      body.querySelector('[data-bf-back]').onclick = () => step1(text, tool);
      body.querySelector('[data-bf-apply]').onclick = async e => {
        const ops = r.items.filter(it => body.querySelector(`[data-bf="${it.id}"]`).checked).map(it => {
          const op = JSON.parse(JSON.stringify(it.op));
          if (it.win) {
            const a = body.querySelector('[data-bf-after]').value, b = body.querySelector('[data-bf-before]').value;
            op.data.after_minutes = a === '' ? null : Number(a); op.data.before_minutes = b === '' ? null : Number(b);
          }
          return op;
        });
        if (!ops.length) return D.toast('一项都没勾', { error: true });
        e.target.disabled = true;
        try {
          const res = await D.api('POST', `/projects/${p.id}/apply`, { ops });
          D.applySubtree(res); dlg.close(); D.toast(`已更新 ${res.applied} 项`);
        } catch (err) { D.fail(err); e.target.disabled = false; }
      };
    };
    body.onclick = e => {
      if (e.target.closest('[data-bf-close]')) dlg.close();
      if (e.target.closest('[data-bf-parse]')) {
        const text = body.querySelector('[name=text]').value.trim();
        if (!text) return D.toast('先把汇报贴进来', { error: true });
        step2(text, body.querySelector('[name=tool]').value);
      }
    };
    step1();
    dlg.showModal();
  }
  D.openBackfill = openBackfill;

  /* ================= 新建项目（也用于「收集箱 → 转成项目」） ================= */
  const npDlg = () => D.$('#newproj');
  let fromInbox = null;
  function openNew(preset = {}, inboxItem = null) {
    fromInbox = inboxItem;
    const c = D.cfg(), tls = [...D.state.timelines, D.GENERIC_TIMELINE];
    D.$('#newproj-title').textContent = inboxItem ? '收集箱 → 转成项目' : '新建项目';
    D.$('#newproj-form').innerHTML = `<div class="fgrid">
      <label class="fld wide"><span class="fl">项目名</span><input name="title" maxlength="120" required value="${esc(preset.title || '')}" placeholder="如：示例省份 A · 十一月活动"></label>
      <label class="fld"><span class="fl">省份</span><select name="province">${D.selectOpts(c.provinces, preset.province || '', { empty: '全国 / 不选' })}</select></label>
      <div class="fld"><span class="fl">上线日</span><div class="row tight"><input type="date" name="launch_at" value="${esc(preset.launch_at || '')}"><label class="check"><input type="checkbox" name="launch_tentative"> 暂定</label></div></div>
      <label class="fld wide"><span class="fl">一句话需求</span><textarea name="summary" rows="3" maxlength="2000">${esc(preset.summary || '')}</textarea></label>
      <label class="fld wide"><span class="fl">一键排期（可选，需要先填上线日）</span><select name="tl"><option value="">先不排</option>${tls.map((t, i) => `<option value="${i}">${esc(t.name)}${t.builtin ? '（内置示例）' : ''}</option>`).join('')}</select></label>
      <details class="fld wide more"><summary>更多（可以不填）</summary><div class="fgrid">
        <label class="fld"><span class="fl">状态</span><select name="status">${D.selectOpts(D.STATUSES.filter(s => ['active', 'watch'].includes(s.key)).map(s => ({ value: s.key, label: s.key === 'watch' ? '观望（不一定是我做）' : s.label })), preset.status || 'active')}</select></label>
        <label class="fld"><span class="fl">我这边的截止日</span><input type="date" name="due_at" value="${esc(preset.due_at || '')}"></label>
        <label class="fld"><span class="fl">需求方</span><input name="requester" maxlength="60" placeholder="如：省公司业务方"></label>
        <label class="check fld"><input type="checkbox" name="weekend" checked> 排期遇到周末提前到周五</label></div></details>
    </div>
    <div class="row end"><button type="button" class="btn sm ghost" data-np-close>取消</button><button class="btn sm">${inboxItem ? '转成项目' : '创建'}</button></div>`;
    npDlg().showModal();
    D.$('#newproj-form [name=title]').focus(); D.$('#newproj-form [name=title]').select();
  }
  async function submitNew(e) {
    e.preventDefault();
    const f = e.target, btn = f.querySelector('button:not([type=button])');
    const v = k => f[k].value.trim() || null;
    const tl = f.tl.value !== '' ? [...D.state.timelines, D.GENERIC_TIMELINE][Number(f.tl.value)] : null;
    const data = { title: v('title'), province: v('province'), launch_at: v('launch_at'), launch_tentative: f.launch_tentative.checked ? 1 : 0, summary: v('summary'),
      status: f.status.value || 'active', due_at: v('due_at'), requester: v('requester'), priority: 'mid', kind: tl?.kind || null };
    if (!data.title) return D.toast('项目名不能空', { error: true });
    if (tl && !data.launch_at) return D.toast('要一键排期，先填上线日', { error: true });
    btn.disabled = true;
    try {
      const p = fromInbox ? await D.inboxConvert(fromInbox, 'project', data) : await D.create('projects', data);
      if (tl) await D.applyTimeline(p.id, tl, data.launch_at, f.weekend.checked);
      npDlg().close(); D.toast(`已创建「${p.title}」`);
      D.app.openProject(p.id);
    } catch (err) { D.fail(err); }
    finally { btn.disabled = false; }
  }
  D.newProject = { open: openNew };

  /* ================= 项目页事件 ================= */
  const P = () => D.project(D.current?.pid);
  const onPage = () => D.current?.kind === 'project';
  async function kick(p, tool, { label } = {}) {
    const todo = D.$('#main [data-ai-todo]')?.value.trim() || '';
    const { tpl, text } = await D.kickoffPrompt(p, tool, todo);
    await D.copy(text, `给 ${tool} 的开工提示词`);
    aiDraft[p.id] = { ...(aiDraft[p.id] || {}), tool, text, todo, tplName: tpl.name, tplId: tpl.id, label };
    try { await D.create('activities', { project_id: p.id, type: 'ai', tool, summary: `开工${todo ? '：' + todo : ''}`.slice(0, 500), happened_at: D.today() }); } catch (e) { D.fail(e); }
    D.render();
  }
  async function compareStart(anchor, p) {
    const tools = D.cfg().ai_tools.filter(x => x !== '我自己');
    const todo = D.$('#main [data-ai-todo]')?.value.trim() || '';
    const el = D.popover(anchor, `<form class="pop-form"><p class="pop-title">比稿：选 2–3 个 AI 各做一版</p>
      <div class="checks">${tools.map((t, i) => `<label><input type="checkbox" name="t" value="${esc(t)}" ${i < 2 ? 'checked' : ''}> ${esc(t)}</label>`).join('')}</div>
      <label>比什么<input name="scope" maxlength="120" value="${esc(todo)}" placeholder="如：原型 V1 主玩法"></label>
      <p class="muted small">每个 AI 的开工词都会写上「文件名带上自己的后缀、选定之前不要改知识库和进度」。</p>
      <div class="pop-foot"><button class="btn sm">生成并开始比稿</button></div></form>`, { width: 340, cls: 'sheet' });
    el.querySelector('form').addEventListener('submit', async e => {
      e.preventDefault();
      const picked = [...e.target.querySelectorAll('[name=t]:checked')].map(x => x.value);
      if (picked.length < 2) return D.toast('比稿至少选 2 个', { error: true });
      const scope = e.target.scope.value.trim();
      D.closePopover();
      const prompts = {};
      for (const t of picked) prompts[t] = (await D.kickoffPrompt(p, t, scope || todo, { compare: true })).text;
      aiDraft[p.id] = { ...(aiDraft[p.id] || {}), compare: prompts, todo: scope || todo };
      try {
        await D.api('POST', `/projects/${p.id}/apply`, { ops: [
          { op: 'project', data: { compare: { scope, tools: picked, started_at: D.today() } } },
          ...picked.map(t => ({ op: 'activity', data: { type: 'ai', tool: t, summary: `比稿开工${scope ? '：' + scope : ''}`.slice(0, 500) } }))
        ] }).then(D.applySubtree);
        D.toast(`已开始比稿：在下面分别复制给 ${picked.join('、')}`, { timeout: 5000 });
      } catch (err) { D.fail(err); }
    });
  }
  async function choose(p, tool) {
    const cmp = p.compare || {}, others = (cmp.tools || []).filter(t => t !== tool);
    if (!(await D.confirm(`选定 ${tool} 的版本？${others.length ? others.join('、') + ' 的版本记为落选。' : ''}会复制一段「你被选中了，请收尾」的提示词给 ${tool}。`, '选定', { danger: false }))) return;
    const text = D.chosenPrompt(p, tool, cmp.scope);
    await D.copy(text, `给 ${tool} 的「选中收尾」提示词`);
    try {
      const r = await D.api('POST', `/projects/${p.id}/apply`, { ops: [
        { op: 'project', data: { compare: null } },
        { op: 'decision', data: { content: `比稿选定 ${tool} 的版本${cmp.scope ? `（${cmp.scope}）` : ''}${others.length ? `，${others.join('、')} 的落选` : ''}`, source: '比稿选定' } },
        { op: 'activity', data: { type: 'ai', tool, summary: `比稿选定 ${tool} 版，已发收尾提示词` } }
      ] });
      aiDraft[p.id] = { ...(aiDraft[p.id] || {}), compare: null, tool, text, tplName: '', label: `已复制给 ${tool}（选中收尾）` };
      D.applySubtree(r);
    } catch (err) { D.fail(err); }
  }

  D.projectEvents = main => {
    main.addEventListener('change', async e => {
      if (!onPage()) return;
      const p = P(); if (!p) return;
      const t = e.target;
      if (t.matches('[data-task-done]')) return D.setTaskDone(Number(t.closest('[data-task]').dataset.task), t.checked);
      if (t.matches('[data-dcheck]')) { const d = D.find('deliverables', t.closest('[data-deliv]').dataset.deliv); return D.patch('deliverables', d.id, { [t.dataset.dcheck]: t.checked ? 1 : 0 }).catch(() => {}); }
      if (t.matches('[data-df]')) {
        const d = D.find('deliverables', t.closest('[data-deliv]').dataset.deliv), v = t.value.trim() || null;
        if (v !== (d[t.dataset.df] ?? null)) D.patch('deliverables', d.id, { [t.dataset.df]: v }).catch(() => {});
        return;
      }
      if (t.closest('form')) return;
      const key = t.dataset.f; if (!key) return;
      let v = t.type === 'checkbox' ? (t.checked ? 1 : 0) : key === 'tags' ? t.value.split(/[,，]/).map(s => s.trim()).filter(Boolean) : t.value.trim() || null;
      if (key === 'title' && !v) { D.toast('项目名不能空', { error: true }); t.value = p.title; return; }
      if (JSON.stringify(v) === JSON.stringify(p[key] ?? (t.type === 'checkbox' ? 0 : null))) return;
      if (key === 'launch_at') return D.setLaunch(p, v);
      D.patch('projects', p.id, { [key]: v }).catch(() => {});
    });
    main.addEventListener('keydown', e => {
      if (onPage() && e.key === 'Enter' && !e.isComposing && e.target.matches('input[data-f], input[data-df]')) e.target.blur();
    });
    main.addEventListener('input', e => {
      if (!onPage()) return;
      const p = P();
      if (e.target.matches('[data-ai-out]') && aiDraft[p.id]) aiDraft[p.id].text = e.target.value;
      if (e.target.matches('[data-ai-todo]')) aiDraft[p.id] = { ...(aiDraft[p.id] || {}), todo: e.target.value };
    });
    main.addEventListener('toggle', e => { if (onPage() && e.target.matches?.('details[data-fold]')) D.pref.set('fold.' + e.target.dataset.fold, e.target.open); }, true);

    main.addEventListener('click', async e => {
      if (!onPage()) return;
      const p = P(); if (!p) return;
      const t = e.target;
      if (t.closest('[data-back]')) return D.app.back();
      const pick = t.closest('[data-pick]');
      if (pick) {
        const key = pick.dataset.pick, multi = key === 'last_ai';
        return D.pickOption(pick, { options: D.optionsFor(key), value: multi ? (p[key] || []) : key === 'status' ? D.normStatus(p.status) : p[key], multi, search: key === 'province',
          allowEmpty: key !== 'status', emptyLabel: key === 'province' ? '全国 / 不选' : '清空',
          onPick: v => { if (JSON.stringify(v ?? null) !== JSON.stringify((key === 'status' ? D.normStatus(p.status) : p[key]) ?? null)) D.patch('projects', p.id, { [key]: v }).catch(() => {}); } });
      }
      if (t.closest('[data-pmenu]')) {
        const el = D.popover(t.closest('[data-pmenu]'), `<div class="opts"><button type="button" class="opt" data-m="arch">${p.archived_at ? '取消归档' : '归档'}</button><button type="button" class="opt danger" data-m="del">删除项目</button></div>`, { cls: 'pick' });
        el.addEventListener('click', ev => {
          const m = ev.target.closest('[data-m]')?.dataset.m; if (!m) return; D.closePopover();
          if (m === 'arch') { const v = p.archived_at ? null : new Date().toISOString(); return D.patch('projects', p.id, { archived_at: v }).then(() => D.toast(v ? '已归档（项目列表最下面「已归档」里能找回）' : '已取消归档')).catch(() => {}); }
          if (m === 'del') D.remove('projects', p.id, { label: p.title, text: `确定删除项目「${p.title}」吗？它的交付物、待办、待确认、口径、动态会一起删除（5 秒内可撤销）。` }).then(ok => ok && D.app.show('projects'));
        });
        return;
      }
      const ask = t.closest('[data-launch-ask]');
      if (ask) {
        if (t.closest('[data-launched]')) return D.patch('projects', p.id, { status: 'live', launch_tentative: 0 }).then(() => D.toast('已标成「已上线收尾」')).catch(() => {});
        if (t.closest('[data-reschedule]')) return D.datePopover(t.closest('[data-reschedule]'), null, v => v && D.setLaunch(p, v), { clear: false });
      }
      // 交付物
      const li = t.closest('[data-deliv]');
      if (li) {
        const d = D.find('deliverables', li.dataset.deliv);
        const dp = t.closest('[data-dpick]');
        if (dp) {
          const key = dp.dataset.dpick;
          return D.pickOption(dp, { options: D.optionsFor(key === 'status' ? 'deliv_status' : 'deliverable_type'), value: d[key], allowEmpty: false, onPick: v => {
            if (v === d[key]) return;
            if (key === 'status' && v === 'done') return D.deliver(d);
            D.patch('deliverables', d.id, { [key]: v }).catch(() => {});
          } });
        }
        if (t.closest('[data-ddue]')) return D.datePopover(t.closest('[data-ddue]'), d.due_at, v => D.patch('deliverables', d.id, { due_at: v }).catch(() => {}));
        if (t.closest('[data-deliver]')) return D.deliver(d);
        if (t.closest('[data-dmore]')) {
          const el = D.popover(t.closest('[data-dmore]'), `<div class="opts">${d.status === 'done' ? '<button type="button" class="opt" data-m="undo">改回「制作中」</button>' : ''}<button type="button" class="opt danger" data-m="del">删除这件交付物</button></div>`, { cls: 'pick' });
          el.addEventListener('click', ev => {
            const m = ev.target.closest('[data-m]')?.dataset.m; if (!m) return; D.closePopover();
            if (m === 'undo') D.patch('deliverables', d.id, { status: 'doing' }).catch(() => {});
            if (m === 'del') D.remove('deliverables', d.id, { label: D.delivLabel(d) });
          });
          return;
        }
      }
      // 待办
      const tk = t.closest('[data-task]');
      if (tk) {
        const task = D.find('tasks', tk.dataset.task);
        if (t.closest('[data-tdue]')) return D.datePopover(t.closest('[data-tdue]'), task.due_at, v => D.patch('tasks', task.id, { due_at: v }).catch(() => {}));
        if (t.closest('[data-task-del]')) return D.remove('tasks', task.id, { label: task.title });
      }
      // 已拍板的口径
      const sd = t.closest('[data-settled]');
      if (sd) {
        const [kind, id] = sd.dataset.settled.split(':');
        if (kind === 'decision' && t.closest('[data-dec-del]')) { const x = D.find('decisions', id); return D.remove('decisions', x.id, { label: x.content }); }
        if (kind === 'answer' && t.closest('[data-pmore-settled]')) {
          const x = D.find('pendings', id);
          const el = D.popover(t.closest('[data-pmore-settled]'), `<div class="opts"><button type="button" class="opt" data-m="reopen">重新打开（还没定）</button><button type="button" class="opt danger" data-m="del">删除</button></div>`, { cls: 'pick' });
          el.addEventListener('click', ev => { const m = ev.target.closest('[data-m]')?.dataset.m; if (!m) return; D.closePopover();
            if (m === 'reopen') D.patch('pendings', x.id, { status: 'waiting' }).catch(() => {});
            if (m === 'del') D.remove('pendings', x.id, { label: x.question }); });
          return;
        }
      }
      // AI 交接
      const k = t.closest('[data-kick]');
      if (k) return kick(p, k.dataset.kick);
      if (t.closest('[data-recopy]')) return D.copy(D.$('#main [data-ai-out]').value, '提示词');
      if (t.closest('[data-swap-tpl]')) {
        const st = aiDraft[p.id]; const tpls = D.templatesFor('开工', st.tool);
        return D.pickOption(t.closest('[data-swap-tpl]'), { options: tpls.map(x => ({ value: String(x.id), label: x.name + (x.builtin ? '（内置）' : '') })), value: String(st.tplId), allowEmpty: false, onPick: async id => {
          const r = await D.kickoffPrompt(p, st.tool, st.todo || '', { tplId: id });
          aiDraft[p.id] = { ...st, text: r.text, tplName: r.tpl.name, tplId: r.tpl.id }; await D.copy(r.text, '换了模板的提示词'); D.render();
        } });
      }
      if (t.closest('[data-backfill]')) return openBackfill(p);
      if (t.closest('[data-progress-copy]')) return D.copy(D.progressEntry(p), ' 进度.md 条目');
      if (t.closest('[data-progress-push]')) return D.pushProgress(p);
      if (t.closest('[data-compare-start]')) return compareStart(t.closest('[data-compare-start]'), p);
      const ch = t.closest('[data-choose]'); if (ch) return choose(p, ch.dataset.choose);
      const cc = t.closest('[data-copy-cmp]'); if (cc) { e.preventDefault(); return D.copy(aiDraft[p.id].compare[cc.dataset.copyCmp], `给 ${cc.dataset.copyCmp} 的比稿开工词`); }
      if (t.closest('[data-compare-regen]')) {
        const prompts = {}; for (const tool of p.compare.tools || []) prompts[tool] = (await D.kickoffPrompt(p, tool, p.compare.scope || '', { compare: true })).text;
        aiDraft[p.id] = { ...(aiDraft[p.id] || {}), compare: prompts }; D.render(); return;
      }
      if (t.closest('[data-compare-cancel]')) { if (await D.confirm('放弃这次比稿？（已经生成的文件不受影响）', '放弃', { danger: false })) D.patch('projects', p.id, { compare: null }).catch(() => {}); return; }
      if (t.closest('[data-other]')) {
        const list = [...D.state.prompts.filter(x => !['开工', '需求梳理', '写玩法提案'].includes(x.scene)), ...D.BUILTIN_PROMPTS.filter(b => b.scene === '收工')];
        if (!list.length) return D.toast('还没有其他模板，可以去「设置 → 提示词模板」加', { error: true });
        return D.pickOption(t.closest('[data-other]'), { options: list.map(x => ({ value: String(x.id), label: `${x.name}${x.builtin ? '（内置）' : ''}${x.tool ? ' · ' + x.tool : ''}` })), allowEmpty: false, onPick: async id => {
          const tpl = D.promptById(id); const text = await D.otherPrompt(p, tpl);
          await D.copy(text, `「${tpl.name}」提示词`); aiDraft[p.id] = { ...(aiDraft[p.id] || {}), tool: tpl.tool || '', text, tplName: '', label: `已复制「${tpl.name}」` }; D.render();
        } });
      }
      // 资料
      const ld = t.closest('[data-link-del]'); if (ld) { const l = [...(p.links || [])]; l.splice(Number(ld.dataset.linkDel), 1); return D.patch('projects', p.id, { links: l }).catch(() => {}); }
      const pc = t.closest('[data-path-copy]'); if (pc) return D.copy(p.local_paths[Number(pc.dataset.pathCopy)], '路径');
      const pd = t.closest('[data-path-del]'); if (pd) { const l = [...(p.local_paths || [])]; l.splice(Number(pd.dataset.pathDel), 1); return D.patch('projects', p.id, { local_paths: l }).catch(() => {}); }
      const al = t.closest('[data-act-id]');
      if (al && t.closest('[data-act-del]')) { const a = (D.acts[p.id] || []).find(x => x.id === Number(al.dataset.actId)); return D.remove('activities', a.id, { label: a.summary || D.actOf(a.type).label, text: `删除这条「${D.actOf(a.type).label}」？` }).then(() => D.render()); }
      if (t.closest('[data-win-add]')) return D.wins.edit(null, { project_id: p.id });
      const wr = t.closest('[data-win]'); if (wr) return D.wins.edit(Number(wr.dataset.win));
    });

    main.addEventListener('submit', async e => {
      if (!onPage() || e.target.matches('[data-pending-add]')) return;
      e.preventDefault();
      const p = P(); if (!p) return;
      const f = e.target, btn = f.querySelector('button:not([type=button])');
      const busy = async fn => { if (btn) btn.disabled = true; try { await fn(); } catch (err) { D.fail(err); } finally { if (btn) btn.disabled = false; } };
      if (f.matches('[data-schedule]')) {
        const tl = [...D.state.timelines, D.GENERIC_TIMELINE][Number(f.tl.value)];
        if (!f.T.value) return D.toast('先填上线日', { error: true });
        return busy(() => D.applyTimeline(p.id, tl, f.T.value, f.weekend.checked));
      }
      if (f.matches('[data-dec-add]')) {
        const content = f.content.value.trim(); if (!content) return;
        return busy(async () => { await D.create('decisions', { project_id: p.id, content, source: f.source.value, decided_at: f.date.value || D.today() }); D.toast('已记下'); });
      }
      if (f.matches('[data-deliv-add]')) return busy(async () => { await D.create('deliverables', { project_id: p.id, type: f.type.value, name: f.name.value.trim(), version: f.version.value.trim(), due_at: f.due.value || null }); D.toast('已添加交付物'); });
      if (f.matches('[data-task-add]')) { const title = f.title.value.trim(); if (!title) return; return busy(() => D.create('tasks', { project_id: p.id, title, due_at: f.due.value || null })); }
      if (f.matches('[data-act-add]')) { const s = f.summary.value.trim(); if (!s) return; return busy(async () => { await D.create('activities', { project_id: p.id, type: f.type.value, summary: s, happened_at: D.today() }); D.render(); }); }
      if (f.matches('[data-link-add]')) {
        const url = f.url.value.trim(); if (!url) return;
        if (!D.safeUrl(url)) return D.toast('链接要以 https:// 开头', { error: true });
        return D.patch('projects', p.id, { links: [...(p.links || []), { label: f.label.value.trim(), url }] }).catch(() => {});
      }
      if (f.matches('[data-path-add]')) { const v = f.path.value.trim(); if (!v) return; return D.patch('projects', p.id, { local_paths: [...(p.local_paths || []), v] }).catch(() => {}); }
    });
  };

  D.projectsListEvents = main => {
    main.addEventListener('click', e => {
      if (D.current?.kind !== 'projects') return;
    });
    main.addEventListener('input', e => { if (D.current?.kind === 'projects' && e.target.matches('[data-pfilter]')) { D.pq = e.target.value.trim(); D.render(true); } });
    main.addEventListener('keydown', e => { const c = e.target.closest?.('.pcard'); if (c && e.key === 'Enter') D.app.openProject(c.dataset.openProject); });
  };

  document.addEventListener('DOMContentLoaded', () => {
    D.$('#newproj-form').addEventListener('submit', submitNew);
    npDlg().addEventListener('click', e => { if (e.target.closest('[data-np-close]')) npDlg().close(); });
    D.$('#backfill').addEventListener('click', e => { if (e.target.closest('[data-bf-x]')) D.$('#backfill').close(); });
  });
})();
