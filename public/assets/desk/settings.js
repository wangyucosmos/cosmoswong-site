/* 我的工作台 · 设置：选项清单、在等谁标色天数、时间表模板、检查清单、提示词模板、数据（备份 / 恢复 / 初始化包 / CSV）、快捷键、改密码、退出。
   写法照 /kol 的 settings.js。代码里只有通用默认值；具体业务内容（省份、月度时间表、检查清单、开工提示词、快捷入口）走「导入初始化包」。 */
(() => {
  const D = window.DESK;
  const { esc } = D;

  /* ---------- 选项清单编辑器（一行一个，可拖动排序） ---------- */
  const rowsEditor = (key, rows, cols) => `<form class="opt-editor" data-setting="${key}">
    <div class="opt-rows">${rows.map(r => rowHtml(cols, r)).join('')}</div>
    <div class="row"><button type="button" class="tb" data-add-row>＋ 添加一行</button><span class="grow"></span><button class="btn sm">保存</button></div>
    <template>${rowHtml(cols, {})}</template></form>`;
  function rowHtml(cols, r) {
    return `<div class="opt-row" data-id="${D.uid()}"><span class="grip" data-drag title="拖动排序">⠿</span>${cols.map(c => c.type === 'color'
      ? `<input type="color" name="${c.key}" value="${esc(r[c.key] || '#8a8f98')}" aria-label="${esc(c.label)}">`
      : `<input name="${c.key}" value="${esc(r[c.key] ?? '')}" placeholder="${esc(c.label)}" maxlength="${c.max || 30}" aria-label="${esc(c.label)}">`).join('')}<button type="button" class="x" data-del-row aria-label="删除这一行">×</button></div>`;
  }
  const LISTS = [
    ['kinds', '项目类型', '项目的大类，带颜色。'],
    ['provinces', '省份', '负责的省份会变：以你自己的最新名单为准，在这里改。全国项目不用选省份。'],
    ['deliverable_types', '交付物类型', '检查清单按它匹配。'],
    ['ask_whom', '问谁', '「待确认」里选的对象。'],
    ['ai_tools', 'AI 工具', '「最近经手」和生成提示词时可选的工具。'],
    ['win_task_types', '提效记录的任务类型', ''],
    ['inbox_sources', '收集箱来源', '']
  ];

  /* ---------- 时间表模板 ---------- */
  const tlRow = (n = {}) => `<div class="tl-edit-row" data-id="${D.uid()}"><span class="grip" data-drag>⠿</span>
    <label class="lbl inline">T<input type="number" name="off" value="${esc(n.offset_days ?? '')}" min="-365" max="365" class="w70" aria-label="相对上线日的天数（负数 = 上线前）" placeholder="−7"></label>
    <input name="title" value="${esc(n.title || '')}" maxlength="200" placeholder="这个节点做什么" aria-label="节点">
    <select name="dtype" aria-label="同时生成的交付物">${D.selectOpts(D.cfg().deliverable_types, n.deliverable_type || '', { empty: '（不生成交付物）' })}</select>
    <input name="dname" value="${esc(n.deliverable_name || '')}" maxlength="80" placeholder="交付物名称（可不填）" aria-label="交付物名称" class="w160">
    <label class="check"><input type="checkbox" name="mile" ${n.is_milestone ? 'checked' : ''}> 里程碑</label>
    <button type="button" class="x" data-del-row aria-label="删除这个节点">×</button></div>`;
  const tlForm = t => `<form class="tl-form" data-tl="${t?.id || ''}">
    <div class="row wrap"><label class="lbl inline">模板名<input name="name" value="${esc(t?.name || '')}" maxlength="60" required></label>
      <label class="lbl inline">适用类型<select name="kind">${D.selectOpts(D.cfg().kinds.map(k => k.name), t?.kind || '', { empty: '（不限）' })}</select></label></div>
    <p class="muted small">「T」填相对上线日的天数：上线前 21 天写 −21，上线当天写 0，上线后 3 天写 3。</p>
    <div class="tl-rows">${(t?.items || [{}]).map(tlRow).join('')}</div>
    <template>${tlRow()}</template>
    <div class="row"><button type="button" class="tb" data-add-row>＋ 加一个节点</button><span class="grow"></span>
      ${t ? '<button type="button" class="btn sm danger ghost" data-tl-del>删除模板</button>' : ''}<button class="btn sm">保存</button></div></form>`;

  /* ---------- 检查清单 ---------- */
  const clForm = c => `<form class="cl-form" data-cl="${c?.id || ''}">
    <label class="lbl">清单名<input name="name" value="${esc(c?.name || '')}" maxlength="60" required></label>
    <div class="lbl">适用于哪些交付物 <small class="muted">（都不勾 = 所有类型）</small>
      <div class="checks">${D.cfg().deliverable_types.map(t => `<label><input type="checkbox" name="applies" value="${esc(t)}" ${(c?.applies_to || []).includes(t) ? 'checked' : ''}> ${esc(t)}</label>`).join('')}</div></div>
    <label class="lbl">检查项（一行一条）<textarea name="items" rows="${Math.min(14, Math.max(4, (c?.items || []).length + 1))}" maxlength="30000">${esc((c?.items || []).join('\n'))}</textarea></label>
    <div class="row end">${c ? '<button type="button" class="btn sm danger ghost" data-cl-del>删除清单</button><span class="grow"></span>' : ''}<button class="btn sm">保存</button></div></form>`;

  /* ---------- 提示词模板 ---------- */
  const varsFor = scene => (D.OTHER_VARS[scene] || D.PROJECT_VARS);
  const ptForm = t => `<form class="pt-form" data-pt="${t?.builtin ? '' : t?.id || ''}">
    <div class="row wrap"><label class="lbl inline">模板名<input name="name" value="${esc(t?.builtin ? t.name.replace('（通用）', '（我的）') : t?.name || '')}" maxlength="60" required></label>
      <label class="lbl inline">工具<select name="tool">${D.selectOpts(D.cfg().ai_tools.filter(x => x !== '我自己'), t?.tool || '', { empty: '通用（不限工具）' })}</select></label>
      <label class="lbl inline">场景<select name="scene">${D.selectOpts(D.SCENES, t?.scene || '开工')}</select></label></div>
    <div class="vars" data-vars>${varsFor(t?.scene || '开工').map(v => `<button type="button" class="tag var" data-var="${v}">{{${v}}}</button>`).join('')}</div>
    <textarea name="body" rows="14" maxlength="20000" required>${esc(t?.body || '')}</textarea>
    <div class="row end">${t && !t.builtin ? '<button type="button" class="btn sm danger ghost" data-pt-del>删除模板</button><span class="grow"></span>' : ''}<button class="btn sm">保存</button></div></form>`;

  D.renderSettings = (view, el) => {
    const c = D.cfg();
    const open = D.pref.get('settings.open', {});
    const sec = (id, title, body, hint = '') => `<details class="card-box set" data-sec="${id}" ${open[id] ? 'open' : ''}><summary><h3>${title}</h3>${hint ? `<span class="muted small">${hint}</span>` : ''}</summary>${body}</details>`;
    el.innerHTML = `<div class="page settings">
      <section class="card-box hero-box"><h2>⚙️ 设置</h2><p class="muted">选项、模板、清单都可以在这里改。第一次用的话，先用「数据 → 导入初始化包」把你的省份、时间表、检查清单、提示词模板、快捷入口一次导进来。</p></section>
      ${sec('lists', '选项清单', `
        <div class="opt-group"><h4>项目状态 <small class="muted">（只能改名字和颜色，顺序固定）</small></h4>
          <form class="opt-editor" data-setting="statuses"><div class="opt-rows fixed">${c.statuses.map(s => `<div class="opt-row" data-key="${s.key}">${D.statusChip(s.key)}
            <input name="label" value="${esc(s.label)}" maxlength="20" aria-label="状态名"><input type="color" name="color" value="${esc(s.color)}" aria-label="颜色"></div>`).join('')}</div>
            <div class="row end"><button class="btn sm">保存</button></div></form></div>
        ${LISTS.map(([k, t, hint]) => `<div class="opt-group"><h4>${t} ${hint ? `<small class="muted">${hint}</small>` : ''}</h4>${k === 'kinds'
          ? rowsEditor(k, c.kinds, [{ key: 'name', label: '类型名' }, { key: 'color', label: '颜色', type: 'color' }])
          : rowsEditor(k, c[k].map(name => ({ name })), [{ key: 'name', label: t }])}</div>`).join('')}`, '类型、省份、交付物类型、问谁、AI 工具……')}
      ${sec('nudge', '在等谁 · 标色', `<form class="opt-editor" data-setting="nudge_days"><div class="row wrap">
        <label class="lbl inline">等了 <input type="number" name="warn" min="1" max="365" value="${esc(c.nudge_days.warn)}" class="w70"> 天以上标橙</label>
        <label class="lbl inline">等了 <input type="number" name="danger" min="1" max="365" value="${esc(c.nudge_days.danger)}" class="w70"> 天以上标红</label>
        <span class="grow"></span><button class="btn sm">保存</button></div></form>`, `现在：${c.nudge_days.warn} 天标橙、${c.nudge_days.danger} 天标红`)}
      ${sec('timelines', '时间表模板', `<p class="muted small">新建项目或在项目「概览」里一键排期时用。内置一个通用示例（开工 T−7 / 交付 T−1 / 上线 T），不能改；你自己的模板在下面。</p>
        ${D.state.timelines.map(t => `<details class="sub"><summary><b>${esc(t.name)}</b> <span class="muted small">${t.items.length} 个节点${t.kind ? ' · ' + esc(t.kind) : ''}</span></summary>${tlForm(t)}</details>`).join('')}
        <details class="sub"><summary class="add">＋ 新建时间表模板</summary>${tlForm(null)}</details>`, `${D.state.timelines.length} 个`)}
      ${sec('checklists', '检查清单', `<p class="muted small">交付物标「已交付」前要逐项勾完（可强制跳过，要二次确认）。按交付物类型自动匹配。</p>
        ${D.state.checklists.map(cl => `<details class="sub"><summary><b>${esc(cl.name)}</b> <span class="muted small">${cl.items.length} 项 · ${cl.applies_to.length ? esc(cl.applies_to.join('、')) : '所有类型'}</span></summary>${clForm(cl)}</details>`).join('')}
        <details class="sub"><summary class="add">＋ 新建检查清单</summary>${clForm(null)}</details>`, `${D.state.checklists.length} 个`)}
      ${sec('prompts', '提示词模板', `<p class="muted small">在项目抽屉「AI 交接」、收集箱「需求梳理」、玩法创意「写提案」里用。点上面的变量把它插进正文；生成时会换成项目里的真实内容。</p>
        ${D.state.prompts.map(t => `<details class="sub"><summary><b>${esc(t.name)}</b> <span class="muted small">${esc(t.scene || '其他')}${t.tool ? ' · ' + esc(t.tool) : ''}</span></summary>${ptForm(t)}</details>`).join('')}
        ${D.BUILTIN_PROMPTS.map(t => `<details class="sub builtin"><summary><b>${esc(t.name)}</b> <span class="muted small">内置 · ${esc(t.scene)} · 改它会另存成你的模板</span></summary>${ptForm(t)}</details>`).join('')}
        <details class="sub"><summary class="add">＋ 新建提示词模板</summary>${ptForm(null)}</details>`, `${D.state.prompts.length} 个`)}
      ${sec('links', '快捷入口', `<p>在「快捷入口」页直接增删改、拖动排序。<button type="button" class="link-btn" data-goto="links">去快捷入口 →</button></p>`, `${D.state.links.length} 个`)}
      ${sec('data', '数据：备份、恢复、初始化包、导出', `
        <p class="muted small">数据保存在服务器上（不是这台电脑），换电脑、用手机打开都是同一份。建议每周下载一次 JSON 全量备份。</p>
        <div class="row wrap"><button type="button" class="btn sm" data-s="initpack">导入初始化包…</button>
          <button type="button" class="btn sm ghost" data-s="backup">下载 JSON 全量备份</button><button type="button" class="btn sm ghost" data-s="restore">从 JSON 备份恢复…</button>
          <button type="button" class="btn sm ghost" data-s="csv">导出全部项目 CSV</button></div>
        <p class="muted small">初始化包：只<b>新增</b>选项、时间表、检查清单、提示词模板、快捷入口，不改、不删已有的；导入前会先给你看要加什么，重复导入不会出现重复项。</p>`)}
      ${sec('keys', '快捷键', `<p><kbd>/</kbd> 搜索　<kbd>c</kbd> 收集　<kbd>n</kbd> 新项目　<kbd>t</kbd> 回到今天　<kbd>Esc</kbd> 关闭抽屉或浮层</p>
        <p class="muted small">在输入框里打字时快捷键不生效。收集框里：回车保存，Shift+回车换行。</p>`)}
      ${sec('password', '改密码', `<p class="muted small">知道原密码就能改。改完之后，其他电脑和手机上的登录会全部失效，要用新密码重新登录；这台设备保持登录。忘了新密码，可以让 AI 按站点说明把它恢复成最初的密码。</p>
        <form class="pw-form" data-password novalidate>
          <input type="text" name="username" value="desk" autocomplete="username" hidden>
          <label class="fld"><span class="fl">原密码</span><input name="old" type="password" autocomplete="current-password" required></label>
          <label class="fld"><span class="fl">新密码（至少 8 位）</span><input name="new" type="password" autocomplete="new-password" minlength="8" maxlength="128" required></label>
          <label class="fld"><span class="fl">再输一次新密码</span><input name="new2" type="password" autocomplete="new-password" maxlength="128" required></label>
          <p class="pw-msg" role="status"></p>
          <div class="row"><button class="btn sm">改密码</button></div></form>`)}
      <section class="card-box"><h3>账户</h3><p class="muted small">登录会保持 30 天。在别人的电脑上用完记得退出。</p>
        <button type="button" class="btn sm danger" data-s="logout">退出登录</button></section>
    </div>`;
    el.querySelectorAll('.opt-editor .opt-rows:not(.fixed)').forEach(box => D.sortable(box, '.opt-row', () => {}, { axis: 'y', handle: '.grip' }));
    el.querySelectorAll('.tl-rows').forEach(box => D.sortable(box, '.tl-edit-row', () => {}, { axis: 'y', handle: '.grip' }));
  };

  /* ---------- 改密码：原密码 + 两次新密码；成功后服务端发新登录凭证，这台设备不用重新登录 ---------- */
  async function changePassword(f) {
    const msg = f.querySelector('.pw-msg'), btn = f.querySelector('button');
    const say = (t, ok = false) => { msg.textContent = t; msg.className = 'pw-msg ' + (ok ? 'ok-text' : 'warn-text'); };
    const oldPw = f.old.value, newPw = f.new.value;
    if (!oldPw) { say('请输入原密码'); return f.old.focus(); }
    if (newPw.length < 8) { say('新密码至少 8 位'); return f.new.focus(); }
    if (newPw !== f.new2.value) { say('两次输入的新密码不一样'); return f.new2.focus(); }
    if (newPw === oldPw) { say('新密码和原密码一样'); return f.new.focus(); }
    btn.disabled = true; say('正在修改…', true);
    try {
      await D.api('POST', '/password', { old: oldPw, new: newPw });
      f.reset(); say('✓ 密码已修改。下次登录（以及其他设备）请用新密码。', true);
      D.toast('密码已修改');
    } catch (err) { say(err.message); f.old.select(); }
    finally { btn.disabled = false; }
  }

  /* ---------- 数据：备份 / 恢复 / 初始化包 ---------- */
  D.io = {
    async backup(silentName) {
      try {
        const r = await fetch('/api/desk/backup', { credentials: 'same-origin', headers: { 'x-desk-request': '1' } });
        if (!r.ok) throw new Error('备份下载失败');
        D.download(silentName || `我的工作台备份-${D.today()}.json`, await r.text(), 'application/json');
        if (!silentName) D.toast('已下载全量备份');
        return true;
      } catch (e) { D.fail(e); return false; }
    },
    pickFile(accept) {
      return new Promise(resolve => {
        const input = document.createElement('input');
        input.type = 'file'; input.accept = accept;
        input.addEventListener('change', async () => { const f = input.files[0]; resolve(f ? await f.text() : null); });
        input.click();
      });
    },
    async restore() {
      const text = await D.io.pickFile('.json,application/json'); if (!text) return;
      let data; try { data = JSON.parse(text); } catch { return D.toast('这个文件不是有效的备份', { error: true }); }
      if (data?.app !== 'cosmoswong-desk') return D.toast('这不是工作台导出的备份文件', { error: true });
      if (!(await D.confirm(`要用这份备份（导出于 ${data.exported_at ? `${D.isoToShDate(data.exported_at)} ${new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(data.exported_at))}` : '未知时间'}，含 ${(data.projects || []).length} 个项目）替换当前全部数据吗？当前有 ${D.state.projects.length} 个项目。点确认后会先自动下载一份当前数据。`, '继续'))) return;
      if (!(await D.io.backup(`我的工作台-恢复前自动备份-${D.today()}.json`))) return;
      if (!(await D.confirm('已下载当前数据的备份。最后确认一次：恢复后，现在的所有项目、待办、待确认、模板、设置都会被备份里的内容替换。', '确认恢复'))) return;
      try { const res = await D.api('POST', '/restore', { confirm: 'RESTORE', data }); await D.app.reload(); D.toast(`已恢复 ${res.rows} 条数据`); }
      catch (e) { D.fail(e); }
    },
    async initPack() {
      const text = await D.io.pickFile('.json,application/json'); if (!text) return;
      let pack; try { pack = JSON.parse(text); } catch { return D.toast('这个文件不是有效的 JSON', { error: true }); }
      const c = D.cfg();
      const current = Object.fromEntries(['kinds', 'provinces', 'deliverable_types', 'ask_whom', 'ai_tools', 'win_task_types', 'inbox_sources'].map(k => [k, c[k]]));
      let plan;
      try { plan = await D.api('POST', '/init-pack', { pack, current, apply: false }); } catch (e) { return D.fail(e); }
      const NAMES = { kinds: '项目类型', provinces: '省份', deliverable_types: '交付物类型', ask_whom: '问谁', ai_tools: 'AI 工具', win_task_types: '提效任务类型', inbox_sources: '收集箱来源' };
      const li = (title, list) => list.length ? `<li><b>${esc(title)}</b>（${list.length}）：${list.map(esc).join('、')}</li>` : '';
      const p = plan.plan;
      D.$('#initpack-body').innerHTML = plan.count ? `<p>这个初始化包会<b>新增</b>下面 ${plan.count} 项（已有的不动、不重复加）：</p>
        <ul class="plan">${Object.entries(p.options).map(([k, v]) => li('选项 · ' + (NAMES[k] || k), v)).join('')}${li('时间表模板', p.timelines)}${li('检查清单', p.checklists)}${li('提示词模板', p.prompt_templates)}${li('快捷入口', p.links)}</ul>
        <div class="row end"><button type="button" class="btn sm ghost" data-ip-close>取消</button><button type="button" class="btn sm" data-ip-go>确认导入</button></div>`
        : `<p>这个初始化包里的内容都已经有了，没有要新增的。</p><div class="row end"><button type="button" class="btn sm" data-ip-close>好的</button></div>`;
      const dlg = D.$('#initpack');
      dlg.showModal();
      dlg.onclick = async e => {
        if (e.target.closest('[data-ip-close]')) return dlg.close();
        if (!e.target.closest('[data-ip-go]')) return;
        e.target.disabled = true;
        try { const r = await D.api('POST', '/init-pack', { pack, current, apply: true }); await D.app.reload(); dlg.close(); D.toast(`已导入 ${r.count} 项`); }
        catch (err) { D.fail(err); e.target.disabled = false; }
      };
    }
  };

  /* ---------- 事件 ---------- */
  D.settingsEvents = (main, getView) => {
    main.addEventListener('toggle', e => {
      if (getView()?.kind !== 'settings' || !e.target.matches?.('details[data-sec]')) return;
      const o = D.pref.get('settings.open', {}); o[e.target.dataset.sec] = e.target.open; D.pref.set('settings.open', o);
    }, true);
    main.addEventListener('change', e => {
      if (getView()?.kind !== 'settings') return;
      // 提示词模板换了场景：变量按钮跟着换
      if (e.target.name === 'scene' && e.target.closest('.pt-form')) {
        e.target.closest('.pt-form').querySelector('[data-vars]').innerHTML = varsFor(e.target.value).map(v => `<button type="button" class="tag var" data-var="${v}">{{${v}}}</button>`).join('');
      }
    });
    main.addEventListener('click', async e => {
      if (getView()?.kind !== 'settings') return;
      const form = e.target.closest('form');
      if (e.target.closest('[data-add-row]')) {
        const box = form.querySelector('.opt-rows, .tl-rows');
        box.insertAdjacentHTML('beforeend', form.querySelector('template').innerHTML);
        box.lastElementChild.querySelector('input:not([type=color])')?.focus(); return;
      }
      if (e.target.closest('[data-del-row]')) { e.target.closest('.opt-row, .tl-edit-row').remove(); return; }
      const v = e.target.closest('[data-var]');
      if (v) {
        const ta = form.body, ins = `{{${v.dataset.var}}}`, s = ta.selectionStart ?? ta.value.length;
        ta.value = ta.value.slice(0, s) + ins + ta.value.slice(ta.selectionEnd ?? s); ta.focus(); ta.selectionStart = ta.selectionEnd = s + ins.length; return;
      }
      if (e.target.closest('[data-tl-del]')) { const t = D.find('timelines', form.dataset.tl); return D.remove('timelines', t.id, { label: t.name }); }
      if (e.target.closest('[data-cl-del]')) { const t = D.find('checklists', form.dataset.cl); return D.remove('checklists', t.id, { label: t.name }); }
      if (e.target.closest('[data-pt-del]')) { const t = D.find('prompts', form.dataset.pt); return D.remove('prompts', t.id, { label: t.name }); }
      const s = e.target.closest('[data-s]')?.dataset.s;
      if (s === 'backup') D.io.backup();
      if (s === 'restore') D.io.restore();
      if (s === 'initpack') D.io.initPack();
      if (s === 'csv') {
        const list = D.state.projects;
        if (!list.length) return D.toast('还没有项目', { error: true });
        const keys = ['title', 'kind', 'province', 'month', 'status', 'priority', 'requester', 'launch_at', 'due_at', 'summary', 'next_action', 'pendings', 'progress', 'last_ai', 'tags', 'notes', 'updated_at'];
        D.download(`项目-全部-${D.today()}.csv`, D.toCsv(keys.map(k => D.col(k)?.label || k), list.map(p => keys.map(k => D.cellText(p, k)))), 'text/csv;charset=utf-8');
      }
      if (s === 'logout') D.app.logout();
    });
    main.addEventListener('submit', async e => {
      if (getView()?.kind !== 'settings') return;
      e.preventDefault();
      const form = e.target;
      if (form.matches('[data-password]')) return changePassword(form);
      const put = async (k, value) => { await D.api('PUT', `/settings/${k}`, { value }); D.state.settings[k] = value; };
      const done = () => { D.render(true); D.toast('已保存'); };
      try {
        if (form.matches('.tl-form')) {
          const items = [...form.querySelectorAll('.tl-edit-row')].map(r => ({ offset_days: r.querySelector('[name=off]').value, title: r.querySelector('[name=title]').value.trim(),
            deliverable_type: r.querySelector('[name=dtype]').value, deliverable_name: r.querySelector('[name=dname]').value.trim(), is_milestone: r.querySelector('[name=mile]').checked }))
            .filter(n => n.title || n.offset_days !== '');
          if (items.some(n => n.offset_days === '' || !Number.isInteger(Number(n.offset_days)))) return D.toast('每个节点都要填「T」的天数（整数，上线前写负数）', { error: true });
          items.forEach(n => { n.offset_days = Number(n.offset_days); });
          items.sort((a, b) => a.offset_days - b.offset_days);
          const data = { name: form.name.value.trim(), kind: form.kind.value || null, items };
          if (form.dataset.tl) await D.patch('timelines', form.dataset.tl, data); else await D.create('timelines', data);
          return done();
        }
        if (form.matches('.cl-form')) {
          const data = { name: form.name.value.trim(), applies_to: [...form.querySelectorAll('[name=applies]:checked')].map(x => x.value), items: form.items.value.split('\n').map(s => s.trim()).filter(Boolean) };
          if (form.dataset.cl) await D.patch('checklists', form.dataset.cl, data); else await D.create('checklists', data);
          return done();
        }
        if (form.matches('.pt-form')) {
          const data = { name: form.name.value.trim(), tool: form.tool.value || null, scene: form.scene.value, body: form.body.value };
          if (form.dataset.pt) await D.patch('prompts', form.dataset.pt, data); else await D.create('prompts', data);
          return done();
        }
        const key = form.dataset.setting;
        if (key === 'statuses') {
          await put('statuses', [...form.querySelectorAll('.opt-row')].map(r => ({ key: r.dataset.key, label: r.querySelector('[name=label]').value.trim() || D.statusOf(r.dataset.key).label, color: r.querySelector('[name=color]').value })));
          return done();
        }
        if (key === 'nudge_days') {
          const warn = Number(form.warn.value), danger = Number(form.danger.value);
          if (!(warn >= 1 && danger > warn)) return D.toast('标红的天数要比标橙的大', { error: true });
          await put('nudge_days', { warn, danger }); return done();
        }
        const rows = [...form.querySelectorAll('.opt-rows .opt-row')].map(r => Object.fromEntries([...r.querySelectorAll('input[name]')].map(i => [i.name, i.value.trim()])));
        if (key === 'kinds') await put(key, rows.filter(r => r.name).map(r => ({ name: r.name, color: r.color })));
        else await put(key, [...new Set(rows.map(r => r.name).filter(Boolean))]);
        done();
      } catch (err) { D.fail(err); }
    });
  };
})();
