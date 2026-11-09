# Changelog

## [1.1.1] - 2026-11-09

### Fixed

- 窗口化全屏播放视频时，点击迷你小窗后会被全屏窗口盖住（置顶失效）。

### Added

- `patch/top-keeper.js`：置顶保持（每 500ms 重新置顶一次）。

## [1.1.0] - 2026-11-08

### Fixed

- 停止/提前完成后界面卡在「专注中」、按钮状态不复位。
- 停止/提前完成后专注记录没有写入数据库（`saveRecordOnly` 中 `Date[...]()` 抛错导致 `doStopTimer` 中断）。
- 因记录未写入导致的手机端不同步。

### Added

- `patch/renderer-fix.js`：渲染进程兜底（记录兜底保存 + `doStopTimer` 安全网），随补丁注入。
- `patch.cjs` 支持替换 `page-timer-record.js` 中两处坏掉的 `Date[...]()` 调用。

## [1.0.0] - 2026-11-08

### Fixed

- 拖动番茄ToDo「迷你小窗」时主进程崩溃（`Error processing argument at index 0, conversion failure from`）。

### Added

- `patch/guard.js`：覆盖 `BrowserWindow.prototype.setBounds` 的防御垫（参数归一化 + 原生异常吞掉）。
- `patch.cjs`：一键打补丁 / `--dry-run` / `--restore`，自动备份原 `app.asar`。
- `test/guard.test.cjs`：mock BrowserWindow 的单元测试，不依赖 Electron。
- `tools/fuse-check.cjs`：检查目标应用是否开启 asar 完整性校验。
