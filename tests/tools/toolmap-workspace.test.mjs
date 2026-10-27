import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { validate } from '../../tools/toolmap_upload.mjs';
import { safeNext, toolmapReturn } from '../../public/assets/tools-next.mjs';

const required='tool-picker map-nodes map-edges map-context layer-labels map-caption map-tip mobile-map inspector view-map view-progress view-routing tab-map tab-progress tab-routing board board-status board-summary filters search scenario-menu scenario-result commands-grid audit-dialog audit-tabs audit-title audit-body close-audit toast'.split(' ');
function sample(){
 const resources=Object.fromEntries('you local cloud global project native knowledge github'.split(' ').map(id=>[id,{title:'示例资源'}]));
 const ids=Object.keys(resources),toolIds=['a','b','c','d','e'];
 return {title:'示例地图',layout:'workspace-v2',workspace:{snapshot:'2000-01-01',template:required.map(id=>({tag:'div',attrs:{id},children:[]})),data:{tools:toolIds.map(()=>({name:'示例工具'})),workspaces:[],scenarios:[],commands:[],topics:[{date:null}],issues:[],repos:[]},view:{nodes:[...ids.map(id=>({id,x:1,y:1,w:2,h:2})),...toolIds.map((id,tool)=>({id,tool,x:1,y:1,w:2,h:2}))],toolIds,tokens:toolIds,toolRead:toolIds,toolWrite:toolIds,layers:[['示例层',0]],resources},sourcesHTML:'示例来源'}};
}
test('工作区载荷允许无进度日期，不伪造更新时间',()=>{assert.deepEqual(validate(sample()),[])});
test('节点重复、错误尺寸和错误工具引用阻止上传',()=>{const s=sample();s.workspace.view.nodes[0].w=0;s.workspace.view.nodes[1].id='you';s.workspace.view.nodes.at(-1).tool=99;assert.ok(validate(s).length>=3)});
test('缺少模板节点、内联脚本或事件阻止上传',()=>{const s=sample();s.workspace.template.pop();s.workspace.template.push({tag:'script',attrs:{onclick:'bad'},children:[]});assert.ok(validate(s).length>=3)});
test('损坏数据给出校验错误而不抛异常',()=>{const s=sample();s.workspace.view.nodes={bad:true};assert.ok(validate(s).length);s.workspace.data.topics=[{date:'invalid'}];assert.ok(validate(s).length)});
test('登录后仅保留工具地图的已知版本片段，不扩大next白名单',()=>{for(const h of ['#codex','#claude'])assert.equal(toolmapReturn('/go/toolmap',h),'/toolmap'+h);for(const h of ['#evil','//evil.test','#codex/../bad'])assert.equal(toolmapReturn('/go/toolmap',h),'/go/toolmap');assert.equal(toolmapReturn('/tools','#codex'),'/tools');assert.equal(safeNext('/toolmap#codex'),null)});
test('工作区模块使用安全DOM构造且共用版本隔离',async()=>{const src=await readFile(new URL('../../public/assets/toolmap/codex.js',import.meta.url),'utf8');assert.doesNotMatch(src,/innerHTML|eval\s*\(/);assert.match(src,/createTextNode/);const app=await readFile(new URL('../../public/assets/toolmap/app.js',import.meta.url),'utf8');assert.match(app,/v === 'codex' && d.layout === 'workspace-v2'/);assert.match(app,/workspaceCleanup\(\)/)});
