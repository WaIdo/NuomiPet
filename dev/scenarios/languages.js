// 多语言截图和检查：依次切到每种语言，截宠物（打招呼、吃东西、喝水提醒、心情、生日、递信、下跪、哄人）、
// 快捷面板、小窝各页和信件窗口，导出右键菜单和托盘菜单的文字。
// 英文、韩文、法文、阿拉伯文界面里不应该出现汉字（示例数据也用各自的语言写），查到的写进 languages-report.txt 并记为 FAIL。
// 只跑其中几种语言：LANGS=en,ja
const path = require('path');
const fs = require('fs');
const menus = require('../../src/main/menus');
const i18n = require('../../src/main/i18n');

const out = process.env.SNAP_DIR || '/tmp';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const HAN = /[\u3400-\u9fff]/;
const NO_HAN = ['en', 'ko', 'fr', 'ar'];
// 语言选项里的语言名本来就是各自的文字，检查时去掉
const LANG_NAMES = /简体中文|繁體中文|日本語/g;
const hanLines = (text) => String(text).replace(LANG_NAMES, '').split('\n').filter((l) => HAN.test(l));
const BG = 'linear-gradient(#8fb6de,#c3d8ee)';

// 示例数据（名字、纪念日、悄悄话、待办）用各自的语言写，英文界面才能检查有没有漏翻的汉字
const SAMPLE = {
  'zh-CN': { nickname: '', sender: '豪豪', event: '第一次约会', note: '今天也要好好吃饭哦', todo: '买草莓蛋糕', letter: ['一周年快乐', '谢谢你一直在我身边。'] },
  'zh-TW': { nickname: '', sender: '豪豪', event: '第一次約會', note: '今天也要好好吃飯喔', todo: '買草莓蛋糕', letter: ['一週年快樂', '謝謝你一直在我身邊。'] },
  en: { nickname: '', sender: 'WaIdo', event: 'First date', note: 'Remember to eat well today', todo: 'Buy strawberry cake', letter: ['Happy first anniversary', 'Thank you for always being here.'] },
  ja: { nickname: '', sender: 'WaIdo', event: '初デート', note: '今日もちゃんとごはん食べてね', todo: 'いちごケーキを買う', letter: ['一周年おめでとう', 'いつもそばにいてくれてありがとう。'] },
  ko: { nickname: '', sender: 'WaIdo', event: '첫 데이트', note: '오늘도 밥 잘 챙겨 먹어', todo: '딸기 케이크 사기', letter: ['1주년 축하해', '항상 곁에 있어 줘서 고마워.'] },
  fr: { nickname: '', sender: 'WaIdo', event: 'Premier rendez-vous', note: 'Pense à bien manger aujourd’hui', todo: 'Acheter un gâteau aux fraises', letter: ['Joyeux premier anniversaire', 'Merci d’être toujours là.'] },
  ar: { nickname: '', sender: 'WaIdo', event: 'أول موعد', note: 'لا تنسي أن تأكلي جيدًا اليوم', todo: 'شراء كعكة الفراولة', letter: ['عيد سعيد لذكرانا الأولى', 'شكرًا لأنكِ دائمًا بجانبي.'] },
};

module.exports = async ({ app, store, scheduler, pet, pomodoro, openHome, petCommand, capture }) => {
  const langs = (process.env.LANGS || i18n.LANGS.map((l) => l.id).join(',')).split(',').filter(Boolean);
  const report = [];
  const fail = (msg) => report.push('FAIL ' + msg);
  store.set('runtime.welcomed', true);
  store.set('runtime.profileDone', true);
  store.set('love.togetherSince', '2026-09-25');
  store.set('love.birthday', '2002-06-08');
  store.set('stats.counters', { pets: 128, feeds: 36, plays: 21, waters: 87, pomodoros: 14, todos: 42 });
  store.set('stats.xp', 60);
  scheduler.goAway = () => {};
  const pjs = (c) => pet.win.webContents.executeJavaScript(c);
  await wait(2500);
  await pjs(`__pet.brain.scheduleIdle = () => {}; clearTimeout(__pet.brain.idleTimer); 0`);
  const calm = async () => {
    await pjs(`__pet.bubble.dismiss(); __pet.bubble.clearQueue(); __pet.fx.clearSigns(); __pet.panel.close(); __pet.brain.cancelTask(); __pet.brain.resetBody(); 0`);
    await wait(500);
  };

  for (const lang of langs) {
    const s = SAMPLE[lang];
    store.set('settings.language', lang);
    store.set('pet.name', '');
    store.set('owner.nickname', s.nickname);
    store.set('owner.sender', s.sender);
    store.set('love.anniversaries', [{ id: 'a1', name: s.event, date: '2025-09-01', kind: 'yearly' }]);
    store.set('love.notes', [{ id: 'n1', text: s.note }]);
    store.set('todos', [{ id: 't1', text: s.todo, done: false, createdAt: Date.now() }]);
    store.set('letters.custom', []);
    await wait(1200);
    const actual = store.get('runtime.lang');
    if (actual !== lang) fail(`${lang}: runtime.lang = ${actual}`);
    report.push(`== ${lang} (${i18n.petName(store.data)})`);

    // ---------- 宠物 ----------
    const shot = (name) => capture(pet.win, path.join(out, `${lang}-pet-${name}.png`), BG);
    await calm();
    pet.sendEvent({ type: 'say', text: scheduler.line('hello') });
    await wait(1400);
    await shot('01-hello');
    await calm();
    petCommand({ type: 'feed', food: 'fish' });
    await wait(1500);
    await shot('02-eating');
    await wait(2400);
    await shot('03-ate');
    await calm();
    pet.sendEvent({ type: 'remind', kind: 'water', id: 'water', text: scheduler.line('water') });
    await wait(1500);
    await shot('04-water');
    await calm();
    pet.sendEvent({ type: 'mood-ask', text: scheduler.line('moodAsk') });
    await wait(1400);
    await shot('05-mood-ask');
    await calm();
    pet.sendEvent({ type: 'celebrate', reason: 'birthday', text: scheduler.line('birthday') });
    await wait(900);
    await shot('06-birthday');
    await wait(3000);
    await calm();
    const hello = scheduler.findLetter('hello');
    pet.sendEvent({ type: 'letter', id: 'hello', title: hello ? hello.title : '?', text: scheduler.line('letter') });
    await wait(1400);
    await shot('07-letter');
    await calm();
    petCommand({ type: 'coax', kind: 'kneel' });
    await wait(1600);
    await shot('08-kneel');
    await wait(5000);
    await shot('09-forgive-ask');
    await calm();
    pjs(`__pet.brain.kneel({ reason: 'menu', round: 4 }); 0`);
    await wait(1600);
    await shot('10-kneel-4');
    await calm();
    for (const kind of ['flower', 'heart', 'tea', 'dance']) {
      petCommand({ type: 'coax', kind });
      await wait(kind === 'dance' ? 1200 : 900);
      await shot('11-coax-' + kind);
      await wait(2800);
      await calm();
    }
    for (const view of ['main', 'coax', 'food', 'mood']) {
      await pjs(`__pet.panel.open('${view}'); 0`);
      await wait(600);
      await shot('12-panel-' + view);
      if (NO_HAN.includes(lang)) {
        const bad = hanLines(await pjs(`document.getElementById('panel').innerText`));
        if (bad.length) fail(`${lang} panel ${view}: ${bad.join(' | ')}`);
      }
    }
    await calm();

    // ---------- 小窝 ----------
    const home = openHome('overview');
    await wait(2200);
    const hjs = (c) => home.webContents.executeJavaScript(c);
    await hjs(`document.querySelector('.modal .btn:not(.primary)')?.click(); 0`);
    for (const page of ['overview', 'dress', 'reminders', 'focus', 'todos', 'love', 'letters', 'moods', 'notes', 'settings']) {
      home.webContents.send('home:navigate', page);
      await wait(900);
      await capture(home, path.join(out, `${lang}-home-${page}.png`));
      if (page === 'settings') {
        await hjs(`(() => { const m = document.querySelector('.main') || document.scrollingElement; const c = [...document.querySelectorAll('.card')].find((x) => /🌐/.test(x.textContent)); c && c.scrollIntoView({ block: 'center' }); return 0; })()`);
        await wait(400);
        await capture(home, path.join(out, `${lang}-home-settings-language.png`));
      }
      if (NO_HAN.includes(lang)) {
        const bad = hanLines(await hjs(`document.body.innerText`));
        if (bad.length) fail(`${lang} home ${page}: ${bad.slice(0, 8).join(' | ')}`);
      }
      const title = await hjs(`document.title`);
      report.push(`home ${page}: title=${title}`);
    }
    home.close();
    await wait(600);

    // ---------- 菜单 ----------
    const labels = [];
    const walk = (menu, prefix) => {
      for (const item of menu.items) {
        if (item.type === 'separator') continue;
        const label = prefix + (item.label || item.role || '').trim();
        labels.push(label);
        if (item.submenu) walk(item.submenu, label + ' > ');
      }
    };
    walk(menus.petMenu({ store, pet, pomodoro, openHome, petCommand, state: {} }), 'pet: ');
    walk(menus.trayMenu({ store, pet, pomodoro, openHome, petCommand, setLoginItem: () => {} }), 'tray: ');
    fs.writeFileSync(path.join(out, `${lang}-menus.txt`), labels.join('\n') + '\n');
    if (NO_HAN.includes(lang)) {
      const bad = labels.filter((l) => hanLines(l).length);
      if (bad.length) fail(`${lang} menus: ${bad.join(' | ')}`);
    }
    report.push(`menus: ${labels.length} items`);
  }

  store.set('settings.language', 'auto');
  fs.writeFileSync(path.join(out, 'languages-report.txt'), report.join('\n') + '\n');
  app.quit();
};
