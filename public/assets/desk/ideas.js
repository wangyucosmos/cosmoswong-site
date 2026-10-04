/* 我的工作台 · 玩法创意：每周一个，按周倒序。字段行内改；「生成写提案的提示词」让 AI 写成给开发评估的 Word 提案。 */
(() => {
  const D = window.DESK;
  const { esc } = D;
  const COLS = [['week', '周', 150], ['title', '创意名', 200], ['mechanism', '玩法机制', 280], ['target', '考核方向', 110], ['dev_cost', '开发量', 80], ['status', '状态', 110], ['file_hint', '文件', 160], ['notes', '备注', 180]];

  const weeksAround = cur => { const out = []; const m = D.weekStart(cur); for (let i = 2; i >= -26; i--) out.push(D.isoWeek(D.addDays(m, i * 7))); return out; };
  function cell(i, key) {
    switch (key) {
      case 'week': return `<span title="${esc(D.weekLabel(i.week))}">${esc(D.weekLabel(i.week))}</span>`;
      case 'status': return D.ideaChip(i.status);
      case 'target': return esc(D.labelOf(D.IDEA_TARGETS, i.target));
      case 'dev_cost': return esc(D.labelOf(D.IDEA_COSTS, i.dev_cost));
      case 'mechanism': case 'notes': return `<span class="clip">${esc(i[key] || '')}</span>`;
      default: return esc(i[key] || '');
    }
  }

  D.renderIdeas = (view, el) => {
    const f = D.pref.get('ideas.filter', { status: '', target: '', dev_cost: '' });
    const week = D.isoWeek(D.today());
    const all = D.state.ideas;
    const list = all.filter(i => (!f.status || i.status === f.status) && (!f.target || i.target === f.target) && (!f.dev_cost || i.dev_cost === f.dev_cost)
      && (!D.q || [i.title, i.mechanism, i.notes].join('\n').toLowerCase().includes(D.q.toLowerCase())))
      .sort((a, b) => b.week.localeCompare(a.week) || b.id - a.id);
    const sub = all.filter(i => i.status !== 'draft');
    const n = k => sub.filter(i => i.target === k || (i.target === 'both' && ['value', 'stay'].includes(k))).length;
    const thisWeek = all.some(i => i.week === week);
    const sel = (name, opts, v, label) => `<select data-if="${name}" aria-label="${label}"><option value="">${label}</option>${opts.map(o => `<option value="${o.key}" ${o.key === v ? 'selected' : ''}>${esc(o.label)}</option>`).join('')}</select>`;
    el.innerHTML = `<div class="page ideas">
      <div class="stats">
        <div class="stat"><span>累计提交</span><b>${sub.length}</b><em>共 ${all.length} 条（含草稿）</em></div>
        <div class="stat"><span>被采纳</span><b>${all.filter(i => i.status === 'adopted').length}</b><em>开发评估中 ${all.filter(i => i.status === 'evaluating').length}</em></div>
        <div class="stat"><span>高价值转化</span><b>${n('value')}</b><em>已提交里，含「两者」</em></div>
        <div class="stat"><span>3 分钟停留</span><b>${n('stay')}</b><em>已提交里，含「两者」</em></div>
      </div>
      <div class="toolbar"><div class="filters">${sel('status', D.IDEA_STATUSES, f.status, '全部状态')}${sel('target', D.IDEA_TARGETS, f.target, '全部考核方向')}${sel('dev_cost', D.IDEA_COSTS, f.dev_cost, '全部开发量')}</div></div>
      <div class="table-wrap"><table class="grid ideas-table"><colgroup>${COLS.map(c => `<col style="width:${c[2]}px">`).join('')}<col style="width:150px"></colgroup>
        <thead><tr>${COLS.map(c => `<th>${c[1]}</th>`).join('')}<th></th></tr></thead><tbody>
        ${thisWeek ? '' : `<tr class="addrow this-week"><td>${esc(D.weekLabel(week))}</td><td colspan="${COLS.length}"><form class="inline-add" data-idea-add><input name="title" maxlength="120" placeholder="写本周创意：先起个名字，回车保存，再补玩法机制" aria-label="本周创意名"></form></td></tr>`}
        ${list.map(i => `<tr data-idea="${i.id}" class="${i.week === week ? 'cur' : ''}">${COLS.map(([k]) => `<td class="editable c-${k}" data-ik="${k}">${cell(i, k)}</td>`).join('')}
          <td class="c-act"><button type="button" class="tb" data-idea-prompt title="复制给 AI，让它写成给开发评估的提案">${D.icon('sparkle', 'sm')} 写提案</button><button type="button" class="x" data-idea-del aria-label="删除">×</button></td></tr>`).join('')}
        ${thisWeek || list.length ? `<tr class="addrow"><td colspan="${COLS.length + 1}"><button type="button" class="add-inline" data-idea-new>＋ 再加一条</button></td></tr>` : ''}
      </tbody></table></div>
      ${all.length ? '' : '<p class="empty-state">还没有玩法创意。每周写一个，先起名字，再补机制、考核方向和开发量；写好点「写提案」让 AI 写成 Word。</p>'}
    </div>`;
  };

  function edit(td, i, key) {
    const save = v => { if ((v ?? null) !== (i[key] ?? null)) D.patch('ideas', i.id, { [key]: v }).catch(() => {}); };
    if (key === 'status') return D.pickOption(td, { options: D.optionsFor('idea_status'), value: i.status, allowEmpty: false, onPick: save });
    if (key === 'target' || key === 'dev_cost') return D.pickOption(td, { options: D.optionsFor(key), value: i[key], onPick: save });
    if (key === 'week') return D.pickOption(td, { options: weeksAround(D.isoWeek(D.today())).map(w => ({ value: w, label: D.weekLabel(w) })), value: i.week, allowEmpty: false, onPick: save });
    if (key === 'mechanism' || key === 'notes') {
      const el = D.popover(td, `<form class="pop-form"><label>${key === 'mechanism' ? '玩法机制' : '备注'}<textarea name="v" rows="6" maxlength="3000">${esc(i[key] || '')}</textarea></label><div class="pop-foot"><button class="btn sm">保存</button></div></form>`, { width: 420, cls: 'sheet' });
      el.querySelector('form').addEventListener('submit', e => { e.preventDefault(); D.closePopover(); save(e.target.v.value.trim() || null); });
      return;
    }
    const input = document.createElement('input');
    input.className = 'cell-input'; input.value = i[key] ?? ''; input.maxLength = key === 'title' ? 120 : 300;
    td.innerHTML = ''; td.append(input); input.focus();
    let done = false;
    const finish = ok => {
      if (done) return; done = true; input.dataset.done = '1';
      if (!ok) return D.render();
      const v = input.value.trim() || null;
      if (key === 'title' && !v) { D.toast('创意名不能空', { error: true }); return D.render(); }
      save(v); D.render();
    };
    input.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.isComposing) finish(true); if (e.key === 'Escape') { e.stopPropagation(); finish(false); } });
    input.addEventListener('blur', () => finish(true));
  }

  D.ideasEvents = (main, getView) => {
    main.addEventListener('change', e => {
      if (!D.isRec('ideas') || !e.target.dataset.if) return;
      const f = D.pref.get('ideas.filter', {}); f[e.target.dataset.if] = e.target.value; D.pref.set('ideas.filter', f); D.render();
    });
    main.addEventListener('submit', async e => {
      if (!D.isRec('ideas') || !e.target.matches('[data-idea-add]')) return;
      e.preventDefault();
      const title = e.target.title.value.trim(); if (!title) return;
      try { await D.create('ideas', { week: D.isoWeek(D.today()), title, status: 'draft' }); D.toast('已记下本周创意，写好后把状态改成「已提交」'); } catch (err) { D.fail(err); }
    });
    main.addEventListener('click', async e => {
      if (!D.isRec('ideas')) return;
      if (e.target.closest('[data-idea-new]')) {
        const td = e.target.closest('td');
        td.innerHTML = `<form class="inline-add" data-idea-add><input name="title" maxlength="120" placeholder="创意名，回车保存（记在本周）" aria-label="创意名"></form>`;
        return td.querySelector('input').focus();
      }
      const tr = e.target.closest('[data-idea]'); if (!tr) return;
      const i = D.find('ideas', tr.dataset.idea);
      if (e.target.closest('[data-idea-prompt]')) return D.copy(D.ideaPrompt(i), '写提案的提示词');
      if (e.target.closest('[data-idea-del]')) return D.remove('ideas', i.id, { label: i.title });
      const td = e.target.closest('td[data-ik]');
      if (td && !e.target.closest('input')) edit(td, i, td.dataset.ik);
    });
  };
})();
