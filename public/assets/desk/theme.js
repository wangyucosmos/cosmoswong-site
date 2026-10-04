/* 我的工作台 · 主题（v3）与风格（v5）：页面最早加载，先把 data-theme / data-skin 写到 <html> 上，避免先闪一下别的样子。
   深浅色存 localStorage desk.theme：auto（跟随系统，默认）/ light / dark。
   风格存 localStorage desk.skin：classic（经典，v3 的样稿 A / B）/ precise（精密，样稿 D）/ glass（玻璃，样稿 E）。
   都只记在这台设备的浏览器里。演示页（<html data-demo="1">，/desk-demo）用 deskdemo.* 另存一份，默认玻璃风格，不影响真实工作台。 */
(() => {
  const mq = window.matchMedia ? matchMedia('(prefers-color-scheme: dark)') : null;
  const SKINS = ['classic', 'precise', 'glass'];
  const DEMO = document.documentElement.dataset.demo === '1', PFX = DEMO ? 'deskdemo.' : 'desk.';
  const mem = {};   // localStorage 写不进去（无痕模式）时，这次打开期间记在内存里
  const read = (k, def) => { if (mem[k]) return mem[k]; try { return JSON.parse(localStorage.getItem(PFX + k)) || def; } catch { return def; } };
  const write = (k, v) => { mem[k] = v; try { localStorage.setItem(PFX + k, JSON.stringify(v)); } catch { /* 无痕模式写不进去，只影响这次 */ } };
  const get = () => read('theme', 'auto');
  const getSkin = () => { const s = read('skin', DEMO ? 'glass' : 'classic'); return SKINS.includes(s) ? s : 'classic'; };
  const apply = () => {
    const pref = get(), dark = pref === 'dark' || (pref === 'auto' && mq && mq.matches);
    const el = document.documentElement;
    el.dataset.theme = dark ? 'dark' : 'light';
    el.dataset.themePref = pref;
    el.dataset.skin = getSkin();
  };
  apply();
  mq && mq.addEventListener && mq.addEventListener('change', apply);
  window.DESK_THEME = {
    get, getSkin, apply, SKINS,
    set(v) { write('theme', v); apply(); },
    setSkin(v) { if (SKINS.includes(v)) { write('skin', v); apply(); } }
  };
})();
