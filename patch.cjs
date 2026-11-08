#!/usr/bin/env node
'use strict';
/*
 * tomatodo-mini-window-patch · main tool (v1.1.0)
 * 修复番茄ToDo 桌面版两类问题：
 *   A) 拖动迷你小窗时主进程崩溃（setBounds guard）
 *   B) 停止/提前完成时记录丢失、界面卡在「专注中」（Date[...]() 修复 + 渲染进程兜底）
 *
 * 用法：
 *   node patch.cjs --asar "D:\app\TomaToDo\resources\app.asar"   应用（自动备份）
 *   node patch.cjs --dry-run                                      只生成、不替换
 *   node patch.cjs --restore                                      从备份恢复
 *
 * 依赖：npm install（@electron/asar）
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const asar = require('@electron/asar');

const ROOT = __dirname;
const GUARD_PATH = path.join(ROOT, 'patch', 'guard.js');
const RENDERER_FIX_PATH = path.join(ROOT, 'patch', 'renderer-fix.js');
const MARKER = 'TOMATODO_PATCH_MARKER_V2';
const GUARD_MARKER = '__TOMATO_MIN_SETBOUNDS_GUARD__';
const DEFAULT_ASAR = process.env.TOMATODO_ASAR || 'D:\\app\\TomaToDo\\resources\\app.asar';

// 混淆代码里解码失败的 Date.now 调用（修复后记录才能保存）
const DATE_FIXES = [
  ['Date[_0x4e3760(0x3d6,0x402)]', 'Date.now'],
  ['Date[_0xb861bd(a0_0x36b9ab._0x34a475,0x7f)]', 'Date.now'],
];
const DATE_FIX_FILE = path.join('js', 'pages', 'page-timer-record.js');

function usage() {
  console.log([
    '用法:',
    '  node patch.cjs [--asar <path>] [--dry-run|--restore]',
    '',
    '  --asar <path>   目标 app.asar（默认 ' + DEFAULT_ASAR + '）',
    '  --dry-run       生成打好补丁的 asar 到项目 tmp/，但不替换原文件',
    '  --restore       从最近一次 .bak-* 备份恢复原文件',
    '',
    '注意：应用运行中无法替换 app.asar，请先退出 番茄ToDo。',
  ].join('\n'));
}

function stamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

function newestBackup(asarPath) {
  const dir = path.dirname(asarPath);
  const base = path.basename(asarPath);
  const list = fs.readdirSync(dir)
    .filter((n) => n.startsWith(base + '.bak-'))
    .sort();
  return list.length ? path.join(dir, list[list.length - 1]) : null;
}

function restore(asarPath) {
  const bak = newestBackup(asarPath);
  if (!bak) throw new Error('没有找到备份文件: ' + path.join(path.dirname(asarPath), path.basename(asarPath) + '.bak-*'));
  fs.copyFileSync(bak, asarPath);
  console.log('[restore] 已从备份恢复:', bak, '->', asarPath);
}

function readMainFromAsar(asarPath) {
  try {
    return asar.extractFile(asarPath, 'main.js').toString('utf8');
  } catch (e) {
    throw new Error('无法从 asar 读取 main.js: ' + e.message);
  }
}

function buildInstaller(rendererFixSrc) {
  return [
    '/* tomatodo-mini-window-patch · renderer fix installer */',
    '(function () {',
    '  try {',
    '    var electron = require("electron");',
    '    var app = electron && electron.app;',
    '    if (!app) return;',
    '    var src = ' + JSON.stringify(rendererFixSrc) + ';',
    '    app.on("browser-window-created", function (ev, win) {',
    '      try {',
    '        win.webContents.on("did-finish-load", function () {',
    '          win.webContents.executeJavaScript(src).catch(function () {});',
    '        });',
    '      } catch (e) {}',
    '    });',
    '  } catch (e) {}',
    '})();',
  ].join('\n');
}

function fixDateCalls(tmp, log) {
  const file = path.join(tmp, DATE_FIX_FILE);
  if (!fs.existsSync(file)) {
    throw new Error('找不到渲染进程文件: ' + DATE_FIX_FILE);
  }
  let s = fs.readFileSync(file, 'utf8');
  let total = 0;
  for (const [from, to] of DATE_FIXES) {
    const n = s.split(from).length - 1;
    if (n > 0) {
      s = s.split(from).join(to);
      total += n;
      log('[fix] ' + DATE_FIX_FILE + ' 替换 ' + n + ' 处: ' + from + ' -> ' + to);
    }
  }
  if (total === 0) {
    throw new Error('没有找到需要修复的 Date[...]() 调用（版本不匹配？）');
  }
  fs.writeFileSync(file, s, 'utf8');
  return total;
}

async function apply(asarPath, { dryRun }) {
  if (!dryRun && readMainFromAsar(asarPath).includes(MARKER)) {
    console.log('[skip] 该 app.asar 已经打过 v1.1.0 补丁（找到标记）。如需重打，请先 --restore。');
    return;
  }
  const guard = fs.readFileSync(GUARD_PATH, 'utf8');
  const rendererFix = fs.readFileSync(RENDERER_FIX_PATH, 'utf8');
  const ts = stamp();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tomatodo-patch-'));
  const outAsar = dryRun
    ? path.join(ROOT, 'tmp', 'app.asar.patched-' + ts + '.asar')
    : asarPath + '.new-' + ts;
  const log = (m) => console.log(m);

  try {
    if (!dryRun) {
      const backup = asarPath + '.bak-' + ts;
      fs.copyFileSync(asarPath, backup);
      log('[backup] 原文件已备份: ' + backup);
    } else {
      log('[dry-run] 不会修改原文件');
    }

    log('[unpack] 解包到: ' + tmp);
    asar.extractAll(asarPath, tmp);

    // 1) renderer: fix broken Date[...]() calls
    fixDateCalls(tmp, log);

    // 2) main.js: setBounds guard + renderer fix installer
    const mainPath = path.join(tmp, 'main.js');
    const original = fs.readFileSync(mainPath, 'utf8');
    const next =
      '/* tomatodo-mini-window-patch v1.1.0 | ' + MARKER + ' */\n' +
      guard + '\n' +
      buildInstaller(rendererFix) + '\n' +
      original;
    fs.writeFileSync(mainPath, next, 'utf8');
    log('[inject] main.js 头部已注入 guard + renderer 修复安装器，长度: ' + original.length + ' -> ' + next.length);

    if (dryRun) fs.mkdirSync(path.join(ROOT, 'tmp'), { recursive: true });
    log('[pack] 正在重新打包 asar...');
    await asar.createPackage(tmp, outAsar);

    // 3) verify
    const checkMain = asar.extractFile(outAsar, 'main.js').toString('utf8');
    if (!checkMain.includes(MARKER)) throw new Error('打包校验失败：main.js 不含补丁标记');
    if (!checkMain.includes(GUARD_MARKER)) throw new Error('打包校验失败：main.js 不含 setBounds guard');
    for (const [from] of DATE_FIXES) {
      if (checkMain.includes(from)) throw new Error('打包校验失败：Date 修复未生效');
    }
    const files = asar.listPackage(outAsar);
    const hasMain = files.some((f) => f.replace(/[\\/]+/g, '/').replace(/^\/+/, '') === 'main.js');
    const hasRecord = files.some((f) => f.replace(/[\\/]+/g, '/').replace(/^\/+/, '') === 'js/pages/page-timer-record.js');
    if (!hasMain || !hasRecord) throw new Error('打包校验失败：缺少 main.js 或 page-timer-record.js');
    log('[check] 新 asar 校验通过（条目数: ' + files.length + '）');

    if (dryRun) {
      log('[dry-run] 产物已保存: ' + outAsar);
      log('[dry-run] 未替换原文件。');
    } else {
      fs.copyFileSync(outAsar, asarPath);
      log('[apply] 已替换: ' + asarPath);
      log('[apply] 如遇异常，运行 node patch.cjs --restore 回滚。');
      try { fs.unlinkSync(outAsar); } catch (e) {}
    }
  } finally {
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) {}
  }
}

async function main() {
  const args = process.argv.slice(2);
  const opts = { asar: DEFAULT_ASAR, restore: false, dryRun: false };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--asar') opts.asar = args[++i];
    else if (a === '--restore') opts.restore = true;
    else if (a === '--dry-run') opts.dryRun = true;
    else if (a === '--help' || a === '-h') { usage(); return; }
    else throw new Error('未知参数: ' + a);
  }
  opts.asar = path.resolve(opts.asar);
  if (!fs.existsSync(opts.asar)) throw new Error('找不到 app.asar: ' + opts.asar);
  if (opts.restore) restore(opts.asar);
  else await apply(opts.asar, { dryRun: opts.dryRun });
}

main().catch((e) => {
  console.error('[error]', e.message);
  process.exitCode = 1;
});
