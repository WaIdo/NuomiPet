// 天气：Open-Meteo（免费、无需 key）。只在用户开启并选择城市后联网。
const { net } = require('electron');

const CODES = {
  0: ['晴', '☀️'],
  1: ['晴间多云', '🌤️'],
  2: ['多云', '⛅'],
  3: ['阴天', '☁️'],
  45: ['有雾', '🌫️'],
  48: ['有雾', '🌫️'],
  51: ['毛毛雨', '🌦️'],
  53: ['毛毛雨', '🌦️'],
  55: ['毛毛雨', '🌦️'],
  56: ['冻毛毛雨', '🌧️'],
  57: ['冻毛毛雨', '🌧️'],
  61: ['小雨', '🌧️'],
  63: ['中雨', '🌧️'],
  65: ['大雨', '🌧️'],
  66: ['冻雨', '🌧️'],
  67: ['冻雨', '🌧️'],
  71: ['小雪', '🌨️'],
  73: ['中雪', '🌨️'],
  75: ['大雪', '❄️'],
  77: ['小冰粒', '🌨️'],
  80: ['阵雨', '🌦️'],
  81: ['阵雨', '🌧️'],
  82: ['大阵雨', '⛈️'],
  85: ['阵雪', '🌨️'],
  86: ['大阵雪', '❄️'],
  95: ['雷阵雨', '⛈️'],
  96: ['雷阵雨伴冰雹', '⛈️'],
  99: ['雷阵雨伴冰雹', '⛈️'],
};

const RAINY = new Set([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82, 95, 96, 99]);
const SNOWY = new Set([71, 73, 75, 77, 85, 86]);

let cache = null; // { key, at, data }

async function getJson(url) {
  const res = await net.fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return res.json();
}

function withTimeout(promise, ms = 10000) {
  return Promise.race([promise, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);
}

async function search(name) {
  const q = String(name || '').trim();
  if (!q) return [];
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=8&language=zh&format=json`;
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
  const [desc, emoji] = CODES[code] || ['未知', '🌈'];
  return { desc, emoji };
}

function advise({ code, max, min, rainProb, uv }) {
  if (RAINY.has(code) || rainProb >= 50) return '可能会下雨，出门记得带伞☂️';
  if (SNOWY.has(code)) return '要下雪啦，穿暖和一点，路上小心滑⛄';
  if (max >= 33) return '今天好热，注意防晒，多喝水🧊';
  if (min <= 5) return '好冷呀，多穿点衣服，别着凉🧣';
  if (uv >= 7) return '紫外线很强，记得涂防晒哦🧴';
  if (max - min >= 10) return '早晚温差大，带件外套吧🧥';
  return '是个不错的天气，心情也要美美的～';
}

async function current(weatherCfg, force = false) {
  const { lat, lon, city } = weatherCfg || {};
  if (lat == null || lon == null) return { ok: false, error: '还没有设置城市' };
  const key = `${lat},${lon}`;
  if (!force && cache && cache.key === key && Date.now() - cache.at < 30 * 60 * 1000) return cache.data;
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
    const tomorrow = day(1);
    const code = d.current?.weather_code ?? today.code;
    const data = {
      ok: true,
      city: city || '',
      temp: Math.round(d.current?.temperature_2m ?? (today.max + today.min) / 2),
      feels: Math.round(d.current?.apparent_temperature ?? today.max),
      code,
      ...describe(code),
      max: today.max,
      min: today.min,
      rainProb: today.rainProb,
      uv: today.uv,
      advice: advise({ ...today, code: today.code }),
      tomorrow: { ...describe(tomorrow.code), max: tomorrow.max, min: tomorrow.min, rainProb: tomorrow.rainProb },
      updatedAt: Date.now(),
    };
    cache = { key, at: Date.now(), data };
    return data;
  } catch (err) {
    return { ok: false, error: '天气获取失败：' + (err.message || err) };
  }
}

module.exports = { search, current };
