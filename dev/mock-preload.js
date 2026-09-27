// 仅供开发截图用：模拟 src/preload/preload.js 暴露的 window.mochi，数据放在内存里。
// 用法：electron scripts/snap.js "src/renderer/home/index.html?page=overview" out.png 980 680 1200 --preload=dev/mock-preload.js
// URL 参数（页面地址里的 query）：
//   mock=empty            用空数据（全新安装的样子）
//   platform=win32|darwin 覆盖 mochi.platform
//   weather=error|slow    天气返回失败 / 一直在加载
//   pomo=idle|paused|short|long 番茄钟状态（默认：专注中）
//   mood=today            今天已经记过心情
//   letters=none          信箱为空
//   lang=zh-CN|zh-TW|en|ja 界面语言（默认 zh-CN；设置页选「跟随系统」时也用它）
//   mail=none|qq|custom|outlook-noid|outlook-wait|outlook-ok  邮件设置的样子（默认 none：还没设置）
//   mailplain=1           系统不能加密保存（授权码只能明文存）
const { contextBridge } = require('electron');
const { createDefaults } = require('../src/main/defaults.js');
const C = require('../src/shared/common.js');

const q = new URLSearchParams(location.search);
const scenario = q.get('mock') || 'full';
const clone = (v) => (v === undefined ? v : JSON.parse(JSON.stringify(v)));
const now = new Date();

function dk(offset) {
  const d = new Date(now);
  d.setDate(d.getDate() + offset);
  return C.dateKey(d);
}

function at(offsetDays, h = 9, m = 0) {
  const d = new Date(now);
  d.setDate(d.getDate() + offsetDays);
  d.setHours(h, m, 0, 0);
  return d.getTime();
}

function shiftedKey(years, days) {
  const d = new Date(now);
  d.setFullYear(d.getFullYear() + years);
  d.setDate(d.getDate() + days);
  return C.dateKey(d);
}

function sampleData() {
  const bd = new Date(now);
  bd.setDate(bd.getDate() + 12);
  const data = createDefaults({
    petName: '糯米', // i18n-ignore: 模拟数据
    nickname: '', // 空的：显示当前语言默认的称呼（宝贝）
    sender: '豪豪', // i18n-ignore: 模拟数据
    species: 'cat',
    color: 'milk',
    accessory: 'bow',
    markings: 'none',
    size: 'm',
    togetherSince: dk(-399),
    birthday: `1999-${C.pad2(bd.getMonth() + 1)}-${C.pad2(bd.getDate())}`,
    anniversaries: [
      { name: '第一次约会', date: shiftedKey(-3, 40), kind: 'yearly' }, // i18n-ignore: 模拟数据
      { name: '一起去看海', date: dk(23), kind: 'countdown' }, // i18n-ignore: 模拟数据
      { name: '搬进我们的小家', date: dk(-1023), kind: 'since' }, // i18n-ignore: 模拟数据
    ],
    notes: ['今天也要开开心心的呀', '不管发生什么，都有人站在你这边', '你已经很努力啦，要记得夸夸自己', '累了就停下来歇一歇，没关系的', '你是被好好爱着的人'], // i18n-ignore: 模拟数据
  });
  data.createdAt = at(-127, 20, 30);
  data.stats.xp = 150;
  data.stats.fullness = 62;
  data.stats.mood = 86;
  data.stats.counters = { pets: 88, feeds: 41, plays: 17, waters: 203, pomodoros: 36, todos: 52 };
  data.stats.daily = { date: dk(0), water: 3, pomodoros: 3, focusMinutes: 75, pets: 4, feeds: 2 };
  data.todos = [
    { id: 't1', text: '整理这周的读书笔记', done: true, createdAt: at(0, 9, 12), doneAt: at(0, 10, 40) }, // i18n-ignore: 模拟数据
    { id: 't2', text: '给妈妈打个电话', done: false, createdAt: at(0, 9, 30), doneAt: null }, // i18n-ignore: 模拟数据
    { id: 't3', text: '下班路上买一束花 🌷', done: false, createdAt: at(0, 11, 5), doneAt: null }, // i18n-ignore: 模拟数据
    { id: 't4', text: '晚上去跑步 3 公里，回来记得拉伸，不然第二天腿会酸', done: false, createdAt: at(-1, 20, 15), doneAt: null }, // i18n-ignore: 模拟数据
  ];
  data.reminders.custom = [
    { id: 'r1', time: '10:00', text: '周会，记得带上笔记本', repeat: 'weekdays', enabled: true }, // i18n-ignore: 模拟数据
    { id: 'r2', time: '21:30', text: '敷面膜，然后早点洗漱', repeat: 'daily', enabled: true }, // i18n-ignore: 模拟数据
    { id: 'r3', time: '15:00', text: '去驿站取快递', repeat: 'once', date: dk(1), enabled: false }, // i18n-ignore: 模拟数据
  ];
  const ids = ['good', 'great', 'calm', 'tired', 'good', 'calm', 'sad', 'good', 'great', 'angry', 'calm', 'good', 'tired', 'great', 'good'];
  const notes = { 2: '和同事一起吃了火锅', 7: '加班到好晚', 10: '下雨没带伞', 15: '收到了一束花！' }; // i18n-ignore: 模拟数据
  const days = [1, 2, 4, 5, 7, 8, 10, 12, 13, 15, 17, 18, 20, 22, 24];
  days.forEach((d, i) => {
    if (d >= now.getDate()) return;
    const key = `${now.getFullYear()}-${C.pad2(now.getMonth() + 1)}-${C.pad2(d)}`;
    data.moods[key] = { mood: ids[i], note: notes[d] || '', at: at(d - now.getDate(), 22, 0) };
  });
  if (q.get('mood') === 'today') data.moods[dk(0)] = { mood: 'great', note: '今天被夸了', at: Date.now() }; // i18n-ignore: 模拟数据
  data.weather = { enabled: true, city: '杭州', lat: 30.29, lon: 120.16 }; // i18n-ignore: 模拟数据
  data.letters.read = { hello: true };
  data.settings.launchAtLogin = true;
  return data;
}

function emptyData() {
  const data = createDefaults({});
  data.stats.daily = { date: '', water: 0, pomodoros: 0, focusMinutes: 0, pets: 0, feeds: 0 };
  return data;
}

// 界面语言：真实程序里由主进程按「设置 → 语言」和系统语言算出来，写进 runtime.lang
const LANG = q.get('lang') || 'zh-CN';
function withLang(d) {
  d.settings.language = d.settings.language || 'auto';
  d.runtime.lang = LANG;
  return d;
}

let data = withLang(scenario === 'empty' ? emptyData() : sampleData());

const LETTERS =
  scenario === 'empty' || q.get('letters') === 'none'
    ? []
    : [
        {
          id: 'hello',
          title: '糯米的自我介绍', // i18n-ignore: 模拟数据
          from: '糯米', // i18n-ignore: 模拟数据
          unlock: '',
          body: '你好呀！\n\n我是糯米，一只软乎乎的小团子。从今天开始，我就住在你的桌面上啦。\n\n你工作的时候，我会安安静静地陪着你；你忘记喝水的时候，我会提醒你；你坐太久的时候，我会喊你起来伸个懒腰。\n\n还有，有人拜托我好好照顾你。所以，请多多指教啦！', // i18n-ignore: 模拟数据
        },
        {
          id: 'first',
          title: '写给第一次打开小窝的你', // i18n-ignore: 模拟数据
          from: '豪豪', // i18n-ignore: 模拟数据
          unlock: dk(-2),
          body:
            '宝贝：\n\n见字如面。\n\n想了很久要送你什么，最后决定做一只小猫陪着你。你总说上班的时候没人提醒你喝水，一忙起来就忘了吃饭，所以我把这些事都交给糯米啦。\n\n它可能有点吵，会在你专心的时候探出头来，也会在你难过的时候安安静静地待着。就像我一样，虽然不能时时刻刻在你身边，但一直都在想着你。\n\n如果哪天你觉得累了，就摸摸它的头吧。它会替我抱抱你。\n\n我们已经一起走过了四百天，还有好多好多个四百天在等着我们。去看海的约定，我记着呢。\n\n不管发生什么，都有人站在你这边。\n\n永远爱你的豪豪', // i18n-ignore: 模拟数据
        },
        {
          id: 'birthday',
          title: '生日那天再拆开', // i18n-ignore: 模拟数据
          from: '豪豪', // i18n-ignore: 模拟数据
          unlock: dk(12),
          body: '生日快乐！', // i18n-ignore: 模拟数据
        },
      ];

function letterList() {
  return LETTERS.map((l) => {
    const left = l.unlock ? C.daysUntil(l.unlock) : 0;
    const unlocked = !l.unlock || left <= 0;
    const item = { id: l.id, title: l.title, from: l.from, unlock: l.unlock, unlocked, daysLeft: unlocked ? 0 : left, read: !!data.letters.read[l.id], preview: unlocked ? l.body.replace(/\s+/g, ' ').slice(0, 40) : '' };
    if (unlocked) item.body = l.body;
    return item;
  });
}

/* ---------------- 事件 ---------------- */

const listeners = { data: new Set(), nav: new Set(), pomo: new Set(), petCmd: new Set() };
const log = [];

function sub(set, cb) {
  set.add(cb);
  return () => set.delete(cb);
}

function emit(paths) {
  setTimeout(() => {
    for (const cb of listeners.data) cb(clone(data), paths);
  }, 4);
}

function setPath(obj, path, value) {
  const keys = String(path).split('.');
  let o = obj;
  for (const k of keys.slice(0, -1)) {
    if (o[k] === null || typeof o[k] !== 'object' || Array.isArray(o[k])) o[k] = {};
    o = o[k];
  }
  o[keys[keys.length - 1]] = clone(value);
}

/* ---------------- 番茄钟 ---------------- */

const pomoMode = q.get('pomo') || (scenario === 'empty' ? 'idle' : 'focus');
let pomo = {
  phase: 'focus',
  running: true,
  paused: false,
  remaining: 17 * 60 + 32,
  total: 25 * 60,
  round: 2,
  longEvery: 4,
  todayCount: scenario === 'empty' ? 0 : 3,
};
if (pomoMode === 'idle') pomo = { ...pomo, phase: 'idle', running: false, remaining: 25 * 60, round: 1 };
if (pomoMode === 'paused') pomo = { ...pomo, paused: true };
if (pomoMode === 'short') pomo = { ...pomo, phase: 'short', remaining: 3 * 60 + 12, total: 5 * 60 };
if (pomoMode === 'long') pomo = { ...pomo, phase: 'long', remaining: 11 * 60, total: 15 * 60, round: 4 };

function pomoEmit() {
  const snap = clone(pomo);
  setTimeout(() => {
    for (const cb of listeners.pomo) cb(snap);
  }, 2);
}

setInterval(() => {
  if (pomo.running && !pomo.paused && pomo.remaining > 0) {
    pomo.remaining -= 1;
    pomoEmit();
  }
}, 1000);

function pomoCmd(cmd) {
  const P = data.pomodoro;
  if (cmd === 'start') pomo = { ...pomo, phase: 'focus', running: true, paused: false, remaining: P.focus * 60, total: P.focus * 60 };
  if (cmd === 'pause') pomo = { ...pomo, paused: true };
  if (cmd === 'resume') pomo = { ...pomo, paused: false };
  if (cmd === 'stop') pomo = { ...pomo, phase: 'idle', running: false, paused: false, remaining: P.focus * 60, total: P.focus * 60, round: 1 };
  if (cmd === 'skip') {
    if (pomo.phase === 'focus') {
      const long = pomo.round >= P.longEvery;
      const mins = long ? P.longBreak : P.shortBreak;
      pomo = { ...pomo, phase: long ? 'long' : 'short', remaining: mins * 60, total: mins * 60, paused: false };
    } else {
      const round = pomo.phase === 'long' ? 1 : pomo.round + 1;
      pomo = { ...pomo, phase: 'focus', round, remaining: P.focus * 60, total: P.focus * 60, paused: false };
    }
  }
  pomo.longEvery = P.longEvery;
  pomoEmit();
  return Promise.resolve(clone(pomo));
}

/* ---------------- 天气 ---------------- */

const WEATHER = {
  ok: true,
  city: '杭州', // i18n-ignore: 模拟数据
  temp: 24,
  feels: 25,
  code: 2,
  desc: '多云', // i18n-ignore: 模拟数据
  emoji: '⛅',
  max: 27,
  min: 19,
  rainProb: 20,
  uv: 5,
  advice: '温度刚刚好，早晚有点凉，出门带件薄外套吧～', // i18n-ignore: 模拟数据
  tomorrow: { desc: '小雨', emoji: '🌦️', max: 23, min: 18, rainProb: 70 }, // i18n-ignore: 模拟数据
  updatedAt: Date.now(),
};

function weatherGet() {
  const mode = q.get('weather');
  if (mode === 'slow') return new Promise(() => {});
  return new Promise((r) => setTimeout(() => r(mode === 'error' ? { ok: false, error: '网络好像开小差了' } : clone(WEATHER)), 120)); // i18n-ignore: 模拟数据
}

function weatherSearch(text) {
  const all = [
    { name: '杭州', admin1: '浙江', country: '中国', latitude: 30.29, longitude: 120.16 }, // i18n-ignore: 模拟数据
    { name: '上海', admin1: '上海', country: '中国', latitude: 31.22, longitude: 121.46 }, // i18n-ignore: 模拟数据
    { name: '成都', admin1: '四川', country: '中国', latitude: 30.66, longitude: 104.06 }, // i18n-ignore: 模拟数据
    { name: 'Tokyo', admin1: 'Tokyo', country: 'Japan', latitude: 35.69, longitude: 139.69 },
  ];
  const res = all.filter((c) => c.name.toLowerCase().includes(String(text).toLowerCase()) || String(text).includes(c.name));
  return new Promise((r) => setTimeout(() => r(res.length ? res : text === '杭' ? all.slice(0, 1) : []), 150)); // i18n-ignore: 模拟数据
}

/* ---------------- 暴露给页面 ---------------- */

const reset = () => {
  data = withLang(emptyData());
  data.mail = mockMail(data.mail || {});
  emit(['*']);
  return Promise.resolve({ ok: true });
};

/* ---------------- 邮件 ---------------- */

// 服务商（和 src/main/mail.js 的一样，名字和开通说明用语言文件里的 key）
const ssl = (host, port) => ({ host, port, secure: true });
const MAIL_PROVIDERS = [
  ['qq', ['qq.com', 'foxmail.com'], ssl('imap.qq.com', 993), ssl('smtp.qq.com', 465)],
  ['exmail', [], ssl('imap.exmail.qq.com', 993), ssl('smtp.exmail.qq.com', 465)],
  ['netease', ['163.com', '126.com', 'yeah.net', '188.com'], ssl('imap.163.com', 993), ssl('smtp.163.com', 465)],
  ['qiye163', [], ssl('imaphz.qiye.163.com', 993), ssl('smtphz.qiye.163.com', 465)],
  ['gmail', ['gmail.com'], ssl('imap.gmail.com', 993), ssl('smtp.gmail.com', 465)],
  ['outlook', ['outlook.com', 'hotmail.com', 'live.com'], ssl('outlook.office365.com', 993), { host: 'smtp-mail.outlook.com', port: 587, secure: false, starttls: true }, 'oauth'],
  ['icloud', ['icloud.com', 'me.com'], ssl('imap.mail.me.com', 993), { host: 'smtp.mail.me.com', port: 587, secure: false, starttls: true }],
  ['yahoo', ['yahoo.com'], ssl('imap.mail.yahoo.com', 993), ssl('smtp.mail.yahoo.com', 465)],
  ['sina', ['sina.com', 'sina.cn'], ssl('imap.sina.com', 993), ssl('smtp.sina.com', 465)],
  ['sohu', ['sohu.com'], ssl('imap.sohu.com', 993), ssl('smtp.sohu.com', 465)],
  ['aliyun', ['aliyun.com'], ssl('imap.aliyun.com', 993), ssl('smtp.aliyun.com', 465)],
  ['139', ['139.com'], ssl('imap.139.com', 993), ssl('smtp.139.com', 465)],
].map(([id, domains, imap, smtp, auth]) => ({ id, domains, imap, smtp, auth: auth || 'password' }));
const providerItem = (id, p = {}) => ({ id, nameKey: `main.mail.provider.${id}.name`, helpKey: `main.mail.provider.${id}.help`, auth: p.auth || (p.imap ? 'password' : null), imap: p.imap || null, smtp: p.smtp || null, domains: p.domains || [] });
const mailProviders = () => [providerItem('auto'), ...MAIL_PROVIDERS.map((p) => providerItem(p.id, p)), { ...providerItem('custom'), auth: 'password' }];

const mailMode = q.get('mail') || 'none';
const MS_IDLE = { state: 'idle', account: '', error: '', userCode: '', verificationUri: '', expiresAt: 0 };

// 页面拿到的 mail 和真实程序一样：没有密文，只有 hasPass / hasPush / hasMsToken
function mockMail(m) {
  const { passEnc, pushEnc, msTokenEnc, ...rest } = m;
  const out = { ...rest, hasPass: false, hasPush: false, hasMsToken: false, ms: { ...MS_IDLE } };
  const him = '12345678@qq.com';
  const recent = Date.now() - 3 * 60 * 1000;
  if (mailMode === 'qq') Object.assign(out, { enabled: true, address: 'nuomi@qq.com', hasPass: true, hasPush: true, allow: him, secret: '小猫爱吃鱼', lastCheck: recent, lastOk: recent, lastCount: 2 }); // i18n-ignore: 模拟数据
  if (mailMode === 'custom')
    Object.assign(out, { enabled: true, address: 'nuomi@example.com', server: 'custom', imap: ssl('mail.example.com', 993), smtp: ssl('mail.example.com', 465), hasPass: true, allow: him, lastCheck: recent, lastError: '连不上邮件服务器：请检查网络（公司网络可能拦了 993/465 端口）' }); // i18n-ignore: 模拟数据
  if (mailMode.startsWith('outlook')) Object.assign(out, { address: 'nuomi@outlook.com', server: 'outlook', allow: him, msClientId: mailMode === 'outlook-noid' ? '' : '3c1e5f2a-7b44-4d0e-9a51-2f6b8c0d9e17' });
  if (mailMode === 'outlook-wait') out.ms = { ...MS_IDLE, state: 'waiting', userCode: 'GQ3X8ZTN', verificationUri: 'https://microsoft.com/devicelogin', expiresAt: Date.now() + 900000 };
  if (mailMode === 'outlook-ok') Object.assign(out, { enabled: true, hasMsToken: true, ms: { ...MS_IDLE, state: 'ok', account: 'nuomi@outlook.com' } });
  return out;
}
data.mail = mockMail(data.mail || {});

function mailResolved(m) {
  if (m.server === 'custom') return { imap: m.imap.host ? m.imap : null, smtp: m.smtp.host ? m.smtp : null, provider: 'custom', auth: 'password', unsupported: false };
  const domain = String(m.address || '').split('@')[1] || '';
  const p = MAIL_PROVIDERS.find((x) => x.id === m.server) || MAIL_PROVIDERS.find((x) => x.domains.includes(domain));
  if (!p) return { imap: null, smtp: null, provider: '', auth: 'password', unsupported: false };
  return { imap: p.imap, smtp: p.smtp, provider: p.id, auth: p.auth, unsupported: false };
}

function mailGet() {
  const m = data.mail;
  const resolved = mailResolved(m);
  const ready = !!(m.address && resolved.imap && (resolved.auth === 'oauth' ? m.hasMsToken : m.hasPass));
  return clone({ ...m, encryption: q.get('mailplain') !== '1', auth: resolved.auth, ready, resolved, providers: mailProviders() });
}

function mailSet(patch) {
  data.mail = { ...data.mail, ...patch };
  emit(['mail']);
}

const mailApi = {
  get: () => Promise.resolve(mailGet()),
  save: (p = {}) => {
    const next = {};
    let error = '';
    for (const k of ['enabled', 'address', 'server', 'imap', 'smtp', 'allow', 'secret', 'notifyTo', 'receipt', 'interval', 'msClientId']) if (k in p) next[k] = clone(p[k]);
    if (p.password !== undefined) next.hasPass = !!String(p.password).trim();
    if (p.pushUrl !== undefined) {
      if (p.pushUrl && !/^https?:\/\//i.test(p.pushUrl)) error = '推送网址不对，要以 http:// 或 https:// 开头'; // i18n-ignore: 模拟主进程的错误
      else next.hasPush = !!p.pushUrl;
    }
    mailSet(next);
    log.push({ type: 'mail.save', patch: Object.keys(p) });
    return new Promise((r) => setTimeout(() => r({ ...mailGet(), ok: !error, error }), 150));
  },
  test: () => new Promise((r) => setTimeout(() => r(mailGet().ready ? { ok: true, imap: { ok: true, error: '' }, smtp: { ok: true, error: '' } } : { ok: false, imap: { ok: false, error: '邮件还没设置好：要填宠物的邮箱地址和授权码' }, smtp: { ok: false, error: '邮件还没设置好：要填宠物的邮箱地址和授权码' } }), 400)), // i18n-ignore: 模拟主进程的错误
  check: () => {
    mailSet({ lastCheck: Date.now(), lastOk: Date.now(), lastCount: 1, lastError: '' });
    return new Promise((r) => setTimeout(() => r({ ok: true, added: 1, error: '' }), 400));
  },
  pickup: () => Promise.resolve({ ok: true, via: ['mail'], error: '' }),
  sendGuide: () => Promise.resolve({ ok: true, to: (data.mail.allow || '').split(/[\s,]+/)[0] || '', error: '' }),
  msLoginStart: () => {
    const ms = { ...MS_IDLE, state: 'waiting', userCode: 'GQ3X8ZTN', verificationUri: 'https://microsoft.com/devicelogin', expiresAt: Date.now() + 900000 };
    mailSet({ ms });
    return Promise.resolve({ ok: true, userCode: ms.userCode, verificationUri: ms.verificationUri, expiresIn: 900, error: '' });
  },
  msOpen: () => {
    log.push({ type: 'mail.msOpen' });
    return Promise.resolve({ ok: true });
  },
  msLogout: () => {
    mailSet({ hasMsToken: false, ms: { ...MS_IDLE } });
    return Promise.resolve({ ok: true });
  },
};

contextBridge.exposeInMainWorld('mochi', {
  platform: q.get('platform') || process.platform,

  getData: () => Promise.resolve(clone(data)),
  set: (path, value) => {
    setPath(data, path, value);
    const paths = [path];
    // 模拟主进程：改了语言设置就算出实际用的语言（跟随系统时用 URL 里的 lang）
    if (path === 'settings.language') {
      data.runtime.lang = value === 'auto' ? LANG : value;
      paths.push('runtime.lang');
    }
    emit(paths);
    return Promise.resolve(true);
  },
  onData: (cb) => sub(listeners.data, cb),
  bumpStats: (delta = {}) => {
    const s = data.stats;
    const today = C.dateKey();
    if (s.daily.date !== today) s.daily = { date: today, water: 0, pomodoros: 0, focusMinutes: 0, pets: 0, feeds: 0 };
    if (delta.xp) s.xp += delta.xp;
    if (delta.fullness) s.fullness = Math.max(0, Math.min(100, s.fullness + delta.fullness));
    if (delta.mood) s.mood = Math.max(0, Math.min(100, s.mood + delta.mood));
    for (const [k, v] of Object.entries(delta.counters || {})) s.counters[k] = (s.counters[k] || 0) + v;
    for (const [k, v] of Object.entries(delta.daily || {})) s.daily[k] = (s.daily[k] || 0) + v;
    emit(['stats']);
    return Promise.resolve(clone(s));
  },
  recordMood: (date, mood, note = '') => {
    data.moods[date] = { mood, note, at: Date.now() };
    emit(['moods']);
    return Promise.resolve(true);
  },

  petCommand: (cmd) => {
    log.push({ type: 'petCommand', cmd: clone(cmd) });
  },
  onPetCommand: (cb) => sub(listeners.petCmd, cb),
  onPetEvent: () => () => {},
  pet: {
    ready: () => {},
    ignoreMouse: () => {},
    dragStart: () => {},
    dragEnd: () => {},
    walk: () => {},
    stop: () => {},
    contextMenu: () => {},
    onMotion: () => () => {},
    onCursor: () => () => {},
    onLayout: () => () => {},
    onClip: () => () => {},
    getLayout: () => Promise.resolve(null),
    show: () => {},
    hide: () => {},
    summon: () => {},
    isVisible: () => Promise.resolve(true),
  },
  reminderAck: (id, action) => log.push({ type: 'reminderAck', id, action }),
  fortune: () => Promise.resolve({ stars: '★★★★★', good: ['喝奶茶', '早点睡'], bad: ['熬夜'] }), // i18n-ignore: 模拟数据

  pomodoro: {
    get: () => Promise.resolve(clone(pomo)),
    start: () => pomoCmd('start'),
    pause: () => pomoCmd('pause'),
    resume: () => pomoCmd('resume'),
    stop: () => pomoCmd('stop'),
    skip: () => pomoCmd('skip'),
    onUpdate: (cb) => sub(listeners.pomo, cb),
  },

  weather: {
    search: (text) => weatherSearch(text),
    get: () => weatherGet(),
  },

  letters: {
    list: () => Promise.resolve(letterList()),
    markRead: (id) => {
      data.letters.read[id] = true;
      emit(['letters.read.' + id]);
      log.push({ type: 'markRead', id });
      return Promise.resolve(true);
    },
    open: (id) => log.push({ type: 'openLetter', id }),
  },

  openHome: (page) => log.push({ type: 'openHome', page }),
  onNavigate: (cb) => sub(listeners.nav, cb),
  mail: mailApi,

  app: {
    info: () => Promise.resolve({ name: '糯米桌宠', version: '1.1.0', electron: process.versions.electron, platform: process.platform, userData: '/Users/me/Library/Application Support/糯米桌宠' }), // i18n-ignore: 模拟数据
    setLoginItem: (on) => {
      data.settings.launchAtLogin = !!on;
      emit(['settings.launchAtLogin']);
      return Promise.resolve(!!on);
    },
    exportData: () => Promise.resolve({ ok: true, path: '/Users/me/Desktop/糯米的小窝-备份.json' }), // i18n-ignore: 模拟数据
    importData: () => Promise.resolve({ ok: false }),
    resetData: () => reset(),
    quit: () => log.push({ type: 'quit' }),
  },
});

// 截图脚本里用来检查调用记录、模拟主进程发来的跳转
contextBridge.exposeInMainWorld('__mock', {
  log: () => clone(log),
  data: () => clone(data),
  navigate: (page) => {
    for (const cb of listeners.nav) cb(page);
  },
});
