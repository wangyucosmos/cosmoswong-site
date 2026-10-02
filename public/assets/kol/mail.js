/* KOL 工作台 · 邮件助手：模板库视图、写邮件 / 回邮件弹窗、生成给 Claude 的提示词。P0 不接任何 AI 接口。 */
(() => {
  const K = window.KOL;
  const { esc } = K;
  const VARS = ['name', 'handle', 'platform', 'channel_url', 'product', 'product_link', 'my_name', 'company', 'quote'];
  const VAR_LABEL = { name: 'KOL 名称', handle: '账号', platform: '平台', channel_url: '主页链接', product: '产品名', product_link: '带货链接', my_name: '我的署名', company: '公司名', quote: '报价' };
  // 推荐哪封：先看「下一步」（已触达几次：开发信 → 首次跟进 → 最后一封），没有再按状态
  const SCENE_FOR = { todo: 'outreach', contacted: 'follow1', talking: 'sample', sampled: 'publish', published: 'settle', won: 'settle', partner: 'settle', paused: 'decline' };
  const sceneFor = k => K.nextStep(k).scene || SCENE_FOR[k.status];

  const varsFor = k => {
    const p = K.cfg().profile;
    return {
      name: k.name, handle: k.handle, platform: k.platform, channel_url: k.profile_url,
      product: p.product, product_link: p.product_link, my_name: p.my_name, company: p.company,
      quote: k.quote != null ? K.eur(k.quote) + (k.quote_note ? `（${k.quote_note}）` : '') : k.quote_note
    };
  };
  // 有值的变量替换掉；没值的保留 {{x}} 并报出来，方便她补
  K.fillTemplate = (text, vars) => {
    const missing = new Set();
    const out = String(text || '').replace(/\{\{\s*(\w+)\s*\}\}/g, (m, v) => {
      if (!VARS.includes(v)) return m;
      const val = vars[v];
      if (val == null || val === '') { missing.add(v); return m; }
      return String(val);
    });
    return { text: out, missing: [...missing] };
  };
  // mailto：主题和正文按 RFC 6068 编码，换行用 %0D%0A
  K.mailtoUrl = (to, subject, body) => {
    const encBody = encodeURIComponent(String(body || '').replace(/\r?\n/g, '\r\n'));
    const addr = String(to || '').replace(/[?#&%]/g, c => encodeURIComponent(c));
    return `mailto:${addr}?subject=${encodeURIComponent(subject || '')}&body=${encBody}`;
  };
  const MAILTO_LIMIT = 1800;

  /* ================= 写邮件 / 回邮件 弹窗 ================= */
  let cur = null;   // { k, tab, queue?: [id], qi, sent, skipped }
  const dlg = () => K.$('#mail');

  function templateOptions(k) {
    const scene = sceneFor(k);
    const lang = k.language || 'en';
    const rank = t => (t.language === lang ? 0 : t.language === 'en' ? 1 : 2) * 10 + (t.scene === scene ? 0 : 1);
    const sorted = [...K.state.templates].sort((a, b) => rank(a) - rank(b) || a.id - b.id);
    return { sorted, best: sorted[0] };
  }

  function composeHtml(k) {
    const { sorted, best } = templateOptions(k);
    const lang = k.language || 'en';
    return `<div class="mail-grid">
      <label class="lbl">模板
        <select name="tpl">${sorted.map(t => `<option value="${t.id}" ${t === best ? 'selected' : ''}>${t.language === lang && t.scene === sceneFor(k) ? '⭐ ' : ''}${esc(K.sceneOf(t.scene).label)} · ${esc(K.langName(t.language))} · ${esc(t.name)}</option>`).join('')}</select>
      </label>
      ${K.nextStep(k).giveUp ? `<p class="warn">${esc(K.nextStep(k).text)}。<button type="button" class="link-btn" data-m="giveup">改成「暂不跟进」</button></p>` : ''}
      <p class="muted small">已按 TA 的语言（${esc(K.langName(lang) || '未填，默认英语')}）和「下一步：${esc(K.nextStep(k).text)}」推荐，⭐ 是最合适的。${k.touches ? `已触达 ${k.touches} 次。` : ''}</p>
      <label class="lbl">收件人<input name="to" type="email" value="${esc(k.email || '')}" placeholder="没有邮箱：可以先填上，或用复制" aria-label="收件人"></label>
      <label class="lbl">主题<input name="subject" maxlength="300"></label>
      <label class="lbl">正文<textarea name="body" rows="14"></textarea></label>
      <p class="warn" data-missing hidden></p>
      <div class="row wrap">
        <button type="button" class="btn sm ghost" data-m="copy-subject">复制主题</button>
        <button type="button" class="btn sm ghost" data-m="copy-body">复制正文</button>
        <button type="button" class="btn sm" data-m="mailto">用邮件 App 打开</button>
      </div>
      <div class="sent-box">
        <p><b>发出去之后</b>点这里记一笔：</p>
        <div class="row wrap">
          <label class="lbl inline">状态改为<select name="status">${K.cfg().statuses.map(s => `<option value="${s.key}" ${s.key === (k.status === 'todo' ? 'contacted' : k.status) ? 'selected' : ''}>${esc(s.label)}</option>`).join('')}</select></label>
          <label class="lbl inline">下次跟进<input name="next" type="date"></label>
          <button type="button" class="btn sm" data-m="sent">${cur?.queue ? '✓ 已发送，下一个' : '✓ 标记已发送'}</button>
        </div>
      </div>
    </div>`;
  }

  function replyHtml(k) {
    const langs = K.cfg().languages;
    return `<div class="mail-grid">
      <label class="lbl">把对方的回复粘贴到这里<textarea name="reply" rows="8" placeholder="Hi, thanks for reaching out…"></textarea></label>
      <div class="row wrap"><label class="lbl inline">收到日期<input name="rdate" type="date" value="${K.today()}"></label>
        <button type="button" class="btn sm" data-m="save-reply">保存回复</button>
        <span class="muted small">保存后会记一条「收到回复」，状态推进到「沟通中」（可撤销）。</span></div>
      <hr>
      <h4>让 Claude 帮忙写回复</h4>
      <p class="muted small">点按钮会把 TA 的资料、沟通历史、对方回复和你的意思拼成一段提示词复制好，粘贴到 Claude 桌面端就能得到回复草稿。</p>
      <label class="lbl inline">用什么语言回<select name="rlang">${langs.map(l => `<option value="${l.code}" ${l.code === (k.language || 'en') ? 'selected' : ''}>${esc(l.name)}</option>`).join('')}</select></label>
      <label class="lbl">你想表达的意思（中文就行）<textarea name="intent" rows="3" placeholder="例：报价太高，问能不能纯分成 15%；可以先寄样机"></textarea></label>
      <button type="button" class="btn sm" data-m="prompt">生成给 Claude 的提示词并复制</button>
    </div>`;
  }

  function fillFromTemplate() {
    const f = K.$('#mail-form'), t = K.state.templates.find(x => x.id === Number(f.tpl.value));
    if (!t || !cur) return;
    const v = varsFor(cur.k);
    const s = K.fillTemplate(t.subject, v), b = K.fillTemplate(t.body, v);
    f.subject.value = s.text; f.body.value = b.text;
    const missing = [...new Set([...s.missing, ...b.missing])];
    const w = f.querySelector('[data-missing]');
    w.hidden = !missing.length;
    w.textContent = missing.length ? `还有变量没填：${missing.map(x => VAR_LABEL[x]).join('、')}。可以直接在正文里改，或去「设置」填好默认值。` : '';
  }

  function setNextDefault() {
    const f = K.$('#mail-form'); if (!f?.next) return;
    f.next.value = K.addDays(K.today(), K.defaultFollowDays(f.status.value));
  }

  function draw() {
    const k = cur.k;
    K.$('#mail-title').textContent = `${cur.queue ? '逐个发信' : '邮件'} · ${k.name}`;
    K.$$('#mail [data-tab]').forEach(b => b.classList.toggle('on', b.dataset.tab === cur.tab));
    const qbar = cur.queue ? `<div class="qbar"><b>第 ${cur.qi + 1} / ${cur.queue.length} 个</b><span class="muted small">已发 ${cur.sent} · 跳过 ${cur.skipped}${k.email ? '' : ' · ⚠️ TA 没有邮箱，可以复制正文去私信'}</span><span class="grow"></span><button type="button" class="btn sm ghost" data-m="q-skip">跳过这个</button><button type="button" class="btn sm ghost" data-m="q-stop">结束</button></div>` : '';
    K.$('#mail-form').innerHTML = qbar + (cur.tab === 'reply' ? replyHtml(k)
      : K.state.templates.length ? composeHtml(k) : '<p class="empty-state">还没有模板，先去「邮件模板」里建一个。</p>');
    if (cur.tab === 'compose' && K.state.templates.length) { fillFromTemplate(); setNextDefault(); }
  }

  K.mail = {
    compose(k, tab = 'compose') {
      cur = { k, tab };
      draw();
      if (!dlg().open) dlg().showModal();
    },
    // 逐个发信：按顺序一个接一个写好邮件，点「已发送」自动跳到下一个
    queue(ids) {
      const list = ids.map(id => K.kol(id)).filter(Boolean);
      if (!list.length) return K.toast('这里没有要发邮件的 KOL', { error: true });
      cur = { k: list[0], tab: 'compose', queue: list.map(k => k.id), qi: 0, sent: 0, skipped: 0 };
      draw();
      if (!dlg().open) dlg().showModal();
    }
  };
  function nextInQueue(skipped) {
    if (skipped) cur.skipped++; else cur.sent++;
    while (++cur.qi < cur.queue.length) {
      const k = K.kol(cur.queue[cur.qi]);
      if (k) { cur.k = k; cur.tab = 'compose'; return draw(); }
    }
    const { sent, skipped: sk } = cur;
    dlg().close();
    K.toast(`这一轮发完了：发出 ${sent} 封${sk ? `，跳过 ${sk} 个` : ''}`, { timeout: 5000 });
  }

  async function historyOf(k) {
    if (!K.actCache[k.id]) {
      try { K.actCache[k.id] = (await K.api('GET', `/activities?kol_id=${k.id}`)).activities; } catch { K.actCache[k.id] = []; }
    }
    return [...K.actCache[k.id]].sort((a, b) => a.happened_at.localeCompare(b.happened_at) || a.id - b.id);
  }

  K.buildClaudePrompt = (k, history, reply, langCode, intent) => {
    const p = K.cfg().profile;
    const line = (label, v) => v == null || v === '' || (Array.isArray(v) && !v.length) ? '' : `- ${label}：${Array.isArray(v) ? v.join('、') : v}\n`;
    const hist = history.map(a => `- ${a.happened_at} ${K.actOf(a.type).label}：${a.summary || ''}${a.content && a.type !== 'reply_in' ? `\n  （内容）${a.content.slice(0, 800).replace(/\n/g, '\n  ')}` : ''}`).join('\n') || '（暂无记录）';
    const lang = K.langName(langCode) || langCode;
    return `你是我的海外 KOL 商务助理。请帮我写一封回复邮件。

【我是谁】
${p.my_name || '（署名未填）'}，${p.company || '（公司未填）'}，负责欧洲市场的 KOL 合作，推广产品：${p.product || '（产品未填）'}${p.product_link ? `（带货链接：${p.product_link}）` : ''}。

【对方资料】
${line('名称', k.name)}${line('账号', k.handle)}${line('平台', k.platform)}${line('主页', k.profile_url)}${line('国家', k.country ? K.countryName(k.country) : '')}${line('内容语言', K.langName(k.language))}${line('粉丝量', K.fmtInt(k.followers))}${line('平均播放', K.fmtInt(k.avg_views))}${line('品类', k.category)}${line('当前状态', K.statusOf(k.status).label)}${line('报价', k.quote != null ? K.eur(k.quote) : '')}${line('报价说明', k.quote_note)}${line('合作方式', k.coop_type)}${line('卡点', k.blocker)}${line('备注', k.notes)}
【沟通历史（从早到晚）】
${hist}

【对方最新回复】
"""
${reply || '（未粘贴）'}
"""

【我想表达的意思】
${intent || '（请根据上下文给出合适的回复）'}

【要求】
1. 用${lang}写，语气自然、专业、友好，符合欧洲创作者的沟通习惯，不要太像模板。
2. 给出邮件主题和正文，正文末尾用我的署名。
3. 不要承诺我没提到的价格、分成比例、日期或条件；需要我确认的地方用 [方括号] 标出来。
4. 如果涉及发布内容，提醒对方按所在国家的规定标注广告（如德国 Werbung、法国 Publicité）。
5. 最后用中文简要说明这封回复的要点，方便我核对。
`;
  };

  function bindDialog() {
    const d = dlg();
    d.addEventListener('click', async e => {
      if (e.target === d) return d.close();   // 点遮罩关闭
      const tab = e.target.closest('[data-tab]');
      if (tab) { cur.tab = tab.dataset.tab; return draw(); }
      if (e.target.closest('[data-mail-close]')) return d.close();
      const m = e.target.closest('[data-m]')?.dataset.m; if (!m || !cur) return;
      const f = K.$('#mail-form'), k = K.kol(cur.k.id) || cur.k;
      if (m === 'q-skip') return nextInQueue(true);
      if (m === 'q-stop') { d.close(); return K.toast(`已结束：发出 ${cur.sent} 封`); }
      if (m === 'giveup') {
        try { await K.updateKol(k.id, { status: 'paused', next_followup_at: null }); K.toast('已改成「暂不跟进」'); } catch { return; }
        return cur.queue ? nextInQueue(true) : d.close();
      }
      if (m === 'copy-subject') return K.copy(f.subject.value, '主题');
      if (m === 'copy-body') return K.copy(f.body.value, '正文');
      if (m === 'mailto') {
        const url = K.mailtoUrl(f.to.value.trim(), f.subject.value, f.body.value);
        if (url.length > MAILTO_LIMIT) K.toast('正文比较长，有的邮件 App 会截断。如果打开后内容不全，请改用「复制正文」。', { timeout: 7000 });
        const a = document.createElement('a'); a.href = url; a.rel = 'noopener'; document.body.append(a); a.click(); a.remove();
        return;
      }
      if (m === 'sent') {
        const btn = e.target.closest('button'); btn.disabled = true;
        try {
          await K.addActivity({ kol_id: k.id, type: 'email_out', summary: `发出邮件：${f.subject.value}`.slice(0, 500), content: f.body.value, happened_at: K.today() },
            { next_followup_at: f.next.value || null, status: f.status.value });
          K.toast(`已记录「发出邮件」，下次跟进：${f.next.value ? K.fmtDate(f.next.value) : '未设置'}`);
          if (cur.queue) nextInQueue(false); else d.close();
        } catch (err) { K.fail(err); btn.disabled = false; }
        return;
      }
      if (m === 'save-reply') {
        const text = f.reply.value.trim(); if (!text) return K.toast('先把对方的回复粘贴进来', { error: true });
        const prevStatus = k.status;
        const advance = ['todo', 'contacted'].includes(prevStatus);
        try {
          await K.addActivity({ kol_id: k.id, type: 'reply_in', summary: text.replace(/\s+/g, ' ').slice(0, 120), content: text, happened_at: f.rdate.value || K.today() },
            advance ? { status: 'talking' } : undefined);
          K.toast(advance ? '已保存回复，状态改为「沟通中」' : '已保存回复', advance ? {
            action: '撤销状态', timeout: 8000, onAction: () => K.updateKol(k.id, { status: prevStatus }).then(() => K.toast('状态已改回')).catch(() => {})
          } : {});
        } catch (err) { K.fail(err); }
        return;
      }
      if (m === 'prompt') {
        const history = await historyOf(k);
        return K.copy(K.buildClaudePrompt(k, history, f.reply.value.trim(), f.rlang.value, f.intent.value.trim()), '提示词，粘贴到 Claude 即可');
      }
    });
    d.addEventListener('change', e => {
      if (e.target.name === 'tpl') fillFromTemplate();
      if (e.target.name === 'status') setNextDefault();
    });
  }

  /* ================= 邮件模板视图 ================= */
  let editingId = null;
  K.renderTemplates = (view, el) => {
    const tpls = K.state.templates;
    const p = K.cfg().profile;
    if ((editingId == null || !tpls.some(x => x.id === editingId)) && tpls.length) {
      editingId = [...tpls].sort((a, b) => K.SCENES.findIndex(s => s.key === a.scene) - K.SCENES.findIndex(s => s.key === b.scene) || a.id - b.id)[0].id;
    }
    const t = tpls.find(x => x.id === editingId);
    const sample = K.state.kols[0] || { name: 'Alex', handle: '@alexsims', platform: 'YouTube', profile_url: 'https://www.youtube.com/@alexsims', quote: 300 };
    const groups = K.SCENES.map(s => {
      const items = tpls.filter(x => x.scene === s.key);
      return `<div class="tgroup"><h4>${esc(s.label)} <small class="muted">${items.length}</small></h4>
        ${items.map(x => `<button type="button" class="titem${x.id === editingId ? ' on' : ''}" data-tpl="${x.id}"><span class="lang">${esc(x.language)}</span>${esc(x.name)}</button>`).join('') || '<p class="muted small">还没有</p>'}</div>`;
    }).join('');
    el.innerHTML = `<div class="page tpl-page">
      <section class="card-box profile-box"><h3>模板变量的默认值</h3>
        <p class="muted small">写邮件时会自动填进 {{my_name}} {{company}} {{product}} {{product_link}}。</p>
        <form class="fgrid" data-profile>
          <label class="fld"><span class="fl">我的署名</span><input name="my_name" value="${esc(p.my_name)}" maxlength="60"></label>
          <label class="fld"><span class="fl">公司名</span><input name="company" value="${esc(p.company)}" maxlength="80"></label>
          <label class="fld"><span class="fl">产品名</span><input name="product" value="${esc(p.product)}" maxlength="80"></label>
          <label class="fld"><span class="fl">默认带货链接</span><input name="product_link" type="url" value="${esc(p.product_link)}" maxlength="300"></label>
          <div class="fld wide"><button class="btn sm">保存默认值</button></div>
        </form>
      </section>
      <div class="tpl-cols">
        <aside class="tpl-list"><button type="button" class="btn sm" data-tnew>＋ 新建模板</button>${groups}</aside>
        <section class="tpl-edit">${t ? `<form data-tform>
          <div class="fgrid">
            <label class="fld wide"><span class="fl">模板名</span><input name="name" value="${esc(t.name)}" maxlength="80" required></label>
            <label class="fld"><span class="fl">场景</span><select name="scene">${K.SCENES.map(s => `<option value="${s.key}" ${s.key === t.scene ? 'selected' : ''}>${esc(s.label)}</option>`).join('')}</select></label>
            <label class="fld"><span class="fl">语言</span><select name="language">${K.cfg().languages.map(l => `<option value="${l.code}" ${l.code === t.language ? 'selected' : ''}>${esc(l.name)}</option>`).join('')}</select></label>
            <label class="fld wide"><span class="fl">主题</span><input name="subject" value="${esc(t.subject || '')}" maxlength="300"></label>
            <div class="fld wide"><span class="fl">插入变量（点一下插到正文光标处）</span><div class="vars">${VARS.map(v => `<button type="button" class="tag var" data-var="${v}" title="${esc(VAR_LABEL[v])}">{{${v}}}</button>`).join('')}</div></div>
            <label class="fld wide"><span class="fl">正文</span><textarea name="body" rows="16">${esc(t.body || '')}</textarea></label>
          </div>
          <div class="row"><button class="btn sm">保存模板</button><button type="button" class="btn sm ghost" data-tdup>复制一份</button><span class="grow"></span><button type="button" class="btn sm ghost danger" data-tdel>删除</button></div>
        </form>
        <div class="preview"><h4>预览 <small class="muted">（用「${esc(sample.name)}」的资料填充）</small></h4>
          <p><b>${esc(K.fillTemplate(t.subject, varsFor(sample)).text)}</b></p><pre>${esc(K.fillTemplate(t.body, varsFor(sample)).text)}</pre></div>`
        : '<p class="empty-state">还没有模板，点「新建模板」。</p>'}</section>
      </div></div>`;
  };

  K.templateEvents = (main, getView) => {
    main.addEventListener('click', async e => {
      if (getView()?.kind !== 'templates') return;
      const item = e.target.closest('[data-tpl]');
      if (item) { editingId = Number(item.dataset.tpl); return K.render(true); }
      if (e.target.closest('[data-var]')) {
        const ta = main.querySelector('[data-tform] textarea[name=body]'), v = `{{${e.target.closest('[data-var]').dataset.var}}}`;
        const s = ta.selectionStart ?? ta.value.length;
        ta.value = ta.value.slice(0, s) + v + ta.value.slice(ta.selectionEnd ?? s);
        ta.focus(); ta.selectionStart = ta.selectionEnd = s + v.length;
        return;
      }
      if (e.target.closest('[data-tnew]') || e.target.closest('[data-tdup]')) {
        const src = e.target.closest('[data-tdup]') ? K.state.templates.find(x => x.id === editingId) : null;
        try {
          const { item: t } = await K.api('POST', '/templates', src ? { ...src, name: src.name + '（副本）' } : { name: '新模板', scene: 'outreach', language: 'en', subject: '', body: 'Hi {{name}},\n\n\n\nBest,\n{{my_name}}' });
          K.state.templates.push(t); editingId = t.id; K.render(true); K.toast('已新建模板');
        } catch (err) { K.fail(err); }
        return;
      }
      if (e.target.closest('[data-tdel]')) {
        const t = K.state.templates.find(x => x.id === editingId);
        await K.deferredDelete({ text: `删除模板「${t.name}」？`, label: t.name,
          removeLocal: () => { K.state.templates = K.state.templates.filter(x => x.id !== t.id); editingId = K.state.templates[0]?.id ?? null; },
          restoreLocal: () => { K.state.templates.push(t); editingId = t.id; },
          commit: () => K.api('DELETE', `/templates/${t.id}`) });
      }
    });
    main.addEventListener('submit', async e => {
      if (getView()?.kind !== 'templates') return;
      e.preventDefault();
      const f = e.target;
      if (f.matches('[data-profile]')) {
        const value = { my_name: f.my_name.value.trim(), company: f.company.value.trim(), product: f.product.value.trim(), product_link: f.product_link.value.trim() };
        try { await K.api('PUT', '/settings/profile', { value }); K.state.settings.profile = value; K.render(true); K.toast('已保存默认值'); } catch (err) { K.fail(err); }
      }
      if (f.matches('[data-tform]')) {
        const data = { name: f.name.value.trim(), scene: f.scene.value, language: f.language.value, subject: f.subject.value, body: f.body.value };
        try {
          const { item } = await K.api('PATCH', `/templates/${editingId}`, data);
          const i = K.state.templates.findIndex(x => x.id === item.id); K.state.templates[i] = item; K.render(true); K.toast('模板已保存');
        } catch (err) { K.fail(err); }
      }
    });
  };

  document.addEventListener('DOMContentLoaded', bindDialog);
})();
