# tomatodo-mini-window-fix

简体中文 | [English](README_EN.md)

[![Platform](https://img.shields.io/badge/platform-Windows%2010%20%7C%2011-lightgrey.svg)]()
[![Node.js](https://img.shields.io/badge/node.js-18%2B-blue.svg)](https://nodejs.org/)
[![Version](https://img.shields.io/badge/version-v1.1.0-orange.svg)]()
[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

修复番茄ToDo 桌面版（TomaToDo，Electron）的三类问题：拖动「迷你小窗」时主进程崩溃；停止/提前完成后记录丢失、界面卡在「专注中」、记录不同步手机；托盘「仅显示图标」切换不生效。

> 非官方补丁，与番茄ToDo 官方无关。修改 `app.asar` 有一定风险，请先备份、自行评估。

---

## 为什么需要它

番茄ToDo 桌面版（实测 1.7.6）有三个会直接影响使用的问题，官方没有提供开关，逻辑又埋在 `app.asar` 里，所以只能用补丁从主进程 / 渲染进程侧兜住。

## 它在修什么

### 1. 拖动迷你小窗时主进程崩溃（v1.0.0）

拖动「迷你小窗」时弹出：

```
A JavaScript error occurred in the main process

Uncaught Exception:
TypeError: Error processing argument at index 0, conversion failure from
    at BrowserWindow.setBounds (node:electron/js2c/browser_init:2:8972)
```

**根因**：小窗展开/收起动画每 16ms 调用一次 `BrowserWindow.setBounds`，与用户拖动抢同一个窗口；拖动起始的那一帧动画仍会调用 `setBounds`，Electron 在窗口正被拖动时拒绝执行并抛错，主进程未捕获 → 崩溃弹框。

### 2. 停止/提前完成后记录丢失、界面卡住、不同步（v1.1.0）

点「停止 → 提前完成」后：时间停住了，但界面仍显示「专注中」、按钮状态不变、**记录没有写进数据库**，手机端自然也收不到。

**根因**：`js/pages/page-timer-record.js` 里 `saveRecordOnly` 第一行是混淆后的 `Date[...]()`（本应是 `Date.now`），运行时解码失败抛 `Uncaught TypeError`，导致 `doStopTimer` 后半段（写记录、复位界面、清状态）全部被跳过。

**修复**：
- 把两处坏掉的 `Date[...]()` 调用替换为 `Date.now()`；
- 给 `saveRecordOnly` 加兜底：失败时手动构造记录写入数据库，并触发云同步 / 手机同步；
- 给 `doStopTimer` 加安全网：任何一步抛错都会强制复位计时状态与界面，不会卡在「专注中」。

### 3. 托盘「仅显示图标」切换不生效（v1.1.0）

设置里把「托盘图标」从「显示计时分钟数」切到「仅显示图标」，托盘图标看起来没有变化（计时进行中尤其明显）。

**根因**：`updateWindowsTrayIcon` 里有个缓存短路——`currentTrayState.mode === mode` 时直接 `return`。切换设置时 `mode` 没变，只是图标内容变了，于是函数提前返回，托盘不重绘。

**修复**：拦截 `settings:setWindowsTrayIconMode`，设置完成后清掉托盘状态缓存并强制调用 `updateWindowsTrayIcon` 重绘。

## 补丁做了什么

| 情况 | 处理 |
| --- | --- |
| 小窗 `setBounds` 参数非法 / 原生拒绝 | 参数归一化 + 异常吞掉并记录 |
| `saveRecordOnly` 中 `Date[...]()` 抛错 | 替换为 `Date.now()`；失败时走兜底写记录 |
| `doStopTimer` 中途抛错 | `finally` 中强制复位状态与界面 |
| 记录写入成功 | 触发云同步 `uploadRecentRecordsToCloud` 与手机直连 `syncRecordToPhoneAsync` |
| 切换「托盘图标」设置 | 清掉托盘状态缓存并强制重绘，图标立即变化 |

正常调用行为不变；被拦截/兜底的记录写入控制台，必要时可查 DevTools。

## 工作原理

```
用户点「停止 → 提前完成」
        │
        ▼
doStopTimer（渲染进程）
        │  clearTimerUiInterval / timer:stop（主进程停表）
        ▼
saveRecordOnly
        │  Date.now() 正常 → 构造记录 → db:addRecord
        │  旧代码：Date[...]() 解码失败 → 抛错 → doStopTimer 中断（bug）
        ▼
addRecord 成功 → uploadRecentRecordsToCloud（云同步）
        │          → syncRecordToPhoneAsync（手机直连，需已连接）
        ▼
doStopTimer 收尾：TimerCoreState 复位 → updateView() 回到空闲
```

## 环境要求

- 番茄ToDo 桌面版（实测 1.7.6）
- Windows 10 / 11
- Node.js 18+（仅用于运行补丁脚本）
- 目标构建未开启 asar 完整性校验（Windows 默认未开，可用 `tools/fuse-check.cjs` 检查）

## 安装

```powershell
git clone https://github.com/si6moonlxy-cyber/tomatodo-mini-window-fix
cd tomatodo-mini-window-fix
npm install
```

## 使用

```powershell
# 1. 先完全退出 番茄ToDo（托盘右键退出，或 taskkill /IM TomaToDo.exe /T /F）

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

**1. 小窗崩溃（v1.0.0）**

- 拖动迷你小窗，不再弹出 JavaScript error 弹框。

**2. 停止/提前完成（v1.1.0）**

- 停止后界面回到空闲，按钮状态复位；
- `%APPDATA%\tomatodo\tomatodo_db.json` 的 `PCRecord` 里出现新记录；
- 控制台出现 `db:addRecord -> {"success":true}` 与 `[CloudSync] 专注记录上传成功`；
- 手机端登录同一账号并刷新后可见记录。

**3. 托盘图标（v1.1.0）**

- 计时进行中，设置 → 托盘图标 → 在「显示计时分钟数」与「仅显示图标」之间切换，托盘图标立即变化。

## 常见问题

**会被杀毒软件误报吗？**
补丁只读取/重打包 `app.asar` 并写一个 `.bak` 备份，不注入可执行文件；如遇误报请自行判断来源。

**应用升级后失效？**
是。重装会覆盖 `app.asar`，重新运行一遍补丁即可。

**Mac / Linux 能用吗？**
脚本按 Windows 路径编写；其他平台把 `--asar` 指向对应路径理论上可用，但未实测。

**手机端还是收不到记录？**
PC 端云同步需要账号已绑定且为会员；手机直连需要 PC 端「连接手机」在同 WiFi 下扫码。先确认记录已写入本地库，再看云同步 / 直连两条通道。

**小于 5 分钟的专注为什么不能提前完成？**
应用把「不足 5 秒」的计时设计为静默丢弃（防误触）。但如果开始时间变量丢失，任何时长都可能被误判为短时——这属于应用缺陷，后续版本会修。

## 已知限制

- 只修「崩溃 / 记录丢失 / 界面卡住」，不修小窗动画与拖动抢窗口的观感问题；
- 应用升级会覆盖 `app.asar`，需重跑补丁；
- 若目标构建开启了 `EnableEmbeddedAsarIntegrityValidation`，修改会被拒绝；
- 短计时（<5 秒）仍按应用原设计丢弃。

## 安全与回滚

- 替换前自动备份 `app.asar` 到同目录 `app.asar.bak-<时间戳>`；
- `--dry-run` 可先预览产物，不触碰原文件；
- 出问题执行 `node patch.cjs --restore`，或手动把备份改回 `app.asar`；
- 只注入 guard / 修复安装器，并修改一处混淆调用，不改动官方业务代码。

## 目录结构

```
tomatodo-mini-window-fix/
├── patch.cjs              # 入口：解包 → 注入 → 重打包 → 备份/回滚
├── patch/guard.js         # setBounds 防御垫（注入 main.js）
├── patch/renderer-fix.js  # 渲染进程兜底（记录保存 / 界面复位）
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
