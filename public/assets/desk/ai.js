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
  D.projectVars = async (p, { tool = '', todo = '' } = {}) => {
    const acts = await D.loadActs(p.id);
    const delivs = D.delivsOf(p.id), pend = D.pendingsOf(p.id);
    return {
      project: p.title, province: p.province || '', kind: p.kind || '', month: p.month || '',
      launch_at: p.launch_at ? D.fmtDateW(p.launch_at) : '', due_at: p.due_at ? D.fmtDateW(p.due_at) : '',
      status: D.statusOf(p.status).label, priority: D.priorityOf(p.priority)?.label || '', requester: p.requester || '',
      summary: p.summary || '', next_action: p.next_action || '', todo, tool, today: D.fmtDateW(D.today()), notes: p.notes || '',
      deliverables: lines(delivs.map(d => `${D.delivLabel(d)}：${D.delivStatusOf(d.status).label}${d.due_at ? `，截止 ${D.fmtDate(d.due_at)}` : ''}${d.file_hint ? `（${d.file_hint}）` : ''}`)),
      pendings_open: lines(pend.filter(x => x.status === 'waiting').map(x => `${x.question}（问${x.ask_whom || '—'}${x.ask_name ? ' ' + x.ask_name : ''}，等了 ${D.waitDays(x)} 天${x.blocking ? '，卡交付' : ''}）`)),
      pendings_answered: lines(pend.filter(x => x.status === 'answered').map(x => `${x.question} → ${x.answer || ''}${x.answered_at ? `（${D.fmtDate(x.answered_at)} 确认）` : ''}`)),
      links: lines((p.links || []).map(l => `${l.label || '链接'}：${l.url}`)),
      local_paths: lines(p.local_paths || []),
      recent_activities: lines(acts.slice(0, 5).map(a => `${D.fmtDate(a.happened_at)} ${D.actOf(a.type).label}${a.tool ? `（${a.tool}）` : ''}：${a.summary || D.firstLine(a.content, 60)}`))
    };
  };

  /* ---------- 「复制成 进度.md 条目」：按看板「更新约定」的格式，进行中 ≤10 行，已交付 ≤5 行 ---------- */
  D.PROGRESS_MARK = { need: '进行中', plan: '进行中', proto: '进行中', review: '等待用户确认', docs: '进行中', test: '进行中', live: '进行中', done: '已交付', paused: '暂缓' };
  D.progressEntry = p => {
    const delivs = D.delivsOf(p.id), pend = D.waitingOf(p.id);
    const by = (p.last_ai || []).join('、') || '我自己';
    const date = D.today();
    const head = `### ${p.title}${p.province && !p.title.includes(p.province) ? `（${p.province}）` : ''}`;
    if (p.status === 'done' || p.archived_at) {
      const done = delivs.filter(d => d.status === 'done');
      return [head, '',
        `- **状态：** ${p.archived_at ? '已归档' : '已交付'}（${date}）。${(p.summary || '').replace(/\s+/g, ' ').slice(0, 80)}`,
        `- **成品：** ${done.length ? done.map(d => `${D.delivLabel(d)}${d.file_hint ? `（${d.file_hint}）` : ''}`).join('；') : '（未登记交付物）'}`,
        `- **最近经手：** ${by} ｜ ${date}`].join('\n');
    }
    const open = delivs.filter(d => d.status !== 'done'), last = delivs.filter(d => d.status === 'done').pop();
    const ver = open.length ? open.slice(0, 4).map(d => `${D.delivLabel(d)}（${D.delivStatusOf(d.status).label}）`).join('；') + (open.length > 4 ? ` 等 ${open.length} 件` : '')
      : last ? `${D.delivLabel(last)}（已交付）` : '（还没有交付物）';
    const mark = D.PROGRESS_MARK[p.status] || '进行中';
    return [head, '',
      `- **当前版本：** ${ver}`,
      `- **状态：** ${mark}（${D.statusOf(p.status).label}${p.launch_at ? `，上线日 ${p.launch_at}` : ''}）`,
      `- **下一步：** ${p.next_action || '（待补：写成可执行的动作）'}`,
      `- **待确认：** ${pend.length ? pend.slice(0, 3).map(x => `${x.question}（${x.ask_whom || '—'}${x.blocking ? '，卡交付' : ''}）`).join('；') + (pend.length > 3 ? ` 等 ${pend.length} 项` : '') : '无'}`,
      `- **最近经手：** ${by} ｜ ${date}`].join('\n');
  };

  /* ---------- 催办话术：按问谁、问什么、等了多久拼一句客气的大白话 ---------- */
  const HONOR = /(老师|总|经理|主任|领导|姐|哥|同学|老板)$/;
  D.nudgeText = x => {
    const p = x.project_id && D.project(x.project_id);
    const name = (x.ask_name || '').trim();
    const who = name ? (HONOR.test(name) ? name : name + '老师') : x.ask_whom === '领导' ? '领导' : '您好';
    const q = String(x.question || '').trim().replace(/[？?。.!！\s]+$/, '');
    const give = /(表|单|名单|文件|素材|图|链接|编号|方案|原文|数据|截图|地址|文案|账号)$/.test(q) || /^(给|提供|发)/.test(q);
    const topic = p ? `${p.title.replace(/[（(].*?[)）]/g, '').trim()}的` : '';
    const ask = give ? `${topic}${q.replace(/^(给|提供|发)(一下)?/, '')}方便今天给一下吗？` : `${topic}${q}，方便今天确认一下吗？`;
    const days = D.waitDays(x);
    const pre = (x.nudge_count || 0) >= 1 ? '不好意思再跟您确认一下，' : days >= D.cfg().nudge_days.danger ? '这边有点赶了，' : '';
    const d = p && D.delivsOf(p.id).filter(v => v.status !== 'done' && v.due_at).sort((a, b) => a.due_at.localeCompare(b.due_at))[0];
    const why = x.blocking ? (d ? `${d.name || d.type}要用，` : '后面的交付在等这个，') : '';
    return `${who}，${pre}${ask}${why}谢谢～`;
  };

  /* ---------- 收集箱 → 需求梳理；玩法创意 → 写提案 ---------- */
  D.intakePrompt = (item, tplId) => {
    const t = D.promptById(tplId) || D.templatesFor('需求梳理')[0];
    return D.fillTemplate(t.body, { content: item.content, source: item.source || '', today: D.fmtDateW(D.today()) });
  };
  D.ideaPrompt = (idea, tplId) => {
    const t = D.promptById(tplId) || D.templatesFor('写玩法提案')[0];
    return D.fillTemplate(t.body, { title: idea.title, week: D.weekLabel(idea.week), mechanism: idea.mechanism || '',
      target: D.labelOf(D.IDEA_TARGETS, idea.target), dev_cost: D.labelOf(D.IDEA_COSTS, idea.dev_cost), notes: idea.notes || '', today: D.fmtDateW(D.today()) });
  };

  D.PROJECT_VARS = ['project', 'province', 'kind', 'month', 'launch_at', 'due_at', 'status', 'priority', 'requester', 'summary', 'next_action', 'todo', 'tool', 'deliverables', 'pendings_open', 'pendings_answered', 'links', 'local_paths', 'recent_activities', 'notes', 'today'];
  D.OTHER_VARS = { 需求梳理: ['content', 'source', 'today'], 写玩法提案: ['title', 'week', 'mechanism', 'target', 'dev_cost', 'notes', 'today'] };
})();
