// Deployment acceptance must exercise browser navigation, not only plain curl.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {dirname,resolve} from 'node:path';
import {setTimeout as wait} from 'node:timers/promises';

const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'..');
export const CHECKS=[
 ...['attendance','mail-insight','travel','cosmos-os','h5-editor','marquee','fitness','english'].map(id=>({path:'/go/'+id,status:302,next:id})),
 ...['/resume','/resume.html','/resume.pdf','/knowledge/','/knowledge/overview'].map(path=>({path,status:302,next:path})),
 {path:'/mail-insight',status:302,next:'mail-insight'},
 {path:'/marquee',status:302,next:'marquee'},
 {path:'/english',status:302,next:'english'},
 ...['/attendance','/','/portfolio','/unlock'].map(path=>({path,status:200})),
 {path:'/assets/mail-insight/app.mjs',status:401}
];
export function assertRuntime(version){
 assert.equal(version?.resources?.script_runtime?.assets?.raw_run_worker_first,true,'线上必须启用run_worker_first；否则浏览器导航可能404或绕过口令门');
}
export function assertResponse(check,status,location){
 assert.equal(status,check.status,`${check.path}浏览器导航状态不正确`);
 if(check.next){const target=new URL(location,'https://cosmoswong.com');assert.equal(target.origin,'https://cosmoswong.com');assert.equal(target.pathname,'/unlock');assert.equal(target.searchParams.get('next'),check.next);}
}
function cliJSON(args){
 const output=execFileSync('npx',['--yes','wrangler@4.131.0',...args,'--json'],{cwd:ROOT,encoding:'utf8',stdio:['ignore','pipe','pipe']});
 const start=output.search(/(?:^|\n)\s*[\[{]/);assert.ok(start>=0,'没有收到Wrangler JSON');return JSON.parse(output.slice(start).trim());
}
export function verifyLocal(){
 const config=readFileSync(resolve(ROOT,'wrangler.toml'),'utf8');const assets=config.match(/\[assets\]([\s\S]*?)(?=\n\[|$)/)?.[1]||'';
 assert.match(assets,/^run_worker_first\s*=\s*true\s*(?:#.*)?$/m,'部署配置必须在assets段启用run_worker_first');
}
export async function verifyOnline(){
 const deployments=cliJSON(['deployments','list']);const latest=deployments.reduce((a,b)=>a.created_on>b.created_on?a:b);
 for(const active of latest.versions.filter(v=>v.percentage>0)){
  const version=cliJSON(['versions','view',active.version_id]);assertRuntime(version);console.log(`线上版本 ${version.id}：run_worker_first=true`);
 }
 for(const check of CHECKS){
  for(let attempt=0;attempt<3;attempt++){
  const output=execFileSync('curl',['-sS','--max-time','30','-D','-','-o','/dev/null','-H','Sec-Fetch-Mode: navigate','-H','Sec-Fetch-Dest: document','-H','Accept: text/html','https://cosmoswong.com'+check.path],{cwd:ROOT,encoding:'utf8',stdio:['ignore','pipe','pipe']});
  const blocks=output.replace(/\r\n/g,'\n').split('\n\n').filter(b=>b.startsWith('HTTP/'));const lines=blocks.at(-1).split('\n'),status=Number(lines[0].split(/\s+/)[1]);const location=lines.find(l=>/^location:/i.test(l))?.slice(9).trim();try{assertResponse(check,status,location);}catch(error){if(attempt===2)throw error;await wait(2000);continue;}console.log(`${check.path}：${status}${location?' '+location:''}`);break;
  }
 }
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 verifyLocal();if(process.argv.includes('--online'))await verifyOnline();else console.log('本地Worker优先配置通过');
}
