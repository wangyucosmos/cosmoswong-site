/* 我的工作台 · 主题（v3）：页面最早加载，先把 data-theme 写到 <html> 上，避免深色系统下先闪一下浅色。
   偏好存 localStorage desk.theme：auto（跟随系统，默认）/ light（浅色 A）/ dark（深色 B）。 */
(() => {
  const mq = window.matchMedia ? matchMedia('(prefers-color-scheme: dark)') : null;
  let mem = null;   // localStorage 写不进去（无痕模式）时，这次打开期间记在内存里
  const get = () => { if (mem) return mem; try { return JSON.parse(localStorage.getItem('desk.theme')) || 'auto'; } catch { return 'auto'; } };
  const apply = () => {
    const pref = get(), dark = pref === 'dark' || (pref === 'auto' && mq && mq.matches);
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    document.documentElement.dataset.themePref = pref;
  };
  apply();
  mq && mq.addEventListener && mq.addEventListener('change', apply);
  window.DESK_THEME = {
    get, apply,
    set(v) { mem = v; try { localStorage.setItem('desk.theme', JSON.stringify(v)); } catch { /* 无痕模式写不进去，只影响这次 */ } apply(); }
  };
})();
