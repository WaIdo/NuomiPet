// 多语言：系统语言匹配、取文字的回退、单复数、切换语言时就地替换数据里的名字、各语言文件是否齐全
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const core = require('../src/shared/i18n');
const C = require('../src/shared/common');
const catalog = require('../src/shared/catalog.json');
const festivals = require('../src/shared/festivals.json');
const themes = require('../src/shared/themes.json');

const LOC = path.join(__dirname, '../src/shared/locales');
const readJson = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const load = (lang) => ({
  ui: core.mergeUi(core.UI_FILES.map((n) => readJson(path.join(LOC, lang, `${n}.json`)))),
  phrases: readJson(path.join(LOC, lang, 'phrases.json')),
  data: readJson(path.join(LOC, lang, 'data.json')),
});
const clone = (x) => JSON.parse(JSON.stringify(x));

test('系统语言匹配', () => {
  assert.equal(core.matchLang('zh-Hans-CN'), 'zh-CN');
  assert.equal(core.matchLang('zh_CN'), 'zh-CN');
  assert.equal(core.matchLang('zh'), 'zh-CN');
  assert.equal(core.matchLang('zh-Hant-TW'), 'zh-TW');
  assert.equal(core.matchLang('zh-HK'), 'zh-TW');
  assert.equal(core.matchLang('ja-JP'), 'ja');
  assert.equal(core.matchLang('en-GB'), 'en');
  assert.equal(core.matchLang('ko-KR'), 'ko');
  assert.equal(core.matchLang('fr-CA'), 'fr');
  assert.equal(core.matchLang('ar-EG'), 'ar');
  assert.equal(core.matchLang('de-DE'), null);
  assert.equal(core.dirOf('ar'), 'rtl');
  assert.equal(core.dirOf('en'), 'ltr');
  assert.equal(core.resolveLang('auto', ['de-DE', 'ja-JP', 'en-US']), 'ja');
  assert.equal(core.resolveLang('auto', ['fr-FR', 'en-US']), 'fr');
  assert.equal(core.resolveLang('auto', ['de-DE']), 'en');
  assert.equal(core.resolveLang('zh-TW', ['en-US']), 'zh-TW');
  assert.equal(core.resolveLang(undefined, ['zh-Hans-CN']), 'zh-CN');
});

test('占位符和英文单复数', () => {
  assert.equal(core.fill('{n} {n|day|days} left', { n: 1 }), '1 day left');
  assert.equal(core.fill('{n} {n|day|days} left', { n: 5 }), '5 days left');
  assert.equal(core.fill('还有 {n} 天', { n: 5 }), '还有 5 天');
  assert.equal(core.fill('{missing}', {}), '{missing}');
  assert.equal(C.fill('{n|cup|cups}', { n: 2 }), 'cups');
});

test('各语言的单复数规则：法语 0 用单数，阿拉伯语六种', () => {
  assert.equal(core.fill('{n} {n|jour|jours}', { n: 0 }, 'fr'), '0 jour');
  assert.equal(core.fill('{n} {n|jour|jours}', { n: 2 }, 'fr'), '2 jours');
  assert.equal(core.fill('{n} {n|day|days}', { n: 0 }, 'en'), '0 days');
  const ar = '{n|zero:z|one:o|two:t|few:f|many:m|other:x}';
  assert.deepEqual([0, 1, 2, 3, 11, 100].map((n) => core.fill(ar, { n }, 'ar')), ['z', 'o', 't', 'f', 'm', 'x']);
  assert.equal(core.fill('{n|one:o|other:x}', { n: 5 }, 'ar'), 'x'); // 没写的类别用 other
  assert.equal(core.fill('{n|a|b|c}', { n: 1 }, 'en'), '{n|a|b|c}'); // 写法不对就原样留着
  C.setLang('fr');
  assert.equal(C.fill('{n} {n|tasse|tasses}', { n: 0 }), '0 tasse');
  C.setLang('en');
  assert.equal(C.fill('{n} {n|cup|cups}', { n: 0 }), '0 cups');
});

test('取文字：缺字按回退链找，全都没有返回 key', () => {
  const bundles = {
    'zh-CN': { ui: { a: '甲', b: '乙', only: '只有中文' }, phrases: { hi: ['你好'] }, data: {} },
    'zh-TW': { ui: { a: '甲（繁）' }, phrases: {}, data: {} },
    en: { ui: { a: 'A', b: 'B {x}' }, phrases: { hi: ['Hi'] }, data: {} },
    ja: { ui: { a: 'エー' }, phrases: {}, data: {} },
    ko: { ui: {}, phrases: {}, data: {} },
  };
  const i = core.createI18n(bundles);
  assert.equal(i.t('a'), '甲');
  i.setLang('zh-TW');
  assert.equal(i.t('a'), '甲（繁）');
  assert.equal(i.t('b'), '乙');
  i.setLang('ja');
  assert.equal(i.t('a'), 'エー');
  assert.equal(i.t('b', { x: 1 }), 'B 1'); // 日语 → 英语
  assert.equal(i.t('only'), '只有中文');
  assert.deepEqual(i.lines('hi'), ['Hi']);
  assert.equal(i.t('nope.nothing'), 'nope.nothing');
  i.setLang('ko');
  assert.equal(i.t('a'), 'A'); // 韩语 → 英语
  assert.equal(i.setLang('xx'), true); // 不认识的语言回到简体中文
  assert.equal(i.lang, 'zh-CN');
});

test('切换语言时，数据里的名字和台词就地替换', () => {
  const zh = load('zh-CN');
  const live = { phrases: {}, catalog: clone(catalog), festivals: clone(festivals), themes: clone(themes) };
  const bundles = {
    'zh-CN': zh,
    'zh-TW': { ui: {}, phrases: {}, data: {} },
    en: { ui: {}, phrases: { hello: ['Hi there'] }, data: { species: { cat: 'Kitty' }, foods: { strawberry: { name: 'Strawberry' } } } },
    ja: { ui: {}, phrases: {}, data: {} },
  };
  const i = core.createI18n(bundles, live);
  const cat = live.catalog.species.find((s) => s.id === 'cat');
  const berry = live.catalog.foods.find((f) => f.id === 'strawberry');
  assert.equal(cat.name, zh.data.species.cat);
  assert.deepEqual(live.phrases.hello, zh.phrases.hello);
  i.setLang('en');
  assert.equal(cat.name, 'Kitty');
  assert.equal(berry.name, 'Strawberry');
  assert.equal(berry.line, zh.data.foods.strawberry.line); // 英文没写 line，回退到简体
  assert.deepEqual(live.phrases.hello, ['Hi there']);
  assert.deepEqual(live.phrases.poke, zh.phrases.poke); // 英文没有的组回退到简体
  i.setLang('zh-CN');
  assert.equal(cat.name, zh.data.species.cat);
  const fest = C.festivalOf(live.festivals, new Date(2026, 1, 17)); // 2026 年春节
  assert.equal(fest.id, 'springFestival');
  assert.equal(fest.name, zh.data.festivals.springFestival.name);
  assert.ok(fest.text);
});

test('简体中文的数据名字齐全：目录、节日、主题的每个 id 都有名字', () => {
  const { data } = load('zh-CN');
  for (const kind of ['species', 'palettes', 'accessories', 'markings', 'sizes', 'moods']) {
    for (const it of catalog[kind]) assert.ok(data[kind][it.id], `${kind}.${it.id}`);
  }
  for (const f of catalog.foods) assert.ok(data.foods[f.id] && data.foods[f.id].name && data.foods[f.id].line, `foods.${f.id}`);
  for (const l of catalog.levels) assert.ok(data.levels[l.level], `levels.${l.level}`);
  for (const f of Object.values(festivals.fixed)) assert.ok(data.festivals[f.id] && data.festivals[f.id].text, f.id);
  for (const id of Object.keys(festivals.lunarInfo)) assert.ok(data.festivals[id] && data.festivals[id].text, id);
  for (const id of new Set(Object.values(festivals.lunar))) assert.ok(festivals.lunarInfo[id], `lunar ${id}`);
  for (const th of themes) assert.ok(data.themes[th.id], `themes.${th.id}`);
  assert.ok(data.defaults.petName && data.defaults.nickname);
});

test('各语言文件都是合法的 JSON，界面文字文件都是对象', () => {
  for (const { id } of core.LANGS) {
    for (const n of [...core.UI_FILES, 'phrases', 'data']) {
      const v = readJson(path.join(LOC, id, `${n}.json`));
      assert.equal(typeof v, 'object', `${id}/${n}.json`);
      assert.ok(!Array.isArray(v), `${id}/${n}.json`);
    }
  }
});
