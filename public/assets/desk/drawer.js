/* 我的工作台 · 项目详情抽屉（右侧滑出，不跳页）：概览 / 交付物 / 待办 / 待确认 / 时间线 / AI 交接 / 提效。写法照 /kol 的 drawer.js。 */
(() => {
  const D = window.DESK;
  const { esc } = D;
  const TABS = [['overview', '概览'], ['delivs', '交付物'], ['tasks', '待办'], ['pendings', '待确认'], ['acts', '时间线'], ['ai', 'AI 交接'], ['wins', '提效']];
  const drawer = () => D.$('#drawer');
  let openId = null, tab = 'overview';
  const expanded = new Set();     // 展开了检查清单的交付物
  const aiDraft = {};             // 生成好的提示词（重画时保留）

  const F = (label, inner, cls = '') => `<div class="fld ${cls}"><span class="fl">${esc(label)}</span>${inner}</div>`;
  const input = (p, key, type = 'text', extra = '') => `<input data-f="${key}" type="${type}" value="${esc(p[key] ?? '')}" ${extra} aria-label="${esc(D.col(key)?.label || key)}">`;
  const picker = (key, html) => `<button type="button" class="pickbtn" data-pick="${key}">${html || '<span class="muted">选择…</span>'}</button>`;

  /* ================= 各块 ================= */
  function overview(p) {
    const nn = D.nextNode(p.id);
    const tls = [...D.state.timelines, D.GENERIC_TIMELINE];
    return `<section class="dsec"><div class="fgrid">
      ${F('类型', picker('kind', D.kindChip(p.kind)))}
      ${F('省份', picker('province', p.province ? esc(p.province) : ''))}
      ${F('状态', picker('status', D.statusChip(p.status)))}
      ${F('优先级', picker('priority', D.priorityChip(p.priority)))}
      ${F('上线日', `<input data-f="launch_at" type="date" value="${esc(p.launch_at || '')}" aria-label="上线日">`)}
      ${F('我这边的截止日', input(p, 'due_at', 'date'))}
      ${F('所属月份', input(p, 'month', 'month'))}
      ${F('需求方', input(p, 'requester', 'text', 'maxlength="60" placeholder="如：省公司业务方、领导"'))}
      ${F('一句话需求', `<textarea data-f="summary" rows="2" maxlength="2000" aria-label="一句话需求">${esc(p.summary || '')}</textarea>`, 'wide')}
      ${F('下一步（写成能直接动手的动作）', input(p, 'next_action', 'text', 'maxlength="300" placeholder="如：周二前把原型 V2 发群"'), 'wide')}
      ${F('最近经手', picker('last_ai', (p.last_ai || []).map(x => `<span class="tag">${esc(x)}</span>`).join('')), 'wide')}
    </div></section>
    ${nn ? `<p class="hint">📍 下一个节点：<b>${esc(D.offsetLabel(nn.offset_days))} ${esc(nn.title)}</b>（${esc(D.fmtDate(nn.due_at))} ${esc(D.wk(nn.due_at))}${nn.due_at < D.today() ? `，已逾期 ${D.diffDays(D.today(), nn.due_at)} 天` : ''}）</p>` : ''}
    <section class="dsec"><h3>一键排期</h3>
      <form class="sched" data-schedule>
        <label class="lbl">时间表模板<select name="tl">${tls.map((t, i) => `<option value="${i}">${esc(t.name)}${t.builtin ? '（内置示例）' : ''}</option>`).join('')}</select></label>
        <label class="lbl">上线日 T<input type="date" name="T" value="${esc(p.launch_at || '')}" required></label>
        <label class="check"><input type="checkbox" name="weekend" checked> 遇到周末提前到周五</label>
        <button class="btn sm">生成待办和交付物</button>
      </form>
      <p class="muted small">按「上线日 + 节点天数」生成待办；带交付物类型的节点同时生成交付物。之后改上线日会问你要不要整体顺移。模板在「设置 → 时间表模板」里改。</p>
    </section>
    <section class="dsec"><h3>链接</h3>
      <ul class="links">${(p.links || []).map((l, i) => `<li>${D.link(l.url, l.label || l.url)}<button type="button" class="x" data-link-del="${i}" aria-label="删除链接">×</button></li>`).join('') || '<li class="muted">还没有链接（Figma、动效稿、后台……）</li>'}</ul>
      <form class="link-add" data-link-add><input name="label" placeholder="名称，如 Figma" maxlength="40" aria-label="链接名称"><input name="url" type="url" placeholder="https://…" aria-label="链接地址"><button class="tb">添加</button></form>
    </section>
    <section class="dsec"><h3>本机路径 <small class="muted">只显示和复制，网页不会去访问</small></h3>
      <ul class="links">${(p.local_paths || []).map((l, i) => `<li><span class="mono path">${esc(l)}</span><span><button type="button" class="tb" data-path-copy="${i}">复制</button><button type="button" class="x" data-path-del="${i}" aria-label="删除路径">×</button></span></li>`).join('') || '<li class="muted">还没有（项目文件夹、交付物位置……）</li>'}</ul>
      <form class="link-add one" data-path-add><input name="path" placeholder="~/Documents/…" maxlength="500" aria-label="本机路径"><button class="tb">添加</button></form>
    </section>
    <section class="dsec"><div class="fgrid">
      ${F('标签（逗号分隔）', `<input data-f="tags" value="${esc((p.tags || []).join(', '))}" aria-label="标签">`, 'wide')}
      ${F('备注', `<textarea data-f="notes" rows="4" maxlength="5000" aria-label="备注">${esc(p.notes || '')}</textarea>`, 'wide')}
    </div></section>
    <footer class="dfoot"><span class="muted">新建 ${esc(D.isoToShDate(p.created_at))} · 更新 ${esc(D.isoToShDate(p.updated_at))}</span>
      <span><button type="button" class="btn sm ghost" data-archive>${p.archived_at ? '取消归档' : '归档'}</button>
      <button type="button" class="btn sm danger ghost" data-del-project>删除项目</button></span></footer>`;
  }

  function delivs(p) {
    const list = D.delivsOf(p.id);
    return `<section class="dsec">
      <ul class="dlist">${list.map(d => {
        const cp = D.checkProgress(d), open = expanded.has(d.id), r = d.status === 'done' ? { text: d.delivered_at ? `${D.fmtDate(d.delivered_at)} 交付` : '已交付', cls: 'ok' } : D.rel(d.due_at);
        return `<li class="ditem${d.status === 'done' ? ' done' : ''}" data-deliv="${d.id}">
          <div class="drow">
            <button type="button" class="pickbtn slim" data-dpick="status">${D.delivChip(d.status)}</button>
            <input class="dname-in" data-df="name" value="${esc(d.name || '')}" placeholder="${esc(d.type)}" maxlength="80" aria-label="名称">
            <button type="button" class="pickbtn slim" data-dpick="type">${esc(d.type)}</button>
            <input class="dver" data-df="version" value="${esc(d.version || '')}" placeholder="版本" maxlength="20" aria-label="版本">
            <button type="button" class="tb" data-ddue>${d.offset_days != null ? `<small class="muted">${esc(D.offsetLabel(d.offset_days))}</small> ` : ''}<span class="due ${r.cls}">${esc(r.text || '截止日')}</span></button>
          </div>
          <div class="drow2">
            <button type="button" class="link-btn" data-check-toggle>${cp.total ? `☑ 交付前检查 ${cp.done}/${cp.total}` : '没有匹配的检查清单'} ${open ? '▴' : '▾'}</button>
            ${d.status !== 'done' ? `<button type="button" class="btn sm${cp.done < cp.total ? ' ghost' : ''}" data-deliver>标成已交付</button>` : ''}
            <span class="grow"></span><button type="button" class="link-btn danger" data-ddel>删除</button>
          </div>
          ${open ? `<div class="checks-box">
            ${D.checklistsFor(d.type).map(cl => `<div class="cl"><b>${esc(cl.name)}</b>${(cl.items || []).map(it => `<label class="check"><input type="checkbox" data-check="${cl.id}" data-item="${esc(it)}" ${d.checklist_state?.[cl.id]?.[it] ? 'checked' : ''}> <span>${esc(it)}</span></label>`).join('')}</div>`).join('') || '<p class="muted small">「设置 → 检查清单」里还没有适用于「' + esc(d.type) + '」的清单。</p>'}
            <div class="fgrid">${F('文件名 / 位置', `<input data-df="file_hint" value="${esc(d.file_hint || '')}" maxlength="300" aria-label="文件位置">`, 'wide')}
            ${F('备注', `<input data-df="notes" value="${esc(d.notes || '')}" maxlength="2000" aria-label="交付物备注">`, 'wide')}</div></div>` : ''}
        </li>`;
      }).join('') || '<li class="muted">还没有交付物。用「概览 → 一键排期」自动生成，或在下面手动加。</li>'}</ul>
      <form class="add-row" data-deliv-add>
        <select name="type" aria-label="交付物类型">${D.selectOpts(D.cfg().deliverable_types, '')}</select>
        <input name="name" placeholder="名称（可不填）" maxlength="80" aria-label="名称">
        <input name="version" placeholder="版本，如 V1" maxlength="20" aria-label="版本" class="w80">
        <input name="due" type="date" aria-label="截止日">
        <button class="tb">添加</button>
      </form></section>`;
  }

  function tasks(p) {
    const list = D.tasksOf(p.id).sort((a, b) => (a.sort_order ?? 1e18) - (b.sort_order ?? 1e18) || a.id - b.id);
    return `<section class="dsec"><ul class="tasks sortable-tasks">${list.map(t => {
      const r = t.done ? { text: '', cls: '' } : D.rel(t.due_at);
      return `<li class="${t.done ? 'done' : ''}" data-task="${t.id}" data-id="${t.id}"><span class="grip" data-drag title="拖动排序">⠿</span>
        <label><input type="checkbox" data-task-done ${t.done ? 'checked' : ''}> <span>${t.milestone ? '🚩 ' : ''}${esc(t.title)}</span></label>
        ${t.offset_days != null ? `<small class="muted">${esc(D.offsetLabel(t.offset_days))}</small>` : ''}
        <button type="button" class="tb slim" data-tdue><span class="due ${r.cls}">${esc(t.due_at ? (t.done ? D.fmtDate(t.due_at) : r.text) : '日期')}</span></button>
        <button type="button" class="x" data-task-del aria-label="删除待办">×</button></li>`;
    }).join('') || '<li class="muted">还没有待办</li>'}</ul>
      <form class="sub-add" data-task-add><input name="title" placeholder="＋ 添加待办，回车保存" maxlength="200" aria-label="新待办"><input name="due" type="date" aria-label="截止日期"><button class="tb">添加</button></form></section>`;
  }

  function pendings(p) {
    const list = D.pendingsOf(p.id).sort((a, b) => ['waiting', 'answered', 'dropped'].indexOf(a.status) - ['waiting', 'answered', 'dropped'].indexOf(b.status) || b.blocking - a.blocking || D.waitDays(b) - D.waitDays(a));
    return `<section class="dsec"><ul class="wlist">${list.map(x => D.pendingRow(x, { showProject: false })).join('') || '<li class="muted">还没有待确认。业务方口头说的口径，没定下来的都可以记在这里。</li>'}</ul>
      ${D.pendingForm(p.id)}</section>`;
  }

  function acts(p) {
    const list = D.acts[p.id];
    return `<section class="dsec">
      <form class="act-add" data-act-add>
        <div class="row"><select name="type" aria-label="记录类型">${D.ACT_TYPES.map(a => `<option value="${a.key}">${a.icon} ${esc(a.label)}</option>`).join('')}</select>
        <input name="date" type="date" value="${D.today()}" aria-label="日期"><select name="tool" aria-label="AI 工具">${D.selectOpts(D.cfg().ai_tools, '', { empty: '（AI 工具，可不选）' })}</select></div>
        <input name="summary" maxlength="500" placeholder="一句话摘要" aria-label="摘要">
        <textarea name="content" rows="2" maxlength="50000" placeholder="详细内容（可选，比如粘贴的反馈原文）" aria-label="详细内容"></textarea>
        <div class="row end"><button class="btn sm">添加记录</button></div>
      </form>
      <ol class="timeline">${!list ? '<li class="muted">正在读取…</li>' : list.length ? list.map(a => `<li data-act-id="${a.id}">
        <span class="ticon">${D.actOf(a.type).icon}</span>
        <div class="tbody"><div class="thead"><b>${esc(D.actOf(a.type).label)}</b>${a.tool ? `<span class="tag">${esc(a.tool)}</span>` : ''}<span class="muted">${esc(a.happened_at)}</span>
          <span class="grow"></span><button type="button" class="link-btn" data-act-edit>编辑</button><button type="button" class="link-btn danger" data-act-del>删除</button></div>
          ${a.summary ? `<p>${esc(a.summary)}</p>` : ''}
          ${a.content ? `<details><summary>查看全文</summary><pre>${esc(a.content)}</pre></details>` : ''}
        </div></li>`).join('') : '<li class="muted">还没有记录</li>'}</ol>
    </section>`;
  }

  function ai(p) {
    const tools = D.cfg().ai_tools.filter(x => x !== '我自己');
    const st = aiDraft[p.id] || {};
    const tool = st.tool || tools[0] || '';
    const tpls = D.templatesFor('开工', tool);
    const others = [...D.state.prompts.filter(t => t.scene !== '开工' && t.scene !== '需求梳理' && t.scene !== '写玩法提案'), ...D.BUILTIN_PROMPTS.filter(b => b.scene === '收工')];
    return `<section class="dsec"><h3>① 生成开工提示词</h3>
      <form class="ai-form" data-ai-start>
        <div class="row wrap">
          <label class="lbl inline">工具<select name="tool">${D.selectOpts(tools, tool)}</select></label>
          <label class="lbl inline">这次要做<select name="scope">${D.selectOpts(D.TODO_SCOPES, st.scope || D.TODO_SCOPES[0])}</select></label>
        </div>
        <input name="extra" maxlength="200" placeholder="一句话补充，如：按领导意见改原型 V2 的抽奖模块" value="${esc(st.extra || '')}" aria-label="一句话补充">
        <label class="lbl">模板<select name="tpl">${tpls.map(t => `<option value="${esc(t.id)}" ${String(st.tpl) === String(t.id) ? 'selected' : ''}>${esc(t.name)}${t.builtin ? '（内置）' : ''}${t.tool ? ' · ' + esc(t.tool) : ''}</option>`).join('')}</select></label>
        <div class="row"><button class="btn sm">生成</button>${st.text ? '<button type="button" class="btn sm" data-ai-copy>复制并记一笔「AI 经手」</button>' : ''}</div>
        ${st.text ? `<textarea name="out" rows="12" aria-label="生成的提示词">${esc(st.text)}</textarea><p class="muted small">可以直接改；复制时以框里的内容为准。复制后会在时间线记一条「AI 经手」，并把工具加进「最近经手」。</p>` : ''}
      </form></section>
    <section class="dsec"><h3>② 复制成 进度.md 条目</h3>
      <p class="muted small">按看板「更新约定」的格式：进行中 10 行以内，已交付压成 5 行以内。只复制，不会自动写任何文件。</p>
      <pre class="md-out">${esc(D.progressEntry(p))}</pre>
      <div class="row"><button type="button" class="btn sm" data-progress-copy>复制</button></div></section>
    <section class="dsec"><h3>③ 粘贴 AI 的收工汇报</h3>
      <form class="ai-form" data-ai-report>
        <label class="lbl inline">哪个工具<select name="tool">${D.selectOpts(tools, tool)}</select></label>
        <textarea name="text" rows="6" maxlength="50000" placeholder="把 AI 结束时的汇报整段贴进来" aria-label="收工汇报"></textarea>
        <div class="row"><button class="btn sm">存进时间线</button></div>
      </form></section>
    <section class="dsec"><h3>④ 其他模板</h3>
      <form class="ai-form" data-ai-other><div class="row wrap"><select name="tpl" aria-label="模板">${others.map(t => `<option value="${esc(t.id)}">${esc(t.name)}${t.builtin ? '（内置）' : ''}${t.tool ? ' · ' + esc(t.tool) : ''}</option>`).join('')}</select>
        <button class="btn sm ghost">生成并复制</button></div></form></section>`;
  }

  function wins(p) {
    const list = D.state.wins.filter(w => w.project_id === p.id).sort((a, b) => b.happened_at.localeCompare(a.happened_at));
    return `<section class="dsec">
      ${list.length ? `<table class="mini"><thead><tr><th>日期</th><th>做了什么</th><th class="num">以前</th><th class="num">这次</th><th class="num">省了</th></tr></thead><tbody>
        ${list.map(w => `<tr data-win="${w.id}"><td>${esc(D.fmtDate(w.happened_at))}</td><td>${esc(w.task)}${w.portfolio_ok ? ' <span class="tag ok">可上作品集</span>' : ''}</td><td class="num">${esc(D.fmtMinutes(w.before_minutes))}</td><td class="num">${esc(D.fmtMinutes(w.after_minutes))}</td><td class="num"><b>${esc(D.fmtMinutes(D.saved(w)))}</b></td></tr>`).join('')}
      </tbody></table>` : '<p class="muted">这个项目还没有提效记录。用了 AI 或脚本省下时间，就顺手记一条，将来当作品集素材。</p>'}
      <button type="button" class="btn sm" data-win-add>＋ 记一条提效</button></section>`;
  }

  function html(p) {
    const counts = { delivs: D.delivsOf(p.id).filter(d => d.status !== 'done').length, tasks: D.tasksOf(p.id).filter(t => !t.done).length, pendings: D.waitingOf(p.id).length };
    return `<header class="dh">
      <input class="dname" data-f="title" value="${esc(p.title)}" maxlength="120" aria-label="项目名">
      <button type="button" class="icon" data-close aria-label="关闭">✕</button>
    </header>
    <div class="dquick">${D.statusChip(p.status)}${D.provChip(p.province)}${D.kindChip(p.kind)}
      ${p.launch_at ? `<span class="due ${D.rel(p.launch_at, { past: !['live', 'done', 'paused'].includes(p.status) }).cls}">上线 ${esc(D.fmtDateW(p.launch_at))}</span>` : ''}
      ${p.archived_at ? '<span class="tag">已归档</span>' : ''}</div>
    <nav class="dtabs" role="tablist">${TABS.map(([k, l]) => `<button type="button" role="tab" data-tab="${k}" class="${tab === k ? 'on' : ''}" aria-selected="${tab === k}">${l}${counts[k] ? `<span class="badge">${counts[k]}</span>` : ''}</button>`).join('')}</nav>
    <div class="dpane">${{ overview, delivs, tasks, pendings, acts, ai, wins }[tab](p)}</div>`;
  }

  function render() {
    const p = D.project(openId);
    if (!p) return close();
    const box = D.$('#drawer-body');
    const scroll = box.scrollTop;
    box.innerHTML = html(p);
    box.scrollTop = scroll;
    const tl = box.querySelector('.sortable-tasks');
    if (tl) D.sortable(tl, 'li[data-id]', ids => reorderTasks(ids), { axis: 'y', handle: '.grip' });
  }

  async function reorderTasks(ids) {
    ids.forEach((id, i) => { const t = D.find('tasks', id); if (t) t.sort_order = i; });
    render();
    try { await D.api('POST', '/tasks/reorder', { ids: ids.map(Number) }); } catch (e) { D.fail(e); }
  }

  function open(id, toTab) {
    id = Number(id);
    const p = D.project(id); if (!p) return;
    if (openId !== id) tab = 'overview';
    if (toTab && TABS.some(([k]) => k === toTab)) tab = toTab;
    openId = id;
    drawer().hidden = false;
    requestAnimationFrame(() => drawer().classList.add('open'));
    document.body.classList.add('drawer-open');
    render();
    D.$('#drawer-body').scrollTop = 0;
    D.loadActs(id, true).then(() => { if (openId === id) render(); });
  }
  function close() {
    if (openId == null) return;
    openId = null;
    drawer().classList.remove('open');
    document.body.classList.remove('drawer-open');
    setTimeout(() => { if (openId == null) drawer().hidden = true; }, 200);
  }
  D.drawer = { open, close, closeIf: id => { if (openId === id) close(); }, isOpen: () => openId != null, id: () => openId };

  // 列表更新时同步刷新抽屉；正在抽屉里打字时不刷，免得光标跳走（失焦保存后会再刷）
  D.on('render', () => {
    if (openId == null) return;
    const a = document.activeElement;
    if (a && drawer().contains(a) && a.matches('input:not([type=checkbox]):not([type=radio]), textarea, select')) return;
    render();
  });

  /* ================= 交付物：标成已交付（交付前检查没勾完要二次确认） ================= */
  D.deliver = async d => {
    const cp = D.checkProgress(d);
    let force = false;
    if (cp.done < cp.total) {
      if (!(await D.confirm(`「${D.delivLabel(d)}」的交付前检查还有 ${cp.total - cp.done} 项没勾。确定不检查完就标成已交付吗？`, '仍然标成已交付'))) return false;
      force = true;
    }
    try { await D.patch('deliverables', d.id, { status: 'done' }, { force }); D.toast(`「${D.delivLabel(d)}」已交付`); return true; }
    catch (e) {
      if (e.status === 409) D.toast(`交付前检查还有 ${e.data?.missing?.length || ''} 项没勾`, { error: true });
      return false;
    }
  };

  /* ================= 一键排期 ================= */
  D.GENERIC_TIMELINE = { builtin: true, name: '通用示例：开工 T−7 / 交付 T−1 / 上线 T', items: [
    { offset_days: -7, title: '开工：理清需求、列待确认', is_milestone: true },
    { offset_days: -1, title: '交付', deliverable_type: '其他', is_milestone: true },
    { offset_days: 0, title: '上线', is_milestone: true }
  ] };
  D.applyTimeline = async (pid, tl, T, weekend = true) => {
    const r = await D.api('POST', `/projects/${pid}/schedule`, { mode: 'apply', launch_at: T, weekend, items: tl.items });
    D.applySchedule(r);
    D.toast(`已按「${tl.name}」生成 ${r.created} 个节点`);
  };

  /* ================= 事件 ================= */
  function bind() {
    const d = drawer();
    D.$('#drawer-backdrop').addEventListener('click', close);

    d.addEventListener('change', async e => {
      const p = D.project(openId); if (!p) return;
      const t = e.target;
      if (t.matches('[data-task-done]')) return D.setTaskDone(Number(t.closest('[data-task]').dataset.task), t.checked);
      if (t.matches('[data-check]')) {
        const dl = D.find('deliverables', t.closest('[data-deliv]').dataset.deliv);
        const st = JSON.parse(JSON.stringify(dl.checklist_state || {}));
        st[t.dataset.check] = { ...(st[t.dataset.check] || {}), [t.dataset.item]: t.checked };
        if (!t.checked) delete st[t.dataset.check][t.dataset.item];
        return D.patch('deliverables', dl.id, { checklist_state: st }).catch(() => {});
      }
      if (t.matches('[data-df]')) {
        const dl = D.find('deliverables', t.closest('[data-deliv]').dataset.deliv);
        const v = t.value.trim() || null;
        if (v !== (dl[t.dataset.df] ?? null)) D.patch('deliverables', dl.id, { [t.dataset.df]: v }).catch(() => {});
        return;
      }
      // 换了工具：模板下拉跟着换（不同工具有各自的开工模板）
      if (t.name === 'tool' && t.closest('[data-ai-start]')) {
        const f = t.closest('form');
        aiDraft[p.id] = { ...(aiDraft[p.id] || {}), tool: t.value, scope: f.scope.value, extra: f.extra.value.trim(), tpl: null };
        return render();
      }
      if (t.closest('form')) return;   // 表单里的输入等提交时再处理
      const key = t.dataset.f; if (!key) return;
      let v;
      if (key === 'tags') v = t.value.split(/[,，]/).map(s => s.trim()).filter(Boolean);
      else v = t.value.trim() || null;
      if (key === 'title' && !v) { D.toast('项目名不能空', { error: true }); t.value = p.title; return; }
      if (JSON.stringify(v) === JSON.stringify(p[key] ?? null)) return;
      if (key === 'launch_at') return D.setLaunch(p, v);
      D.patch('projects', p.id, { [key]: v }).catch(() => {});
    });
    d.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.isComposing && e.target.matches('input[data-f], input[data-df]')) e.target.blur();
    });

    d.addEventListener('click', async e => {
      const p = D.project(openId); if (!p) return;
      const t = e.target;
      if (t.closest('[data-close]')) return close();
      const tb = t.closest('[data-tab]');
      if (tb && tb.closest('.dtabs')) { tab = tb.dataset.tab; render(); D.$('#drawer-body').scrollTop = 0; return; }
      const pick = t.closest('[data-pick]');
      if (pick) {
        const key = pick.dataset.pick, multi = key === 'last_ai';
        return D.pickOption(pick, { options: D.optionsFor(key), value: multi ? (p[key] || []) : p[key], multi, search: key === 'province',
          allowEmpty: key !== 'status', onPick: v => { if (JSON.stringify(v ?? null) !== JSON.stringify(p[key] ?? null)) D.patch('projects', p.id, { [key]: v }).catch(() => {}); } });
      }
      if (t.closest('[data-archive]')) {
        const v = p.archived_at ? null : new Date().toISOString();
        return D.patch('projects', p.id, { archived_at: v }).then(() => D.toast(v ? '已归档（默认不在各视图里显示，筛选「归档」能找回）' : '已取消归档')).catch(() => {});
      }
      if (t.closest('[data-del-project]')) return D.remove('projects', p.id, { label: p.title, text: `确定删除项目「${p.title}」吗？它的交付物、待办、待确认、时间线会一起删除（5 秒内可撤销）。` });
      const ld = t.closest('[data-link-del]');
      if (ld) { const links = [...(p.links || [])]; links.splice(Number(ld.dataset.linkDel), 1); return D.patch('projects', p.id, { links }).catch(() => {}); }
      const pc = t.closest('[data-path-copy]');
      if (pc) return D.copy(p.local_paths[Number(pc.dataset.pathCopy)], '路径');
      const pd = t.closest('[data-path-del]');
      if (pd) { const l = [...(p.local_paths || [])]; l.splice(Number(pd.dataset.pathDel), 1); return D.patch('projects', p.id, { local_paths: l }).catch(() => {}); }

      // 交付物
      const li = t.closest('[data-deliv]');
      if (li) {
        const dl = D.find('deliverables', li.dataset.deliv);
        const dp = t.closest('[data-dpick]');
        if (dp) {
          const key = dp.dataset.dpick;
          return D.pickOption(dp, { options: D.optionsFor(key === 'status' ? 'deliv_status' : 'deliverable_type'), value: dl[key], allowEmpty: false, onPick: v => {
            if (v === dl[key]) return;
            if (key === 'status' && v === 'done') return D.deliver(dl);
            D.patch('deliverables', dl.id, { [key]: v }).catch(() => {});
          } });
        }
        if (t.closest('[data-ddue]')) return D.datePopover(t.closest('[data-ddue]'), dl.due_at, v => D.patch('deliverables', dl.id, { due_at: v }).catch(() => {}));
        if (t.closest('[data-check-toggle]')) { expanded.has(dl.id) ? expanded.delete(dl.id) : expanded.add(dl.id); return render(); }
        if (t.closest('[data-deliver]')) return D.deliver(dl);
        if (t.closest('[data-ddel]')) return D.remove('deliverables', dl.id, { label: D.delivLabel(dl) });
      }
      // 待办
      const tk = t.closest('[data-task]');
      if (tk) {
        const task = D.find('tasks', tk.dataset.task);
        if (t.closest('[data-tdue]')) return D.datePopover(t.closest('[data-tdue]'), task.due_at, v => D.patch('tasks', task.id, { due_at: v }).catch(() => {}));
        if (t.closest('[data-task-del]')) return D.remove('tasks', task.id, { label: task.title });
      }
      // 时间线
      const al = t.closest('[data-act-id]');
      if (al) {
        const a = (D.acts[p.id] || []).find(x => x.id === Number(al.dataset.actId));
        if (t.closest('[data-act-del]')) return D.remove('activities', a.id, { label: a.summary || D.actOf(a.type).label, text: `删除这条「${D.actOf(a.type).label}」记录？` });
        if (t.closest('[data-act-edit]')) return editActivity(al, a);
      }
      if (t.closest('[data-ai-copy]')) return copyStart(p);
      if (t.closest('[data-progress-copy]')) return D.copy(D.progressEntry(p), ' 进度.md 条目');
      if (t.closest('[data-win-add]')) return D.wins.edit(null, { project_id: p.id });
      const wr = t.closest('[data-win]');
      if (wr) return D.wins.edit(Number(wr.dataset.win));
    });

    d.addEventListener('submit', async e => {
      e.preventDefault();
      const p = D.project(openId); if (!p) return;
      const f = e.target;
      const btn = f.querySelector('button:not([type=button])');
      const busy = async fn => { if (btn) btn.disabled = true; try { await fn(); } catch (err) { D.fail(err); } finally { if (btn) btn.disabled = false; } };
      if (f.matches('[data-schedule]')) {
        const tl = [...D.state.timelines, D.GENERIC_TIMELINE][Number(f.tl.value)];
        if (!f.T.value) return D.toast('先填上线日', { error: true });
        return busy(() => D.applyTimeline(p.id, tl, f.T.value, f.weekend.checked));
      }
      if (f.matches('[data-link-add]')) {
        const url = f.url.value.trim(); if (!url) return;
        if (!D.safeUrl(url)) return D.toast('链接要以 https:// 开头', { error: true });
        return D.patch('projects', p.id, { links: [...(p.links || []), { label: f.label.value.trim(), url }] }).catch(() => {});
      }
      if (f.matches('[data-path-add]')) {
        const v = f.path.value.trim(); if (!v) return;
        return D.patch('projects', p.id, { local_paths: [...(p.local_paths || []), v] }).catch(() => {});
      }
      if (f.matches('[data-deliv-add]')) {
        return busy(async () => { await D.create('deliverables', { project_id: p.id, type: f.type.value, name: f.name.value.trim(), version: f.version.value.trim(), due_at: f.due.value || null }); D.toast('已添加交付物'); });
      }
      if (f.matches('[data-task-add]')) {
        const title = f.title.value.trim(); if (!title) return;
        return busy(async () => { await D.create('tasks', { project_id: p.id, title, due_at: f.due.value || null, sort_order: D.tasksOf(p.id).length }); });
      }
      if (f.matches('[data-pending-add]')) return D.submitPending(f, p.id);
      if (f.matches('[data-act-add]')) {
        return busy(async () => {
          await D.create('activities', { project_id: p.id, type: f.type.value, summary: f.summary.value.trim(), content: f.content.value, tool: f.tool.value || null, happened_at: f.date.value || D.today() });
          D.toast('已添加记录');
        });
      }
      if (f.matches('[data-ai-start]')) {
        const vars = await D.projectVars(p, { tool: f.tool.value, todo: `${f.scope.value}${f.extra.value.trim() ? '：' + f.extra.value.trim() : ''}` });
        const tpl = D.promptById(f.tpl.value) || D.templatesFor('开工', f.tool.value)[0];
        aiDraft[p.id] = { tool: f.tool.value, scope: f.scope.value, extra: f.extra.value.trim(), tpl: tpl.id, text: D.fillTemplate(tpl.body, vars) };
        render();
        D.$('#drawer [name=out]')?.focus();
        return;
      }
      if (f.matches('[data-ai-report]')) {
        const text = f.text.value.trim(); if (!text) return D.toast('先把汇报贴进来', { error: true });
        const tool = f.tool.value;
        return busy(async () => {
          await D.create('activities', { project_id: p.id, type: 'ai', tool, summary: `${tool} 收工汇报：${D.firstLine(text, 80)}`, content: text, happened_at: D.today() });
          f.reset();
          D.toast('已存进时间线。这次用 AI 省了时间吗？', { action: '记一条提效', timeout: 8000, onAction: () => D.wins.edit(null, { project_id: p.id, tools: [tool], task: D.firstLine(text, 60) }) });
        });
      }
      if (f.matches('[data-ai-other]')) {
        const tpl = D.promptById(f.tpl.value); if (!tpl) return D.toast('还没有其他模板，可以去「设置 → 提示词模板」加', { error: true });
        const vars = await D.projectVars(p, { tool: tpl.tool || '', todo: p.next_action || '' });
        return D.copy(D.fillTemplate(tpl.body, vars), `「${tpl.name}」提示词`);
      }
    });
    d.addEventListener('input', e => {
      const f = e.target.closest('[data-ai-start]'); if (!f || !aiDraft[openId]) return;
      if (e.target.name === 'out') aiDraft[openId].text = e.target.value;
    });
  }

  async function copyStart(p) {
    const st = aiDraft[p.id]; if (!st?.text) return;
    const text = D.$('#drawer [name=out]')?.value || st.text;
    await D.copy(text, '开工提示词');
    try {
      await D.create('activities', { project_id: p.id, type: 'ai', tool: st.tool, summary: `开工：${st.scope}${st.extra ? '——' + st.extra : ''}`.slice(0, 500), happened_at: D.today() });
    } catch (e) { D.fail(e); }
  }

  function editActivity(li, a) {
    li.innerHTML = `<form class="act-add" data-act-save>
      <div class="row"><select name="type">${D.ACT_TYPES.map(x => `<option value="${x.key}" ${x.key === a.type ? 'selected' : ''}>${x.icon} ${esc(x.label)}</option>`).join('')}</select>
      <input name="date" type="date" value="${esc(a.happened_at)}"><select name="tool">${D.selectOpts(D.cfg().ai_tools, a.tool || '', { empty: '（AI 工具）' })}</select></div>
      <input name="summary" maxlength="500" value="${esc(a.summary || '')}">
      <textarea name="content" rows="3" maxlength="50000">${esc(a.content || '')}</textarea>
      <div class="row end"><button type="button" class="btn sm ghost" data-cancel>取消</button><button class="btn sm">保存</button></div></form>`;
    const f = li.querySelector('form');
    f.querySelector('[data-cancel]').addEventListener('click', render);
    f.addEventListener('submit', async e => {
      e.preventDefault(); e.stopPropagation();
      try {
        const r = await D.api('PATCH', `/activities/${a.id}`, { type: f.type.value, happened_at: f.date.value, summary: f.summary.value.trim(), content: f.content.value, tool: f.tool.value || null });
        D.emit('activity', r.item); if (r.project) D.put('projects', r.project); D.render(); render(); D.toast('已保存');
      } catch (err) { D.fail(err); }
    });
  }

  /* ================= 待办（今天视图和抽屉共用） ================= */
  D.setTaskDone = async (id, done) => {
    const t = D.find('tasks', id); if (!t) return;
    try { await D.patch('tasks', id, done ? { done: 1, done_at: D.today() } : { done: 0 }); } catch { /* 已提示 */ }
  };

  document.addEventListener('DOMContentLoaded', bind);
})();
