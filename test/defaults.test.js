// 默认数据：名字和称呼留空（显示时用当前语言的默认值）、内置的悄悄话、老数据迁移和送礼配置的值（各只做一次）
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createDefaults, migrateLegacyNames, fillFromGift, upgradeData } = require('../src/main/defaults');
const { Store } = require('../src/main/store');
const i18n = require('../src/main/i18n');
const zh = require('../src/shared/locales/zh-CN/data.json');

const GIFT = { sender: '豪豪', togetherSince: '2026-09-25', birthday: '2002-06-08' };
const tmpFile = (tag) => path.join(os.tmpdir(), `mochi-${tag}-${process.pid}-${Math.random().toString(36).slice(2)}.json`);

test('名字和称呼默认留空，显示时用当前语言的默认值', () => {
  const d = createDefaults({});
  assert.equal(d.pet.name, '');
  assert.equal(d.owner.nickname, '');
  assert.equal(i18n.petName(d), '糯米');
  assert.equal(i18n.nickname(d), '宝贝');
  const g = createDefaults({ petName: '团子', nickname: '小宝贝' });
  assert.equal(i18n.petName(g), '团子');
  assert.equal(i18n.nickname(g), '小宝贝');
});

test('悄悄话：送礼配置里没写就用内置的，写了就只用配置里的', () => {
  const texts = (d) => d.love.notes.map((n) => n.text);
  assert.equal(zh.defaults.notes.length, 5);
  assert.deepEqual(texts(createDefaults({})), zh.defaults.notes);
  assert.deepEqual(texts(createDefaults({ notes: [] })), zh.defaults.notes);
  assert.deepEqual(texts(createDefaults({ notes: ['只说这一句', ''] })), ['只说这一句']);
  assert.ok(createDefaults({}).love.notes.every((n) => n.id));
});

test('送礼配置里的纪念日没写名字，用默认的名字', () => {
  const d = createDefaults({ anniversaries: [{ date: '2024-05-20' }, { name: '第一次约会', date: '2023-05-20' }] });
  assert.deepEqual(d.love.anniversaries.map((a) => a.name), ['纪念日', '第一次约会']);
});

test('老数据：以前默认的「糯米」「宝贝」改成空，只做一次，之后她改回「糯米」不会再被清掉', () => {
  const old = { pet: { name: '糯米', species: 'cat' }, owner: { nickname: '宝贝', sender: '豪豪' }, runtime: {} };
  assert.equal(migrateLegacyNames(old), true);
  assert.equal(old.pet.name, '');
  assert.equal(old.owner.nickname, '');
  assert.equal(old.pet.species, 'cat');
  assert.equal(old.owner.sender, '豪豪');
  assert.equal(old.runtime.namesMigrated, true);
  // 做过以后她特意把名字、称呼改回「糯米」「宝贝」：不再清掉
  old.pet.name = '糯米';
  old.owner.nickname = '宝贝';
  assert.equal(migrateLegacyNames(old), false);
  assert.equal(old.pet.name, '糯米');
  assert.equal(old.owner.nickname, '宝贝');
  // 自己起的名字不动，也记下做过了
  const mine = { pet: { name: '团子' }, owner: { nickname: '小糯米' }, runtime: {} };
  assert.equal(migrateLegacyNames(mine), true);
  assert.deepEqual(mine, { pet: { name: '团子' }, owner: { nickname: '小糯米' }, runtime: { namesMigrated: true } });
  // 导入的备份：标记不是 true 就做一次（旧备份里可能连 runtime 都没有）；是 true 就不动
  const oldBackup = { pet: { name: '糯米' }, owner: { nickname: '宝贝' } };
  assert.equal(migrateLegacyNames(oldBackup), true);
  assert.deepEqual(oldBackup, { pet: { name: '' }, owner: { nickname: '' }, runtime: { namesMigrated: true } });
  const newBackup = { pet: { name: '糯米' }, owner: { nickname: '宝贝' }, runtime: { namesMigrated: true } };
  assert.equal(migrateLegacyNames(newBackup), false);
  assert.equal(newBackup.pet.name, '糯米');
  assert.equal(newBackup.owner.nickname, '宝贝');
  assert.equal(migrateLegacyNames(null), false);
});

test('新装的用户：名字不迁移，送礼配置里写的名字就算是「糯米」也留着', () => {
  const file = tmpFile('fresh');
  const gift = { ...GIFT, petName: '糯米', nickname: '宝贝' };
  try {
    const store = new Store(file, createDefaults(gift));
    assert.equal(store.isFresh, true);
    assert.equal(upgradeData(store, gift), true);
    assert.equal(store.get('pet.name'), '糯米');
    assert.equal(store.get('owner.nickname'), '宝贝');
    assert.equal(store.get('owner.sender'), '豪豪');
    assert.equal(store.get('runtime.namesMigrated'), true);
    assert.equal(store.get('runtime.giftFilled'), true);
  } finally {
    fs.rmSync(file, { force: true });
  }
});

test('新装的用户：送礼配置里的署名、在一起的日子和生日直接带上', () => {
  const d = createDefaults(GIFT);
  assert.equal(d.owner.sender, '豪豪');
  assert.equal(d.love.togetherSince, '2026-09-25');
  assert.equal(d.love.birthday, '2002-06-08');
  assert.equal(d.runtime.giftFilled, false);
  assert.equal(fillFromGift(d, GIFT), true);
  assert.equal(d.runtime.giftFilled, true);
  assert.equal(d.owner.sender, '豪豪');
});

test('老用户：署名、在一起的日子、生日还空着就补上，只补一次，填过的不覆盖', () => {
  const data = { owner: { sender: '' }, love: { togetherSince: '', birthday: '' }, runtime: { giftFilled: false } };
  assert.equal(fillFromGift(data, GIFT), true);
  assert.equal(data.owner.sender, '豪豪');
  assert.equal(data.love.togetherSince, '2026-09-25');
  assert.equal(data.love.birthday, '2002-06-08');
  assert.equal(data.runtime.giftFilled, true);
  // 她后来自己清空了：不再填回去
  data.owner.sender = '';
  data.love.togetherSince = '';
  data.love.birthday = '';
  assert.equal(fillFromGift(data, GIFT), false);
  assert.equal(data.owner.sender, '');
  assert.equal(data.love.togetherSince, '');
  assert.equal(data.love.birthday, '');
  // 自己填过的不覆盖，只补空的那几项
  const mine = { owner: { sender: '小明' }, love: { togetherSince: '', birthday: '2001-01-01' }, runtime: {} };
  assert.equal(fillFromGift(mine, GIFT), true);
  assert.equal(mine.owner.sender, '小明');
  assert.equal(mine.love.togetherSince, '2026-09-25');
  assert.equal(mine.love.birthday, '2001-01-01');
  // 送礼配置里没写：什么都不补，但也算补过了
  const none = { owner: { sender: '' }, love: { togetherSince: '' }, runtime: {} };
  assert.equal(fillFromGift(none, {}), true);
  assert.equal(none.owner.sender, '');
  assert.equal(none.runtime.giftFilled, true);
  assert.equal(fillFromGift(null, GIFT), false);
});

test('老用户的数据文件：读进来以后迁移名字、补上送礼配置的值，存下标记，下次启动不再做', () => {
  const file = tmpFile('old');
  // 旧版的数据：名字、称呼存的是当时的默认值，署名和在一起的日子是空的，也没有这两个标记
  const old = createDefaults({});
  old.pet.name = '糯米';
  old.owner.nickname = '宝贝';
  delete old.runtime.namesMigrated;
  delete old.runtime.giftFilled;
  fs.writeFileSync(file, JSON.stringify(old));
  try {
    const store = new Store(file, createDefaults(GIFT));
    assert.equal(store.isFresh, false);
    // 缺的标记按默认值补成 false：当成还没做过
    assert.equal(store.get('runtime.namesMigrated'), false);
    assert.equal(store.get('runtime.giftFilled'), false);
    assert.equal(upgradeData(store, GIFT), true);
    store.saveNow();
    assert.equal(store.get('pet.name'), '');
    assert.equal(store.get('owner.nickname'), '');
    assert.equal(store.get('owner.sender'), '豪豪');
    assert.equal(store.get('love.togetherSince'), '2026-09-25');
    assert.equal(store.get('love.birthday'), '2002-06-08');
    // 她换了语言以后特意把名字改回「糯米」，又清空了署名，然后重新启动
    store.set('pet.name', '糯米');
    store.set('owner.sender', '');
    store.saveNow();
    const again = new Store(file, createDefaults(GIFT));
    assert.equal(again.get('runtime.namesMigrated'), true);
    assert.equal(again.get('runtime.giftFilled'), true);
    assert.equal(upgradeData(again, GIFT), false);
    assert.equal(again.get('pet.name'), '糯米');
    assert.equal(again.get('owner.sender'), '');
  } finally {
    fs.rmSync(file, { force: true });
  }
});
