// 日期解析、主题选择、emoji 兼容
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

test('swapEmoji：缺字的 emoji 换成老的，数据就地替换', () => {
  const missing = new Set(['🧋']);
  assert.equal(C.swapEmoji('全糖去冰🧋🧋', missing), '全糖去冰🥤🥤');
  assert.equal(C.swapEmoji('全糖去冰🧋', new Set()), '全糖去冰🧋');
  const data = { foods: [{ id: 'boba', emoji: '🧋', price: 3 }], tea: ['🧋 来啦'] };
  assert.strictEqual(C.swapEmoji(data, missing), data);
  assert.deepEqual(data, { foods: [{ id: 'boba', emoji: '🥤', price: 3 }], tea: ['🥤 来啦'] });
});

test('emoji 替代表：替代品和原来的不同，而且自己不会再被替换', () => {
  for (const [from, to] of Object.entries(C.EMOJI_FALLBACK)) {
    assert.ok(to && to !== from);
    assert.ok(!(to in C.EMOJI_FALLBACK), to);
  }
  // 零食目录里的奶茶会被替换
  assert.ok(catalog.foods.some((f) => f.emoji in C.EMOJI_FALLBACK));
});

test('今日运势每天都是满星，宜忌每天按种子挑', () => {
  const good = ['a', 'b', 'c', 'd', 'e'];
  const bad = ['x', 'y', 'z'];
  for (let d = 1; d <= 60; d++) {
    const f = C.fortune(`2026-10-${d}` + '宝贝', good, bad); // i18n-ignore
    assert.strictEqual(f.stars, '★★★★★');
    assert.strictEqual(f.good.length, 2);
    assert.strictEqual(f.bad.length, 1);
  }
  assert.deepStrictEqual(C.fortune('seed', good, bad), C.fortune('seed', good, bad));
});
