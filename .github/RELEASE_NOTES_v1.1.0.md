# v1.1.0 — 停止计时修复：记录保存 + 界面复位 + 同步恢复

非官方补丁 · 只改本机 `app.asar` · 含备份与一键回滚

## 🔧 修复

点「停止 → 提前完成」后，计时虽然停了，但：

- 界面仍显示「专注中」，按钮状态不复位；
- **专注记录没有写进数据库**；
- 手机端收不到记录（因为本地根本没记录可同步）。

**根因**：`js/pages/page-timer-record.js` 的 `saveRecordOnly` 第一行是混淆后的 `Date[...]()`（本应为 `Date.now`），运行时解码失败抛 `Uncaught TypeError`，导致 `doStopTimer` 后半段（`TimerCoreState.isRunning=false`、`updateView()`、写记录）全部被跳过。

## 🛡️ 补丁做了什么

1. **替换坏调用**：两处 `Date[...]()` → `Date.now()`（`page-timer-record.js`）；
2. **记录兜底**：`saveRecordOnly` 失败时手动构造记录写入 `db:addRecord`，并触发 `uploadRecentRecordsToCloud` 与 `syncRecordToPhoneAsync`；
3. **界面兜底**：`doStopTimer` 抛错时在 `finally` 中强制复位计时状态、托盘、页面与 `updateView()`；
4. 保留 v1.0.0 的 `setBounds` 防御垫（拖动迷你小窗不再崩）。

## 📦 安装 / 升级

```powershell
git clone https://github.com/si6moonlxy-cyber/tomatodo-mini-window-fix
cd tomatodo-mini-window-fix
npm install

# 先完全退出 番茄ToDo
node patch.cjs --asar "D:\app\TomaToDo\resources\app.asar"
```

从 v1.0.0 升级：直接重新运行上面的命令即可（会重新备份并覆盖）。

## ✅ 验证

1. 停止/提前完成后界面回到空闲、按钮复位；
2. `%APPDATA%\tomatodo\tomatodo_db.json` 的 `PCRecord` 出现新记录；
3. 控制台/日志出现 `db:addRecord -> {"success":true}` 与 `[CloudSync] 专注记录上传成功`；
4. 手机端登录同一账号并刷新后可见记录。

## ↩️ 回滚

```powershell
node patch.cjs --restore
```

## ⚠️ 已知限制

- 只修崩溃 / 记录丢失 / 界面卡住，不修小窗动画与拖动抢窗口的观感；
- 应用升级会覆盖 `app.asar`，需重新运行补丁；
- 手机直连同步需要 PC 端「连接手机」在同 WiFi 下建立；云同步需要账号已绑定。

---

## English

**v1.1.0 — stop-timer fix: record saving, UI reset, sync recovery.**

After 「停止 → 提前完成」 the timer stopped but the UI stayed on 「专注中」 and no record was saved (so the phone got nothing). Root cause: an obfuscated `Date[...]()` call in `saveRecordOnly` (`page-timer-record.js`) throws `Uncaught TypeError`, aborting the rest of `doStopTimer`.

This patch:
1. replaces both broken `Date[...]()` calls with `Date.now()`;
2. wraps `saveRecordOnly` with a fallback that manually builds the record, writes it via `db:addRecord`, and triggers cloud + phone sync;
3. wraps `doStopTimer` with a `finally`-based safety net that resets timer state and UI;
4. keeps the v1.0.0 `setBounds` guard for the mini-window crash.

Tested on 番茄ToDo 1.7.6, Windows 10/11. Not affiliated with the official product; no official files are redistributed.
