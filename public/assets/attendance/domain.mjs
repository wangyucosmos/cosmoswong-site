export const KINDS = {normal:'正常', leave:'请假', rest:'公休日', missing:'漏卡 / 忘打卡', makeup:'补卡'};
export const TARGET = 516;
export function validDate(date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const d = new Date(`${date}T12:00:00Z`);
  return !isNaN(d) && d.toISOString().slice(0,10) === date && date >= '2000-01-01' && date <= '2100-12-31';
}
export function validateRecord(row) {
  if (!row || !validDate(row.date) || !Object.hasOwn(KINDS,row.kind)) throw new Error('日期或考勤类型不正确');
  let minutes = row.minutes;
  if (['leave', 'rest', 'makeup'].includes(row.kind)) minutes = null;
  else if (minutes !== null && (!Number.isInteger(minutes) || minutes < 0 || minutes > 1440)) throw new Error('OA时长需在0到1440分钟之间');
  const note = String(row.note || '').trim();
  if (note.length > 240) throw new Error('备注最多240字');
  return {date:row.date,kind:row.kind,minutes,note};
}
export function delta(row) {
  if (['leave', 'rest', 'makeup'].includes(row.kind)) return 0;
  if (row.minutes == null) return null;
  return row.minutes - TARGET;
}
export function summarize(rows,month) {
  const list=rows.filter(r=>r.date.startsWith(month)).sort((a,b)=>a.date.localeCompare(b.date));
  let balance=0,pending=0; const timeline=[];
  for(const row of list) {const value=delta(row);if(value===null)pending++;else balance+=value;timeline.push({...row,delta:value,balance});}
  return {balance,pending,count:list.length,required:Math.max(0,1-balance),passed:balance>0 && pending===0,timeline};
}
export function fmt(minutes, signed=false) {
  if(minutes==null)return '待确认';
  const abs=Math.abs(minutes),text=abs>=60?`${Math.floor(abs/60)}小时${abs%60?`${abs%60}分`:''}`:`${abs}分钟`;
  return (minutes<0?'−':signed&&minutes>0?'+':'')+text;
}
export function today() {return new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());}
export function parseOCR(text, fallbackYear = new Date().getFullYear()) {
  const result=[];
  const source=fixOCR(String(text).normalize('NFKC').replace(/[：]/g,':').replace(/([\u3400-\u9fff])[ \t]+(?=[\u3400-\u9fff])/g,'$1'));
  for (const raw of source.split(/\n/)) {
    const dateMatch=raw.match(/(20\d{2})\s*[-/.年]\s*(\d{1,2})\s*[-/.月]\s*(\d{1,2})\s*日?/);
    const short=raw.match(/(\d{1,2})\s*月\s*(\d{1,2})\s*日/);
    if(!dateMatch&&!short)continue;
    const date=dateMatch?`${dateMatch[1]}-${dateMatch[2].padStart(2,'0')}-${dateMatch[3].padStart(2,'0')}`:`${fallbackYear}-${short[1].padStart(2,'0')}-${short[2].padStart(2,'0')}`;
    if(!validDate(date))continue;
    // Date selectors above the table are not attendance rows.
    if(/起始|截止|查询|开始日期|结束日期/.test(raw))continue;
    // 日期是表格第一列：日期左边的字（比如截进来的左侧菜单「请假申请」）不属于这一行，不参与判断类型和时长
    const tail=raw.slice((dateMatch||short).index);
    let kind=/公休|休息日|节假|休日/.test(tail)?'rest':/请假|年假|病假|事假|调休/.test(tail)?'leave':/补卡|补打卡/.test(tail)?'makeup':/漏卡|缺卡|忘.*打卡|未打卡/.test(tail)?'missing':'normal';
    const duration=tail.match(/(\d{1,2})\s*(?:小时|小時|时)\s*(?:(\d{1,2})\s*分)?/);
    const minutes=duration && Number(duration[2]||0)<60?Number(duration[1])*60+Number(duration[2]||0):null;
    result.push({...validateRecord({date,kind,minutes:minutes<=1440?minutes:null}),raw});
  }
  const map=new Map();
  for(const row of result){
    const previous=map.get(row.date);
    if(!previous){map.set(row.date,row);continue;}
    if(previous.note==='同一日期识别到不同结果，请核对')continue;
    if(previous.minutes===row.minutes && previous.kind===row.kind)continue;
    const previousKnown=delta(previous)!==null,currentKnown=delta(row)!==null;
    if(!previousKnown && currentKnown){map.set(row.date,row);continue;}
    if(previousKnown && !currentKnown)continue;
    map.set(row.date,{...row,kind:'normal',minutes:null,note:'同一日期识别到不同结果，请核对'});
  }
  const rows=[...map.values()].sort((a,b)=>a.date.localeCompare(b.date));
  checkPunches(rows,source);
  return rows;
}

// OCR 常见错字：公休日 → 公体日 / 公伏日；小时 → 小 / /J\时 / 小財；分 → 份。只改「数字 + 像小时的字 + 数字 + 像分的字」这种组合
export function fixOCR(text){
  return text.replace(/公\s*[体伏]\s*[日目曰]/g,'公休日')
    .replace(/(\d)\s*(?:\/\s*J\s*\\?\s*[时吋財]?|J\s*[时吋財]|小\s*[时時吋財町]|小)\s*(\d{1,2})\s*[分份汾]/g,'$1小时$2分');
}
// 打卡时间核对：这个 OA 的打卡时长 = 末次打卡 − 首次打卡 − 1 小时午休（也接受不扣午休的写法）。
// 只用来「确认」或「拦下」识别出的时长，不凭打卡时间自己算时长：
//   读出的时长和打卡对不上 → 列为待确认，备注里写清楚；时长没读出来、但这一行里有两个数字正好对得上 → 采用；其余保持待确认
const PUNCH=/(?<![\d:])(\d{1,2}):(\d{2})(?![\d:])/g;
const RANGE=/\d{1,2}[:.]\d{2}\s*[-~～至]\s*\d{1,2}[:.]\d{2}/g;   // 班次「09:00-18:00」不是打卡时间
function checkPunches(rows,source){
  const lines=new Map();
  for(const raw of source.split(/\n/)){const m=raw.match(/(20\d{2})\s*[-/.年]\s*(\d{1,2})\s*[-/.月]\s*(\d{1,2})/);if(!m)continue;const date=`${m[1]}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}`;if(!lines.has(date))lines.set(date,[]);lines.get(date).push(raw);}
  const hm=v=>`${Math.floor(v/60)}:${String(v%60).padStart(2,'0')}`;
  for(const row of rows){
    if(row.kind!=='normal'&&row.kind!=='missing')continue;
    let span=null,first=null,last=null;
    for(const raw of lines.get(row.date)||[]){const t=[...raw.replace(RANGE,' ').matchAll(PUNCH)].map(m=>Number(m[1])*60+Number(m[2])).filter(v=>v<1440);if(t.length>=2&&t[t.length-1]>t[0]){first=t[0];last=t[t.length-1];span=last-first;break;}}
    if(span===null)continue;
    const ok=[span-60,span],lineList=lines.get(row.date)||[],cands=[];
    // 候选：这一天所有行里写成「X小时Y分」的，以及去掉日期、打卡时间后相邻的两个数字（只认扣午休的那种）
    for(const raw of lineList){
      for(const m of raw.matchAll(/(\d{1,2})\s*(?:小时|小時|时)\s*(\d{1,2})\s*分/g))if(Number(m[2])<60)cands.push({v:Number(m[1])*60+Number(m[2]),strict:true});
      const nums=[...raw.replace(/20\d{2}\s*[-/.年]\s*\d{1,2}\s*[-/.月]\s*\d{1,2}/g,' ').replace(RANGE,' ').replace(PUNCH,' ').matchAll(/\d{1,2}/g)].map(m=>Number(m[0]));
      for(let k=0;k+1<nums.length;k++)if(nums[k+1]<60)cands.push({v:nums[k]*60+nums[k+1],strict:false});
    }
    const match=cands.find(c=>c.strict?ok.includes(c.v):c.v===span-60);
    if(match){row.minutes=match.v;row.note='';continue;}                       // 和打卡对得上的读数：采用（两轮识别结果打架时也靠它挑对的）
    if(row.minutes!=null){row.note=`识别到 ${fmt(row.minutes)}，和打卡 ${hm(first)}–${hm(last)} 对不上，请核对`;row.minutes=null;continue;}
    if(!row.note)row.note=`时长没读清（打卡 ${hm(first)}–${hm(last)}），请补OA时长`;
  }
}

export function compareRecord(previous,row) {
  if(!previous)return {type:'new',message:delta(row)===null?(row.note?`待确认：${row.note}`:'待确认：选择请假 / 公休 / 补卡，或补OA时长'):'新增记录',previous:null};
  if(delta(previous)!==null && delta(row)===null && !row.note?.includes('识别到不同结果'))return {type:'same',message:'本次没有有效时长，保留已确认记录',previous};
  const same=previous.kind===row.kind&&previous.minutes===row.minutes&&previous.note===(row.note||'');
  return {type:same?'same':'changed',message:same?'已存在 · 自动跳过':`有变更 · 原记录 ${KINDS[previous.kind]} ${previous.minutes==null?'无时长':fmt(previous.minutes)}`,previous};
}
