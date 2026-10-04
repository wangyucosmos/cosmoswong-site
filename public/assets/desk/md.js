/* 我的工作台 · Markdown 渲染（v4）：把知识库笔记画成好看的页面。不引第三方库；先整体转义，再按语法生成标签，
   笔记里写的 HTML 一律当文字显示（不会执行）。支持：开头的 frontmatter、标题、段落、列表（多级、任务框）、引用（含 Obsidian 提示块）、
   代码块、表格、分隔线、行内代码 / 加粗 / 斜体 / 删除线 / 高亮、链接、[[双链]]、file:// 链接（变成「复制路径」）。 */
(() => {
  const D = window.DESK;
  const esc = D.esc;
  const slug = s => String(s).trim().toLowerCase().replace(/[\s]+/g, '-').replace(/[^\p{L}\p{N}_-]/gu, '').slice(0, 60);

  function inline(raw, ctx) {
    const codes = [];
    let s = esc(raw).replace(/`([^`]+)`/g, (_, c) => { codes.push(c); return `\u0000${codes.length - 1}\u0000`; });
    // [[笔记名#标题|显示文字]]
    s = s.replace(/\[\[([^\]|#]*)(#[^\]|]*)?(?:\|([^\]]+))?\]\]/g, (_, name, hash, alias) => {
      const label = alias || (name ? name + (hash || '') : (hash || '').slice(1));
      return `<button type="button" class="wikilink" data-wiki="${name}" data-wiki-hash="${(hash || '').slice(1)}">${label}</button>`;
    });
    // ![图](地址)：只显示说明，不加载（避免外部请求）
    s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)[^)]*\)/g, (_, alt) => `<span class="md-img">${D.icon('image', 'sm')} ${alt || '图片'}</span>`);
    // [文字](地址)
    s = s.replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+&quot;[^&]*&quot;)?\)/g, (_, text, href) => {
      const h = href.replace(/&amp;/g, '&');
      if (/^file:\/\//i.test(h)) { let p = h.slice(7); try { p = decodeURIComponent(p); } catch { /* 保持原样 */ } return `<button type="button" class="md-file" data-copy-path="${esc(p)}" title="点一下复制路径">${D.icon('file', 'sm')}${text}</button>`; }
      if (/^#/.test(h)) return `<a href="#" data-md-anchor="${esc(slug(decodeURIComponentSafe(h.slice(1))))}">${text}</a>`;
      const u = D.safeUrl(h);
      if (u) return `<a href="${esc(u)}" target="_blank" rel="noopener noreferrer">${text}</a>`;
      return `<span class="md-rel" title="${esc(h)}">${text}</span>`;
    });
    // 裸网址
    s = s.replace(/(^|[\s（(：:])(https?:\/\/[^\s<）)]+)/g, (_, pre, u) => { const ok = D.safeUrl(u.replace(/&amp;/g, '&')); return ok ? `${pre}<a href="${esc(ok)}" target="_blank" rel="noopener noreferrer">${u}</a>` : _; });
    s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/__([^_]+)__/g, '<strong>$1</strong>')
      .replace(/(^|[^*\w])\*([^*\s][^*]*?)\*(?!\*)/g, '$1<em>$2</em>')
      .replace(/~~([^~]+)~~/g, '<del>$1</del>').replace(/==([^=]+)==/g, '<mark>$1</mark>');
    if (ctx?.q) s = highlight(s, ctx.q);
    return s.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${codes[i]}</code>`);
  }
  function decodeURIComponentSafe(x) { try { return decodeURIComponent(x); } catch { return x; } }
  // 搜索词高亮（只动标签外的文字）
  function highlight(html, q) {
    const words = q.split(/\s+/).filter(Boolean).map(w => esc(w).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    if (!words.length) return html;
    const re = new RegExp(`(${words.join('|')})`, 'gi');
    return html.split(/(<[^>]+>)/).map(p => p.startsWith('<') ? p : p.replace(re, '<mark class="hit">$1</mark>')).join('');
  }

  const CALLOUT = { note: '提示', info: '说明', tip: '小技巧', warning: '注意', danger: '危险', important: '重要', success: '完成', question: '问题', quote: '引用', example: '例子' };
  D.md = (src, ctx = {}) => {
    let text = String(src || '').replace(/\r\n?/g, '\n');
    let meta = null;
    const fm = text.match(/^---\n([\s\S]*?)\n---\n?/);
    if (fm) { meta = {}; for (const l of fm[1].split('\n')) { const m = l.match(/^([\w-]+):\s*(.*)$/); if (m) meta[m[1]] = m[2].replace(/^\[|\]$/g, '').trim(); } text = text.slice(fm[0].length); }
    const lines = text.split('\n'), out = [], toc = [];
    let i = 0;
    const isTableSep = l => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(l);
    const cells = l => l.trim().replace(/^\||\|$/g, '').split(/(?<!\\)\|/).map(c => c.trim());
    const listRe = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/;
    while (i < lines.length) {
      const l = lines[i];
      if (/^\s*$/.test(l)) { i++; continue; }
      let m;
      if ((m = l.match(/^(```+|~~~+)\s*([\w+-]*)/))) {   // 代码块
        const fence = m[1], lang = m[2], buf = []; i++;
        while (i < lines.length && !lines[i].startsWith(fence)) buf.push(lines[i++]);
        i++;
        out.push(`<pre class="md-code"${lang ? ` data-lang="${esc(lang)}"` : ''}><code>${esc(buf.join('\n'))}</code></pre>`);
        continue;
      }
      if ((m = l.match(/^(#{1,6})\s+(.*?)\s*#*$/))) {   // 标题
        const lv = m[1].length, id = slug(m[2]);
        toc.push({ lv, text: m[2].replace(/[*`[\]]/g, ''), id });
        out.push(`<h${lv} id="h-${esc(id)}">${inline(m[2], ctx)}</h${lv}>`); i++; continue;
      }
      if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(l)) { out.push('<hr>'); i++; continue; }
      if (/^\s*>/.test(l)) {   // 引用 / 提示块
        const buf = [];
        while (i < lines.length && /^\s*>/.test(lines[i])) buf.push(lines[i++].replace(/^\s*>\s?/, ''));
        const c = buf[0]?.match(/^\[!(\w+)\][+-]?\s*(.*)$/);
        if (c) { const k = c[1].toLowerCase(); out.push(`<div class="callout c-${esc(k)}"><div class="ct-t">${D.icon(k === 'warning' || k === 'danger' ? 'flag' : 'sparkle', 'sm')}${inline(c[2] || CALLOUT[k] || c[1], ctx)}</div>${D.md(buf.slice(1).join('\n'), ctx).html}</div>`); }
        else out.push(`<blockquote>${D.md(buf.join('\n'), ctx).html}</blockquote>`);
        continue;
      }
      if (l.includes('|') && i + 1 < lines.length && isTableSep(lines[i + 1])) {   // 表格
        const head = cells(l); i += 2; const rows = [];
        while (i < lines.length && lines[i].includes('|') && !/^\s*$/.test(lines[i])) rows.push(cells(lines[i++]));
        out.push(`<div class="md-table"><table><thead><tr>${head.map(h => `<th>${inline(h, ctx)}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${head.map((_, k) => `<td>${inline(r[k] || '', ctx)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`);
        continue;
      }
      if (listRe.test(l)) {   // 列表（按缩进分层）
        const items = [];
        while (i < lines.length && (listRe.test(lines[i]) || (/^\s{2,}\S/.test(lines[i]) && items.length))) {
          const lm = lines[i].match(listRe);
          if (lm) items.push({ ind: lm[1].replace(/\t/g, '    ').length, ord: /\d/.test(lm[2]), start: parseInt(lm[2], 10), text: lm[3] });
          else items[items.length - 1].text += '\n' + lines[i].trim();
          i++;
        }
        out.push(renderList(items, 0, ctx).html);
        continue;
      }
      const buf = [];   // 段落：连续的行，单个换行当换行显示（和 Obsidian 一样）
      while (i < lines.length && !/^\s*$/.test(lines[i]) && !/^(#{1,6}\s|```|~~~|\s*>|\s*([-*_])(\s*\2){2,}\s*$)/.test(lines[i]) && !listRe.test(lines[i]) && !(lines[i].includes('|') && i + 1 < lines.length && isTableSep(lines[i + 1]))) buf.push(lines[i++]);
      if (!buf.length) { out.push(`<p>${inline(lines[i++], ctx)}</p>`); continue; }
      out.push(`<p>${buf.map(b => inline(b, ctx)).join('<br>')}</p>`);
    }
    return { html: out.join('\n'), meta, toc };
  };
  function renderList(items, from, ctx) {
    const base = items[from].ind, ord = items[from].ord;
    let html = ord && items[from].start > 1 ? `<ol start="${items[from].start}">` : ord ? '<ol>' : '<ul>', k = from;
    while (k < items.length && items[k].ind >= base) {
      if (items[k].ind > base) { const sub = renderList(items, k, ctx); html = html.replace(/<\/li>$/, sub.html + '</li>'); k = sub.next; continue; }
      const t = items[k].text, task = t.match(/^\[([ xX])\]\s+(.*)$/s);
      html += task ? `<li class="task${task[1] !== ' ' ? ' done' : ''}"><span class="tbx">${task[1] !== ' ' ? D.icon('check', 'sm') : ''}</span>${inline(task[2], ctx).replace(/\n/g, '<br>')}</li>`
        : `<li>${t.split('\n').map(x => inline(x, ctx)).join('<br>')}</li>`;
      k++;
    }
    return { html: html + (ord ? '</ol>' : '</ul>'), next: k };
  }
  D.mdSlug = slug;
  D.mdHighlight = highlight;
})();
