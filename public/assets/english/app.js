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
const newDev = () => Math.random().toString(36).slice(2,10);
const defaultState = () => ({cards:{}, log:{}, others:{}, grammarRead:{}, phonics:{}, settings:{newPerDay:10, newSentPerDay:5, rate:0.85, voice:"", level:0}, settingsT:0, startDate:today(), dev:newDev()});
let S;
function load(raw){
  const d = Object.assign(defaultState(), raw || {});
  d.settings = Object.assign(defaultState().settings, d.settings);
  if(!d.dev) d.dev = newDev();
  d.others = d.others || {};
  return d;
}
try { S = load(JSON.parse(localStorage.getItem(KEY) || "{}")); } catch(e){ S = defaultState(); }
function saveLocal(){ _logs=null; try{ localStorage.setItem(KEY, JSON.stringify(S)); }catch(e){} }
function save(){ saveLocal(); syncLater(); }
// 多设备：本机日志在 S.log，其他设备的在 S.others[设备号]；显示时合起来
let _logs=null;
function allLogs(){
  if(_logs) return _logs;
  const out={};
  for(const lg of [S.log, ...Object.values(S.others||{})]) for(const [day,l] of Object.entries(lg||{})){
    const o = out[day] || (out[day]={});
    for(const [k,v] of Object.entries(l)) o[k] = typeof v==="number" ? (o[k]||0)+v : (o[k]||v);
  }
  return _logs=out;
}
function dayView(){ return Object.assign({reviewed:0,newLearned:0,newSent:0,quiz:0,spoken:0,grammar:0,phonics:0,listen:false,output:false}, allLogs()[today()]||{}); }

function today(d=new Date()){ return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0"); }
function addDays(n){ const d=new Date(); d.setDate(d.getDate()+n); return today(d); }
function dayLog(){ const t=today(); S.log[t] = Object.assign({reviewed:0,newLearned:0,newSent:0,quiz:0,spoken:0,grammar:0,phonics:0,listen:false,output:false}, S.log[t]||{}); return S.log[t]; }
function streak(){
  let n=0; const d=new Date();
  const active = k => { const l=allLogs()[k]; return l && (l.reviewed||l.newLearned||l.newSent||l.quiz||l.spoken||l.grammar||l.phonics||l.listen||l.output||l.dict); };
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
  const left = Math.max(0, S.settings.newPerDay - dayView().newLearned);
  const pool = WORD_LIST.filter(x=>!S.cards[x.w]);
  const mine = pool.filter(x=>x.lv===lvl()), rest = pool.filter(x=>x.lv>lvl());
  return [...mine, ...rest].slice(0,left);
}
function newSents(){
  const left = Math.max(0, S.settings.newSentPerDay - dayView().newSent);
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
  if(r===0 && !isNew) c.lapses=(c.lapses||0)+1;
  c.t=Date.now();
  S.cards[key]=c;
  const L=dayLog(); L["r"+r]=(L["r"+r]||0)+1;
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
const TABS = [["today","今日"],["road","学习路线"],["method","学习方法"],["sound","发音"],["phon","自然拼读"],["words","单词"],["sent","句子"],["grammar","语法"],["quiz","练习"],["stats","记录"],["settings","设置"]];
const ROUTES = [...TABS.map(t=>t[0]), "learn", "more"];
const BAR = [["today","今日","◉",["today"]],["learn","学习","▤",["learn","sound","phon","words","sent","grammar"]],["quiz","练习","✎",["quiz"]],["stats","记录","▦",["stats"]],["more","更多","☰",["more","road","method","settings"]]];
let cur = location.hash.slice(1) || "today";
if(!ROUTES.includes(cur)) cur="today";
const app = document.getElementById("app");
function nav(){
  document.getElementById("nav").innerHTML = TABS.map(([k,n])=>`<button class="${k===cur?"on":""}" data-k="${k}">${n}</button>`).join("");
  const tb=document.getElementById("tabbar");
  if(tb) tb.innerHTML = BAR.map(([k,n,ic,g])=>`<a href="#${k}" data-k="${k}" class="${g.includes(cur)?"on":""}" ${g.includes(cur)?'aria-current="page"':""}><i aria-hidden="true">${ic}</i>${n}</a>`).join("");
}
{ const tb=document.getElementById("tabbar"); if(tb) tb.onclick = e => { const a=e.target.closest("[data-k]"); if(a){ e.preventDefault(); go(a.dataset.k); } }; }
document.getElementById("nav").onclick = e => { const k=e.target.dataset.k; if(k) go(k); };
function go(k){ cur=k; history.replaceState(null,"","#"+k); render(); window.scrollTo(0,0); }
function updateStreak(){ const n=streak(); document.getElementById("streak").textContent = n ? `🔥 ${n} 天` : "第 1 天"; }
const lvStyle = i => `style="--lv:${LEVELS[i].color}"`;
const lvTag = i => `<span class="lvtag" ${lvStyle(i)}>${LV_NAME(i)}</span>`;
const bar = (a,b,thin) => `<div class="bar ${thin?"thin":""}"><i style="width:${b?Math.round(a/b*100):0}%"></i></div>`;

const V = {};
V.today = () => {
  const L=dayView(), dw=dueKeys(false).length, ds=dueKeys(true).length, nw=newWords().length, ns=newSents().length;
  const learned=Object.keys(S.cards).filter(k=>!isSent(k)).length, sl=Object.keys(S.cards).filter(isSent).length;
  const nextG=nextGrammar(), pn=phNext(), lv=lvl(), info=LEVELS[lv];
  const lesson = (lv===0 && pn>=0)
    ? {label:"学一课自然拼读", info:`第 ${pn+1} 课：${PHONICS[pn].t}`, act:"phon", auto:L.phonics>0}
    : {label:"学一课语法", info: nextG<0? "本级语法都学完了，可以复习或升级" : `${GRAMMAR[nextG].t}`, act:"grammar", auto:L.grammar>0};
  const tasks = [
    {label:"复习单词卡", info: dw? `${dw} 个到期，约 ${Math.ceil(dw/6)} 分钟` : (L.reviewed? "今天的复习做完了 ✓" : "今天没有到期的词 ✓"), act:"words", auto: dw===0},
    {label:`学 ${S.settings.newPerDay} 个新词`, info:`今天已学 ${L.newLearned} / ${S.settings.newPerDay}`, act:"words", auto: L.newLearned>=S.settings.newPerDay || nw===0 && L.newLearned>0},
    {label:`句子卡：复习 + ${S.settings.newSentPerDay} 个新句`, info: `到期 ${ds} 句 · 今天新学 ${L.newSent} / ${S.settings.newSentPerDay}`, act:"sent", auto: ds===0 && (L.newSent>=S.settings.newSentPerDay || ns===0)},
    lesson,
    {label:"跟读 5 个句子", info:`今天已跟读 ${L.spoken} / 5（用 🎙️ 打分）`, act:"sent", auto: L.spoken>=5},
    {label:"输入：听 / 看英语", info:`${lv<2?"15":lv<4?"20–30":"30"} 分钟。推荐：${info.input[0]}。完成后手动打勾`, manual:"listen", auto:L.listen},
    lv<2 ? {label:"做一次小测验", info: L.quiz? `今天已做 ${L.quiz} 次` : "10 道题，检验学过的词", act:"quiz", auto: L.quiz>0}
         : {label:"输出：写或说", info: lv<3?"用英语写 3 句日记，交给 AI 修改":"和 AI 英语对话 10 分钟（「学习方法」页有提示词）", manual:"output", auto:L.output, act:"method"}
  ];
  const doneN = tasks.filter(t=>t.auto).length, st=lvStats(lv), left=tasks.length-doneN;
  const next = tasks.find(t=>!t.auto && t.act), C=2*Math.PI*40, pct=doneN/tasks.length;
  return `
  ${!S.placement && !Object.keys(S.cards).length?`<div class="card row" style="justify-content:space-between;margin-top:16px;background:var(--accent-soft);border-color:transparent">
    <span><b>第一次用？</b>先做 5–10 分钟水平测评，找到适合你的起点。完全没学过可以跳过，直接从起步级开始。</span>
    <button class="btn primary sm" id="pstartgo">去测评</button></div>`:""}
  <div class="card hero">
    <div class="ring" role="img" aria-label="今日完成 ${doneN} / ${tasks.length}"><svg viewBox="0 0 92 92"><circle class="trk" cx="46" cy="46" r="40"/><circle class="val" cx="46" cy="46" r="40" stroke-dasharray="${C}" stroke-dashoffset="${C*(1-pct)}"/></svg>
      <div class="num">${doneN}/${tasks.length}<small>今日</small></div></div>
    <div><div class="lvname">${LV_NAME(lv)}</div>
      <h3>${left? `再完成 ${left} 项就打卡` : "今天的任务都完成了 🎉"}</h3>
      <p>${lv===0?`自然拼读 ${phDoneN()} / ${PHONICS.length} 课 · `:""}本级单词 ${st.w} / ${st.wt} · 句子 ${st.s} / ${st.st}</p></div>
  </div>
  <h2>今日任务</h2>
  <div class="card tasks" style="padding:4px 16px">${tasks.map(t=>`<div class="task">
      <button class="check ${t.auto?"done":""}" ${t.manual?`data-manual="${t.manual}"`:"disabled"} aria-label="${t.auto?"已完成":"未完成"}">${t.auto?"✓":""}</button>
      <div class="t"><b>${t.label}</b><small>${t.info}</small></div>
      ${t.act?`<button class="btn sm" data-go="${t.act}">${t.auto?"再练":"开始"}</button>`:""}
    </div>`).join("")}</div>
  ${next?`<button class="btn primary cta" data-go="${next.act}">继续学习：${next.label}</button>`:""}
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

V.learn = () => {
  const items=[
    ["words","Aa","单词",`${Object.keys(S.cards).filter(k=>!isSent(k)).length} / ${WORD_LIST.length} 已学 · 到期 ${dueKeys(false).length}`],
    ["sent","“”","句子",`${Object.keys(S.cards).filter(isSent).length} / ${SENT_LIST.length} 已学 · 到期 ${dueKeys(true).length}`],
    ["grammar","§","语法",`${Object.keys(S.grammarRead).length} / ${GRAMMAR.length} 课`],
    ["phon","ph","自然拼读",`${phDoneN()} / ${PHONICS.length} 课已过关`],
    ["sound","/ə/","发音","26 个字母和最容易读错的音"]];
  return `<h1>学习</h1><p class="sub">当前级别：${LV_NAME(lvl())}</p>
  <div class="hub">${items.map(([k,ic,n,d])=>`<a class="card" href="#${k}" data-go="${k}"><span class="ic">${ic}</span><span><b>${n}</b><small>${d}</small></span><span class="go">›</span></a>`).join("")}</div>`;
};
V.more = () => {
  const items=[["road","↗","学习路线","6 个级别，每级学什么、怎么学、怎样算过关"],["method","✦","学习方法","12 种方法和 AI 陪练提示词"],["settings","⚙","设置","级别、每天学多少、朗读声音、备份进度"]];
  return `<h1>更多</h1>
  <div class="hub">${items.map(([k,ic,n,d])=>`<a class="card" href="#${k}" data-go="${k}"><span class="ic">${ic}</span><span><b>${n}</b><small>${d}</small></span><span class="go">›</span></a>`).join("")}</div>`;
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
    <div><b>句子卡：到期 ${ds}</b> · <b>今日新句 ${ns}</b><br><small class="muted">今日已跟读 ${dayView().spoken} 句</small></div>
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
    <label class="f"><span>打字练习音效<br><small class="muted">打对、打错、连击的提示音</small></span><select id="sfx"><option value="1" ${S.settings.sfx!==false?"selected":""}>开</option><option value="0" ${S.settings.sfx===false?"selected":""}>关</option></select></label>
    <div class="row" style="padding-top:12px"><button class="btn sm" data-say="Hello! Nice to meet you. I'm learning English.">🔊 试听</button></div>
  </div>
  <h2>多设备同步</h2>
  <div class="card"><p style="margin-top:0">${SYNC.on?`✅ 已开启。在网站上学习时，进度自动保存到你的网站，手机和电脑打开都是同一份。${SYNC.last?`<br><small class="muted">上次同步：${SYNC.last}</small>`:""}`
    : SYNC.state==="auth"?"没有登录工具箱口令，进度只存在这台设备。从网站工具箱进入一次就能开启同步。"
    : SYNC.state==="error"?"暂时连不上网站，进度先存在这台设备，联网后会自动补传。"
    :"这个页面不在你的网站上，进度只存在这台设备。在 cosmoswong.com 工具箱里打开才能多设备同步。"}</p>
    ${SYNC.on||SYNC.state==="error"?`<button class="btn sm" id="syncnow">立即同步</button>`:""}</div>
  <h2>备份进度</h2>
  <div class="card"><p class="muted" style="margin-top:0">进度只保存在当前这个浏览器里。手机和电脑各记各的；换设备或清理浏览器前，先复制备份，到新设备上粘贴导入。</p>
    <div class="row"><button class="btn" id="exp">复制进度备份</button><button class="btn" id="impbtn">粘贴导入</button>
    <button class="btn bad" id="reset">清空全部进度</button></div>
    <div id="bk" class="hide" style="margin-top:12px"><textarea id="bktxt" placeholder="把之前复制的备份内容粘贴到这里"></textarea>
    <div class="row" style="margin-top:8px"><button class="btn primary sm" id="impgo">导入</button></div></div></div>`;

/* ---------- 练习中心：听写 / 单词测验 / 水平测评 ---------- */
V.quiz = () => {
  if(dict) return dictView();
  if(place) return placeView();
  if(quiz) return quizView();
  const n=Object.keys(S.cards).filter(k=>!isSent(k)).length, b=S.best||{};
  return `<h1>练习</h1><p class="sub">打字练习（中译英、连词成句、听写）把句子练到不用想就能打出来；单词测验检查记没记住；水平测评帮你找到起点。</p>
  <div class="grid g2">
    <div class="card method"><h3>中译英闯关<small>像句乐部那样打字</small></h3>
      <div class="why">看中文，一个词一个词打出英文，按空格确认。打对亮绿、连对有连击，最后给 C 到 SSS 评级。最练「会说、会写」。</div>
      <div class="use">${(b.type||{}).zh2en?`最好成绩：${b.type.zh2en.grade}`:"还没玩过"}</div>
      <div class="row" style="margin-top:10px"><button class="btn primary" data-tmode="zh2en">开始闯关（10 句）</button></div></div>
    <div class="card method"><h3>连词成句<small>零基础友好</small></h3>
      <div class="why">把一句话拆成几段：先打 I like，再打 to eat，再拼成 I like to eat……同一个词反复出现，不用背也记住了。每段都会读给你听。</div>
      <div class="use">${(b.type||{}).build?`最好成绩：${b.type.build.grade}`:"还没玩过"}</div>
      <div class="row" style="margin-top:10px"><button class="btn primary" data-tmode="build">开始（5 句）</button></div></div>
    <div class="card method"><h3>听写<small>听力 · 拼写</small></h3>
      <div class="why">只听不看，把听到的英文一个词一个词打出来。最适合练「听得懂」和「拼得对」。</div>
      <div class="use">${b.dict?`最好成绩：${b.dict.grade} · 最高连击 ${b.combo||0}`:"还没做过"}</div>
      <div class="row" style="margin-top:10px"><button class="btn primary" data-tmode="dict">开始听写（10 句）</button></div></div>
    <div class="card method"><h3>单词测验<small>记忆检查</small></h3>
      <div class="why">10 道题：看英文选中文、看中文选英文、听音选词。答错的词会安排明天复习。</div>
      <div class="use">${n>=8?`从你已学的 ${n} 个词里出题`:`先用 ${LV_NAME(lvl())} 词库出题`}${b.quiz!=null?` · 最好 ${b.quiz}/10`:""}</div>
      <div class="row" style="margin-top:10px"><button class="btn primary" id="qstart">开始测验</button></div></div>
    <div class="card method"><h3>水平测评<small>约 5–10 分钟</small></h3>
      <div class="why">从起步级开始，每级 5 道题（单词意思 + 听句子选意思），答对 4 道进入下一级，直到答不上来为止。测完告诉你从哪一级开始学最合适。</div>
      <div class="use">${S.placement?`上次结果：${LV_NAME(S.placement.level)}（${S.placement.date}）`:"还没测过"}</div>
      <div class="row" style="margin-top:10px"><button class="btn primary" id="pstart">开始测评</button></div></div>
  </div>`;
};
function quizView(){
  if(quiz.i>=quiz.qs.length) return `<h1>测验结果</h1><div class="card" style="text-align:center;padding:30px">
      <div style="font-size:44px;font-weight:700">${quiz.right} / ${quiz.qs.length}</div>
      <p>${quiz.right>=9?"太棒了！":quiz.right>=7?"不错，继续保持！":"错的词已经安排明天复习，别灰心。"}</p>
      ${quiz.wrong.length?`<p class="muted">答错的词：${quiz.wrong.map(x=>`<b>${esc(x.w)}</b> ${x.zh}`).join("、")}</p>`:""}
      <div class="row" style="justify-content:center"><button class="btn primary" id="qstart">再来一次</button><button class="btn" id="pback">回到练习</button></div></div>`;
  const q=quiz.qs[quiz.i];
  const prompt = q.type==="en2zh" ? `<div class="w">${esc(q.x.w)}</div><div class="muted">选出正确的中文意思</div>`
    : q.type==="zh2en" ? `<div class="w" style="font-size:30px">${q.x.zh}</div><div class="muted">选出对应的英文</div>`
    : `<div><button class="icon bigicon" data-say="${esc(q.x.w)}" aria-label="朗读">🔊</button></div><div class="muted">听发音，选出这个词</div>`;
  return `<h1>单词测验</h1>
  <div class="bar" style="margin:12px 0"><i style="width:${quiz.i/quiz.qs.length*100}%"></i></div>
  <div class="muted" style="font-size:14px">第 ${quiz.i+1} / ${quiz.qs.length} 题 · 答对 ${quiz.right}</div>
  <div class="card flash" style="min-height:180px;margin-top:10px">${prompt}</div>
  <div class="opts">${q.opts.map((o,k)=>`<button class="opt" data-opt="${k}">${q.type==="en2zh"?o.zh:esc(o.w)}</button>`).join("")}</div>
  <div style="text-align:center;margin-top:14px" id="qnext"></div>`;
}

/* ---------- 打字练习：听写 / 中译英闯关 / 连词成句（共用一套打字引擎） ---------- */
// 每一「轮」= 要打出来的一串词；听写和中译英一句一轮，连词成句把一句拆成好几轮逐步拼起来
let dict=null;
const TMODES = {
  dict:  {name:"听写", n:10, desc:"听一句英文，一个词一个词打出来"},
  zh2en: {name:"中译英闯关", n:10, desc:"看中文，把英文打出来"},
  build: {name:"连词成句", n:5, desc:"听一段、打一段，一步步拼成整句"}
};
const tokens = s => s.split(/\s+/).filter(Boolean);
const clean = w => w.toLowerCase().replace(/[’]/g,"'").replace(/[^a-z0-9']/g,"");
function chunksOf(words){
  if(words.length<=3) return words.map(w=>[w]);
  const out=[]; for(let i=0;i<words.length;i+=2) out.push(words.slice(i,i+2));
  if(out.length>1 && out[out.length-1].length===1){ const last=out.pop(); out[out.length-1].push(...last); }
  return out;
}
function buildRounds(x){
  const cs=chunksOf(tokens(x.en)), rounds=[];
  rounds.push(cs[0]);
  for(let k=1;k<cs.length;k++){ rounds.push(cs[k]); rounds.push(cs.slice(0,k+1).flat()); }
  return rounds.map((words,i)=>({x, words, step:i+1, steps:rounds.length, full:words.length===tokens(x.en).length}));
}
function makeTyping(mode){
  const n=TMODES[mode].n;
  const learned=SENT_LIST.filter(x=>S.cards[x.id]);
  let pool = learned.length>=n ? learned : [...learned, ...SENT_LIST.filter(x=>x.lv===lvl() && !S.cards[x.id])];
  if(pool.length<n) pool=SENT_LIST.filter(x=>x.lv<=Math.max(1,lvl()));
  const picks=[...pool].sort(()=>Math.random()-.5).slice(0,n);
  const rounds = mode==="build" ? picks.flatMap(buildRounds) : picks.map(x=>({x, words:tokens(x.en), full:true}));
  for(const r of rounds){ r.pos=0; r.tries=0; r.res=[]; }
  dict={mode, items:rounds, i:0, combo:0, maxCombo:0, right:0, total:0, hint:false, showZh: mode!=="dict", fb:"", missed:new Set()};
}
const dictItem = () => dict.items[dict.i];
const roundAudio = it => it.words.join(" ");
function grade(p){ return p>=.98?"SSS":p>=.95?"SS":p>=.9?"S":p>=.8?"A":p>=.65?"B":"C"; }
function dictView(){
  const M=TMODES[dict.mode];
  if(dict.i>=dict.items.length){
    const p=dict.total?dict.right/dict.total:0, g=grade(p), sents=[...new Map(dict.items.map(it=>[it.x.id,it.x])).values()];
    return `<h1>${M.name} · 结果</h1><div class="card" style="text-align:center;padding:30px">
      <div class="grade g-${g}">${g}</div>
      <p>正确率 ${Math.round(p*100)}% · 最高连击 ${dict.maxCombo}</p>
      ${dict.missed.size?`<p class="muted" style="font-size:14px">打错的句子已安排明天复习</p>`:""}
      <div class="dres">${sents.map(x=>`<div class="sent"><button class="icon" data-say="${esc(x.en)}" aria-label="朗读">🔊</button><div class="txt"><div class="en">${dict.missed.has(x.id)?"✗ ":"✓ "}${esc(x.en)}</div><div class="zh">${x.zh}</div></div></div>`).join("")}</div>
      <div class="row" style="justify-content:center;margin-top:14px"><button class="btn primary" data-tmode="${dict.mode}">再来一局</button><button class="btn" id="pback">回到练习</button></div></div>`;
  }
  const it=dictItem(), finished=it.pos>=it.words.length;
  const slots=it.words.map((w,k)=> k<it.pos ? `<span class="slot ${it.res[k]?"ok":"bad"}">${esc(w)}</span>`
    : `<span class="slot ${k===it.pos?"cur":""}" style="min-width:${Math.max(2,clean(w).length)*0.62}em">${k===it.pos&&dict.hint?esc(w[0])+"…":""}</span>`).join("");
  const stepInfo = dict.mode==="build" ? ` · 第 ${it.step} / ${it.steps} 步${it.full?" · 整句":""}` : "";
  const prompt = dict.mode==="zh2en"
    ? `<div class="tz">${it.x.zh}</div>`
    : `<div class="row" style="justify-content:center"><button class="icon bigicon" id="dplay" aria-label="再听一遍">🔊</button></div>
       ${dict.showZh||finished?`<div class="muted" style="text-align:center;margin-top:8px">${it.x.zh}</div>`:""}`;
  return `<h1>${M.name}</h1>
  <div class="bar" style="margin:12px 0"><i style="width:${dict.i/dict.items.length*100}%"></i></div>
  <div class="row muted" style="font-size:14px;justify-content:space-between"><span>${dict.mode==="build"?"":`第 ${dict.i+1} / ${dict.items.length} 句 · `}${lvTag(it.x.lv)} ${it.x.scene}${stepInfo}</span><span class="combo ${dict.combo>=5?"hot":""}" id="combo">连击 ${dict.combo}</span></div>
  <div class="card dcard">
    ${prompt}
    <div class="row" style="justify-content:center;margin:10px 0 14px">
      ${dict.mode==="zh2en"?`<button class="btn sm" id="dplay">🔊 听答案</button>`:`<button class="btn sm" id="dslow">🐢 慢速</button>`}
      <button class="btn sm" id="dhint">💡 首字母</button>
      ${dict.mode==="dict"?`<button class="btn sm" id="dzh">${dict.showZh?"藏起中文":"看中文"}</button>`:""}
    </div>
    <div class="fbwrap"><span class="fb ${dict.fb?"fb-"+dict.fb:""}" id="fb">${{perfect:"Perfect!",good:"Good",miss:"Miss"}[dict.fb]||""}</span></div>
    <div class="slots">${slots}</div>
    ${finished?`<div style="text-align:center;margin-top:16px"><button class="btn primary" id="dnext">${dict.i+1<dict.items.length?"下一题 →（回车）":"看结果"}</button></div>`
      :`<input id="dinput" class="dinput" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" enterkeyhint="next" placeholder="打一个词，按空格确认" aria-label="输入英文">`}
    <div class="muted" style="font-size:13px;text-align:center;margin-top:10px">每个词有 2 次机会；标点和大小写不用管</div>
  </div>`;
}
function dictFocus(){ const el=document.getElementById("dinput"); if(el) el.focus(); }
function feedback(kind){ dict.fb=kind; sfx(kind); }
function dictSubmit(val){
  const it=dictItem(); const w=clean(val); if(!w) return;
  const target=clean(it.words[it.pos]);
  if(w===target){ it.res[it.pos]=true; feedback(it.tries?"good":"perfect"); it.pos++; it.tries=0; dict.combo++; dict.right++; dict.total++; dict.maxCombo=Math.max(dict.maxCombo,dict.combo); dict.hint=false; }
  else if(it.tries<1){ it.tries++; dict.combo=0; dict.fb=""; sfx("wrong"); render(); const el=document.getElementById("dinput"); el.classList.add("shake"); el.value=""; el.focus(); return; }
  else { it.res[it.pos]=false; feedback("miss"); dict.missed.add(it.x.id); it.pos++; it.tries=0; dict.combo=0; dict.total++; dict.hint=false; }
  if(it.pos>=it.words.length){ if(it.full) say(it.x.en); else say(roundAudio(it)); if(it.full){ const L=dayLog(); L.dict=(L.dict||0)+1; save(); } }
  render(); dictFocus();
}
function playRound(rate){ const it=dictItem(); if(!it) return; say(dict.mode==="build"?roundAudio(it):it.x.en, rate); }
function startTyping(mode){
  quiz=null; place=null; makeTyping(mode); render(); window.scrollTo(0,0);
  setTimeout(()=>{ if(mode!=="zh2en") playRound(); dictFocus(); },200);
}
function dictNext(){
  dict.i++; dict.hint=false; dict.fb=""; if(dict.mode==="dict") dict.showZh=false;
  if(dict.i>=dict.items.length){
    const p=dict.total?dict.right/dict.total:0, L=dayLog();
    L.dictRight=(L.dictRight||0)+dict.right; L.dictTotal=(L.dictTotal||0)+dict.total;
    // 打错的句子：已经在复习里的，明天再出现一次
    for(const id of dict.missed){ const c=S.cards[id]; if(c){ c.box=Math.max(1,c.box-1); c.due=addDays(1); c.t=Date.now(); } }
    S.best=S.best||{}; S.best.type=S.best.type||{}; const g=grade(p);
    const prev = dict.mode==="dict" ? S.best.dict : S.best.type[dict.mode];
    if(!prev || GRADES.indexOf(g)>GRADES.indexOf(prev.grade)){ if(dict.mode==="dict") S.best.dict={grade:g,date:today()}; else S.best.type[dict.mode]={grade:g,date:today()}; }
    S.best.combo=Math.max(S.best.combo||0, dict.maxCombo); sfx(p>=.9?"win":"done"); save(); render(); return;
  }
  render(); setTimeout(()=>{ if(dict.mode!=="zh2en") playRound(); dictFocus(); },150);
}
// 音效：浏览器自己合成几个短音，不加载任何文件；设置里可以关
let actx=null;
function sfx(kind){
  if(S.settings.sfx===false) return;
  try{
    actx = actx || new (window.AudioContext||window.webkitAudioContext)();
    const notes={perfect:[880,1320],good:[660],miss:[220],wrong:[180],win:[523,659,784,1047],done:[523,659]}[kind]; if(!notes) return;
    notes.forEach((f,i)=>{ const o=actx.createOscillator(), g=actx.createGain(), t=actx.currentTime+i*0.08;
      o.type = kind==="miss"||kind==="wrong" ? "sawtooth" : "sine"; o.frequency.value=f;
      g.gain.setValueAtTime(0.0001,t); g.gain.exponentialRampToValueAtTime(kind==="wrong"?0.05:0.12,t+0.01); g.gain.exponentialRampToValueAtTime(0.0001,t+0.16);
      o.connect(g).connect(actx.destination); o.start(t); o.stop(t+0.18); });
  }catch(e){}
}

/* ---------- 水平测评 ---------- */
let place=null;
function makePlaceLevel(lv){
  const ws=WORD_LIST.filter(x=>x.lv===lv).sort(()=>Math.random()-.5);
  const ss=SENT_LIST.filter(x=>x.lv===lv).sort(()=>Math.random()-.5);
  const qs=[];
  for(const x of ws.slice(0,3)) qs.push({kind:"w", ans:x.zh, prompt:x.w, opts:[x.zh,...ws.slice(3).filter(y=>y.zh!==x.zh).slice(0,30).sort(()=>Math.random()-.5).slice(0,3).map(y=>y.zh)].sort(()=>Math.random()-.5)});
  for(const x of ss.slice(0,2)) qs.push({kind:"s", ans:x.zh, prompt:x.en, opts:[x.zh,...ss.slice(2).sort(()=>Math.random()-.5).slice(0,3).map(y=>y.zh)].sort(()=>Math.random()-.5)});
  return qs;
}
function startPlace(){ place={lv:0, qs:makePlaceLevel(0), i:0, right:0, scores:[], answered:false, done:false}; render(); window.scrollTo(0,0); }
function placeView(){
  if(place.done){
    const rec=place.result;
    return `<h1>测评结果</h1><div class="card" style="text-align:center;padding:24px">
      <div class="muted">建议从这一级开始</div>
      <div style="margin:10px 0">${lvTag(rec)}</div>
      <p>${LEVELS[rec].goal}</p>
      <div class="prog" style="text-align:left;max-width:420px;margin:0 auto">${place.scores.map((s,i)=>`<div class="pl"><span>${LV_NAME(i)}</span><span>${s} / 5</span></div>${bar(s,5,1)}`).join("")}</div>
      <p class="muted" style="font-size:13px">选择题可以猜，所以结果可能偏乐观。学起来吃力的话，可以在「学习路线」里降一级。</p>
      <div class="row" style="justify-content:center"><button class="btn primary" data-setlv="${rec}">从 ${LV_NAME(rec)} 开始</button><button class="btn" id="pback">回到练习</button></div></div>`;
  }
  const q=place.qs[place.i];
  return `<h1>水平测评 · ${LV_NAME(place.lv)}</h1>
  <div class="bar" style="margin:12px 0"><i style="width:${place.i/place.qs.length*100}%"></i></div>
  <div class="muted" style="font-size:14px">本级第 ${place.i+1} / ${place.qs.length} 题 · 答对 4 题进入下一级</div>
  <div class="card flash" style="min-height:170px;margin-top:10px">
    ${q.kind==="w"?`<div class="w">${esc(q.prompt)}</div><div class="muted">这个词是什么意思？</div>`
      :`<div><button class="icon bigicon" data-say="${esc(q.prompt)}" aria-label="朗读">🔊</button></div><div class="muted">听这句话，选出它的意思（可以多听几遍）</div>`}
  </div>
  <div class="opts">${q.opts.map((o,k)=>`<button class="opt" data-popt="${k}">${o}</button>`).join("")}<button class="opt" data-popt="-1" style="grid-column:1/-1;text-align:center;color:var(--muted)">不知道</button></div>`;
}
function placeAnswer(k){
  if(place.answered) return; place.answered=true;
  const q=place.qs[place.i]; if(k>=0 && q.opts[k]===q.ans) place.right++;
  setTimeout(()=>{
    place.i++; place.answered=false;
    if(place.i>=place.qs.length){
      place.scores.push(place.right);
      if(place.right>=4 && place.lv<LEVELS.length-1){ place.lv++; place.qs=makePlaceLevel(place.lv); place.i=0; place.right=0; }
      else { place.result = place.right>=4 ? place.lv : place.lv; place.done=true; S.placement={level:place.result, date:today(), scores:place.scores}; save(); }
    }
    render(); const nq=!place.done && place.qs[place.i]; if(nq && nq.kind==="s") setTimeout(()=>say(nq.prompt),200);
  }, 250);
}

/* ---------- 学习记录 ---------- */
function activity(l){ return l ? (l.reviewed||0)+(l.newLearned||0)+(l.newSent||0)*2+(l.spoken||0)+(l.dict||0)*2+(l.quiz||0)*5+(l.grammar||0)*5+(l.phonics||0)*5+(l.listen?5:0)+(l.output?5:0) : 0; }
function weekSum(offset){
  const r={sec:0,newLearned:0,newSent:0,reviewed:0,r0:0,r1:0,r2:0,dictRight:0,dictTotal:0,days:0};
  for(let i=0;i<7;i++){ const d=new Date(); d.setDate(d.getDate()-i-offset*7); const l=allLogs()[today(d)]; if(!l) continue;
    if(activity(l)) r.days++; for(const k in r) if(k!=="days" && l[k]) r[k]+=l[k]; }
  return r;
}
function longestStreak(){ const lg=allLogs(); const days=Object.keys(lg).filter(k=>activity(lg[k])).sort(); let best=0,run=0,prev=null;
  for(const k of days){ const d=new Date(k+"T00:00:00"); run = prev && (d-prev)===864e5 ? run+1 : 1; best=Math.max(best,run); prev=d; } return best; }
const fmtMin = s => s>=3600 ? `${(s/3600).toFixed(1)} 小时` : `${Math.round(s/60)} 分钟`;
V.stats = () => {
  const LG=allLogs(), days=Object.keys(LG).filter(k=>activity(LG[k])).length, totalSec=Object.values(LG).reduce((a,l)=>a+(l.sec||0),0);
  const words=Object.keys(S.cards).filter(k=>!isSent(k)), sents=Object.keys(S.cards).filter(isSent);
  const mastered=words.filter(k=>level(k)===3).length;
  const w0=weekSum(0), w1=weekSum(1), acc=w=>{ const t=w.r0+w.r1+w.r2; return t?Math.round(w.r2/t*100)+"%":"—"; }, dacc=w=>w.dictTotal?Math.round(w.dictRight/w.dictTotal*100)+"%":"—";
  // 热力图：最近 20 周
  const end=new Date(); const start=new Date(); start.setDate(end.getDate()-7*20+1-end.getDay());
  const cells=[]; for(const d=new Date(start); d<=end; d.setDate(d.getDate()+1)){ const k=today(d), a=activity(LG[k]); cells.push(`<i class="hm h${a===0?0:a<15?1:a<40?2:a<80?3:4}" title="${k}：${a?`活跃度 ${a}`:"没学"}"></i>`); }
  const forgot=Object.entries(S.cards).filter(([k,c])=>c.lapses).sort((a,b)=>b[1].lapses-a[1].lapses).slice(0,10);
  const b=S.best||{};
  const row=(name,a,b2,unit="")=>`<tr><td>${name}</td><td><b>${a}${unit}</b></td><td class="muted">${b2}${unit}</td></tr>`;
  return `<h1>学习记录</h1>
  <div class="grid g4">
    <div class="card stat"><b>${days}</b><span>学习天数</span></div>
    <div class="card stat"><b>${streak()} / ${longestStreak()}</b><span>当前 / 最长连续</span></div>
    <div class="card stat"><b>${fmtMin(totalSec)}</b><span>累计学习时长</span></div>
    <div class="card stat"><b>${mastered} / ${words.length}</b><span>掌握 / 已学单词</span></div>
  </div>
  <h2>学习日历</h2>
  <div class="card"><div class="hmwrap"><div class="heat">${cells.join("")}</div></div>
    <div class="row muted" style="font-size:12px;justify-content:flex-end;gap:4px">少 <i class="hm h0"></i><i class="hm h1"></i><i class="hm h2"></i><i class="hm h3"></i><i class="hm h4"></i> 多</div></div>
  <h2>本周小结</h2>
  <div class="card tbl"><table>
    <tr><th></th><th>本周</th><th>上周</th></tr>
    ${row("学习天数",w0.days,w1.days," 天")}
    <tr><td>学习时长</td><td><b>${fmtMin(w0.sec)}</b></td><td class="muted">${fmtMin(w1.sec)}</td></tr>
    ${row("新学单词",w0.newLearned,w1.newLearned," 个")}
    ${row("新学句子",w0.newSent,w1.newSent," 句")}
    ${row("复习次数",w0.reviewed,w1.reviewed," 次")}
    <tr><td>复习答对率</td><td><b>${acc(w0)}</b></td><td class="muted">${acc(w1)}</td></tr>
    <tr><td>打字正确率</td><td><b>${dacc(w0)}</b></td><td class="muted">${dacc(w1)}</td></tr>
  </table></div>
  <div class="grid g2" style="margin-top:12px">
    <div class="card"><h3>最容易忘的词和句子</h3>${forgot.length?forgot.map(([k,c])=>{ const t=isSent(k)?(sentByKey[k]||{}).en||k.slice(2):k, zh=isSent(k)?(sentByKey[k]||{}).zh:(wordByKey[k]||{}).zh;
      return `<div class="sent"><button class="icon" data-say="${esc(t)}" aria-label="朗读">🔊</button><div class="txt"><div class="en">${esc(t)}</div><div class="zh">${zh||""} · 忘了 ${c.lapses} 次</div></div></div>`; }).join(""):`<p class="muted">复习时答「不会」的会记在这里。</p>`}</div>
    <div class="card"><h3>高光时刻</h3><dl class="kv">
      <dt>最长连续</dt><dd>${longestStreak()} 天</dd>
      <dt>闯关最佳</dt><dd>${(b.type||{}).zh2en?b.type.zh2en.grade:"—"}</dd>
      <dt>连词成句</dt><dd>${(b.type||{}).build?b.type.build.grade:"—"}</dd>
      <dt>听写最佳</dt><dd>${b.dict?`${b.dict.grade}（${b.dict.date}）`:"—"}</dd>
      <dt>最高连击</dt><dd>${b.combo||"—"}</dd>
      <dt>测验最高</dt><dd>${b.quiz!=null?b.quiz+" / 10":"—"}</dd>
      <dt>水平测评</dt><dd>${S.placement?`${LV_NAME(S.placement.level)}（${S.placement.date}）`:"—"}</dd>
      <dt>已学句子</dt><dd>${sents.length} 句</dd>
    </dl></div>
  </div>`;
};
let lastAct=Date.now();
["click","keydown","input","touchstart"].forEach(ev=>document.addEventListener(ev,()=>{ lastAct=Date.now(); },{passive:true}));
setInterval(()=>{ if(!document.hidden && Date.now()-lastAct<60000){ const L=dayLog(); L.sec=(L.sec||0)+15; save(); } },15000);

/* =================== 多设备同步（只在网站上生效） =================== */
const API="/api/english/progress";
const SYNC={on:false, state:"local", version:0, dirty:false, timer:null, busy:null, last:""};
const GRADES=["C","B","A","S","SS","SSS"];
function docFromState(){
  return {v:1, cards:S.cards, grammarRead:S.grammarRead, phonics:S.phonics, settings:S.settings, settingsT:S.settingsT||0,
    placement:S.placement||null, best:S.best||{}, startDate:S.startDate, logs:Object.assign({}, S.others, {[S.dev]:S.log})};
}
function mergeDoc(doc){
  if(!doc || typeof doc!=="object") return;
  for(const [k,c] of Object.entries(doc.cards||{})){ const m=S.cards[k]; if(!m || (c.t||0)>(m.t||0)) S.cards[k]=c; }
  for(const [k,d] of Object.entries(doc.grammarRead||{})) if(!S.grammarRead[k] || d<S.grammarRead[k]) S.grammarRead[k]=d;
  for(const [k,p] of Object.entries(doc.phonics||{})){ const m=S.phonics[k]||{}; S.phonics[k]={best:Math.max(m.best||0,p.best||0), done:[m.done,p.done].filter(Boolean).sort()[0]||null}; }
  if((doc.settingsT||0)>(S.settingsT||0)){ S.settings=Object.assign(defaultState().settings, doc.settings); S.settingsT=doc.settingsT; }
  if(doc.placement && (!S.placement || doc.placement.date>S.placement.date)) S.placement=doc.placement;
  const b=doc.best||{}; S.best=S.best||{};
  S.best.combo=Math.max(S.best.combo||0, b.combo||0);
  if(b.quiz!=null) S.best.quiz=Math.max(S.best.quiz||0, b.quiz);
  if(b.dict && (!S.best.dict || GRADES.indexOf(b.dict.grade)>GRADES.indexOf(S.best.dict.grade))) S.best.dict=b.dict;
  for(const [m,v] of Object.entries(b.type||{})){ S.best.type=S.best.type||{}; const cur=S.best.type[m]; if(!cur || GRADES.indexOf(v.grade)>GRADES.indexOf(cur.grade)) S.best.type[m]=v; }
  if(doc.startDate && doc.startDate<S.startDate) S.startDate=doc.startDate;
  for(const [dev,lg] of Object.entries(doc.logs||{})){
    if(dev!==S.dev){ S.others[dev]=lg; continue; }
    for(const [day,l] of Object.entries(lg||{})){ const m=S.log[day]||{}, o={...m};
      for(const [k,v] of Object.entries(l)) o[k] = typeof v==="number" ? Math.max(m[k]||0,v) : (m[k]||v);
      S.log[day]=o; }
  }
  _logs=null;
}
function setSync(state){ SYNC.state=state; SYNC.on = state==="ok"||state==="busy";
  const el=document.getElementById("sync"); if(!el) return;
  const txt={ok:"已同步",busy:"同步中…",error:"未同步",auth:"仅本机"}[state];
  el.hidden=!txt; el.textContent=txt||""; el.className="sync s-"+state;
  el.title={ok:"手机和电脑的进度已经是同一份",busy:"正在保存到你的网站",error:"暂时连不上网站，联网后自动补传",auth:"没有登录工具箱口令，进度只存在这台设备"}[state]||""; }
async function pull(){
  const r=await fetch(API,{credentials:"same-origin",cache:"no-store"});
  if(r.status===401) throw "auth"; if(!r.ok) throw "http"+r.status;
  const j=await r.json(); SYNC.version=Number(j.version)||0; mergeDoc(j.data);
}
async function pushNow(force){
  for(let i=0;i<4;i++){
    const body=JSON.stringify({base:SYNC.version, data:docFromState()});
    const r=await fetch(API,{method:"PUT",credentials:"same-origin",headers:{"content-type":"application/json","x-tools-request":"1"},body,keepalive:body.length<60000});
    if(r.ok){ SYNC.version=(await r.json()).version; SYNC.dirty=false; SYNC.last=new Date().toLocaleTimeString(); setSync("ok"); return; }
    if(r.status===409){ const j=await r.json(); SYNC.version=Number(j.version)||0; if(!force) mergeDoc(j.data); saveLocal(); continue; }
    if(r.status===401){ setSync("auth"); throw "auth"; }
    throw "http"+r.status;
  }
  throw "conflict";
}
function syncLater(){ if(!SYNC.on && SYNC.state!=="error") return; SYNC.dirty=true; clearTimeout(SYNC.timer); SYNC.timer=setTimeout(()=>flush(), 4000); }
async function flush(){ if(!SYNC.dirty || SYNC.busy) return; SYNC.busy=pushNow(false).catch(e=>{ if(e!=="auth") setSync("error"); }).finally(()=>{ SYNC.busy=null; }); return SYNC.busy; }
const idle = () => !session && !quiz && !dict && !place && !phQ;
async function syncStart(manual){
  if(!/^https?:$/.test(location.protocol)) return;
  try{ setSync(SYNC.on?"busy":SYNC.state==="local"?"local":"busy");
    await pull(); saveLocal(); setSync("ok"); SYNC.dirty=true; await flush(); SYNC.last=new Date().toLocaleTimeString();
    if(idle() || manual) render(); if(manual) toast("已同步");
  }catch(e){
    if(e==="auth") setSync("auth"); else if(String(e).startsWith("http404")) setSync("local"); else setSync("error");
    if(manual) toast("同步失败，稍后再试");
  }
}
document.addEventListener("visibilitychange", ()=>{ if(document.hidden){ if(SYNC.dirty) flush(); } else if(SYNC.on||SYNC.state==="error") syncStart(false); });
window.addEventListener("pagehide", ()=>{ if(SYNC.dirty) flush(); });

/* =================== 渲染与事件 =================== */
function render(){ nav(); app.innerHTML = V[cur](); updateStreak(); }
function setLevel(i){ S.settings.level=i; S.settingsT=Date.now(); wordLv=null; sentLv=null; place=null; save(); render(); toast(`已切换到 ${LV_NAME(i)}`); }

app.addEventListener("click", e => {
  const t = e.target.closest("[data-say],[data-go],[data-rate],[data-cat],[data-gram],[data-mic],[data-micx],[data-opt],[data-manual],[data-ph],[data-blend],[data-pho],[data-popt],[data-tmode],[data-wlv],[data-slv],[data-setlv],[data-copy],button[id]");
  if(!t) return;
  const d=t.dataset;
  if(d.say){ e.preventDefault(); say(d.say); return; }
  if(d.go){ e.preventDefault(); if(d.go==="phon" && t.closest(".task")){ phOpen=phNext(); phQ=null; } go(d.go); return; }
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
  if(d.popt!==undefined){ placeAnswer(+d.popt); return; }
  if(d.tmode){ startTyping(d.tmode); return; }
  if(d.manual){ const L=dayLog(), on=dayView()[d.manual]; L[d.manual]=!on; if(on) for(const lg of Object.values(S.others)) if(lg[today()]) lg[today()][d.manual]=false; save(); render(); return; }
  if(d.copy!==undefined){ const txt=document.getElementById("pr-"+d.copy).textContent;
    const sel=()=>{ const r=document.createRange(); r.selectNodeContents(document.getElementById("pr-"+d.copy)); const s=getSelection(); s.removeAllRanges(); s.addRange(r); toast("已选中，请手动复制"); };
    try{ navigator.clipboard.writeText(txt).then(()=>toast("已复制，粘贴给 AI 就能用"), sel); }catch(err){ sel(); } return; }
  switch(t.id){
    case "syncnow": syncStart(true); break;
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
    case "pback": quiz=null; dict=null; place=null; render(); break;
    case "pstart": quiz=null; dict=null; startPlace(); break;
    case "pstartgo": cur="quiz"; history.replaceState(null,"","#quiz"); quiz=null; dict=null; startPlace(); break;
    case "dplay": playRound(); dictFocus(); break;
    case "dslow": playRound(0.55); dictFocus(); break;
    case "dhint": dict.hint=true; render(); dictFocus(); break;
    case "dzh": dict.showZh=!dict.showZh; render(); dictFocus(); break;
    case "dnext": dictNext(); break;
    case "qstart": dict=null; place=null; makeQuiz(); render(); { const q=quiz.qs[0]; if(q && q.type==="listen") setTimeout(()=>say(q.x.w),200); } break;
    case "qgo": quiz.i++; quiz.answered=false;
      if(quiz.i>=quiz.qs.length){ dayLog().quiz++; S.best=S.best||{}; S.best.quiz=Math.max(S.best.quiz||0,quiz.right); save(); }
      render(); { const q=quiz.qs[quiz.i]; if(q && q.type==="listen") setTimeout(()=>say(q.x.w),200); } break;
    case "slow": S.settings.rate = S.settings.rate<=0.7 ? 0.85 : 0.6; S.settingsT=Date.now(); save(); render(); break;
    case "exp": { const txt=JSON.stringify(S); const show=()=>{ document.getElementById("bk").classList.remove("hide"); const ta=document.getElementById("bktxt"); ta.value=txt; ta.select(); };
      try{ navigator.clipboard.writeText(txt).then(()=>toast("已复制，粘贴到备忘录里保存"),()=>{ show(); toast("请手动复制下面的内容"); }); }catch(err){ show(); } } break;
    case "impbtn": document.getElementById("bk").classList.remove("hide"); document.getElementById("bktxt").value=""; document.getElementById("bktxt").focus(); break;
    case "impgo": try{ const d2=JSON.parse(document.getElementById("bktxt").value); if(!d2.cards) throw 0; const dev=S.dev; S=load(d2); S.dev=dev; save(); render(); toast("导入成功"); }catch(err){ toast("内容格式不对，请粘贴完整的备份"); } break;
    case "reset": if(t.dataset.sure){ const dev=S.dev; S=defaultState(); S.dev=dev; saveLocal(); session=null; quiz=null; render(); if(SYNC.on) pushNow(true).then(()=>toast("已清空，所有设备的进度都清掉了")).catch(()=>toast("本机已清空，但同步失败，其他设备的进度还在")); else toast("已清空"); }
      else { t.dataset.sure="1"; t.textContent="再点一次确认清空（不能撤销）"; } break;
  }
});
app.addEventListener("change", e => {
  const id=e.target.id;
  if(["npd","nsd","rate","voice","sfx"].includes(id)) S.settingsT=Date.now();
  if(id==="sfx"){ S.settings.sfx = e.target.value==="1"; save(); sfx("perfect"); }
  if(id==="lvsel"){ setLevel(+e.target.value); }
  if(id==="npd"){ S.settings.newPerDay=Math.max(1,Math.min(50,+e.target.value||10)); save(); }
  if(id==="nsd"){ S.settings.newSentPerDay=Math.max(1,Math.min(30,+e.target.value||5)); save(); }
  if(id==="rate"){ S.settings.rate=+e.target.value; save(); }
  if(id==="voice"){ S.settings.voice=e.target.value; save(); say("Hello! I'm learning English."); }
});
app.addEventListener("input", e => {
  if(e.target.id==="dinput" && /\s$/.test(e.target.value)) dictSubmit(e.target.value);
});
document.addEventListener("keydown", e => {
  if(cur==="quiz" && dict){
    if(e.target.id==="dinput" && e.key==="Enter"){ e.preventDefault(); dictSubmit(e.target.value); return; }
    if(e.key==="Enter" && document.getElementById("dnext")){ e.preventDefault(); dictNext(); return; }
  }
  if(!session || !session.queue.length || /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
  if(!((cur==="words"&&session.kind==="w")||(cur==="sent"&&session.kind==="s"))) return;
  if(e.code==="Space"){ e.preventDefault(); if(!session.show) reveal(); else { const k=session.queue[0]; say(isSent(k)?sentByKey[k].en:k); } }
  if(session.show && ["1","2","3"].includes(e.key)) doRate(+e.key-1);
});
window.addEventListener("hashchange", ()=>{ const k=location.hash.slice(1); if(k!==cur && ROUTES.includes(k)){ cur=k; render(); } });

render();
syncStart(false);
})();
