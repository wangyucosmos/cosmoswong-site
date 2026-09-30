/* /subs 订阅倒计时页。数据只从 /api/subs 读写（服务端校验密码 cookie），页面本身不含任何订阅数据。 */
(() => {
  const $ = s => document.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const lock = $('#subs-lock'), app = $('#subs-app'), msg = $('#subs-msg'), logout = $('#subs-logout');
  const dlg = $('#subs-edit'), form = $('#subs-form'), formMsg = $('#subs-form-msg');

  let items = [], updatedAt = null, filter = '全部', editing = null;

  const api = async (path, opts = {}) => {
    const r = await fetch('/api/subs' + path, { credentials: 'same-origin', headers: { 'content-type': 'application/json' }, ...opts });
    const data = await r.json().catch(() => ({}));
    return { status: r.status, data };
  };

  /* ---------- 日期与倒计时 ---------- */
  const MONTHS = { 月: 1, 季: 3, 半年: 6, 年: 12 };
  const today = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
  const parse = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const fmt = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const addMonths = (d, n) => {
    const r = new Date(d.getFullYear(), d.getMonth() + n, 1);
    r.setDate(Math.min(d.getDate(), new Date(r.getFullYear(), r.getMonth() + 1, 0).getDate()));
    return r;
  };
  // 返回 { date, days, rolled }：日期已过且是周期订阅时，按周期往后推算出下一次（rolled=true 提示用户确认）
  function nextCharge(x) {
    if (!x.next) return null;
    let d = parse(x.next), rolled = false;
    const step = MONTHS[x.cycle];
    if (step) while (d < today()) { d = addMonths(d, step); rolled = true; }
    return { date: d, days: Math.round((d - today()) / 864e5), rolled };
  }
  const perMonth = x => (x.price != null && MONTHS[x.cycle]) ? x.price / MONTHS[x.cycle] : 0;
  const money = (n, c) => (c === 'USD' ? 'US$' : '¥') + (Math.round(n * 100) / 100).toLocaleString('zh-CN');

  /* ---------- 渲染 ---------- */
  const VERDICT = { 续订: 'ok', 待定: 'live', 停掉: 'dim' };
  function urgency(nc, x) {
    if (x.verdict === '停掉') return '';
    if (!nc) return '';
    if (nc.days <= 7) return 'hot';
    if (nc.days <= 30) return 'warm';
    return '';
  }

  function renderSummary() {
    const active = items.filter(x => x.verdict !== '停掉');
    const sum = c => active.filter(x => x.currency === c).reduce((a, x) => a + perMonth(x), 0);
    const cny = sum('CNY'), usd = sum('USD');
    const soon = active.map(x => ({ x, nc: nextCharge(x) })).filter(o => o.nc && o.nc.days <= 7);
    const pending = items.filter(x => x.verdict === '待定').length;
    const noDate = active.filter(x => !x.next).length;
    const monthly = [cny && money(cny, 'CNY'), usd && money(usd, 'USD')].filter(Boolean).join(' + ') || '—';
    const yearly = [cny && money(cny * 12, 'CNY'), usd && money(usd * 12, 'USD')].filter(Boolean).join(' + ') || '—';
    $('#subs-summary').innerHTML = `
      <div class="stat"><span>每月约</span><b>${monthly}</b><em>不含已决定停掉的</em></div>
      <div class="stat"><span>每年约</span><b>${yearly}</b><em>按周期折算</em></div>
      <div class="stat ${soon.length ? 'hot' : ''}"><span>7 天内扣款</span><b>${soon.length} 项</b><em>${soon.map(o => esc(o.x.name)).join('、') || '暂时没有'}</em></div>
      <div class="stat ${pending ? 'warm' : ''}"><span>还没决定</span><b>${pending} 项</b><em>${noDate ? `另有 ${noDate} 项没填扣款日` : '日期都填了'}</em></div>`;
  }

  function renderFilter() {
    const opts = ['全部', '续订', '待定', '停掉'];
    $('#subs-filter').innerHTML = opts.map(o => {
      const n = o === '全部' ? items.length : items.filter(x => x.verdict === o).length;
      return `<button type="button" class="chip${o === filter ? ' on' : ''}" data-f="${o}" aria-pressed="${o === filter}">${o} ${n}</button>`;
    }).join('');
  }

  function card(x) {
    const nc = nextCharge(x);
    const u = urgency(nc, x);
    const count = nc
      ? `<div class="count ${u}"><b>${nc.days === 0 ? '今天' : nc.days}</b><span>${nc.days === 0 ? '扣款' : '天后扣款'}</span></div>`
      : `<div class="count none"><b>—</b><span>没填日期</span></div>`;
    const price = x.price != null ? `${money(x.price, x.currency)} / ${x.cycle}` : '价格没填';
    const date = nc ? `${fmt(nc.date)}${nc.rolled ? '（按周期推算，请确认）' : ''}` : '';
    return `<li class="sub ${x.verdict === '停掉' ? 'off' : ''}" data-id="${esc(x.id)}">
      ${count}
      <div class="info">
        <div class="top"><h3>${esc(x.name) || '（未命名）'}</h3><span class="pill ${VERDICT[x.verdict]}">${x.verdict}</span>${x.auto ? '<span class="pill">自动续费</span>' : ''}</div>
        ${x.purpose ? `<p class="purpose">${esc(x.purpose)}</p>` : ''}
        <p class="meta">${esc(price)}${date ? ` · 下次 ${esc(date)}` : ''}</p>
        ${x.cancel ? `<p class="meta">取消入口：${esc(x.cancel)}</p>` : ''}
        ${x.note ? `<p class="note">${esc(x.note)}</p>` : ''}
      </div>
      <div class="ops">
        <button type="button" class="btn glass sm" data-act="edit">编辑</button>
        ${nc && MONTHS[x.cycle] ? '<button type="button" class="btn glass sm" data-act="paid" title="把下次扣款日往后推一个周期">已扣款，顺延</button>' : ''}
      </div></li>`;
  }

  function render() {
    renderSummary(); renderFilter();
    const rank = x => { const nc = nextCharge(x); return (x.verdict === '停掉' ? 2e6 : 0) + (nc ? nc.days : 1e6); };
    const shown = items.filter(x => filter === '全部' || x.verdict === filter).sort((a, b) => rank(a) - rank(b));
    $('#subs-list').innerHTML = shown.length ? shown.map(card).join('')
      : `<li class="empty">${items.length ? '这个分类下没有订阅。' : '还没有订阅。点「新增」加第一个。'}</li>`;
    $('#subs-updated').textContent = updatedAt ? `上次保存：${new Date(updatedAt).toLocaleString('zh-CN')}` : '';
  }

  /* ---------- 读写 ---------- */
  async function load() {
    const { status, data } = await api('');
    if (status === 401) return showLock();
    if (status !== 200) return showLock(data.error || '读取失败，请刷新重试');
    items = data.items || []; updatedAt = data.updatedAt;
    lock.hidden = true; app.hidden = false; logout.hidden = false;
    render();
  }
  async function save(next) {
    const { status, data } = await api('', { method: 'PUT', body: JSON.stringify({ items: next }) });
    if (status === 401) { showLock('登录过期了，请重新输入密码'); return false; }
    if (status !== 200) throw new Error(data.error || '保存失败');
    items = data.items; updatedAt = data.updatedAt; render();
    return true;
  }
  function showLock(text = '') {
    app.hidden = true; logout.hidden = true; lock.hidden = false;
    msg.textContent = text; $('#subs-pw').focus();
  }

  lock.addEventListener('submit', async e => {
    e.preventDefault();
    const pw = $('#subs-pw').value;
    if (!pw) { msg.textContent = '请输入密码'; return; }
    msg.textContent = '正在验证…';
    const { status, data } = await api('/login', { method: 'POST', body: JSON.stringify({ password: pw }) });
    $('#subs-pw').value = '';
    if (status === 200) { msg.textContent = ''; load(); } else msg.textContent = data.error || '验证失败';
  });
  logout.addEventListener('click', async () => { await api('/logout', { method: 'POST' }); items = []; showLock('已退出'); });

  $('#subs-filter').addEventListener('click', e => {
    const b = e.target.closest('[data-f]'); if (!b) return;
    filter = b.dataset.f; render();
  });

  /* ---------- 编辑弹窗 ---------- */
  const F = n => form.elements[n];
  function openEdit(x) {
    editing = x ? x.id : null;
    $('#subs-edit-title').textContent = x ? '编辑订阅' : '新增订阅';
    const v = x || { currency: 'CNY', cycle: '月', verdict: '续订', auto: true };
    for (const k of ['name', 'purpose', 'cancel', 'note', 'next']) F(k).value = v[k] || '';
    F('price').value = v.price ?? '';
    F('currency').value = v.currency; F('cycle').value = v.cycle; F('verdict').value = v.verdict;
    F('auto').checked = !!v.auto;
    $('#subs-delete').hidden = !x; formMsg.textContent = '';
    dlg.showModal(); F('name').focus();
  }
  $('#subs-add').addEventListener('click', () => openEdit(null));
  $('#subs-cancel').addEventListener('click', () => dlg.close());
  $('#subs-list').addEventListener('click', async e => {
    const b = e.target.closest('[data-act]'); if (!b) return;
    const x = items.find(i => i.id === b.closest('[data-id]').dataset.id);
    if (b.dataset.act === 'edit') return openEdit(x);
    if (b.dataset.act === 'paid') {
      const nc = nextCharge(x);
      const moved = { ...x, next: fmt(addMonths(nc.date, MONTHS[x.cycle])) };
      b.disabled = true;
      try { await save(items.map(i => i.id === x.id ? moved : i)); } catch (err) { alertInline(err.message); b.disabled = false; }
    }
  });
  const alertInline = t => { $('#subs-updated').textContent = t; };

  form.addEventListener('submit', async e => {
    e.preventDefault();
    const name = F('name').value.trim();
    if (!name) { formMsg.textContent = '名称不能空'; F('name').focus(); return; }
    const rec = {
      id: editing || (crypto.randomUUID ? crypto.randomUUID() : String(Date.now())),
      name, purpose: F('purpose').value.trim(), price: F('price').value === '' ? null : Number(F('price').value),
      currency: F('currency').value, cycle: F('cycle').value, next: F('next').value, auto: F('auto').checked,
      verdict: F('verdict').value, cancel: F('cancel').value.trim(), note: F('note').value.trim()
    };
    formMsg.textContent = '正在保存…';
    try {
      const next = editing ? items.map(i => i.id === editing ? rec : i) : [...items, rec];
      if (await save(next)) dlg.close();
    } catch (err) { formMsg.textContent = err.message; }
  });

  // 删除要点两次：第一次按钮变成「再点一次确认删除」（页面里不用 confirm 弹框）
  const del = $('#subs-delete');
  del.addEventListener('click', async () => {
    if (del.dataset.armed !== '1') { del.dataset.armed = '1'; del.textContent = '再点一次确认删除'; return; }
    try { if (await save(items.filter(i => i.id !== editing))) dlg.close(); } catch (err) { formMsg.textContent = err.message; }
  });
  dlg.addEventListener('close', () => { del.dataset.armed = ''; del.textContent = '删除'; });

  load();
})();
