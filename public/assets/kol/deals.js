/* KOL 工作台 · 带货与分成：数据卡片、明细表、按 KOL 排名、月度趋势（手写 SVG）。金额统一 EUR、两位小数。 */
(() => {
  const K = window.KOL;
  const { esc } = K;
  const f = K.pref.get('dealsFilter', { month: '', kol: '', platform: '', settle: '' });

  K.dealMonth = d => d.period || (d.published_at || '').slice(0, 7) || '';
  // 分成金额：手填优先，否则 = 成交额 × 比例（和服务端同一公式）
  K.dealCommission = d => d.commission_manual ? Number(d.commission_eur || 0)
    : d.gmv_eur != null && d.commission_rate != null ? Math.round(d.gmv_eur * d.commission_rate) / 100 : 0;
  const sum = (list, fn) => K.round2(list.reduce((a, d) => a + (Number(fn(d)) || 0), 0));
  const kolName = id => K.kol(id)?.name || '（已删除）';

  const shiftMonth = (ym, n) => { const [y, m] = ym.split('-').map(Number); const d = new Date(y, m - 1 + n, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };

  K.monthlyTotals = (deals, months = 12, end = K.thisMonth()) => {
    const out = [];
    for (let i = months - 1; i >= 0; i--) {
      const m = shiftMonth(end, -i), list = deals.filter(d => K.dealMonth(d) === m);
      out.push({ month: m, orders: sum(list, d => d.orders), gmv: sum(list, d => d.gmv_eur), commission: sum(list, K.dealCommission) });
    }
    return out;
  };

  function chartSvg(rows) {
    const W = 720, H = 240, L = 64, R = 12, T = 16, B = 32;
    const max = Math.max(...rows.map(r => r.gmv), 0);
    const step = (() => { if (!max) return 100; const raw = max / 4, p = 10 ** Math.floor(Math.log10(raw)); return [1, 2, 2.5, 5, 10].map(x => x * p).find(x => x >= raw); })();
    const top = Math.max(step * 4, step * Math.ceil(max / step));
    const y = v => T + (H - T - B) * (1 - v / top);
    const band = (W - L - R) / rows.length, bw = Math.min(24, band * 0.6);
    const ticks = []; for (let v = 0; v <= top + 1e-9; v += step) ticks.push(v);
    const short = v => v >= 1000 ? '€' + (v / 1000).toLocaleString('en-US', { maximumFractionDigits: 1 }) + 'k' : '€' + v.toLocaleString('en-US');
    const bars = rows.map((r, i) => {
      const x = L + band * i + (band - bw) / 2, y0 = y(0), y1 = y(r.gmv), h = y0 - y1, rad = Math.min(4, h);
      const path = h > 0 ? `M${x},${y0} V${y1 + rad} Q${x},${y1} ${x + rad},${y1} H${x + bw - rad} Q${x + bw},${y1} ${x + bw},${y1 + rad} V${y0} Z` : '';
      const tip = `${r.month}\n成交额 ${K.eur(r.gmv)}\n分成 ${K.eur(r.commission)}\n订单 ${K.fmtInt(r.orders)}`;
      return `<g class="bar" data-tip="${esc(tip)}"><rect class="hit" x="${L + band * i}" y="${T}" width="${band}" height="${H - T - B}"></rect>${path ? `<path d="${path}"></path>` : ''}
        <text class="xl" x="${x + bw / 2}" y="${H - 12}" text-anchor="middle">${Number(r.month.slice(5))}月</text></g>`;
    }).join('');
    return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="近 12 个月成交额柱状图">
      ${ticks.map(v => `<line class="gridl" x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}"></line><text class="yl" x="${L - 8}" y="${y(v) + 4}" text-anchor="end">${short(v)}</text>`).join('')}
      ${bars}</svg>`;
  }

  K.renderDeals = (view, el) => {
    const all = K.state.deals;
    const months = [...new Set(all.map(K.dealMonth).filter(Boolean))].sort().reverse();
    const platforms = [...new Set(all.map(d => d.platform).filter(Boolean))];
    const kolIds = [...new Set(all.map(d => d.kol_id))];
    const base = all.filter(d => (!f.kol || d.kol_id === Number(f.kol)) && (!f.platform || d.platform === f.platform) && (!f.settle || d.settle_status === f.settle));
    const shown = base.filter(d => !f.month || K.dealMonth(d) === f.month);
    const tm = K.thisMonth(), monthDeals = all.filter(d => K.dealMonth(d) === tm);
    const live = K.state.kols.filter(k => ['sampled', 'published', 'won', 'partner'].includes(k.status)).length;

    const rank = kolIds.map(id => { const l = shown.filter(d => d.kol_id === id); return { id, gmv: sum(l, d => d.gmv_eur), com: sum(l, K.dealCommission), orders: sum(l, d => d.orders) }; })
      .filter(r => r.gmv || r.com).sort((a, b) => b.gmv - a.gmv).slice(0, 10);
    const rmax = Math.max(...rank.map(r => r.gmv), 1);
    const trend = K.monthlyTotals(base, 12, f.month && f.month > tm ? f.month : tm);
    const sel = (name, opts, v, all) => `<select data-df="${name}" aria-label="${all}"><option value="">${all}</option>${opts.map(([val, label]) => `<option value="${esc(val)}" ${String(val) === String(v) ? 'selected' : ''}>${esc(label)}</option>`).join('')}</select>`;

    el.innerHTML = `<div class="page deals">
      <div class="stats">
        <div class="stat"><span>本月成交额</span><b>${esc(K.eur(sum(monthDeals, d => d.gmv_eur)))}</b><em>${tm}</em></div>
        <div class="stat"><span>本月分成</span><b>${esc(K.eur(sum(monthDeals, K.dealCommission)))}</b><em>按结算月份统计</em></div>
        <div class="stat"><span>待结算金额</span><b>${esc(K.eur(sum(all.filter(d => d.settle_status !== 'settled'), K.dealCommission)))}</b><em>所有未结算的分成</em></div>
        <div class="stat"><span>合作中的 KOL</span><b>${live}</b><em>已寄样 / 已发布 / 已成交 / 长期合作</em></div>
      </div>
      <div class="toolbar"><div class="filters">
        ${sel('month', months.map(m => [m, m]), f.month, '全部月份')}
        ${sel('kol', kolIds.map(id => [id, kolName(id)]), f.kol, '全部 KOL')}
        ${sel('platform', platforms.map(p => [p, p]), f.platform, '全部平台')}
        ${sel('settle', [['unsettled', '未结算'], ['settled', '已结算']], f.settle, '全部结算状态')}
      </div><div class="tools"><button type="button" class="btn sm" data-deal-new>＋ 添加带货记录</button><button type="button" class="tb" data-deal-csv>导出 CSV</button></div></div>

      <div class="deal-cols">
        <section class="card-box"><h3>月度成交额 <small class="muted">近 12 个月，悬停看分成和订单</small></h3>
          <div class="chart-wrap">${chartSvg(trend)}<div class="tip" hidden></div></div>
          <details><summary>查看月度汇总表</summary><table class="mini"><thead><tr><th>月份</th><th class="num">订单</th><th class="num">成交额</th><th class="num">分成</th></tr></thead>
            <tbody>${[...trend].reverse().map(r => `<tr><td>${r.month}</td><td class="num">${K.fmtInt(r.orders)}</td><td class="num">${esc(K.eur(r.gmv))}</td><td class="num">${esc(K.eur(r.commission))}</td></tr>`).join('')}</tbody></table></details>
        </section>
        <section class="card-box"><h3>按 KOL 排名 <small class="muted">${f.month ? esc(f.month) : '全部月份'}</small></h3>
          ${rank.length ? `<ol class="rank">${rank.map(r => `<li><button type="button" class="link-btn" data-open-kol="${r.id}">${esc(kolName(r.id))}</button>
            <span class="rbar"><i style="width:${(r.gmv / rmax * 100).toFixed(1)}%"></i></span>
            <span class="num">${esc(K.eur(r.gmv))}</span><span class="num muted">分成 ${esc(K.eur(r.com))}</span></li>`).join('')}</ol>` : '<p class="muted">还没有数据</p>'}
        </section>
      </div>

      <section class="card-box"><h3>明细 <small class="muted">${shown.length} 条 · 成交额 ${esc(K.eur(sum(shown, d => d.gmv_eur)))} · 分成 ${esc(K.eur(sum(shown, K.dealCommission)))}</small></h3>
        ${shown.length ? `<div class="table-wrap"><table class="grid deals-table"><thead><tr><th>KOL</th><th>结算月份</th><th>平台</th><th>视频</th><th>发布日期</th><th class="num">播放</th><th class="num">订单</th><th class="num">成交额</th><th class="num">比例</th><th class="num">分成</th><th>结算</th><th></th></tr></thead><tbody>
          ${shown.map(d => `<tr data-deal="${d.id}"><td><button type="button" class="link-btn" data-open-kol="${d.kol_id}">${esc(kolName(d.kol_id))}</button></td>
            <td>${esc(K.dealMonth(d))}</td><td>${esc(d.platform || '')}</td><td>${d.content_url ? K.link(d.content_url, '打开 ↗') : ''}</td><td>${esc(d.published_at || '')}</td>
            <td class="num">${esc(K.fmtInt(d.views))}</td><td class="num">${esc(K.fmtInt(d.orders))}</td><td class="num">${esc(K.eur(d.gmv_eur))}</td>
            <td class="num">${d.commission_rate != null ? esc(d.commission_rate + '%') : ''}</td>
            <td class="num">${esc(K.eur(K.dealCommission(d)))}${d.commission_manual ? ' <small class="muted" title="手动填写">手填</small>' : ''}</td>
            <td><button type="button" class="settle ${d.settle_status === 'settled' ? 'ok' : ''}" data-settle>${d.settle_status === 'settled' ? '✓ 已结算' : '未结算'}</button></td>
            <td><button type="button" class="link-btn" data-deal-edit>编辑</button></td></tr>`).join('')}
        </tbody></table></div>` : `<p class="empty-state">${all.length ? '没有符合条件的记录。' : '还没有带货记录。KOL 发布内容、产生订单后，在这里或 KOL 详情里添加。'}</p>`}
      </section></div>`;
  };

  K.dealsEvents = (main, getView) => {
    main.addEventListener('change', e => {
      if (getView()?.kind !== 'deals') return;
      const k = e.target.dataset.df; if (!k) return;
      f[k] = e.target.value; K.pref.set('dealsFilter', f); K.render();
    });
    main.addEventListener('click', async e => {
      if (getView()?.kind !== 'deals') return;
      const o = e.target.closest('[data-open-kol]'); if (o) return K.drawer.open(o.dataset.openKol);
      if (e.target.closest('[data-deal-new]')) return edit(null, f.kol ? Number(f.kol) : null);
      if (e.target.closest('[data-deal-csv]')) return K.io.exportDeals(K.state.deals.filter(d => (!f.month || K.dealMonth(d) === f.month) && (!f.kol || d.kol_id === Number(f.kol)) && (!f.platform || d.platform === f.platform) && (!f.settle || d.settle_status === f.settle)));
      const tr = e.target.closest('[data-deal]'); if (!tr) return;
      const d = K.state.deals.find(x => x.id === Number(tr.dataset.deal));
      if (e.target.closest('[data-deal-edit]')) return edit(d.id);
      if (e.target.closest('[data-settle]')) {
        const before = d.settle_status;
        d.settle_status = before === 'settled' ? 'unsettled' : 'settled'; K.render();
        try { const { item } = await K.api('PATCH', `/deals/${d.id}`, { settle_status: d.settle_status }); Object.assign(d, item); K.render(); }
        catch (err) { d.settle_status = before; K.render(); K.fail(err); }
      }
    });
    // 柱状图悬停提示
    main.addEventListener('pointermove', e => {
      const wrap = e.target.closest?.('.chart-wrap'); if (!wrap) return;
      const tip = wrap.querySelector('.tip'), g = e.target.closest('.bar');
      wrap.querySelectorAll('.bar.on').forEach(x => x !== g && x.classList.remove('on'));
      if (!g) { tip.hidden = true; return; }
      g.classList.add('on');
      tip.textContent = g.dataset.tip; tip.hidden = false;
      const r = wrap.getBoundingClientRect();
      tip.style.left = Math.min(e.clientX - r.left + 12, r.width - tip.offsetWidth - 4) + 'px';
      tip.style.top = Math.max(0, e.clientY - r.top - tip.offsetHeight - 8) + 'px';
    });
    main.addEventListener('pointerleave', () => { const t = main.querySelector('.chart-wrap .tip'); if (t) t.hidden = true; }, true);
  };

  /* ---------- 添加 / 编辑带货记录 ---------- */
  function edit(id, kolId) {
    const d = id ? K.state.deals.find(x => x.id === id) : { kol_id: kolId, settle_status: 'unsettled', period: K.thisMonth(), platform: K.kol(kolId)?.platform || '' };
    const dlg = K.$('#deal');
    const kols = [...K.state.kols].sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
    const v = k => esc(d[k] ?? '');
    K.$('#deal-title').textContent = id ? '编辑带货记录' : '添加带货记录';
    K.$('#deal-body').innerHTML = `<form id="deal-form" novalidate><div class="fgrid">
      <label class="fld wide"><span class="fl">KOL *</span><select name="kol_id" ${id ? 'disabled' : ''} required><option value="">选择 KOL…</option>${kols.map(k => `<option value="${k.id}" ${k.id === d.kol_id ? 'selected' : ''}>${esc(k.name)}${k.handle ? ' · ' + esc(k.handle) : ''}</option>`).join('')}</select></label>
      <label class="fld"><span class="fl">结算月份</span><input name="period" type="month" value="${v('period')}"></label>
      <label class="fld"><span class="fl">平台</span><select name="platform"><option value=""></option>${K.cfg().platforms.map(p => `<option ${p.name === d.platform ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select></label>
      <label class="fld wide"><span class="fl">视频链接</span><input name="content_url" type="url" value="${v('content_url')}"></label>
      <label class="fld wide"><span class="fl">带货链接</span><input name="product_link" type="url" value="${v('product_link')}" placeholder="${esc(K.cfg().profile.product_link || '')}"></label>
      <label class="fld"><span class="fl">发布日期</span><input name="published_at" type="date" value="${v('published_at')}"></label>
      <label class="fld"><span class="fl">播放量</span><input name="views" type="number" min="0" value="${v('views')}"></label>
      <label class="fld"><span class="fl">订单数</span><input name="orders" type="number" min="0" value="${v('orders')}"></label>
      <label class="fld"><span class="fl">退货数</span><input name="returns" type="number" min="0" value="${v('returns')}"></label>
      <label class="fld"><span class="fl">成交额 €</span><input name="gmv_eur" type="number" step="0.01" min="0" value="${v('gmv_eur')}"></label>
      <label class="fld"><span class="fl">净成交额 €</span><input name="net_gmv_eur" type="number" step="0.01" min="0" value="${v('net_gmv_eur')}"></label>
      <label class="fld"><span class="fl">分成比例 %</span><input name="commission_rate" type="number" step="0.01" min="0" value="${v('commission_rate')}"></label>
      <label class="fld"><span class="fl">分成金额 €</span><input name="commission_eur" type="number" step="0.01" value="${v('commission_eur')}" ${d.commission_manual ? '' : 'readonly'}></label>
      <label class="fld wide check"><input name="commission_manual" type="checkbox" ${d.commission_manual ? 'checked' : ''}> 手动填写分成金额（不勾选时 = 成交额 × 分成比例）</label>
      <label class="fld"><span class="fl">结算状态</span><select name="settle_status"><option value="unsettled" ${d.settle_status !== 'settled' ? 'selected' : ''}>未结算</option><option value="settled" ${d.settle_status === 'settled' ? 'selected' : ''}>已结算</option></select></label>
      <label class="fld wide"><span class="fl">备注</span><input name="notes" value="${v('notes')}" maxlength="2000"></label>
    </div><div class="row">${id ? '<button type="button" class="btn sm ghost danger" data-deal-del>删除</button>' : ''}<span class="grow"></span><button type="button" class="btn sm ghost" data-deal-cancel>取消</button><button class="btn sm" type="submit">保存</button></div></form>`;
    const form = K.$('#deal-form');
    const recalc = () => {
      if (form.commission_manual.checked) { form.commission_eur.readOnly = false; return; }
      form.commission_eur.readOnly = true;
      const g = parseFloat(form.gmv_eur.value), r = parseFloat(form.commission_rate.value);
      form.commission_eur.value = Number.isFinite(g) && Number.isFinite(r) ? (Math.round(g * r) / 100).toFixed(2) : '';
    };
    recalc();
    form.addEventListener('input', recalc);
    form.addEventListener('click', async e => {
      if (e.target.closest('[data-deal-cancel]')) return dlg.close();
      if (e.target.closest('[data-deal-del]')) {
        dlg.close();
        await K.deferredDelete({ text: `删除这条带货记录（${kolName(d.kol_id)} · ${K.dealMonth(d)}）？`, label: '带货记录',
          removeLocal: () => { K.state.deals = K.state.deals.filter(x => x.id !== d.id); },
          restoreLocal: () => K.state.deals.push(d), commit: () => K.api('DELETE', `/deals/${d.id}`) });
      }
    });
    form.addEventListener('submit', async e => {
      e.preventDefault();
      const num = n => form[n].value === '' ? null : Number(form[n].value);
      const data = {
        period: form.period.value || null, platform: form.platform.value || null, content_url: form.content_url.value.trim() || null,
        product_link: form.product_link.value.trim() || null, published_at: form.published_at.value || null, views: num('views'), orders: num('orders'),
        returns: num('returns'), gmv_eur: num('gmv_eur'), net_gmv_eur: num('net_gmv_eur'), commission_rate: num('commission_rate'),
        commission_manual: form.commission_manual.checked ? 1 : 0, commission_eur: form.commission_manual.checked ? num('commission_eur') : null,
        settle_status: form.settle_status.value, notes: form.notes.value.trim() || null
      };
      try {
        if (id) {
          const { item } = await K.api('PATCH', `/deals/${id}`, data); Object.assign(d, item);
        } else {
          const kid = Number(form.kol_id.value); if (!kid) return K.toast('请选择 KOL', { error: true });
          const { item } = await K.api('POST', '/deals', { ...data, kol_id: kid }); K.state.deals.unshift(item);
        }
        dlg.close(); K.render(); K.toast('已保存');
      } catch (err) { K.fail(err); }
    });
    dlg.showModal();
  }
  K.deals = { edit };
})();
