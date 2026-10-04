/* 我的工作台 · 收集箱：随手粘贴业务方的微信消息（快捷键 c），有空再转成项目 / 待办 / 待确认。
   v2：「生成需求梳理提示词」→ AI 拆完会输出一段【新建项目】→「AI 拆完贴回来」一次建好项目、交付物、待确认。 */
(() => {
  const D = window.DESK;
  const { esc } = D;

  const sourceChips = (name, value) => `<div class="seg src" role="radiogroup" aria-label="来源">${D.cfg().inbox_sources.map((s, i) =>
    `<label><input type="radio" name="${name}" value="${esc(s)}" ${(value ? s === value : i === 0) ? 'checked' : ''}><span>${esc(s)}</span></label>`).join('')}</div>`;
  const when = iso => { const d = D.isoToShDate(iso), t = new Date(iso); const hm = new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', hour: '2-digit', minute: '2-digit', hour12: false }).format(t); return `${D.fmtDate(d)} ${hm}`; };

  /* ---------- 收集：回车保存，Shift+回车换行（输入法选字时的回车不算） ---------- */
  async function saveCapture(ta, src, after) {
    const content = ta.value.trim();
    if (!content) return D.toast('先粘贴或写点什么', { error: true });
    try { await D.create('inbox', { content, source: src }); ta.value = ''; D.toast('已放进收集箱'); after?.(); }
    catch (e) { D.fail(e); }
  }
  const enterSaves = (ta, go) => ta.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && e.keyCode !== 229) { e.preventDefault(); go(); }
  });

  function openCapture() {
    const dlg = D.$('#capture');
    D.$('#capture-src').innerHTML = sourceChips('src');
    dlg.showModal();
    D.$('#capture-text').focus();
  }

  /* ---------- 转换 ---------- */
  async function convert(item, to, data) {
    const r = await D.api('POST', `/inbox/${item.id}/convert`, { to, data });
    D.put('inbox', r.item);
    D.put({ projects: 'projects', tasks: 'tasks', pendings: 'pendings' }[r.kind], r.created);
    D.render();
    return r.created;
  }
  D.inboxConvert = convert;

  function toTask(anchor, item) {
    const el = D.popover(anchor, `<form class="pop-form" novalidate><p class="pop-title">转成待办</p>
      <label>待办<input name="title" maxlength="200" value="${esc(D.firstLine(item.content, 60))}"></label>
      <label>属于哪个项目<select name="project">${D.selectOpts(D.optionsFor('project'), '', { empty: '（不属于任何项目）' })}</select></label>
      <label>截止日<input type="date" name="due" value="${D.today()}"></label>
      <div class="pop-foot"><button class="btn sm">转成待办</button></div></form>`, { width: 360, cls: 'sheet' });
    el.querySelector('form').addEventListener('submit', async e => {
      e.preventDefault();
      const f = e.target, title = f.title.value.trim(); if (!title) return D.toast('待办不能空', { error: true });
      D.closePopover();
      try { await convert(item, 'task', { title, project_id: f.project.value ? Number(f.project.value) : null, due_at: f.due.value || null }); D.toast('已转成待办'); } catch (err) { D.fail(err); }
    });
  }
  function toPending(anchor, item) {
    const c = D.cfg();
    const el = D.popover(anchor, `<form class="pop-form" novalidate><p class="pop-title">转成待确认</p>
      <label>要确认什么<textarea name="q" rows="2" maxlength="500">${esc(D.firstLine(item.content, 120))}</textarea></label>
      <label>项目<select name="project">${D.selectOpts(D.optionsFor('project'), '', { empty: '（不属于任何项目）' })}</select></label>
      <div class="row"><label>问谁<select name="whom">${D.selectOpts(c.ask_whom, c.ask_whom[0])}</select></label><label>名字<input name="name" maxlength="40"></label></div>
      <label class="check"><input type="checkbox" name="block"> 卡交付</label>
      <div class="pop-foot"><button class="btn sm">转成待确认</button></div></form>`, { width: 380, cls: 'sheet' });
    el.querySelector('form').addEventListener('submit', async e => {
      e.preventDefault();
      const f = e.target, q = f.q.value.trim(); if (!q) return D.toast('要确认什么不能空', { error: true });
      D.closePopover();
      try { await convert(item, 'pending', { question: q, project_id: f.project.value ? Number(f.project.value) : null, ask_whom: f.whom.value, ask_name: f.name.value.trim(), blocking: f.block.checked ? 1 : 0, asked_at: D.today() }); D.toast('已转成待确认'); }
      catch (err) { D.fail(err); }
    });
  }
  function intake(anchor, item) {
    const tpls = D.templatesFor('需求梳理');
    if (tpls.length === 1) return D.copy(D.intakePrompt(item, tpls[0].id), '需求梳理提示词');
    const el = D.popover(anchor, `<p class="pop-title">用哪个模板？</p><div class="opts">${tpls.map(t => `<button type="button" class="opt" data-t="${esc(t.id)}">${esc(t.name)}${t.builtin ? '（内置）' : ''}</button>`).join('')}</div>`, { cls: 'pick' });
    el.addEventListener('click', e => { const b = e.target.closest('[data-t]'); if (!b) return; D.closePopover(); D.copy(D.intakePrompt(item, b.dataset.t), '需求梳理提示词'); });
  }

  /* ---------- 视图 ---------- */
  const convertedLabel = s => {
    const [k, id] = String(s || '').split(':');
    if (k === 'project') { const p = D.project(id); return p ? `→ 项目 <button type="button" class="link-btn" data-open-project="${p.id}">${esc(p.title)}</button>` : '→ 项目（已删除）'; }
    if (k === 'task') { const t = D.find('tasks', id); return t ? `→ 待办「${esc(t.title)}」` : '→ 待办（已删除）'; }
    if (k === 'pending') { const x = D.find('pendings', id); return x ? `→ 待确认「${esc(x.question)}」` : '→ 待确认（已删除）'; }
    return '已处理';
  };
  const itemHtml = (i, done) => `<li class="iitem" data-inbox="${i.id}">
    <div class="imeta"><span class="tag">${esc(i.source || '其他')}</span><span class="muted">${esc(when(i.created_at))}</span>${done ? `<span class="muted">${convertedLabel(i.converted_to)}</span>` : ''}</div>
    <div class="itext">${esc(i.content)}</div>
    <div class="iact">${done ? '' : `<button type="button" class="tb" data-intake>${D.icon('sparkle', 'sm')} ① 复制给 AI 拆</button><button type="button" class="btn sm" data-intake-paste>${D.icon('download', 'sm')} ② AI 拆完贴回来</button>
      <span class="sep"></span><button type="button" class="btn sm ghost" data-conv="project">直接转成项目</button><button type="button" class="btn sm ghost" data-conv="task">转成待办</button><button type="button" class="btn sm ghost" data-conv="pending">转成待确认</button>`}
      <span class="grow"></span><button type="button" class="link-btn danger" data-idel>删除</button></div></li>`;

  D.renderInbox = (view, el) => {
    const match = i => !D.q || i.content.toLowerCase().includes(D.q.toLowerCase());
    const open = D.state.inbox.filter(i => !i.processed_at && match(i)).sort((a, b) => b.id - a.id);
    const done = D.state.inbox.filter(i => i.processed_at && match(i)).sort((a, b) => (b.processed_at || '').localeCompare(a.processed_at || ''));
    el.innerHTML = `<div class="page inbox">
      <section class="card-box cap"><h3>收集一条</h3>
        <textarea id="inbox-text" rows="4" maxlength="20000" placeholder="把业务方的微信消息直接粘进来。回车保存，Shift+回车换行。" aria-label="收集内容"></textarea>
        <div class="row wrap">${sourceChips('inbox-src')}<span class="grow"></span><button type="button" class="btn sm" data-inbox-save>保存</button></div></section>
      <section class="card-box"><h3>没处理的 <span class="gcount">${open.length}</span></h3>
        <ul class="ilist">${open.map(i => itemHtml(i, false)).join('') || '<li class="muted">收集箱是空的。业务方发来需求时，按 <kbd>c</kbd> 粘进来，有空再一键转成项目。</li>'}</ul></section>
      ${done.length ? `<section class="card-box"><details><summary>已处理（${done.length}）</summary><ul class="ilist">${done.map(i => itemHtml(i, true)).join('')}</ul></details></section>` : ''}
    </div>`;
    enterSaves(D.$('#inbox-text', el), () => saveCapture(D.$('#inbox-text', el), D.$('[name=inbox-src]:checked', el)?.value, () => D.$('#inbox-text')?.focus()));
  };

  D.inboxEvents = (main, getView) => {
    main.addEventListener('click', e => {
      if (getView()?.kind !== 'inbox') return;
      if (e.target.closest('[data-inbox-save]')) return saveCapture(D.$('#inbox-text', main), D.$('[name=inbox-src]:checked', main)?.value);
      const li = e.target.closest('[data-inbox]'); if (!li) return;
      const item = D.find('inbox', li.dataset.inbox);
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.conv === 'project') return D.newProject.open({ title: D.firstLine(item.content, 40), summary: item.content.slice(0, 2000) }, item);
      if (b.dataset.conv === 'task') return toTask(b, item);
      if (b.dataset.conv === 'pending') return toPending(b, item);
      if (b.matches('[data-intake]')) return intake(b, item);
      if (b.matches('[data-intake-paste]')) return intakePaste(item);
      if (b.matches('[data-idel]')) return D.remove('inbox', item.id, { label: D.firstLine(item.content, 20), text: '删除这条收集？' });
    });
  };

  /* ---------- AI 拆完贴回来：识别【新建项目】→ 预览 → 一次建好 ---------- */
  function intakePaste(item) {
    const dlg = D.$('#backfill'), body = D.$('#backfill-body');
    D.$('#backfill-title').textContent = '收集箱：AI 拆完贴回来';
    const step1 = (text = '') => {
      body.onchange = null;
      body.innerHTML = `<p class="muted small">把 AI 拆完的回答整段贴进来。用「① 复制给 AI 拆」生成的提示词，AI 会在最后输出一段【新建项目】；识别后先给你看，确认了才建。</p>
        <textarea name="text" rows="12" maxlength="50000" placeholder="整段粘贴 AI 的回答" aria-label="AI 的回答">${esc(text)}</textarea>
        <div class="row end"><button type="button" class="btn sm ghost" data-bf-close>取消</button><button type="button" class="btn sm" data-it-parse>识别</button></div>`;
      body.querySelector('textarea').focus();
    };
    const step2 = text => {
      const r = D.parseIntake(text);
      if (!r) { D.toast('没找到【新建项目】这一段。可以让 AI 按提示词最后的格式再输出一次', { error: true, timeout: 6000 }); return; }
      const p = r.project;
      body.innerHTML = `<p>识别到下面这些，确认后一次建好（不要的取消勾选）：</p>
        <div class="fgrid">
          <label class="fld wide"><span class="fl">项目名</span><input name="title" value="${esc(p.title)}" maxlength="120"></label>
          <label class="fld"><span class="fl">省份</span><input name="province" value="${esc(p.province || '')}" maxlength="30" placeholder="全国"></label>
          <div class="fld"><span class="fl">上线日</span><div class="row tight"><input type="date" name="launch_at" value="${esc(p.launch_at || '')}"><label class="check"><input type="checkbox" name="tent" ${p.launch_tentative ? 'checked' : ''}> 暂定</label></div></div>
          <label class="fld wide"><span class="fl">一句话需求</span><textarea name="summary" rows="2" maxlength="2000">${esc(p.summary || '')}</textarea></label></div>
        <h4>交付物（${r.deliverables.length}）</h4><ul class="bf-list">${r.deliverables.map((d, i) => `<li><label class="check"><input type="checkbox" data-it-d="${i}" checked> ${D.icon('box', 'sm')} ${esc(d.type)}${d.name ? '：' + esc(d.name) : ''}</label></li>`).join('') || '<li class="muted">没有</li>'}</ul>
        <h4>待确认（${r.pendings.length}）</h4><ul class="bf-list">${r.pendings.map((x, i) => `<li><label class="check"><input type="checkbox" data-it-p="${i}" checked> ${D.icon('hourglass', 'sm')} ${esc(x.question)}（问${esc(x.ask_whom || '—')}${x.need_by ? '，最晚 ' + esc(D.fmtDate(x.need_by)) : ''}）</label></li>`).join('') || '<li class="muted">没有</li>'}</ul>
        <div class="row end"><button type="button" class="btn sm ghost" data-it-back>返回修改</button><button type="button" class="btn sm" data-it-go>建项目</button></div>`;
      body.querySelector('[data-it-back]').onclick = () => step1(text);
      body.querySelector('[data-it-go]').onclick = async e => {
        const v = k => body.querySelector(`[name=${k}]`).value.trim() || null;
        const project = { ...p, title: v('title') || p.title, province: v('province'), launch_at: v('launch_at'), launch_tentative: body.querySelector('[name=tent]').checked ? 1 : 0, summary: v('summary') };
        const deliverables = r.deliverables.filter((d, i) => body.querySelector(`[data-it-d="${i}"]`).checked);
        const pendings = r.pendings.filter((x, i) => body.querySelector(`[data-it-p="${i}"]`).checked);
        e.target.disabled = true;
        try {
          const res = await D.api('POST', `/inbox/${item.id}/intake`, { project, deliverables, pendings });
          D.put('inbox', res.item); D.applySubtree(res); dlg.close();
          D.toast(`已建好「${res.project.title}」：${res.deliverables.length} 件交付物、${res.pendings.length} 条待确认`);
          D.app.openProject(res.project.id);
        } catch (err) { D.fail(err); e.target.disabled = false; }
      };
    };
    body.onclick = e => {
      if (e.target.closest('[data-bf-close]')) dlg.close();
      if (e.target.closest('[data-it-parse]')) { const text = body.querySelector('[name=text]').value.trim(); if (!text) return D.toast('先把 AI 的回答贴进来', { error: true }); step2(text); }
    };
    step1();
    dlg.showModal();
  }

  D.capture = { open: openCapture };
  document.addEventListener('DOMContentLoaded', () => {
    const dlg = D.$('#capture'), ta = D.$('#capture-text');
    const go = () => saveCapture(ta, D.$('#capture [name=src]:checked')?.value, () => dlg.close());
    enterSaves(ta, go);
    D.$('#capture-save').addEventListener('click', go);
    dlg.addEventListener('click', e => { if (e.target.closest('[data-cap-close]')) dlg.close(); });
  });
})();
