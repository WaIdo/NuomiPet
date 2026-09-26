// 日期解析和主题选择
const test = require('node:test');
const assert = require('node:assert');
const C = require('../src/shared/common');
const catalog = require('../src/shared/catalog.json');
const themes = require('../src/shared/themes.json');

test('parseKey 拒绝不存在的日期', () => {
  assert.equal(C.parseKey('2023-02-29'), null);
  assert.deepEqual(C.parseKey('2024-02-29'), { y: 2024, m: 2, d: 29 });
  assert.deepEqual(C.parseKey('02-29'), { y: null, m: 2, d: 29 });
  assert.equal(C.parseKey('2026-13-01'), null);
  assert.equal(C.parseKey('04-31'), null);
});

test('小窝颜色：固定主题、跟宠物走、默认值', () => {
  assert.equal(C.resolveTheme({ settings: { theme: 'sky' }, pet: { color: 'mint' } }, catalog), 'sky');
  assert.equal(C.resolveTheme({ settings: { theme: 'auto' }, pet: { color: 'mint' } }, catalog), 'mint');
  assert.equal(C.resolveTheme({ settings: { theme: 'auto' }, pet: { color: 'custard' } }, catalog), 'butter');
  assert.equal(C.resolveTheme({ settings: {}, pet: {} }, catalog), 'sakura');
});

test('每种宠物配色都对应一个存在的主题', () => {
  const ids = new Set(themes.map((t) => t.id));
  for (const p of catalog.palettes) assert.ok(ids.has(p.theme), `${p.id} -> ${p.theme}`);
});
