// 通用工作区地图渲染器：内容从已鉴权的数据载荷提供，不含真实地图数据。
(function (global) {
  'use strict';
  const realDoc=global.document;
  const scriptURL=new URL(realDoc.currentScript.src);
  const styleURL=new URL('codex.css',scriptURL);styleURL.search=scriptURL.search;
function createSafeDOM(doc) {
  const tags = new Set('a article aside b br button circle code dd defs desc details dialog div dl dt em fieldset footer g h1 h2 h3 header hr i input label li line main marker nav ol option p path polygon polyline rect section select small span strong summary svg table tbody td text textarea th thead title tr ul'.split(' '));
  const ns = 'http://www.w3.org/2000/svg';
  const svgNames = { viewbox:'viewBox', refx:'refX', refy:'refY', markerwidth:'markerWidth', markerheight:'markerHeight', preserveaspectratio:'preserveAspectRatio' };
  const attrs = new Set('id class role tabindex type value name readonly disabled hidden open width height x y x1 y1 x2 y2 cx cy r rx ry d points fill stroke stroke-width viewbox refx refy markerwidth markerheight orient text-anchor marker-end placeholder rel target href'.split(' '));
  function decode(s) { return String(s).replace(/&(?:amp|lt|gt|quot|apos|#39|#x[0-9a-f]+|#\d+);/gi, token => {
    const key=token.slice(1,-1).toLowerCase(), named={amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",'#39':"'"};
    if(Object.hasOwn(named,key))return named[key];
    const n=key.startsWith('#x')?parseInt(key.slice(2),16):parseInt(key.slice(1),10);
    return Number.isInteger(n)&&n>0&&n<=0x10ffff?String.fromCodePoint(n):'\ufffd';
  }); }
  function attr(el,k,v) {
    const key=k.toLowerCase();
    if(!attrs.has(key)&&!/^aria-[a-z-]+$/.test(key)&&!/^data-[a-z-]+$/.test(key))return;
    const value=String(v);
    if(key==='href'&&!/^(?:https:\/\/|\/[^/]|#)/.test(value))return;
    if(key==='marker-end'&&!/^url\(#[a-zA-Z0-9_-]+\)$/.test(value))return;
    el.setAttribute(svgNames[key]||key,value);
    if(key==='target'&&value==='_blank')el.setAttribute('rel','noopener noreferrer');
  }
  function element(tag,svg){return svg?doc.createElementNS(ns,tag):doc.createElement(tag);}
  function text(parent,value){const node=doc.createTextNode('');node.textContent=value;parent.appendChild(node);}
  function tree(spec,parent,svg=false){
    if(typeof spec==='string'){text(parent,spec);return;}
    if(!spec||!tags.has(spec.tag))return;
    const isSVG=svg||spec.tag==='svg',el=element(spec.tag,isSVG);
    for(const [k,v] of Object.entries(spec.attrs||{}))attr(el,k,v);
    for(const child of spec.children||[])tree(child,el,isSVG);
    parent.appendChild(el);
  }
  function markup(parent,source){
    const fragment=doc.createDocumentFragment(), stack=[fragment];
    const svgStack=[parent.namespaceURI===ns];
    for(const token of String(source).match(/<[^>]*>|[^<]+/g)||[]){
      if(token[0]!=='<'){text(stack[stack.length-1],decode(token));continue;}
      if(token.startsWith('</')){if(stack.length>1){stack.pop();svgStack.pop();}continue;}
      const m=/^<([a-zA-Z][a-zA-Z0-9-]*)\b/.exec(token);if(!m)continue;
      const tag=m[1].toLowerCase();if(!tags.has(tag))continue;
      const isSVG=svgStack[svgStack.length-1]||tag==='svg',el=element(tag,isSVG);
      const attributes=token.slice(m[0].length).replace(/\/?\s*>$/,'');
      const pattern=/([a-zA-Z_:][-a-zA-Z0-9_:.]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
      let a;while((a=pattern.exec(attributes)))attr(el,a[1],decode(a[2]??a[3]??a[4]??''));
      stack[stack.length-1].appendChild(el);
      if(!/\/\s*>$/.test(token)&&!['br','hr','input'].includes(tag)){stack.push(el);svgStack.push(isSVG);}
    }
    parent.replaceChildren(fragment);
  }
  return {tree,markup};
}

  global.ToolmapWorkspace={mount(root,payload){
    const host=realDoc.createElement('div');host.className='workspace-host';
    const shadow=host.attachShadow({mode:'open'});
    const style=realDoc.createElement('link');style.rel='stylesheet';style.href=styleURL.href;shadow.appendChild(style);
    const safe=createSafeDOM(realDoc);for(const node of payload.template)safe.tree(node,shadow);
    root.replaceChildren(host);root.classList.add('workspace-view');
    const syncTheme=()=>{host.dataset.theme=realDoc.documentElement.getAttribute('data-theme')||'system';};syncTheme();
    const observer=new MutationObserver(syncTheme);observer.observe(realDoc.documentElement,{attributes:true,attributeFilter:['data-theme']});
    const document={getElementById:id=>shadow.getElementById(id),querySelector:s=>shadow.querySelector(s),querySelectorAll:s=>shadow.querySelectorAll(s),addEventListener:(...a)=>shadow.addEventListener(...a),createElement:t=>realDoc.createElement(t),body:host,documentElement:host};
    const markup=safe.markup;
    const {tools,workspaces,scenarios,commands,topics,issues,repos}=payload.data;
    const SNAPSHOT=payload.snapshot;
const $=id=>document.getElementById(id);
function esc(v){return String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
const {toolIds,tokens,toolRead,toolWrite,nodes,resources,layers}=payload.view;
let currentTool=1,currentNode=toolIds[1],relationMode='all',activeFilter='全部',currentView='map';
const nodeById=id=>nodes.find(n=>n.id===id);
function edgesFor(i){const id=toolIds[i],a=[['you',id,'work'],[id,i<3?'local':'cloud','work']];if(i<3){a.push(['global',id,'read'],['native',id,'read'],['knowledge','local','read'],['local','knowledge','write'],['local','global','write'],['global','github','sync'],['knowledge','github','sync']);if(i<2)a.push(['project','local','read'],['local','project','write']);if(i===2)a.push(['local','native','write']);}else{a.push(['github',id,'read'],['knowledge','github','sync']);if(i===3)a.push(['local',id,'read']);}return a;}
function eligibleEdges(){return edgesFor(currentTool).filter(e=>relationMode==='all'||e[2]===relationMode||(relationMode==='write'&&e[2]==='sync'));}
function edgePath(from,to,role,index){const a=nodeById(from),b=nodeById(to);const forward=b.x>=a.x;const ax=forward?a.x+a.w:a.x,ay=a.y+a.h/2,bx=forward?b.x:b.x+b.w,by=b.y+b.h/2;
 if(from==='knowledge'&&to==='github')return `M ${ax} ${ay} C ${ax+50} ${ay}, ${bx-50} ${by}, ${bx} ${by}`;
 if(Math.abs(b.x-a.x)>300){const lane=role==='read'?18+(index%3)*9:480+(index%3)*9;return `M ${ax} ${ay} C ${ax+(forward?35:-35)} ${ay}, ${ax+(forward?35:-35)} ${lane}, ${ax+(forward?60:-60)} ${lane} L ${bx-(forward?40:-40)} ${lane} Q ${bx-(forward?8:-8)} ${lane} ${bx-(forward?8:-8)} ${lane+(lane<by?22:-22)} L ${bx-(forward?8:-8)} ${by} L ${bx} ${by}`;}
 const bend=Math.max(30,Math.abs(bx-ax)*.45),offset=role==='write'?12:role==='read'?-12:0;return `M ${ax} ${ay+offset} C ${ax+(forward?bend:-bend)} ${ay+offset}, ${bx-(forward?bend:-bend)} ${by+offset}, ${bx} ${by+offset}`;}
function renderMap(){
 const selected=eligibleEdges(),connected=new Set(selected.flatMap(e=>e.slice(0,2)));connected.add(toolIds[currentTool]);
 markup($('layer-labels'),layers.map(([s,x])=>`<text class="layer-label" x="${x}" y="12">${s}</text>`).join(''));
 markup($('map-context'),toolIds.map((id,i)=>`<path class="context-edge" d="${edgePath('you',id,'work',i)}"/>`).join(''));
 markup($('map-edges'),selected.map((e,i)=>`<path class="edge ${e[2]}" d="${edgePath(...e,i)}" marker-end="url(#arrow-${e[2]==='sync'?'write':e[2]})"/>`).join(''));
 markup($('map-nodes'),nodes.map(n=>`<g class="node${n.id===currentNode?' active':connected.has(n.id)?' connected':' dim'}" data-node="${n.id}" role="button" tabindex="0" aria-label="查看${esc(n.title)}详情" aria-pressed="${n.id===currentNode}"><rect class="node-card" x="${n.x}" y="${n.y}" width="${n.w}" height="${n.h}" rx="11"/><rect class="node-icon-bg" x="${n.x+12}" y="${n.y+11}" width="25" height="23" rx="6"/><text class="node-icon" text-anchor="middle" x="${n.x+24.5}" y="${n.y+26.5}">${esc(n.token)}</text><text class="node-title" x="${n.x+12}" y="${n.y+49}"${n.title.length>15?' class="node-title long-title"':''}>${esc(n.title)}</text>${n.h>70?`<text class="node-note" x="${n.x+12}" y="${n.y+67}">${esc(n.note)}</text>`:''}${n.id===toolIds[currentTool]?`<circle class="node-indicator" cx="${n.x+n.w-14}" cy="${n.y+18}" r="3"/>`:''}</g>`).join(''));
 markup($('tool-picker'),tools.map((t,i)=>`<button type="button" class="tool-pick" data-tool="${i}" aria-pressed="${i===currentTool}"><span class="tool-token">${esc(tokens[i])}</span>${esc(t.name)}</button>`).join(''));
 $('map-caption').textContent=`正在查看 ${tools[currentTool].name} · ${relationMode==='all'?'全部关系':{read:'开工读取',work:'工作位置',write:'收工写入'}[relationMode]}`;
 $('map-tip').textContent=currentTool>=3?'网页端的本机／远端读取依据既有文档与连接器约定；本轮未重新登录验证。紫线表示来源已推送关系，不代表网页端可 push。':'箭头表示当前工具的读取、干活与归位路径；紫色点线为仓库同步关系，执行写入与推送仍须遵守授权。';
 document.querySelectorAll('[data-mode]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.mode===relationMode)));
 renderMobileMap();
}
function renderMobileMap(){let routes=[];if(relationMode==='all'||relationMode==='work')routes.push(['local','干活',currentTool<3?'本机工作区':'云端 Projects','work']);if(relationMode==='all'||relationMode==='read'){routes.push([currentTool<3?'global':'github','开工读',currentTool<3?'全局记忆':'已推送的仓库','read']);routes.push(['knowledge','开工读','规则与进度','read']);}if(relationMode==='all'||relationMode==='write')routes.push([currentTool<3?'knowledge':'cloud','收工写',currentTool<3?'分流结论与进度':'输出结论，交本机回写','write']);markup($('mobile-map'),`<div class="mobile-origin"><span class="big-token">我</span>提出目标 · 确认与验收</div><div class="mobile-current"><strong>${esc(tools[currentTool].name)}</strong><p>${currentTool<3?'在本机工作区执行':'云端讨论与协作'}</p></div><div class="mobile-connector"></div><div class="mobile-resources">${routes.map(r=>`<button type="button" class="mobile-resource" data-node="${r[0]==='local'&&currentTool>=3?'cloud':r[0]}" data-role="${r[3]}"><span>${r[1]}</span>${esc(r[2])} ↗</button>`).join('')}</div>`);}
function selectTool(i){if(!Number.isInteger(i)||i<0||i>=tools.length)return;currentTool=i;currentNode=toolIds[i];renderMap();renderInspector();}
function selectNode(id){const n=nodeById(id);if(!n)return;if(n.tool!==undefined){selectTool(n.tool);return;}currentNode=id;renderMap();renderInspector();}
function step(label,body,path,kind){return `<div class="step ${kind||''}"><div class="step-label">${label}</div><p>${esc(body)}</p>${path?`<span class="path">${esc(path)}</span>`:''}</div>`;}
function renderInspector(){const n=nodeById(currentNode);if(n.tool!==undefined){const i=n.tool,t=tools[i];markup($('inspector'),`<div class="inspector-top"><div class="inspector-kicker">SELECTED TOOL / ${String(i+1).padStart(2,'0')}</div><div class="inspector-heading"><span class="big-token">${esc(tokens[i])}</span><h2>${esc(t.name)}</h2></div><p class="inspector-summary">${esc(t.role.replace(/\n/g,' · '))} <small>（建议分工）</small></p><div class="badge-row"><span class="badge ${i<3?'green':'amber'}">${esc(t.memory)}</span><span class="badge">${i<3?'本机':'网页端'}</span></div></div><div class="inspector-body">${step('01 / 开工读',toolRead[i],t.entry,'')}${step('02 / 在哪里干活',i<3?'草稿和过程文件放对应本机工作区。':'云端项目对话与相关资料。',t.workspace,'work-step')}${step('03 / 收工写',toolWrite[i],null,'write-step')}<div class="detail-facts"><b>GitHub：</b>${esc(t.push)}。${esc(t.pushNote)}<br><b>接入说明：</b>${esc(t.memoryNote)}</div><details><summary>查看入口与验证边界</summary><p class="path">${esc(t.entry)}</p><p>本图为 ${esc(SNAPSHOT)} 脱敏快照。文件已配置与运行时确已加载分开；网页能力未重新登录验证。快照能力说明不等于本次上线的验证结果。</p></details><button type="button" class="copy" data-copy-tool="${i}">复制开工提示词 ↗</button></div>`);}else{const r=resources[currentNode];markup($('inspector'),`<div class="inspector-top"><div class="inspector-kicker">SELECTED RESOURCE / ${esc(n.token)}</div><div class="inspector-heading"><span class="big-token">${esc(n.token)}</span><h2>${esc(r.title)}</h2></div><p class="inspector-summary">${esc(r.intro)}</p></div><div class="inspector-body"><div class="resource-content"><p class="resource-paragraph">${esc(r.body)}</p><p class="path muted resource-path">${esc(r.path)}</p>${currentNode==='local'?'<button type="button" class="copy" data-audit="workspaces">查看工作区清单 ↗</button>':currentNode==='github'?'<button type="button" class="copy" data-audit="repos">查看仓库清单 ↗</button>':currentNode==='native'?'<button type="button" class="copy" data-copy-resource="native">复制记忆路径 ↗</button>':''}</div><button type="button" class="return-button" data-return-tool>← 返回 ${esc(tools[currentTool].name)} 的详情</button></div>`);}}
function switchView(name,focus=false){if(!['map','progress','routing'].includes(name))return;currentView=name;document.querySelectorAll('[data-view]').forEach(b=>{const on=b.dataset.view===name;b.setAttribute('aria-selected',String(on));b.tabIndex=on?0:-1;});for(const key of ['map','progress','routing'])$('view-'+key).hidden=key!==name;if(focus)$('tab-'+name).focus();}
function todayShanghai(){const p=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());const g=k=>p.find(x=>x.type===k).value;return `${g('year')}-${g('month')}-${g('day')}`;}
function calendarDays(a,b=todayShanghai()){return Math.max(0,Math.floor((Date.parse(b+'T00:00:00Z')-Date.parse(a+'T00:00:00Z'))/86400000));}
const filterNames=['全部','进行中','待确认','待核对','超 14 天','未设看板'];
function renderBoard(){const q=$('search').value.trim().toLocaleLowerCase('zh-CN');const visible=topics.filter(t=>(activeFilter==='全部'||(activeFilter==='超 14 天'?t.date&&calendarDays(t.date)>14:t.status===activeFilter))&&[t.name,t.state,t.next,t.status].join(' ').toLocaleLowerCase('zh-CN').includes(q));markup($('board'),visible.length?visible.map(t=>{const days=t.date?calendarDays(t.date):null,stale=days!==null&&days>14,color=t.status==='已交付'?'green':t.status==='待确认'||t.status==='待核对'?'amber':t.status==='进行中'?'blue':'';return `<article class="progress-card${stale?' stale':''}" data-topic="${esc(t.name)}"><div class="card-top"><span class="card-category">${esc(t.category)}</span><span class="badge ${color}">${t.status}</span></div><h3>${esc(t.name)}</h3><p class="card-state">${esc(t.state)}</p><div class="card-next"><b>下一步</b>${esc(t.next)}</div>${t.note?`<p class="card-note">${esc(t.note)}</p>`:''}<div class="card-date"><span>${t.date?'看板更新 '+t.date:'未设置进度文件'}</span><span${stale?' class="overdue"':''}>${days===null?'不判断过期':days===0?'今天':days+' 天前'+(stale?' · 需复核':'')}</span></div><div class="card-source">来源：${esc(t.source)}</div></article>`;}).join(''):'<div class="panel empty-state">没有符合条件的主题，试试其他筛选或清空搜索。</div>');$('board-summary').textContent=`${topics.length} 个主题 · ${topics.filter(t=>t.date&&calendarDays(t.date)>14).length} 个看板超期`;$('board-status').textContent=`显示 ${visible.length} / ${topics.length} 个主题 · ${activeFilter}`;document.querySelectorAll('[data-filter]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.filter===activeFilter)));}
function chooseScene(key){const s=scenarios.find(x=>x.key===key);if(!s)return;document.querySelectorAll('[data-scene]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.scene===key)));markup($('scenario-result'),`<div class="result-caption">${esc(s.name)} / INFORMATION ROUTING</div><h3>${esc(s.where)}</h3><div class="result-path">${esc(s.path)}</div><p class="result-explain">${esc(s.why)}</p><div class="quote"><div class="quote-top"><span>对 AI 说这句话</span><button class="copy" type="button" data-copy-scene="${s.key}">复制这句话 ↗</button></div><p>${esc(s.say)}</p></div>`);}
let toastTimer;function notify(s){$('toast').textContent=s;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>{$('toast').hidden=true;},3500);}
async function copyText(text,container){try{if(navigator.clipboard&&window.isSecureContext){await navigator.clipboard.writeText(text);notify('已复制，可以粘贴给 AI');return;}}catch{}const t=document.createElement('textarea');t.value=text;t.setAttribute('readonly','');t.style.cssText='position:fixed;left:-9999px;top:0';document.body.append(t);t.select();let ok=false;try{ok=document.execCommand('copy');}catch{}t.remove();if(ok){notify('已复制，可以粘贴给 AI');return;}let f=container.querySelector('.copy-fallback');if(!f){f=document.createElement('div');f.className='copy-fallback';const p=document.createElement('p');p.textContent='浏览器未允许复制，请手动复制下面的文字。';const a=document.createElement('textarea');a.readOnly=true;a.setAttribute('aria-label','可手动复制的文字');f.append(p,a);container.append(f);}f.querySelector('textarea').value=text;f.querySelector('textarea').focus();f.querySelector('textarea').select();notify('请手动复制下方已选中的文字');}
const auditNames={tools:'AI 分工表',workspaces:'工作区清单',issues:'乱点与差异',repos:'GitHub 仓库',sources:'来源与边界'};
function auditContent(type){if(type==='tools')return `<div class="table-scroll"><table><thead><tr><th>工具</th><th>工作区</th><th>开工读取</th><th>全局记忆</th><th>能否 push</th><th>建议分工</th></tr></thead><tbody>${tools.map(t=>`<tr><td>${esc(t.name)}</td><td class="path">${esc(t.workspace)}</td><td>${esc(t.read)}<small class="path">${esc(t.entry)}</small></td><td>${esc(t.memory)}<small>${esc(t.memoryNote)}</small></td><td>${esc(t.push)}<small>${esc(t.pushNote)}</small></td><td>${esc(t.role)}</td></tr>`).join('')}</tbody></table></div><p class="view-note">表格可横向滚动。入口配置不等于运行加载已验收；本轮没有真实推送。</p>`;
 if(type==='workspaces')return `<div class="table-scroll"><table><thead><tr><th>目录</th><th>项目 memory/</th><th>本目录 Git</th><th>远端／说明</th></tr></thead><tbody>${workspaces.map(w=>`<tr>${w.map((v,i)=>`<td${i===0?' class="path"':''}>${esc(v)}</td>`).join('')}</tr>`).join('')}</tbody></table></div><p class="view-note">工作区根目录、项目记忆与正式知识库的 Git 关系分开核对。</p>`;
 if(type==='issues')return issues.map((x,i)=>`<article class="issue"><span class="issue-index">${String(i+1).padStart(2,'0')}</span><div><span class="issue-label">事实</span><h3>${esc(x[0])}</h3><p>${esc(x[1])}</p></div><div class="issue-suggestion"><span class="issue-label">建议</span><p>${esc(x[2])}</p></div></article>`).join('')+'<p class="view-note">只记录，未修复。已记录的刻意权限差异不算错误；软链也不是副本。</p>';
 if(type==='repos')return `<div class="repo-grid">${repos.map(r=>`<div class="repo"><span>${esc(r[0])}</span><span>${r[1]}</span></div>`).join('')}</div><p class="view-note">${esc(SNAPSHOT)} 的 gh repo list 只读结果；只保留名称与可见性，更新时重新查询。</p>`;
 return payload.sourcesHTML;}

function openAudit(type){if(!auditNames[type])type='sources';markup($('audit-tabs'),Object.entries(auditNames).map(([id,name])=>`<button type="button" class="audit-tab" role="tab" id="audit-tab-${id}" aria-selected="${id===type}" aria-controls="audit-body" tabindex="${id===type?0:-1}" data-audit-tab="${id}">${name}</button>`).join(''));$('audit-body').setAttribute('role','tabpanel');$('audit-body').setAttribute('aria-labelledby','audit-tab-'+type);markup($('audit-body'),auditContent(type));$('audit-title').textContent=auditNames[type];const d=$('audit-dialog');if(!d.open)d.showModal();}
function initialRender(){
 markup($('scenario-menu'),scenarios.map((s,i)=>`<button class="scenario" type="button" data-scene="${s.key}" aria-pressed="false"><span class="scenario-num">${String(i+1).padStart(2,'0')}</span>${esc(s.name)}<span class="scenario-arrow">→</span></button>`).join(''));
 markup($('commands-grid'),commands.map((c,i)=>`<article class="panel command"><h3>${esc(c.name)}</h3><p>${esc(c.brief)}</p><button type="button" class="copy" data-command="${i}">复制口令 ↗</button></article>`).join(''));
 markup($('filters'),filterNames.map(f=>`<button class="filter" type="button" data-filter="${f}" aria-pressed="false">${f}</button>`).join(''));
 renderMap();renderInspector();renderBoard();chooseScene('preference');
}
document.addEventListener('click',e=>{const t=e.target.closest('button,[data-node]');if(!t)return;const d=t.dataset;
 if(d.view)switchView(d.view);else if(d.tool!==undefined)selectTool(Number(d.tool));else if(d.node)selectNode(d.node);else if(d.mode){relationMode=d.mode;renderMap();}else if(d.returnTool!==undefined){currentNode=toolIds[currentTool];renderMap();renderInspector();}else if(d.scene)chooseScene(d.scene);else if(d.filter){activeFilter=d.filter;renderBoard();}else if(d.audit)openAudit(d.audit);else if(d.auditTab)openAudit(d.auditTab);else if(d.copyScene)copyText(scenarios.find(s=>s.key===d.copyScene).say,$('scenario-result'));else if(d.command!==undefined)copyText(commands[Number(d.command)].text,t.closest('article'));else if(d.copyTool!==undefined){const i=Number(d.copyTool);copyText(`我用 ${tools[i].name} 开工。先核对 ${tools[i].entry} 和对应项目入口，按任务读取记忆、知识库主档与进度，再给出需要修改的文件和计划；未经授权不修改或推送。`,$('inspector'));}else if(d.copyResource==='native')copyText(resources.native.path,$('inspector'));
});
document.addEventListener('keydown',e=>{const n=e.target.closest('[data-node]');if(n&&(e.key==='Enter'||e.key===' ')){e.preventDefault();const inMobile=Boolean(n.closest('.mobile-map'));selectNode(n.dataset.node);const replacement=document.querySelector(`${inMobile?'.mobile-map ':'.map-stage '}[data-node="${n.dataset.node}"]`);if(replacement)replacement.focus();}const t=e.target.closest('[data-view]');if(t&&['ArrowLeft','ArrowRight','Home','End'].includes(e.key)){e.preventDefault();const keys=['map','progress','routing'],i=keys.indexOf(currentView),j=e.key==='Home'?0:e.key==='End'?2:(i+(e.key==='ArrowRight'?1:2))%3;switchView(keys[j],true);}const a=e.target.closest('[data-audit-tab]');if(a&&['ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();const keys=Object.keys(auditNames),i=keys.indexOf(a.dataset.auditTab),next=keys[(i+(e.key==='ArrowRight'?1:keys.length-1))%keys.length];openAudit(next);$('audit-tab-'+next).focus();}});
$('search').addEventListener('input',renderBoard);$('close-audit').addEventListener('click',()=>$('audit-dialog').close());
initialRender();

    return ()=>{observer.disconnect();clearTimeout(toastTimer);const d=document.getElementById('audit-dialog');if(d&&d.open)d.close();root.classList.remove('workspace-view');};
  }};
})(window);
