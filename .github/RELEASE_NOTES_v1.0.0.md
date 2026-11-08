# v1.0.0 — 番茄ToDo 迷你小窗拖动崩溃修复

非官方补丁 · 只改本机 `app.asar` · 含备份与一键回滚

## 🔧 修复

拖动「迷你小窗」时，主进程弹框并崩溃：

```
TypeError: Error processing argument at index 0, conversion failure from
    at BrowserWindow.setBounds (node:electron/js2c/browser_init:2:8972)
```

**根因**：小窗展开/收起动画每 16ms 调一次 `BrowserWindow.setBounds`，与用户拖动抢同一个窗口；拖动起始的那一帧动画仍会调用 `setBounds`，Electron 在窗口正被拖动时拒绝执行并抛错，主进程未捕获 → 崩溃弹框。

## 🛡️ 补丁做了什么

- 在 `app.asar/main.js` 头部注入 `setBounds` 防御垫：
  - 非法参数归一化（NaN/undefined 回退当前 bounds、小数取整、宽高 ≤ 0 修正为 1）
  - 原生调用的异常 `try/catch` 吞掉并写日志
- 正常调用行为不变；拦截记录写入 `%TEMP%\tomatodo-mini-window-patch.log`
- 替换前自动备份 `app.asar.bak-<时间戳>`，提供 `--dry-run`（预览）与 `--restore`（回滚）

## 📦 安装

```powershell
git clone https://github.com/si6moonlxy-cyber/tomatodo-mini-window-fix
cd tomatodo-mini-window-fix
npm install

# 先完全退出 番茄ToDo
node patch.cjs --asar "D:\app\TomaToDo\resources\app.asar"
```

## ✅ 验证

1. 日志出现 `已安装 setBounds 防御垫`；
2. 拖动迷你小窗，不再弹出 JavaScript error 弹框；
3. 实测记录：拖动场景连续拦截 `#3~#7` 次原生 `setBounds` 失败，主进程未崩溃。

## ↩️ 回滚

```powershell
node patch.cjs --restore
```

## ⚠️ 已知限制

- 只治崩溃，不治小窗动画与拖动抢窗口的观感问题；
- 应用升级会覆盖 `app.asar`，需重新运行补丁；
- 仅针对 Windows + 默认 fuses 的 Electron 构建（开启 asar 完整性校验时会被拒绝）。

## 🧾 说明

- 第三方补丁，与番茄ToDo 官方无关；不包含任何官方文件；
- 实测发现参数归一化后仍被原生拒绝，本质是「窗口状态 + 调用时机」的竞态；
- 本仓库代码以 MIT 发布，官方软件版权归其所有者。

---

## English

**Unofficial patch for the 番茄ToDo (TomaToDo) crash when dragging the mini window** (`Error processing argument at index 0, conversion failure from`).

The mini-window animation calls `BrowserWindow.setBounds` every 16 ms; during a drag it races the OS drag, and Electron rejects the call in that window state, crashing the main process. This patch wraps `BrowserWindow.prototype.setBounds` in `app.asar/main.js`: it normalizes invalid bounds and swallows native errors, keeping normal calls intact. A timestamped backup and `--restore` are included.

Tested on 番茄ToDo 1.7.6, Windows 10/11. Not affiliated with the official product; no official files are redistributed.
