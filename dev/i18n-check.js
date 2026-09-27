// 多语言检查。用法：
//   node dev/i18n-check.js code [文件…]   代码里（注释以外）还剩的中日文字；行里写了 i18n-ignore 的跳过
//   node dev/i18n-check.js keys           代码里用到的 t('…') 在简体中文里都有
//   node dev/i18n-check.js locales        各语言和简体中文对照：缺的、多的、占位符不一致、没翻译的
// 有问题时以非 0 退出。
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const core = require('../src/shared/i18n');

const ROOT = path.join(__dirname, '..');
const LOC = path.join(ROOT, 'src/shared/locales');
const CJK = /[\u3040-\u30ff\u3400-\u9fff\uf900-\ufaff\uff00-\uffef\u3000-\u303f]/;
const HAN = /[\u3400-\u9fff\uf900-\ufaff]/;
const KANA = /[\u3040-\u30ff]/;
const NO_HAN = ['en', 'ko', 'fr', 'ar']; // 这些语言的译文里不应该有汉字

const readJson = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const loadLang = (lang) => ({
  ui: core.mergeUi(core.UI_FILES.map((n) => readJson(path.join(LOC, lang, `${n}.json`)))),
  phrases: readJson(path.join(LOC, lang, 'phrases.json')),
  data: readJson(path.join(LOC, lang, 'data.json')),
});

function codeFiles() {
  return execSync('git ls-files -co --exclude-standard src', { cwd: ROOT, encoding: 'utf8' })
    .split('\n')
    .filter((f) => /\.(js|mjs|html)$/.test(f) && !f.startsWith('src/shared/locales/') && f !== 'src/shared/i18n.js');
}

// 去掉注释，保留字符串（粗略的词法扫描：字符串、模板字符串、正则字面量、// 和 /* */ 注释）
function stripComments(src) {
  let out = '';
  let i = 0;
  let mode = null; // null | "'" | '"' | '`' | 'line' | 'block' | 'regex'
  let inClass = false; // 正则里的 [...]
  let prev = ''; // 上一个非空白字符，用来判断 / 是除号还是正则的开头
  while (i < src.length) {
    const c = src[i];
    const n = src[i + 1];
    if (mode === 'line') {
      if (c === '\n') {
        mode = null;
        out += c;
      }
      i++;
      continue;
    }
    if (mode === 'block') {
      if (c === '*' && n === '/') {
        mode = null;
        i += 2;
        continue;
      }
      if (c === '\n') out += c;
      i++;
      continue;
    }
    if (mode === 'regex') {
      out += c;
      if (c === '\\') {
        out += n || '';
        i += 2;
        continue;
      }
      if (c === '[') inClass = true;
      else if (c === ']') inClass = false;
      else if (c === '/' && !inClass) {
        mode = null;
        prev = '/';
      }
      i++;
      continue;
    }
    if (mode) {
      out += c;
      if (c === '\\') {
        out += n || '';
        i += 2;
        continue;
      }
      if (c === mode) {
        mode = null;
        prev = c;
      }
      i++;
      continue;
    }
    if (c === '/' && n === '/') {
      mode = 'line';
      i += 2;
      continue;
    }
    if (c === '/' && n === '*') {
      mode = 'block';
      i += 2;
      continue;
    }
    // / 前面是运算符、括号、逗号或 return 时是正则的开头，否则是除号
    if (c === '/' && (!prev || '(,=:[!&|?{};+-*%<>~^'.includes(prev) || /\breturn\s*$/.test(out.slice(-12)))) {
      mode = 'regex';
      inClass = false;
      out += c;
      i++;
      continue;
    }
    if (c === "'" || c === '"' || c === '`') mode = c;
    if (!/\s/.test(c)) prev = c;
    out += c;
    i++;
  }
  return out;
}

function checkCode(files) {
  const list = files.length ? files : codeFiles();
  let bad = 0;
  for (const f of list) {
    const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
    const raw = src.split('\n');
    const html = f.endsWith('.html');
    const code = (html ? src.replace(/<!--[\s\S]*?-->/g, (m) => m.replace(/[^\n]/g, '')) : stripComments(src)).split('\n');
    code.forEach((line, i) => {
      if (!CJK.test(line) || /i18n-ignore/.test(raw[i])) return;
      bad++;
      console.log(`${f}:${i + 1}: ${raw[i].trim().slice(0, 140)}`);
    });
  }
  console.log(bad ? `${bad} 行还有中日文字` : '代码里没有剩下的中日文字');
  return bad;
}

function checkKeys() {
  const zh = loadLang('zh-CN').ui;
  const get = (p) => p.split('.').reduce((o, k) => (o == null ? undefined : o[k]), zh);
  let bad = 0;
  const seen = new Set();
  for (const f of codeFiles()) {
    const src = stripComments(fs.readFileSync(path.join(ROOT, f), 'utf8'));
    // 只认独立的 t( / has( / rich( 和 i18n.t( / i18n.has(，不认 bubble.has( 这类别的对象的方法
    const re = /(?:(?<![\w.$])|\bi18n\.)(?:t|has|rich)\(\s*(['"`])((?:(?!\1).)+)\1/g;
    let m;
    while ((m = re.exec(src))) {
      const key = m[2];
      const line = src.slice(0, m.index).split('\n').length;
      if (key.includes('${')) {
        const prefix = key.slice(0, key.indexOf('${')).replace(/\.$/, '');
        const node = get(prefix);
        if (!node || typeof node !== 'object') {
          bad++;
          console.log(`${f}:${line}: 动态 key 的前缀 ${prefix} 不存在`);
        }
        continue;
      }
      seen.add(key);
      if (get(key) === undefined) {
        bad++;
        console.log(`${f}:${line}: 缺 key ${key}`);
      }
    }
  }
  console.log(bad ? `${bad} 处 key 有问题` : `代码里用到的 ${seen.size} 个 key 在简体中文里都有`);
  return bad;
}

// 把一个对象摊平成 { 'a.b.c': 值 }；数组当成一个值
function flatten(obj, prefix = '', out = {}) {
  for (const [k, v] of Object.entries(obj || {})) {
    const p = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) flatten(v, p, out);
    else out[p] = v;
  }
  return out;
}

const placeholders = (s) =>
  [...String(s).matchAll(/\{(\w+)(?:\|[^{}]*)?\}/g)]
    .map((m) => m[1])
    .sort()
    .filter((x, i, a) => a.indexOf(x) === i)
    .join(',');

// 这些 key 在代码里调用时带了 { n }，中文用不到，译文可以用来选单复数
const COUNT_ONLY = ['home.overview.memories.unit.', 'home.focus.set.minutes', 'home.focus.set.pomodoros'];

function checkLocales() {
  const src = loadLang('zh-CN');
  let bad = 0;
  const report = (msg) => {
    bad++;
    console.log(msg);
  };
  for (const { id } of core.LANGS) {
    if (id === 'zh-CN') continue;
    const cur = loadLang(id);
    for (const section of ['ui', 'phrases', 'data']) {
      const a = flatten(src[section]);
      const b = flatten(cur[section]);
      for (const [k, v] of Object.entries(a)) {
        const w = b[k];
        if (w === undefined || w === '' || (Array.isArray(w) && !w.length)) {
          report(`[${id}] 缺 ${section}.${k}`);
          continue;
        }
        const as = Array.isArray(v) ? v : [v];
        const bs = Array.isArray(w) ? w : [w];
        if (typeof v === 'number' || typeof w === 'number') continue;
        // 占位符：数组比较整组的并集
        // 日期格式里月份可以写成数字 {m} 或月份名 {mon}，两者等价
        const norm = (ph) => (k.startsWith('date.') ? ph.replace(/\bmon\b/g, 'm').split(',').filter((x, i, arr) => arr.indexOf(x) === i).join(',') : ph);
        const pa = norm(placeholders(as.join(' ')));
        // 代码传了 n、但中文不用的单位词：译文可以只拿 n 选单复数（{n|cup|cups}）
        const sel = COUNT_ONLY.some((x) => k.startsWith(x)) ? new Set(pa.split(',')) : null;
        const pb = norm(sel ? placeholders(bs.join(' ').replace(/\{n\|[^{}]*\}/g, (m) => (sel.has('n') ? m : ''))) : placeholders(bs.join(' ')));
        if (pa !== pb) report(`[${id}] 占位符不一致 ${section}.${k}：zh {${pa}} / ${id} {${pb}}`);
        for (const s of bs) {
          if (typeof s !== 'string') continue;
          if (NO_HAN.includes(id) && HAN.test(s)) report(`[${id}] 译文里有汉字 ${section}.${k}：${s.slice(0, 60)}`);
          if (id === 'ja' && !k.startsWith('date.') && HAN.test(s) && !KANA.test(s) && as.includes(s) && s.length > 1) report(`[${id}] 可能没翻译 ${section}.${k}：${s.slice(0, 60)}`);
          if (id !== 'ja' && id !== 'zh-TW' && as.includes(s) && CJK.test(s)) report(`[${id}] 没翻译 ${section}.${k}`);
        }
      }
      for (const k of Object.keys(b)) if (a[k] === undefined) report(`[${id}] 多出来的 ${section}.${k}`);
    }
  }
  console.log(bad ? `${bad} 个问题` : '各语言和简体中文对得上');
  return bad;
}

const [cmd, ...rest] = process.argv.slice(2);
const n = cmd === 'code' ? checkCode(rest) : cmd === 'keys' ? checkKeys() : cmd === 'locales' ? checkLocales() : (console.log('用法：code [文件…] | keys | locales'), 1);
process.exit(n ? 1 : 0);
