/* 我的工作台 · 给 AI 用的文字：提示词模板变量、开工 / 收工 / 需求梳理 / 写玩法提案提示词、「复制成 进度.md 条目」、催办话术。
   这里只放通用的默认模板；具体业务的开头（先读哪个仓库、跑什么检查）写在用户自己的模板里（设置 → 提示词模板，或从初始化包导入）。 */
(() => {
  const D = window.DESK;

  /* ---------- 内置的通用模板（只读；想改就「复制成我的模板」） ---------- */
  D.BUILTIN_PROMPTS = [
    { id: 'b-start', builtin: true, name: '开工（通用）', tool: '', scene: '开工', body:
`请帮我推进下面这个工作项目。先读懂背景，再动手。

【项目】{{project}}
【类型】{{kind}}　【省份】{{province}}　【当前状态】{{status}}
【上线日】{{launch_at}}　【我这边的截止日】{{due_at}}
【一句话需求】{{summary}}
【这次要你做的】{{todo}}

【交付物进度】
{{deliverables}}

【已经确认的口径】
{{pendings_answered}}

【还没确认、不要当成事实的】
{{pendings_open}}

【相关链接】
{{links}}

【本机文件位置】
{{local_paths}}

【最近的进展】
{{recent_activities}}

【下一步】{{next_action}}

要求：
1. 先用几句话复述你理解的任务和要交的东西，列出还需要我确认的问题，再开始做。
2. 「还没确认」里的内容一律写成占位或「待确认」，不要自己编数字。
3. 做完告诉我：交付了什么、放在哪、还有什么没做完。` },
    { id: 'b-end', builtin: true, name: '收工（通用）', tool: '', scene: '收工', body:
`这个项目今天先到这里，请帮我收个尾。

【项目】{{project}}（{{status}}）
【这次要做的】{{todo}}

请按这个格式汇报，方便我贴回工作台：
1. 这次做完了什么（交付物名称 + 版本 + 文件位置）
2. 还没做完的，下一步具体做什么
3. 新出现的待确认问题（问谁、问什么）
4. 这次大概花了多久；如果不用 AI，你估计人工要多久` },
    { id: 'b-intake', builtin: true, name: '需求梳理（通用）', tool: '', scene: '需求梳理', body:
`下面是我收到的一段需求消息（来源：{{source}}），请帮我拆成工作需求：

---
{{content}}
---

请按下面几项整理，没提到的写「没说」，不要猜：
1. 省份 / 适用范围
2. 主题，要做什么
3. 时间：什么时候要、什么时候上线
4. 奖品 / 权益（原文照抄，不要补数字）
5. 要交哪几样东西（策划案、原型、客服文档、活动规则……）
6. 还没说清楚、需要我回头去问的问题（每条写成可以直接发出去的一句话）
最后用一句话概括这个需求，我会把它当成项目的「一句话需求」。` },
    { id: 'b-idea', builtin: true, name: '写玩法提案（通用）', tool: '', scene: '写玩法提案', body:
`请帮我把下面这个玩法创意写成一份给开发评估的提案（Word）。

【创意名】{{title}}（{{week}}）
【玩法机制】{{mechanism}}
【考核方向】{{target}}
【我估的开发量】{{dev_cost}}
【补充】{{notes}}

提案结构：
1. 一句话说明玩法
2. 用户怎么玩（按步骤写，附一张流程示意）
3. 为什么能帮到「{{target}}」（给出预期；没有数据就写清楚是假设）
4. 需要开发做什么（前端 / 后台 / 配置分开列）、风险和替代方案
5. 需要业务方确认的问题
篇幅控制在 2 页以内；奖品和数值一律用「待定」占位，不要编。` }
  ];

  // 某个场景可用的模板：先是指定工具的，再是不限工具的，最后是内置通用模板
  D.templatesFor = (scene, tool) => {
    const mine = D.state.prompts.filter(t => (t.scene || '其他') === scene);
    const exact = mine.filter(t => tool && t.tool === tool), general = mine.filter(t => !t.tool || t.tool === '通用');
    return [...exact, ...general, ...D.BUILTIN_PROMPTS.filter(b => b.scene === scene)];
  };
  D.promptById = id => D.state.prompts.find(t => String(t.id) === String(id)) || D.BUILTIN_PROMPTS.find(b => b.id === id);

  // 变量替换：空值写「（无）」；不认识的变量写明，保证结果里不会残留 {{
  D.fillTemplate = (body, vars) => String(body || '').replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (m, k) => {
    if (!(k in vars)) return `（没有「${k}」这个变量）`;
    const v = vars[k];
    return v == null || String(v).trim() === '' ? '（无）' : String(v);
  }).replace(/\{\{/g, '｛｛');

  /* ---------- 项目时间线（打开抽屉或生成提示词时才从服务器取） ---------- */
  D.acts = {};
  D.loadActs = async (pid, force = false) => {
    if (D.acts[pid] && !force) return D.acts[pid];
    try { const { items } = await D.api('GET', `/activities?project_id=${pid}`); D.acts[pid] = items; }
    catch (e) { D.acts[pid] = D.acts[pid] || []; D.fail(e); }
    return D.acts[pid];
  };
  D.on('activity', a => {
    const list = D.acts[a.project_id]; if (!list) return;
    const i = list.findIndex(x => x.id === a.id);
    if (i >= 0) list[i] = a; else list.unshift(a);
    list.sort((x, y) => y.happened_at.localeCompare(x.happened_at) || y.id - x.id);
  });

  /* ---------- 项目的变量 ---------- */
  const lines = arr => arr.length ? arr.map(x => '- ' + x).join('\n') : '';
  // 已拍板的口径：你自己的决定 + 业务方的答复，按日期排（生成提示词时放进 {{pendings_answered}}，几个 AI 就不会各按各的记录走）
  D.settledOf = pid => [
    ...D.decisionsOf(pid).map(x => ({ date: x.decided_at, text: x.content, who: x.source || '我', kind: 'decision', ref: x })),
    ...D.pendingsOf(pid).filter(x => x.status === 'answered').map(x => ({ date: x.answered_at || '', text: `${x.question} → ${x.answer || ''}`, who: x.ask_whom || '对方', kind: 'answer', ref: x }))
  ].sort((a, b) => (b.date || '').localeCompare(a.date || '') || b.ref.id - a.ref.id);
  D.baseText = d => d.base ? `底稿：${d.base}${d.base_locked ? '（我手改的版本，AI 不得改动）' : ''}` : '';
  D.projectVars = async (p, { tool = '', todo = '' } = {}) => {
    const acts = await D.loadActs(p.id);
    const delivs = D.delivsOf(p.id), pend = D.pendingsOf(p.id);
    return {
      project: p.title, province: p.province || '全国', kind: p.kind || '', month: p.month || '',
      launch_at: p.launch_at ? `${p.launch_tentative ? '暂定 ' : ''}${D.fmtDateW(p.launch_at)}` : '', due_at: p.due_at ? D.fmtDateW(p.due_at) : '',
      status: D.statusOf(p.status).label, priority: D.priorityOf(p.priority)?.label || '', requester: p.requester || '',
      summary: p.summary || '', next_action: p.next_action || '', todo, tool, today: D.fmtDateW(D.today()), notes: p.notes || '',
      deliverables: lines(delivs.map(d => [`${D.delivLabel(d)}：${D.delivStatusOf(d.status).label}${d.due_at ? `，截止 ${D.fmtDate(d.due_at)}` : ''}`, D.baseText(d), d.file_hint ? `位置：${d.file_hint}` : ''].filter(Boolean).join('；'))),
      pendings_open: lines(D.sortWaiting(pend.filter(x => x.status === 'waiting')).map(x => `${x.question}（问${x.ask_whom || '—'}${x.ask_name ? ' ' + x.ask_name : ''}${x.need_by ? `，最晚 ${D.fmtDate(x.need_by)} 要` : ''}${x.blocking ? '，卡交付' : ''}）`)),
      pendings_answered: lines(D.settledOf(p.id).map(x => `${x.date ? D.fmtDate(x.date) + ' ' : ''}${x.kind === 'decision' ? `${x.who}定：` : `${x.who}答复：`}${x.text}`)),
      links: lines((p.links || []).map(l => `${l.label || '链接'}：${l.url}`)),
      local_paths: lines(p.local_paths || []),
      recent_activities: lines(acts.slice(0, 5).map(a => `${D.fmtDate(a.happened_at)} ${D.actOf(a.type).label}${a.tool ? `（${a.tool}）` : ''}：${a.summary || D.firstLine(a.content, 60)}`))
    };
  };

  /* ---------- 自动加在提示词后面的三段：回填格式 / 比稿规则 / 建项目格式（模板里已经写了就不重复加） ---------- */
  D.BACKFILL_START = '【回填工作台】'; D.BACKFILL_END = '【回填结束】';
  D.INTAKE_START = '【新建项目】'; D.INTAKE_END = '【新建结束】';
  D.backfillFooter = project => `

—— 收工时请在汇报最后原样附上下面这一段（没有的项写「无」），我会把它贴回工作台：
${D.BACKFILL_START}
项目：${project}
下一步：一句能直接动手的话
产出：交付物名称｜版本｜文件位置｜状态（制作中 / 待审 / 已交付），每件一行
待确认：问谁｜要确认什么｜最晚哪天要，每条一行
已确认：这次确认下来的口径，每条一行
用时：这次实际约多少分钟｜不用 AI 估计要多少分钟
${D.BACKFILL_END}`;
  D.SUFFIX = { 'Claude Code': 'claude', Codex: 'codex', 'DeepSeek Harness': 'dsh', ChatGPT: 'chatgpt', Cowork: 'cowork' };
  D.suffixOf = tool => D.SUFFIX[tool] || String(tool || 'ai').toLowerCase().replace(/[^a-z0-9]+/g, '') || 'ai';
  D.compareFooter = tool => `

—— 这是比稿：我会让几个 AI 各做一版再挑。请把你的版本单独存一份，文件名带上「-${D.suffixOf(tool)}」后缀；在我选定之前，不要改共享的知识库和进度记录。做完告诉我文件位置和大概用了多久。`;
  D.intakeFooter = `

最后请按下面格式原样输出一段（没提到的写「没说」），我会贴回工作台自动建项目：
${D.INTAKE_START}
项目名：
省份：全国就写「全国」
上线日：YYYY-MM-DD；只是暂定就在后面写「暂定」；没说就写「没说」
一句话需求：
交付物：交付物类型｜名称，每件一行
待确认：问谁｜要确认什么｜最晚哪天要，每条一行
${D.INTAKE_END}`;
  const withFooter = (text, footer, marker) => text.includes(marker) ? text : text + footer;

  // 开工提示词：按工具挑模板 + 项目变量 + 回填格式（比稿时换成比稿规则）
  D.kickoffPrompt = async (p, tool, todo, { compare = false, tplId } = {}) => {
    const tpl = (tplId && D.promptById(tplId)) || D.templatesFor('开工', tool)[0];
    const text = D.fillTemplate(tpl.body, await D.projectVars(p, { tool, todo }));
    return { tpl, text: compare ? text + D.compareFooter(tool) : withFooter(text, D.backfillFooter(p.title), D.BACKFILL_START) };
  };
  D.otherPrompt = async (p, tpl) => {
    const text = D.fillTemplate(tpl.body, await D.projectVars(p, { tool: tpl.tool || '', todo: p.next_action || '' }));
    return tpl.scene === '收工' ? withFooter(text, D.backfillFooter(p.title), D.BACKFILL_START) : text;
  };
  // 比稿选定后，发给被选中的那个 AI
  D.chosenPrompt = (p, tool, scope) => `你做的「${scope || p.title}」这一版被我选中了，其他 AI 的版本落选。请：
1. 以你的版本为准继续：去掉文件名里的「-${D.suffixOf(tool)}」比稿后缀，或者另存一份定稿；
2. 按平时的收工流程更新进度记录、沉淀这次的经验；
3. 告诉我做完了什么、放在哪。` + D.backfillFooter(p.title);

  /* ---------- 「复制成 进度.md 条目」：按看板「更新约定」的格式，进行中 ≤10 行，已交付 ≤5 行 ---------- */
  D.PROGRESS_MARK = { active: '进行中', live: '进行中', done: '已交付', paused: '暂缓', watch: '暂缓' };
  D.progressEntry = p => {
    const delivs = D.delivsOf(p.id), pend = D.sortWaiting(D.waitingOf(p.id));
    const by = (p.last_ai || []).join('、') || '我自己';
    const date = D.today(), st = D.normStatus(p.status);
    const head = `### ${p.title}${p.province && !p.title.includes(p.province) ? `（${p.province}）` : ''}`;
    if (st === 'done' || p.archived_at) {
      const done = delivs.filter(d => d.status === 'done');
      return [head, '',
        `- **状态：** ${p.archived_at ? '已归档' : '已交付'}（${date}）。${(p.summary || '').replace(/\s+/g, ' ').slice(0, 80)}`,
        `- **成品：** ${done.length ? done.map(d => `${D.delivLabel(d)}${d.file_hint ? `（${d.file_hint}）` : ''}`).join('；') : '（未登记交付物）'}`,
        `- **最近经手：** ${by} ｜ ${date}`].join('\n');
    }
    const open = delivs.filter(d => d.status !== 'done'), last = delivs.filter(d => d.status === 'done').pop();
    const ver = open.length ? open.slice(0, 4).map(d => `${D.delivLabel(d)}（${D.delivStatusOf(d.status).label}${d.base ? `，底稿：${d.base}` : ''}）`).join('；') + (open.length > 4 ? ` 等 ${open.length} 件` : '')
      : last ? `${D.delivLabel(last)}（已交付）` : '（还没有交付物）';
    const note = { live: '已上线收尾', watch: '观望，不一定由我做' }[st];
    return [head, '',
      `- **当前版本：** ${ver}`,
      `- **状态：** ${D.PROGRESS_MARK[st] || '进行中'}（${note ? note + '，' : ''}${p.launch_at ? `上线日 ${p.launch_at}${p.launch_tentative ? '（暂定）' : ''}` : '上线日未定'}）`,
      `- **下一步：** ${p.next_action || '（待补：写成可执行的动作）'}`,
      `- **待确认：** ${pend.length ? pend.slice(0, 3).map(x => `${x.question}（${x.ask_whom || '—'}${x.need_by ? `，最晚 ${x.need_by.slice(5)}` : ''}${x.blocking ? '，卡交付' : ''}）`).join('；') + (pend.length > 3 ? ` 等 ${pend.length} 项` : '') : '无'}`,
      `- **最近经手：** ${by} ｜ ${date}`].join('\n');
  };

  /* ---------- 催办话术：按问谁、问什么、最晚哪天要拼一句客气的大白话 ---------- */
  const HONOR = /(老师|总|经理|主任|领导|姐|哥|同学|老板)$/;
  D.nudgeText = x => {
    const p = x.project_id && D.project(x.project_id);
    const name = (x.ask_name || '').trim();
    const who = name ? (HONOR.test(name) ? name : name + '老师') : x.ask_whom === '领导' ? '领导' : '您好';
    const q = String(x.question || '').trim().replace(/[？?。.!！\s]+$/, '');
    const give = /(表|单|名单|文件|素材|图|链接|编号|方案|原文|数据|截图|地址|文案|账号|清单)$/.test(q) || /^(给|提供|发)/.test(q);
    const topic = p ? `${p.title.replace(/[（(].*?[)）]/g, '').trim()}的` : '';
    const ask = give ? `${topic}${q.replace(/^(给|提供|发)(一下)?/, '')}方便今天给一下吗？` : `${topic}${q}，方便今天确认一下吗？`;
    const st = D.pendState(x);
    const pre = (x.nudge_count || 0) >= 1 ? '不好意思再跟您确认一下，' : st.level === 'danger' ? '这边有点赶了，' : '';
    const d = p && D.delivsOf(p.id).filter(v => v.status !== 'done' && v.due_at).sort((a, b) => a.due_at.localeCompare(b.due_at))[0];
    const when = x.need_by ? `${D.fmtDate(x.need_by)}前` : '';
    const why = x.blocking ? (d ? `${d.name || d.type}${when ? when + '' : ''}要用，` : `后面的交付${when ? '，' + when : ''}在等这个，`) : when ? `最晚${when}要，` : '';
    return `${who}，${pre}${ask}${why}谢谢～`;
  };

  /* ---------- 收集箱 → 需求梳理；玩法创意 → 写提案 ---------- */
  D.intakePrompt = (item, tplId) => {
    const t = D.promptById(tplId) || D.templatesFor('需求梳理')[0];
    return withFooter(D.fillTemplate(t.body, { content: item.content, source: item.source || '', today: D.fmtDateW(D.today()) }), D.intakeFooter, D.INTAKE_START);
  };
  D.ideaPrompt = (idea, tplId) => {
    const t = D.promptById(tplId) || D.templatesFor('写玩法提案')[0];
    return D.fillTemplate(t.body, { title: idea.title, week: D.weekLabel(idea.week), mechanism: idea.mechanism || '',
      target: D.labelOf(D.IDEA_TARGETS, idea.target), dev_cost: D.labelOf(D.IDEA_COSTS, idea.dev_cost), notes: idea.notes || '', today: D.fmtDateW(D.today()) });
  };

  /* ---------- 读 AI 输出里的固定格式段落 ---------- */
  const NONE = /^[（(]?(无|没有|没说|暂无|不详|未知)[)）]?$|^[-—]+$/;
  D.readBlock = (text, start, end, keys) => {
    text = String(text || '');
    const s = text.lastIndexOf(start); if (s < 0) return null;
    let body = text.slice(s + start.length);
    const e = body.indexOf(end); if (e >= 0) body = body.slice(0, e);
    const out = {}; let cur = null;
    for (const raw of body.split(/\r?\n/)) {
      const line = raw.replace(/^\s*(?:[-*•·]|\d+[.、)）])\s*/, '').replace(/\*\*/g, '').trim();
      if (!line) continue;
      const m = line.match(/^([^：:｜|]{1,8}?)\s*[：:]\s*(.*)$/);
      if (m && keys.includes(m[1].trim())) { cur = m[1].trim(); out[cur] = []; if (m[2].trim() && !NONE.test(m[2].trim())) out[cur].push(m[2].trim()); continue; }
      if (cur && !NONE.test(line)) out[cur].push(line);
    }
    return out;
  };
  const cells = line => line.split(/[｜|]/).map(x => x.trim());
  const norm = s => String(s || '').replace(/\s+/g, '').toLowerCase();
  const STATUS_WORDS = [[/已交付|交付了|已完成|完成/, 'done'], [/待审|待确认|审核|待领导/, 'review'], [/制作|进行|在做|修改/, 'doing'], [/未开始/, 'todo']];
  const delivStatus = s => (STATUS_WORDS.find(([re]) => re.test(s || '')) || [])[1];
  // 交付物名字 → 交付物类型（认不出就是「其他」）
  D.guessType = name => { const n = norm(name); return D.cfg().deliverable_types.find(t => n.includes(norm(t))) || null; };
  // 回填里的一件「产出」对应项目里的哪件交付物：名字最像的那件（同类型有多件时，优先名字里互相包含的、还没交付的）
  const matchDeliv = (pid, name) => {
    const n = norm(name), list = D.delivsOf(pid);
    return list.find(d => d.name && norm(d.name) === n) || list.find(d => d.name && (n.includes(norm(d.name)) || norm(d.name).includes(n)))
      || list.filter(d => d.status !== 'done').find(d => n.includes(norm(d.type)) || norm(d.type) === n) || list.find(d => n.includes(norm(d.type)));
  };

  // 【回填工作台】→ 一组可勾选的更新
  D.parseBackfill = (text, p, tool) => {
    const B = D.readBlock(text, D.BACKFILL_START, D.BACKFILL_END, ['项目', '下一步', '产出', '待确认', '已确认', '用时']);
    const items = [];
    const push = (label, op, extra = {}) => items.push({ id: items.length, label, op, checked: true, ...extra });
    if (B) {
      const next = (B['下一步'] || []).join('；');
      if (next) push(`下一步改成：${next}`, { op: 'project', data: { next_action: next.slice(0, 300) } });
      const matched = [];
      for (const line of B['产出'] || []) {
        const [name, version, file, status] = cells(line);
        if (!name) continue;
        const st = delivStatus(status), d = matchDeliv(p.id, name);
        const data = {};
        if (version && !NONE.test(version)) data.version = version.slice(0, 20);
        if (file && !NONE.test(file)) data.file_hint = file.slice(0, 300);
        if (st) data.status = st;
        if (d) {
          matched.push(d);
          const bits = [data.version && `版本 ${data.version}`, data.file_hint && `位置 ${data.file_hint}`, st && `状态改成「${D.delivStatusOf(st).label}」`].filter(Boolean);
          if (bits.length) push(`交付物「${D.delivLabel(d)}」：${bits.join('，')}`, { op: 'deliverable', id: d.id, data });
        } else {
          push(`新建交付物「${name}」${bits2(data)}`, { op: 'deliverable', data: { type: D.guessType(name) || '其他', name: name.slice(0, 80), ...data } });
        }
      }
      const waiting = D.waitingOf(p.id);
      for (const line of B['待确认'] || []) {
        const c = cells(line), [who, q, by] = c.length >= 2 ? c : ['', c[0], ''];
        if (!q) continue;
        if (waiting.some(x => norm(x.question) === norm(q))) continue;   // 已经在等的不重复加
        const need = D.parseDateLoose(by);
        push(`新的待确认：${q}（问${who || '—'}${need ? `，最晚 ${D.fmtDate(need)}` : ''}）`, { op: 'pending', data: { question: q.slice(0, 500), ask_whom: (who || '').slice(0, 30) || null, need_by: need } });
      }
      for (const line of B['已确认'] || []) {
        const hit = waiting.find(x => x.question.length >= 2 && (norm(line).includes(norm(x.question)) || norm(x.question).includes(norm(line))));
        if (hit) push(`待确认「${hit.question}」标成已答复：${line}`, { op: 'answer', id: hit.id, answer: line.slice(0, 5000) });
        else push(`记一条已拍板的口径：${line}`, { op: 'decision', data: { content: line.slice(0, 1000), source: `${tool || 'AI'} 汇报` } });
      }
      const time = (B['用时'] || []).join('｜');
      if (time) {
        const [a, b] = cells(time), after = D.parseMinutes(a), before = D.parseMinutes(b);
        if (after != null) {
          const one = matched.length === 1 ? matched[0] : null;
          const name = one ? D.delivLabel(one) : (B['产出'] || [])[0] ? cells(B['产出'][0])[0] : '这次的工作';
          push('记一条提效', { op: 'win', data: { task: `${p.title}：${name}`.slice(0, 200), task_type: one?.type || D.guessType(name) || '其他', tools: tool ? [tool] : [], before_minutes: before, after_minutes: after, deliverable_id: one?.id || null } }, { win: true });
        }
      }
    }
    push('把整段汇报存进项目动态', { op: 'activity', data: { type: 'ai', tool: tool || null, summary: `${tool || 'AI'} 收工汇报：${D.firstLine(text, 80)}`.slice(0, 500), content: String(text).slice(0, 50000) } });
    return { found: !!B, items };
  };
  const bits2 = data => { const b = [data.version && `版本 ${data.version}`, data.file_hint && `位置 ${data.file_hint}`, data.status && `状态「${D.delivStatusOf(data.status).label}」`].filter(Boolean); return b.length ? `：${b.join('，')}` : ''; };

  // 【新建项目】→ 项目 + 交付物 + 待确认
  D.parseIntake = text => {
    const B = D.readBlock(text, D.INTAKE_START, D.INTAKE_END, ['项目名', '省份', '上线日', '一句话需求', '交付物', '待确认']);
    if (!B) return null;
    const one = k => (B[k] || []).join(' ').trim();
    const provRaw = one('省份'), provs = D.cfg().provinces;
    const province = !provRaw || /全国/.test(provRaw) ? null : provs.find(x => provRaw.includes(x) || x.includes(provRaw)) || provRaw.slice(0, 30);
    const launchRaw = one('上线日'), launch = D.parseDateLoose(launchRaw);
    const project = { title: (one('项目名') || '（AI 拆出来的项目）').slice(0, 120), province, launch_at: launch, launch_tentative: launch && /暂定|待定|大概|左右/.test(launchRaw) ? 1 : 0,
      summary: one('一句话需求').slice(0, 2000) || null, status: 'active', priority: 'mid' };
    const deliverables = (B['交付物'] || []).map(line => { const [a, b] = cells(line); const type = D.guessType(a) || D.guessType(b) || '其他'; return { type, name: (b || (type === '其他' ? a : '') || '').slice(0, 80) || null }; }).filter(d => d.type);
    const pendings = (B['待确认'] || []).map(line => { const c = cells(line), [who, q, by] = c.length >= 2 ? c : ['', c[0], '']; return q ? { question: q.slice(0, 500), ask_whom: (who || '').slice(0, 30) || null, need_by: D.parseDateLoose(by) } : null; }).filter(Boolean);
    return { project, deliverables, pendings };
  };

  D.PROJECT_VARS = ['project', 'province', 'kind', 'month', 'launch_at', 'due_at', 'status', 'priority', 'requester', 'summary', 'next_action', 'todo', 'tool', 'deliverables', 'pendings_open', 'pendings_answered', 'links', 'local_paths', 'recent_activities', 'notes', 'today'];
  D.OTHER_VARS = { 需求梳理: ['content', 'source', 'today'], 写玩法提案: ['title', 'week', 'mechanism', 'target', 'dev_cost', 'notes', 'today'] };
})();
