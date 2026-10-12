import {test} from 'node:test';import assert from 'node:assert/strict';
import {delta,summarize,validateRecord,validDate,parseOCR,fmt,compareRecord} from '../../public/assets/attendance/domain.mjs';
import {linesFromBlocks} from '../../public/assets/attendance/ocr.mjs';
const row=(date,minutes,kind='normal')=>({date,minutes,kind,note:''});
test('OA时长减516分钟，不重复扣午休',()=>{assert.equal(delta(row('2026-10-01',505)),-11);assert.equal(delta(row('2026-10-01',634)),118);});
test('盈亏抵扣；自然月隔离；零余额仍欠1分钟',()=>{const rows=[row('2026-09-30',600),row('2026-10-01',496),row('2026-10-02',546)];assert.equal(summarize(rows,'2026-10').balance,10);assert.equal(summarize(rows,'2026-09').balance,84);const zero=summarize([row('2026-10-01',516)],'2026-10');assert.equal(zero.required,1);assert.equal(zero.passed,false);});
test('负余额需补到严格大于零',()=>assert.equal(summarize([row('2026-10-01',436)],'2026-10').required,81));
test('请假、公休及补卡均免计，旧补卡时长也按零计算',()=>{for(const kind of ['leave','rest','makeup'])assert.equal(delta(row('2026-10-01',null,kind)),0);assert.equal(delta(row('2026-10-01',480,'makeup')),0);assert.equal(delta(row('2026-10-01',720,'makeup')),0);assert.equal(validateRecord(row('2026-10-01',null,'makeup')).minutes,null);});
test('漏卡有时长仍计算；无时长待确认；显式零时长欠516',()=>{assert.equal(delta(row('2026-10-01',500,'missing')),-16);assert.equal(delta(row('2026-10-01',null,'missing')),null);assert.equal(delta(row('2026-10-01',0,'missing')),-516);});
test('未录入日不扣时，待确认时不能宣布达标',()=>{assert.equal(summarize([],'2026-10').balance,0);const summary=summarize([row('2026-10-01',600),row('2026-10-02',null)],'2026-10');assert.equal(summary.balance,84);assert.equal(summary.pending,1);assert.equal(summary.passed,false);});
test('日期校验拒绝溢出、异常输入，支持闰日',()=>{assert.equal(validDate('2026-02-30'),false);assert.equal(validDate('2024-02-29'),true);assert.throws(()=>validateRecord(row('2026-10-01',1500)));assert.throws(()=>validateRecord(row('2026-10-01',-1)));assert.throws(()=>validateRecord(row('2026-10-01',3.5)));});
test('解析日期、OA时长和特殊类型，不从首末卡反推',()=>{const rows=parseOCR('起始日期 2026-10-01 截止日期 2026-10-31\n2026-10-09 星期五 9:10 18:14 8小时4分 考勤正常\n2026-10-10 9:14 20:07 9小时53分 考勤正常\n2026-10-11 无 无 请假\n2026-10-12 无 无 公休日\n2026-10-13 无 补卡\n2026-10-14 无 缺卡');assert.equal(rows.length,6);assert.equal(rows[0].minutes,484);assert.equal(rows[1].minutes,593);assert.equal(rows[2].kind,'leave');assert.equal(rows[3].kind,'rest');assert.equal(rows[4].minutes,null);assert.equal(rows[5].minutes,null);});
test('正常但无时长不得自动免计；OCR重复日期冲突列待确认',()=>{const rows=parseOCR('2026-10-08 无 考勤正常\n2026-10-09 8小时4分\n2026-10-09 9小时4分');assert.equal(rows[0].minutes,null);assert.equal(rows[1].minutes,null);assert.match(rows[1].note,/不同结果/);});
test('中文简写日期及跨年解释',()=>assert.equal(parseOCR('7月13日 8小时00分',2025)[0].date,'2025-07-13'));
test('按OCR词语纵向位置还原表格行',()=>{const word=(text,x,y)=>({text,bbox:{x0:x,y0:y,x1:x+30,y1:y+15}});const blocks=[{paragraphs:[{lines:[{words:[word('2026-10-09',0,0),word('2026-10-10',0,50)]},{words:[word('8小时4分',300,0),word('9小时53分',300,50)]}]}]}];const rows=parseOCR(linesFromBlocks(blocks));assert.equal(rows.length,2);assert.equal(rows[0].minutes,484);assert.equal(rows[1].minutes,593);});
test('时长显示保留符号',()=>{assert.equal(fmt(-80),'−1小时20分');assert.equal(fmt(24,true),'+24分钟');assert.equal(fmt(null),'待确认');});

test('OCR中文分词空格与异常长时长',()=>{const rows=parseOCR('2026-10-09 8 小 时 4 分 考 勤 正 常\n2026-10-10 公 休 日\n2026-10-11 38 小 时 4 分');assert.equal(rows[0].minutes,484);assert.equal(rows[1].kind,'rest');assert.equal(rows[2].minutes,null);});

test('两轮OCR互补但不掩盖两个有效时长冲突',()=>{const rows=parseOCR('2026-10-09 38小时4分\n2026-10-09 8小时4分\n2026-10-10 公休日\n2026-10-10 无 考勤正常');assert.equal(rows[0].minutes,484);assert.equal(rows[1].kind,'rest');const conflict=parseOCR('2026-10-09 8小时4分\n2026-10-09 9小时4分\n2026-10-09 8小时4分');assert.equal(conflict[0].minutes,null);});

test('OCR分钟部分超59不得计算',()=>assert.equal(parseOCR('2026-10-01 8小时99分')[0].minutes,null));

test('已确认请假不会被以后无时长截图覆盖，其他有效变更仍需核对',()=>{const previous=row('2026-10-08',null,'leave');assert.equal(compareRecord(previous,row('2026-10-08',null)).type,'same');assert.equal(compareRecord(previous,row('2026-10-08',500)).type,'changed');assert.match(compareRecord(null,row('2026-10-08',null)).message,/待确认/);});
test('OCR有效结果冲突不能以已有记录为由静默忽略',()=>{const incoming={...row('2026-10-08',null),note:'同一日期识别到不同结果，请核对'};assert.equal(compareRecord(row('2026-10-08',540),incoming).type,'changed');});

test('历史补卡免计，余额只累计有时长的计时记录',()=>{const rows=[row('2026-10-08',480,'makeup'),row('2026-10-09',496),row('2026-10-10',546),row('2026-10-11',null,'leave')];const result=summarize(rows,'2026-10');assert.equal(result.balance,10);assert.equal(result.pending,0);assert.equal(result.passed,true);assert.equal(rows[0].minutes,480);});
