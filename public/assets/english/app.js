/* 英语从零学 · 主程序（数据在 words.js / sentences.js / curriculum.js / phonics.js） */
(function(){
"use strict";

/* =================== 数据整理 =================== */
const LEVELS = window.ENG_LEVELS, TEACHING = window.ENG_TEACHING;
const LV_NAME = i => `${LEVELS[i].cefr} ${LEVELS[i].name}`;
const WORD_LIST = [], seenW = new Set();
for (const [lv, cat, s] of window.ENG_WORDS) for (const it of s.split(";")) {
  const p = it.split("|"); if (p.length < 2) continue;
  const w = p[0].trim(), ipa = p.length === 3 ? p[1] : "", zh = p[p.length-1];
  const k = w.toLowerCase(); if (seenW.has(k)) continue; seenW.add(k);
  WORD_LIST.push({w, ipa, zh, cat, lv});
}
const SENT_LIST = [], seenS = new Set();
for (const [lv, scene, txt] of window.ENG_SENTENCES) for (const line of txt.split("\n")) {
  const [en, zh] = line.split("｜"); if (!en || !zh || seenS.has(en)) continue; seenS.add(en);
  SENT_LIST.push({en: en.trim(), zh: zh.trim(), scene, lv, id: "s:" + en.trim()});
}
const GRAMMAR = window.ENG_GRAMMAR.map(([lv, t, b, ex]) => ({lv, t, b, ex: ex.split("\n").map(l => l.split("｜"))}));
const METHODS = window.ENG_METHODS, PROMPTS = window.ENG_PROMPTS;
const INTERVALS = [0,1,3,7,14,30,60,120];
const MASTER_BOX = 5;

/* =================== 存储 =================== */
const KEY = "eng-zero-v1";
const defaultState = () => ({cards:{}, log:{}, grammarRead:{}, phonics:{}, settings:{newPerDay:10, newSentPerDay:5, rate:0.85, voice:"", level:0}, startDate:today()});
let S;
function load(raw){
  const d = Object.assign(defaultState(), raw || {});
  d.settings = Object.assign(defaultState().settings, d.settings);
  return d;
}
try { S = load(JSON.parse(localStorage.getItem(KEY) || "{}")); } catch(e){ S = defaultState(); }
function save(){ try{ localStorage.setItem(KEY, JSON.stringify(S)); }catch(e){} }

function today(d=new Date()){ return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0"); }
function addDays(n){ const d=new Date(); d.setDate(d.getDate()+n); return today(d); }
function dayLog(){ const t=today(); S.log[t] = Object.assign({reviewed:0,newLearned:0,newSent:0,quiz:0,spoken:0,grammar:0,phonics:0,listen:false,output:false}, S.log[t]||{}); return S.log[t]; }
function streak(){
  let n=0; const d=new Date();
  const active = k => { const l=S.log[k]; return l && (l.reviewed||l.newLearned||l.newSent||l.quiz||l.spoken||l.grammar||l.phonics||l.listen||l.output); };
  if(!active(today(d))) d.setDate(d.getDate()-1);
  while(active(today(d))){ n++; d.setDate(d.getDate()-1); }
  return n;
}
const lvl = () => S.settings.level;

/* =================== 发音 =================== */
let voices = [];
const hasTTS = "speechSynthesis" in window;
function loadVoices(){ voices = (speechSynthesis.getVoices()||[]).filter(v=>/^en/i.test(v.lang)); }
if(hasTTS){ loadVoices(); speechSynthesis.onvoiceschanged = () => { loadVoices(); if(cur==="settings") render(); }; }
function pickVoice(){
  if(S.settings.voice){ const v=voices.find(v=>v.name===S.settings.voice); if(v) return v; }
  return voices.find(v=>v.lang==="en-US" && /Samantha|Google US|Aria|Jenny/i.test(v.name)) || voices.find(v=>v.lang==="en-US") || voices[0];
}
function say(text, rate){ sayMany([[text, rate]]); }
function sayMany(list){
  if(!hasTTS) return toast("你的浏览器不支持朗读，请用 Chrome / Safari / Edge。");
  speechSynthesis.cancel();
  for(const [text, rate] of list){
    const u = new SpeechSynthesisUtterance(text);
    const v = pickVoice(); if(v){ u.voice=v; u.lang=v.lang; } else u.lang="en-US";
    u.rate = rate || S.settings.rate;
    speechSynthesis.speak(u);
  }
}
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
function norm(s){ return s.toLowerCase().replace(/[^a-z' ]/g," ").replace(/\s+/g," ").trim().split(" ").filter(Boolean); }
function listen(target, out){
  if(!SR){ out.innerHTML='<span class="muted">此浏览器不支持语音识别，建议用 Chrome 或 Safari。可以先点 🔊 听，再自己大声读 3 遍。</span>'; return; }
  const r = new SR(); r.lang="en-US"; r.interimResults=false; r.maxAlternatives=3;
  out.innerHTML='<span class="muted">🎙️ 正在听…请读出这句话</span>';
  r.onresult = e => {
    let best="", bestScore=-1; const want=norm(target);
    for(const alt of e.results[0]){
      const said=norm(alt.transcript), sc=Math.round(want.filter(w=>said.includes(w)).length/want.length*100);
      if(sc>bestScore){ bestScore=sc; best=alt.transcript; }
    }
    const said=norm(best);
    const marked = target.split(" ").map(w=>{ const n=norm(w)[0]; return n && !said.includes(n) ? `<u style="color:var(--bad)">${esc(w)}</u>` : esc(w); }).join(" ");
    const col = bestScore>=85?"var(--good)":bestScore>=60?"var(--warn)":"var(--bad)";
    out.innerHTML = `<b style="color:${col}">${bestScore} 分</b> · 识别到：“${esc(best)}”<br><span class="muted">需要再练：</span>${marked}`;
    dayLog().spoken++; save(); updateStreak();
  };
  r.onerror = e => { out.innerHTML = /not-allowed|service-not-allowed/.test(e.error) ? `<span class="muted">麦克风没有开启，打分用不了。请在浏览器设置里允许麦克风；或者点 🔊 听完后自己大声读 3 遍。</span>` : `<span class="muted">没听清（${e.error}），再试一次。</span>`; };
  try{ r.start(); }catch(err){ out.innerHTML='<span class="muted">麦克风打分暂时用不了，请先用 🔊 跟读。</span>'; }
}
function toast(m){ const t=document.createElement("div"); t.className="toast"; t.textContent=m; document.body.appendChild(t); setTimeout(()=>t.remove(),2600); }
function esc(s){ return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }

/* =================== 间隔重复 =================== */
const isSent = k => k.startsWith("s:");
function dueKeys(sent){ const t=today(); return Object.keys(S.cards).filter(k=>isSent(k)===sent && S.cards[k].box>0 && S.cards[k].due<=t); }
const wordByKey = Object.fromEntries(WORD_LIST.map(x=>[x.w,x]));
const sentByKey = Object.fromEntries(SENT_LIST.map(x=>[x.id,x]));
function newWords(){
  const left = Math.max(0, S.settings.newPerDay - dayLog().newLearned);
  const pool = WORD_LIST.filter(x=>!S.cards[x.w]);
  const mine = pool.filter(x=>x.lv===lvl()), rest = pool.filter(x=>x.lv>lvl());
  return [...mine, ...rest].slice(0,left);
}
function newSents(){
  const left = Math.max(0, S.settings.newSentPerDay - dayLog().newSent);
  const pool = SENT_LIST.filter(x=>!S.cards[x.id]);
  const mine = pool.filter(x=>x.lv===lvl()), rest = pool.filter(x=>x.lv>lvl());
  return [...mine, ...rest].slice(0,left);
}
function rate(key, r){
  const isNew = !S.cards[key];
  const c = S.cards[key] || {box:0, due:today()};
  if(r===0){ c.box=1; c.due=today(); }
  else if(r===1){ c.box=Math.max(1,c.box); c.due=addDays(1); }
  else { c.box=Math.min(c.box+1, INTERVALS.length-1); c.due=addDays(INTERVALS[c.box]); }
  S.cards[key]=c;
  const L=dayLog();
  if(isNew){ if(isSent(key)) L.newSent++; else L.newLearned++; } else L.reviewed++;
  save();
}
function level(key){ const c=S.cards[key]; if(!c) return 0; if(c.box>=MASTER_BOX) return 3; if(c.box>=3) return 2; return 1; }
function lvStats(i){
  const ws=WORD_LIST.filter(x=>x.lv===i), ss=SENT_LIST.filter(x=>x.lv===i), gs=GRAMMAR.map((g,j)=>[g,j]).filter(([g])=>g.lv===i);
  return {
    w: ws.filter(x=>S.cards[x.w]).length, wt: ws.length, wm: ws.filter(x=>level(x.w)===3).length,
    s: ss.filter(x=>S.cards[x.id]).length, st: ss.length,
    g: gs.filter(([,j])=>S.grammarRead[j]).length, gt: gs.length
  };
}
const phDoneN = () => PHONICS.filter((_,i)=>S.phonics[i] && S.phonics[i].done).length;
const phNext = () => PHONICS.findIndex((_,i)=>!(S.phonics[i] && S.phonics[i].done));
function nextGrammar(){ const cap=Math.max(1,lvl()); return GRAMMAR.findIndex((g,i)=>g.lv<=cap && !S.grammarRead[i]); }

/* =================== 视图 =================== */
const TABS = [["today","今日"],["road","学习路线"],["method","学习方法"],["sound","发音"],["phon","自然拼读"],["words","单词"],["sent","句子"],["grammar","语法"],["quiz","测验"],["settings","设置"]];
let cur = location.hash.slice(1) || "today";
if(!TABS.some(t=>t[0]===cur)) cur="today";
const app = document.getElementById("app");
function nav(){ document.getElementById("nav").innerHTML = TABS.map(([k,n])=>`<button class="${k===cur?"on":""}" data-k="${k}">${n}</button>`).join(""); }
document.getElementById("nav").onclick = e => { const k=e.target.dataset.k; if(k) go(k); };
function go(k){ cur=k; history.replaceState(null,"","#"+k); render(); window.scrollTo(0,0); }
function updateStreak(){ const n=streak(); document.getElementById("streak").textContent = n ? `🔥 连续 ${n} 天` : "今天开始第 1 天"; }
const lvStyle = i => `style="--lv:${LEVELS[i].color}"`;
const lvTag = i => `<span class="lvtag" ${lvStyle(i)}>${LV_NAME(i)}</span>`;
const bar = (a,b,thin) => `<div class="bar ${thin?"thin":""}"><i style="width:${b?Math.round(a/b*100):0}%"></i></div>`;

const V = {};
V.today = () => {
  const L=dayLog(), dw=dueKeys(false).length, ds=dueKeys(true).length, nw=newWords().length, ns=newSents().length;
  const learned=Object.keys(S.cards).filter(k=>!isSent(k)).length, sl=Object.keys(S.cards).filter(isSent).length;
  const nextG=nextGrammar(), pn=phNext(), lv=lvl(), info=LEVELS[lv];
  const lesson = (lv===0 && pn>=0)
    ? {label:"学一课自然拼读", info:`第 ${pn+1} 课：${PHONICS[pn].t}`, act:"phon", auto:L.phonics>0}
    : {label:"学一课语法", info: nextG<0? "本级语法都学完了，可以复习或升级" : `${GRAMMAR[nextG].t}`, act:"grammar", auto:L.grammar>0};
  const tasks = [
    {label:"复习单词卡", info: dw? `${dw} 个到期，约 ${Math.ceil(dw/6)} 分钟` : (L.reviewed? "今天的复习做完了 ✓" : "今天没有到期的词 ✓"), act:"words", auto: dw===0},
    {label:`学 ${S.settings.newPerDay} 个新词`, info:`今天已学 ${L.newLearned} / ${S.settings.newPerDay}（${LV_NAME(lv)} 词库）`, act:"words", auto: L.newLearned>=S.settings.newPerDay || nw===0 && L.newLearned>0},
    {label:`句子卡：复习 + ${S.settings.newSentPerDay} 个新句`, info: `到期 ${ds} 句 · 今天新学 ${L.newSent} / ${S.settings.newSentPerDay}`, act:"sent", auto: ds===0 && (L.newSent>=S.settings.newSentPerDay || ns===0)},
    lesson,
    {label:"跟读 5 个句子", info:`今天已跟读 ${L.spoken} / 5（用 🎙️ 打分）`, act:"sent", auto: L.spoken>=5},
    {label:"输入：听 / 看英语", info:`${lv<2?"15":lv<4?"20–30":"30"} 分钟。推荐：${info.input[0]}。完成后手动打勾`, manual:"listen", auto:L.listen},
    lv<2 ? {label:"做一次小测验", info: L.quiz? `今天已做 ${L.quiz} 次` : "10 道题，检验学过的词", act:"quiz", auto: L.quiz>0}
         : {label:"输出：写或说", info: lv<3?"用英语写 3 句日记，交给 AI 修改":"和 AI 英语对话 10 分钟（「学习方法」页有提示词）", manual:"output", auto:L.output, act:"method"}
  ];
  const doneN = tasks.filter(t=>t.auto).length, st=lvStats(lv);
  return `
  <h1>今天学什么</h1>
  <p class="sub">按顺序完成下面 ${tasks.length} 件事，大约 ${lv<2?45:60} 分钟。每天坚持，比一次学很久更有用。</p>
  <div class="grid g4">
    <div class="card stat"><b>${doneN}/${tasks.length}</b><span>今日任务</span></div>
    <div class="card stat"><b>${learned}</b><span>已学单词</span></div>
    <div class="card stat"><b>${sl}</b><span>已学句子</span></div>
    <div class="card stat"><b>${streak()}</b><span>连续天数</span></div>
  </div>
  <h2>今日任务</h2>
  <div class="card">${tasks.map(t=>`<div class="task">
      <button class="check ${t.auto?"done":""}" ${t.manual?`data-manual="${t.manual}"`:"disabled"} aria-label="完成">${t.auto?"✓":""}</button>
      <div class="t"><b>${t.label}</b><small>${t.info}</small></div>
      ${t.act?`<button class="btn sm ${t.auto?"":"primary"}" data-go="${t.act}">${t.auto?"再练":"开始"}</button>`:""}
    </div>`).join("")}</div>
  <h2>你现在的级别</h2>
  <div class="card lvcard cur" ${lvStyle(lv)}>
    <div class="lvhead">${lvTag(lv)}<h3>${info.time}</h3></div>
    <div>${info.goal}</div>
    <div class="prog">
      <div class="pl"><span>本级单词</span><span>${st.w} / ${st.wt}</span></div>${bar(st.w,st.wt,1)}
      <div class="pl"><span>本级句子</span><span>${st.s} / ${st.st}</span></div>${bar(st.s,st.st,1)}
      ${lv===0?`<div class="pl"><span>自然拼读</span><span>${phDoneN()} / ${PHONICS.length} 课</span></div>${bar(phDoneN(),PHONICS.length,1)}`
        :`<div class="pl"><span>本级语法</span><span>${st.g} / ${st.gt}</span></div>${bar(st.g,st.gt,1)}`}
    </div>
    <div class="muted" style="font-size:14px;margin-top:10px">过关标准：${info.pass}</div>
    <div class="row" style="margin-top:12px"><button class="btn sm" data-go="road">查看完整路线 →</button>
    ${lv<LEVELS.length-1 && st.w>=st.wt*0.8 && st.s>=st.st*0.8 ? `<button class="btn sm primary" data-setlv="${lv+1}">升到 ${LV_NAME(lv+1)}</button>`:""}</div>
  </div>`;
};

V.road = () => {
  const lv=lvl();
  return `<h1>英语学习路线</h1>
  <p class="sub">从零开始到高级，一共 6 个级别，对应欧洲语言共同参考框架（CEFR）的 A1–C1。每天学 45–60 分钟，大约 3 年可以达到职场自如使用的水平。级别之间可以重叠，不用等前一级 100% 完成。</p>
  <div class="grid">${LEVELS.map((L,i)=>{ const st=lvStats(i); return `<div class="card lvcard ${i===lv?"cur":""}" ${lvStyle(i)}>
    <div class="lvhead">${lvTag(i)}<h3>${L.time}</h3>${i===lv?`<span class="muted" style="font-size:13px">· 你在这里</span>`:""}</div>
    <div>${L.goal}</div>
    <dl class="kv">
      <dt>学完能做到</dt><dd>${L.can.join("；")}</dd>
      <dt>每天学什么</dt><dd>${L.daily}</dd>
      <dt>推荐材料</dt><dd>${L.input.join("；")}</dd>
      <dt>过关标准</dt><dd>${L.pass}</dd>
    </dl>
    <div class="teach"><b>这一级怎么学：</b>${TEACHING[i]}</div>
    <div class="prog">
      <div class="pl"><span>单词 ${st.w} / ${st.wt}</span><span>句子 ${st.s} / ${st.st}</span></div>${bar(st.w+st.s,st.wt+st.st,1)}
    </div>
    ${i!==lv?`<div style="margin-top:10px"><button class="btn sm" data-setlv="${i}">设为当前级别</button></div>`:""}
  </div>`; }).join("")}</div>
  <h2>几条最重要的原则</h2>
  <div class="grid g2">
    <div class="card"><h3>天天学，别断</h3>每天 30 分钟远胜周末突击 5 小时。用「今日」页打卡。</div>
    <div class="card"><h3>先听后说，大声读</h3>每个词、每句话都先点 🔊 听，再张嘴跟读。不出声的学习很难变成口语。</div>
    <div class="card"><h3>跟着复习走</h3>遗忘是正常的。系统会在你快忘的时候提醒复习，跟着做就能记住。</div>
    <div class="card"><h3>输入要够多</h3>找「大部分能懂、少部分不懂」的材料反复听、反复看，这是提高最快的方式。</div>
  </div>`;
};

V.method = () => {
  const lvTxt = `${LEVELS[lvl()].cefr} (${["beginner","beginner","elementary","intermediate","upper-intermediate","advanced"][lvl()]})`;
  return `<h1>学习方法</h1>
  <p class="sub">这些方法都有研究和大量学习者的经验支持。不用全用，每个级别挑 3–4 个坚持下去。</p>
  <div class="card"><h3>学英语的四条底层规律</h3>
    <ol style="margin:6px 0;padding-left:20px">
      <li><b>听懂了才学得会</b>：大量接触能听懂大部分的材料（可理解输入），是语言能力的主要来源。</li>
      <li><b>想起来才记得住</b>：考自己（主动回忆）比反复看有效；快忘时复习（间隔重复）比集中背有效。</li>
      <li><b>说出来才用得上</b>：输出逼你发现「我其实不会说」，这正是进步的地方。</li>
      <li><b>天天做才有积累</b>：语言是习惯，每天 30 分钟远好过每周一次 4 小时。</li>
    </ol></div>
  <h2>方法库</h2>
  <div class="grid g2">${METHODS.map(m=>`<div class="card method"><h3>${m.name}<small>${m.tag}</small></h3>
    <div class="why">${m.why}</div><ol>${m.how.map(x=>`<li>${x}</li>`).join("")}</ol><div class="use">🧰 ${m.tool}</div></div>`).join("")}</div>
  <h2>AI 陪练提示词</h2>
  <p class="muted" style="margin-top:-4px">复制后粘贴给 Claude 等 AI，已经按你当前的级别（${LV_NAME(lvl())}）填好。花括号里的内容换成你自己的。</p>
  <div class="grid g2">${PROMPTS.map((p,i)=>{ const t=p.text.replace(/\{level\}/g,lvTxt); return `<div class="card prompt"><h3>${p.name}</h3><pre id="pr-${i}">${esc(t)}</pre>
    <button class="btn sm" data-copy="${i}">复制提示词</button></div>`; }).join("")}</div>
  <h2>常见误区</h2>
  <div class="card"><ul style="margin:0;padding-left:20px">
    <li><b>只背单词书</b>：单词要在句子和场景里学，孤立的词很难用出来。</li>
    <li><b>等「准备好了」才开口</b>：从第一天就大声读、跟读，错了也没关系。</li>
    <li><b>只学不复习</b>：不复习的新词，一周后能记住的不到三成。</li>
    <li><b>材料太难</b>：一句都听不懂的材料没有学习效果，换简单的。</li>
    <li><b>追求一次全懂</b>：同一个材料看三遍，比三个材料各看一遍收获大。</li>
    <li><b>语法学太多太早</b>：先会用常见句型，再回头理解语法规则。</li>
  </ul></div>
  <h2>级别和常见考试的大致对照</h2>
  <div class="card tbl"><table>
    <tr><th>级别</th><th>CEFR</th><th>雅思</th><th>托业</th><th>大概能做什么</th></tr>
    <tr><td>起步 / 基础</td><td>A1</td><td>2–3</td><td>120–220</td><td>简单自我介绍、日常短句</td></tr>
    <tr><td>日常交流</td><td>A2</td><td>3.5–4</td><td>225–545</td><td>独立旅游、简单闲聊</td></tr>
    <tr><td>独立表达</td><td>B1</td><td>4.5–5.5</td><td>550–780</td><td>表达观点、日常工作沟通</td></tr>
    <tr><td>商务职场</td><td>B2</td><td>5.5–6.5</td><td>785–940</td><td>开会、邮件、汇报、谈判</td></tr>
    <tr><td>高级精通</td><td>C1</td><td>7–8</td><td>945+</td><td>复杂话题自如表达</td></tr>
  </table><p class="muted" style="font-size:13px;margin-bottom:0">对照是大致范围，各机构的换算略有不同。</p></div>`;
};

V.sound = () => `<h1>发音入门</h1>
  <p class="sub">点击字母听读音：先读字母名，再读例词。跟着大声读 3 遍。</p>
  <div class="letters">${LETTERS.map(([L,w,s])=>`<div class="letter" data-say="${L}. ${w}"><b>${L} ${L.toLowerCase()}</b><small>${w} · ${s}</small></div>`).join("")}</div>
  <h2>中国人最容易读错的音</h2>
  <div class="grid g2">${HARD_SOUNDS.map(h=>`<div class="card"><h3>/${h.s}/</h3><div class="muted" style="font-size:14px;margin-bottom:8px">${h.tip}</div>
    <div class="row">${h.w.map(w=>`<button class="btn sm" data-say="${w}">🔊 ${w}</button>`).join("")}</div></div>`).join("")}</div>
  <h2>下一步：自然拼读</h2>
  <div class="card row" style="justify-content:space-between"><span>字母读熟以后，学 7 课自然拼读，看到生词也能读出来。已过关 ${phDoneN()} / ${PHONICS.length} 课。</span>
  <button class="btn primary sm" data-go="phon">去学拼读 →</button></div>`;

/* ---------- 自然拼读 ---------- */
let phOpen=-1, phQ=null, blendTimers=[];
V.phon = () => {
  if(phOpen<0) return `<h1>自然拼读 7 课</h1>
  <p class="sub">学会字母和字母组合在单词里发什么音，看到没见过的词也能读出来。按顺序学，每课最后有过关测验，${PH_N} 题答对 ${PH_PASS} 题就算通过。</p>
  <div class="grid">${PHONICS.map((p,i)=>{ const st=S.phonics[i];
    return `<button class="card plist" data-ph="${i}"><span class="pn">${i+1}</span><span class="txt"><b>${p.t}</b><small>${p.sum}</small></span>
    <span class="pst ${st&&st.done?"ok":""}">${st&&st.done?"已过关":st?`最好 ${st.best}/${PH_N}`:"未开始"}</span></button>`; }).join("")}</div>
  <p class="muted" style="font-size:14px">说明：电脑朗读没法单独发出一个音（点 c 会读成字母名 /siː/），所以点击时读的是例词。请留意例词里对应字母的那个音，跟着模仿。</p>`;
  const L=PHONICS[phOpen];
  if(phQ){
    if(phQ.i>=phQ.qs.length){
      const pass=phQ.right>=PH_PASS, nx=phOpen+1<PHONICS.length?phOpen+1:-1;
      return `<h1>第 ${phOpen+1} 课测验结果</h1><div class="card" style="text-align:center;padding:30px">
        <div style="font-size:44px;font-weight:700">${phQ.right} / ${phQ.qs.length}</div>
        <p>${pass?"过关了！":`差一点，答对 ${PH_PASS} 题过关。回去再听几遍发音表和拼读练习。`}</p>
        ${phQ.wrong.length?`<p class="muted">听错的词：${phQ.wrong.map(w=>`<a href="#" data-say="${w}">${w} 🔊</a>`).join("、")}</p>`:""}
        <div class="row" style="justify-content:center">
          ${pass&&nx>=0?`<button class="btn primary" data-ph="${nx}">下一课 →</button>`:""}
          <button class="btn ${pass?"":"primary"}" id="phqstart">再测一次</button>
          <button class="btn" id="phqback">回到本课</button></div></div>`;
    }
    const q=phQ.qs[phQ.i];
    return `<h1>第 ${phOpen+1} 课 · 过关测验</h1>
    <div class="bar" style="margin:12px 0"><i style="width:${phQ.i/phQ.qs.length*100}%"></i></div>
    <div class="muted" style="font-size:14px">第 ${phQ.i+1} / ${phQ.qs.length} 题 · 答对 ${phQ.right}</div>
    <div class="card flash" style="min-height:170px;margin-top:10px">
      <div><button class="icon bigicon" id="phreplay" aria-label="再听一遍">🔊</button></div>
      <div class="muted">听发音，选出正确的拼写</div>
      <div><button class="btn sm" id="phslow">🐢 慢速再听</button></div></div>
    <div class="opts">${q.opts.map(o=>`<button class="opt" data-pho="${o}" style="font-size:20px;text-align:center">${o}</button>`).join("")}</div>
    <div style="text-align:center;margin-top:14px" id="phnext"></div>`;
  }
  const st=S.phonics[phOpen];
  return `<div class="row" style="margin-top:16px"><button class="btn sm" id="phback">← 全部课程</button></div>
  <h1>第 ${phOpen+1} 课 · ${L.t}</h1>
  <p class="sub">${st&&st.done?`✅ 已于 ${st.done} 过关`:"学完发音表和拼读练习，再做过关测验。"}</p>
  <div class="card"><h3>规律</h3><div>${L.rule}</div></div>
  <h2>发音表</h2><p class="muted" style="font-size:14px;margin-top:-4px">点例词听发音，每个跟着读 3 遍。</p>
  <div class="grid g2">${L.units.map(s=>{ const [g,ipa,w,tip]=s.split("|");
    return `<div class="card unit"><div class="row" style="align-items:baseline"><b class="gph">${g}</b><span class="muted">/${ipa}/</span></div>
    <div class="row" style="margin-top:6px">${w.split(",").map(x=>`<button class="btn sm" data-say="${x}">🔊 ${x}</button>`).join("")}</div>
    ${tip?`<small class="muted" style="display:block;margin-top:6px">${tip}</small>`:""}</div>`; }).join("")}</div>
  ${L.pairs?`<h2>对比着听</h2><p class="muted" style="font-size:14px;margin-top:-4px">左边没有 e，右边加了 e。听听元音怎么变。</p>
    <div class="wl">${L.pairs.map(([a,b])=>`<div class="wi" style="cursor:default;justify-content:center"><button class="btn sm" data-say="${a}">${a}</button><span class="muted">→</span><button class="btn sm" data-say="${b}">${b}</button></div>`).join("")}</div>`:""}
  ${L.blends.length?`<h2>拼读练习</h2><p class="muted" style="font-size:14px;margin-top:-4px">先自己一个音一个音读，再连起来。然后点「拼读」，看方块依次亮起，听一遍慢速、一遍正常速度。</p>
    <div class="card">${L.blends.map((b,k)=>{ const seg=parseB(b);
      return `<div class="bl"><div class="tiles" id="bt-${k}">${seg.map(([g,p])=>`<span class="tile ${p==="-"?"silent":""}"><b>${g}</b><small>${p==="-"?"不发音":"/"+p+"/"}</small></span>`).join("")}</div>
      <span class="bw">${seg.map(s=>s[0]).join("")}</span><button class="btn sm" data-blend="${k}">▶ 拼读</button></div>`; }).join("")}</div>`:""}
  <h2>过关测验</h2>
  <div class="card row" style="justify-content:space-between"><span>听 ${PH_N} 个单词，选出正确拼写，答对 ${PH_PASS} 个过关。</span><button class="btn primary" id="phqstart">开始测验</button></div>`;
};
function blend(k){
  blendTimers.forEach(clearTimeout); blendTimers=[];
  document.querySelectorAll(".tile.lit").forEach(t=>t.classList.remove("lit"));
  const seg=parseB(PHONICS[phOpen].blends[k]), word=seg.map(s=>s[0]).join("");
  const tiles=[...document.querySelectorAll(`#bt-${k} .tile`)], step=550;
  tiles.forEach((t,j)=>blendTimers.push(setTimeout(()=>{ tiles.forEach(x=>x.classList.remove("lit")); t.classList.add("lit"); }, j*step)));
  blendTimers.push(setTimeout(()=>{ tiles.forEach(x=>x.classList.add("lit")); sayMany([[word,0.5],[word]]); }, tiles.length*step));
  blendTimers.push(setTimeout(()=>tiles.forEach(x=>x.classList.remove("lit")), tiles.length*step+2600));
}
function phStart(){
  const gs=[...PHONICS[phOpen].quiz].sort(()=>Math.random()-.5), qs=[];
  for(let j=0;j<PH_N;j++){ const g=gs[j%gs.length]; qs.push({ans:g[Math.floor(Math.random()*g.length)], opts:[...g].sort(()=>Math.random()-.5)}); }
  phQ={qs,i:0,right:0,answered:false,wrong:[]};
  render(); window.scrollTo(0,0); setTimeout(()=>say(qs[0].ans),200);
}
function phAnswer(o, el){
  if(phQ.answered) return; phQ.answered=true;
  const q=phQ.qs[phQ.i];
  document.querySelectorAll("[data-pho]").forEach(b=>{ if(b.dataset.pho===q.ans) b.classList.add("right"); });
  if(o===q.ans) phQ.right++; else { el.classList.add("wrong"); phQ.wrong.push(q.ans); }
  say(q.ans);
  document.getElementById("phnext").innerHTML=`<button class="btn primary" id="phqgo">${phQ.i+1<phQ.qs.length?"下一题 →":"看结果"}</button>`;
}
function phNextQ(){
  phQ.i++; phQ.answered=false;
  if(phQ.i>=phQ.qs.length){
    const prev=S.phonics[phOpen]||{};
    S.phonics[phOpen]={best:Math.max(prev.best||0,phQ.right), done: prev.done || (phQ.right>=PH_PASS?today():null)};
    dayLog().phonics++; save(); render(); return;
  }
  render(); setTimeout(()=>say(phQ.qs[phQ.i].ans),200);
}

/* ---------- 卡片练习（单词 / 句子共用） ---------- */
let session = null; // {kind:"w"|"s", queue:[key], total, show}
function startSession(kind){
  const q = kind==="w" ? [...dueKeys(false), ...newWords().map(x=>x.w)] : [...dueKeys(true), ...newSents().map(x=>x.id)];
  session = {kind, queue:q, total:q.length, show:false};
  render(); window.scrollTo(0,0); speakCurrent();
}
function speakCurrent(){ if(session && session.kind==="w" && session.queue[0]) setTimeout(()=>say(session.queue[0]),150); }
function sessionView(){
  const total=session.total, done=total-session.queue.length, key=session.queue[0], isNew=!S.cards[key];
  const head = `<div class="bar" style="margin:12px 0"><i style="width:${done/total*100}%"></i></div>`;
  const btns = session.show
    ? `<button class="btn bad" data-rate="0">不会</button><button class="btn warn" data-rate="1">有点模糊</button><button class="btn good" data-rate="2">会了 ✓</button>`
    : `<button class="btn primary" id="reveal">显示答案（空格键）</button>`;
  let body;
  if(session.kind==="w"){
    const x=wordByKey[key] || {w:key, zh:"", ipa:"", cat:"", lv:0};
    body = `<h1>${isNew?"新单词":"复习单词"}</h1>${head}
    <div class="muted" style="font-size:14px">${done} / ${total} · ${lvTag(x.lv)} ${x.cat}</div>
    <div class="card flash" style="margin-top:10px">
      <div class="w">${esc(x.w)}</div>
      <div class="ipa">${x.ipa?`/${x.ipa}/ `:""}<button class="icon" style="display:inline-grid;vertical-align:middle" data-say="${esc(x.w)}" aria-label="朗读">🔊</button></div>
      ${session.show?`<div class="zh">${x.zh}</div>`:`<div class="muted">先想想它是什么意思，大声读一遍</div>`}
    </div>`;
  } else {
    const x=sentByKey[key] || {en:key.slice(2), zh:"", scene:"", lv:0};
    body = `<h1>${isNew?"新句子":"复习句子"}</h1>${head}
    <div class="muted" style="font-size:14px">${done} / ${total} · ${lvTag(x.lv)} ${x.scene}</div>
    <div class="card flash" style="margin-top:10px">
      <div class="sc-front">${x.zh}</div>
      ${session.show?`<div class="sc-back">${esc(x.en)} <button class="icon" style="display:inline-grid;vertical-align:middle" data-say="${esc(x.en)}" aria-label="朗读">🔊</button></div>
        <div class="row" style="justify-content:center"><button class="btn sm" data-micx="${esc(x.en)}">🎙️ 跟读打分</button></div><div class="score" id="sc-x"></div>`
      :`<div class="muted">${isNew?"新句子：先点「显示答案」听一遍，跟读 3 遍":"用英语说出来，再看答案"}</div>`}
    </div>`;
  }
  return body + `<div class="row" style="justify-content:center;margin-top:14px">${btns}</div>
    <p class="muted" style="text-align:center;font-size:13px;margin-top:14px">「不会」的卡片会在本轮最后再出现一次 · 快捷键：空格=显示，1 / 2 / 3=评分</p>
    <div style="text-align:center"><button class="btn sm" id="quit">结束本轮</button></div>`;
}
function doRate(r){
  const key=session.queue.shift(); rate(key, r);
  if(r===0) session.queue.push(key);
  session.show=false;
  if(!session.queue.length){ const k=session.kind; session=null; render();
    app.insertAdjacentHTML("afterbegin",`<div class="card" style="margin-top:16px;background:var(--good-soft);border-color:var(--good)">🎉 本轮完成！${k==="w"?"去「测验」检验一下吧。":"去跟读打分练练发音吧。"}</div>`); }
  else { render(); speakCurrent(); }
  updateStreak();
}
function reveal(){ session.show=true; render(); if(session.kind==="s"){ const x=sentByKey[session.queue[0]]; if(x) say(x.en); } }

/* ---------- 单词 ---------- */
let wordLv = null, wordCat = "全部";
V.words = () => {
  if(session && session.kind==="w" && session.queue.length) return sessionView();
  const dw=dueKeys(false).length, nw=newWords().length, wl = wordLv===null ? lvl() : wordLv;
  const cats=[...new Set(WORD_LIST.filter(x=>x.lv===wl).map(x=>x.cat))];
  if(wordCat!=="全部" && !cats.includes(wordCat)) wordCat="全部";
  const list = WORD_LIST.filter(x=>x.lv===wl && (wordCat==="全部"||x.cat===wordCat)), st=lvStats(wl);
  return `<h1>单词</h1>
  <p class="sub">共 ${WORD_LIST.length} 个词，分 6 级。新词从你当前级别（${LV_NAME(lvl())}）的词库里按顺序出，学完自动接下一级。答「会了」的词，间隔 1→3→7→14→30→60 天再出现。</p>
  <div class="card row" style="justify-content:space-between">
    <div><b>到期复习 ${dw}</b> · <b>今日新词 ${nw}</b></div>
    <button class="btn primary" id="startw" ${dw+nw?"":"disabled"}>${dw+nw?"开始学习":"今天都学完了 🎉"}</button>
  </div>
  <h2>词库</h2>
  <div class="lvsel">${LEVELS.map((L,i)=>`<button class="chip ${i===wl?"on":""}" ${lvStyle(i)} data-wlv="${i}">${LV_NAME(i)}</button>`).join("")}</div>
  <div class="muted" style="font-size:14px;margin-bottom:8px">${LV_NAME(wl)}：${st.wt} 个词，已学 ${st.w}，已掌握 ${st.wm}</div>
  <div class="chips">${["全部",...cats].map(c=>`<button class="chip ${c===wordCat?"on":""}" data-cat="${c}">${c}</button>`).join("")}</div>
  <div class="row muted" style="font-size:13px;margin-bottom:8px;gap:14px">
    <span><span class="dot-i"></span> 未学</span><span><span class="dot-i l1"></span> 学习中</span><span><span class="dot-i l2"></span> 熟悉</span><span><span class="dot-i l3"></span> 已掌握</span>
  </div>
  <div class="wl">${list.map(x=>`<div class="wi" data-say="${esc(x.w)}"><span class="dot l${level(x.w)}"></span><b>${esc(x.w)}</b><small>${x.zh}</small></div>`).join("")}</div>`;
};

/* ---------- 句子 ---------- */
let sentLv = null;
V.sent = () => {
  if(session && session.kind==="s" && session.queue.length) return sessionView();
  const ds=dueKeys(true).length, ns=newSents().length, sl = sentLv===null ? lvl() : sentLv;
  const scenes=[...new Set(SENT_LIST.filter(x=>x.lv===sl).map(x=>x.scene))];
  return `<h1>句子</h1>
  <p class="sub">共 ${SENT_LIST.length} 个实用句子，按级别和场景排好。两种练法：上面的「句子卡」看中文说英文（主动回忆），下面的场景列表点 🔊 听、点 🎙️ 跟读打分。${SR?"":"<br><b>提示：</b>当前浏览器不支持语音识别，可以只用 🔊 跟读。"}</p>
  <div class="card row" style="justify-content:space-between">
    <div><b>句子卡：到期 ${ds}</b> · <b>今日新句 ${ns}</b><br><small class="muted">今日已跟读 ${dayLog().spoken} 句</small></div>
    <div class="row"><button class="btn sm" id="slow">🐢 慢速：${S.settings.rate<=0.7?"开":"关"}</button>
    <button class="btn primary" id="starts" ${ds+ns?"":"disabled"}>${ds+ns?"开始句子卡":"今天都练完了 🎉"}</button></div>
  </div>
  <h2>场景句库</h2>
  <div class="lvsel">${LEVELS.map((L,i)=>`<button class="chip ${i===sl?"on":""}" ${lvStyle(i)} data-slv="${i}">${LV_NAME(i)}</button>`).join("")}</div>
  ${scenes.map((sc,gi)=>{ const items=SENT_LIST.map((x,i)=>[x,i]).filter(([x])=>x.lv===sl&&x.scene===sc);
    const learned=items.filter(([x])=>S.cards[x.id]).length;
    return `<details class="card lesson" ${gi===0?"open":""}><summary><span class="scene-h">${sc}<small>${learned} / ${items.length} 已学</small></span></summary>
    ${items.map(([x,i])=>`<div class="sent"><button class="icon" data-say="${esc(x.en)}" aria-label="朗读">🔊</button>
      <button class="icon" data-mic="${i}" title="跟读打分" aria-label="跟读打分">🎙️</button>
      <div class="txt"><div class="en">${esc(x.en)}</div><div class="zh">${x.zh}</div><div class="score" id="sc-${i}"></div></div></div>`).join("")}
  </details>`; }).join("")}`;
};

/* ---------- 语法 ---------- */
V.grammar = () => {
  const nx=nextGrammar();
  return `<h1>语法</h1>
  <p class="sub">共 ${GRAMMAR.length} 课，按级别排好。每 2–3 天学一课，读完例句后点「我学完了」，并自己仿写 3 个句子。不懂的语法点，可以用「学习方法」页的提示词让 AI 再讲一遍。</p>
  ${[1,2,3,4,5].map(lv=>{ const items=GRAMMAR.map((g,i)=>[g,i]).filter(([g])=>g.lv===lv); const done=items.filter(([,i])=>S.grammarRead[i]).length;
    return `<h2 class="row">${lvTag(lv)} <span>${LEVELS[lv].name}</span><span class="muted" style="font-size:14px;font-weight:400">${done} / ${items.length}</span></h2>
    ${items.map(([g,i])=>`<details class="card lesson" ${i===nx?"open":""}>
      <summary>${S.grammarRead[i]?"✅ ":""}${g.t}</summary>
      <p>${g.b}</p>
      ${g.ex.map(([en,zh])=>`<div class="sent"><button class="icon" data-say="${esc(en)}" aria-label="朗读">🔊</button><div class="txt"><div class="en">${esc(en)}</div><div class="zh">${zh||""}</div></div></div>`).join("")}
      <div style="margin-top:10px">${S.grammarRead[i]?`<span class="muted">学完于 ${S.grammarRead[i]}</span>`:`<button class="btn primary sm" data-gram="${i}">我学完了</button>`}</div>
    </details>`).join("")}`; }).join("")}`;
};

/* ---------- 测验 ---------- */
let quiz=null;
function makeQuiz(){
  let pool = WORD_LIST.filter(x=>S.cards[x.w]);
  if(pool.length<8) pool = WORD_LIST.filter(x=>x.lv===lvl()).slice(0,30);
  const qs=[];
  for(const x of [...pool].sort(()=>Math.random()-.5).slice(0,10)){
    const type=["en2zh","zh2en","listen"][Math.floor(Math.random()*3)];
    const same = WORD_LIST.filter(y=>y.w!==x.w && y.zh!==x.zh && y.lv===x.lv);
    const opts=[x,...same.sort(()=>Math.random()-.5).slice(0,3)].sort(()=>Math.random()-.5);
    qs.push({x,type,opts});
  }
  quiz={qs,i:0,right:0,answered:false,wrong:[]};
}
V.quiz = () => {
  const n=Object.keys(S.cards).filter(k=>!isSent(k)).length;
  if(!quiz) return `<h1>小测验</h1><p class="sub">10 道题：看英文选中文、看中文选英文、听音选词。题目来自你学过的单词。</p>
    <div class="card"><p>${n>=8?`将从你已学的 ${n} 个单词里出题。`:`你学过的词还不到 8 个，先用 ${LV_NAME(lvl())} 词库的前 30 个词出题。`}</p>
    <button class="btn primary" id="qstart">开始测验</button></div>`;
  if(quiz.i>=quiz.qs.length) return `<h1>测验结果</h1><div class="card" style="text-align:center;padding:30px">
      <div style="font-size:44px;font-weight:700">${quiz.right} / ${quiz.qs.length}</div>
      <p>${quiz.right>=9?"太棒了！":quiz.right>=7?"不错，继续保持！":"错的词已经安排明天复习，别灰心。"}</p>
      ${quiz.wrong.length?`<p class="muted">答错的词：${quiz.wrong.map(x=>`<b>${esc(x.w)}</b> ${x.zh}`).join("、")}</p>`:""}
      <button class="btn primary" id="qstart">再来一次</button></div>`;
  const q=quiz.qs[quiz.i];
  const prompt = q.type==="en2zh" ? `<div class="w">${esc(q.x.w)}</div><div class="muted">选出正确的中文意思</div>`
    : q.type==="zh2en" ? `<div class="w" style="font-size:30px">${q.x.zh}</div><div class="muted">选出对应的英文</div>`
    : `<div><button class="icon bigicon" data-say="${esc(q.x.w)}" aria-label="朗读">🔊</button></div><div class="muted">听发音，选出这个词</div>`;
  return `<h1>小测验</h1>
  <div class="bar" style="margin:12px 0"><i style="width:${quiz.i/quiz.qs.length*100}%"></i></div>
  <div class="muted" style="font-size:14px">第 ${quiz.i+1} / ${quiz.qs.length} 题 · 答对 ${quiz.right}</div>
  <div class="card flash" style="min-height:180px;margin-top:10px">${prompt}</div>
  <div class="opts">${q.opts.map((o,k)=>`<button class="opt" data-opt="${k}">${q.type==="en2zh"?o.zh:esc(o.w)}</button>`).join("")}</div>
  <div style="text-align:center;margin-top:14px" id="qnext"></div>`;
};
function answer(k, el){
  if(quiz.answered) return; quiz.answered=true;
  const q=quiz.qs[quiz.i], ok=q.opts[k].w===q.x.w;
  document.querySelectorAll(".opt").forEach((b,j)=>{ if(q.opts[j].w===q.x.w) b.classList.add("right"); });
  if(ok) quiz.right++; else { el.classList.add("wrong"); quiz.wrong.push(q.x);
    if(S.cards[q.x.w]){ S.cards[q.x.w].box=1; S.cards[q.x.w].due=addDays(1); save(); } }
  say(q.x.w);
  document.getElementById("qnext").innerHTML = `<div style="margin-bottom:8px"><b>${esc(q.x.w)}</b> ${q.x.ipa?`/${q.x.ipa}/ `:""}${q.x.zh}</div><button class="btn primary" id="qgo">下一题 →</button>`;
}

/* ---------- 设置 ---------- */
V.settings = () => `<h1>设置</h1>
  <div class="card">
    <label class="f"><span>当前级别<br><small class="muted">决定新词、新句子从哪一级出</small></span><select id="lvsel">
      ${LEVELS.map((L,i)=>`<option value="${i}" ${i===lvl()?"selected":""}>${LV_NAME(i)}</option>`).join("")}</select></label>
    <label class="f"><span>每天新单词数量<br><small class="muted">建议 10–20 个</small></span><input type="number" id="npd" min="1" max="50" value="${S.settings.newPerDay}"></label>
    <label class="f"><span>每天新句子数量<br><small class="muted">建议 3–8 句</small></span><input type="number" id="nsd" min="1" max="30" value="${S.settings.newSentPerDay}"></label>
    <label class="f"><span>朗读速度</span><select id="rate">
      ${[[0.6,"很慢"],[0.75,"慢"],[0.85,"稍慢（推荐）"],[1,"正常"]].map(([v,n])=>`<option value="${v}" ${S.settings.rate==v?"selected":""}>${n}</option>`).join("")}</select></label>
    <label class="f"><span>朗读声音</span><select id="voice"><option value="">自动（美式）</option>
      ${voices.map(v=>`<option value="${esc(v.name)}" ${S.settings.voice===v.name?"selected":""}>${esc(v.name)} (${v.lang})</option>`).join("")}</select></label>
    <div class="row" style="padding-top:12px"><button class="btn sm" data-say="Hello! Nice to meet you. I'm learning English.">🔊 试听</button></div>
  </div>
  <h2>备份进度</h2>
  <div class="card"><p class="muted" style="margin-top:0">进度只保存在当前这个浏览器里。手机和电脑各记各的；换设备或清理浏览器前，先复制备份，到新设备上粘贴导入。</p>
    <div class="row"><button class="btn" id="exp">复制进度备份</button><button class="btn" id="impbtn">粘贴导入</button>
    <button class="btn bad" id="reset">清空全部进度</button></div>
    <div id="bk" class="hide" style="margin-top:12px"><textarea id="bktxt" placeholder="把之前复制的备份内容粘贴到这里"></textarea>
    <div class="row" style="margin-top:8px"><button class="btn primary sm" id="impgo">导入</button></div></div></div>`;

/* =================== 渲染与事件 =================== */
function render(){ nav(); app.innerHTML = V[cur](); updateStreak(); }
function setLevel(i){ S.settings.level=i; wordLv=null; sentLv=null; save(); render(); toast(`已切换到 ${LV_NAME(i)}`); }

app.addEventListener("click", e => {
  const t = e.target.closest("[data-say],[data-go],[data-rate],[data-cat],[data-gram],[data-mic],[data-micx],[data-opt],[data-manual],[data-ph],[data-blend],[data-pho],[data-wlv],[data-slv],[data-setlv],[data-copy],button[id]");
  if(!t) return;
  const d=t.dataset;
  if(d.say){ e.preventDefault(); say(d.say); return; }
  if(d.go){ if(d.go==="phon" && t.closest(".task")){ phOpen=phNext(); phQ=null; } go(d.go); return; }
  if(d.ph!==undefined){ phOpen=+d.ph; phQ=null; render(); window.scrollTo(0,0); return; }
  if(d.blend!==undefined){ blend(+d.blend); return; }
  if(d.pho){ phAnswer(d.pho, t); return; }
  if(d.rate){ doRate(+d.rate); return; }
  if(d.cat){ wordCat=d.cat; render(); return; }
  if(d.wlv!==undefined){ wordLv=+d.wlv; wordCat="全部"; render(); return; }
  if(d.slv!==undefined){ sentLv=+d.slv; render(); return; }
  if(d.setlv!==undefined){ setLevel(+d.setlv); return; }
  if(d.gram){ S.grammarRead[d.gram]=today(); dayLog().grammar++; save(); render(); return; }
  if(d.mic){ listen(SENT_LIST[+d.mic].en, document.getElementById("sc-"+d.mic)); return; }
  if(d.micx){ listen(d.micx, document.getElementById("sc-x")); return; }
  if(d.opt){ answer(+d.opt, t); return; }
  if(d.manual){ const L=dayLog(); L[d.manual]=!L[d.manual]; save(); render(); return; }
  if(d.copy!==undefined){ const txt=document.getElementById("pr-"+d.copy).textContent;
    const sel=()=>{ const r=document.createRange(); r.selectNodeContents(document.getElementById("pr-"+d.copy)); const s=getSelection(); s.removeAllRanges(); s.addRange(r); toast("已选中，请手动复制"); };
    try{ navigator.clipboard.writeText(txt).then(()=>toast("已复制，粘贴给 AI 就能用"), sel); }catch(err){ sel(); } return; }
  switch(t.id){
    case "startw": startSession("w"); break;
    case "starts": startSession("s"); break;
    case "reveal": reveal(); break;
    case "quit": session=null; render(); break;
    case "phback": phOpen=-1; phQ=null; render(); break;
    case "phqstart": phStart(); break;
    case "phqback": phQ=null; render(); break;
    case "phqgo": phNextQ(); break;
    case "phreplay": say(phQ.qs[phQ.i].ans); break;
    case "phslow": say(phQ.qs[phQ.i].ans, 0.5); break;
    case "qstart": makeQuiz(); render(); { const q=quiz.qs[0]; if(q && q.type==="listen") setTimeout(()=>say(q.x.w),200); } break;
    case "qgo": quiz.i++; quiz.answered=false;
      if(quiz.i>=quiz.qs.length){ dayLog().quiz++; save(); }
      render(); { const q=quiz.qs[quiz.i]; if(q && q.type==="listen") setTimeout(()=>say(q.x.w),200); } break;
    case "slow": S.settings.rate = S.settings.rate<=0.7 ? 0.85 : 0.6; save(); render(); break;
    case "exp": { const txt=JSON.stringify(S); const show=()=>{ document.getElementById("bk").classList.remove("hide"); const ta=document.getElementById("bktxt"); ta.value=txt; ta.select(); };
      try{ navigator.clipboard.writeText(txt).then(()=>toast("已复制，粘贴到备忘录里保存"),()=>{ show(); toast("请手动复制下面的内容"); }); }catch(err){ show(); } } break;
    case "impbtn": document.getElementById("bk").classList.remove("hide"); document.getElementById("bktxt").value=""; document.getElementById("bktxt").focus(); break;
    case "impgo": try{ const d2=JSON.parse(document.getElementById("bktxt").value); if(!d2.cards) throw 0; S=load(d2); save(); render(); toast("导入成功"); }catch(err){ toast("内容格式不对，请粘贴完整的备份"); } break;
    case "reset": if(t.dataset.sure){ S=defaultState(); save(); session=null; quiz=null; render(); toast("已清空"); }
      else { t.dataset.sure="1"; t.textContent="再点一次确认清空（不能撤销）"; } break;
  }
});
app.addEventListener("change", e => {
  const id=e.target.id;
  if(id==="lvsel"){ setLevel(+e.target.value); }
  if(id==="npd"){ S.settings.newPerDay=Math.max(1,Math.min(50,+e.target.value||10)); save(); }
  if(id==="nsd"){ S.settings.newSentPerDay=Math.max(1,Math.min(30,+e.target.value||5)); save(); }
  if(id==="rate"){ S.settings.rate=+e.target.value; save(); }
  if(id==="voice"){ S.settings.voice=e.target.value; save(); say("Hello! I'm learning English."); }
});
document.addEventListener("keydown", e => {
  if(!session || !session.queue.length || /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
  if(!((cur==="words"&&session.kind==="w")||(cur==="sent"&&session.kind==="s"))) return;
  if(e.code==="Space"){ e.preventDefault(); if(!session.show) reveal(); else { const k=session.queue[0]; say(isSent(k)?sentByKey[k].en:k); } }
  if(session.show && ["1","2","3"].includes(e.key)) doRate(+e.key-1);
});
window.addEventListener("hashchange", ()=>{ const k=location.hash.slice(1); if(k!==cur && TABS.some(t=>t[0]===k)){ cur=k; render(); } });

render();
})();
