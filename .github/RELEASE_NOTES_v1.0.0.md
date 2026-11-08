# v1.0.0 — 番茄ToDo 迷你小窗拖动崩溃修复（TomaToDo mini-window crash fix）

> 首个版本 · 非官方补丁 · 只改本地 `app.asar`

## 🔥 修复了什么

拖动番茄ToDo「迷你小窗」时，主进程弹出：

```
A JavaScript error occurred in the main process
Uncaught Exception:
TypeError: Error processing argument at index 0, conversion failure from
    at BrowserWindow.setBounds (node:electron/js2c/browser_init:2:8972)
```

**根因**：小窗展开/收起动画每 16ms 调用 `BrowserWindow.setBounds`，拖动时与系统拖窗抢同一个窗口；拖动起始的窗口期里动画仍会调用 `setBounds`，Electron 在窗口正被拖动时拒绝执行并抛错，主进程未捕获 → 弹框。

## 🛡 补丁做了什么

- 在 `app.asar/main.js` 最前面注入 `patch/guard.js`，覆盖 `BrowserWindow.prototype.setBounds`：
  - 非法参数归一化（NaN/undefined 回退当前 bounds、小数取整、宽高 ≤ 0 修正为 1）
  - 原生调用异常 `try/catch` 吞掉并记录日志
  - 正常调用行为不变
- 替换前自动备份为 `app.asar.bak-<时间戳>`
- 附带 `--dry-run`（安全预览）与 `--restore`（一键回滚）

## ✅ 实测验证（本机）

- 注入成功日志：`已安装 setBounds 防御垫` ✅
- 拖动场景日志：`原生调用失败 #3~#7: Error processing argument at index 0, conversion failure from`，异常被吞，**主进程未崩溃** ✅

## 📦 安装

```powershell
git clone https://github.com/sigmoonlxy-cyber/tomatodo-mini-window-fix
cd tomatodo-mini-window-fix
npm install

# 先完全退出 番茄ToDo
node patch.cjs --asar "D:\app\TomaToDo\resources\app.asar"
```

## ↩️ 回滚

```powershell
node patch.cjs --restore
```

## ⚠️ 已知限制

- 只治崩溃，不治小窗动画与拖动抢窗口的观感问题；
- 应用升级会覆盖 `app.asar`，需要重新运行补丁；
- 仅针对 Windows + 默认 fuses 的 Electron 构建（开启 asar 完整性校验时会被拒绝）。

## 🧾 说明

- 第三方补丁，与番茄ToDo 官方无关；不包含任何官方文件。
- 真实场景参数已归一化仍被原生拒绝，说明这是「窗口状态 + 调用时机」竞态，而不仅是数值问题。

---

## English summary

First release: unofficial patch for the 番茄ToDo (TomaToDo) mini-window crash on drag (`Error processing argument at index 0`). Injects a `BrowserWindow.setBounds` guard into `app.asar/main.js`; normalizes invalid bounds and swallows native setBounds errors. Backup + `--restore` included. Windows 10/11, Electron build with asar integrity disabled.
