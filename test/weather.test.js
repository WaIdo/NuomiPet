// 天气：描述和建议按当前语言现拼（缓存里只存数值），查城市时地名用当前语言
const test = require('node:test');
const assert = require('node:assert');
const Module = require('module');

// 假的 electron：net.fetch 返回固定的数据，并记下请求的地址
const requests = [];
let offline = false;
const forecast = {
  current: { temperature_2m: 20.4, apparent_temperature: 19.6, weather_code: 61 },
  daily: {
    weather_code: [61, 0],
    temperature_2m_max: [23.2, 25.4],
    temperature_2m_min: [18.1, 16.3],
    precipitation_probability_max: [80, 0],
    uv_index_max: [3, 5],
  },
};
const fakeElectron = {
  net: {
    fetch: async (url) => {
      requests.push(url);
      if (offline) throw new Error('offline');
      const body = url.includes('geocoding') ? { results: [{ name: 'Shanghai', latitude: 31.2, longitude: 121.5 }] } : forecast;
      return { ok: true, status: 200, json: async () => body };
    },
  },
};
const origLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === 'electron') return fakeElectron;
  return origLoad.call(this, request, parent, isMain);
};

const weather = require('../src/main/weather');
const i18n = require('../src/main/i18n');

const city = { lat: 31.2, lon: 121.5, city: '上海' };

test('天气：描述、emoji 和建议', async () => {
  const w = await weather.current(city, true);
  assert.equal(w.ok, true);
  assert.equal(w.city, '上海');
  assert.equal(w.temp, 20);
  assert.equal(w.code, 61);
  assert.equal(w.desc, '小雨');
  assert.equal(w.emoji, '🌧️');
  assert.equal(w.max, 23);
  assert.equal(w.min, 18);
  assert.equal(w.advice, '可能会下雨，出门记得带伞☂️');
  assert.deepEqual(w.tomorrow, { desc: '晴', emoji: '☀️', max: 25, min: 16, rainProb: 0 });
});

test('天气：缓存里的结果也按现在的语言拼，不重新联网', async () => {
  await weather.current(city, true);
  const n = requests.length;
  const real = i18n.data;
  i18n.data = (key) => `<${key}>`; // 假装换了一种语言
  try {
    const w = await weather.current(city);
    assert.equal(requests.length, n);
    assert.equal(w.desc, '<weather.codes.61>');
    assert.equal(w.advice, '<weather.advice.rain>');
    assert.equal(w.tomorrow.desc, '<weather.codes.0>');
  } finally {
    i18n.data = real;
  }
  assert.equal((await weather.current(city)).desc, '小雨');
});

test('查城市：地名的语言跟着界面语言', async () => {
  try {
    for (const [lang, geo] of [['zh-CN', 'zh'], ['zh-TW', 'zh'], ['en', 'en'], ['ja', 'ja'], ['ko', 'ko'], ['fr', 'fr'], ['ar', 'ar']]) {
      i18n.setLang(lang);
      const list = await weather.search('上海');
      assert.equal(list[0].name, 'Shanghai');
      assert.match(requests.at(-1), new RegExp(`[?&]language=${geo}&`));
    }
  } finally {
    i18n.setLang('zh-CN');
  }
  // 以后加了 Open-Meteo 不认识的语言：用英文
  const real = i18n.lang;
  i18n.lang = () => 'xx';
  try {
    await weather.search('上海');
    assert.match(requests.at(-1), /[?&]language=en&/);
  } finally {
    i18n.lang = real;
  }
});

test('没设城市、联网失败时的提示', async () => {
  assert.deepEqual(await weather.current({ lat: null, lon: null }), { ok: false, error: '还没有设置城市' });
  offline = true;
  try {
    assert.deepEqual(await weather.current(city, true), { ok: false, error: '天气获取失败：offline' });
  } finally {
    offline = false;
  }
});
