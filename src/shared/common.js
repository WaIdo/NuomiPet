// 主进程（require）和渲染进程（<script> 全局 MochiCommon）共用的小工具：日期计算、模板填充。
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MochiCommon = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const pad2 = (n) => String(n).padStart(2, '0');

  function dateKey(d = new Date()) {
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  }

  function hm(d = new Date()) {
    return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  }

  const MONTH_DAYS = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

  // 'YYYY-MM-DD' -> {y, m, d}；也接受 'MM-DD'（y 为 null）。不存在的日期（13 月、2 月 30 日）返回 null。
  function parseKey(s) {
    if (!s || typeof s !== 'string') return null;
    let r = null;
    let m = s.trim().match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (m) r = { y: +m[1], m: +m[2], d: +m[3] };
    else if ((m = s.trim().match(/^(\d{1,2})-(\d{1,2})$/))) r = { y: null, m: +m[1], d: +m[2] };
    if (!r || r.m < 1 || r.m > 12 || r.d < 1) return null;
    const max = r.y ? new Date(r.y, r.m, 0).getDate() : MONTH_DAYS[r.m - 1];
    return r.d <= max ? r : null;
  }

  const utc = (y, m, d) => Date.UTC(y, m - 1, d);
  const todayParts = (now = new Date()) => ({ y: now.getFullYear(), m: now.getMonth() + 1, d: now.getDate() });

  // b - a 的天数（按自然日）
  function diffDays(a, b) {
    return Math.round((utc(b.y, b.m, b.d) - utc(a.y, a.m, a.d)) / 86400000);
  }

  const isLeap = (y) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;

  // 某个月日在指定年份的实际日期（2 月 29 日在平年记为 2 月 28 日）
  function onYear(p, y) {
    if (p.m === 2 && p.d === 29 && !isLeap(y)) return { y, m: 2, d: 28 };
    return { y, m: p.m, d: p.d };
  }

  // 每年重复的日子：下一次（含今天）的日期、还有几天、将是第几年
  function nextYearly(key, now = new Date()) {
    const p = parseKey(key);
    if (!p) return null;
    const t = todayParts(now);
    let next = onYear(p, t.y);
    if (diffDays(t, next) < 0) next = onYear(p, t.y + 1);
    const daysLeft = diffDays(t, next);
    const years = p.y ? next.y - p.y : null;
    return { date: `${next.y}-${pad2(next.m)}-${pad2(next.d)}`, daysLeft, years, isToday: daysLeft === 0 };
  }

  // 从某天起算「第 N 天」（当天算第 1 天）
  function dayNumber(key, now = new Date()) {
    const p = parseKey(key);
    if (!p || !p.y) return null;
    const n = diffDays(p, todayParts(now));
    return n >= 0 ? n + 1 : null;
  }

  // 距离某个日期还有几天（负数表示已过去）
  function daysUntil(key, now = new Date()) {
    const p = parseKey(key);
    if (!p || !p.y) return null;
    return diffDays(todayParts(now), p);
  }

  const MILESTONES = [99, 100, 200, 300, 365, 400, 500, 520, 600, 666, 700, 777, 800, 900, 999, 1000, 1314, 1500, 2000, 2500, 3000, 3650, 5000, 5200, 9999];

  function isMilestone(n) {
    return MILESTONES.includes(n) || (n > 0 && n % 100 === 0);
  }

  // 单复数按当前界面语言的规则选（多语言模块切换语言时调用 setLang），算法同 src/shared/i18n.js
  let pluralLang = 'en';
  const pluralRules = {};
  function setLang(lang) {
    pluralLang = lang || 'en';
  }
  function pickPlural(n, body) {
    const forms = body.split('|');
    let cat;
    try {
      cat = (pluralRules[pluralLang] || (pluralRules[pluralLang] = new Intl.PluralRules(pluralLang))).select(n);
    } catch {
      cat = n === 1 ? 'one' : 'other';
    }
    if (forms.every((f) => /^(zero|one|two|few|many|other):/.test(f))) {
      const map = {};
      for (const f of forms) map[f.slice(0, f.indexOf(':'))] = f.slice(f.indexOf(':') + 1);
      return map[cat] !== undefined ? map[cat] : map.other !== undefined ? map.other : '';
    }
    if (forms.length === 2) return cat === 'one' ? forms[0] : forms[1];
    return null;
  }

  // {name} 换成变量；{n|单数|复数} 或 {n|one:…|few:…|other:…} 按数字选单复数
  function fill(tpl, vars = {}) {
    const v = vars || {};
    return String(tpl)
      .replace(/\{(\w+)\|([^{}]*)\}/g, (m, k, body) => {
        if (v[k] === undefined || v[k] === null) return m;
        const out = pickPlural(Number(v[k]), body);
        return out === null ? m : out;
      })
      .replace(/\{(\w+)\}/g, (m, k) => (v[k] !== undefined && v[k] !== null ? v[k] : m));
  }

  const lastPicked = new Map();
  function pick(list, tag) {
    if (!list || !list.length) return '';
    if (list.length === 1) return list[0];
    let i;
    do i = Math.floor(Math.random() * list.length);
    while (tag && lastPicked.get(tag) === i);
    if (tag) lastPicked.set(tag, i);
    return list[i];
  }

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function levelFor(xp, levels) {
    let cur = levels[0];
    for (const l of levels) if (xp >= l.xp) cur = l;
    const idx = levels.indexOf(cur);
    const next = levels[idx + 1] || null;
    return { ...cur, next, progress: next ? (xp - cur.xp) / (next.xp - cur.xp) : 1 };
  }

  // 今天是什么节日（表见 src/shared/festivals.json；名字和祝福语由多语言模块填进表里）
  function festivalOf(table, now = new Date()) {
    if (!table) return null;
    const key = dateKey(now);
    const lunarId = table.lunar && table.lunar[key];
    if (lunarId && table.lunarInfo && table.lunarInfo[lunarId]) return { id: lunarId, ...table.lunarInfo[lunarId] };
    const fixed = table.fixed && table.fixed[key.slice(5)];
    return fixed ? { ...fixed } : null;
  }

  // 同一天结果固定的伪随机
  function seeded(str) {
    let h = 2166136261;
    for (const ch of String(str)) {
      h ^= ch.codePointAt(0);
      h = Math.imul(h, 16777619);
    }
    return () => {
      h ^= h << 13;
      h ^= h >>> 17;
      h ^= h << 5;
      return ((h >>> 0) % 100000) / 100000;
    };
  }

  function fortune(seed, good, bad) {
    const r = seeded(seed);
    const take = (list, n) => {
      const pool = [...list];
      const out = [];
      while (out.length < n && pool.length) out.push(pool.splice(Math.floor(r() * pool.length), 1)[0]);
      return out;
    };
    const stars = 3 + Math.floor(r() * 3);
    return { stars: '★'.repeat(stars) + '☆'.repeat(5 - stars), good: take(good || [], 2), bad: take(bad || [], 1) };
  }

  // Windows 10 自带的 emoji 字体只到 Emoji 12，更新的 emoji 在那里显示成方框，换成老一点的
  const EMOJI_FALLBACK = { '🧋': '🥤' };

  // 把字符串里 missing 中的 emoji 换掉；数组和对象就地逐项替换
  function swapEmoji(value, missing) {
    if (!missing || !missing.size) return value;
    if (typeof value === 'string') {
      let s = value;
      for (const e of missing) if (s.includes(e)) s = s.split(e).join(EMOJI_FALLBACK[e]);
      return s;
    }
    if (Array.isArray(value)) {
      for (let i = 0; i < value.length; i++) value[i] = swapEmoji(value[i], missing);
    } else if (value && typeof value === 'object') {
      for (const k of Object.keys(value)) value[k] = swapEmoji(value[k], missing);
    }
    return value;
  }

  // 小窝的颜色：'auto' 表示跟宠物的配色走（catalog.palettes[].theme）
  function resolveTheme(data, catalog) {
    const t = (data && data.settings && data.settings.theme) || 'sakura';
    if (t !== 'auto') return t;
    const pal = catalog && catalog.palettes.find((p) => p.id === (data.pet && data.pet.color));
    return (pal && pal.theme) || 'sakura';
  }

  return { pad2, dateKey, hm, parseKey, diffDays, nextYearly, dayNumber, daysUntil, isMilestone, fill, pick, uid, levelFor, todayParts, festivalOf, fortune, resolveTheme, EMOJI_FALLBACK, swapEmoji, setLang };
});
