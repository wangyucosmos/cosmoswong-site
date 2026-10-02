/* KOL 工作台 · 待补全：资料完整度检查 + 一键修复（国家代码、邮箱放错栏、粉丝按千填、缺语言、没排期、缺链接 / 赛道 / 邮箱）。 */
(() => {
  const K = window.KOL;
  const { esc } = K;
  const EMAIL_RE = /[^\s@<>"',;:()（）]+@[^\s@<>"',;:()（）]+\.[a-z]{2,}/i;
  const BAD_COUNTRY = { UK: 'GB', FX: 'FR', EL: 'GR' };

  const needsSchedule = k => !k.next_followup_at && !['paused', 'won'].includes(k.status) && !k.do_not_contact;
  // 某个 KOL 还缺哪些资料（勿再联系的人不提醒）
  K.missing = k => {
    if (k.do_not_contact) return [];
    const m = [];
    if (!K.safeUrl(k.profile_url)) m.push({ key: 'profile_url', label: '主页链接' });
    if (!k.email) m.push({ key: 'email', label: '邮箱' });
    if (!k.language) m.push({ key: 'language', label: '语言' });
    if (!(k.category || []).length) m.push({ key: 'category', label: '赛道' });
    if (!k.country) m.push({ key: 'country', label: '国家' });
    if (k.followers == null) m.push({ key: 'followers', label: '粉丝量' });
    if (needsSchedule(k)) m.push({ key: 'next_followup_at', label: '下次跟进' });
    return m;
  };
  K.qualityCount = () => K.state.kols.filter(k => K.missing(k).length || BAD_COUNTRY[k.country] || (!k.email && EMAIL_RE.test(k.contact_other || ''))).length;

  // 按 KOL 的平台去搜他的名字（找主页链接 / 商务邮箱用）
  const searchUrl = k => {
    const s = K.SEARCH.find(x => x.platform === k.platform && /频道|用户/.test(x.name)) || K.SEARCH.find(x => x.name === k.platform);
    return s ? s.url(k.name) : `https://www.google.com/search?q=${encodeURIComponent(k.name + ' ' + (k.platform || ''))}`;
  };

  const groups = () => {
    const ks = K.state.kols.filter(k => !k.do_not_contact);
    return {
      country: K.state.kols.filter(k => BAD_COUNTRY[k.country]),
      emailMove: ks.filter(k => !k.email && EMAIL_RE.test(k.contact_other || '')),
      thousands: ks.filter(k => k.followers != null && k.followers > 0 && k.followers < 1000),
      language: ks.filter(k => !k.language),
      schedule: ks.filter(needsSchedule),
      link: ks.filter(k => !K.safeUrl(k.profile_url)),
      category: ks.filter(k => !(k.category || []).length),
      email: ks.filter(k => !k.email && !EMAIL_RE.test(k.contact_other || ''))
    };
  };

  const nameBtn = k => `<button type="button" class="link-btn" data-open-kol="${k.id}">${esc(k.name)}</button>`;
  const sec = (title, desc, body, extra = '') => `<section class="card-box qsec"><h3>${title}</h3>${desc ? `<p class="muted small">${desc}</p>` : ''}${body}${extra}</section>`;
  let per = 10;

  K.renderQuality = (view, el) => {
    const g = groups();
    const total = K.qualityCount();
    const langOpts = v => `<option value="">（不填）</option>` + K.cfg().languages.map(l => `<option value="${l.code}" ${l.code === v ? 'selected' : ''}>${esc(l.name)}</option>`).join('');
    const parts = [];
    if (g.country.length) parts.push(sec(`国家代码不规范 <small class="muted">${g.country.length}</small>`, 'UK、FX 是旧代码，旗子和筛选都对不上，应该是 GB（英国）、FR（法国）。',
      `<p>${g.country.map(k => `${nameBtn(k)}：${esc(k.country)} → ${esc(BAD_COUNTRY[k.country])}`).join('　')}</p>`, `<button type="button" class="btn sm" data-q="country">全部改正</button>`));
    if (g.emailMove.length) parts.push(sec(`邮箱写在了「其他联系方式」里 <small class="muted">${g.emailMove.length}</small>`, '移到邮箱栏后，写邮件才能自动带上收件人，查重也会更准。',
      `<p>${g.emailMove.map(k => `${nameBtn(k)}：<span class="mono">${esc(EMAIL_RE.exec(k.contact_other)[0])}</span>`).join('　')}</p>`, `<button type="button" class="btn sm" data-q="email-move">全部移到邮箱</button>`));
    if (g.thousands.length) parts.push(sec(`粉丝量可能是按「千」填的 <small class="muted">${g.thousands.length}</small>`, '粉丝量小于 1000。如果原表单位是 K（千），勾上的会乘以 1000；确实这么少的就取消勾选。',
      `<div class="qlist">${g.thousands.map(k => `<label class="qrow"><input type="checkbox" data-k1000="${k.id}" checked> ${esc(k.name)}　<span class="muted">${K.fmtInt(k.followers)} → ${K.fmtInt(k.followers * 1000)}</span></label>`).join('')}</div>`,
      `<button type="button" class="btn sm" data-q="x1000">勾选的乘以 1000</button>`));
    if (g.language.length) parts.push(sec(`缺语言 <small class="muted">${g.language.length}</small>`, '写邮件时按语言推荐模板（德国博主推荐德文开发信）。下面按国家给了建议，<b>请看一眼再确认</b>：比如斯洛伐克的博主也可能做德语内容，看主页或邮箱后缀就知道。',
      `<div class="qlist">${g.language.map(k => { const sug = K.COUNTRY_LANG[k.country] || ''; return `<div class="qrow"><input type="checkbox" data-lang-on="${k.id}" ${sug ? 'checked' : ''} aria-label="选中 ${esc(k.name)}"> ${nameBtn(k)} <span class="muted">${K.countryLabel(k.country) || '国家未填'}</span>${k.email ? ` <span class="muted mono small">${esc(k.email)}</span>` : ''}<span class="grow"></span><select data-lang="${k.id}" aria-label="${esc(k.name)} 的语言">${langOpts(sug)}</select></div>`; }).join('')}</div>`,
      `<button type="button" class="btn sm" data-q="lang">按勾选的填好语言</button>`));
    if (g.schedule.length) parts.push(sec(`还没排下次跟进 <small class="muted">${g.schedule.length}</small>`, '没排日期的人不会出现在「今日待跟进」里。',
      `<p>${g.schedule.map(k => `${nameBtn(k)} ${K.statusChip(k.status)}`).join('　')}</p>`,
      `<div class="row wrap"><button type="button" class="btn sm" data-q="sched-today">都排到今天</button><span>或者分散排，每天 <input data-per type="number" min="1" max="100" value="${per}" style="width:64px" aria-label="每天几个"> 个</span><button type="button" class="btn sm ghost" data-q="sched-spread">分散排</button></div>`));
    if (g.link.length) parts.push(sec(`缺主页链接 <small class="muted">${g.link.length}</small>`, '点「去搜」在新标签页里找到 TA 的主页，复制地址栏粘贴回来保存。',
      `<div class="qlist">${g.link.map(k => `<form class="qrow" data-link-save="${k.id}">${nameBtn(k)} ${K.platformChip(k.platform)} ${K.link(searchUrl(k), '去搜 ↗', 'tb')}<span class="grow"></span><input name="url" type="url" placeholder="粘贴主页链接" aria-label="${esc(k.name)} 的主页链接"><button class="btn sm">保存</button></form>`).join('')}</div>`));
    if (g.category.length) parts.push(sec(`缺赛道 <small class="muted">${g.category.length}</small>`, '',
      `<div class="qlist">${g.category.map(k => `<div class="qrow">${nameBtn(k)}<span class="grow"></span><button type="button" class="tb" data-cat="${k.id}">选赛道 ▾</button></div>`).join('')}</div>`));
    if (g.email.length) parts.push(sec(`缺邮箱 <small class="muted">${g.email.length}</small>`, '去 TA 的主页「关于 / About」里找公开的商务邮箱（只填公开信息）。',
      `<div class="qlist">${g.email.map(k => `<form class="qrow" data-email-save="${k.id}">${nameBtn(k)} ${k.contact_other ? `<span class="muted small">现有联系方式：${esc(k.contact_other)}</span>` : ''} ${K.safeUrl(k.profile_url) ? K.link(k.profile_url, '打开主页 ↗', 'tb') : K.link(searchUrl(k), '去搜 ↗', 'tb')}<span class="grow"></span><input name="email" type="email" placeholder="商务邮箱" aria-label="${esc(k.name)} 的邮箱"><button class="btn sm">保存</button></form>`).join('')}</div>`));
    el.innerHTML = `<div class="page quality">
      <section class="hero-box"><h2>🧩 待补全</h2><p>${total ? `有 <b>${total}</b> 个 KOL 的资料不完整或有问题。补齐后，查重、写邮件、筛选和「今日待跟进」才会准。` : '🎉 资料都齐了。'}</p></section>
      ${parts.join('') || ''}</div>`;
  };

  /* ---------- 批量改：同样的改动合成一次批量请求，各不相同的逐个改 ---------- */
  async function apply(pairs, okText) {
    if (!pairs.length) return K.toast('没有选中任何一个', { error: true });
    const byPatch = new Map();
    for (const [id, patch] of pairs) { const key = JSON.stringify(patch); if (!byPatch.has(key)) byPatch.set(key, { patch, ids: [] }); byPatch.get(key).ids.push(id); }
    let n = 0;
    try {
      for (const { patch, ids } of byPatch.values()) {
        if (ids.length > 1) { const { kols } = await K.api('POST', '/kols/batch', { ids, patch }); kols.forEach(K.replaceKol); }
        else { const { kol } = await K.api('PATCH', `/kols/${ids[0]}`, patch); K.replaceKol(kol); }
        n += ids.length;
      }
      K.toast(okText.replace('{n}', n));
    } catch (e) { K.fail(e); }
    K.render(true);
  }

  K.qualityEvents = (main, getView) => {
    main.addEventListener('click', async e => {
      if (getView()?.kind !== 'quality') return;
      const o = e.target.closest('[data-open-kol]'); if (o) return K.drawer.open(o.dataset.openKol);
      const cat = e.target.closest('[data-cat]');
      if (cat) {
        const k = K.kol(cat.dataset.cat);
        return K.pickOption(cat, { options: K.optionsFor('category'), value: k.category || [], multi: true,
          onPick: v => { if (v.length) apply([[k.id, { category: v }]], '已保存赛道'); } });
      }
      const q = e.target.closest('[data-q]')?.dataset.q; if (!q) return;
      const g = groups();
      if (q === 'country') return apply(g.country.map(k => [k.id, { country: BAD_COUNTRY[k.country] }]), '已改正 {n} 个国家代码');
      if (q === 'email-move') return apply(g.emailMove.map(k => {
        const m = EMAIL_RE.exec(k.contact_other)[0];
        const rest = k.contact_other.replace(m, '').replace(/^[\s/|,;，；:：-]+|[\s/|,;，；:：-]+$/g, '');
        return [k.id, { email: m, contact_other: rest || null }];
      }), '已把 {n} 个邮箱移到邮箱栏');
      if (q === 'x1000') {
        const ids = K.$$('[data-k1000]:checked', main).map(x => Number(x.dataset.k1000));
        if (ids.length && !(await K.confirm(`把这 ${ids.length} 个 KOL 的粉丝量乘以 1000？`, '确认'))) return;
        return apply(ids.map(id => [id, { followers: K.kol(id).followers * 1000 }]), '已更新 {n} 个粉丝量');
      }
      if (q === 'lang') {
        const pairs = K.$$('[data-lang-on]:checked', main).map(x => { const id = Number(x.dataset.langOn); return [id, { language: K.$(`[data-lang="${id}"]`, main).value || null }]; }).filter(([, p]) => p.language);
        return apply(pairs, '已填好 {n} 个语言');
      }
      if (q === 'sched-today') return apply(g.schedule.map(k => [k.id, { next_followup_at: K.today() }]), '已把 {n} 个排到今天');
      if (q === 'sched-spread') return apply(g.schedule.map((k, i) => [k.id, { next_followup_at: K.addDays(K.today(), Math.floor(i / per)) }]), '已分散排好 {n} 个');
    });
    main.addEventListener('change', e => { if (e.target.matches('[data-per]') && getView()?.kind === 'quality') per = Math.max(1, Number(e.target.value) || 10); });
    main.addEventListener('submit', async e => {
      if (getView()?.kind !== 'quality') return;
      e.preventDefault();
      const f = e.target;
      if (f.matches('[data-link-save]')) {
        const url = f.url.value.trim(); if (!K.safeUrl(url)) return K.toast('请粘贴以 https:// 开头的主页链接', { error: true });
        const k = K.kol(f.dataset.linkSave), p = K.parseProfileUrl(url);
        return apply([[k.id, { profile_url: url, ...(!k.handle && p?.handle ? { handle: p.handle } : {}) }]], '已保存主页链接');
      }
      if (f.matches('[data-email-save]')) {
        const v = f.email.value.trim(); if (!EMAIL_RE.test(v)) return K.toast('邮箱格式不对', { error: true });
        return apply([[Number(f.dataset.emailSave), { email: v }]], '已保存邮箱');
      }
    });
  };
})();
