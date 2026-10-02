/* KOL 工作台 · 导入导出：CSV 导入（列映射、预览、去重）、CSV 导出（可顺带标记已录入 CRM）、JSON 全量备份与恢复。 */
(() => {
  const K = window.KOL;
  const { esc } = K;

  /* ================= CSV 解析 / 生成 ================= */
  K.parseCsv = text => {
    text = String(text).replace(/^﻿/, '');
    // 分隔符：看第一行（引号外）哪个最多。欧洲版 Excel 常用分号
    const first = text.split(/\r?\n/, 1)[0] || '';
    const count = ch => { let n = 0, q = false; for (const c of first) { if (c === '"') q = !q; else if (!q && c === ch) n++; } return n; };
    const delim = [',', ';', '\t'].sort((a, b) => count(b) - count(a))[0];
    const rows = []; let row = [], field = '', q = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) {
        if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else q = false; }
        else field += c;
      } else if (c === '"' && field === '') q = true;
      else if (c === delim) { row.push(field); field = ''; }
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && text[i + 1] === '\n') i++;
        row.push(field); rows.push(row); row = []; field = '';
      } else field += c;
    }
    if (field !== '' || row.length) { row.push(field); rows.push(row); }
    return rows.filter(r => r.some(x => x.trim() !== ''));
  };
  // 防 CSV 公式注入：以 = + - @ 开头且像公式的格子前面加 '
  const cell = v => {
    let s = v == null ? '' : String(v);
    if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s) && !/^@[\w.\-]+$/.test(s)) s = "'" + s;
    return /[",\r\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  K.toCsv = (header, rows) => '﻿' + [header, ...rows].map(r => r.map(cell).join(',')).join('\r\n') + '\r\n';

  /* ================= 字段与表头别名 ================= */
  const KOL_FIELDS = [
    ['name', '名称', ['名称', '姓名', 'name', 'kol', 'kol名称', '达人', 'creator', 'channel name', 'channel', '频道名']],
    ['handle', '账号', ['账号', '账号名', 'kol账号', 'handle', 'username', 'user name', '用户名']],
    ['platform', '平台', ['平台', '主平台', 'platform']],
    ['profile_url', '主页链接', ['主页链接', '主页', 'profile', 'profile url', 'url', '链接', 'channel url', '频道链接', 'link']],
    ['followers', '粉丝量', ['粉丝数', '粉丝量', '粉丝', 'followers', 'subscribers', '订阅数']],
    ['avg_views', '平均播放', ['平均播放量', '平均播放', 'avg views', 'average views']],
    ['engagement_rate', '互动率 %', ['互动率', 'engagement', 'engagement rate']],
    ['country', '国家', ['国家', '国家/地区', '地区', 'country', 'region']],
    ['language', '语言', ['语言', 'language', 'lang']],
    ['category', '品类', ['品类', '内容领域', '领域', 'category', 'niche']],
    ['email', '邮箱', ['邮箱', '商务邮箱', 'email', 'e-mail', 'mail']],
    ['contact_other', '其他联系方式', ['其他联系方式', '联系方式', 'contact']],
    ['status', '状态', ['状态', '当前状态', 'status']],
    ['priority', '优先级', ['优先级', 'priority']],
    ['rating', '初筛评级', ['初筛评级', '评级', 'rating']],
    ['can_sell', '带货权限', ['是否有带货权限', '带货权限']],
    ['promoted_similar', '推过同类产品', ['是否推过同类产品', '推过同类产品', '推过同类']],
    ['first_contact_at', '首次联系', ['首触日期', '首次联系', '首次联系日期']],
    ['last_contact_at', '上次联系', ['最后联系日期', '上次联系', '上次联系日期', 'last contact']],
    ['next_followup_at', '下次跟进', ['下次跟进日期', '下次跟进', '后续跟进日期', 'next follow-up', 'next followup']],
    ['quote', '报价（€，数字）', ['报价', 'quote', 'rate']],
    ['quote_note', '报价说明', ['报价信息', '报价说明']],
    ['coop_type', '合作方式', ['合作形式', '合作方式']],
    ['source', '来源', ['来源', 'source']],
    ['source_url', '信息来源链接', ['信息来源链接', '来源链接']],
    ['reason', '为什么值得关注', ['我为什么该关注他', '关注理由', '为什么值得关注']],
    ['blocker', '卡点', ['卡点/等待什么', '卡点']],
    ['crm_synced', '已录入 CRM', ['已录入crm', '已录入 crm', 'crm']],
    ['tags', '标签', ['标签', 'tags']],
    ['notes', '备注', ['备注', 'notes', 'note', 'remark']],
    ['data_updated_at', '数据核实日期', ['数据更新日期', '数据核实日期']]
  ];
  const DEAL_FIELDS = [
    ['kol', 'KOL（账号或名称）', ['kol账号', 'kol', '账号', '账号名', '名称', 'kol名称', '达人', 'handle']],
    ['platform', '平台', ['平台', 'platform']],
    ['period', '结算月份', ['统计周期', '结算月份', '月份', 'period', 'month']],
    ['content_url', '视频链接', ['内容链接', '视频链接', 'content url', 'video']],
    ['product_link', '带货链接', ['带货链接', '商品链接', 'product link']],
    ['published_at', '发布日期', ['发布日期', 'published']],
    ['views', '播放量', ['播放量', 'views']],
    ['orders', '订单数', ['订单数', 'orders']],
    ['gmv_eur', '成交额 €', ['gmv_eur', 'gmv', '成交额']],
    ['returns', '退货数', ['退货数', 'returns']],
    ['net_gmv_eur', '净成交额 €', ['净gmv_eur', '净gmv', '净成交额']],
    ['commission_rate', '分成比例 %', ['分成比例', 'commission rate']],
    ['commission_eur', '分成金额 €（手填）', ['我的分成', '分成金额', 'commission']],
    ['settle_status', '结算状态', ['结算状态', '是否结算']],
    ['notes', '备注', ['备注', 'notes']]
  ];
  const norm = s => String(s || '').trim().toLowerCase().replace(/[\s_]+/g, ' ').replace(/^﻿/, '');
  const guess = (header, fields) => {
    const h = norm(header).replace(/\s*[⭐*]\s*$/, '').trim();
    const hit = fields.find(f => f[2].some(a => norm(a) === h)) || fields.find(f => f[2].some(a => a.length > 2 && h.includes(norm(a))));
    return hit ? hit[0] : '';
  };

  /* ================= 取值规整 ================= */
  const STATUS_WORDS = {
    todo: ['待外联', '待触达', '待联系', '未联系', '已转入主表', 'todo', 'new'],
    contacted: ['已首触', '已联系', '已联系/等回复', '等回复', '跟进中', 'contacted', 'waiting'],
    talking: ['洽谈中', '沟通中', '谈判中', 'talking', 'negotiating'],
    sampled: ['已发货', '已寄样', '已寄样/待出内容', '待出内容', 'sampled', 'shipped'],
    published: ['内容已发', '内容已发布', '已发布', 'published', 'live'],
    won: ['已成交', '成交', 'won', 'deal'],
    paused: ['已暂缓', '已放弃', '暂不跟进', '已拒绝', '已拒绝-勿再联系', 'paused', 'lost', 'declined']
  };
  const LANG_WORDS = {
    en: ['英语', '英文', 'english'], de: ['德语', '德文', 'german', 'deutsch'], fr: ['法语', '法文', 'french', 'français'],
    es: ['西语', '西班牙语', 'spanish', 'español'], it: ['意语', '意大利语', 'italian', 'italiano'], nl: ['荷兰语', 'dutch', 'nederlands'],
    pl: ['波兰语', 'polish', 'polski'], pt: ['葡萄牙语', '葡语', 'portuguese'], sv: ['瑞典语', 'swedish'], da: ['丹麦语', 'danish'],
    no: ['挪威语', 'norwegian'], fi: ['芬兰语', 'finnish'], cs: ['捷克语', 'czech'], hu: ['匈牙利语', 'hungarian'], ro: ['罗马尼亚语', 'romanian'],
    el: ['希腊语', 'greek'], tr: ['土耳其语', 'turkish'], uk: ['乌克兰语', 'ukrainian'], ja: ['日语', 'japanese'], ko: ['韩语', 'korean'], zh: ['中文', '汉语', 'chinese']
  };
  // 国家名 → 代码：用浏览器自带的 Intl.DisplayNames 生成中英文对照，不发外部请求
  let countryIndex = null;
  const countryCode = v => {
    const s = String(v || '').trim(); if (!s) return null;
    if (/^[a-z]{2}$/i.test(s)) return s.toUpperCase() === 'UK' ? 'GB' : s.toUpperCase();
    if (!countryIndex) {
      countryIndex = new Map();
      for (const c of K.cfg().countries) countryIndex.set(c.name.toLowerCase(), c.code);
      try {
        const names = ['en', 'zh', 'de'].map(l => new Intl.DisplayNames([l], { type: 'region' }));
        for (let a = 65; a < 91; a++) for (let b = 65; b < 91; b++) {
          const code = String.fromCharCode(a, b);
          for (const n of names) { const name = n.of(code); if (name && name !== code) countryIndex.set(name.toLowerCase(), code); }
        }
      } catch { /* 老浏览器没有 DisplayNames，只用设置里的中文国名 */ }
      for (const [k, v] of [['uk', 'GB'], ['england', 'GB'], ['britain', 'GB'], ['great britain', 'GB'], ['usa', 'US'], ['america', 'US'], ['holland', 'NL'], ['德', 'DE'], ['英', 'GB'], ['法', 'FR']]) countryIndex.set(k, v);
    }
    return countryIndex.get(s.toLowerCase()) || null;
  };
  K.parseNumber = v => {
    let s = String(v ?? '').trim().replace(/[€$£\s]/g, '').replace(/,/g, '');
    if (!s) return null;
    const m = /^(-?\d+(?:\.\d+)?)\s*(k|千|m|w|万|b|亿)?%?$/i.exec(s);
    if (!m) return NaN;
    const mult = { k: 1e3, 千: 1e3, m: 1e6, w: 1e4, 万: 1e4, b: 1e9, 亿: 1e8 }[(m[2] || '').toLowerCase()] || 1;
    return Math.round(Number(m[1]) * mult * 100) / 100;
  };
  K.parseDateLoose = v => {
    const s = String(v ?? '').trim(); if (!s) return null;
    let m;
    if (/^\d{5}$/.test(s)) { const d = new Date(Date.UTC(1899, 11, 30) + Number(s) * 864e5); return d.toISOString().slice(0, 10); }   // Excel 序列号
    if ((m = /^(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})日?/.exec(s))) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
    if ((m = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})/.exec(s))) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;   // 欧洲写法 日.月.年
    return null;
  };
  const yn = v => {
    const s = norm(v);
    if (['是', 'yes', 'y', 'true', '1', '✓', '有', 'ja', 'oui'].includes(s)) return 'yes';
    if (['否', 'no', 'n', 'false', '0', '无', '没有', 'nein', 'non'].includes(s)) return 'no';
    return s ? 'unknown' : null;
  };
  const urlFix = v => { const s = String(v || '').trim(); if (!s) return null; return /^https?:\/\//i.test(s) ? s : /^[\w-]+(\.[\w-]+)+(\/|$)/.test(s) ? 'https://' + s : s; };

  // 一行 CSV（已按映射取成 {字段: 原文}）→ 发给服务器的数据
  K.normalizeKolRow = raw => {
    const out = {}, note = [];
    const put = (k, v) => { if (v !== null && v !== undefined && v !== '') out[k] = v; };
    for (const [k, v0] of Object.entries(raw)) {
      const v = String(v0 ?? '').trim();
      if (k === '__notes') { if (v) note.push(v); continue; }
      if (!v) continue;
      switch (k) {
        case 'status': {
          const s = v.toLowerCase();
          const hit = Object.entries(STATUS_WORDS).find(([, ws]) => ws.some(w => w.toLowerCase() === s))
            || K.cfg().statuses.map(x => [x.key, [x.label]]).find(([, ws]) => ws[0] === v);
          put('status', hit ? hit[0] : null);
          if (/勿再联系|do not contact/i.test(v)) put('do_not_contact', 1);
          if (!hit) note.push(`原状态：${v}`);
          break;
        }
        case 'priority': {
          const s = v.toLowerCase();
          put('priority', ['高', 'high', 'h', '1', 'p1'].includes(s) ? 'high' : ['中', 'mid', 'medium', 'm', '2', 'p2'].includes(s) ? 'mid' : ['低', 'low', 'l', '3', 'p3'].includes(s) ? 'low' : null);
          break;
        }
        case 'rating': put('rating', /^[abc]$/i.test(v[0]) ? v[0].toUpperCase() : null); break;
        case 'language': {
          const s = v.toLowerCase();
          put('language', /^[a-z]{2,3}$/.test(s) ? s : (Object.entries(LANG_WORDS).find(([, ws]) => ws.includes(s)) || [])[0] || null);
          break;
        }
        case 'country': { const c = countryCode(v); put('country', c); if (!c) note.push(`国家：${v}`); break; }
        case 'platform': {
          const s = v.toLowerCase().replace(/\s+/g, '');
          const alias = { twitter: 'X', yt: 'YouTube', ig: 'Instagram', tt: 'TikTok', tg: 'Telegram', 抖音国际版: 'TikTok', 油管: 'YouTube' };
          put('platform', alias[s] || K.cfg().platforms.find(p => p.name.toLowerCase() === s)?.name || v.slice(0, 30));
          break;
        }
        case 'category': case 'tags': put(k, v.split(/[,，、;；/|]/).map(x => x.trim()).filter(Boolean)); break;
        case 'followers': case 'avg_views': { const n = K.parseNumber(v); if (Number.isNaN(n)) note.push(`${k === 'followers' ? '粉丝' : '播放'}：${v}`); else put(k, Math.round(n)); break; }
        case 'engagement_rate': { const n = K.parseNumber(v); if (!Number.isNaN(n)) put(k, n); break; }
        case 'quote': {
          const n = K.parseNumber(v);
          if (!Number.isNaN(n) && n != null) put('quote', n);
          else if (!/^未报价$/.test(v)) put('quote_note', v.slice(0, 200));
          break;
        }
        case 'can_sell': case 'promoted_similar': put(k, yn(v)); break;
        case 'crm_synced': put(k, yn(v) === 'yes' || /已录入/.test(v) ? 1 : 0); break;
        case 'first_contact_at': case 'last_contact_at': case 'next_followup_at': case 'data_updated_at': {
          const d = K.parseDateLoose(v); if (d) put(k, d); else note.push(`${k}：${v}`); break;
        }
        case 'profile_url': case 'source_url': put(k, urlFix(v)); break;
        case 'handle': put('handle', v); break;
        case 'quote_note': if (!/^(未报价|无|-|n\/a)$/i.test(v)) put('quote_note', v.slice(0, 200)); break;
        default: put(k, v);
      }
    }
    // 表里没有名称列时用账号当名字，但只用于新建（_auto_name），合并 / 覆盖时不会改掉已有记录的名字
    if (!out.name && out.handle) out._auto_name = out.handle.replace(/^@/, '');
    if (!out.platform && out.profile_url) { const p = K.parseProfileUrl(out.profile_url); if (p && p.platform !== '其他') out.platform = p.platform; }
    if (note.length) out.notes = [out.notes, ...note].filter(Boolean).join('\n').slice(0, 5000);
    return out;
  };
  K.normalizeDealRow = raw => {
    const out = {};
    for (const [k, v0] of Object.entries(raw)) {
      const v = String(v0 ?? '').trim(); if (!v || k === '__notes') continue;
      if (['views', 'orders', 'returns'].includes(k)) { const n = K.parseNumber(v); if (!Number.isNaN(n)) out[k] = Math.round(n); }
      else if (['gmv_eur', 'net_gmv_eur', 'commission_rate', 'commission_eur'].includes(k)) { const n = K.parseNumber(v); if (!Number.isNaN(n)) out[k] = n; }
      else if (k === 'period') { const m = /(\d{4})[-/.年](\d{1,2})/.exec(v); if (m) out.period = `${m[1]}-${m[2].padStart(2, '0')}`; }
      else if (k === 'published_at') { const d = K.parseDateLoose(v); if (d) out.published_at = d; }
      else if (k === 'settle_status') out.settle_status = /已结|settled|是|yes/i.test(v) ? 'settled' : 'unsettled';
      else if (k === 'content_url' || k === 'product_link') out[k] = urlFix(v);
      else out[k] = v;
    }
    if (out.commission_eur != null) out.commission_manual = 1;
    if (!out.period && out.published_at) out.period = out.published_at.slice(0, 7);
    return out;
  };

  /* ================= 导入弹窗 ================= */
  let imp = null;   // { rows, header, map, target, mode, overrides }
  const dlg = () => K.$('#io');

  function openImport() {
    imp = null;
    K.$('#io-title').textContent = '导入 CSV';
    K.$('#io-body').innerHTML = `<div class="io-step">
      <p>支持从 Excel / Numbers / 公司 CRM 导出的 CSV（UTF-8，带不带 BOM 都行）。</p>
      <div class="row wrap"><label class="lbl inline">导入到<select name="target"><option value="kols">KOL 列表</option><option value="deals">带货与分成</option></select></label>
      <label class="btn sm file">选择 CSV 文件<input type="file" accept=".csv,text/csv,text/plain" hidden data-file></label></div>
      <p class="muted small">兼容「vr-kol-overseas」里的 KOL主表.csv、候选名单-待核实.csv、跟进记录.csv（导入到 KOL 列表，按账号合并）和 带货数据.csv（导入到带货与分成）。</p>
    </div>`;
    dlg().showModal();
  }

  function fieldsFor(target) { return target === 'deals' ? DEAL_FIELDS : KOL_FIELDS; }

  function mapped(rowArr) {
    const raw = {};
    imp.header.forEach((h, i) => {
      const f = imp.map[i]; if (!f) return;
      const v = rowArr[i] ?? '';
      if (f === '__notes') { if (String(v).trim()) raw.__notes = [raw.__notes, `${h}：${v}`].filter(Boolean).join('\n'); }
      else raw[f] = raw[f] ? raw[f] + ', ' + v : v;
    });
    return imp.target === 'deals' ? K.normalizeDealRow(raw) : K.normalizeKolRow(raw);
  }

  function drawMapping() {
    const fields = fieldsFor(imp.target);
    const sample = imp.rows.slice(0, 20).map((r, i) => ({ i, data: mapped(r) }));
    const dupInfo = d => imp.target === 'deals' ? null : K.findDupesLocal(d)[0];
    const kolFound = d => {
      const h = String(d.kol || '').replace(/^@/, '').toLowerCase();
      return K.state.kols.find(k => (k.handle || '').replace(/^@/, '').toLowerCase() === h || k.name.toLowerCase() === h);
    };
    const nDup = imp.target === 'deals' ? 0 : imp.rows.map(mapped).filter(d => K.findDupesLocal(d).length).length;
    const modeSel = (name, v) => `<select ${name}><option value="skip" ${v === 'skip' ? 'selected' : ''}>跳过</option><option value="overwrite" ${v === 'overwrite' ? 'selected' : ''}>覆盖</option><option value="merge" ${v === 'merge' ? 'selected' : ''}>合并</option></select>`;
    const cols = imp.target === 'deals' ? ['kol', 'period', 'platform', 'orders', 'gmv_eur', 'commission_eur'] : ['name', 'platform', 'handle', 'country', 'language', 'status', 'followers'];
    const label = k => (fields.find(f => f[0] === k) || [, k])[1];
    const show = (d, k) => k === 'name' ? esc(d.name || d._auto_name || '') : k === 'country' ? K.countryLabel(d[k]) : k === 'language' ? esc(K.langName(d[k])) : k === 'status' ? (d[k] ? K.statusChip(d[k]) : '') : k === 'followers' ? esc(K.fmtInt(d[k])) : esc(d[k] ?? '');
    K.$('#io-body').innerHTML = `<div class="io-step">
      <p><b>${esc(imp.name)}</b> · ${imp.rows.length} 行 · 导入到「${imp.target === 'deals' ? '带货与分成' : 'KOL 列表'}」</p>
      <h4>1. 对一下列（已自动猜好，猜错的手动改）</h4>
      <div class="map-grid">${imp.header.map((h, i) => `<label><span title="${esc(h)}">${esc(h) || `第 ${i + 1} 列`}</span><select data-map="${i}"><option value="">（不导入）</option><option value="__notes" ${imp.map[i] === '__notes' ? 'selected' : ''}>追加到备注</option>${fields.map(f => `<option value="${f[0]}" ${imp.map[i] === f[0] ? 'selected' : ''}>${esc(f[1])}</option>`).join('')}</select><small class="muted">${esc(String(imp.rows[0]?.[i] ?? '').slice(0, 30))}</small></label>`).join('')}</div>
      <h4>2. 预览前 ${sample.length} 行</h4>
      <div class="table-wrap"><table class="grid preview-table"><thead><tr><th>行</th>${cols.map(c => `<th>${esc(label(c))}</th>`).join('')}<th>判断</th></tr></thead><tbody>
        ${sample.map(({ i, data }) => {
          let verdict;
          if (imp.target === 'deals') { const k = kolFound(data); verdict = k ? `<span class="ok-text">✓ 对应「${esc(k.name)}」</span>` : '<span class="warn-text">⚠ 找不到这个 KOL，会跳过</span>'; }
          else if (!data.name && !data._auto_name) verdict = '<span class="warn-text">⚠ 没有名称，会跳过</span>';
          else { const d = dupInfo(data); verdict = d ? `<span class="warn-text">⚠ 和「${esc(d.name)}」重复（${esc(d.reason)}）</span> ${modeSel(`data-row-mode="${i}"`, imp.overrides[i] || imp.mode)}` : '<span class="ok-text">新增</span>'; }
          return `<tr><td>${i + 2}</td>${cols.map(c => `<td>${show(data, c)}</td>`).join('')}<td>${verdict}</td></tr>`;
        }).join('')}
      </tbody></table></div>
      ${imp.target === 'kols' ? `<p>${nDup ? `<b class="warn-text">共 ${nDup} 行疑似重复</b>，` : '没有发现重复，'}重复的行默认：${modeSel('data-mode', imp.mode)}
        <span class="muted small">跳过 = 保留原记录不动；覆盖 = 用表里这些列替换（空格子会清空）；合并 = 只用表里有值的格子更新，空格子保留原值。</span></p>` : `<p>同一 KOL、同一视频链接、同一月份视为重复：${modeSel('data-mode', imp.mode)}</p>`}
      <div class="row end"><button type="button" class="btn sm ghost" data-io-back>重新选文件</button><button type="button" class="btn sm" data-io-run>开始导入 ${imp.rows.length} 行</button></div>
    </div>`;
  }

  async function runImport() {
    const btn = K.$('[data-io-run]'); btn.disabled = true;
    const total = { created: 0, updated: 0, skipped: 0, errors: [] };
    const rows = imp.rows.map((r, i) => ({ ...mapped(r), _row: i + 2, ...(imp.overrides[i] ? { _mode: imp.overrides[i] } : {}) }));
    try {
      for (let i = 0; i < rows.length; i += 200) {
        btn.textContent = `正在导入… ${Math.min(i + 200, rows.length)}/${rows.length}`;
        const res = await K.api('POST', '/import', { target: imp.target, mode: imp.mode, rows: rows.slice(i, i + 200) });
        total.created += res.created; total.updated += res.updated; total.skipped += res.skipped; total.errors.push(...res.errors);
      }
    } catch (e) { K.fail(e); }
    await K.app.reload();
    K.$('#io-body').innerHTML = `<div class="io-step"><h4>导入完成</h4>
      <p>新增 <b>${total.created}</b> · 更新 <b>${total.updated}</b> · 跳过 <b>${total.skipped}</b>${total.errors.length ? ` · <b class="warn-text">出错 ${total.errors.length}</b>` : ''}</p>
      ${total.errors.length ? `<ul class="errs">${total.errors.slice(0, 50).map(e => `<li>第 ${e.row} 行：${esc(e.error)}</li>`).join('')}</ul>` : ''}
      <div class="row end"><button type="button" class="btn sm" data-io-close>好的</button></div></div>`;
  }

  function bind() {
    const d = dlg();
    d.addEventListener('click', e => {
      if (e.target === d || e.target.closest('[data-io-close]')) return d.close();
      if (e.target.closest('[data-io-back]')) return openImport();
      if (e.target.closest('[data-io-run]')) return runImport();
    });
    d.addEventListener('change', async e => {
      const t = e.target;
      if (t.matches('[data-file]')) {
        const file = t.files[0]; if (!file) return;
        if (file.size > 5 * 1024 * 1024) return K.toast('文件太大了（超过 5MB），请拆成几份再导入', { error: true });
        const buf = await file.arrayBuffer();
        let text = new TextDecoder('utf-8').decode(buf);
        // 老版 Excel 存的 GBK / Windows-1252 会出现乱码替换符，换个编码再试
        if (text.includes('�')) { try { const g = new TextDecoder('gbk').decode(buf); if (!g.includes('�')) text = g; } catch { /* 浏览器不支持 gbk 就算了 */ } }
        const all = K.parseCsv(text);
        if (all.length < 2) return K.toast('这个文件里没有数据行', { error: true });
        const target = d.querySelector('[name=target]').value;
        const header = all[0].map(h => h.trim());
        imp = { name: file.name, header, rows: all.slice(1), target, mode: 'skip', overrides: {}, map: header.map(h => guess(h, fieldsFor(target))) };
        // 同一个字段只自动映射一次（后面的同名列不重复映射）
        const seen = new Set(); imp.map = imp.map.map(f => { if (!f || seen.has(f)) return ''; seen.add(f); return f; });
        if (imp.rows.some(r => r.length !== header.length)) K.toast('有些行的列数和表头对不上，已尽量按位置读取', { timeout: 5000 });
        return drawMapping();
      }
      if (t.matches('[data-map]')) { imp.map[Number(t.dataset.map)] = t.value; return drawMapping(); }
      if (t.matches('[data-mode]')) { imp.mode = t.value; return drawMapping(); }
      if (t.matches('[data-row-mode]')) { imp.overrides[Number(t.dataset.rowMode)] = t.value; }
    });
  }

  /* ================= 导出 ================= */
  const EXPORT_COLS = ['name', 'handle', 'platform', 'profile_url', 'followers', 'avg_views', 'engagement_rate', 'country', 'language', 'category', 'email', 'contact_other',
    'status', 'priority', 'rating', 'first_contact_at', 'last_contact_at', 'next_followup_at', 'quote', 'quote_note', 'coop_type', 'source', 'crm_synced', 'tags', 'blocker', 'notes'];
  const EXPORT_LABEL = { profile_url: '主页链接', quote_note: '报价说明', quote: '报价 EUR', engagement_rate: '互动率 %' };

  K.io = {
    menu(anchor, view, list) {
      const el = K.popover(anchor, `<div class="opts">
        <button type="button" class="opt" data-io="import">⬆️ 导入 CSV…</button>
        <button type="button" class="opt" data-io="export-view">⬇️ 导出当前视图（${list.length} 个）CSV</button>
        <button type="button" class="opt" data-io="export-all">⬇️ 导出全部 KOL CSV</button>
        <hr><button type="button" class="opt" data-io="backup">💾 下载 JSON 全量备份</button>
        <button type="button" class="opt" data-io="restore">♻️ 从 JSON 备份恢复…</button></div>`, { cls: 'pick' });
      el.addEventListener('click', e => {
        const a = e.target.closest('[data-io]')?.dataset.io; if (!a) return;
        K.closePopover();
        if (a === 'import') openImport();
        if (a === 'export-view') K.io.exportCsv(list, view, view.name);
        if (a === 'export-all') K.io.exportCsv(K.state.kols, view, '全部');
        if (a === 'backup') K.io.backup();
        if (a === 'restore') K.io.restorePick();
      });
    },
    openImport,
    exportCsv(list, view, label) {
      if (!list.length) return K.toast('没有可导出的 KOL', { error: true });
      K.$('#io-title').textContent = '导出 CSV';
      K.$('#io-body').innerHTML = `<div class="io-step"><p>将导出 <b>${list.length}</b> 个 KOL（${esc(label)}），Excel / Numbers 可以直接打开，不会乱码。</p>
        <label class="check"><input type="checkbox" data-mark-crm> 同时把这 ${list.length} 个 KOL 标记为「已录入 CRM」</label>
        <div class="row end"><button type="button" class="btn sm ghost" data-io-close>取消</button><button type="button" class="btn sm" data-do-export>导出</button></div></div>`;
      dlg().showModal();
      K.$('[data-do-export]').onclick = async () => {
        const header = EXPORT_COLS.map(c => EXPORT_LABEL[c] || K.col(c)?.label || c);
        const rows = list.map(k => EXPORT_COLS.map(c => K.cellText(k, c)));
        K.download(`KOL-${label}-${K.today()}.csv`, K.toCsv(header, rows), 'text/csv;charset=utf-8');
        if (K.$('[data-mark-crm]').checked) {
          const ids = list.filter(k => !k.crm_synced).map(k => k.id);
          if (ids.length) {
            try { const { kols } = await K.api('POST', '/kols/batch', { ids, patch: { crm_synced: 1 } }); kols.forEach(K.replaceKol); K.render(); K.toast(`已导出，并把 ${ids.length} 个标记为已录入 CRM`); }
            catch (e) { K.fail(e); }
          } else K.toast('已导出（这些 KOL 本来就都标记过 CRM）');
        } else K.toast('已导出');
        dlg().close();
      };
    },
    exportDeals(list) {
      if (!list.length) return K.toast('没有可导出的记录', { error: true });
      const header = ['KOL', '账号', '结算月份', '平台', '视频链接', '带货链接', '发布日期', '播放量', '订单数', '成交额 EUR', '退货数', '净成交额 EUR', '分成比例 %', '分成金额 EUR', '结算状态', '备注'];
      const rows = list.map(d => { const k = K.kol(d.kol_id) || {}; return [k.name, k.handle, K.dealMonth(d), d.platform, d.content_url, d.product_link, d.published_at, d.views, d.orders, d.gmv_eur, d.returns, d.net_gmv_eur, d.commission_rate, K.dealCommission(d), d.settle_status === 'settled' ? '已结算' : '未结算', d.notes]; });
      K.download(`带货与分成-${K.today()}.csv`, K.toCsv(header, rows), 'text/csv;charset=utf-8');
    },
    async backup(silentName) {
      try {
        const r = await fetch('/api/kol/backup', { credentials: 'same-origin', headers: { 'x-kol-request': '1' } });
        if (!r.ok) throw new Error('备份下载失败');
        const text = await r.text();
        K.download(silentName || `KOL工作台备份-${K.today()}.json`, text, 'application/json');
        if (!silentName) K.toast('已下载全量备份');
        return true;
      } catch (e) { K.fail(e); return false; }
    },
    restorePick() {
      const input = document.createElement('input');
      input.type = 'file'; input.accept = '.json,application/json';
      input.addEventListener('change', async () => {
        const file = input.files[0]; if (!file) return;
        let data;
        try { data = JSON.parse(await file.text()); } catch { return K.toast('这个文件不是有效的备份', { error: true }); }
        if (data?.app !== 'cosmoswong-kol') return K.toast('这不是 KOL 工作台导出的备份文件', { error: true });
        const n = (data.kols || []).length;
        if (!(await K.confirm(`要用这份备份（导出于 ${String(data.exported_at || '').slice(0, 16).replace('T', ' ')}，含 ${n} 个 KOL）替换当前全部数据吗？当前有 ${K.state.kols.length} 个 KOL。点确认后会先自动下载一份当前数据。`, '继续'))) return;
        if (!(await K.io.backup(`KOL工作台-恢复前自动备份-${K.today()}.json`))) return;
        if (!(await K.confirm('已下载当前数据的备份。最后确认一次：恢复后，现在的所有 KOL、沟通记录、带货记录、模板都会被备份里的内容替换。', '确认恢复'))) return;
        try {
          const res = await K.api('POST', '/restore', { confirm: 'RESTORE', data });
          await K.app.reload(); K.toast(`已恢复 ${res.rows} 条数据`);
        } catch (e) { K.fail(e); }
      });
      input.click();
    }
  };

  document.addEventListener('DOMContentLoaded', bind);
})();
