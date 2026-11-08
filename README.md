# 番茄ToDo 迷你小窗拖动崩溃修复补丁（TomaToDo mini-window crash fix）

> 非官方补丁 · 只改你本机安装目录的 `app.asar` · 不重分发任何官方文件

拖「迷你小窗」时，番茄ToDo 主进程弹 `A JavaScript error occurred in the main process`？这个补丁让它不再崩。

## 问题

番茄ToDo 桌面版（TomaToDo，Electron，实测 1.7.6）拖动「迷你小窗」时会弹出：

```
A JavaScript error occurred in the main process

Uncaught Exception:
TypeError: Error processing argument at index 0, conversion failure from
    at BrowserWindow.setBounds (node:electron/js2c/browser_init:2:8972)
    at Timeout._onTimeout (...\app.asar\main.js:1:211663)
    at listOnTimeout (node:internal/timers:569:17)
    at process.processTimers (node:internal/timers:512:20)
```

**根因（实测结论）**：主进程的「小窗口展开 / 收起动画」每 16ms 调用一次 `BrowserWindow.setBounds`。拖动时动画与系统拖窗抢同一个窗口；代码里虽然有「动画中检测到用户移动窗口就停止」的 2px 容差保护，但拖动起始存在窗口期，动画那一帧仍会调用 `setBounds` —— Electron 在窗口正被拖动的状态下拒绝执行并抛 `conversion failure`，主进程未捕获异常，于是弹框。

> 注：最初怀疑是 NaN / 非整数参数，但实测拦截日志显示——**参数归一化后仍然被原生拒绝**，所以问题不只是数值，本质是「窗口状态 + 调用时机」的竞态。

## 原理

在 `main.js` 最前面注入防御垫（`patch/guard.js`），覆盖 `BrowserWindow.prototype.setBounds`：

| 情况 | 处理 |
| --- | --- |
| 参数不是对象 | 忽略并记录日志 |
| x / y / width / height 是 NaN、undefined 或非数值 | 回退到当前窗口的对应值 |
| 小数 | 四舍五入 |
| 宽 / 高 ≤ 0 | 修正为 1 |
| 原生 setBounds 意外抛错 | 吞掉并记录日志 |

正常调用行为完全不变；被拦截的记录写在 `%TEMP%\tomatodo-mini-window-patch.log`。

## 它做了什么 / 没做什么

| 做了 | 没做 |
| --- | --- |
| 阻止非法参数进入原生层 | 不修小窗动画的观感（拖动时仍可能轻微抢窗口） |
| 吞掉原生 setBounds 异常并写日志 | 不改官方安装包、不重分发官方文件 |
| 一键备份与 `--restore` 回滚 | 不处理其他 API 的类似崩溃 |

## 适用环境

| 项目 | 值 |
| --- | --- |
| 应用 | 番茄ToDo 桌面版（TomaToDo / Electron） |
| 实测版本 | 1.7.6 |
| 系统 | Windows 10 / 11 |
| Node.js | 18+（仅用于运行补丁脚本） |
| asar 完整性校验 | 需未开启（Windows 默认未开；`tools/fuse-check.cjs` 可检查） |

## 用法

```powershell
git clone https://github.com/sigmoonlxy-cyber/tomatodo-mini-window-fix
cd tomatodo-mini-window-fix
npm install

# 先完全退出 番茄ToDo（托盘右键退出，或 taskkill /IM TomaToDo.exe /F）
node patch.cjs --asar "D:\app\TomaToDo\resources\app.asar"
```

- 默认目标路径就是 `D:\app\TomaToDo\resources\app.asar`，可用 `--asar` 或环境变量 `TOMATODO_ASAR` 覆盖。
- `--dry-run`：只把打好补丁的 asar 生成到 `tmp/`，不替换原文件（安全预览）。
- `--restore`：从最近一次 `.bak-*` 备份恢复原文件。

替换前会自动备份原文件为 `app.asar.bak-<时间戳>`。

## 验证

1. 重新启动 番茄ToDo；
2. 打开 `%TEMP%\tomatodo-mini-window-patch.log`，应出现 `已安装 setBounds 防御垫`；
3. 拖动迷你小窗，不再弹出 JavaScript error 弹框。

## 回滚

```powershell
node patch.cjs --restore
```

或手动把 `app.asar.bak-*` 改回 `app.asar`。

## 测试

```powershell
npm test
```

单元测试用 mock 的 `BrowserWindow` 验证 guard 的拦截逻辑，不依赖 Electron。

## 常见问题

- **会被杀毒软件误报吗？** 补丁只读取/重打包 `app.asar` 并写一个 `.bak` 备份，不注入可执行文件；如遇误报请自行判断来源。
- **应用升级后失效？** 是。重装会覆盖 `app.asar`，重新运行一遍补丁即可。
- **Mac / Linux 能用吗？** 脚本按 Windows 路径编写，其他平台改 `--asar` 指向对应路径理论上可用，但未实测。
- **会丢数据吗？** 不会。补丁只动 `app.asar`，不碰 `%APPDATA%\tomatodo` 里的待办与计时数据。

## 仓库结构

```
tomatodo-mini-window-fix/
├── patch.cjs              # 入口：解包 → 注入 → 重打包 → 备份/回滚
├── patch/guard.js         # 注入到 main.js 的 setBounds 防御垫
├── test/guard.test.cjs    # 单测（mock BrowserWindow，不依赖 Electron）
├── tools/fuse-check.cjs   # 检查目标是否开启 asar 完整性校验
├── README.md
├── README.en.md
└── LICENSE
```

## 已知限制

- 只治「崩溃」，不治「动画与拖动抢窗口」的观感问题；
- 应用升级会覆盖 `app.asar`，需重跑补丁；
- 仅针对 `BrowserWindow.setBounds`，不覆盖其他 API 的类似崩溃；
- 若某构建开启了 `EnableEmbeddedAsarIntegrityValidation`，修改会被拒绝。

## 免责声明

- 本补丁为第三方作品，与番茄ToDo 官方无关；相关商标、软件归其所有者。
- 本仓库只包含补丁工具代码，**不包含**官方 `app.asar`、`main.js` 或其解包内容，请勿在本仓库分发它们。
- 修改前请自行备份；使用风险自负。

## License

MIT（仅限本仓库中的补丁工具代码）。
