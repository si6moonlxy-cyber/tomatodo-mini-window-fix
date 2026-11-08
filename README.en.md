# 番茄ToDo mini-window crash fix (unofficial patch)

> Unofficial patch · Only rewrites the local `app.asar` · No official files are redistributed.

Dragging 番茄ToDo's mini window crashes the main process with `A JavaScript error occurred in the main process`? This patch stops the crash.

## The problem

番茄ToDo desktop (TomaToDo, Electron, tested on 1.7.6) shows this when you drag the mini window:

```
A JavaScript error occurred in the main process

Uncaught Exception:
TypeError: Error processing argument at index 0, conversion failure from
    at BrowserWindow.setBounds (node:electron/js2c/browser_init:2:8972)
    at Timeout._onTimeout (...\app.asar\main.js:1:211663)
    at listOnTimeout (node:internal/timers:569:17)
    at process.processTimers (node:internal/timers:512:20)
```

**Root cause (measured)**: the mini-window expand/collapse animation calls `BrowserWindow.setBounds` every 16 ms. While the user drags the window, the animation and the OS drag fight over the same window. The app has a "stop animation if the user moved the window" guard with a 2 px tolerance, but during the first frames of a drag the animation still fires `setBounds` — Electron rejects the call while the window is being dragged and throws `conversion failure`, which is uncaught and crashes the main process.

> Note: NaN / non-integer bounds were our first suspect, but the interceptor log proved that **even normalized integer bounds are rejected natively** — so this is a window-state / timing race, not just bad numbers.

## How it works

A small guard (`patch/guard.js`) is injected at the top of `main.js`. It wraps `BrowserWindow.prototype.setBounds`:

| Case | Handling |
| --- | --- |
| bounds is not an object | ignore + log |
| x / y / width / height is NaN, undefined or not a number | fall back to current window bounds |
| fractional numbers | rounded |
| width / height ≤ 0 | clamped to 1 |
| native setBounds throws | swallowed + logged |

Normal calls behave exactly as before; every intercepted call is written to `%TEMP%\tomatodo-mini-window-patch.log`.

## What it does / does not do

| Does | Does not |
| --- | --- |
| Keeps invalid bounds away from the native layer | Fix the visual jitter of the animation |
| Swallows native setBounds errors and logs them | Modify the official installer or redistribute official files |
| Backs up the original file and offers `--restore` | Cover other APIs with the same kind of crash |

## Requirements

| Item | Value |
| --- | --- |
| App | 番茄ToDo desktop (TomaToDo / Electron) |
| Tested version | 1.7.6 |
| OS | Windows 10 / 11 |
| Node.js | 18+ (to run the patch script) |
| Asar integrity validation | must be off (default on Windows; check with `tools/fuse-check.cjs`) |

## Usage

```powershell
git clone https://github.com/sigmoonlxy-cyber/tomatodo-mini-window-fix
cd tomatodo-mini-window-fix
npm install

# Quit 番茄ToDo completely first (tray -> Quit, or: taskkill /IM TomaToDo.exe /F)
node patch.cjs --asar "D:\app\TomaToDo\resources\app.asar"
```

- Default target is `D:\app\TomaToDo\resources\app.asar`; override with `--asar` or `TOMATODO_ASAR`.
- `--dry-run` builds a patched asar into `tmp/` without touching the original.
- `--restore` restores the most recent `.bak-*` backup.

The original file is always backed up as `app.asar.bak-<timestamp>` before replacement.

## Verify

1. Relaunch 番茄ToDo;
2. Open `%TEMP%\tomatodo-mini-window-patch.log` — it should contain `已安装 setBounds 防御垫`;
3. Drag the mini window — no more crash dialog.

## Rollback

```powershell
node patch.cjs --restore
```

Or manually rename `app.asar.bak-*` back to `app.asar`.

## Tests

```powershell
npm test
```

Pure Node unit tests with a mocked `BrowserWindow`; no Electron required.

## FAQ

- **Antivirus warnings?** The tool only reads and repacks `app.asar` and writes a `.bak` backup. No executables are injected.
- **Will it survive an app update?** No — updates overwrite `app.asar`; rerun the patch.
- **macOS / Linux?** The script is written for Windows paths; other platforms should work with a different `--asar` path but are untested.
- **Data loss?** None — the patch only touches `app.asar`, not `%APPDATA%\tomatodo`.

## Repository layout

```
tomatodo-mini-window-fix/
├── patch.cjs              # unpack -> inject -> repack, backup/restore
├── patch/guard.js         # the setBounds guard injected into main.js
├── test/guard.test.cjs    # unit tests (mocked BrowserWindow)
├── tools/fuse-check.cjs   # check asar integrity fuse
├── README.md
├── README.en.md
└── LICENSE
```

## Limitations

- Stops the crash, but not the visual race between the animation and dragging;
- App updates overwrite `app.asar`, rerun the patch after updating;
- Only `BrowserWindow.setBounds` is guarded;
- Builds with `EnableEmbeddedAsarIntegrityValidation` will reject the change.

## Disclaimer

- Unofficial patch; not affiliated with 番茄ToDo. All trademarks belong to their owners.
- This repo contains patch tooling only — **no** official `app.asar`, `main.js` or extracted content. Do not redistribute official files here.
- Back up before use; use at your own risk.

## License

MIT (patch tooling only).
