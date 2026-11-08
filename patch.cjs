#!/usr/bin/env node
'use strict';
/*
 * tomatodo-mini-window-patch · main tool
 * 给 番茄ToDo（TomaToDo，Electron）的 app.asar 注入 setBounds 防御垫。
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
const MARKER = 'TOMATODO_PATCH_GUARD_MARKER_V1';
const DEFAULT_ASAR = process.env.TOMATODO_ASAR || 'D:\\app\\TomaToDo\\resources\\app.asar';

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

async function apply(asarPath, { dryRun }) {
  if (!dryRun && readMainFromAsar(asarPath).includes(MARKER)) {
    console.log('[skip] 该 app.asar 已经打过补丁（找到标记）。如需重打，请先 --restore。');
    return;
  }
  const guard = fs.readFileSync(GUARD_PATH, 'utf8');
  const ts = stamp();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tomatodo-mini-window-patch-'));
  const outAsar = dryRun
    ? path.join(ROOT, 'tmp', 'app.asar.patched-' + ts + '.asar')
    : asarPath + '.new-' + ts;

  try {
    if (!dryRun) {
      const backup = asarPath + '.bak-' + ts;
      fs.copyFileSync(asarPath, backup);
      console.log('[backup] 原文件已备份:', backup);
    } else {
      console.log('[dry-run] 不会修改原文件');
    }

    console.log('[unpack] 解包到:', tmp);
    asar.extractAll(asarPath, tmp);

    const mainPath = path.join(tmp, 'main.js');
    const original = fs.readFileSync(mainPath, 'utf8');
    const next = '/* tomatodo-mini-window-patch v1.0.0 | ' + MARKER + ' */\n' + guard + '\n' + original;
    fs.writeFileSync(mainPath, next, 'utf8');
    console.log('[inject] main.js 头部已注入防御垫，长度:', original.length, '->', next.length);

    if (dryRun) fs.mkdirSync(path.join(ROOT, 'tmp'), { recursive: true });
    console.log('[pack] 正在重新打包 asar...');
    await asar.createPackage(tmp, outAsar);

    const check = asar.extractFile(outAsar, 'main.js').toString('utf8');
    if (!check.includes(MARKER)) throw new Error('打包校验失败：新 asar 的 main.js 不含补丁标记');
    if (!check.includes('setBounds')) throw new Error('打包校验失败：注入内容异常');
    const files = asar.listPackage(outAsar);
    const hasMain = files.some((f) => f.replace(/[\\/]+/g, '/').replace(/^\/+/, '') === 'main.js');
    if (!hasMain) throw new Error('打包校验失败：新 asar 缺少 main.js');
    console.log('[check] 新 asar 校验通过（条目数:', files.length, '）');

    if (dryRun) {
      console.log('[dry-run] 产物已保存:', outAsar);
      console.log('[dry-run] 未替换原文件。');
    } else {
      fs.copyFileSync(outAsar, asarPath);
      console.log('[apply] 已替换:', asarPath);
      console.log('[apply] 如遇异常，运行 node patch.cjs --restore 回滚。');
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
