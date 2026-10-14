/* 案例展厅脚本：数据来自 window.SHOWCASE；无内联事件，兼容严格 CSP。 */
(function () {
  var D = window.SHOWCASE, $ = function (id) { return document.getElementById(id); };
  var st = { c: 0, v: 0, ver: 'lowfi', k: null };
  var theCase = function () { return D.cases[st.c]; };
  var theView = function () { return theCase().views[st.v]; };
  var isDark = function () { return document.body.classList.contains('dark'); };
  var colorOf = function (c) { return (isDark() && c.dark) || c.color; };
  function el(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (m) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]; }); }

  function shownVersions() {
    var v = theView();
    if (v.kind === 'text') return [];
    if (v.kind !== 'page') return [{ id: 'board', label: '', src: v.src, hs: v.hs }];
    if (st.ver === 'compare' && v.versions.length > 1) return v.versions;
    var f = v.versions.filter(function (x) { return x.id === st.ver; })[0] || v.versions[0];
    return [f];
  }
  function keysInView() {
    var seen = [], out = [];
    shownVersions().forEach(function (x) { (x.hs || []).forEach(function (h) { if (seen.indexOf(h.k) < 0) { seen.push(h.k); out.push(h.k); } }); });
    var order = theView().order || [];
    out.sort(function (a, b) { var ia = order.indexOf(a), ib = order.indexOf(b); return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib); });
    return out;
  }
  var numOf = function (k) { return keysInView().indexOf(k) + 1; };

  function renderCases() {
    var box = $('cases'); box.innerHTML = '';
    D.cases.forEach(function (c, i) {
      var b = el('button', 'case' + (i === st.c ? ' on' : ''), '<span class="k">' + c.n + '</span><b>' + esc(c.name) + '</b><span class="tp">' + esc(c.topic) + '</span>');
      b.style.setProperty('--c', colorOf(c)); b.setAttribute('data-i', i);
      box.appendChild(b);
    });
    document.documentElement.style.setProperty('--ac', colorOf(theCase()));
    $('summary').textContent = theCase().line;
  }
  function renderViews() {
    var box = $('views'); box.innerHTML = '';
    theCase().views.forEach(function (v, i) {
      var b = el('button', 'chip' + (i === st.v ? ' on' : ''), esc(v.label)); b.setAttribute('data-i', i); box.appendChild(b);
    });
    var sbox = $('vers'); sbox.innerHTML = '';
    var v = theView();
    if (v.kind === 'page' && v.versions.length > 1) {
      v.versions.forEach(function (x) { var b = el('button', st.ver === x.id ? 'on' : '', esc(x.label)); b.setAttribute('data-v', x.id); sbox.appendChild(b); });
      var cb = el('button', st.ver === 'compare' ? 'on' : '', esc(v.cmpLabel || '对比')); cb.setAttribute('data-v', 'compare'); sbox.appendChild(cb);
      sbox.style.display = '';
    } else sbox.style.display = 'none';
  }
  function hsHtml(hs) {
    return (hs || []).map(function (h) {
      var n = numOf(h.k), nt = D.notes[theCase().key + '.' + h.k] || {};
      return '<button class="hs' + (h.b[3] < 14 ? ' sm' : '') + '" data-k="' + h.k + '" title="' + esc(nt.t || '') + '" style="left:' + h.b[0] + '%;top:' + h.b[1] + '%;width:' + h.b[2] + '%;height:' + h.b[3] + '%"><span class="n">' + n + '</span></button>';
    }).join('');
  }
  function cardHtml(c) {
    var h = '<div class="tc">' + (c.tag ? '<span class="tag">' + esc(c.tag) + '</span>' : '') + '<h4>' + esc(c.t) + '</h4>';
    (c.b || []).forEach(function (p) { h += '<p>' + esc(p) + '</p>'; });
    if (c.list) h += '<ul>' + c.list.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>';
    if (c.rows) {
      h += '<table>' + (c.head ? '<tr>' + c.head.map(function (x) { return '<th>' + esc(x) + '</th>'; }).join('') + '</tr>' : '') +
        c.rows.map(function (r) { return '<tr>' + r.map(function (x) { return '<td>' + esc(x) + '</td>'; }).join('') + '</tr>'; }).join('') + '</table>';
    }
    return h + '</div>';
  }
  function renderBody() {
    var body = $('vbody'), v = theView(), vs = shownVersions(); body.innerHTML = '';
    var lay = document.querySelector('.layout');
    lay.classList.toggle('single', v.kind === 'text');
    lay.classList.toggle('wide', !!v.wide);
    if (v.kind === 'text') {
      var g = el('div', 'cards'); g.innerHTML = v.cards.map(cardHtml).join(''); body.appendChild(g);
      $('vcap').textContent = v.desc || ''; return;
    }
    var cmp = vs.length > 1;
    vs.forEach(function (x) {
      var col = el('div', 'col');
      if (cmp) col.appendChild(el('div', 'lab', esc(x.label)));
      if (v.kind === 'page') {
        var ph = el('div', 'phone'); ph.style.setProperty('--pw', (cmp ? 300 : (v.pw || 340)) + 'px');
        var sc = el('div', 'scroller'); sc.setAttribute('data-ver', x.id);
        sc.innerHTML = '<div class="imgwrap"><img src="' + x.src + '" alt="' + esc(v.label + ' ' + x.label) + '">' + hsHtml(x.hs) + '</div>';
        ph.appendChild(sc); col.appendChild(ph);
      } else {
        var bx = el('div', 'boardbox' + (v.full ? ' full' : '')); bx.style.maxWidth = (v.bw || 920) + 'px';
        bx.innerHTML = '<div class="imgwrap"><img src="' + x.src + '" alt="' + esc(v.label) + '">' + hsHtml(x.hs) + '</div>';
        col.appendChild(bx);
      }
      body.appendChild(col);
    });
    if (v.side && v.side.length) {
      var tcol = el('div', 'tipscol' + (cmp ? ' narrow' : ''));
      tcol.innerHTML = '<div class="tips-h">要点与经验 <span>' + v.side.length + '</span></div><div class="tips-cards">' + v.side.map(cardHtml).join('') + '</div>';
      body.appendChild(tcol);
    }
    body.classList.toggle('has-tips', !!(v.side && v.side.length));
    body.classList.toggle('is-board', v.kind === 'board');
    if (cmp) {  /* 对比：两侧按比例同步滚动 */
      var scs = body.querySelectorAll('.scroller'), lock = false;
      [].forEach.call(scs, function (s, i) {
        s.addEventListener('scroll', function () {
          if (lock || Date.now() < (window.__nosync || 0)) return; lock = true;
          var r = s.scrollTop / Math.max(1, s.scrollHeight - s.clientHeight);
          [].forEach.call(scs, function (o, j) { if (j !== i) { o.style.scrollBehavior = 'auto'; o.scrollTop = r * (o.scrollHeight - o.clientHeight); } });
          requestAnimationFrame(function () { lock = false; [].forEach.call(scs, function (o) { o.style.scrollBehavior = ''; }); });
        });
      });
    }
    $('vcap').textContent = v.desc || '';
  }
  function renderPanel() {
    var keys = keysInView(), c = theCase(), v = theView();
    document.querySelector('.panel').style.display = (keys.length && !v.wide) ? '' : 'none';
    if (v.kind === 'text') { $('phead').innerHTML = ''; $('plist').innerHTML = ''; $('pdetail').innerHTML = ''; return; }
    $('phead').innerHTML = '<b>' + esc(v.label) + ' · 设计备注</b><span>点击图上的编号，或下方列表，查看对应说明</span>';
    var box = $('plist'); box.innerHTML = '';
    keys.forEach(function (k, i) {
      var nt = D.notes[c.key + '.' + k] || {};
      var b = el('button', k === st.k ? 'on' : '', '<span class="n">' + (i + 1) + '</span><span>' + esc(nt.t || k) + '</span>');
      var li = el('li'); b.setAttribute('data-k', k); li.appendChild(b); box.appendChild(li);
    });
    if (keys.indexOf(st.k) < 0) st.k = keys[0] || null;
    renderDetail();
  }
  function renderDetail() {
    var c = theCase(), d = $('pdetail');
    [].forEach.call(document.querySelectorAll('.hs'), function (h) { h.classList.toggle('on', h.getAttribute('data-k') === st.k && (!theView().wide || !!window.__popOn)); });
    [].forEach.call(document.querySelectorAll('.plist button'), function (b) { b.classList.toggle('on', b.getAttribute('data-k') === st.k); });
    var nt = st.k ? D.notes[c.key + '.' + st.k] : null;
    if (!nt) { d.innerHTML = '<div class="empty">本页为整体图，无逐项备注。</div>'; return; }
    var html = '<span class="tag">' + esc(nt.tag || '说明') + '</span><h3>' + esc(nt.t) + '</h3>' +
      nt.b.map(function (p) { return '<p>' + esc(p) + '</p>'; }).join('');
    shownVersions().forEach(function (x) { if (nt.v && nt.v[x.id]) html += '<div class="vv"><em>' + (x.label || '') + '</em>' + esc(nt.v[x.id]) + '</div>'; });
    if (nt.go) html += '<div class="go">' + nt.go.map(function (g) { return '<a href="#' + g[1] + '">' + esc(g[0]) + ' →</a>'; }).join('') + '</div>';
    d.innerHTML = html; play(d, 'swap');
    /* 整宽视图（流程图）：在节点旁直接弹出说明卡，不必往下滚 */
    [].forEach.call(document.querySelectorAll('.pop'), function (p) { p.remove(); });
    if (theView().wide && window.__popOn) {
      var hsEl = document.querySelector('.hs[data-k="' + st.k + '"]');
      if (hsEl) {
        var pop = el('div', 'pop', '<button class="pop-x" aria-label="关闭">✕</button>' + html), L = parseFloat(hsEl.style.left), T = parseFloat(hsEl.style.top), H = parseFloat(hsEl.style.height), W = parseFloat(hsEl.style.width);
        if (L > 55) pop.style.right = (100 - L - W) + '%'; else pop.style.left = L + '%';
        if (T > 50) pop.style.bottom = (100 - T + 1.5) + '%'; else pop.style.top = (T + H + 1.5) + '%';
        hsEl.parentNode.appendChild(pop);
      }
    }
  }
  function select(k, scroll) {
    st.k = k; renderDetail(); if (scroll) window.__nosync = Date.now() + 900;
    if (scroll) [].forEach.call(document.querySelectorAll('.imgwrap'), function (w) {
      var h = w.querySelector('.hs[data-k="' + k + '"]'); if (!h) return;
      var sc = w.parentNode, im = w.querySelector('img');
      var run = function () { if (sc.classList.contains('scroller') || sc.classList.contains('boardbox')) sc.scrollTo({ top: Math.max(0, h.offsetTop - sc.clientHeight * 0.12), behavior: window.__first ? 'auto' : 'smooth' }); setTimeout(function () { window.__first = false; }, 300); };
      var later = function () { requestAnimationFrame(function () { requestAnimationFrame(run); }); };
      if (im.complete && im.naturalHeight && im.offsetHeight) later(); else im.addEventListener('load', later, { once: true });
    });
  }
  function hash() {
    var c = theCase(), v = theView();
    history.replaceState(null, '', '#' + c.key + '/' + v.id + (v.kind === 'page' ? '/' + st.ver : '') + (st.k && v.kind !== 'text' ? '/' + st.k : ''));
  }
  function defVer() { var v = theView(); return v.kind === 'page' ? v.versions[0].id : 'lowfi'; }
  function play(elm, cls) { if (!elm) return; elm.classList.remove(cls); void elm.offsetWidth; elm.classList.add(cls); }
  function animBody() { play($('vbody'), 'enter'); play(document.querySelector('.panel'), 'enter'); }
  function full(scroll) { renderCases(); renderViews(); renderBody(); renderPanel(); animBody(); play($('summary'), 'enter'); if (scroll && st.k) select(st.k, true); hash(); }
  function setCase(i) { window.__popOn = false; st.c = i; st.v = 0; st.k = null; st.ver = defVer(); full(); }
  function setView(i) { st.v = i; st.k = null; st.ver = defVer(); full(); }
  function setVer(x) { st.ver = x; renderViews(); renderBody(); renderPanel(); animBody(); hash(); if (st.k) select(st.k, true); }
  function fromHash() {
    var p = location.hash.replace('#', '').split('/'); if (!p[0]) return false;
    var ci = D.cases.map(function (c) { return c.key; }).indexOf(p[0]); if (ci < 0) return false;
    st.c = ci; st.v = 0;
    if (p[1]) { var vi = theCase().views.map(function (v) { return v.id; }).indexOf(p[1]); if (vi >= 0) st.v = vi; }
    var v = theView(); st.ver = defVer();
    if (v.kind === 'page' && p[2] && (p[2] === 'compare' || v.versions.some(function (x) { return x.id === p[2]; }))) st.ver = p[2];
    st.k = (v.kind === 'page' ? p[3] : p[2]) || null; return true;
  }

  document.addEventListener('click', function (e) {
    var a = e.target.closest('.go a'); if (a) return;   /* 备注内的跳转链接走 hashchange */
    if (e.target.closest('.pop-x')) { e.target.closest('.pop').remove(); return; }
    if (e.target.closest('.pop')) return;
    var t = e.target.closest('button'); if (!t) return;
    if (t.parentNode.id === 'cases') setCase(+t.getAttribute('data-i'));
    else if (t.parentNode.id === 'views') setView(+t.getAttribute('data-i'));
    else if (t.parentNode.id === 'vers') setVer(t.getAttribute('data-v'));
    else if (t.classList.contains('hs')) { window.__popOn = true; select(t.getAttribute('data-k'), false); hash(); }
    else if (t.closest('#plist')) { select(t.getAttribute('data-k'), true); hash(); }
  });
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp' && e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    var keys = keysInView(); if (!keys.length) return;
    var i = keys.indexOf(st.k), d = (e.key === 'ArrowDown' || e.key === 'ArrowRight') ? 1 : -1;
    if (e.target.closest && e.target.closest('.scroller') && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) return;
    e.preventDefault(); select(keys[(i + d + keys.length) % keys.length], true); hash();
  });
  window.addEventListener('hashchange', function () { if (fromHash()) full(true); });
  window.__first = true; fromHash(); full(!!st.k);
  requestAnimationFrame(function () { document.body.classList.add('ready'); setTimeout(function () { document.body.classList.add('settled'); }, 1200); });
})();
