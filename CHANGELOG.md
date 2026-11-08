# Changelog

## [1.0.0] - 2026-11-08

### Fixed

- 拖动番茄ToDo「迷你小窗」时主进程崩溃（`Error processing argument at index 0, conversion failure from`）。

### Added

- `patch/guard.js`：覆盖 `BrowserWindow.prototype.setBounds` 的防御垫（参数归一化 + 原生异常吞掉）。
- `patch.cjs`：一键打补丁 / `--dry-run` / `--restore`，自动备份原 `app.asar`。
- `test/guard.test.cjs`：mock BrowserWindow 的单元测试，不依赖 Electron。
- `tools/fuse-check.cjs`：检查目标应用是否开启 asar 完整性校验。
