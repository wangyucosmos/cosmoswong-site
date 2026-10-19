import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const base = new URL('../../public/trips/2027-spring-tickets/', import.meta.url);
// 页面是单文件：JS 内联在 index.html 的 <script> 里，快照日期清单以 data: URI 内嵌。
const html = await readFile(new URL('index.html', base), 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
// 从内嵌的 base64 清单里解析出日期列表（按页面逻辑倒序）。
const b64 = script.match(/base64,([A-Za-z0-9+/=]+)/)[1];
const manifestDates = JSON.parse(Buffer.from(b64, 'base64').toString('utf8')).dates.slice().sort().reverse();
const latest = manifestDates[0];
const snapshot = JSON.parse(await readFile(new URL(`assets/snapshots/${latest}.json`, base), 'utf8'));

async function boot(fail = false) {
  const nodes = new Map();
  function node(id) {
    if (!nodes.has(id)) nodes.set(id, { value: 'all', textContent: '', innerHTML: '', style: {}, children: [], events: {},
      addEventListener(type, handler) { this.events[type] = handler; },
      appendChild(child) { this.children.push(child); }, setAttribute() {} });
    return nodes.get(id);
  }
  const requests = [];
  const context = vm.createContext({ document: { getElementById: node, createElement: () => ({ }), querySelectorAll: () => [] },
    AbortController, setTimeout, clearTimeout,
    fetch: async (url) => {
      requests.push(url);
      if (fail) throw new Error('Network unavailable');
      let body;
      if (url.startsWith('data:')) {
        body = Buffer.from(url.split(',')[1], 'base64').toString('utf8');
      } else {
        body = await readFile(new URL(url, base), 'utf8');
      }
      return { ok: true, json: async () => JSON.parse(body) };
    } });
  // Await the same initialization used by the page.
  await vm.runInContext(script.replace(/init\(\);\s*$/, 'init();'), context);
  return { context, node, requests };
}

test('loads embedded manifest and snapshots, renders cities and switches dates', async () => {
  const { context, node, requests } = await boot();
  assert.equal(requests[0].startsWith('data:application/json;base64,'), true);
  assert.deepEqual(requests.slice(1), manifestDates.map(d => `assets/snapshots/${d}.json`));
  assert.equal(node('count').textContent, snapshot.cities.length);
  assert.match(node('snapshot-label').textContent, new RegExp(latest));
  assert.ok(node('tbody').innerHTML.includes(snapshot.cities[0].name));
  node('snapshot-select').value = latest;
  await node('snapshot-select').events.change();
  assert.equal(context.currentSnapshotDate, latest);
});

test('city and duration filters, price ordering and details remain functional', async () => {
  const { context, node } = await boot();
  const first = snapshot.cities[0];
  node('city-filter').value = first.dest;
  node('city-filter').events.change();
  assert.equal(node('count').textContent, 1);
  context.toggle(first.dest);
  assert.equal(context.expanded[first.dest], true);
  node('city-filter').value = 'all';
  node('duration-filter').value = 'under-8';
  node('duration-filter').events.change();
  assert.equal(node('count').textContent, snapshot.cities.filter(c => context.matchesDuration(c, 'under-8')).length);
  node('duration-filter').value = 'all';
  node('sort').events.click();
  assert.equal(context.ascending, false);
  const ordered = snapshot.cities.slice().sort((a,b) => b.cny - a.cny);
  const html = node('tbody').innerHTML;
  assert.ok(html.indexOf('data-dest="' + ordered[0].dest + '"') < html.indexOf('data-dest="' + ordered.at(-1).dest + '"'));
});

test('failed requests replace loading state with an actionable error', async () => {
  const { node } = await boot(true);
  assert.match(node('snapshot-label').textContent, /载入失败|暂无/);
  assert.match(node('source-note').textContent, /刷新|暂无/);
  assert.equal(node('snapshot-select').disabled, true);
  assert.match(node('empty').textContent, /暂无榜单数据/);
});
