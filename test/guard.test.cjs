'use strict';
// 单元测试：不依赖 Electron，mock BrowserWindow 验证 guard 的拦截逻辑。
// 运行：node test/guard.test.cjs
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const guardPath = path.join(__dirname, '..', 'patch', 'guard.js');
const src = fs.readFileSync(guardPath, 'utf8');

function makeMock() {
  const calls = [];
  class FakeBW {
    constructor() {
      this.current = { x: 10, y: 20, width: 300, height: 200 };
    }
    getBounds() { return { ...this.current }; }
    setBounds(bounds, animate) {
      calls.push({ bounds: JSON.parse(JSON.stringify(bounds)), animate });
      this.current = { ...this.current, ...bounds };
    }
  }
  return { FakeBW, calls };
}

function runGuard(FakeBW, logs, sharedGlobal) {
  const sandbox = {
    require: (m) => (m === 'electron' ? { BrowserWindow: FakeBW } : require(m)),
    console: { warn: (m) => logs.push(String(m)) },
    __TOMATO_GLOBAL__: sharedGlobal,
  };
  vm.createContext(sandbox);
  // 让 guard 看到的 globalThis 就是共享对象，便于验证幂等
  sandbox.globalThis = sharedGlobal;
  vm.runInContext(src, sandbox, { filename: 'guard.js' });
  return sandbox;
}

function main() {
  const { FakeBW, calls } = makeMock();
  const logs = [];
  const sharedGlobal = {};
  runGuard(FakeBW, logs, sharedGlobal);

  const w = new FakeBW();

  // 正常调用：透传，且整数化
  w.setBounds({ x: 1, y: 2, width: 300, height: 200 });
  assert.strictEqual(calls.length, 1);
  assert.deepStrictEqual(calls[0].bounds, { x: 1, y: 2, width: 300, height: 200 });

  // 小数 -> 四舍五入
  w.setBounds({ x: 1.6, y: 2.4, width: 300.7, height: 200.2 });
  assert.deepStrictEqual(calls[1].bounds, { x: 2, y: 2, width: 301, height: 200 });

  // NaN：回退到当前 bounds，不抛、不传 NaN
  w.setBounds({ x: NaN, y: 2, width: 300, height: 200 });
  assert.strictEqual(calls.length, 3);
  assert.ok(Number.isFinite(calls[2].bounds.x), 'NaN 必须被回退为有限值');

  // undefined 字段：同样回退
  w.setBounds({ x: undefined, y: 2, width: 300, height: 200 });
  assert.strictEqual(calls.length, 4);
  assert.ok(Number.isFinite(calls[3].bounds.x));

  // 负宽高：修正为 >= 1
  w.setBounds({ x: 0, y: 0, width: -5, height: 200 });
  assert.strictEqual(calls.length, 5);
  assert.strictEqual(calls[4].bounds.width, 1);

  // 非对象：拦截，不调用原生
  const before = calls.length;
  w.setBounds(null);
  assert.strictEqual(calls.length, before);

  // getBounds 抛异常 + 非法字段：拦截
  const broken = new FakeBW();
  broken.getBounds = () => { throw new Error('boom'); };
  const before2 = calls.length;
  broken.setBounds({ x: NaN, y: 2, width: 300, height: 200 });
  assert.strictEqual(calls.length, before2);

  // 幂等：同一个 globalThis 下重复注入，不再二次包装
  runGuard(FakeBW, logs, sharedGlobal);
  const before3 = calls.length;
  w.setBounds({ x: 3, y: 4, width: 200, height: 100 });
  assert.strictEqual(calls.length, before3 + 1);
  assert.strictEqual(w.setBounds.__tomatodoPatch, true);

  console.log('guard.test.cjs: all tests passed (' + logs.length + ' warn logs)');
}

main();
