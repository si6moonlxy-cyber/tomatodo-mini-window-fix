'use strict';
// tomatodo-mini-window-patch · always-on-top keeper
// 窗口化全屏下点击悬浮窗会被全屏窗口盖住（Windows z-order）：
// 保持 topmost，每 500ms 重新置顶一次。
(function () {
  'use strict';
  var electron = require('electron');
  var BrowserWindow = electron && electron.BrowserWindow;
  var proto = BrowserWindow && BrowserWindow.prototype;
  if (!proto || typeof proto.setAlwaysOnTop !== 'function') return;
  var orig = proto.setAlwaysOnTop;
  if (orig.__tomatodoKeeper) return;

  function stop(win) {
    if (win.__tomatodoKeepTimer) {
      clearInterval(win.__tomatodoKeepTimer);
      win.__tomatodoKeepTimer = null;
    }
  }

  function keep(win) {
    if (win.__tomatodoKeepTimer) return;
    win.__tomatodoKeepTimer = setInterval(function () {
      try {
        if (win.isDestroyed && win.isDestroyed()) { stop(win); return; }
        orig.call(win, true, 'screen-saver', 0);
      } catch (e) {}
    }, 500);
  }

  var setTop = function (flag, level, rel) {
    if (flag) keep(this); else stop(this);
    return orig.call(this, flag, flag ? 'screen-saver' : level, rel);
  };
  setTop.__tomatodoKeeper = true;
  proto.setAlwaysOnTop = setTop;
})();
