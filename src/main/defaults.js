// 数据结构的默认值。第一次启动时用送礼配置（gift.config.json）填充个性化字段。
// 宠物的名字和对她的称呼默认是空的：显示时用当前语言的默认值（i18n.petName / i18n.nickname）。
const { uid } = require('../shared/common');
const i18n = require('./i18n');

function createDefaults(gift = {}) {
  const now = Date.now();
  // 送礼配置里没写悄悄话，就用当前语言内置的几条
  const giftNotes = (gift.notes || []).filter(Boolean);
  const notes = giftNotes.length ? giftNotes : i18n.data('defaults.notes') || [];
  return {
    version: 1,
    createdAt: now,
    pet: {
      name: gift.petName || '',
      species: gift.species || 'cat',
      color: gift.color || 'milk',
      accessory: gift.accessory || 'bow',
      markings: gift.markings || 'none',
      size: gift.size || 'm',
    },
    owner: {
      nickname: gift.nickname || '',
      sender: gift.sender || '',
    },
    love: {
      togetherSince: gift.togetherSince || '',
      birthday: gift.birthday || '',
      anniversaries: (gift.anniversaries || [])
        .filter((a) => a && a.date)
        .map((a) => ({ id: uid(), name: a.name || a.title || i18n.data('defaults.anniversary'), date: a.date, kind: a.kind || 'yearly' })),
      notes: notes.map((text) => ({ id: uid(), text: String(text) })),
      builtin: true,
      chatty: 'normal',
    },
    reminders: {
      water: { enabled: true, interval: 60 },
      stretch: { enabled: true, interval: 50 },
      eyes: { enabled: false, interval: 40 },
      sleep: { enabled: true, time: '23:30' },
      meals: { enabled: true },
      activeStart: '08:30',
      activeEnd: '23:30',
      custom: [],
    },
    pomodoro: { focus: 25, shortBreak: 5, longBreak: 15, longEvery: 4, autoBreak: true },
    todos: [],
    moods: {},
    stats: {
      fullness: 70,
      mood: 80,
      xp: 0,
      lastTick: now,
      counters: { pets: 0, feeds: 0, plays: 0, waters: 0, pomodoros: 0, todos: 0 },
      daily: { date: '', water: 0, pomodoros: 0, focusMinutes: 0, pets: 0, feeds: 0 },
    },
    settings: {
      alwaysOnTop: true,
      launchAtLogin: false,
      sound: true,
      volume: 0.6,
      activity: 'normal',
      walkAround: true,
      followMouse: false,
      gravity: true,
      eyeTracking: true,
      dnd: false,
      // 小窝和对话气泡的颜色：sakura/peach/butter/mint/sky/taro，或 auto（跟宠物配色一样）
      theme: 'sakura',
      // 界面语言：auto 跟随系统，或 zh-CN / zh-TW / en / ja
      language: 'auto',
    },
    weather: { enabled: false, city: '', lat: null, lon: null },
    // 邮件：他用邮件往信箱寄信、「来接我」通知（见 mail.js）。授权码、推送网址、微软的登录凭据加密存，不给页面
    mail: {
      enabled: false, // 总开关：填好并保存后打开
      address: '', // 宠物的邮箱
      passEnc: '', // 授权码（加密）
      pushEnc: '', // 推送网址（可选，加密）
      server: 'auto', // auto：按邮箱域名选服务器；服务商的 id（qq、exmail、outlook……）；custom：用下面两项
      imap: { host: '', port: 993, secure: true },
      smtp: { host: '', port: 465, secure: true },
      allow: '', // 允许寄信的邮箱（他的），逗号、空格、换行分开
      secret: '', // 暗号（可选）
      notifyTo: '', // 「来接我」发到哪；空 = allow 里的第一个
      receipt: true, // 收到信后给他回一封确认邮件
      interval: 5, // 收信间隔（分钟）：2 / 5 / 10 / 30
      // Outlook 等微软邮箱：自己在微软注册的应用 ID，和登录后拿到的 refresh_token（加密）、登录状态
      msClientId: gift.mailMsClientId || '',
      msTokenEnc: '',
      ms: { state: 'idle', account: '', error: '', userCode: '', verificationUri: '', expiresAt: 0 },
      // 运行状态
      lastCheck: 0,
      lastOk: 0,
      lastCount: 0,
      lastError: '',
      lastPickup: 0,
      uidValidity: null,
      lastUid: 0,
      seen: [], // 最近处理过的 Message-ID（去重）
    },
    // custom：在应用里自己写的信 { id, title, from, unlock, body, createdAt }
    letters: { read: {}, notified: {}, custom: [] },
    runtime: {
      // 实际使用的语言，由主进程按 settings.language 和系统语言算出来
      lang: '',
      // 以前默认的名字、称呼已经处理过（见 migrateLegacyNames）。这里只能是 false：读已有的数据文件时，
      // 文件里缺的字段按这里补，老数据没有这一项，要当成还没处理过。新装的数据启动时直接标成 true（见 upgradeData）
      namesMigrated: false,
      // 送礼配置里的 sender、togetherSince、birthday 已经补进过数据（见 fillFromGift）。老数据没有这一项，读进来时是 false
      giftFilled: false,
      welcomed: false,
      welcomedAt: 0,
      tipsShown: 0,
      profileAsked: false,
      profileDone: false,
      profileSkipped: false,
      hidden: false,
      position: null,
      greeted: {},
      celebrated: {},
      lastWater: 0,
      lastEyes: 0,
      lastHungry: 0,
      lastSleepNag: 0,
    },
  };
}

// 老版本把默认的名字「糯米」和称呼「宝贝」直接存进了数据。改成空，显示时就跟着语言用默认值。
// 只做一次（做完记下 runtime.namesMigrated），以后她自己把名字改回「糯米」也不会再被清掉。
// 就地修改 data，这次做了（记下了标记）返回 true
const OLD_PET_NAME = '糯米'; // i18n-ignore: 老版本存进数据的默认值，只用来比较
const OLD_NICKNAME = '宝贝'; // i18n-ignore: 老版本存进数据的默认值，只用来比较

function migrateLegacyNames(data) {
  if (!data || typeof data !== 'object') return false;
  if (!data.runtime || typeof data.runtime !== 'object') data.runtime = {};
  if (data.runtime.namesMigrated === true) return false;
  if (data.pet && data.pet.name === OLD_PET_NAME) data.pet.name = '';
  if (data.owner && data.owner.nickname === OLD_NICKNAME) data.owner.nickname = '';
  data.runtime.namesMigrated = true;
  return true;
}

// 装过旧版的用户：数据里 owner.sender、love.togetherSince、love.birthday 还空着，就用送礼配置里的值补上。
// 只补一次（补完记下 runtime.giftFilled），以后她自己清空了也不会再填回去；已经填了的不覆盖。
// 就地修改 data，这次补过（记下了标记）返回 true
function fillFromGift(data, gift) {
  if (!data || !data.runtime || data.runtime.giftFilled) return false;
  const g = gift || {};
  if (g.sender && data.owner && !data.owner.sender) data.owner.sender = g.sender;
  if (g.togetherSince && data.love && !data.love.togetherSince) data.love.togetherSince = g.togetherSince;
  if (g.birthday && data.love && !data.love.birthday) data.love.birthday = g.birthday;
  data.runtime.giftFilled = true;
  return true;
}

// 启动时读好数据以后调用。新装的（没有数据文件）名字不用迁移，直接记下；
// 老数据把以前默认的名字、称呼改成空，送礼配置里的署名、在一起的日子和生日还空着就补上（各只做一次）。
// 有改动返回 true，调用方要存盘
function upgradeData(store, gift) {
  if (store.isFresh) store.data.runtime.namesMigrated = true;
  const migrated = migrateLegacyNames(store.data);
  const filled = fillFromGift(store.data, gift);
  return store.isFresh || migrated || filled;
}

module.exports = { createDefaults, migrateLegacyNames, fillFromGift, upgradeData };
