import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../../public/assets/home/world.js', import.meta.url), 'utf8');
function preview({ width = 390, coarse = true, reduce = false } = {}) {
  const nodes = new Map(), calls = [], stored = new Map();
  let clock = 0;
  function node() {
    const classes = new Set(), handlers = new Map();
    return {
      children: [], style: {}, dataset: {}, offsetTop: 0,
      classList: { add: c => classes.add(c), contains: c => classes.has(c), toggle: (c, on) => on ? classes.add(c) : classes.delete(c) },
      setAttribute() {}, appendChild(el) { this.children.push(el); },
      addEventListener(type, fn) { handlers.set(type, fn); },
      emit(type, event) { handlers.get(type)?.(event); }, has: type => handlers.has(type)
    };
  }
  const document = {
    documentElement: node(), createElement: node,
    querySelector: key => { if (!nodes.has(key)) nodes.set(key, node()); return nodes.get(key); },
    querySelectorAll: () => []
  };
  const window = {};
  vm.runInNewContext(source, {
    window, document, innerHeight: 800, innerWidth: width, navigator: { deviceMemory: 8 },
    matchMedia: q => ({ matches: q.includes('reduced-motion') ? reduce :
      (!q.includes('max-width') || width <= 820) && (!q.includes('coarse') || coarse) && (!q.includes('hover: none') || coarse) }),
    localStorage: { getItem: k => stored.get(k) ?? null, setItem: (k, v) => stored.set(k, v) },
    performance: { now: () => clock }, scrollTo: options => calls.push(options), console
  });
  const stage = document.querySelector('#stage'), state = window.CW.state;
  const touch = (x, y, id = 1) => ({ clientX: x, clientY: y, identifier: id });
  return { stage, calls, stored,
    chapter(k) { state.sys = k * 800; window.CW.world.update(); },
    start(x = 300, y = 300) { clock = 0; stage.emit('touchstart', { touches: [touch(x, y)] }); },
    end(x = 100, y = 300, time = 200, id = 1) { clock = time; stage.emit('touchend', { touches: [], changedTouches: [touch(x, y, id)] }); },
    touch
  };
}

test('手机左右滑动按章节前进、后退，地球可回全景，末章不越界', () => {
  const p = preview();
  for (const [from, x, target] of [[1, 100, 2], [2, 500, 1], [1, 500, 0], [3, 100, 4]]) {
    p.chapter(from); p.start(); p.end(x);
    assert.equal(p.calls.at(-1).top, target * 800);
    assert.equal(p.calls.at(-1).behavior, 'smooth');
  }
  const count = p.calls.length;
  p.chapter(4); p.start(); p.end();
  p.chapter(0); p.start(); p.end();
  assert.equal(p.calls.length, count);
  assert.equal(p.stored.get('cw-swiped'), '1');
});

test('上下滚动、短距离或长按不误切章节，也不记录已滑动', () => {
  const p = preview(); p.chapter(1);
  for (const [x, y, ms] of [[290, 500, 200], [270, 300, 200], [100, 300, 1000], [200, 400, 200]]) {
    p.start(); p.end(x, y, ms);
  }
  assert.equal(p.calls.length, 0);
  assert.equal(p.stored.size, 0);
});

test('触摸被取消、多指操作和非原手指结束都不触发跳转', () => {
  const p = preview(); p.chapter(1);
  p.start(); p.stage.emit('touchcancel', {}); p.end();
  p.start(); p.stage.emit('touchmove', { touches: [p.touch(300, 300), p.touch(200, 300, 2)] }); p.end();
  p.start(); p.end(100, 300, 200, 2);
  p.start(); p.stage.emit('touchend', { touches: [p.touch(300, 300)], changedTouches: [p.touch(100, 300, 2)] }); p.end();
  assert.equal(p.calls.length, 0);
  p.start(); p.end();
  assert.equal(p.calls.at(-1).top, 1600);
});

test('桌面及大屏触摸设备不启用手机横滑，减少动效时直接定位', () => {
  for (const options of [{ width: 1440, coarse: false }, { width: 1440, coarse: true }, { width: 390, coarse: false }]) {
    const p = preview(options);
    assert.equal(p.stage.has('touchstart'), false);
    assert.equal(p.stage.children.length, 0);
  }
  const p = preview({ reduce: true }); p.chapter(1); p.start(); p.end();
  assert.equal(p.calls.at(-1).behavior, 'auto');
});
