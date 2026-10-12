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
  if (row.kind === 'leave' || row.kind === 'rest') minutes = null;
  else if (row.kind === 'makeup') minutes = 480;
  else if (minutes !== null && (!Number.isInteger(minutes) || minutes < 0 || minutes > 1440)) throw new Error('OA时长需在0到1440分钟之间');
  const note = String(row.note || '').trim();
  if (note.length > 240) throw new Error('备注最多240字');
  return {date:row.date,kind:row.kind,minutes,note};
}
export function delta(row) {
  if (row.kind === 'leave' || row.kind === 'rest') return 0;
  if (row.kind === 'makeup') return -36;
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
  const source=String(text).normalize('NFKC').replace(/[：]/g,':').replace(/([\u3400-\u9fff])[ \t]+(?=[\u3400-\u9fff])/g,'$1');
  for (const raw of source.split(/\n/)) {
    const dateMatch=raw.match(/(20\d{2})\s*[-/.年]\s*(\d{1,2})\s*[-/.月]\s*(\d{1,2})\s*日?/);
    const short=raw.match(/(\d{1,2})\s*月\s*(\d{1,2})\s*日/);
    if(!dateMatch&&!short)continue;
    const date=dateMatch?`${dateMatch[1]}-${dateMatch[2].padStart(2,'0')}-${dateMatch[3].padStart(2,'0')}`:`${fallbackYear}-${short[1].padStart(2,'0')}-${short[2].padStart(2,'0')}`;
    if(!validDate(date))continue;
    // Date selectors above the table are not attendance rows.
    if(/起始|截止|查询|开始日期|结束日期/.test(raw))continue;
    let kind=/公休|休息日|节假|休日/.test(raw)?'rest':/请假|年假|病假|事假|调休/.test(raw)?'leave':/补卡|补打卡/.test(raw)?'makeup':/漏卡|缺卡|忘.*打卡|未打卡/.test(raw)?'missing':'normal';
    const duration=raw.match(/(\d{1,2})\s*(?:小时|小時|时)\s*(?:(\d{1,2})\s*分)?/);
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
  return [...map.values()].sort((a,b)=>a.date.localeCompare(b.date));
}

export function compareRecord(previous,row) {
  if(!previous)return {type:'new',message:delta(row)===null?'待确认：选择请假 / 公休 / 补卡，或补OA时长':'新增记录',previous:null};
  if(delta(previous)!==null && delta(row)===null && !row.note?.includes('识别到不同结果'))return {type:'same',message:'本次没有有效时长，保留已确认记录',previous};
  const same=previous.kind===row.kind&&previous.minutes===row.minutes&&previous.note===(row.note||'');
  return {type:same?'same':'changed',message:same?'已存在 · 自动跳过':`有变更 · 原记录 ${KINDS[previous.kind]} ${previous.minutes==null?'无时长':fmt(previous.minutes)}`,previous};
}
