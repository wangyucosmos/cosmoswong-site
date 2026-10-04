/* 我的工作台 · 设置（v2：常用的放上面，平时不用改的收进「高级」）。
   代码里只有通用默认值；具体业务内容（省份、月度时间表、检查清单、开工提示词、快捷入口）走「导入初始化包」。 */
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
  const ADV_LISTS = [
    ['deliverable_types', '交付物类型', '提效记录和检查清单都按它分类。'],
    ['ask_whom', '问谁', '「在等谁」里选的对象。'],
    ['ai_tools', 'AI 工具', '项目页「AI 交接」里的工具按钮。'],
    ['inbox_sources', '收集箱来源', ''],
    ['kinds', '项目类型', '现在只在项目「资料」里显示，可以不管。']
  ];

  /* ---------- 时间表模板：三种节点 ---------- */
  const KINDS = [['task', '我要做的'], ['deliverable', '要交的'], ['wait', '等别人给']];
  const kindOf = n => n.kind || (n.deliverable_type ? 'deliverable' : 'task');
  const tlRow = (n = {}) => { const k = kindOf(n); return `<div class="tl-edit-row k-${k}" data-id="${D.uid()}"><span class="grip" data-drag>⠿</span>
    <label class="lbl inline">T<input type="number" name="off" value="${esc(n.offset_days ?? '')}" min="-365" max="365" class="w70" aria-label="相对上线日的天数（负数 = 上线前）" placeholder="−7"></label>
    <select name="kind" aria-label="节点类型" class="w110">${KINDS.map(([v, l]) => `<option value="${v}" ${v === k ? 'selected' : ''}>${l}</option>`).join('')}</select>
    <input name="title" value="${esc(n.title || '')}" maxlength="200" placeholder="${k === 'wait' ? '要别人给 / 确认什么，如：奖品表' : '这个节点做什么'}" aria-label="节点">
    <span class="only-d"><select name="dtype" aria-label="交付物类型">${D.selectOpts(D.cfg().deliverable_types, n.deliverable_type || '', { empty: '交付物类型…' })}</select>
      <input name="dname" value="${esc(n.deliverable_name || '')}" maxlength="80" placeholder="名称（可不填）" aria-label="交付物名称" class="w140"></span>
    <span class="only-w"><select name="whom" aria-label="问谁">${D.selectOpts(D.cfg().ask_whom, n.ask_whom || '', { empty: '问谁…' })}</select>
      <label class="lbl inline">从 T<input type="number" name="from" value="${esc(n.remind_offset ?? '')}" min="-365" max="365" class="w70" aria-label="从哪天开始催（相对上线日）" placeholder="−14"> 起催</label>
      <label class="check"><input type="checkbox" name="block" ${n.blocking ? 'checked' : ''}> 卡交付</label></span>
    <label class="check only-t"><input type="checkbox" name="mile" ${n.is_milestone ? 'checked' : ''}> 里程碑</label>
    <button type="button" class="x" data-del-row aria-label="删除这个节点">×</button></div>`; };
  const tlForm = t => `<form class="tl-form" data-tl="${t?.id || ''}">
    <div class="row wrap"><label class="lbl inline">模板名<input name="name" value="${esc(t?.name || '')}" maxlength="60" required></label>
      <label class="lbl inline">适用类型<select name="kind">${D.selectOpts(D.cfg().kinds.map(k => k.name), t?.kind || '', { empty: '（不限）' })}</select></label></div>
    <p class="muted small">「T」填相对上线日的天数：上线前 21 天写 −21，上线当天写 0。<b>我要做的</b>生成待办；<b>要交的</b>生成交付物；<b>等别人给</b>生成「在等谁」——T 是最晚哪天要到，「起催」是从哪天开始提醒你催。</p>
    <div class="tl-rows">${(t?.items || [{}]).map(tlRow).join('')}</div>
    <template>${tlRow()}</template>
    <div class="row"><button type="button" class="tb" data-add-row>＋ 加一个节点</button><span class="grow"></span>
      ${t ? '<button type="button" class="btn sm danger ghost" data-tl-del>删除模板</button>' : ''}<button class="btn sm">保存</button></div></form>`;

  /* ---------- 检查清单（v2：只做提醒，交付时能点开看一眼，不再拦着） ---------- */
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
    const want = D.pref.get('settings.jump', null);
    const sec = (id, title, body, hint = '') => `<details class="card-box set" data-sec="${id}" id="set-${id}" ${open[id] || want === id ? 'open' : ''}><summary><h3>${title}</h3>${hint ? `<span class="muted small">${hint}</span>` : ''}</summary>${body}</details>`;
    el.innerHTML = `<div class="page settings">
      ${sec('look', '风格与外观', `<h4 class="set-h">风格 <small class="muted">内容一样，只是展现方式不同</small></h4>
        <div class="skin-pick" role="group" aria-label="风格">${[['classic', '经典', '现在这一版：白卡片、青绿色；深色是紫蓝微光'], ['precise', '精密', '像 Linear、Vercel 这类专业工具：细线、紧凑、数字对齐，顶部是交付节点轨道'], ['glass', '玻璃', '像苹果的 macOS / iOS：毛玻璃、彩色图标、大圆角，焦点是三个圆环']].map(([k, t, d]) => `<button type="button" data-skin-set="${k}" class="${(window.DESK_THEME?.getSkin() || 'classic') === k ? 'on' : ''}" aria-pressed="${(window.DESK_THEME?.getSkin() || 'classic') === k}"><span class="sk sk-${k}"><i></i><i></i><i></i></span><b>${t}</b><span class="muted small">${d}</span></button>`).join('')}</div>
        <h4 class="set-h">深浅色</h4>
        <div class="theme-pick" role="group" aria-label="外观">${[['auto', 'a', '跟随系统', '白天浅色、晚上深色'], ['light', 'l', '浅色', '清爽：白卡片、青绿色'], ['dark', 'd', '深色', '精致：深底、紫蓝微光']].map(([k, c, t, d]) => `<button type="button" data-theme-set="${k}" class="${(window.DESK_THEME?.get() || 'auto') === k ? 'on' : ''}"><span class="sw ${c}"><i></i><i></i></span><b>${t}</b><span class="muted small">${d}</span></button>`).join('')}</div>
        <p class="muted small">只记在这台设备的浏览器里；深浅色在左下角也能随时切换，⌘K 里输入「风格」也能换。系统开了「减少动态效果」时，页面动效会自动关掉。</p>`, `${{ classic: '经典', precise: '精密', glass: '玻璃' }[window.DESK_THEME?.getSkin() || 'classic']} · ${{ auto: '跟随系统', light: '浅色', dark: '深色' }[window.DESK_THEME?.get() || 'auto']}`)}
      ${D.DEMO ? '' : sec('share', '分享给别人看', `<p class="muted small">给想看作品集的人发这两个链接：演示版不用密码，数据全是虚构的，对方的改动只存在他自己的浏览器里，碰不到你的真实数据。</p>
        <div class="share-list">${[['演示版', '/desk-demo', '可以直接点着用：今天、项目、开工包、三种风格都能试'], ['案例介绍', '/workbench', '为什么做、怎么设计、怎么和 AI 一起做出来的']].map(([t, p, d]) => `<div class="share-row"><div class="sr-t"><b>${t}</b><span class="mono">${esc(location.origin + p)}</span><small class="muted">${d}</small></div>
          <div class="row-btns"><button type="button" class="btn sm" data-share-copy="${p}">${D.icon('copy', 'sm')}复制链接</button><a class="btn sm ghost" href="${p}" target="_blank" rel="noopener">${D.icon('external', 'sm')}打开</a></div></div>`).join('')}</div>
        <div class="row wrap"><button type="button" class="tb" data-share-intro>${D.icon('message', 'sm')}复制一段带链接的介绍（发微信用）</button></div>`, '演示版 · 案例页')}
      ${sec('provinces', '省份', `<p class="muted small">名单随时可以改。新建项目、项目列表分组都按这里的顺序。</p>${rowsEditor('provinces', c.provinces.map(name => ({ name })), [{ key: 'name', label: '省份' }])}`, c.provinces.length ? `${c.provinces.length} 个` : '还没填')}
      ${sec('timelines', '时间表模板', `<p class="muted small">项目页「排期」和新建项目时用。内置一个通用示例（开工 T−7 / 交付 T−1 / 上线 T），不能改；你自己的模板在下面。</p>
        ${D.state.timelines.map(t => `<details class="sub"><summary><b>${esc(t.name)}</b> <span class="muted small">${t.items.length} 个节点${t.kind ? ' · ' + esc(t.kind) : ''}</span></summary>${tlForm(t)}</details>`).join('')}
        <details class="sub"><summary class="add">＋ 新建时间表模板</summary>${tlForm(null)}</details>`, `${D.state.timelines.length} 个`)}
      ${sec('prompts', '提示词模板', `<p class="muted small">项目页「AI 交接」、收集箱「复制给 AI 拆」、玩法创意「写提案」会用到。点变量插进正文，生成时换成项目里的真实内容。<b>不用自己写回填格式</b>：开工 / 收工提示词最后会自动加上【回填工作台】那一段，需求梳理会自动加上【新建项目】那一段。</p>
        ${D.state.prompts.map(t => `<details class="sub"><summary><b>${esc(t.name)}</b> <span class="muted small">${esc(t.scene || '其他')}${t.tool ? ' · ' + esc(t.tool) : ''}</span></summary>${ptForm(t)}</details>`).join('')}
        ${D.BUILTIN_PROMPTS.map(t => `<details class="sub builtin"><summary><b>${esc(t.name)}</b> <span class="muted small">内置 · ${esc(t.scene)} · 改它会另存成你的模板</span></summary>${ptForm(t)}</details>`).join('')}
        <details class="sub"><summary class="add">＋ 新建提示词模板</summary>${ptForm(null)}</details>`, `${D.state.prompts.length} 个`)}
      ${sec('github', 'GitHub 与知识库', D.ghSettings ? D.ghSettings() : '', D.ghReady?.() ? '已连接' : '未连接')}
      ${sec('assets', '素材库与资源', `<p class="muted small">常用网址、本机文件夹、小工具、文档都在左边「资源」页管理，钉住的显示在今天页。素材库读的是这台电脑上你选的文件夹，图片不会上传。</p>
        <div class="row wrap"><button type="button" class="btn sm ghost" data-goto="resources">去资源页</button><button type="button" class="btn sm ghost" data-goto="assets">去素材库</button>${D.assets?.root ? `<span class="muted small">已连接「${esc(D.assets.rootName)}」</span><button type="button" class="tb ghost" data-assets-forget>断开</button>` : ''}</div>`, `${D.state.links.length + (D.state.resources || []).length} 个资源`)}
      ${sec('data', '数据：备份、恢复、初始化包', `
        <p class="muted small">数据保存在服务器上（不是这台电脑），换电脑、用手机打开都是同一份。建议每周下载一次 JSON 全量备份。</p>
        <div class="row wrap"><button type="button" class="btn sm" data-s="initpack">导入初始化包…</button>
          <button type="button" class="btn sm ghost" data-s="backup">下载 JSON 全量备份</button><button type="button" class="btn sm ghost" data-s="restore">从 JSON 备份恢复…</button></div>
        <p class="muted small">初始化包：<b>新增</b>选项、时间表、检查清单、提示词模板、网址、本机文件夹和过往项目，不删已有的；导入前会先给你看要加什么，重复导入不会出现重复项。已有同名、内容却不同的，会单独列出来，你勾了才换成包里的版本。</p>`)}
      ${sec('advanced', '高级', `
        ${ADV_LISTS.map(([k, t, hint]) => `<div class="opt-group"><h4>${t} ${hint ? `<small class="muted">${hint}</small>` : ''}</h4>${k === 'kinds'
          ? rowsEditor(k, c.kinds, [{ key: 'name', label: '类型名' }, { key: 'color', label: '颜色', type: 'color' }])
          : rowsEditor(k, c[k].map(name => ({ name })), [{ key: 'name', label: t }])}</div>`).join('')}
        <div class="opt-group"><h4>在等谁 · 没写「最晚哪天要」时怎么标色</h4><form class="opt-editor" data-setting="nudge_days"><div class="row wrap">
          <label class="lbl inline">等了 <input type="number" name="warn" min="1" max="365" value="${esc(c.nudge_days.warn)}" class="w70"> 天以上标橙</label>
          <label class="lbl inline">等了 <input type="number" name="danger" min="1" max="365" value="${esc(c.nudge_days.danger)}" class="w70"> 天以上标红</label>
          <span class="grow"></span><button class="btn sm">保存</button></div></form></div>
        <div class="opt-group"><h4>检查清单 <small class="muted">交付时能点开看一眼，只做提醒，不拦着</small></h4>
          ${D.state.checklists.map(cl => `<details class="sub"><summary><b>${esc(cl.name)}</b> <span class="muted small">${cl.items.length} 项 · ${cl.applies_to.length ? esc(cl.applies_to.join('、')) : '所有类型'}</span></summary>${clForm(cl)}</details>`).join('')}
          <details class="sub"><summary class="add">＋ 新建检查清单</summary>${clForm(null)}</details></div>`, '交付物类型、问谁、AI 工具、检查清单…')}
      ${sec('keys', '快捷键', `<p><kbd>⌘</kbd> <kbd>K</kbd> 或 <kbd>/</kbd> 搜索一切　<kbd>c</kbd> 收集　<kbd>n</kbd> 新项目　<kbd>t</kbd> 回到今天　<kbd>Esc</kbd> 关掉浮层；在项目页里按 <kbd>Esc</kbd> 回到上一页</p>
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
    // 演示页：不能改密码；「退出登录」换成「重置演示数据」
    if (D.DEMO) {
      el.querySelector('#set-password')?.remove();
      const lo = el.querySelector('[data-s=logout]');
      if (lo) { lo.removeAttribute('data-s'); lo.setAttribute('data-demo-reset', ''); lo.textContent = '重置演示数据'; const box = lo.closest('section'); box.querySelector('h3').textContent = '演示数据'; box.querySelector('p').textContent = '这是演示页：数据全是虚构的，你的改动只存在这个浏览器里。重置会恢复成最初的示例数据。'; }
    }
    el.querySelectorAll('.opt-editor .opt-rows').forEach(box => D.sortable(box, '.opt-row', () => {}, { axis: 'y', handle: '.grip' }));
    el.querySelectorAll('.tl-rows').forEach(box => D.sortable(box, '.tl-edit-row', () => {}, { axis: 'y', handle: '.grip' }));
    if (want) { D.pref.set('settings.jump', null); requestAnimationFrame(() => D.$('#set-' + want)?.scrollIntoView({ block: 'start' })); }
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
  const shTime = iso => `${D.isoToShDate(iso)} ${new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso))}`;
  D.io = {
    async backup(silentName) {
      try {
        const text = D.DEMO ? JSON.stringify(await D.api('GET', '/backup'), null, 1) : await (async () => {   // 演示页的数据在浏览器里，不走服务器
          const r = await fetch('/api/desk/backup', { credentials: 'same-origin', headers: { 'x-desk-request': '1' } });
          if (!r.ok) throw new Error('备份下载失败');
          return r.text();
        })();
        D.download(silentName || `我的工作台备份-${D.today()}.json`, text, 'application/json');
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
      if (!(await D.confirm(`要用这份备份（导出于 ${data.exported_at ? shTime(data.exported_at) : '未知时间'}，含 ${(data.projects || []).length} 个项目）替换当前全部数据吗？当前有 ${D.state.projects.length} 个项目。点确认后会先自动下载一份当前数据。`, '继续'))) return;
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
      const li = (title, list) => list.length ? `<li><b>${esc(title)}</b>（${list.length}）：${list.slice(0, 12).map(esc).join('、')}${list.length > 12 ? ` …等 ${list.length} 个` : ''}</li>` : '';
      const p = plan.plan, changed = p.changed || [];
      const adds = plan.count ? `<p>这个初始化包会<b>新增</b>下面 ${plan.count} 项（已有的不动、不重复加）：</p>
        <ul class="plan">${Object.entries(p.options).map(([k, v]) => li('选项 · ' + (NAMES[k] || k), v)).join('')}${li('时间表模板', p.timelines)}${li('检查清单', p.checklists)}${li('提示词模板', p.prompt_templates)}${li('网址', p.links)}${li('本机文件夹 / 小工具 / 文档', p.resources || [])}${li('过往项目（已交付）', p.projects || [])}</ul>` : '';
      // 同名但内容不同：可能是包更新了，也可能是你自己改过——默认不勾，勾上才覆盖
      const chg = changed.length ? `<p>下面 ${changed.length} 项已经有同名的，但内容和包里不一样（可能是包更新了，也可能是你自己改过）。<b>勾上的</b>会换成包里的版本，不勾就保持原样：</p>
        <ul class="plan">${changed.map(c => `<li><label><input type="checkbox" data-ip-replace="${esc(c.id)}"> ${esc(c.kind)} · ${esc(c.name)}</label></li>`).join('')}</ul>` : '';
      D.$('#initpack-body').innerHTML = plan.count || changed.length ? `${adds}${chg}
        <div class="row end"><button type="button" class="btn sm ghost" data-ip-close>取消</button><button type="button" class="btn sm" data-ip-go>确认导入</button></div>`
        : `<p>这个初始化包里的内容都已经有了，没有要新增的。</p><div class="row end"><button type="button" class="btn sm" data-ip-close>好的</button></div>`;
      const dlg = D.$('#initpack');
      dlg.showModal();
      dlg.onclick = async e => {
        if (e.target.closest('[data-ip-close]')) return dlg.close();
        if (!e.target.closest('[data-ip-go]')) return;
        const replace = [...dlg.querySelectorAll('[data-ip-replace]:checked')].map(x => x.dataset.ipReplace);
        if (!plan.count && !replace.length) { dlg.close(); return D.toast('没有勾选要换的，什么都没改'); }
        e.target.disabled = true;
        try {
          const r = await D.api('POST', '/init-pack', { pack, current, apply: true, replace });
          await D.app.reload(); dlg.close();
          D.toast([r.count ? `新增 ${r.count} 项` : '', r.replaced ? `换成新版 ${r.replaced} 项` : ''].filter(Boolean).join('，') || '没有改动');
        } catch (err) { D.fail(err); e.target.disabled = false; }
      };
    }
  };

  /* ---------- 事件 ---------- */
  D.settingsEvents = main => {
    const on = () => D.current?.kind === 'settings';
    main.addEventListener('toggle', e => {
      if (!on() || !e.target.matches?.('details[data-sec]')) return;
      const o = D.pref.get('settings.open', {}); o[e.target.dataset.sec] = e.target.open; D.pref.set('settings.open', o);
    }, true);
    main.addEventListener('change', e => {
      if (!on()) return;
      if (e.target.name === 'scene' && e.target.closest('.pt-form')) {
        e.target.closest('.pt-form').querySelector('[data-vars]').innerHTML = varsFor(e.target.value).map(v => `<button type="button" class="tag var" data-var="${v}">{{${v}}}</button>`).join('');
      }
      if (e.target.name === 'kind' && e.target.closest('.tl-edit-row')) {
        const row = e.target.closest('.tl-edit-row');
        row.className = row.className.replace(/\bk-\w+/, 'k-' + e.target.value);
        row.querySelector('[name=title]').placeholder = e.target.value === 'wait' ? '要别人给 / 确认什么，如：奖品表' : '这个节点做什么';
      }
    });
    main.addEventListener('click', async e => {
      if (!on()) return;
      const sc = e.target.closest('[data-share-copy]');
      if (sc) return D.copy(location.origin + sc.dataset.shareCopy, '链接');
      if (e.target.closest('[data-share-intro]')) return D.copy(`这是我用 AI 给自己搭的工作台，管活动策划项目里的口径、交付和在等谁。\n演示版（不用登录，数据都是虚构的，可以随便点）：${location.origin}/desk-demo\n设计思路和制作过程：${location.origin}/workbench`, '介绍');
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
      if (s === 'logout') D.app.logout();
    });
    main.addEventListener('submit', async e => {
      if (!on()) return;
      e.preventDefault();
      const form = e.target;
      if (form.matches('[data-password]')) return changePassword(form);
      const put = async (k, value) => { await D.api('PUT', `/settings/${k}`, { value }); D.state.settings[k] = value; };
      const done = () => { D.render(true); D.toast('已保存'); };
      try {
        if (form.matches('.tl-form')) {
          const items = [...form.querySelectorAll('.tl-edit-row')].map(r => {
            const q = n => r.querySelector(`[name=${n}]`);
            const kind = q('kind').value, n = { offset_days: q('off').value, title: q('title').value.trim(), kind, is_milestone: q('mile').checked };
            if (kind === 'deliverable') { n.deliverable_type = q('dtype').value; n.deliverable_name = q('dname').value.trim(); }
            if (kind === 'wait') { n.ask_whom = q('whom').value; n.remind_offset = q('from').value === '' ? null : Number(q('from').value); n.blocking = q('block').checked; }
            return n;
          }).filter(n => n.title || n.offset_days !== '');
          if (items.some(n => n.offset_days === '' || !Number.isInteger(Number(n.offset_days)))) return D.toast('每个节点都要填「T」的天数（整数，上线前写负数）', { error: true });
          if (items.some(n => n.kind === 'deliverable' && !n.deliverable_type)) return D.toast('「要交的」节点要选交付物类型', { error: true });
          items.forEach(n => { n.offset_days = Number(n.offset_days); });
          if (items.some(n => n.kind === 'wait' && n.remind_offset != null && n.remind_offset > n.offset_days)) return D.toast('「起催」要早于或等于最晚那天的 T', { error: true });
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
        if (key === 'baselines') {
          const b = {};
          for (const i of form.querySelectorAll('[name=b]')) if (i.value !== '') b[i.dataset.type] = Math.max(0, Math.round(Number(i.value)));
          await put('baselines', b); return done();
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
