import {test} from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import vm from 'node:vm';
import {safeNext,nextLocation,TOOL_IDS} from '../../public/assets/tools-next.mjs';import {TARGETS,toolsGate} from '../../src/tools-gate.js';
const kv={get:async()=>null,put:async()=>{},delete:async()=>{}};
const login=next=>toolsGate(new Request('https://cosmoswong.com/api/tools/login',{method:'POST',headers:{Origin:'https://cosmoswong.com','x-tools-request':'1','Content-Type':'application/json'},body:JSON.stringify({password:'test-pass',next})}),{TOOLS_PASSWORD:'test-pass',RESUME_PASSWORD:'test-pass',TOOLS_COOKIE_KEY:'test-key',SUBS:kv},'/api/tools/login');
test('前后端next只认同一工具ID和本站保护路径',async()=>{
 assert.deepEqual(TOOL_IDS.sort(),Object.keys(TARGETS).sort());
 for(const value of ['resume','unknown','https://evil.com','//evil.com','javascript:alert(1)','/resume/../portfolio','/knowledge/../../evil','/knowledge/%2e%2e/evil','/knowledge/\\evil','/knowledge/a\n','/resume-evil','/portfolio','/assets/data.js','/knowledge/%252e%252e']){assert.equal(safeNext(value),null,value);assert.equal((await login(value)).status,400,value);}
 for(const value of ['fitness','travel','/resume.pdf','/knowledge/','/knowledge/overview.html','/knowledge/overview?view=full#section']){assert.equal(safeNext(value),value);const r=await login(value);assert.equal(r.status,200);assert.equal((await r.json()).redirect,nextLocation(value));}
});
test('公开数据不包含简历正文，构建成品完整并禁止收录',async()=>{
 const source=await readFile(new URL('../../public/assets/data.js',import.meta.url),'utf8'),window={};vm.runInNewContext(source,{window});const privateResume=JSON.parse(await readFile(new URL('../../data/resume.json',import.meta.url),'utf8'));
 assert.deepEqual(Object.keys(window.SITE.resume),['pdf']);assert.equal(source.includes(privateResume.summary),false);assert.equal('fullName' in window.SITE.me,false);
 const resume=await readFile(new URL('../../public/resume.html',import.meta.url),'utf8');assert.ok(resume.includes(privateResume.summary));assert.match(resume,/name="robots" content="noindex, nofollow"/);assert.match(resume,/data-prerendered="1"/);
 const sitemap=await readFile(new URL('../../public/sitemap.xml',import.meta.url),'utf8');assert.doesNotMatch(sitemap,/<loc>[^<]*(?:\/resume|\/knowledge)/);
 const headers=await readFile(new URL('../../public/_headers',import.meta.url),'utf8'),robots=await readFile(new URL('../../public/robots.txt',import.meta.url),'utf8');for(const prefix of ['resume','knowledge']){assert.ok(headers.includes('/'+prefix+'*'));assert.ok(robots.includes('Disallow: /'+prefix));}
 for(const file of ['public/index.html','public/portfolio.html','public/workbench.html']){const html=await readFile(new URL('../../'+file,import.meta.url),'utf8');assert.ok(!html.includes(privateResume.summary));assert.ok(!html.includes('href="https://jianshen.cosmoswong.com'));}
});
