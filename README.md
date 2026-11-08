# tomatodo-mini-window-fix

简体中文 | [English](README_EN.md)

[![Platform](https://img.shields.io/badge/platform-Windows%2010%20%7C%2011-lightgrey.svg)]()
[![Node.js](https://img.shields.io/badge/node.js-18%2B-blue.svg)](https://nodejs.org/)
[![Version](https://img.shields.io/badge/version-v1.0.0-orange.svg)]()
[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

修复番茄ToDo 桌面版（TomaToDo，Electron）拖动「迷你小窗」时主进程崩溃弹框的问题。

Fix the 番茄ToDo (TomaToDo) desktop crash when dragging the mini window.

> 非官方补丁，与番茄ToDo 官方无关。修改 `app.asar` 有一定风险，请先备份、自行评估。

---

## 为什么需要它

番茄ToDo 桌面版拖动「迷你小窗」时，主进程会弹出：

```
A JavaScript error occurred in the main process

Uncaught Exception:
TypeError: Error processing argument at index 0, conversion failure from
    at BrowserWindow.setBounds (node:electron/js2c/browser_init:2:8972)
    at Timeout._onTimeout (...\app.asar\main.js:1:211663)
```

这个弹窗会打断使用，关掉后应用还在，但每次拖小窗都可能复现。官方没有提供开关，小程序逻辑又埋在 `app.asar` 里，所以只能用补丁从主进程侧兜住。

## 它在修什么

主进程的「小窗口展开 / 收起动画」每 16ms 调用一次 `BrowserWindow.setBounds` 来移动窗口。拖动时动画与系统拖窗抢同一个窗口；代码里虽然有「动画中检测到用户移动窗口就停止」的 2px 容差保护，但拖动起始存在窗口期，动画那一帧仍会调用 `setBounds` —— Electron 在窗口正被拖动的状态下拒绝执行并抛 `conversion failure`，主进程未捕获异常，于是弹框。

> 注：最初怀疑是 NaN / 非整数参数，但实测拦截日志显示——**参数归一化后仍然被原生拒绝**，所以问题不只是数值，本质是「窗口状态 + 调用时机」的竞态。

## 补丁做了什么

| 情况 | 处理 |
| --- | --- |
| 参数不是对象 | 忽略并记录日志 |
| x / y / width / height 是 NaN、undefined 或非数值 | 回退到当前窗口的对应值 |
| 小数 | 四舍五入 |
| 宽 / 高 ≤ 0 | 修正为 1 |
| 原生 `setBounds` 意外抛错 | 吞掉并记录日志 |

正常调用行为完全不变；被拦截的记录写在 `%TEMP%\tomatodo-mini-window-patch.log`。

## 工作原理

```
用户拖动迷你小窗
        │
        ▼
小窗展开/收起动画（每 16ms 一帧）
        │  BrowserWindow.setBounds({x, y, width, height})
        ▼
setBounds 防御垫（patch/guard.js，注入在 main.js 最前面）
        │  参数归一化：NaN/undefined 回退、小数取整、宽高 ≥ 1
        ▼
原生 BrowserWindow.setBounds
        │  窗口正被拖动时 Electron 拒绝执行并抛错
        ▼
异常被 try/catch 吞掉 + 写日志
        │
        ▼
主进程不再崩溃（弹框消失）
```

## 环境要求

- 番茄ToDo 桌面版（实测 1.7.6）
- Windows 10 / 11
- Node.js 18+（仅用于运行补丁脚本）
- 目标构建未开启 asar 完整性校验（Windows 默认未开，可用 `tools/fuse-check.cjs` 检查）

## 安装

```powershell
git clone https://github.com/sigmoonlxy-cyber/tomatodo-mini-window-fix
cd tomatodo-mini-window-fix
npm install
```

## 使用

```powershell
# 1. 先完全退出 番茄ToDo（托盘右键退出，或 taskkill /IM TomaToDo.exe /F）

# 2. 预览：只生成打好补丁的 asar 到 tmp/，不替换原文件
node patch.cjs --dry-run

# 3. 实际应用（自动备份原文件为 app.asar.bak-<时间戳>）
node patch.cjs --asar "D:\app\TomaToDo\resources\app.asar"

# 4. 回滚
node patch.cjs --restore
```

### 命令行参数

| 参数 | 说明 |
| --- | --- |
| `--asar <path>` | 目标 `app.asar`，默认 `D:\app\TomaToDo\resources\app.asar` |
| `--dry-run` | 只生成到 `tmp/`，不替换原文件 |
| `--restore` | 从最近一次 `.bak-*` 备份恢复原文件 |
| `--help` | 显示用法 |

环境变量 `TOMATODO_ASAR` 可覆盖默认路径。

## 验证

1. 重新启动 番茄ToDo；
2. 打开 `%TEMP%\tomatodo-mini-window-patch.log`，应出现 `已安装 setBounds 防御垫`；
3. 拖动迷你小窗，不再弹出 JavaScript error 弹框。

## 常见问题

**会被杀毒软件误报吗？**
补丁只读取/重打包 `app.asar` 并写一个 `.bak` 备份，不注入可执行文件；如遇误报请自行判断来源。

**应用升级后失效？**
是。重装会覆盖 `app.asar`，重新运行一遍补丁即可。

**Mac / Linux 能用吗？**
脚本按 Windows 路径编写；其他平台把 `--asar` 指向对应路径理论上可用，但未实测。

**会丢数据吗？**
不会。补丁只动 `app.asar`，不碰 `%APPDATA%\tomatodo` 里的待办与计时数据。

**为什么不在官方仓库修？**
补丁是第三方行为，官方包无法直接提交修改；这里只动本机副本，不动官方分发文件。

## 已知限制

- 只治「崩溃」，不治「动画与拖动抢窗口」的观感问题；
- 应用升级会覆盖 `app.asar`，需重跑补丁；
- 仅针对 `BrowserWindow.setBounds`，不覆盖其他 API 的类似崩溃；
- 若目标构建开启了 `EnableEmbeddedAsarIntegrityValidation`，修改会被拒绝。

## 安全与回滚

- 替换前自动备份 `app.asar` 到同目录 `app.asar.bak-<时间戳>`；
- `--dry-run` 可先预览产物，不触碰原文件；
- 出问题执行 `node patch.cjs --restore`，或手动把备份改回 `app.asar`；
- 只修改 `main.js` 文件头部的注入块，不改动官方业务代码。

## 目录结构

```
tomatodo-mini-window-fix/
├── patch.cjs              # 入口：解包 → 注入 → 重打包 → 备份/回滚
├── patch/guard.js         # 注入到 main.js 的 setBounds 防御垫
├── test/guard.test.cjs    # 单测（mock BrowserWindow，不依赖 Electron）
├── tools/fuse-check.cjs   # 检查目标是否开启 asar 完整性校验
├── README.md              # 简体中文（本文件）
├── README_EN.md           # English
├── CHANGELOG.md
├── LICENSE                # MIT
├── .gitignore
└── .gitattributes
```

## License

[MIT](LICENSE)（仅限本仓库中的补丁工具代码）
