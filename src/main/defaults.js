// 数据结构的默认值。第一次启动时用送礼配置（gift.config.json）填充个性化字段。
const { uid } = require('../shared/common');

function createDefaults(gift = {}) {
  const now = Date.now();
  return {
    version: 1,
    createdAt: now,
    pet: {
      name: gift.petName || '糯米',
      species: gift.species || 'cat',
      color: gift.color || 'milk',
      accessory: gift.accessory || 'bow',
      markings: gift.markings || 'none',
      size: gift.size || 'm',
    },
    owner: {
      nickname: gift.nickname || '宝贝',
      sender: gift.sender || '',
    },
    love: {
      togetherSince: gift.togetherSince || '',
      birthday: gift.birthday || '',
      anniversaries: (gift.anniversaries || [])
        .filter((a) => a && a.date)
        .map((a) => ({ id: uid(), name: a.name || a.title || '纪念日', date: a.date, kind: a.kind || 'yearly' })),
      notes: (gift.notes || []).filter(Boolean).map((text) => ({ id: uid(), text: String(text) })),
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
    // custom：在应用里自己写的信 { id, title, from, unlock, body, createdAt }
    letters: { read: {}, notified: {}, custom: [] },
    runtime: {
      // 实际使用的语言，由主进程按 settings.language 和系统语言算出来
      lang: '',
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

module.exports = { createDefaults };
