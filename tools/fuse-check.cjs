// Check Electron fuses of a Windows Electron app
// Fuse wire layout: [magic:4][flags:4][sentinel:32]; magic = 05 AE 6B 4F
// Usage: node tools/fuse-check.cjs "D:\app\TomaToDo\TomaToDo.exe"
const fs = require('fs');
const SENTINEL = Buffer.from('dL7pKGdnNz796PbbjQWNKmHXBZaB9tsX', 'latin1');
const MAGIC = Buffer.from([0x05, 0xae, 0x6b, 0x4f]);
const NAMES = [
  'RunAsNode',
  'EnableCookieEncryption',
  'EnableNodeOptionsEnvironmentVariable',
  'EnableNodeCliInspectArguments',
  'EnableEmbeddedAsarIntegrityValidation',
  'OnlyLoadAppFromAsar',
  'LoadBrowserProcessSpecificV8Snapshot',
  'GrantFileProtocolExtraPrivileges',
];

const exePath = process.argv[2] || 'D:/app/TomaToDo/TomaToDo.exe';
const b = fs.readFileSync(exePath);
console.log('exe:', exePath, 'size:', b.length);

let found = 0;
let pos = -1;
while ((pos = b.indexOf(SENTINEL, pos + 1)) !== -1) {
  const magic = b.slice(pos - 8, pos - 4);
  const flags = b.readUInt32LE(pos - 4);
  const ok = magic.equals(MAGIC);
  console.log(`\nsentinel @ ${pos} | magic=${magic.toString('hex')} (${ok ? 'VALID fuse wire' : 'not fuse wire'})`);
  if (ok) {
    found++;
    console.log('flags:', '0x' + flags.toString(16).padStart(8, '0'), '=', flags.toString(2).padStart(8, '0'));
    for (let i = 0; i < 8; i++) {
      console.log(`  bit${i} ${NAMES[i]}: ${(flags >> i) & 1 ? 'ON' : 'off'}`);
    }
    const asarIntegrity = (flags >> 4) & 1;
    console.log('\n>>> EnableEmbeddedAsarIntegrityValidation =', asarIntegrity ? 'ON（改 asar 会被拒！）' : 'off（可安全改写 app.asar）');
  }
}
if (!found) {
  console.log('\n没有找到有效的 fuse wire —— 应用使用 Electron 默认 fuses（默认 asar integrity = off，可改写 app.asar）');
}
