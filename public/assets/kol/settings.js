/* KOL 工作台 · 设置页 与 欢迎页。 */
(() => {
  const K = window.KOL;
  const { esc } = K;

  K.renderWelcome = (view, el) => {
    const c = K.cfg();
    const today = K.state.kols.filter(K.BASE.today).length;
    const missing = ['my_name', 'company', 'product'].filter(k => !c.profile[k]);
    el.innerHTML = `<div class="page welcome">
      <section class="hero-box">
        <h2>👋 欢迎使用 KOL 工作台</h2>
        <p>这里只做一件事：把海外 KOL 从「找到」一路跟到「成交分成」。今天有 <b>${today}</b> 个 KOL 等你跟进。</p>
        <p><button type="button" class="btn" data-goto="today">去看今日待跟进 →</button></p>
        ${missing.length ? `<p class="warn">先花 1 分钟去 <button type="button" class="link-btn" data-goto="templates">邮件模板</button> 填好署名、公司名、产品名，写邮件时会自动带上。</p>` : ''}
      </section>
      <div class="steps">
        <section class="card-box"><h3>① 每天早上：今日待跟进</h3>
          <p>打开工作台默认就在这里。<b>红色</b>的是已经逾期的，排在最前面。</p>
          <p>「下一步」一列会告诉你该做什么：发开发信 / 发第 2 封 / 发最后一封；同一个人发了 3 封都没回，会建议改成「暂不跟进」。</p>
          <p>要发邮件的人多，点上面的 <b>「✉️ 逐个发信」</b>：邮件一封封自动写好，发完点「已发送，下一个」。</p>
          <p>私信或通话联系的，点那一行右边的 <b>「✓ 已跟进」</b>：选方式、写一句聊了啥、点 +3 天 / +7 天，保存。系统会记一条沟通记录，并把 TA 排到下次跟进那天。</p></section>
        <section class="card-box"><h3>② 找新人：找人助手</h3>
          <p>选品类、语言、平台，点生成好的链接直接去 YouTube / TikTok 等平台搜。</p>
          <p>看中谁，把 TA 的<b>主页链接</b>粘贴到「快速添加」，平台和账号会自动识别，录过的人会提示重复。</p></section>
        <section class="card-box"><h3>③ 写邮件：点 KOL → 写邮件</h3>
          <p>点任何一个名字，右边会滑出详情。点「写邮件」，按 TA 的语言自动推荐模板、填好名字和链接。</p>
          <p>可以复制，也可以直接用邮件 App 打开。发完点 <b>「标记已发送」</b>，下次跟进日期自动排好。</p>
          <p>收到回复，在「回邮件」里粘贴进来保存；想让 Claude 帮忙写回复，点「生成给 Claude 的提示词」，粘贴到 Claude 就行。</p></section>
        <section class="card-box"><h3>④ 看全局：所有 KOL / 看板</h3>
          <p>「所有 KOL」按状态分组，点格子就能改；上面的「＋ 筛选」可以按国家、语言、平台、优先级筛。筛好的结果可以存成新视图，也可以把网址存成书签。</p>
          <p>「KOL 看板」里直接拖卡片换状态。</p></section>
        <section class="card-box"><h3>⑤ 记钱：带货与分成</h3>
          <p>KOL 发了视频、产生订单后，在「带货与分成」或 KOL 详情里加一条：订单数、成交额、分成比例。分成金额会自动算，也可以手动改。</p></section>
        <section class="card-box"><h3>⑥ 和公司 CRM 对接</h3>
          <p>任意列表右上角「导入 / 导出」：可以导入 CSV（自动对列、查重；表头写「粉丝量（K）」会自动乘 1000，对方回复原文会存成沟通记录），也可以把当前筛选结果导出成 CSV 贴进公司 CRM，顺手标记「已录入 CRM」。</p>
          <p>导入后去 <b>「🧩 待补全」</b> 看看：缺链接、缺邮箱、缺语言、没排期的人都列在那里，大多一键就能补。</p>
          <p>建议每周点一次「下载 JSON 全量备份」存到电脑里。</p></section>
      </div>
      <section class="card-box keys"><h3>快捷键</h3>
        <p><kbd>/</kbd> 搜索　<kbd>n</kbd> 新建 KOL　<kbd>Esc</kbd> 关闭详情或弹窗</p>
        <p class="muted small">数据保存在服务器上（不是这台电脑），换电脑、用手机打开都是同一份。</p></section>
    </div>`;
  };

  /* ---------- 设置 ---------- */
  const rowsEditor = (key, rows, cols) => `<form class="opt-editor" data-setting="${key}">
    <div class="opt-rows">${rows.map(r => rowHtml(cols, r)).join('')}</div>
    <div class="row"><button type="button" class="tb" data-add-row>＋ 添加一行</button><span class="grow"></span><button class="btn sm">保存</button></div>
    <template>${rowHtml(cols, {})}</template></form>`;
  function rowHtml(cols, r) {
    return `<div class="opt-row" data-id="${K.uid()}"><span class="grip" data-drag title="拖动排序">⠿</span>${cols.map(c => c.type === 'color'
      ? `<input type="color" name="${c.key}" value="${esc(r[c.key] || '#8a8f98')}" aria-label="${esc(c.label)}">`
      : `<input name="${c.key}" value="${esc(r[c.key] ?? '')}" placeholder="${esc(c.label)}" maxlength="${c.max || 40}" ${c.width ? `style="width:${c.width}px"` : ''} aria-label="${esc(c.label)}">`).join('')}<button type="button" class="x" data-del-row aria-label="删除这一行">×</button></div>`;
  }

  K.renderSettings = (view, el) => {
    const c = K.cfg();
    el.innerHTML = `<div class="page settings">
      <section class="card-box"><h3>跟进规则</h3>
        <form class="opt-editor" data-setting="follow">
          <label class="lbl inline">「超期未联系」：上次联系超过 <input name="overdue" type="number" min="1" max="365" value="${esc(c.overdue_days)}" style="width:70px"> 天</label>
          <p class="muted small">每个状态的名字、颜色，以及「✓ 已跟进」时默认把下次跟进排到几天后（0 = 不自动排，默认 3 天）：</p>
          <div class="opt-rows">${c.statuses.map(s => `<div class="opt-row" data-key="${s.key}">${K.statusChip(s.key)}
            <input name="label" value="${esc(s.label)}" maxlength="20" aria-label="状态名">
            <input type="color" name="color" value="${esc(s.color)}" aria-label="颜色">
            <label class="lbl inline">+<input name="days" type="number" min="0" max="365" value="${esc(s.days)}" style="width:60px" aria-label="默认间隔天数"> 天</label></div>`).join('')}</div>
          <div class="row end"><button class="btn sm">保存</button></div>
        </form></section>
      <section class="card-box"><h3>平台</h3>${rowsEditor('platforms', c.platforms, [{ key: 'name', label: '平台名', max: 30 }, { key: 'color', label: '颜色', type: 'color' }])}</section>
      <section class="card-box"><h3>国家 <small class="muted">（排在前面的会在下拉里先出现）</small></h3>${rowsEditor('countries', c.countries, [{ key: 'code', label: '代码，如 DE', max: 2, width: 90 }, { key: 'name', label: '中文名', max: 20 }])}</section>
      <section class="card-box"><h3>语言</h3>${rowsEditor('languages', c.languages, [{ key: 'code', label: '代码，如 de', max: 3, width: 90 }, { key: 'name', label: '中文名', max: 20 }])}</section>
      <section class="card-box"><h3>品类</h3>${rowsEditor('categories', c.categories.map(name => ({ name })), [{ key: 'name', label: '品类', max: 30 }])}</section>
      <section class="card-box"><h3>合作方式</h3>${rowsEditor('coop_types', c.coop_types.map(name => ({ name })), [{ key: 'name', label: '合作方式', max: 30 }])}</section>
      <section class="card-box"><h3>来源</h3>${rowsEditor('sources', c.sources.map(name => ({ name })), [{ key: 'name', label: '来源', max: 30 }])}</section>
      <section class="card-box"><h3>模板变量默认值</h3><p class="muted small">署名、公司名、产品名、默认带货链接在 <button type="button" class="link-btn" data-goto="templates">邮件模板</button> 页面顶部修改。</p></section>
      <section class="card-box"><h3>数据</h3>
        <div class="row wrap"><button type="button" class="btn sm ghost" data-s="import">导入 CSV…</button><button type="button" class="btn sm ghost" data-s="backup">下载 JSON 全量备份</button><button type="button" class="btn sm ghost" data-s="restore">从 JSON 备份恢复…</button></div></section>
      <section class="card-box"><h3>改密码</h3>
        <p class="muted small">知道原密码就能改。改完之后，其他电脑和手机上的登录会全部失效，要用新密码重新登录；这台设备保持登录。忘了新密码的话，网站管理员可以把它恢复成最初的密码。</p>
        <form class="pw-form" data-password novalidate>
          <input type="text" name="username" value="kol" autocomplete="username" hidden>
          <label class="fld"><span class="fl">原密码</span><input name="old" type="password" autocomplete="current-password" required></label>
          <label class="fld"><span class="fl">新密码（至少 8 位）</span><input name="new" type="password" autocomplete="new-password" minlength="8" maxlength="128" required></label>
          <label class="fld"><span class="fl">再输一次新密码</span><input name="new2" type="password" autocomplete="new-password" maxlength="128" required></label>
          <p class="pw-msg" role="status"></p>
          <div class="row"><button class="btn sm">改密码</button></div>
        </form></section>
      <section class="card-box"><h3>账户</h3><p class="muted small">登录会保持 30 天。在别人的电脑上用完记得退出。</p>
        <button type="button" class="btn sm danger" data-s="logout">退出登录</button></section>
    </div>`;
    el.querySelectorAll('.opt-editor[data-setting]:not([data-setting=follow]) .opt-rows').forEach(box =>
      K.sortable(box, '.opt-row', () => {}, { axis: 'y', handle: '.grip' }));
  };

  // 改密码：原密码 + 两次新密码；成功后服务端发新登录凭证，这台设备不用重新登录
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
      await K.api('POST', '/password', { old: oldPw, new: newPw });
      f.reset(); say('✓ 密码已修改。下次登录（以及其他设备）请用新密码。', true);
      K.toast('密码已修改');
    } catch (err) { say(err.message); f.old.select(); }
    finally { btn.disabled = false; }
  }

  K.settingsEvents = (main, getView) => {
    main.addEventListener('click', async e => {
      if (getView()?.kind !== 'settings') return;
      const form = e.target.closest('form');
      if (e.target.closest('[data-add-row]')) {
        form.querySelector('.opt-rows').insertAdjacentHTML('beforeend', form.querySelector('template').innerHTML);
        form.querySelector('.opt-rows .opt-row:last-child input')?.focus(); return;
      }
      if (e.target.closest('[data-del-row]')) { e.target.closest('.opt-row').remove(); return; }
      const s = e.target.closest('[data-s]')?.dataset.s;
      if (s === 'import') K.io.openImport();
      if (s === 'backup') K.io.backup();
      if (s === 'restore') K.io.restorePick();
      if (s === 'logout') K.app.logout();
    });
    main.addEventListener('submit', async e => {
      if (getView()?.kind !== 'settings') return;
      e.preventDefault();
      if (e.target.matches('[data-password]')) return changePassword(e.target);
      const form = e.target, key = form.dataset.setting;
      const rows = [...form.querySelectorAll('.opt-rows .opt-row')].map(r => Object.fromEntries([...r.querySelectorAll('input[name]')].map(i => [i.name, i.value.trim()])));
      const put = async (k, value) => { await K.api('PUT', `/settings/${k}`, { value }); K.state.settings[k] = value; };
      try {
        if (key === 'follow') {
          const days = Number(form.overdue.value);
          if (!(days >= 1)) return K.toast('天数要大于 0', { error: true });
          const statuses = [...form.querySelectorAll('.opt-row')].map(r => ({ key: r.dataset.key, label: r.querySelector('[name=label]').value.trim() || K.statusOf(r.dataset.key).label, color: r.querySelector('[name=color]').value, days: Math.max(0, Number(r.querySelector('[name=days]').value) || 0) }));
          await put('overdue_days', days); await put('statuses', statuses);
        } else if (key === 'platforms') {
          await put(key, rows.filter(r => r.name).map(r => ({ name: r.name, color: r.color })));
        } else if (key === 'countries') {
          const bad = rows.find(r => r.code && !/^[A-Za-z]{2}$/.test(r.code));
          if (bad) return K.toast(`国家代码要是两个字母：${bad.code}`, { error: true });
          await put(key, rows.filter(r => r.code).map(r => ({ code: r.code.toUpperCase(), name: r.name || r.code.toUpperCase() })));
        } else if (key === 'languages') {
          const bad = rows.find(r => r.code && !/^[A-Za-z]{2,3}$/.test(r.code));
          if (bad) return K.toast(`语言代码要是 2–3 个字母：${bad.code}`, { error: true });
          await put(key, rows.filter(r => r.code).map(r => ({ code: r.code.toLowerCase(), name: r.name || r.code })));
        } else {
          await put(key, [...new Set(rows.map(r => r.name).filter(Boolean))]);
        }
        K.render(true); K.toast('已保存');
      } catch (err) { K.fail(err); }
    });
  };
})();
