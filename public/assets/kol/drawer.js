/* KOL 工作台 · 右侧详情抽屉 + 「✓ 已跟进」浮层。点任何一行或卡片都从右边滑出，不跳页。 */
(() => {
  const K = window.KOL;
  const { esc } = K;
  K.actCache = {};   // kol_id → 沟通记录（打开抽屉时从服务器取）

  /* ================= ✓ 已跟进 浮层 ================= */
  K.followupPopover = (anchor, k) => {
    const nextStatus = k.status === 'todo' ? 'contacted' : k.status;
    const el = K.popover(anchor, `<form class="fu" novalidate>
      <p class="pop-title">记一次跟进 · ${esc(k.name)}</p>
      <div class="seg" role="radiogroup" aria-label="联系方式">
        <label><input type="radio" name="type" value="email_out" checked><span>📤 邮件</span></label>
        <label><input type="radio" name="type" value="dm"><span>💬 私信</span></label>
        <label><input type="radio" name="type" value="call"><span>📞 通话/其他</span></label>
      </div>
      <input name="summary" maxlength="500" placeholder="一句话说说这次聊了什么（可不填）" aria-label="摘要">
      <label class="lbl">状态<select name="status">${K.cfg().statuses.map(s => `<option value="${s.key}" ${s.key === nextStatus ? 'selected' : ''}>${esc(s.label)}</option>`).join('')}</select></label>
      <div class="lbl">下次跟进
        <div class="quick">${[1, 3, 7, 14].map(n => `<button type="button" class="tb" data-add="${n}">+${n} 天</button>`).join('')}</div>
        <input type="date" name="next" aria-label="下次跟进日期">
      </div>
      <div class="pop-foot"><button type="button" class="btn sm ghost" data-cancel>取消</button><button class="btn sm">保存</button></div>
    </form>`, { cls: 'fu-pop', width: 340 });
    const f = el.querySelector('form');
    let touched = false;
    const setDefault = () => { if (!touched) f.next.value = K.addDays(K.today(), K.defaultFollowDays(f.status.value)); };
    setDefault();
    f.status.addEventListener('change', setDefault);
    f.next.addEventListener('input', () => { touched = true; });
    el.addEventListener('click', e => {
      const add = e.target.closest('[data-add]');
      if (add) { touched = true; f.next.value = K.addDays(K.today(), Number(add.dataset.add)); K.$$('[data-add]', el).forEach(b => b.classList.toggle('on', b === add)); }
      if (e.target.closest('[data-cancel]')) K.closePopover();
    });
    f.addEventListener('submit', async e => {
      e.preventDefault();
      const type = f.type.value, summary = f.summary.value.trim(), next = f.next.value || null, status = f.status.value;
      const act = K.actOf(type);
      const before = { ...k };
      // 乐观更新：先把列表里的这一行改掉，失败再改回来
      Object.assign(k, { last_contact_at: K.today(), next_followup_at: next, status });
      K.closePopover(); K.render();
      try {
        await K.addActivity({ kol_id: k.id, type, summary: summary || `${act.label}跟进`, happened_at: K.today() }, { next_followup_at: next, status });
        K.toast(next ? `已记录，下次跟进：${K.fmtDate(next)}` : '已记录');
      } catch (err) { K.replaceKol(before); K.render(); K.fail(err); }
    });
  };

  /* ================= 抽屉 ================= */
  const drawer = () => K.$('#drawer');
  let openId = null;

  const F = (label, inner, cls = '') => `<div class="fld ${cls}"><span class="fl">${esc(label)}</span>${inner}</div>`;
  const input = (k, key, type = 'text', extra = '') =>
    `<input data-f="${key}" type="${type}" value="${esc(k[key] ?? '')}" ${extra} aria-label="${esc(K.col(key)?.label || key)}">`;
  const picker = (k, key, html) => `<button type="button" class="pickbtn" data-pick="${key}">${html || '<span class="muted">选择…</span>'}</button>`;
  const ynu = v => (K.YNU.find(x => x.key === v) || {}).label;

  function html(k) {
    const acts = K.actCache[k.id];
    const tasks = K.tasksOf(k.id);
    const deals = K.state.deals.filter(d => d.kol_id === k.id);
    const r = K.relFollow(k.next_followup_at);
    const links = k.other_links || [];
    return `
    <header class="dh">
      <input class="dname" data-f="name" value="${esc(k.name)}" maxlength="120" aria-label="名称">
      <button type="button" class="icon" data-close aria-label="关闭">✕</button>
    </header>
    <div class="dquick">
      <button type="button" class="btn sm" data-q="mail">✉️ 写邮件</button>
      <button type="button" class="btn sm" data-q="follow">✓ 记一次联系</button>
      <button type="button" class="tb" data-pick="status">${K.statusChip(k.status)} ▾</button>
      <button type="button" class="tb" data-q="next">📅 下次跟进：<b class="due ${r.cls}">${esc(r.text || '未设置')}</b></button>
    </div>
    ${k.do_not_contact ? '<p class="warn">⚠️ 对方要求勿再联系（GDPR）。「今日待跟进」不会再排到他。</p>' : ''}
    <section class="dsec"><h3>基本信息</h3><div class="fgrid">
      ${F('平台', picker(k, 'platform', K.platformChip(k.platform)))}
      ${F('账号', input(k, 'handle', 'text', 'maxlength="120" placeholder="@账号"'))}
      ${F('主页链接', `<div class="with-btn">${input(k, 'profile_url', 'url', 'placeholder="https://…"')}${K.safeUrl(k.profile_url) ? `<a class="tb" href="${esc(K.safeUrl(k.profile_url))}" target="_blank" rel="noopener noreferrer">打开</a>` : ''}</div>`, 'wide')}
      ${F('国家', picker(k, 'country', K.countryLabel(k.country)))}
      ${F('语言', picker(k, 'language', esc(K.langName(k.language))))}
      ${F('优先级', picker(k, 'priority', K.priorityChip(k.priority)))}
      ${F('初筛评级', picker(k, 'rating', k.rating ? esc(k.rating) : ''))}
      ${F('品类', picker(k, 'category', (k.category || []).map(c => `<span class="tag">${esc(c)}</span>`).join('')), 'wide')}
      ${F('粉丝量', input(k, 'followers', 'number', 'min="0"'))}
      ${F('平均播放', input(k, 'avg_views', 'number', 'min="0"'))}
      ${F('互动率 %', input(k, 'engagement_rate', 'number', 'step="0.01"'))}
      ${F('数据核实日期', input(k, 'data_updated_at', 'date'))}
      ${F('带货权限', picker(k, 'can_sell', esc(ynu(k.can_sell) || '')))}
      ${F('推过同类产品', picker(k, 'promoted_similar', esc(ynu(k.promoted_similar) || '')))}
    </div></section>

    <section class="dsec"><h3>联系方式</h3><div class="fgrid">
      ${F('邮箱', `<div class="with-btn">${input(k, 'email', 'email', 'placeholder="商务邮箱"')}${k.email ? '<button type="button" class="tb" data-copy-email>复制</button>' : ''}</div>`, 'wide')}
      ${F('其他联系方式', input(k, 'contact_other', 'text', 'maxlength="300" placeholder="Discord / Telegram / IG 私信…"'), 'wide')}
      <div class="fld wide"><span class="fl">其他平台链接</span>
        <ul class="links">${links.map((l, i) => `<li>${K.link(l.url, l.label || l.url)}<button type="button" class="x" data-link-del="${i}" aria-label="删除链接">×</button></li>`).join('')}</ul>
        <form class="link-add" data-link-add><input name="label" placeholder="名称，如 Instagram" maxlength="30" aria-label="链接名称"><input name="url" type="url" placeholder="https://…" aria-label="链接地址"><button class="tb">添加</button></form>
      </div>
    </div></section>

    <section class="dsec"><h3>跟进</h3><div class="fgrid">
      ${F('首次联系', input(k, 'first_contact_at', 'date'))}
      ${F('上次联系', input(k, 'last_contact_at', 'date'))}
      ${F('下次跟进', input(k, 'next_followup_at', 'date'))}
      ${F('勿再联系', `<label class="check"><input type="checkbox" data-f="do_not_contact" ${k.do_not_contact ? 'checked' : ''}> 对方明确拒绝</label>`)}
      ${F('卡点 / 在等什么', input(k, 'blocker', 'text', 'maxlength="300"'), 'wide')}
    </div></section>

    <section class="dsec"><h3>合作</h3><div class="fgrid">
      ${F('报价（€）', input(k, 'quote', 'number', 'step="0.01" min="0"'))}
      ${F('合作方式', picker(k, 'coop_type', esc(k.coop_type || '')))}
      ${F('报价说明', input(k, 'quote_note', 'text', 'maxlength="200" placeholder="如 €300 固定 + 15% 佣金"'), 'wide')}
      ${F('来源', picker(k, 'source', esc(k.source || '')))}
      ${F('已录入公司 CRM', `<label class="check"><input type="checkbox" data-f="crm_synced" ${k.crm_synced ? 'checked' : ''}> 已录入</label>`)}
      ${F('信息来源链接', `<div class="with-btn">${input(k, 'source_url', 'url')}${K.safeUrl(k.source_url) ? `<a class="tb" href="${esc(K.safeUrl(k.source_url))}" target="_blank" rel="noopener noreferrer">打开</a>` : ''}</div>`, 'wide')}
      ${F('为什么值得关注', input(k, 'reason', 'text', 'maxlength="500"'), 'wide')}
      ${F('标签（逗号分隔）', `<input data-f="tags" value="${esc((k.tags || []).join(', '))}" aria-label="标签">`, 'wide')}
    </div></section>

    <section class="dsec"><h3>子任务 <small class="muted">${tasks.filter(t => t.done).length}/${tasks.length}</small></h3>
      <ul class="tasks">${tasks.map(t => `<li class="${t.done ? 'done' : ''}" data-task="${t.id}"><label><input type="checkbox" data-task-done ${t.done ? 'checked' : ''}> <span>${esc(t.title)}</span></label>${t.due_at ? `<span class="due ${!t.done && t.due_at < K.today() ? 'overdue' : ''}">${esc(K.fmtDate(t.due_at))}</span>` : ''}<button type="button" class="x" data-task-del aria-label="删除子任务">×</button></li>`).join('') || '<li class="muted">还没有子任务</li>'}</ul>
      <form class="sub-add" data-sub-add="${k.id}"><input name="title" placeholder="＋ 添加子任务，如：准备变更邮件" maxlength="200" aria-label="新子任务"><input name="due" type="date" aria-label="截止日期"><button class="tb">添加</button></form>
    </section>

    <section class="dsec"><h3>沟通记录</h3>
      <form class="act-add" data-act-add>
        <div class="row"><select name="type" aria-label="记录类型">${K.ACT_TYPES.map(a => `<option value="${a.key}">${a.icon} ${esc(a.label)}</option>`).join('')}</select>
        <input name="date" type="date" value="${K.today()}" aria-label="日期"></div>
        <input name="summary" maxlength="500" placeholder="一句话摘要" aria-label="摘要">
        <textarea name="content" rows="2" maxlength="20000" placeholder="详细内容（可选，比如邮件全文）" aria-label="详细内容"></textarea>
        <div class="row end"><button class="btn sm">添加记录</button></div>
      </form>
      <ol class="timeline">${!acts ? '<li class="muted">正在读取…</li>' : acts.length ? acts.map(a => `<li data-act-id="${a.id}">
        <span class="ticon">${K.actOf(a.type).icon}</span>
        <div class="tbody"><div class="thead"><b>${esc(K.actOf(a.type).label)}</b><span class="muted">${esc(a.happened_at)}</span>
          <span class="grow"></span><button type="button" class="link-btn" data-act-edit>编辑</button><button type="button" class="link-btn danger" data-act-del>删除</button></div>
          ${a.summary ? `<p>${esc(a.summary)}</p>` : ''}
          ${a.content ? `<details><summary>查看全文</summary><pre>${esc(a.content)}</pre></details>` : ''}
        </div></li>`).join('') : '<li class="muted">还没有沟通记录</li>'}</ol>
    </section>

    <section class="dsec"><h3>带货与分成</h3>
      ${deals.length ? `<table class="mini"><thead><tr><th>月份</th><th>平台</th><th class="num">订单</th><th class="num">成交额</th><th class="num">分成</th><th>结算</th></tr></thead><tbody>
        ${deals.map(d => `<tr data-deal="${d.id}"><td>${esc(d.period || '')}</td><td>${esc(d.platform || '')}</td><td class="num">${esc(K.fmtInt(d.orders))}</td><td class="num">${esc(K.eur(d.gmv_eur))}</td><td class="num">${esc(K.eur(d.commission_eur))}</td><td>${d.settle_status === 'settled' ? '已结算' : '<b class="warn-text">未结算</b>'}</td></tr>`).join('')}
      </tbody></table>` : '<p class="muted">还没有带货记录</p>'}
      <button type="button" class="tb" data-q="deal">＋ 添加带货记录</button>
    </section>

    <section class="dsec"><h3>备注</h3><textarea data-f="notes" rows="4" maxlength="5000" aria-label="备注">${esc(k.notes || '')}</textarea></section>

    <footer class="dfoot"><span class="muted">录入 ${esc((k.created_at || '').slice(0, 10))} · 更新 ${esc((k.updated_at || '').slice(0, 10))}</span>
      <button type="button" class="btn sm danger ghost" data-del-kol>删除这个 KOL</button></footer>`;
  }

  function render() {
    const k = K.kol(openId);
    if (!k) return close();
    const box = K.$('#drawer-body');
    const scroll = box.scrollTop;
    box.innerHTML = html(k);
    box.scrollTop = scroll;
  }

  async function loadActs(id) {
    try { const { activities } = await K.api('GET', `/activities?kol_id=${id}`); K.actCache[id] = activities; }
    catch (e) { K.actCache[id] = []; K.fail(e); }
    if (openId === id) render();
  }

  function open(id) {
    id = Number(id);
    const k = K.kol(id); if (!k) return;
    openId = id;
    drawer().hidden = false;
    requestAnimationFrame(() => drawer().classList.add('open'));
    document.body.classList.add('drawer-open');
    render();
    K.$('#drawer-body').scrollTop = 0;
    loadActs(id);
    K.$('#drawer .dname')?.focus({ preventScroll: true });
  }
  function close() {
    if (openId == null) return;
    openId = null;
    drawer().classList.remove('open');
    document.body.classList.remove('drawer-open');
    setTimeout(() => { if (openId == null) drawer().hidden = true; }, 200);
  }
  K.drawer = { open, close, closeIf: id => { if (openId === id) close(); }, isOpen: () => openId != null, id: () => openId };

  // 列表更新时同步刷新抽屉；正在抽屉里打字时不刷，免得光标跳走（失焦保存后会再刷）
  K.on('render', () => {
    if (openId == null) return;
    const a = document.activeElement;
    if (a && drawer().contains(a) && a.matches('input:not([type=checkbox]), textarea, select')) return;
    render();
  });
  K.on('activity', a => { if (K.actCache[a.kol_id]) { K.actCache[a.kol_id].unshift(a); K.actCache[a.kol_id].sort((x, y) => y.happened_at.localeCompare(x.happened_at) || y.id - x.id); } });

  /* ---------- 抽屉里的事件 ---------- */
  function bind() {
    const d = drawer();
    K.$('#drawer-backdrop').addEventListener('click', close);
    d.addEventListener('change', e => {
      const k = K.kol(openId); if (!k) return;
      const t = e.target;
      if (t.matches('[data-task-done]')) return K.setTaskDone(Number(t.closest('[data-task]').dataset.task), t.checked);
      const key = t.dataset.f; if (!key) return;
      let v;
      if (t.type === 'checkbox') v = t.checked ? 1 : 0;
      else if (key === 'tags') v = t.value.split(/[,，]/).map(s => s.trim()).filter(Boolean);
      else if (t.type === 'number') v = t.value === '' ? null : Number(t.value);
      else v = t.value.trim() || null;
      if (key === 'name' && !v) { K.toast('名称不能空', { error: true }); t.value = k.name; return; }
      if (JSON.stringify(v) === JSON.stringify(k[key] ?? null)) return;
      K.updateKol(k.id, { [key]: v }).catch(() => {});
    });
    d.addEventListener('keydown', e => {
      if (e.key === 'Enter' && e.target.matches('input[data-f]')) e.target.blur();
    });
    d.addEventListener('click', async e => {
      const k = K.kol(openId); if (!k) return;
      const t = e.target;
      if (t.closest('[data-close]')) return close();
      const pick = t.closest('[data-pick]');
      if (pick) {
        const key = pick.dataset.pick;
        const multi = key === 'category';
        return K.pickOption(pick, { options: K.optionsFor(key), value: multi ? (k[key] || []) : k[key], multi, search: ['country', 'language'].includes(key),
          allowEmpty: key !== 'status', onPick: v => { if (JSON.stringify(v ?? null) !== JSON.stringify(k[key] ?? null)) K.updateKol(k.id, { [key]: v }).catch(() => {}); } });
      }
      const q = t.closest('[data-q]')?.dataset.q;
      if (q === 'mail') return K.mail.compose(k);
      if (q === 'follow') return K.followupPopover(t.closest('[data-q]'), k);
      if (q === 'next') return K.datePopover(t.closest('[data-q]'), k.next_followup_at, v => K.updateKol(k.id, { next_followup_at: v }).catch(() => {}));
      if (q === 'deal') return K.deals.edit(null, k.id);
      if (t.closest('[data-copy-email]')) return K.copy(k.email, '邮箱');
      if (t.closest('[data-del-kol]')) return K.deleteKol(k.id);
      const ld = t.closest('[data-link-del]');
      if (ld) { const links = [...(k.other_links || [])]; links.splice(Number(ld.dataset.linkDel), 1); return K.updateKol(k.id, { other_links: links }).catch(() => {}); }
      if (t.closest('[data-task-del]')) {
        const id = Number(t.closest('[data-task]').dataset.task), task = K.state.tasks.find(x => x.id === id);
        return K.deferredDelete({ text: `删除子任务「${task.title}」？`, label: task.title,
          removeLocal: () => { K.state.tasks = K.state.tasks.filter(x => x.id !== id); },
          restoreLocal: () => K.state.tasks.push(task), commit: () => K.api('DELETE', `/tasks/${id}`) });
      }
      const dealRow = t.closest('[data-deal]');
      if (dealRow) return K.deals.edit(Number(dealRow.dataset.deal));
      const li = t.closest('[data-act-id]');
      if (li && t.closest('[data-act-del]')) {
        const id = Number(li.dataset.actId), list = K.actCache[k.id], a = list.find(x => x.id === id);
        return K.deferredDelete({ text: `删除这条「${K.actOf(a.type).label}」记录？`, label: a.summary || K.actOf(a.type).label,
          removeLocal: () => { K.actCache[k.id] = list.filter(x => x.id !== id); },
          restoreLocal: () => { K.actCache[k.id] = list; },
          commit: async () => { const res = await K.api('DELETE', `/activities/${id}`); K.replaceKol(res.kol); K.render(); } });
      }
      if (li && t.closest('[data-act-edit]')) return editActivity(li, k);
    });
    d.addEventListener('submit', async e => {
      e.preventDefault();
      const k = K.kol(openId); if (!k) return;
      const f = e.target;
      if (f.matches('[data-sub-add]')) {
        const title = f.title.value.trim(); if (!title) return;
        try { await K.addTask(k.id, title, f.due.value || null); } catch (err) { K.fail(err); }
        return;
      }
      if (f.matches('[data-link-add]')) {
        const url = f.url.value.trim(); if (!url) return;
        if (!K.safeUrl(url)) return K.toast('链接要以 https:// 开头', { error: true });
        return K.updateKol(k.id, { other_links: [...(k.other_links || []), { label: f.label.value.trim(), url }] }).catch(() => {});
      }
      if (f.matches('[data-act-add]')) {
        const btn = f.querySelector('button'); btn.disabled = true;
        try {
          await K.addActivity({ kol_id: k.id, type: f.type.value, summary: f.summary.value.trim(), content: f.content.value, happened_at: f.date.value || K.today() });
          K.toast('已添加沟通记录');
        } catch (err) { K.fail(err); btn.disabled = false; }
      }
    });
  }

  function editActivity(li, k) {
    const a = K.actCache[k.id].find(x => x.id === Number(li.dataset.actId));
    li.innerHTML = `<form class="act-add" data-act-save>
      <div class="row"><select name="type">${K.ACT_TYPES.map(x => `<option value="${x.key}" ${x.key === a.type ? 'selected' : ''}>${x.icon} ${esc(x.label)}</option>`).join('')}</select>
      <input name="date" type="date" value="${esc(a.happened_at)}"></div>
      <input name="summary" maxlength="500" value="${esc(a.summary || '')}">
      <textarea name="content" rows="3" maxlength="20000">${esc(a.content || '')}</textarea>
      <div class="row end"><button type="button" class="btn sm ghost" data-cancel>取消</button><button class="btn sm">保存</button></div></form>`;
    const f = li.querySelector('form');
    f.querySelector('[data-cancel]').addEventListener('click', render);
    f.addEventListener('submit', async e => {
      e.preventDefault(); e.stopPropagation();
      try {
        const res = await K.api('PATCH', `/activities/${a.id}`, { type: f.type.value, happened_at: f.date.value, summary: f.summary.value.trim(), content: f.content.value });
        Object.assign(a, res.activity); K.replaceKol(res.kol); K.render(); render(); K.toast('已保存');
      } catch (err) { K.fail(err); }
    });
  }

  document.addEventListener('DOMContentLoaded', bind);
})();
