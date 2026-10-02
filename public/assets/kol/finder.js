/* KOL 工作台 · 找人助手：关键词库、各平台站内搜索链接、粘贴主页链接快速添加（含查重）；以及「新建 KOL」弹窗。
   页面本身不发任何外部请求，搜索链接只是在新标签页打开。 */
(() => {
  const K = window.KOL;
  const { esc } = K;

  /* ---------- 各平台站内搜索链接（2026-10 核对过：YouTube/TikTok/Twitch/Reddit 直接可开；
     Instagram/X 要先登录，登录后会回到搜索结果；Discord/Telegram 没有网页版搜索，用 Google 站内搜索代替） ---------- */
  const enc = encodeURIComponent;
  K.SEARCH = [
    { name: 'YouTube', url: q => `https://www.youtube.com/results?search_query=${enc(q).replace(/%20/g, '+')}` },
    { name: 'YouTube 频道', platform: 'YouTube', url: q => `https://www.youtube.com/results?search_query=${enc(q).replace(/%20/g, '+')}&sp=EgIQAg%253D%253D` },
    { name: 'TikTok', url: q => `https://www.tiktok.com/search?q=${enc(q)}` },
    { name: 'TikTok 用户', platform: 'TikTok', url: q => `https://www.tiktok.com/search/user?q=${enc(q)}` },
    { name: 'Instagram', url: q => `https://www.instagram.com/explore/search/keyword/?q=${enc(q)}` },
    { name: 'X', url: q => `https://x.com/search?q=${enc(q)}&f=user` },
    { name: 'Twitch', url: q => `https://www.twitch.tv/search?term=${enc(q)}` },
    { name: 'Reddit', url: q => `https://www.reddit.com/search/?q=${enc(q)}` },
    { name: 'Discord', url: q => `https://www.google.com/search?q=${enc(`(site:discord.gg OR site:disboard.org) ${q}`)}` },
    { name: 'Telegram', url: q => `https://www.google.com/search?q=${enc(`site:t.me ${q}`)}` }
  ];

  /* ---------- 主页链接 → 平台 + 账号 ---------- */
  K.parseProfileUrl = raw => {
    let s = String(raw || '').trim();
    if (!s) return null;
    if (!/^https?:\/\//i.test(s)) s = 'https://' + s;
    let u; try { u = new URL(s); } catch { return null; }
    const host = u.hostname.toLowerCase().replace(/^(www\.|m\.|mobile\.|vm\.)/, '');
    const seg = u.pathname.split('/').filter(Boolean).map(x => decodeURIComponent(x));
    const clean = u.origin.replace(/\/\/(m|mobile)\./, '//www.') + u.pathname.replace(/\/+$/, '');
    const out = (platform, handle) => ({ platform, handle: handle || '', profile_url: clean });
    if (host === 'youtube.com' || host === 'youtu.be') {
      if (seg[0]?.startsWith('@')) return out('YouTube', seg[0]);
      if (['c', 'user'].includes(seg[0]) && seg[1]) return out('YouTube', seg[1]);
      if (seg[0] === 'channel' && seg[1]) return out('YouTube', seg[1]);
      return out('YouTube', '');
    }
    if (host === 'tiktok.com') return out('TikTok', seg[0]?.startsWith('@') ? seg[0] : '');
    if (host === 'instagram.com') return out('Instagram', seg[0] && !['p', 'reel', 'reels', 'explore', 'stories'].includes(seg[0]) ? '@' + seg[0] : '');
    if (host === 'x.com' || host === 'twitter.com') return out('X', seg[0] && !['search', 'i', 'home', 'hashtag'].includes(seg[0]) ? '@' + seg[0] : '');
    if (host === 'twitch.tv') return out('Twitch', seg[0] && !['directory', 'search', 'videos'].includes(seg[0]) ? seg[0] : '');
    if (host === 'reddit.com') {
      if (['user', 'u'].includes(seg[0]) && seg[1]) return out('Reddit', 'u/' + seg[1]);
      if (seg[0] === 'r' && seg[1]) return out('Reddit', 'r/' + seg[1]);
      return out('Reddit', '');
    }
    if (host === 't.me' || host === 'telegram.me') return out('Telegram', seg[0] ? '@' + seg[0] : '');
    if (host === 'discord.gg') return out('Discord', seg[0] || '');
    if (host === 'discord.com' && seg[0] === 'invite') return out('Discord', seg[1] || '');
    return out('其他', '');
  };

  /* ---------- 新建 KOL 表单（找人助手页里和弹窗里共用） ---------- */
  K.kolFormHtml = (pre = {}) => {
    const c = K.cfg();
    const sel = (name, opts, v, empty = '—') => `<select name="${name}"><option value="">${empty}</option>${opts.map(o => `<option value="${esc(o[0])}" ${o[0] === v ? 'selected' : ''}>${esc(o[1])}</option>`).join('')}</select>`;
    return `<div class="fgrid">
      <label class="fld wide"><span class="fl">主页链接（粘贴后自动识别平台和账号）</span><input name="profile_url" type="url" value="${esc(pre.profile_url || '')}" placeholder="https://www.youtube.com/@…" autocomplete="off"></label>
      <label class="fld"><span class="fl">名称 *</span><input name="name" value="${esc(pre.name || '')}" maxlength="120" required></label>
      <label class="fld"><span class="fl">账号</span><input name="handle" value="${esc(pre.handle || '')}" maxlength="120" placeholder="@账号"></label>
      <label class="fld"><span class="fl">平台</span>${sel('platform', c.platforms.map(p => [p.name, p.name]), pre.platform)}</label>
      <label class="fld"><span class="fl">粉丝量</span><input name="followers" type="number" min="0" value="${esc(pre.followers ?? '')}"></label>
      <label class="fld"><span class="fl">国家</span>${sel('country', c.countries.map(x => [x.code, `${K.flag(x.code)} ${x.name}`]), pre.country)}</label>
      <label class="fld"><span class="fl">语言</span>${sel('language', c.languages.map(x => [x.code, x.name]), pre.language)}</label>
      <label class="fld"><span class="fl">优先级</span>${sel('priority', K.PRIORITIES.map(p => [p.key, p.label]), pre.priority)}</label>
      <label class="fld"><span class="fl">邮箱</span><input name="email" type="email" value="${esc(pre.email || '')}" maxlength="200"></label>
      <div class="fld wide"><span class="fl">品类</span><div class="checks">${c.categories.map(x => `<label><input type="checkbox" name="category" value="${esc(x)}" ${(pre.category || []).includes(x) ? 'checked' : ''}> ${esc(x)}</label>`).join('')}</div></div>
    </div>
    <div class="dupe-box" data-dupes hidden></div>
    <p class="muted small">新加的 KOL 默认「待触达」，下次跟进是今天。</p>`;
  };

  K.bindKolForm = (form, { onSaved }) => {
    const dupBox = form.querySelector('[data-dupes]');
    const read = () => ({
      name: form.name.value.trim(), handle: form.handle.value.trim(), platform: form.platform.value || null,
      profile_url: form.profile_url.value.trim() || null, followers: form.followers.value === '' ? null : Number(form.followers.value),
      country: form.country.value || null, language: form.language.value || null, priority: form.priority.value || null,
      email: form.email.value.trim() || null, category: [...form.querySelectorAll('[name=category]:checked')].map(x => x.value)
    });
    const showDupes = (dupes, serverSide) => {
      dupBox.hidden = !dupes.length;
      dupBox.innerHTML = dupes.length ? `<p>⚠️ 疑似重复：</p><ul>${dupes.map(d => `<li>「${esc(d.name)}」（${esc(d.reason)}） <button type="button" class="link-btn" data-open-kol="${d.id}">打开已有记录</button></li>`).join('')}</ul>
        ${serverSide ? '<button type="button" class="btn sm ghost" data-force>确认不是同一个人，仍然添加</button>' : ''}` : '';
    };
    const check = () => showDupes(K.findDupesLocal(read()), false);
    form.profile_url.addEventListener('input', () => {
      const p = K.parseProfileUrl(form.profile_url.value);
      // 空着的、或上次自动填进去且没被手动改过的字段，跟着新链接更新
      const auto = (el, v) => { if (v && (!el.value || el.dataset.auto === '1')) { el.value = v; el.dataset.auto = '1'; } };
      if (p) {
        auto(form.platform, K.cfg().platforms.some(x => x.name === p.platform) ? p.platform : '');
        auto(form.handle, p.handle);
        auto(form.name, p.handle.replace(/^@|^u\/|^r\//, ''));
      }
      check();
    });
    ['handle', 'email', 'platform'].forEach(n => form[n].addEventListener('change', check));
    ['name', 'handle', 'platform'].forEach(n => form[n].addEventListener('input', () => { form[n].dataset.auto = ''; }));
    let force = false;
    form.addEventListener('click', e => {
      const o = e.target.closest('[data-open-kol]');
      if (o) { form.closest('dialog')?.close(); K.drawer.open(o.dataset.openKol); }
      if (e.target.closest('[data-force]')) { force = true; form.requestSubmit(); }
    });
    form.addEventListener('submit', async e => {
      e.preventDefault();
      const data = read();
      if (!data.name) { K.toast('名称不能空', { error: true }); return form.name.focus(); }
      const btn = form.querySelector('button[type=submit], button:not([type])');
      if (btn) btn.disabled = true;
      try {
        const kol = await K.createKol(data, { force });
        force = false;
        K.toast(`已添加「${kol.name}」`);
        onSaved?.(kol);
      } catch (err) {
        if (err.status === 409) showDupes(err.data.dupes || [], true); else K.fail(err);
      } finally { if (btn) btn.disabled = false; }
    });
  };

  K.openNewKol = (pre = {}) => {
    const d = K.$('#newkol');
    K.$('#newkol-body').innerHTML = `<form id="newkol-form" novalidate>${K.kolFormHtml(pre)}<div class="row end"><button type="button" class="btn sm ghost" data-close-new>取消</button><button class="btn sm" type="submit">添加</button></div></form>`;
    const form = K.$('#newkol-form');
    K.bindKolForm(form, { onSaved: kol => { d.close(); K.drawer.open(kol.id); } });
    d.showModal();
    (pre.profile_url ? form.name : form.profile_url).focus();
  };

  /* ---------- 找人助手页 ---------- */
  const pick = K.pref.get('finder', { cats: [], langs: ['en', 'de'], plats: ['YouTube', 'TikTok'] });

  K.renderFinder = (view, el) => {
    const kws = K.state.keywords;
    const cats = [...new Set([...K.cfg().categories, ...kws.map(k => k.category)])].filter(c => kws.some(k => k.category === c));
    const langs = [...new Set(kws.map(k => k.language))];
    const chosen = kws.filter(k => (!pick.cats.length || pick.cats.includes(k.category)) && (!pick.langs.length || pick.langs.includes(k.language)));
    const plats = K.SEARCH.filter(s => pick.plats.includes(s.platform || s.name));
    const allPlats = [...new Set(K.SEARCH.map(s => s.platform || s.name))];
    const chip = (group, v, label, on) => `<button type="button" class="fchip-t${on ? ' on' : ''}" data-pick-g="${group}" data-v="${esc(v)}" aria-pressed="${on}">${esc(label)}</button>`;
    el.innerHTML = `<div class="page finder">
      <section class="card-box">
        <h3>① 快速添加</h3>
        <p class="muted small">在平台上找到合适的人，把 TA 的主页链接粘贴到下面，会自动识别平台和账号，并检查是不是已经录过。</p>
        <form class="quickadd" data-quickadd>${K.kolFormHtml()}<div class="row end"><button class="btn sm" type="submit">添加到 KOL 列表</button></div></form>
      </section>
      <section class="card-box">
        <h3>② 生成搜索链接</h3>
        <p class="muted small">选好品类、语言、平台，下面会列出每个关键词在各平台的搜索链接，点开就在新标签页里搜。</p>
        <div class="pick-row"><b>品类</b>${cats.map(c => chip('cats', c, c, pick.cats.includes(c))).join('')}<span class="muted small">（不选 = 全部）</span></div>
        <div class="pick-row"><b>语言</b>${langs.map(l => chip('langs', l, K.langName(l), pick.langs.includes(l))).join('')}</div>
        <div class="pick-row"><b>平台</b>${allPlats.map(p => chip('plats', p, p, pick.plats.includes(p))).join('')}</div>
        ${chosen.length && plats.length ? `<div class="table-wrap"><table class="grid links-table"><thead><tr><th>关键词</th><th>语言</th>${plats.map(p => `<th>${esc(p.name)}</th>`).join('')}</tr></thead><tbody>
          ${chosen.map(k => `<tr><td><b>${esc(k.keyword)}</b> <small class="muted">${esc(k.category)}</small></td><td>${esc(K.langName(k.language))}</td>${plats.map(p => `<td>${K.link(p.url(k.keyword), '搜索 ↗', 'srch')}</td>`).join('')}</tr>`).join('')}
        </tbody></table></div>` : '<p class="muted">选一下语言和平台，这里就会出现搜索链接。</p>'}
      </section>
      <section class="card-box">
        <h3>③ 关键词库</h3>
        <form class="kw-add" data-kw-add>
          <input name="category" list="kw-cats" placeholder="品类，如 飞行模拟" maxlength="30" required aria-label="品类">
          <datalist id="kw-cats">${K.cfg().categories.map(c => `<option value="${esc(c)}">`).join('')}</datalist>
          <select name="language" aria-label="语言">${K.cfg().languages.map(l => `<option value="${l.code}">${esc(l.name)}</option>`).join('')}</select>
          <input name="keyword" placeholder="关键词，如 VR Flugsimulator" maxlength="120" required aria-label="关键词">
          <button class="btn sm">添加</button>
        </form>
        ${[...new Set(kws.map(k => k.category))].map(c => `<div class="kw-group"><h4>${esc(c)}</h4><div class="kws">${kws.filter(k => k.category === c).map(k => `<span class="kw" data-kw="${k.id}"><small>${esc(k.language)}</small><button type="button" class="kw-text" data-kw-edit title="点击修改">${esc(k.keyword)}</button><button type="button" class="x" data-kw-del aria-label="删除关键词">×</button></span>`).join('')}</div></div>`).join('') || '<p class="muted">关键词库是空的，先加几个。</p>'}
      </section>
    </div>`;
    K.bindKolForm(el.querySelector('[data-quickadd]'), { onSaved: kol => { K.render(true); K.drawer.open(kol.id); } });
  };

  K.finderEvents = (main, getView) => {
    main.addEventListener('click', async e => {
      if (getView()?.kind !== 'finder') return;
      const c = e.target.closest('[data-pick-g]');
      if (c) {
        const g = c.dataset.pickG, v = c.dataset.v;
        pick[g] = pick[g].includes(v) ? pick[g].filter(x => x !== v) : [...pick[g], v];
        K.pref.set('finder', pick); return K.render(true);
      }
      const kw = e.target.closest('[data-kw]'); if (!kw) return;
      const id = Number(kw.dataset.kw), item = K.state.keywords.find(x => x.id === id);
      if (e.target.closest('[data-kw-del]')) {
        return K.deferredDelete({ text: `删除关键词「${item.keyword}」？`, label: item.keyword,
          removeLocal: () => { K.state.keywords = K.state.keywords.filter(x => x.id !== id); },
          restoreLocal: () => K.state.keywords.push(item), commit: () => K.api('DELETE', `/keywords/${id}`) });
      }
      if (e.target.closest('[data-kw-edit]')) {
        const el = K.popover(kw, `<form class="pop-form"><label>修改关键词</label><input name="k" value="${esc(item.keyword)}" maxlength="120"><div class="pop-foot"><button class="btn sm">保存</button></div></form>`);
        el.querySelector('form').addEventListener('submit', async ev => {
          ev.preventDefault();
          const v = ev.target.k.value.trim(); if (!v) return;
          K.closePopover();
          try { const { item: x } = await K.api('PATCH', `/keywords/${id}`, { keyword: v }); Object.assign(item, x); K.render(true); } catch (err) { K.fail(err); }
        });
      }
    });
    main.addEventListener('submit', async e => {
      if (getView()?.kind !== 'finder' || !e.target.matches('[data-kw-add]')) return;
      e.preventDefault();
      const f = e.target;
      try {
        const { item } = await K.api('POST', '/keywords', { category: f.category.value.trim(), language: f.language.value, keyword: f.keyword.value.trim() });
        K.state.keywords.push(item); f.keyword.value = ''; K.render(true); K.toast('已添加关键词');
      } catch (err) { K.fail(err); }
    });
  };

  document.addEventListener('DOMContentLoaded', () => {
    const d = K.$('#newkol');
    d.addEventListener('click', e => { if (e.target === d || e.target.closest('[data-close-new]')) d.close(); });
  });
})();
