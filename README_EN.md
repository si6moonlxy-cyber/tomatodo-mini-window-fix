# tomatodo-mini-window-fix

English | [简体中文](README.md)

[![Platform](https://img.shields.io/badge/platform-Windows%2010%20%7C%2011-lightgrey.svg)]()
[![Node.js](https://img.shields.io/badge/node.js-18%2B-blue.svg)](https://nodejs.org/)
[![Version](https://img.shields.io/badge/version-v1.0.0-orange.svg)]()
[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

Fix the 番茄ToDo (TomaToDo) desktop crash when dragging the mini window.

> Unofficial patch, not affiliated with 番茄ToDo. Modifying `app.asar` carries risk — back it up first and evaluate at your own discretion.

---

## Why this exists

Dragging 番茄ToDo's mini window makes the main process pop up:

```
A JavaScript error occurred in the main process

Uncaught Exception:
TypeError: Error processing argument at index 0, conversion failure from
    at BrowserWindow.setBounds (node:electron/js2c/browser_init:2:8972)
    at Timeout._onTimeout (...\app.asar\main.js:1:211663)
```

The dialog interrupts whatever you are doing and comes back every time you drag the mini window. There is no official switch for it, and the logic is buried inside `app.asar`, so the only practical route is a main-process-side patch.

## What it fixes

The mini-window expand/collapse animation calls `BrowserWindow.setBounds` every 16 ms. While the user drags the window, the animation and the OS drag fight over the same window. The app has a "stop animation if the user moved the window" guard with a 2 px tolerance, but during the first frames of a drag the animation still fires `setBounds` — Electron rejects the call while the window is being dragged and throws `conversion failure`, which is uncaught and crashes the main process.

> Note: NaN / non-integer bounds were our first suspect, but the interceptor log proved that **even normalized integer bounds are rejected natively** — so this is a window-state / timing race, not just bad numbers.

## What the patch does

| Case | Handling |
| --- | --- |
| bounds is not an object | ignore + log |
| x / y / width / height is NaN, undefined or not a number | fall back to current window bounds |
| fractional numbers | rounded |
| width / height ≤ 0 | clamped to 1 |
| native `setBounds` throws | swallowed + logged |

Normal calls behave exactly as before; every intercepted call is written to `%TEMP%\tomatodo-mini-window-patch.log`.

## How it works

```
User drags the mini window
        │
        ▼
Expand/collapse animation (one frame every 16 ms)
        │  BrowserWindow.setBounds({x, y, width, height})
        ▼
setBounds guard (patch/guard.js, injected at the top of main.js)
        │  normalize: NaN/undefined fallback, round, clamp w/h >= 1
        ▼
Native BrowserWindow.setBounds
        │  Electron rejects it while the window is being dragged
        ▼
Exception swallowed by try/catch + logged
        │
        ▼
Main process no longer crashes (dialog gone)
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
# 1. Quit 番茄ToDo completely first (tray -> Quit, or: taskkill /IM TomaToDo.exe /F)

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

1. Relaunch 番茄ToDo;
2. Open `%TEMP%\tomatodo-mini-window-patch.log` — it should contain `已安装 setBounds 防御垫`;
3. Drag the mini window — no more crash dialog.

## FAQ

**Antivirus warnings?**
The tool only reads and repacks `app.asar` and writes a `.bak` backup. No executables are injected.

**Does it survive app updates?**
No — updates overwrite `app.asar`; rerun the patch after updating.

**macOS / Linux?**
The script is written for Windows paths; other platforms should work with a different `--asar` path but are untested.

**Data loss?**
None — the patch only touches `app.asar`, not `%APPDATA%\tomatodo`.

**Why not fix it upstream?**
This is a third-party patch; it only modifies the local copy and never touches official distribution files.

## Limitations

- Stops the crash, but not the visual race between the animation and dragging;
- App updates overwrite `app.asar`, rerun the patch after updating;
- Only `BrowserWindow.setBounds` is guarded;
- Builds with `EnableEmbeddedAsarIntegrityValidation` will reject the change.

## Safety & rollback

- The original `app.asar` is backed up as `app.asar.bak-<timestamp>` in the same folder;
- `--dry-run` lets you preview the artifact without touching the original;
- If anything goes wrong, run `node patch.cjs --restore` or rename the backup back to `app.asar`;
- Only the injected block at the top of `main.js` is added; official business code is untouched.

## Repository layout

```
tomatodo-mini-window-fix/
├── patch.cjs              # unpack -> inject -> repack, backup/restore
├── patch/guard.js         # the setBounds guard injected into main.js
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
