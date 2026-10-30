import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../../src/worker.js';

const env = { ASSETS: { fetch: async req => new Response('asset:' + new URL(req.url).pathname) } };
const call = path => worker.fetch(new Request('https://cosmoswong.com' + path), env);

test('旅游计划旧栏目地址统一跳到工具箱旅行分组', async () => {
  for (const path of ['/trips', '/trips/', '/trips.html', '/trips.html/', '/trips?from=bookmark']) {
    const response = await call(path);
    assert.equal(response.status, 301, path);
    assert.equal(response.headers.get('location'), '/tools#travel', path);
  }
});

test('旅行子页面和原有公开页面仍交给静态资源处理', async () => {
  for (const path of ['/trips/2027-spring-tickets/', '/tools', '/portfolio', '/attendance']) {
    const response = await call(path);
    assert.equal(response.status, 200, path);
    assert.equal(await response.text(), 'asset:' + path);
  }
});
