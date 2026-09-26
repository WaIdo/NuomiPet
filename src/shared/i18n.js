// 多语言：支持的语言、系统语言匹配、取界面文字（t）、切换语言时就地替换台词和数据里的名字。
// 主进程和渲染进程共用（UMD，同 common.js）。文字放在 src/shared/locales/<语言>/ 下：
//   common.json main.json pet.json home.json pages.json  界面文字，按模块分文件，读入后合并成一棵树
//   phrases.json                                        宠物说的话，每组一个数组
//   data.json                                           物种、配色、食物、节日、主题、天气等的显示名字，以及默认内容
// 某种语言缺的文字依次回退：繁体 → 简体；英语 → 简体；日语 → 英语 → 简体。
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MochiI18n = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // 语言名用各自的语言写，方便在看不懂的界面里也能找到自己的语言
  const LANGS = [
    { id: 'zh-CN', name: '简体中文' },
    { id: 'zh-TW', name: '繁體中文' },
    { id: 'en', name: 'English' },
    { id: 'ja', name: '日本語' },
  ];
  const IDS = LANGS.map((l) => l.id);
  const SOURCE = 'zh-CN';
  const UI_FILES = ['common', 'main', 'pet', 'home', 'pages'];

  // 系统语言标签（zh-Hans-CN、zh-TW、en-US、ja-JP……）→ 支持的语言；不支持返回 null
  function matchLang(tag) {
    const s = String(tag || '').toLowerCase().replace(/_/g, '-');
    if (!s) return null;
    if (s === 'zh' || s.startsWith('zh-')) return /(^|-)(hant|tw|hk|mo)(-|$)/.test(s) ? 'zh-TW' : 'zh-CN';
    if (s === 'ja' || s.startsWith('ja-')) return 'ja';
    if (s === 'en' || s.startsWith('en-')) return 'en';
    return null;
  }

  // 设置里的语言（'auto' 或具体语言）+ 系统的首选语言列表 → 实际使用的语言
  function resolveLang(setting, systemLangs) {
    if (IDS.includes(setting)) return setting;
    for (const tag of systemLangs || []) {
      const hit = matchLang(tag);
      if (hit) return hit;
    }
    return 'en';
  }

  function chain(lang) {
    if (lang === 'zh-TW') return ['zh-TW', 'zh-CN'];
    if (lang === 'en') return ['en', 'zh-CN'];
    if (lang === 'ja') return ['ja', 'en', 'zh-CN'];
    return ['zh-CN'];
  }

  // {name} 换成变量；{n|单数|复数} 按数字选单复数（英语用，比如 "{n} {n|day|days}"）
  function fill(tpl, vars) {
    if (tpl === undefined || tpl === null) return '';
    const v = vars || {};
    return String(tpl)
      .replace(/\{(\w+)\|([^|{}]*)\|([^{}]*)\}/g, (m, k, one, other) => (v[k] === undefined || v[k] === null ? m : Number(v[k]) === 1 ? one : other))
      .replace(/\{(\w+)\}/g, (m, k) => (v[k] !== undefined && v[k] !== null ? v[k] : m));
  }

  const isObj = (x) => x && typeof x === 'object' && !Array.isArray(x);
  const clone = (x) => (x === undefined ? x : JSON.parse(JSON.stringify(x)));
  const get = (obj, path) => String(path).split('.').reduce((o, k) => (o === undefined || o === null ? undefined : o[k]), obj);

  function deepMerge(target, src) {
    for (const [k, v] of Object.entries(src || {})) {
      if (isObj(v) && isObj(target[k])) deepMerge(target[k], v);
      else target[k] = clone(v);
    }
    return target;
  }

  // 把一种语言的几个界面文件合并成一棵树
  function mergeUi(files) {
    const out = {};
    for (const f of files) deepMerge(out, f || {});
    return out;
  }

  /**
   * bundles: { 'zh-CN': { ui, phrases, data }, 'en': {...}, ... }（ui 已经合并好）
   * live: 各处共用的数据对象，切换语言时就地改：{ phrases, catalog, festivals, themes }
   */
  function createI18n(bundles, live = {}) {
    let lang = SOURCE;
    const listeners = new Set();

    function lookup(section, key, from = lang) {
      for (const l of chain(from)) {
        const val = get(bundles[l] && bundles[l][section], key);
        if (val !== undefined && val !== null && val !== '') return val;
      }
      return undefined;
    }

    // 界面文字。缺字时返回 key 本身，界面上一眼就能看出来
    function t(key, vars) {
      const val = lookup('ui', key);
      if (val === undefined) return key;
      return typeof val === 'string' ? fill(val, vars) : clone(val);
    }

    const has = (key) => lookup('ui', key) !== undefined;
    const data = (key) => clone(lookup('data', key));

    // 某一组台词（按回退链取第一个不为空的）
    function lines(group) {
      const val = lookup('phrases', group);
      return val === undefined ? [] : clone(val);
    }

    // 日期：年月日 → 当前语言的写法。p 可以是 { y, m, d }（y 可以没有）
    function fmtDate(p, { withYear = true } = {}) {
      if (!p || !p.m) return '';
      const months = t('date.months');
      const vars = { y: p.y, m: p.m, d: p.d, mon: Array.isArray(months) ? months[p.m - 1] : p.m };
      return fill(t(withYear && p.y ? 'date.ymd' : 'date.md'), vars);
    }

    // 星期几（0 = 星期日）
    function weekday(i) {
      const week = t('date.week');
      return Array.isArray(week) ? week[((i % 7) + 7) % 7] : '';
    }

    function localize() {
      if (live.phrases) {
        const src = bundles[SOURCE].phrases || {};
        for (const k of Object.keys(live.phrases)) delete live.phrases[k];
        for (const k of Object.keys(src)) live.phrases[k] = lines(k);
      }
      const name = (key, fallback) => {
        const v = lookup('data', key);
        return v === undefined ? fallback : v;
      };
      const c = live.catalog;
      if (c) {
        for (const kind of ['species', 'palettes', 'accessories', 'markings', 'sizes', 'moods']) {
          for (const it of c[kind] || []) it.name = name(`${kind}.${it.id}`, it.id);
        }
        for (const f of c.foods || []) {
          f.name = name(`foods.${f.id}.name`, f.id);
          f.line = name(`foods.${f.id}.line`, '');
        }
        for (const l of c.levels || []) l.title = name(`levels.${l.level}`, String(l.level));
      }
      const fest = live.festivals;
      if (fest) {
        for (const f of Object.values(fest.fixed || {})) Object.assign(f, { name: name(`festivals.${f.id}.name`, f.id), text: name(`festivals.${f.id}.text`, '') });
        for (const [id, f] of Object.entries(fest.lunarInfo || {})) Object.assign(f, { id, name: name(`festivals.${id}.name`, id), text: name(`festivals.${id}.text`, '') });
      }
      for (const th of live.themes || []) th.name = name(`themes.${th.id}`, th.id);
    }

    // 切换语言。返回是否真的换了
    function setLang(next, { force = false } = {}) {
      const target = IDS.includes(next) ? next : SOURCE;
      if (target === lang && !force) return false;
      lang = target;
      localize();
      for (const fn of listeners) fn(lang);
      return true;
    }

    function onChange(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    }

    localize();
    return {
      t,
      has,
      data,
      lines,
      fill,
      fmtDate,
      weekday,
      setLang,
      onChange,
      get lang() {
        return lang;
      },
    };
  }

  return { LANGS, IDS, SOURCE, UI_FILES, matchLang, resolveLang, fill, mergeUi, createI18n };
});
