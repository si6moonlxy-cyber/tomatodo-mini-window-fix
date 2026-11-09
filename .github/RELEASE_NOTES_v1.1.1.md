# v1.1.1 — 全屏视频下置顶失效修复

非官方补丁 · 只改本机 `app.asar` · 含备份与一键回滚

## 🔧 修复

在浏览器/播放器「窗口化全屏」播放视频时，点击番茄ToDo 悬浮窗后，悬浮窗会被全屏窗口盖住（沉底），不再保持置顶。

**根因**：Windows 的 z-order 行为——全屏窗口获得前台后，普通 `HWND_TOPMOST` 窗口可能被盖住；应用自身没有取消置顶（日志确认点击时没有 `setAlwaysOnTop(false)`）。

**修复**：包装 `BrowserWindow.prototype.setAlwaysOnTop`，窗口置顶开启期间每 500ms 重新置顶一次（`screen-saver` 级别）。点击被盖住后最多 0.5 秒自动弹回最前。

## 🛡️ 补丁做了什么

- 新增 `patch/top-keeper.js`：置顶保持（定时刷新 `setAlwaysOnTop(true)`）；
- 不改动应用原有置顶开关逻辑，关闭置顶时定时器自动停止。

## 📦 安装 / 升级

```powershell
git clone https://github.com/si6moonlxy-cyber/tomatodo-mini-window-fix
cd tomatodo-mini-window-fix
npm install

# 先完全退出 番茄ToDo
node patch.cjs --asar "D:\app\TomaToDo\resources\app.asar"
```

从 v1.1.0 升级：直接重新运行上面的命令即可。

## ✅ 验证

1. 开启「窗口置顶」；
2. 浏览器/播放器切窗口化全屏播放视频；
3. 点击番茄ToDo 悬浮窗——它应在约 0.5 秒内回到最前，而不是沉底。

## ↩️ 回滚

```powershell
node patch.cjs --restore
```

## ⚠️ 已知限制

- 仅对「窗口化全屏」有效；播放器的**独占全屏（exclusive fullscreen）**会盖住所有 topmost 窗口，属系统限制，无法修复；
- 每 500ms 刷新一次置顶，极少数情况下可能有轻微焦点跳动；
- 应用升级会覆盖 `app.asar`，需重新运行补丁。

---

## English

**v1.1.1 — keep the mini window on top while watching a windowed-fullscreen video.**

Clicking the mini window while a browser/player plays a windowed-fullscreen video used to send it behind the video. Root cause: Windows z-order — a fullscreen foreground window can cover a regular `HWND_TOPMOST` window, and the app does not cancel always-on-top itself (verified: no `setAlwaysOnTop(false)` on click).

This patch wraps `BrowserWindow.prototype.setAlwaysOnTop` and re-applies the topmost flag every 500 ms while always-on-top is enabled, so the window pops back within ~0.5 s.

Limitations: only works for borderless/windowed fullscreen; exclusive fullscreen covers all topmost windows by design.

Tested on 番茄ToDo 1.7.6, Windows 10/11. Not affiliated with the official product; no official files are redistributed.
