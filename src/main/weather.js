// 天气：Open-Meteo（免费、无需 key）。只在用户开启并选择城市后联网。
// 缓存里只存数值（天气代码、温度、降水概率……），描述和建议在返回时按当前语言现拼，文字在 data.json 的 weather 下。
const { net } = require('electron');
const i18n = require('./i18n');

// WMO 天气代码 → emoji（描述是 data.json 里的 weather.codes）
const EMOJI = {
  0: '☀️',
  1: '🌤️',
  2: '⛅',
  3: '☁️',
  45: '🌫️',
  48: '🌫️',
  51: '🌦️',
  53: '🌦️',
  55: '🌦️',
  56: '🌧️',
  57: '🌧️',
  61: '🌧️',
  63: '🌧️',
  65: '🌧️',
  66: '🌧️',
  67: '🌧️',
  71: '🌨️',
  73: '🌨️',
  75: '❄️',
  77: '🌨️',
  80: '🌦️',
  81: '🌧️',
  82: '⛈️',
  85: '🌨️',
  86: '❄️',
  95: '⛈️',
  96: '⛈️',
  99: '⛈️',
};

const RAINY = new Set([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82, 95, 96, 99]);
const SNOWY = new Set([71, 73, 75, 77, 85, 86]);

// 查城市时，地名用哪种语言（Open-Meteo 的 language 参数；没列出的语言用英文）
const GEO_LANG = { 'zh-CN': 'zh', 'zh-TW': 'zh', en: 'en', ja: 'ja', ko: 'ko', fr: 'fr', ar: 'ar' };

let cache = null; // { key, at, raw }，raw 见 current()

async function getJson(url) {
  const res = await net.fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return res.json();
}

function withTimeout(promise, ms = 10000) {
  let timer;
  const timeout = new Promise((_, rej) => {
    timer = setTimeout(() => rej(new Error('timeout')), ms);
  });
  // 先有结果就把计时器清掉，不留着空转
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function search(name) {
  const q = String(name || '').trim();
  if (!q) return [];
  const lang = GEO_LANG[i18n.lang()] || 'en';
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=8&language=${lang}&format=json`;
  const data = await withTimeout(getJson(url));
  return (data.results || []).map((r) => ({
    name: r.name,
    admin1: r.admin1 || '',
    country: r.country || '',
    latitude: r.latitude,
    longitude: r.longitude,
  }));
}

function describe(code) {
  const emoji = EMOJI[code];
  if (!emoji) return { desc: i18n.data('weather.unknown'), emoji: '🌈' };
  return { desc: i18n.data(`weather.codes.${code}`), emoji };
}

function advise({ code, max, min, rainProb, uv }) {
  let key = 'nice';
  if (RAINY.has(code) || rainProb >= 50) key = 'rain';
  else if (SNOWY.has(code)) key = 'snow';
  else if (max >= 33) key = 'hot';
  else if (min <= 5) key = 'cold';
  else if (uv >= 7) key = 'uv';
  else if (max - min >= 10) key = 'swing';
  return i18n.data(`weather.advice.${key}`);
}

// 数值 → 返回给页面和宠物的结果（当前语言）
function build(raw) {
  const { today, tomorrow } = raw;
  return {
    ok: true,
    city: raw.city,
    temp: raw.temp,
    feels: raw.feels,
    code: raw.code,
    ...describe(raw.code),
    max: today.max,
    min: today.min,
    rainProb: today.rainProb,
    uv: today.uv,
    advice: advise(today),
    tomorrow: { ...describe(tomorrow.code), max: tomorrow.max, min: tomorrow.min, rainProb: tomorrow.rainProb },
    updatedAt: raw.updatedAt,
  };
}

async function current(weatherCfg, force = false) {
  const { lat, lon, city } = weatherCfg || {};
  if (lat == null || lon == null) return { ok: false, error: i18n.t('main.weather.noCity') };
  const key = `${lat},${lon}`;
  if (!force && cache && cache.key === key && Date.now() - cache.at < 30 * 60 * 1000) return build(cache.raw);
  try {
    const url =
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
      '&current=temperature_2m,apparent_temperature,weather_code' +
      '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,uv_index_max' +
      '&timezone=auto&forecast_days=2';
    const d = await withTimeout(getJson(url));
    const day = (i) => ({
      code: d.daily.weather_code[i],
      max: Math.round(d.daily.temperature_2m_max[i]),
      min: Math.round(d.daily.temperature_2m_min[i]),
      rainProb: d.daily.precipitation_probability_max?.[i] ?? 0,
      uv: d.daily.uv_index_max?.[i] ?? 0,
    });
    const today = day(0);
    const raw = {
      city: city || '',
      temp: Math.round(d.current?.temperature_2m ?? (today.max + today.min) / 2),
      feels: Math.round(d.current?.apparent_temperature ?? today.max),
      code: d.current?.weather_code ?? today.code,
      today,
      tomorrow: day(1),
      updatedAt: Date.now(),
    };
    cache = { key, at: Date.now(), raw };
    return build(raw);
  } catch (err) {
    return { ok: false, error: i18n.t('main.weather.failed', { error: err.message || err }) };
  }
}

module.exports = { search, current };
