// 工具地图的主题偏好（auto / light / dark），在 <head> 里最先执行，避免深色闪白
(function () {
  try {
    var t = localStorage.getItem('toolmap.theme');
    if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t);
  } catch (e) { /* 无痕模式等读不到时跟随系统 */ }
})();
