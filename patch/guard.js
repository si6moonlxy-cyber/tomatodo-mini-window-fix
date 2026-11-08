// tomatodo-mini-window-patch · BrowserWindow.setBounds 防御垫
// 注入到 app.asar/main.js 最前面执行。
// 作用：拦截非法（非数值 / NaN / 非整数 / 非正尺寸）的 setBounds 调用，
//      避免 Electron 抛 "Error processing argument at index 0, conversion failure from"
//      导致主进程未捕获异常弹框。正常调用行为不变。
// 注意：'use strict' 必须放在 IIFE 内部，绝不能出现在文件顶层，
//      否则会把整个（混淆过的）main.js 变成严格模式，可能导致应用启动失败。
(function () {
  'use strict';
  if (globalThis.__TOMATO_MIN_SETBOUNDS_GUARD__) return;
  globalThis.__TOMATO_MIN_SETBOUNDS_GUARD__ = true;

  var log = function () {};
  try {
    var fs = require('fs');
    var path = require('path');
    var os = require('os');
    var LOG = path.join(os.tmpdir(), 'tomatodo-mini-window-patch.log');
    log = function (m) {
      try { fs.appendFileSync(LOG, new Date().toISOString() + ' ' + m + '\n'); } catch (e) {}
      try { console.warn('[tomatodo-patch] ' + m); } catch (e) {}
    };
  } catch (e) {}

  try {
    var electron = require('electron');
    var BrowserWindow = electron && electron.BrowserWindow;
    var proto = BrowserWindow && BrowserWindow.prototype;
    if (!proto || typeof proto.setBounds !== 'function') {
      log('BrowserWindow.prototype.setBounds 不存在，跳过');
      return;
    }
    var orig = proto.setBounds;
    var blocked = 0;

    function finite(v) { return typeof v === 'number' && isFinite(v); }

    function setBoundsSafe(bounds, animate) {
      var self = this;
      if (!bounds || typeof bounds !== 'object') {
        blocked++;
        log('拦截非对象参数 #' + blocked + ': ' + String(bounds));
        return undefined;
      }
      var cur = null;
      try { cur = self.getBounds(); } catch (e) {}
      var out = {};
      var keys = ['x', 'y', 'width', 'height'];
      for (var i = 0; i < keys.length; i++) {
        var k = keys[i];
        var v = bounds[k];
        var n = finite(v) ? v : (cur && finite(cur[k]) ? cur[k] : NaN);
        if (!finite(n)) {
          blocked++;
          log('拦截非法 ' + k + ' #' + blocked + ': ' + JSON.stringify(bounds));
          return undefined;
        }
        n = Math.round(n);
        if (k === 'width' || k === 'height') n = Math.max(1, n);
        out[k] = n;
      }
      if (out.width < 1 || out.height < 1) {
        blocked++;
        log('拦截非正尺寸 #' + blocked + ': ' + JSON.stringify(out));
        return undefined;
      }
      try {
        return orig.call(self, out, animate);
      } catch (e) {
        blocked++;
        log('原生调用失败 #' + blocked + ': ' + (e && e.message));
        return undefined;
      }
    }

    setBoundsSafe.__tomatodoPatch = true;
    try {
      Object.defineProperty(proto, 'setBounds', {
        value: setBoundsSafe,
        writable: true,
        configurable: true,
      });
    } catch (e) {
      proto.setBounds = setBoundsSafe;
    }

    // 迷你小窗折叠/展开动画修复：
    // 折叠前 setMaximumSize(168x132) 会把宽度锁死 → 宽度瞬间从 332 跳到 168（闪烁）；
    // 展开前 setMinimumSize(169x132) 又比折叠后的 168 多 1px → 再跳一次。
    // 在 mini 高度下放宽宽度限制，让 setSize 的宽度插值能正常生效。
    try {
      var oMin = proto.setMinimumSize;
      var oMax = proto.setMaximumSize;
      var isMiniH = function (h) { return h === 132 || h === 100; };
      if (typeof oMin === 'function') {
        proto.setMinimumSize = function (w, h) {
          if (isMiniH(h)) { w = 0; h = 0; }
          return oMin.call(this, w, h);
        };
      }
      if (typeof oMax === 'function') {
        proto.setMaximumSize = function (w, h) {
          if (isMiniH(h)) { w = 332; h = 0x7fffffff; }
          return oMax.call(this, w, h);
        };
      }
    } catch (e2) {}

    log('已安装 setBounds 防御垫');
  } catch (e) {
    log('注入失败: ' + (e && e.message));
  }
})();
