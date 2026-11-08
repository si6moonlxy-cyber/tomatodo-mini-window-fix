# 番茄ToDo 迷你小窗拖动崩溃修复补丁（第三方）

> 非官方补丁。只修改你本机安装目录里的 `app.asar`，不重分发任何官方文件。

## 问题

番茄ToDo 桌面版（TomaToDo，Electron，实测 1.7.6）在拖动「迷你小窗」时会弹出：

```
A JavaScript error occurred in the main process

Uncaught Exception:
TypeError: Error processing argument at index 0, conversion failure from
    at BrowserWindow.setBounds (node:electron/js2c/browser_init:2:8972)
    at Timeout._onTimeout (D:\app\TomaToDo\resources\app.asar\main.js:1:211663)
    at listOnTimeout (node:internal/timers:569:17)
    at process.processTimers (node:internal/timers:512:20)
```

**原因**：主进程的「小窗口展开 / 收起动画」每 16ms 调用一次 `BrowserWindow.setBounds` 来移动窗口。代码里虽然有「动画中检测到用户移动窗口就停止」的保护（2px 容差），但拖动开始的一瞬间存在窗口期，动画那一帧仍会执行 `setBounds`，且参数由屏幕工作区 + 缓动插值算出，可能是 NaN、undefined 或非整数 —— Electron 无法把它转成整数，抛未捕获异常，主进程崩溃弹框。

## 原理

在 `main.js` 最前面注入一个防御垫（`patch/guard.js`），覆盖 `BrowserWindow.prototype.setBounds`：

| 情况 | 处理 |
| --- | --- |
| 参数不是对象 | 忽略并记录日志 |
| x / y / width / height 是 NaN、undefined 或非数值 | 回退到当前窗口的对应值 |
| 小数 | 四舍五入 |
| 宽 / 高 ≤ 0 | 修正为 1 |
| 原生 setBounds 意外抛错 | 吞掉并记录日志 |

正常调用行为完全不变；被拦截的记录写在 `%TEMP%\tomatodo-mini-window-patch.log`。

注：本补丁只防「崩溃」，不改变小窗动画本身的观感（拖动时仍可能与动画轻微抢窗口，但不再弹框）。

## 用法

```powershell
git clone <本仓库地址>
cd tomatodo-mini-window-patch
npm install

# 先完全退出 番茄ToDo（任务栏右键退出，或 taskkill /IM TomaToDo.exe /F）
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

## 已知限制

- 只治崩溃，不治「动画与拖动抢窗口」的观感问题；
- 应用升级后会覆盖 `app.asar`，需要重新运行补丁；
- Windows 版 Electron 默认不启用 asar 完整性校验，所以本补丁可行；若某个构建开启了 `EnableEmbeddedAsarIntegrityValidation`，修改会被拒绝（可用 `tools/fuse-check.cjs` 先检查）。
- 仅针对 Electron 主进程的 `BrowserWindow.setBounds`，不覆盖其他 API 的类似崩溃。

## 免责声明

- 本补丁为第三方作品，与番茄ToDo 官方无关；相关商标、软件归其所有者。
- 本仓库只包含补丁工具代码，**不包含**官方 `app.asar`、`main.js` 或其解包内容，请勿在本仓库分发它们。
- 修改前请自行备份；使用风险自负。

## License

MIT（仅限本仓库中的补丁工具代码）。
