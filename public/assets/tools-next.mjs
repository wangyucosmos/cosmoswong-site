// Client and Worker share the exact return-target whitelist.
export const TOOL_IDS = ['attendance', 'cosmos-os', 'travel', 'h5-editor', 'marquee', 'fitness', 'mail-insight', 'english', 'toolmap'];
// 简历单独一把锁（RESUME_PASSWORD），工具箱口令打不开简历
export const resumePath = path => /^\/resume(?:\.html|\.pdf)?\/?$/.test(path);
export function protectedPath(path) {
  return resumePath(path) || path === '/knowledge' || path.startsWith('/knowledge/');
}
export function safeNext(value) {
  if (typeof value !== 'string' || value.length > 2048) return null;
  if (TOOL_IDS.includes(value)) return value;
  if (!value.startsWith('/') || value.startsWith('//') || /[\\\u0000-\u0020\u007f]/.test(value)) return null;
  const rawPath = value.split(/[?#]/)[0];
  if (!/^\/resume(?:\.html|\.pdf)?\/?$/.test(rawPath) && !/^\/knowledge(?:\/(?:[a-zA-Z0-9_-]+\/)*[a-zA-Z0-9_-]+(?:\.html)?\/?)?\/?$/.test(rawPath)) return null;
  const url = new URL(value, 'https://cosmoswong.com');
  if (url.origin !== 'https://cosmoswong.com' || !protectedPath(url.pathname)) return null;
  return url.pathname + url.search + url.hash;
}
export function nextLocation(value) {
  if (!value) return '/tools';
  const next = safeNext(value);
  return next === null ? null : next.startsWith('/') ? next : '/go/' + next;
}


// 登录返回值仍先经过原白名单；仅保留工具地图已知的版本片段。
export function toolmapReturn(destination, hash) {
  return ['/go/toolmap', '/toolmap'].includes(destination) && /^#(?:claude|codex)$/.test(hash)
    ? '/toolmap' + hash : destination;
}
