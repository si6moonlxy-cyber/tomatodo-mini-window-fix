'use strict';
// tomatodo-mini-window-patch · Windows tray icon refresh fix
// 切换「托盘图标」设置后强制重绘托盘：
// updateWindowsTrayIcon 内部有 `if (currentTrayState.mode === mode) return;` 缓存短路，
// 从「显示计时分钟数」切到「仅显示图标」时 mode 未变，导致图标不刷新、设置看起来不生效。
(function () {
  try {
    var electron = require('electron');
    var ipcMain = electron && electron.ipcMain;
    if (!ipcMain) return;
    var origHandle = ipcMain.handle.bind(ipcMain);
    ipcMain.handle = function (channel, listener) {
      return origHandle(channel, async function () {
        var r = await listener.apply(this, arguments);
        if (channel === 'settings:setWindowsTrayIconMode') {
          try {
            if (typeof currentTrayState !== 'undefined' && currentTrayState) {
              currentTrayState.mode = '';
              currentTrayState.titleText = '';
              currentTrayState.iconMode = '';
            }
            if (typeof updateWindowsTrayIcon === 'function') {
              updateWindowsTrayIcon('idle');
            }
            try {
              require('fs').appendFileSync(require('os').tmpdir() + '/tomatodo-tray-diag.log', new Date().toISOString() + ' forced tray refresh after setWindowsTrayIconMode\n');
            } catch (e2) {}
          } catch (e) {}
        }
        return r;
      });
    };
  } catch (e) {}
})();
