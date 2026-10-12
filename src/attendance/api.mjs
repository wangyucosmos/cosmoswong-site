import {validateRecord} from '../../public/assets/attendance/domain.mjs';
const encoder=new TextEncoder();
const hex=b=>Array.from(new Uint8Array(b),n=>n.toString(16).padStart(2,'0')).join('');
const random=()=>hex(crypto.getRandomValues(new Uint8Array(32)));
const hash=async value=>hex(await crypto.subtle.digest('SHA-256',encoder.encode(value)));
async function passwordHash(password,salt){const key=await crypto.subtle.importKey('raw',encoder.encode(password),'PBKDF2',false,['deriveBits']);return hex(await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt:encoder.encode(salt),iterations:100000},key,256));}
function equal(a,b){if(a.length!==b.length)return false;let diff=0;for(let i=0;i<a.length;i++)diff|=a.charCodeAt(i)^b.charCodeAt(i);return diff===0;}
const json=(body,status=200,headers={})=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',...headers}});
class HttpError extends Error{constructor(status,message){super(message);this.status=status;}}
const fail=(status,message)=>{throw new HttpError(status,message);};
function credentials(body){const username=String(body.username||'').normalize('NFKC').trim().toLowerCase();const password=body.password;
  if(!/^[\p{L}\p{N}_.-]{3,32}$/u.test(username))fail(400,'账号需为3至32位文字、数字、下划线、点或短横线');
  if(typeof password!=='string'||password.length<10||password.length>128)fail(400,'密码需为10至128位');
  return {username,password};
}
async function throttle(db,key,limit,seconds){const now=Math.floor(Date.now()/1000);
  const row=await db.prepare('INSERT INTO throttles(key,count,reset_at) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN reset_at<=? THEN 1 ELSE count+1 END, reset_at=CASE WHEN reset_at<=? THEN excluded.reset_at ELSE reset_at END RETURNING count').bind(key,now+seconds,now,now).first();
  if(row.count>limit)fail(429,'尝试过于频繁，请稍后再试');
}
function cookie(req,token,maxAge=2592000){const url=new URL(req.url);const local=['127.0.0.1','localhost'].includes(url.hostname);return `attendance_session=${token}; Path=/api/attendance; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${local?'':'; Secure'}`;}
async function issue(db,req,user){const token=random(),digest=await hash(token);await db.prepare('INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)').bind(digest,user.id,Date.now()+2592000000).run();return json({user:{id:user.id,username:user.username}},200,{'Set-Cookie':cookie(req,token)});}
async function userFor(db,req){const token=(req.headers.get('Cookie')||'').match(/(?:^|;\s*)attendance_session=([a-f0-9]{64})(?:;|$)/)?.[1];if(!token)return null;return db.prepare('SELECT u.id,u.username,s.token_hash FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?').bind(await hash(token),Date.now()).first();}
export async function api(req,db){try {
  const url=new URL(req.url),path=url.pathname.replace(/^\/api\/attendance/,''); const mutation=!['GET','HEAD'].includes(req.method);
  if(mutation&&(req.headers.get('Origin')!==url.origin||req.headers.get('x-attendance-request')!=='1'))fail(403,'请求来源不正确，请刷新页面');
  let body={};if(mutation){if(!req.headers.get('Content-Type')?.startsWith('application/json'))fail(415,'需要JSON请求');const raw=await req.text();if(raw.length>250000)fail(413,'一次最多导入500条记录');try{body=JSON.parse(raw);}catch{fail(400,'数据格式不正确');}if(!body||typeof body!=='object'||Array.isArray(body))fail(400,'数据格式不正确');}
  const ip=req.headers.get('CF-Connecting-IP')||'local';
  if(path==='/register'&&req.method==='POST'){
    await throttle(db,`register:${ip}`,20,3600);const {username,password}=credentials(body);if(body.confirmPassword!==password)fail(400,'两次密码不一致');
    const user={id:crypto.randomUUID(),username},salt=random(),digest=await passwordHash(password,salt);
    try{await db.prepare('INSERT INTO users(id,username,salt,password_hash,created_at) VALUES(?,?,?,?,?)').bind(user.id,username,salt,digest,new Date().toISOString()).run();}catch(error){if(/UNIQUE|constraint/i.test(error.message))fail(409,'这个账号已被使用，请换一个');throw error;}
    return await issue(db,req,user);
  }
  if(path==='/login'&&req.method==='POST'){
    const {username,password}=credentials(body);await throttle(db,`login-ip:${ip}`,60,900);await throttle(db,`login-user:${username}`,10,900);
    const user=await db.prepare('SELECT * FROM users WHERE username=?').bind(username).first();const salt=user?.salt||'a'.repeat(64);const digest=await passwordHash(password,salt);
    if(!user||!equal(digest,user.password_hash))fail(401,'账号或密码不正确');
    await db.prepare('DELETE FROM throttles WHERE key=?').bind(`login-user:${username}`).run();return await issue(db,req,user);
  }
  const user=await userFor(db,req);
  if(path==='/session'&&req.method==='GET')return json({user:user?{id:user.id,username:user.username}:null});
  if(!user)fail(401,'请先登录');
  if(path==='/logout'&&req.method==='POST'){await db.prepare('DELETE FROM sessions WHERE token_hash=?').bind(user.token_hash).run();return json({ok:true},200,{'Set-Cookie':cookie(req,'',0)});}
  if(path==='/password'&&req.method==='POST'){
    await throttle(db,`password:${user.id}`,10,900);const stored=await db.prepare('SELECT salt,password_hash FROM users WHERE id=?').bind(user.id).first();
    if(typeof body.oldPassword!=='string'||body.oldPassword.length>128||!equal(await passwordHash(body.oldPassword,stored.salt),stored.password_hash))fail(400,'原密码不正确');
    const {password}=credentials({username:user.username,password:body.password});if(body.confirmPassword!==password)fail(400,'两次新密码不一致');const salt=random();
    await db.batch([db.prepare('UPDATE users SET salt=?,password_hash=? WHERE id=?').bind(salt,await passwordHash(password,salt),user.id),db.prepare('DELETE FROM sessions WHERE user_id=?').bind(user.id)]);return await issue(db,req,user);
  }
  if(path==='/records'&&req.method==='GET'){const {results}=await db.prepare('SELECT date,kind,minutes,note,revision FROM records WHERE user_id=? ORDER BY date').bind(user.id).all();return json({records:results});}
  if(path==='/records'&&req.method==='PUT'){
    if(!Array.isArray(body.records)||body.records.length<1||body.records.length>500)fail(400,'每次保存1至500条记录');
    const rows=body.records.map(row=>({...validateRecord(row),expectedRevision:row.expectedRevision??null}));if(new Set(rows.map(r=>r.date)).size!==rows.length)fail(400,'同批记录日期重复，请先核对');
    // Two transactional statements keep large backups below D1's query limit.
    const revision=crypto.randomUUID(),payload=JSON.stringify(rows);
    const commands=[
      db.prepare(`INSERT INTO records(user_id,date,kind,minutes,note,revision)
        SELECT ?, '', NULL, NULL, '', '' WHERE EXISTS (
          SELECT 1 FROM json_each(?) incoming
          LEFT JOIN records previous ON previous.user_id=? AND previous.date=json_extract(incoming.value,'$.date')
          WHERE (json_extract(incoming.value,'$.expectedRevision') IS NULL AND previous.date IS NOT NULL)
             OR (json_extract(incoming.value,'$.expectedRevision') IS NOT NULL AND
                 (previous.date IS NULL OR previous.revision<>json_extract(incoming.value,'$.expectedRevision')))
        )`).bind(user.id,payload,user.id),
      db.prepare(`INSERT INTO records(user_id,date,kind,minutes,note,revision)
        SELECT ?, json_extract(value,'$.date'), json_extract(value,'$.kind'), json_extract(value,'$.minutes'),
               json_extract(value,'$.note'), ? FROM json_each(?) WHERE true
        ON CONFLICT(user_id,date) DO UPDATE SET kind=excluded.kind,minutes=excluded.minutes,note=excluded.note,revision=excluded.revision`).bind(user.id,revision,payload)
    ];
    try{await db.batch(commands);}catch(error){if(/constraint|UNIQUE|NOT NULL/i.test(error.message))fail(409,'记录已被修改，请重新读取后核对，未覆盖已有数据');throw error;}
    return json({ok:true});
  }
  if(/^\/records\/\d{4}-\d{2}-\d{2}$/.test(path)&&req.method==='DELETE'){
    const result=await db.prepare('DELETE FROM records WHERE user_id=? AND date=? AND revision=?').bind(user.id,path.split('/').at(-1),body.revision||'').run();if(!result.meta.changes)fail(409,'记录已变化，请刷新后再删除');return json({ok:true});
  }
  fail(404,'接口不存在');
}catch(error){return json({error:error instanceof HttpError?error.message:error.message==='日期或考勤类型不正确'||/OA时长|备注最多/.test(error.message)?error.message:'服务暂时不可用，请稍后重试'},error instanceof HttpError?error.status:/日期或考勤|OA时长|备注最多/.test(error.message)?400:500);}}
