// 工具地图（/toolmap）：页面只是外壳，内容从 /api/toolmap?v=claude|codex 读取（工具箱口令门，数据在 KV，不进仓库）。
// 所有内容一律走 textContent；正文里用反引号包起来的片段显示成 <code>（同样是纯文字）。
// localStorage 只存界面偏好：toolmap.theme / toolmap.tab / toolmap.flow.<版本> / toolmap.filter.<版本>
(function () {
  'use strict';
  var NS = 'http://www.w3.org/2000/svg';
  var W = 150, H = 52;
  var VERSIONS = { claude: 'Claude 版', codex: 'Codex 版' };
  var root = document.getElementById('root');
  var cache = {};
  var cur = 'claude';
  var timer = null;
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function load(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function save(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* 存不了就算了 */ } }

  // h('div', {className: 'x', onclick: fn}, [子节点 / 字符串])
  function h(tag, attrs, kids) {
    var e = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      var v = attrs[k];
      if (v == null || v === false) return;
      if (k === 'className') e.className = v;
      else if (k === 'text') e.textContent = v;
      else if (k.slice(0, 2) === 'on') e.addEventListener(k.slice(2), v);
      else e.setAttribute(k, v === true ? '' : v);
    });
    (kids || []).forEach(function (c) { if (c != null) e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return e;
  }
  function s(tag, attrs, parent) {
    var e = document.createElementNS(NS, tag);
    Object.keys(attrs).forEach(function (k) { e.setAttribute(k, attrs[k]); });
    if (parent) parent.appendChild(e);
    return e;
  }
  // 文字里的 `片段` → <code>
  function rich(tag, text, attrs) {
    var e = h(tag, attrs);
    String(text == null ? '' : text).split('`').forEach(function (part, i) {
      if (!part) return;
      e.appendChild(i % 2 ? h('code', { text: part }) : document.createTextNode(part));
    });
    return e;
  }
  function str(v) { return v == null ? '' : String(v); }
  function arr(v) { return Array.isArray(v) ? v : []; }
  function secHead(d) {
    return h('div', { className: 'sec-head' }, [
      d.eyebrow ? h('span', { className: 'eyebrow', text: d.eyebrow }) : null,
      d.title ? h('h2', { text: d.title }) : null,
      d.desc ? rich('p', d.desc) : null
    ]);
  }
  function stop() { if (timer) { clearInterval(timer); timer = null; } }

  /* ===== 主题：自动 → 浅色 → 深色 ===== */
  var themeBtn = document.getElementById('themeBtn');
  var THEMES = ['auto', 'light', 'dark'], THEME_NAME = { auto: '自动', light: '浅色', dark: '深色' };
  function applyTheme(t) {
    if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t);
    else document.documentElement.removeAttribute('data-theme');
    themeBtn.textContent = '主题：' + THEME_NAME[t];
  }
  var theme = load('toolmap.theme');
  if (THEMES.indexOf(theme) < 0) theme = 'auto';
  applyTheme(theme);
  themeBtn.addEventListener('click', function () {
    theme = THEMES[(THEMES.indexOf(theme) + 1) % THEMES.length];
    save('toolmap.theme', theme);
    applyTheme(theme);
  });

  /* ===== 版本标签 ===== */
  var tabs = Array.prototype.slice.call(document.querySelectorAll('.tab'));
  tabs.forEach(function (b) {
    b.addEventListener('click', function () { show(b.getAttribute('data-v')); });
    b.addEventListener('keydown', function (ev) {
      if (ev.key !== 'ArrowLeft' && ev.key !== 'ArrowRight') return;
      var i = (tabs.indexOf(b) + (ev.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length;
      tabs[i].focus(); show(tabs[i].getAttribute('data-v'));
    });
  });

  function show(v) {
    if (!VERSIONS[v]) v = 'claude';
    cur = v;
    stop();
    save('toolmap.tab', v);
    if (location.hash !== '#' + v) history.replaceState(null, '', '#' + v);
    tabs.forEach(function (b) {
      var on = b.getAttribute('data-v') === v;
      b.setAttribute('aria-selected', on ? 'true' : 'false');
      b.tabIndex = on ? 0 : -1;
    });
    if (cache[v]) return render(v, cache[v]);
    root.replaceChildren(h('p', { className: 'muted state', text: '正在读取…' }));
    fetch('/api/toolmap?v=' + v, { credentials: 'same-origin', headers: { accept: 'application/json' } })
      .then(function (r) {
        if (r.status === 401) { location.href = '/unlock?next=toolmap'; throw new Error('需要口令'); }
        if (!r.ok) throw new Error('读取失败（' + r.status + '）');
        return r.json();
      })
      .then(function (d) { cache[v] = d; if (cur === v) render(v, d); })
      .catch(function (e) {
        if (cur !== v) return;
        root.replaceChildren(h('div', { className: 'empty' }, [
          h('h2', { text: '没读到内容' }),
          h('p', { className: 'muted', text: e.message || '网络出错' }),
          h('button', { className: 'btn', type: 'button', text: '重试', onclick: function () { show(v); } })
        ]));
      });
  }

  function render(v, d) {
    if (!d || d.empty) {
      document.title = '工具地图 · ' + VERSIONS[v];
      root.replaceChildren(h('div', { className: 'empty' }, [
        h('h2', { text: VERSIONS[v] + '待添加' }),
        h('p', { className: 'muted', text: '这一版还没有上传内容。' })
      ]));
      return;
    }
    document.title = (d.title || '工具地图') + ' · ' + VERSIONS[v];
    var out = [h('header', { className: 'hd' }, [
      (d.badge || d.badgeNote) ? h('span', { className: 'ver' }, [d.badge ? h('b', { text: d.badge }) : null, str(d.badgeNote)]) : null,
      h('h1', { text: d.title || '工具地图' }),
      d.lede ? rich('p', d.lede, { className: 'lede' }) : null
    ])];
    if (d.map) out.push(renderMap(v, d.map));
    if (d.roles) out.push(renderRoles(d.roles));
    if (d.places) out.push(renderPlaces(d.places));
    if (d.board) out.push(renderBoard(v, d.board));
    if (d.mess) out.push(renderMess(d.mess));
    if (arr(d.footer).length) out.push(h('footer', null, d.footer.map(function (t) { return rich('span', t); })));
    root.replaceChildren.apply(root, out);
  }

  /* ===== 一 · 交互地图 ===== */
  function renderMap(v, M) {
    var rows = arr(M.rows), N = M.nodes || {}, E = arr(M.edges), TYPE = M.types || {}, INFO = M.info || {};
    var FLOWS = arr(M.flows).filter(function (f) { return f && arr(f.steps).length; });
    var maxY = rows.reduce(function (m, r) { return Math.max(m, +r.y || 0); }, 0);
    var svg = s('svg', { viewBox: '0 0 1000 ' + (maxY + 78), role: 'img', 'aria-label': M.title || '分层地图' });
    var flowsEl = h('div', { className: 'flows', role: 'group', 'aria-label': '选择流程' });
    var stepcard = h('div', { className: 'card', 'aria-live': 'polite' });
    var nodecard = h('div', { className: 'card' });
    function pos(id) { var n = N[id]; return { x: +n.x, y: +(rows[n.r] || {}).y }; }

    rows.forEach(function (r) {
      s('rect', { x: 4, y: r.y - H / 2 - 10, width: 992, height: H + 20, rx: 10, class: 'rowband' }, svg);
      s('text', { x: 14, y: r.y - H / 2 - 4, class: 'rowlbl' }, svg).textContent = str(r.label);
    });
    var gE = s('g', {}, svg), gN = s('g', {}, svg), edgeEls = {}, nodeEls = {};
    E = E.filter(function (e) { return Array.isArray(e) && N[e[0]] && N[e[1]]; });
    E.forEach(function (e) {
      var a = pos(e[0]), b = pos(e[1]), dd;
      var y1 = a.y + H / 2, y2 = b.y - H / 2;
      if (b.y < a.y) { y1 = a.y - H / 2; y2 = b.y + H / 2; }
      if (a.y === b.y) dd = 'M' + a.x + ' ' + a.y + ' L' + b.x + ' ' + b.y;
      else { var my = (y1 + y2) / 2; dd = 'M' + a.x + ' ' + y1 + ' C' + a.x + ' ' + my + ' ' + b.x + ' ' + my + ' ' + b.x + ' ' + y2; }
      edgeEls[e[0] + '>' + e[1]] = s('path', { d: dd, class: 'edge' + (e[2] === 'pending' ? ' pending' : '') }, gE);
    });
    Object.keys(N).forEach(function (id) {
      var n = N[id], p = pos(id);
      var g = s('g', { class: 'node n-' + str(n.c).replace(/[^a-z]/g, ''), tabindex: '0', role: 'button', 'aria-label': str(n.t) + '，' + str(n.s) }, gN);
      s('rect', { x: p.x - W / 2, y: p.y - H / 2, width: W, height: H, rx: 9 }, g);
      s('text', { x: p.x, y: p.y - 4, 'text-anchor': 'middle' }, g).textContent = str(n.t);
      s('text', { x: p.x, y: p.y + 14, 'text-anchor': 'middle', class: 'sub' }, g).textContent = str(n.s);
      if (n.badge) s('circle', { cx: p.x + W / 2 - 8, cy: p.y - H / 2 + 8, r: 5, class: 'badge' }, g);
      g.addEventListener('click', function (ev) { ev.stopPropagation(); selectNode(id); });
      g.addEventListener('keydown', function (ev) { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); selectNode(id); } });
      nodeEls[id] = g;
    });

    var flowIdx = 0, stepIdx = 0, selId = null;
    var saved = load('toolmap.flow.' + v);
    FLOWS.forEach(function (f, i) { if (f.id === saved) flowIdx = i; });

    function clearMarks() {
      Object.keys(edgeEls).forEach(function (k) { edgeEls[k].classList.remove('on', 'flow'); });
      Object.keys(nodeEls).forEach(function (k) { nodeEls[k].classList.remove('on', 'sel'); });
    }
    function edgeKey(a, b) { return edgeEls[a + '>' + b] ? a + '>' + b : (edgeEls[b + '>' + a] ? b + '>' + a : null); }
    function mark(id) { if (nodeEls[id]) nodeEls[id].classList.add('on'); }
    function paint() {
      clearMarks();
      svg.classList.add('dim');
      if (selId) {
        nodeEls[selId].classList.add('sel', 'on');
        E.forEach(function (e) { if (e[0] === selId || e[1] === selId) { edgeEls[e[0] + '>' + e[1]].classList.add('on'); mark(e[0]); mark(e[1]); } });
        return;
      }
      if (!FLOWS.length) { svg.classList.remove('dim'); return; }
      var st = FLOWS[flowIdx].steps[stepIdx];
      arr(st.n).forEach(mark);
      arr(st.e).forEach(function (p) { var k = edgeKey(p[0], p[1]); if (k) edgeEls[k].classList.add('on', 'flow'); });
    }
    function renderStep() {
      if (!FLOWS.length) { stepcard.replaceChildren(h('p', { className: 'muted small', text: '这一版没有流程。点地图上任意一块看详情。' })); return; }
      var f = FLOWS[flowIdx], st = f.steps[stepIdx], n = f.steps.length;
      var dots = h('div', { className: 'dots', role: 'group', 'aria-label': '跳到步骤' });
      f.steps.forEach(function (_, i) {
        dots.appendChild(h('button', {
          type: 'button', className: 'dot' + (i === stepIdx ? ' cur' : (i < stepIdx ? ' past' : '')), text: String(i + 1),
          'aria-label': '第 ' + (i + 1) + ' 步', 'aria-current': i === stepIdx ? 'step' : null,
          onclick: function () { stop(); go(i); }
        }));
      });
      stepcard.replaceChildren(
        h('span', { className: 'stepnum', text: str(f.name) + ' · 第 ' + (stepIdx + 1) + ' / ' + n + ' 步' }),
        h('h3', { text: str(st.t) }),
        rich('p', st.d, { className: 'steptxt' }),
        st.say ? h('div', { className: 'say', text: '你说：「' + st.say + '」' }) : '',
        st.loop ? h('p', { className: 'loopnote', text: '↻ 转回起点：这就是一圈闭环。按「重来」再看一遍，或换一条流程。' }) : '',
        dots,
        h('div', { className: 'ctrls' }, [
          h('button', { className: 'btn', type: 'button', text: '上一步', disabled: stepIdx === 0, onclick: function () { stop(); go(stepIdx - 1); } }),
          h('button', { className: 'btn primary', type: 'button', text: stepIdx === n - 1 ? '重来' : '下一步', onclick: function () { stop(); go(stepIdx === n - 1 ? 0 : stepIdx + 1); } }),
          h('button', { className: 'btn', type: 'button', text: timer ? '暂停' : '自动播放', onclick: function () { if (timer) { stop(); renderStep(); } else play(); } })
        ])
      );
    }
    function go(i) {
      if (!FLOWS.length) return;
      var n = FLOWS[flowIdx].steps.length;
      stepIdx = Math.max(0, Math.min(n - 1, i)); selId = null;
      renderStep(); paint(); renderNode(null);
    }
    function play() {
      selId = null;
      if (stepIdx === FLOWS[flowIdx].steps.length - 1) stepIdx = 0;
      timer = setInterval(function () {
        if (!stepcard.isConnected) { stop(); return; }
        if (stepIdx >= FLOWS[flowIdx].steps.length - 1) { stop(); renderStep(); return; }
        stepIdx++; renderStep(); paint();
      }, reduce ? 3500 : 2600);
      renderStep(); paint(); renderNode(null);
    }
    function relBtn(id) { return h('button', { type: 'button', text: str(N[id].t), onclick: function () { selectNode(id); } }); }
    function renderNode(id) {
      if (!id) {
        var ids = FLOWS.length ? arr(FLOWS[flowIdx].steps[stepIdx].n).filter(function (x) { return N[x]; }) : [];
        nodecard.replaceChildren(
          ids.length ? h('span', { className: 'stepnum', text: '这一步涉及' }) : '',
          ids.length ? h('div', { className: 'rel' }, ids.map(relBtn)) : '',
          h('p', { className: 'muted small', text: '点地图上任意一块，看它的详情。' })
        );
        return;
      }
      var n = N[id], info = INFO[id] || {}, st = arr(info.st), seen = {}, rel = [];
      E.forEach(function (e) { var o = e[0] === id ? e[1] : (e[1] === id ? e[0] : null); if (o && !seen[o]) { seen[o] = 1; rel.push(relBtn(o)); } });
      var dl = h('dl', { className: 'kv' });
      arr(info.kv).forEach(function (p) { dl.appendChild(h('dt', { text: str(p[0]) })); dl.appendChild(rich('dd', p[1])); });
      nodecard.replaceChildren(
        h('span', { className: 'nd-type t-' + str(n.c).replace(/[^a-z]/g, ''), text: str(TYPE[n.c] || n.c) }),
        h('h3', { text: str(n.t) }),
        st.length ? h('span', { className: 'status ' + (st[0] === 'ok' ? 'ok' : 'wait'), text: (st[0] === 'ok' ? '● ' : '◐ ') + str(st[1]) }) : '',
        dl,
        info.note ? rich('p', info.note, { className: 'muted small' }) : '',
        rel.length ? h('span', { className: 'stepnum', text: '连着' }) : '',
        rel.length ? h('div', { className: 'rel' }, rel) : '',
        h('div', { className: 'ctrls' }, [h('button', { className: 'btn', type: 'button', text: FLOWS.length ? '回到流程' : '取消选择', onclick: function () { selId = null; paint(); renderNode(null); } })])
      );
    }
    function selectNode(id) { stop(); selId = id; renderStep(); paint(); renderNode(id); }
    svg.addEventListener('click', function () { if (selId) { selId = null; paint(); renderNode(null); } });

    function markFlows() { Array.prototype.forEach.call(flowsEl.children, function (b, i) { b.setAttribute('aria-pressed', i === flowIdx ? 'true' : 'false'); }); }
    FLOWS.forEach(function (f, i) {
      flowsEl.appendChild(h('button', {
        type: 'button', className: 'fchip', text: str(f.name),
        onclick: function () { stop(); flowIdx = i; save('toolmap.flow.' + v, str(f.id)); markFlows(); go(0); }
      }));
    });
    markFlows();
    if (FLOWS.length) go(0); else { renderStep(); paint(); renderNode(null); }

    return h('section', null, [
      secHead(M),
      FLOWS.length ? flowsEl : null,
      h('div', { className: 'mapgrid' }, [
        h('div', null, [
          h('div', { className: 'mapbox' }, [h('p', { className: 'scrollhint', text: '地图可以左右滑动' }), svg]),
          h('div', { className: 'legend' }, [
            h('span', null, [h('i'), '平时的关系']),
            h('span', null, [h('i', { className: 'ac' }), '当前步骤']),
            h('span', null, [h('i', { className: 'pd' }), '接入中 / 只读']),
            h('span', { text: '点空白处取消选择' })
          ])
        ]),
        h('div', { className: 'panel' }, [stepcard, nodecard])
      ])
    ]);
  }

  /* ===== 二 · 分工表 ===== */
  function renderRoles(R) {
    var tone = { yes: 'yes', no: 'no', mid: 'mid' };
    return h('section', null, [
      secHead(R),
      h('div', { className: 'tbl-wrap' }, [h('table', null, [
        h('thead', null, [h('tr', null, arr(R.head).map(function (t) { return h('th', { text: str(t) }); }))]),
        h('tbody', null, arr(R.rows).map(function (row) {
          return h('tr', null, arr(row).map(function (c) {
            if (c && typeof c === 'object') {
              var td = h('td', { className: tone[c.tone] || null });
              td.appendChild(c.bold ? h('b', { text: str(c.text) }) : rich('span', c.text));
              return td;
            }
            return rich('td', c);
          }));
        }))
      ])])
    ]);
  }

  /* ===== 三 · 信息放哪 ===== */
  function renderPlaces(P) {
    var items = arr(P.items);
    var opts = h('div', { className: 'opts', role: 'group', 'aria-label': '信息类型' });
    var ans = h('div', { className: 'answer', 'aria-live': 'polite' });
    function pick(i) {
      var p = items[i];
      Array.prototype.forEach.call(opts.children, function (b, j) { b.setAttribute('aria-pressed', j === i ? 'true' : 'false'); });
      ans.replaceChildren(
        h('span', { className: 'lab', text: '放到' }), h('div', { className: 'dest', text: str(p.dest) }),
        h('span', { className: 'lab', text: '你对 AI 说' }), h('div', { className: 'say', text: str(p.say) }),
        rich('div', p.auto, { className: 'auto' })
      );
    }
    items.forEach(function (p, i) { opts.appendChild(h('button', { className: 'opt', type: 'button', text: str(p.k), onclick: function () { pick(i); } })); });
    if (items.length) pick(0);
    return h('section', null, [
      secHead(P),
      items.length ? h('div', { className: 'picker' }, [opts, ans]) : null,
      arr(P.cmds).length ? h('div', { className: 'cmds' }, P.cmds.map(function (c) {
        return h('div', { className: 'cmd' }, [h('q', { text: str(c.q) }), rich('span', c.d)]);
      })) : null
    ]);
  }

  /* ===== 四 · 进度看板 ===== */
  function renderBoard(v, B) {
    var today = new Date(str(B.today) || Date.now()), staleDays = +B.staleDays || 14;
    var groups = arr(B.groups), items = arr(B.items);
    var filter = h('div', { className: 'board-filter', role: 'group', 'aria-label': '筛选' });
    var board = h('div', { className: 'board' });
    var curG = load('toolmap.filter.' + v) || 'all';
    if (!groups.some(function (g) { return g[0] === curG; })) curG = 'all';
    function age(d) { return Math.round((today - new Date(d)) / 864e5); }
    function draw() {
      Array.prototype.forEach.call(filter.children, function (b) { b.setAttribute('aria-pressed', b.getAttribute('data-g') === curG ? 'true' : 'false'); });
      var cards = [];
      items.forEach(function (it) {
        var a = age(it.d), stale = a > staleDays;
        if (curG === 'stale' && !stale) return;
        if (curG !== 'all' && curG !== 'stale' && it.grp !== curG) return;
        cards.push(h('article', { className: 'pcard' + (stale ? ' stale' : '') }, [
          h('div', { className: 'pcard-top' }, [
            h('div', null, [h('div', { className: 'topic', text: str(it.topic) }), h('h3', { text: str(it.t) })]),
            h('span', { className: 'pill ' + (/^p-(ok|wait|run)$/.test(it.cls) ? it.cls : 'p-run'), text: str(it.st) })
          ]),
          rich('p', it.next, { className: 'next' }),
          it.note ? rich('p', it.note, { className: 'muted small' }) : null,
          stale ? h('p', { className: 'warn', text: '已 ' + a + ' 天未更新，下次开工会问你：继续 / 已交付 / 放弃' }) : null,
          h('div', { className: 'meta' }, [h('span', { text: '最近更新 ' + str(it.d).slice(5) }), h('span', { text: a === 0 ? '今天' : a + ' 天前' })])
        ]));
      });
      if (!cards.length) cards.push(h('p', { className: 'muted', text: '这一类目前没有条目。' }));
      board.replaceChildren.apply(board, cards);
    }
    groups.forEach(function (g) {
      filter.appendChild(h('button', {
        type: 'button', className: 'fchip', 'data-g': str(g[0]), text: str(g[1]),
        onclick: function () { curG = g[0]; save('toolmap.filter.' + v, curG); draw(); }
      }));
    });
    draw();
    return h('section', null, [secHead(B), groups.length ? filter : null, board]);
  }

  /* ===== 五 · 乱点 ===== */
  function renderMess(X) {
    return h('section', null, [
      secHead(X),
      h('div', { className: 'mess' }, arr(X.items).map(function (m) {
        return h('div', { className: 'm tone-' + (['wait', 'done', 'ok'].indexOf(m.tone) >= 0 ? m.tone : 'wait') }, [
          h('span', { className: 'lvl', text: str(m.lvl) }),
          h('h3', { text: str(m.title) }),
          rich('p', m.fact, { className: 'fact' }),
          rich('p', m.fix, { className: 'fix' })
        ]);
      }))
    ]);
  }

  var start = location.hash.slice(1);
  show(VERSIONS[start] ? start : (load('toolmap.tab') || 'claude'));
})();
