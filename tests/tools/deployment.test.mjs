import {test} from 'node:test';import assert from 'node:assert/strict';
import {CHECKS,assertRuntime,assertResponse,verifyLocal} from '../../tools/verify_tools_routing.mjs';
test('发布前要求Worker优先，线上静态优先配置必须验收失败',()=>{
 verifyLocal();assertRuntime({resources:{script_runtime:{assets:{raw_run_worker_first:true}}}});
 for(const assets of [{raw_run_worker_first:false},{}])assert.throws(()=>assertRuntime({resources:{script_runtime:{assets}}}));
});
test('普通curl的302不能掩盖浏览器导航404；保护页200也必须失败',()=>{
 const gate=CHECKS.find(c=>c.path==='/go/attendance');assertResponse(gate,302,'/unlock?next=attendance');assert.throws(()=>assertResponse(gate,404,null));
 const resume=CHECKS.find(c=>c.path==='/resume');assert.throws(()=>assertResponse(resume,200,null));assert.throws(()=>assertResponse(resume,302,'//evil.example/unlock?next=/resume'));
});
test('导航验收覆盖所有工具入口、私有页面以及补时直链',()=>{
 for(const path of ['/go/mail-insight','/go/attendance','/go/travel','/resume.pdf','/knowledge/','/mail-insight','/marquee'])assert.ok(CHECKS.some(c=>c.path===path&&c.status===302));
 assert.ok(CHECKS.some(c=>c.path==='/attendance'&&c.status===200));
});

test('自动发布也必须固定受支持CLI并验收远端，不得绕开本机发布保护',async()=>{
 const {readFile}=await import('node:fs/promises');const workflow=await readFile(new URL('../../.github/workflows/deploy.yml',import.meta.url),'utf8');
 assert.match(workflow,/wranglerVersion:\s*'4\.131\.0'/);assert.match(workflow,/node-version:\s*22/);assert.match(workflow,/command: deploy --config wrangler\.toml/);assert.match(workflow,/verify_tools_routing\.mjs --online/);assert.match(workflow,/node --test tests\/tools\/\*\.test\.mjs tests\/attendance\/\*\.test\.mjs/);
});

// A CI rebuild must retain the deployed cache key for the shared font stylesheet.
test('subpage font CSS retains the main stylesheet cache version', async () => {
 const {readFile}=await import('node:fs/promises');
 for(const file of ['tools.html','portfolio.html','resume.html','knowledge/index.html']){
  const html=await readFile(new URL('../../public/'+file,import.meta.url),'utf8');
  const style=html.match(/href="\/assets\/style\.css(\?v=\d+)"/);
  const fonts=html.match(/href="\/assets\/home\/fonts\.css(\?v=\d+)"/);
  assert.ok(style,file+' is missing its stylesheet cache version');
  assert.ok(fonts,file+' is missing its font stylesheet cache version');
  assert.equal(fonts[1],style[1],file);
 }
});
