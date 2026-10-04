/* 我的工作台 · 提效记录：平时顺手记「以前要多久 / 用 AI 后多久」，攒作品集素材。
   v2：主要在「标成已交付」时顺手记（每类交付物的「以前大概要多久」只问一次），任务类型就用交付物类型，导出时正好是「客服文档：从 4 小时降到 40 分钟」这种说法。
   数据卡、按月节省时长柱状图（手写 SVG）、按任务类型排名、明细表行内编辑、「导出作品集素材」（只导出可上作品集的）。 */
(() => {
  const D = window.DESK;
  const { esc } = D;
  D.saved = w => (w.before_minutes != null && w.after_minutes != null) ? w.before_minutes - w.after_minutes : null;
  const hours = m => Math.round((m || 0) / 6) / 10;
  const sum = (list, fn) => list.reduce((a, x) => a + (Number(fn(x)) || 0), 0);
  const shiftMonth = (ym, n) => { const [y, m] = ym.split('-').map(Number); const d = new Date(Date.UTC(y, m - 1 + n, 1)); return d.toISOString().slice(0, 7); };

  D.winMonthly = (wins, months = 12, end = D.thisMonth()) => {
    const out = [];
    for (let i = months - 1; i >= 0; i--) { const m = shiftMonth(end, -i), l = wins.filter(w => w.happened_at.slice(0, 7) === m); out.push({ month: m, saved: sum(l, D.saved), count: l.length }); }
    return out;
  };
  D.winByType = wins => {
    const map = new Map();
    for (const w of wins) { const k = w.task_type || '其他'; const r = map.get(k) || { type: k, saved: 0, count: 0, before: 0, after: 0, n: 0, tools: new Set() };
      r.saved += D.saved(w) || 0; r.count++; if (w.before_minutes != null && w.after_minutes != null) { r.before += w.before_minutes; r.after += w.after_minutes; r.n++; }
      (w.tools || []).forEach(t => r.tools.add(t)); map.set(k, r); }
    return [...map.values()].sort((a, b) => b.saved - a.saved);
  };

  function chart(rows) {
    const W = 720, H = 220, L = 52, R = 12, T = 14, B = 30;
    const max = Math.max(...rows.map(r => hours(r.saved)), 0);
    const step = (() => { if (!max) return 1; const raw = max / 4, p = 10 ** Math.floor(Math.log10(raw)); return [1, 2, 2.5, 5, 10].map(x => x * p).find(x => x >= raw); })();
    const top = Math.max(step * 4, step * Math.ceil(max / step));
    const y = v => T + (H - T - B) * (1 - v / top);
    const band = (W - L - R) / rows.length, bw = Math.min(26, band * 0.6);
    const ticks = []; for (let v = 0; v <= top + 1e-9; v += step) ticks.push(v);
    const bars = rows.map((r, i) => {
      const v = Math.max(0, hours(r.saved)), x = L + band * i + (band - bw) / 2, y0 = y(0), y1 = y(v), h = y0 - y1, rad = Math.min(4, h);
      const path = h > 0 ? `M${x},${y0} V${y1 + rad} Q${x},${y1} ${x + rad},${y1} H${x + bw - rad} Q${x + bw},${y1} ${x + bw},${y1 + rad} V${y0} Z` : '';
      return `<g class="bar"><title>${esc(`${r.month}：节省 ${hours(r.saved)} 小时，${r.count} 条记录`)}</title><rect class="hit" x="${L + band * i}" y="${T}" width="${band}" height="${H - T - B}"></rect>${path ? `<path d="${path}"></path>` : ''}
        <text class="xl" x="${x + bw / 2}" y="${H - 10}" text-anchor="middle">${Number(r.month.slice(5))}月</text></g>`;
    }).join('');
    return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="近 12 个月每月节省的小时数">
      ${ticks.map(v => `<line class="gridl" x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}"></line><text class="yl" x="${L - 8}" y="${y(v) + 4}" text-anchor="end">${v}h</text>`).join('')}${bars}</svg>`;
  }

  D.renderWins = (view, el) => {
    const f = D.pref.get('wins.filter', { month: '', type: '', tool: '', project: '' });
    const all = D.state.wins;
    const shown = all.filter(w => (!f.month || w.happened_at.slice(0, 7) === f.month) && (!f.type || w.task_type === f.type) && (!f.tool || (w.tools || []).includes(f.tool)) && (!f.project || String(w.project_id) === f.project)
      && (!D.q || [w.task, w.output, w.note].join('\n').toLowerCase().includes(D.q.toLowerCase())))
      .sort((a, b) => b.happened_at.localeCompare(a.happened_at) || b.id - a.id);
    const tm = D.thisMonth(), month = all.filter(w => w.happened_at.slice(0, 7) === tm);
    const months = [...new Set(all.map(w => w.happened_at.slice(0, 7)))].sort().reverse();
    const types = D.winTypes();
    const tools = [...new Set(all.flatMap(w => w.tools || []))];
    const pids = [...new Set(all.map(w => w.project_id).filter(Boolean))];
    const rank = D.winByType(shown), rmax = Math.max(...rank.map(r => r.saved), 1);
    const sel = (name, opts, v, all) => `<select data-wf="${name}" aria-label="${all}"><option value="">${all}</option>${opts.map(([val, l]) => `<option value="${esc(val)}" ${String(val) === String(v) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
    el.innerHTML = `<div class="page wins">
      <div class="stats">
        <div class="stat"><span>本月节省</span><b>${hours(sum(month, D.saved))} 小时</b><em>${tm} · ${month.length} 条</em></div>
        <div class="stat"><span>累计节省</span><b>${hours(sum(all, D.saved))} 小时</b><em>从第一条记录算起</em></div>
        <div class="stat"><span>记录条数</span><b>${all.length}</b><em>平时顺手记，越多越有说服力</em></div>
        <div class="stat"><span>可上作品集</span><b>${all.filter(w => w.portfolio_ok).length}</b><em>导出前记得按脱敏红线过一遍</em></div>
      </div>
      <div class="toolbar"><div class="filters">${sel('month', months.map(m => [m, m]), f.month, '全部月份')}${sel('type', types.map(t => [t, t]), f.type, '全部任务类型')}${sel('tool', tools.map(t => [t, t]), f.tool, '全部工具')}${sel('project', pids.map(id => [id, D.projectName(id) || '（已删除的项目）']), f.project, '全部项目')}</div>
        <div class="tools"><button type="button" class="btn sm" data-win-new>＋ 记一条</button><button type="button" class="tb" data-win-export>导出作品集素材</button></div></div>
      <div class="deal-cols">
        <section class="card-box"><h3>每月节省 <small class="muted">近 12 个月，小时</small></h3>${chart(D.winMonthly(all.filter(w => (!f.type || w.task_type === f.type) && (!f.tool || (w.tools || []).includes(f.tool)) && (!f.project || String(w.project_id) === f.project))))}</section>
        <section class="card-box"><h3>按任务类型 <small class="muted">${f.month ? esc(f.month) : '全部月份'}</small></h3>
          ${rank.length ? `<ol class="rank">${rank.map(r => `<li><span class="rname">${esc(r.type)}</span><span class="rbar"><i style="width:${(Math.max(0, r.saved) / rmax * 100).toFixed(1)}%"></i></span>
            <span class="num">${hours(r.saved)} 小时</span><span class="num muted">${r.count} 次</span></li>`).join('')}</ol>` : '<p class="muted">还没有数据</p>'}</section>
      </div>
      <section class="card-box"><h3>明细 <small class="muted">${shown.length} 条 · 节省 ${hours(sum(shown, D.saved))} 小时</small></h3>
        ${shown.length ? `<div class="table-wrap"><table class="grid wins-table"><thead><tr><th>日期</th><th>做了什么</th><th>类型</th><th>用了什么</th><th class="num">以前（分）</th><th class="num">这次（分）</th><th class="num">省了</th><th>产出</th><th>作品集</th><th>项目</th><th></th></tr></thead><tbody>
          ${shown.map(w => `<tr data-win="${w.id}"><td class="editable" data-wk="happened_at">${esc(D.fmtDate(w.happened_at))}</td><td class="editable wtask" data-wk="task">${esc(w.task)}</td>
            <td class="editable" data-wk="task_type">${esc(w.task_type || '')}</td><td class="editable" data-wk="tools">${(w.tools || []).map(t => `<span class="tag">${esc(t)}</span>`).join('')}</td>
            <td class="editable num" data-wk="before_minutes" title="${esc(D.fmtMinutes(w.before_minutes))}">${esc(w.before_minutes ?? '')}</td><td class="editable num" data-wk="after_minutes" title="${esc(D.fmtMinutes(w.after_minutes))}">${esc(w.after_minutes ?? '')}</td>
            <td class="num"><b>${esc(D.fmtMinutes(D.saved(w)))}</b></td>
            <td class="editable clipcell" data-wk="output">${esc(w.output || '')}</td><td><button type="button" class="settle${w.portfolio_ok ? ' ok' : ''}" data-win-ok>${w.portfolio_ok ? '✓ 可以' : '不上'}</button></td>
            <td class="editable" data-wk="project_id">${w.project_id ? esc(D.projectName(w.project_id) || '（已删除）') : ''}</td>
            <td><button type="button" class="icon" data-win-edit aria-label="编辑全部" title="编辑全部 / 删除">${D.icon('edit', 'sm')}</button></td></tr>`).join('')}
        </tbody></table></div><p class="muted small">点格子直接改；点铅笔编辑全部或删除。</p>` : `<p class="empty-state">${all.length ? '没有符合条件的记录。' : '还没有提效记录。用 AI 或脚本做完一件事，记下「以前大概多久、这次多久」——2027 年整理作品集时就有现成的数字了。'}</p>`}
      </section></div>`;
  };

  /* ---------- 导出作品集素材：按任务类型汇总成 Markdown，只含可上作品集的 ---------- */
  D.portfolioMarkdown = wins => {
    const ok = wins.filter(w => w.portfolio_ok);
    const rows = D.winByType(ok);
    const out = [`# 提效记录 · 作品集素材（导出于 ${D.today()}）`, '',
      '> ⚠️ 上站前按 个人主页.md 的脱敏红线再过一遍：未上线活动细节、奖品与数值、内部联系人、二维码、官方受限素材一律去掉。', ''];
    if (!rows.length) return out.concat('（还没有标成「可以上作品集」的记录）').join('\n') + '\n';
    out.push(`共 ${ok.length} 条记录，累计节省约 ${hours(sum(ok, D.saved))} 小时。`, '', '## 按任务类型', '');
    for (const r of rows) {
      const tools = [...r.tools].join(' + ') || '未注明工具';
      out.push(r.n ? `- **${r.type}**：平均从 ${D.fmtMinutes(Math.round(r.before / r.n))} 降到 ${D.fmtMinutes(Math.round(r.after / r.n))}（${tools}），共 ${r.count} 次，累计节省 ${hours(r.saved)} 小时`
        : `- **${r.type}**：共 ${r.count} 次（${tools}）`);
    }
    out.push('', '## 明细', '');
    for (const w of ok.sort((a, b) => a.happened_at.localeCompare(b.happened_at))) {
      out.push(`- ${w.happened_at} ${w.task}${w.task_type ? `（${w.task_type}）` : ''}：${D.fmtMinutes(w.before_minutes) || '?'} → ${D.fmtMinutes(w.after_minutes) || '?'}${(w.tools || []).length ? `，用了 ${w.tools.join('、')}` : ''}${w.output ? `；产出：${w.output}` : ''}`);
    }
    return out.join('\n') + '\n';
  };

  /* ---------- 新增 / 编辑弹窗 ---------- */
  const dlg = () => D.$('#win');
  function edit(id, preset = {}) {
    const w = id ? D.find('wins', id) : { happened_at: D.today(), tools: [], ...preset };
    const c = D.cfg();
    const toolOpts = [...new Set([...c.ai_tools, ...(w.tools || [])])];
    D.$('#win-title').textContent = id ? '编辑提效记录' : '记一条提效';
    D.$('#win-form').innerHTML = `<div class="fgrid">
      <label class="fld wide"><span class="fl">做了什么</span><input name="task" maxlength="200" required value="${esc(w.task || '')}" placeholder="如：客服文档 V1"></label>
      <label class="fld"><span class="fl">日期</span><input type="date" name="date" value="${esc(w.happened_at)}" required></label>
      <label class="fld"><span class="fl">类型（交付物类型）</span><select name="type">${D.selectOpts(D.winTypes(), w.task_type || '其他')}</select></label>
      <label class="fld wide"><span class="fl">项目</span><select name="project">${D.selectOpts(D.optionsFor('project'), w.project_id ? String(w.project_id) : '', { empty: '（不属于任何项目）' })}</select></label>
      <div class="fld wide"><span class="fl">用了什么（可多选，也可以写别的，如「生成脚本」）</span><div class="checks">${toolOpts.map(t => `<label><input type="checkbox" name="tools" value="${esc(t)}" ${(w.tools || []).includes(t) ? 'checked' : ''}> ${esc(t)}</label>`).join('')}</div>
        <input name="tools_extra" maxlength="120" placeholder="其他工具，逗号分隔" aria-label="其他工具"></div>
      <label class="fld"><span class="fl">以前大概要多久（分钟）</span><input type="number" name="before" min="0" max="100000" value="${esc(w.before_minutes ?? '')}"></label>
      <label class="fld"><span class="fl">这次实际多久（分钟）</span><input type="number" name="after" min="0" max="100000" value="${esc(w.after_minutes ?? '')}"></label>
      <p class="fld wide muted small" data-saved></p>
      <label class="fld wide"><span class="fl">产出了什么</span><input name="output" maxlength="500" value="${esc(w.output || '')}" placeholder="如：12 页客服文档 + 生成脚本"></label>
      <label class="fld wide check"><input type="checkbox" name="ok" ${w.portfolio_ok ? 'checked' : ''}> 可以上作品集（上站前要脱敏）</label>
      <label class="fld wide"><span class="fl">备注</span><textarea name="note" rows="2" maxlength="2000">${esc(w.note || '')}</textarea></label></div>
      <div class="row end">${id ? '<button type="button" class="btn sm danger ghost" data-win-del>删除</button><span class="grow"></span>' : ''}<button type="button" class="btn sm ghost" data-win-close>取消</button><button class="btn sm">保存</button></div>`;
    const f = D.$('#win-form');
    const calc = () => { const b = f.before.value, a = f.after.value; f.querySelector('[data-saved]').textContent = b !== '' && a !== '' ? `节省 ${D.fmtMinutes(Number(b) - Number(a))}` : ''; };
    f.oninput = calc; calc();
    f.dataset.id = id || '';
    dlg().showModal();
    f.task.focus();
  }
  async function save(e) {
    e.preventDefault();
    const f = e.target, id = Number(f.dataset.id) || null;
    const task = f.task.value.trim(); if (!task) return D.toast('写一下做了什么', { error: true });
    const tools = [...new Set([...[...f.querySelectorAll('[name=tools]:checked')].map(x => x.value), ...f.tools_extra.value.split(/[,，、]/).map(s => s.trim()).filter(Boolean)])];
    const data = { task, happened_at: f.date.value || D.today(), task_type: f.type.value, project_id: f.project.value ? Number(f.project.value) : null, tools,
      before_minutes: f.before.value === '' ? null : Number(f.before.value), after_minutes: f.after.value === '' ? null : Number(f.after.value),
      output: f.output.value.trim(), portfolio_ok: f.ok.checked ? 1 : 0, note: f.note.value.trim() };
    try {
      if (id) await D.patch('wins', id, data); else await D.create('wins', data);
      dlg().close(); D.toast(data.before_minutes != null && data.after_minutes != null ? `已记下，省了 ${D.fmtMinutes(data.before_minutes - data.after_minutes)}` : '已记下');
    } catch (err) { if (!id) D.fail(err); }
  }
  D.wins = { edit };

  D.winsEvents = (main, getView) => {
    main.addEventListener('change', e => {
      if (!D.isRec('wins') || !e.target.dataset.wf) return;
      const f = D.pref.get('wins.filter', {}); f[e.target.dataset.wf] = e.target.value; D.pref.set('wins.filter', f); D.render();
    });
    main.addEventListener('click', e => {
      if (!D.isRec('wins')) return;
      if (e.target.closest('[data-win-new]')) return edit(null);
      if (e.target.closest('[data-win-export]')) {
        const ok = D.state.wins.filter(w => w.portfolio_ok);
        if (!ok.length) return D.toast('还没有标成「可以上作品集」的记录', { error: true });
        D.download(`提效记录-作品集素材-${D.today()}.md`, D.portfolioMarkdown(D.state.wins), 'text/markdown;charset=utf-8');
        return D.toast(`已导出 ${ok.length} 条。上站前按脱敏红线再过一遍`, { timeout: 6000 });
      }
      const tr = e.target.closest('[data-win]'); if (!tr) return;
      const w = D.find('wins', tr.dataset.win);
      if (e.target.closest('[data-win-ok]')) return D.patch('wins', w.id, { portfolio_ok: w.portfolio_ok ? 0 : 1 }).catch(() => {});
      if (e.target.closest('[data-win-edit]')) return edit(w.id);
      const td = e.target.closest('td[data-wk]');
      if (td && !e.target.closest('input')) inlineEdit(td, w, td.dataset.wk);
    });
  };

  // 明细表行内编辑：点格子就改，失焦或回车保存
  function inlineEdit(td, w, key) {
    const save = v => { if (JSON.stringify(v ?? null) !== JSON.stringify(w[key] ?? null)) D.patch('wins', w.id, { [key]: v }).catch(() => {}); };
    if (key === 'happened_at') return D.datePopover(td, w.happened_at, v => v && save(v), { clear: false });
    if (key === 'task_type') return D.pickOption(td, { options: D.winTypes().map(x => ({ value: x, label: x })), value: w.task_type, onPick: save });
    if (key === 'project_id') return D.pickOption(td, { options: D.optionsFor('project'), value: w.project_id ? String(w.project_id) : null, search: true, emptyLabel: '不属于任何项目', onPick: v => save(v ? Number(v) : null) });
    if (key === 'tools') {
      const opts = [...new Set([...D.cfg().ai_tools, ...D.state.wins.flatMap(x => x.tools || [])])].map(x => ({ value: x, label: x }));
      return D.pickOption(td, { options: opts, value: w.tools || [], multi: true, onPick: save });
    }
    const num = key.endsWith('_minutes');
    const input = document.createElement('input');
    input.className = 'cell-input'; input.value = w[key] ?? '';
    if (num) { input.type = 'number'; input.min = '0'; input.placeholder = '分钟'; } else input.maxLength = key === 'task' ? 200 : 500;
    td.innerHTML = ''; td.append(input); input.focus(); input.select?.();
    let done = false;
    const finish = ok => {
      if (done) return; done = true; input.dataset.done = '1';
      if (!ok) return D.render();
      const raw = input.value.trim();
      const v = raw === '' ? null : num ? Number(raw) : raw;
      if (key === 'task' && !v) { D.toast('「做了什么」不能空', { error: true }); return D.render(); }
      save(v); D.render();
    };
    input.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.isComposing) finish(true); if (e.key === 'Escape') { e.stopPropagation(); finish(false); } });
    input.addEventListener('blur', () => finish(true));
  }

  document.addEventListener('DOMContentLoaded', () => {
    D.$('#win-form').addEventListener('submit', save);
    dlg().addEventListener('click', async e => {
      if (e.target.closest('[data-win-close]')) dlg().close();
      if (e.target.closest('[data-win-del]')) {
        const id = Number(D.$('#win-form').dataset.id); dlg().close();
        D.remove('wins', id, { label: D.find('wins', id)?.task });
      }
    });
  });
})();
