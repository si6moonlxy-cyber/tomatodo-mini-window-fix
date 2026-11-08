# tomatodo-mini-window-fix

English | [简体中文](README.md)

[![Platform](https://img.shields.io/badge/platform-Windows%2010%20%7C%2011-lightgrey.svg)]()
[![Node.js](https://img.shields.io/badge/node.js-18%2B-blue.svg)](https://nodejs.org/)
[![Version](https://img.shields.io/badge/version-v1.1.0-orange.svg)]()
[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

Fixes two issues in the 番茄ToDo (TomaToDo) desktop app: crashing the main process when dragging the mini window, and losing records / freezing the UI / failing to sync when stopping or finishing a focus session early.

> Unofficial patch, not affiliated with 番茄ToDo. Modifying `app.asar` carries risk — back it up first and evaluate at your own discretion.

---

## Why this exists

The desktop app (tested on 1.7.6) has two problems that directly affect usage. There is no official switch for either, and the logic is buried inside `app.asar`, so a main-process / renderer-side patch is the only practical route.

## What it fixes

### 1. Main process crash when dragging the mini window (v1.0.0)

Dragging the mini window shows:

```
A JavaScript error occurred in the main process

Uncaught Exception:
TypeError: Error processing argument at index 0, conversion failure from
    at BrowserWindow.setBounds (node:electron/js2c/browser_init:2:8972)
```

**Root cause**: the mini-window animation calls `BrowserWindow.setBounds` every 16 ms, racing the OS drag; the first frames of a drag still call `setBounds`, Electron rejects it in that window state, and the uncaught error crashes the main process.

### 2. Stop / finish-early loses the record and freezes the UI (v1.1.0)

After 「停止 → 提前完成」: the timer stops, but the UI stays on 「专注中」, buttons do not reset, **the record is never written**, and the phone never receives it.

**Root cause**: in `js/pages/page-timer-record.js`, `saveRecordOnly` starts with an obfuscated `Date[...]()` call (should be `Date.now`). It throws `Uncaught TypeError` at runtime, so the rest of `doStopTimer` (save record, reset UI, clear state) is skipped.

**Fix**:
- Replace both broken `Date[...]()` calls with `Date.now()`;
- Add a fallback for `saveRecordOnly`: build the record manually, write it via `db:addRecord`, then trigger cloud / phone sync;
- Add a safety net for `doStopTimer`: any thrown error forces a timer-state and UI reset, so it never freezes on 「专注中」.

## What the patch does

| Case | Handling |
| --- | --- |
| Invalid / rejected `setBounds` on the mini window | normalize args + swallow the error and log it |
| `Date[...]()` throws inside `saveRecordOnly` | replaced with `Date.now()`; fallback saves the record |
| `doStopTimer` throws mid-way | forced state + UI reset in `finally` |
| Record saved | triggers `uploadRecentRecordsToCloud` and `syncRecordToPhoneAsync` |

Normal calls behave as before; intercepted / fallback writes are logged to the console.

## How it works

```
User clicks 「停止 → 提前完成」
        │
        ▼
doStopTimer (renderer)
        │  clearTimerUiInterval / timer:stop (main process stops)
        ▼
saveRecordOnly
        │  Date.now() OK → build record → db:addRecord
        │  old code: Date[...]() fails → throws → doStopTimer aborts (bug)
        ▼
addRecord ok → uploadRecentRecordsToCloud (cloud sync)
        │     → syncRecordToPhoneAsync (direct phone link, must be connected)
        ▼
doStopTimer finishes: reset TimerCoreState → updateView() back to idle
```

## Requirements

- 番茄ToDo desktop (tested on 1.7.6)
- Windows 10 / 11
- Node.js 18+ (to run the patch script)
- Target build must not enable asar integrity validation (off by default on Windows; check with `tools/fuse-check.cjs`)

## Install

```powershell
git clone https://github.com/si6moonlxy-cyber/tomatodo-mini-window-fix
cd tomatodo-mini-window-fix
npm install
```

## Usage

```powershell
# 1. Quit 番茄ToDo completely first (tray -> Quit, or: taskkill /IM TomaToDo.exe /T /F)

# 2. Preview: build a patched asar into tmp/, do not touch the original
node patch.cjs --dry-run

# 3. Apply (auto-backs up the original as app.asar.bak-<timestamp>)
node patch.cjs --asar "D:\app\TomaToDo\resources\app.asar"

# 4. Roll back
node patch.cjs --restore
```

### Command-line options

| Option | Description |
| --- | --- |
| `--asar <path>` | Target `app.asar`, defaults to `D:\app\TomaToDo\resources\app.asar` |
| `--dry-run` | Build into `tmp/` only, do not replace the original |
| `--restore` | Restore the most recent `.bak-*` backup |
| `--help` | Show usage |

Environment variable `TOMATODO_ASAR` overrides the default path.

## Verify

**1. Mini-window crash (v1.0.0)**

- Drag the mini window — no more crash dialog.

**2. Stop / finish early (v1.1.0)**

- UI returns to idle and buttons reset;
- A new entry appears in `PCRecord` inside `%APPDATA%\tomatodo\tomatodo_db.json`;
- Console shows `db:addRecord -> {"success":true}` and `[CloudSync] 专注记录上传成功`;
- The phone shows the record after logging into the same account and refreshing.

## FAQ

**Antivirus warnings?**
The tool only reads and repacks `app.asar` and writes a `.bak` backup. No executables are injected.

**Does it survive app updates?**
No — updates overwrite `app.asar`; rerun the patch after updating.

**macOS / Linux?**
The script is written for Windows paths; other platforms should work with a different `--asar` path but are untested.

**The phone still does not show records?**
Cloud sync needs a bound account (member); direct phone sync needs 「连接手机」 on the same Wi-Fi. Confirm the record exists locally first.

**Why can't a focus session shorter than 5 minutes be finished early?**
The app silently drops sessions shorter than 5 seconds (anti-mistap design). But if the start-time variable is lost, any duration can be misjudged as short — that is an app defect to be fixed later.

## Limitations

- Fixes the crash / lost record / frozen UI only; visual jitter during drags remains;
- App updates overwrite `app.asar`, rerun the patch;
- Builds with `EnableEmbeddedAsarIntegrityValidation` will reject the change;
- Sessions under 5 seconds are still dropped by the original design.

## Safety & rollback

- The original `app.asar` is backed up as `app.asar.bak-<timestamp>` in the same folder;
- `--dry-run` lets you preview the artifact without touching the original;
- If anything goes wrong, run `node patch.cjs --restore` or rename the backup back to `app.asar`;
- Only the guard / fix installer is injected plus one obfuscated call is replaced; official business code is untouched.

## Repository layout

```
tomatodo-mini-window-fix/
├── patch.cjs              # unpack -> inject -> repack, backup/restore
├── patch/guard.js         # setBounds guard (injected into main.js)
├── patch/renderer-fix.js  # renderer fallback (record save / UI reset)
├── test/guard.test.cjs    # unit tests (mocked BrowserWindow)
├── tools/fuse-check.cjs   # check asar integrity fuse
├── README.md              # 简体中文
├── README_EN.md           # English (this file)
├── CHANGELOG.md
├── LICENSE                # MIT
├── .gitignore
└── .gitattributes
```

## License

[MIT](LICENSE) (patch tooling only)
