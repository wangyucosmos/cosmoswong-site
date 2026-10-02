// 给 /kol 的【本地】开发库灌演示数据（30 个虚构 KOL + 子任务 + 沟通记录 + 带货记录），只用于本地测试。
// 名字、邮箱、链接全部是编的（example.com / 虚构账号），不是任何真实 KOL。
// 用法：node tools/kol_seed_local.mjs        —— 会先清空本地库里的 KOL 业务数据，再写入演示数据
// ⚠️ 只写 --local，脚本里没有、也不要加 --remote：线上库只跑迁移，不灌演示数据。
import { writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pad = n => String(n).padStart(2, '0');
const day = n => { const d = new Date(); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const month = n => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() + n); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; };
const q = v => v == null ? 'NULL' : typeof v === 'number' ? String(v) : `'${String(v).replace(/'/g, "''")}'`;
const now = new Date().toISOString();

// [名称, 平台, 账号, 国家, 语言, 品类, 粉丝, 状态, 优先级, 上次联系(天), 下次跟进(天), 报价, 邮箱?]
const K = [
  ['SimRig Lukas', 'YouTube', '@simriglukas-demo', 'DE', 'de', ['赛车模拟'], 184000, 'talking', 'high', -2, -1, 450, true],
  ['Cockpit Clara', 'YouTube', '@cockpitclara-demo', 'DE', 'de', ['飞行模拟'], 62000, 'contacted', 'high', -9, -4, null, true],
  ['VR Pilot Max', 'TikTok', '@vrpilotmax.demo', 'AT', 'de', ['飞行模拟', 'VR 游戏'], 336000, 'contacted', 'mid', -6, 0, null, false],
  ['Brit Sim Racer', 'YouTube', '@britsimracer-demo', 'GB', 'en', ['赛车模拟'], 912000, 'sampled', 'high', -12, 2, 1200, true],
  ['Headset Hannah', 'Instagram', '@headset.hannah.demo', 'GB', 'en', ['数码', '科技测评'], 48000, 'todo', 'mid', null, 0, null, true],
  ['Le Cockpit Virtuel', 'YouTube', '@lecockpitvirtuel-demo', 'FR', 'fr', ['飞行模拟'], 127000, 'contacted', 'mid', -15, -8, null, true],
  ['Jeux VR Julien', 'TikTok', '@jeuxvrjulien.demo', 'FR', 'fr', ['VR 游戏'], 521000, 'published', 'high', -20, 5, 800, true],
  ['Simulatore Marco', 'YouTube', '@simulatoremarco-demo', 'IT', 'it', ['赛车模拟', '模拟器'], 73000, 'todo', 'low', null, 1, null, false],
  ['Gafas VR Lucía', 'Instagram', '@gafasvrlucia.demo', 'ES', 'es', ['数码'], 26000, 'paused', 'low', -40, null, null, true],
  ['Dutch Flight Deck', 'Twitch', 'dutchflightdeck_demo', 'NL', 'nl', ['飞行模拟'], 15400, 'contacted', 'mid', -3, 2, null, false],
  ['Polski Symulator', 'YouTube', '@polskisymulator-demo', 'PL', 'pl', ['模拟器'], 98000, 'talking', 'mid', -1, 2, 300, true],
  ['Nordic VR Nils', 'YouTube', '@nordicvrnils-demo', 'SE', 'sv', ['VR 游戏'], 41000, 'won', 'mid', -5, 25, 500, true],
  ['Track Day Tom', 'X', '@trackdaytom_demo', 'GB', 'en', ['赛车模拟'], 22100, 'contacted', 'low', -11, -3, null, false],
  ['Reddit SimLab', 'Reddit', 'u/simlab_demo', 'IE', 'en', ['模拟器'], 8800, 'todo', 'low', null, -2, null, false],
  ['Discord Wings Club', 'Discord', 'wingsclub-demo', 'BE', 'fr', ['飞行模拟'], 5600, 'todo', 'mid', null, 0, null, false],
  ['Telegram VR Deals', 'Telegram', '@vrdeals_demo', 'PT', 'pt', ['数码'], 31000, 'paused', 'low', -60, null, null, false],
  ['Gadget Greta', 'TikTok', '@gadgetgreta.demo', 'CH', 'de', ['数码', '科技测评'], 1280000, 'talking', 'high', -4, -1, 2500, true],
  ['Rennsim Ralf', 'YouTube', '@rennsimralf-demo', 'DE', 'de', ['赛车模拟'], 254000, 'sampled', 'high', -8, -2, 900, true],
  ['Flugsim Frieda', 'YouTube', '@flugsimfrieda-demo', 'DE', 'de', ['飞行模拟'], 9100, 'todo', 'mid', null, 3, null, true],
  ['Tech Teo', 'Instagram', '@techteo.demo', 'IT', 'it', ['科技测评'], 143000, 'contacted', 'mid', -14, -6, null, true],
  ['Mundo Simracing', 'YouTube', '@mundosimracing-demo', 'ES', 'es', ['赛车模拟'], 67000, 'published', 'mid', -18, 10, 400, true],
  ['VR Kraków', 'TikTok', '@vrkrakow.demo', 'PL', 'pl', ['VR 游戏'], 212000, 'won', 'high', -3, 27, 700, true],
  ['Cabine Pilote', 'Twitch', 'cabinepilote_demo', 'FR', 'fr', ['飞行模拟'], 19800, 'todo', 'low', null, 6, null, false],
  ['Wiener Simmer', 'YouTube', '@wienersimmer-demo', 'AT', 'de', ['模拟器'], 35500, 'contacted', 'low', -5, 0, null, true],
  ['Holland Gaming VR', 'YouTube', '@hollandgamingvr-demo', 'NL', 'nl', ['VR 游戏'], 410000, 'talking', 'high', -6, -5, 1500, true],
  ['Copenhagen Cockpit', 'Instagram', '@cphcockpit.demo', 'DK', 'da', ['飞行模拟'], 12000, 'todo', 'mid', null, null, null, false],
  ['Suomi Sim', 'YouTube', '@suomisim-demo', 'FI', 'fi', ['赛车模拟'], 27000, 'contacted', 'low', -9, 1, null, true],
  ['Praha VR', 'TikTok', '@prahavr.demo', 'CZ', 'cs', ['VR 游戏'], 58000, 'todo', 'mid', null, -1, null, false],
  ['US Sim Guy', 'YouTube', '@ussimguy-demo', 'US', 'en', ['飞行模拟', '赛车模拟'], 2300000, 'paused', 'low', -90, null, 5000, true],
  ['Lisboa Tech', 'X', '@lisboatech_demo', 'PT', 'pt', ['科技测评'], 17000, 'sampled', 'mid', -10, 4, 250, true]
];
const PROFILE = { YouTube: h => `https://www.youtube.com/${h}`, TikTok: h => `https://www.tiktok.com/${h}`, Instagram: h => `https://www.instagram.com/${h.slice(1)}`,
  X: h => `https://x.com/${h.slice(1)}`, Twitch: h => `https://www.twitch.tv/${h}`, Reddit: h => `https://www.reddit.com/user/${h.slice(2)}`,
  Discord: h => `https://discord.gg/${h}`, Telegram: h => `https://t.me/${h.slice(1)}` };

const sql = ['DELETE FROM activities;', 'DELETE FROM kol_tasks;', 'DELETE FROM deals;', 'DELETE FROM kols;', "DELETE FROM sqlite_sequence WHERE name IN ('kols','activities','kol_tasks','deals');"];
K.forEach(([name, platform, handle, country, language, cat, followers, status, priority, last, next, quote, hasEmail], i) => {
  const id = i + 1;
  const url = PROFILE[platform](handle);
  const email = hasEmail ? `${name.toLowerCase().replace(/[^a-z]+/g, '.')}@example.com` : null;
  const urlKey = (() => { const u = new URL(url); return (u.hostname.replace(/^(www\.|m\.)/, '') + u.pathname.replace(/\/+$/, '')).toLowerCase(); })();
  const handleKey = `${platform.toLowerCase()}|${handle.replace(/^@/, '').toLowerCase()}`;
  const cols = {
    id, name, handle, platform, profile_url: url, followers, avg_views: Math.round(followers * (0.15 + (i % 5) / 20)), engagement_rate: 2 + (i % 7),
    country, language, category: JSON.stringify(cat), email, status, priority, rating: ['A', 'B', 'C'][i % 3],
    last_contact_at: last == null ? null : day(last), first_contact_at: last == null ? null : day(last - 7), next_followup_at: next == null ? null : day(next),
    quote, coop_type: quote ? ['寄样测评', '付费推广', '纯分成', '混合'][i % 4] : null, source: ['自己找的', 'CRM 公海', '推荐', '对方主动'][i % 4],
    touches: status === 'todo' || last == null ? 0 : 1 + (i % 3 === 0 ? 1 : 0) + (i % 5 === 0 ? 1 : 0),
    crm_synced: i % 3 === 0 ? 1 : 0, tags: i % 4 === 0 ? JSON.stringify(['演示']) : null, notes: '演示数据（虚构）',
    url_key: urlKey, email_key: email, handle_key: handleKey, created_at: now, updated_at: now
  };
  sql.push(`INSERT INTO kols (${Object.keys(cols).join(',')}) VALUES (${Object.values(cols).map(q).join(',')});`);
  if (last != null) {
    sql.push(`INSERT INTO activities (kol_id,type,summary,content,happened_at,created_at) VALUES (${id},'email_out','发了开发信','Hi ${name.replace(/'/g, "''")}, ...',${q(day(last - 7))},${q(now)});`);
    sql.push(`INSERT INTO activities (kol_id,type,summary,happened_at,created_at) VALUES (${id},'${i % 2 ? 'dm' : 'email_out'}','跟进了一次',${q(day(last))},${q(now)});`);
    if (['talking', 'sampled', 'published', 'won'].includes(status)) sql.push(`INSERT INTO activities (kol_id,type,summary,content,happened_at,created_at) VALUES (${id},'reply_in','对方回复了，有兴趣','Thanks, sounds interesting!',${q(day(last + 1 > 0 ? last : last + 1))},${q(now)});`);
  }
  if (i % 6 === 3) sql.push(`INSERT INTO kol_tasks (kol_id,title,due_at,done,created_at) VALUES (${id},'准备变更邮件',${q(day(2))},0,${q(now)}),(${id},'确认寄样地址',${q(day(-1))},1,${q(now)});`);
});
// 带货记录：几个已发布 / 已成交的 KOL，跨近几个月
const deals = [[7, 0, 18, 2340.5, 15], [7, -1, 9, 1170, 15], [12, 0, 6, 900, 12], [12, -2, 11, 1650, 12], [21, -1, 4, 520, 10], [22, 0, 25, 3750, 15], [22, -3, 14, 2100, 15], [17, -4, 3, 450, 20]];
deals.forEach(([kid, m, orders, gmv, rate], i) => {
  const manual = i === 4 ? 1 : 0;
  const com = manual ? 60 : Math.round(gmv * rate) / 100;
  sql.push(`INSERT INTO deals (kol_id,platform,content_url,product_link,published_at,views,orders,gmv_eur,commission_rate,commission_eur,commission_manual,settle_status,period,created_at,updated_at) VALUES (${kid},${q(K[kid - 1][1])},${q(`https://example.com/video/demo-${i}`)},'https://example.com/shop/demo',${q(`${month(m)}-08`)},${10000 + i * 3000},${orders},${gmv},${rate},${com},${manual},${q(i % 3 === 0 ? 'settled' : 'unsettled')},${q(month(m))},${q(now)},${q(now)});`);
});

const dir = join(ROOT, '.wrangler', 'tmp'); mkdirSync(dir, { recursive: true });
const file = join(dir, 'kol-seed.sql');
writeFileSync(file, sql.join('\n') + '\n');
execFileSync('npx', ['wrangler@4', 'd1', 'execute', 'cosmoswong-kol', '--local', '--file', file], { cwd: ROOT, stdio: 'inherit' });
console.log(`本地库已写入 ${K.length} 个演示 KOL、${deals.length} 条带货记录`);
