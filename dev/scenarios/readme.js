// README 截图：按 7 种语言各截一遍宠物、哄人动作、跪搓衣板、小窝首页和小窝的颜色，拼成 5 张图，
// 放到 <SNAP_DIR>/<语言>/{pet,coax,kneel,home,themes}.png（原始截图在 <SNAP_DIR>/<语言>/raw/）。
// 法语、阿拉伯语的 README 从简，只要 pet 和 home 两张。
// 跑一遍要十几分钟，所以只在 README_SHOTS=1 时运行；只跑其中几种语言：LANGS=en,ja
// 用法：README_SHOTS=1 node dev/run-scenarios.js --out=readme-shots readme
// 然后把 readme-shots/readme/<语言>/*.png 复制到 docs/images/<语言>/
const path = require('path');
const fs = require('fs');
const { BrowserWindow, nativeImage } = require('electron');
const i18n = require('../../src/main/i18n');
const C = require('../../src/shared/common');
const themes = require('../../src/shared/themes.json');
const captions = require('../readme-captions.json');

const out = process.env.SNAP_DIR || '/tmp';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const BG = 'linear-gradient(#8fb6de,#c3d8ee)';
const ORDER = ['zh-CN', 'zh-TW', 'en', 'ja', 'ko', 'fr', 'ar'];
const HOME_W = 980;
const HOME_H = 680;
// 同一个 key 的句子依次取第 0、1、2… 句；这里列出的 key 固定取某一句
const FIXED = { kneelFor: 1 };
const BRIEF = ['fr', 'ar'];
const log = [];

module.exports = async ({ app, store, scheduler, pet, petCommand, capture, openHome }) => {
  if (process.env.README_SHOTS !== '1') {
    console.log('[readme] skipped (set README_SHOTS=1 to regenerate the README screenshots)');
    app.quit();
    return;
  }
  const langs = (process.env.LANGS ? process.env.LANGS.split(',') : ORDER).filter((l) => ORDER.includes(l));

  store.set('runtime.welcomed', true);
  store.set('runtime.profileDone', true);
  store.set('love.togetherSince', '2026-09-25');
  store.set('love.birthday', '2002-06-08');
  store.set('love.anniversaries', []);
  store.set('love.notes', []);
  store.set('todos', []);
  store.set('letters.custom', []);
  store.set('stats.counters', { pets: 128, feeds: 36, plays: 21, waters: 87, pomodoros: 14, todos: 42 });
  store.set('stats.xp', 60);
  store.set('pet.name', '');
  store.set('owner.nickname', '');

  // 不让定时提醒、离开/回来打断截图
  clearInterval(scheduler.timer);
  scheduler.tick = () => {};
  scheduler.goAway = () => {};
  scheduler.comeBack = () => {};

  // 句子固定下来，每次生成的图一样
  const counters = new Map();
  const pickIndex = (key, len) => {
    if (FIXED[key] !== undefined) return Math.min(FIXED[key], len - 1);
    const n = counters.get(key) || 0;
    counters.set(key, n + 1);
    return n % len;
  };
  const mainLine = (key, extra) => {
    const list = key.split('.').reduce((o, k) => (o ? o[k] : undefined), i18n.phrases);
    if (!Array.isArray(list) || !list.length) return '';
    return C.fill(list[pickIndex(key, list.length)], scheduler.vars(extra));
  };
  scheduler.line = mainLine;

  const pjs = (c) => pet.win.webContents.executeJavaScript(c);
  await wait(2500);
  const patchPet = () =>
    pjs(`(async () => {
      const { phrases } = await import('../shared/i18n.mjs');
      const C = self.MochiCommon;
      window.__readme = { redirect: {}, counters: {}, fixed: ${JSON.stringify(FIXED)} };
      const b = __pet.brain;
      b.scheduleIdle = () => {};
      clearTimeout(b.idleTimer);
      b.line = function (key, extra) {
        const r = window.__readme;
        key = r.redirect[key] || key;
        const list = phrases[key];
        if (!Array.isArray(list) || !list.length) return C.fill(C.pick(list, key), this.vars(extra));
        let i;
        if (r.fixed[key] !== undefined) i = Math.min(r.fixed[key], list.length - 1);
        else { i = (r.counters[key] || 0) % list.length; r.counters[key] = (r.counters[key] || 0) + 1; }
        return C.fill(list[i], this.vars(extra));
      };
      return 0;
    })()`);
  await patchPet();

  const calm = async () => {
    await pjs(`__pet.bubble.dismiss(); __pet.bubble.clearQueue(); __pet.fx.clearSigns(); __pet.panel.close(); __pet.brain.cancelTask(); __pet.brain.resetBody(); 0`);
    await wait(500);
  };
  const awake = async () => {
    await pjs(`(async () => { if (__pet.brain.mode === 'sleeping') await __pet.brain.wakeUp({ quick: true }); return 0; })()`);
    await calm();
  };
  const waitFor = async (expr, ms = 15000) => {
    const until = Date.now() + ms;
    while (Date.now() < until) {
      if (await pjs(expr)) return true;
      await wait(250);
    }
    return false;
  };
  const clickBubble = (primary) =>
    pjs(`(() => { const b = document.querySelector('#bubble:not([hidden]) .btn${primary ? '.primary' : ':not(.primary)'}'); if (!b) return 'missing'; b.click(); return 'ok'; })()`);

  for (const lang of langs) {
    const dir = path.join(out, lang);
    const raw = path.join(dir, 'raw');
    fs.mkdirSync(raw, { recursive: true });
    const cap = captions[lang];
    store.set('settings.language', lang);
    store.set('settings.theme', 'sakura');
    store.set('owner.sender', lang === 'zh-CN' || lang === 'zh-TW' ? '豪豪' : 'WaIdo');
    store.set('stats.fullness', 60);
    store.set('stats.mood', 80);
    store.set('stats.daily', { date: C.dateKey(), water: 2, pomodoros: 1, focusMinutes: 25, pets: 8, feeds: 1 });
    await wait(1500);
    if (store.get('runtime.lang') !== lang) log.push(`${lang}: runtime.lang = ${store.get('runtime.lang')}`);
    counters.clear();
    await pjs(`window.__readme && (window.__readme.counters = {}, window.__readme.redirect = {}); 0`);
    await awake();

    let n = 0;
    const shot = async (name) => {
      const f = path.join(raw, `${String(++n).padStart(2, '0')}-${name}.png`);
      await capture(pet.win, f, BG);
      return f;
    };

    // ---------- 宠物的日常 ----------
    const petShots = [];
    pet.sendEvent({ type: 'away' });
    await wait(2500);
    pet.sendEvent({ type: 'back', minutes: 25, text: mainLine('welcomeBack') });
    await wait(2600);
    petShots.push(await shot('back'));
    await calm();
    petCommand({ type: 'feed', food: 'fish' });
    await wait(1500);
    petShots.push(await shot('eating'));
    await wait(2400);
    petShots.push(await shot('ate'));
    await calm();
    pet.sendEvent({ type: 'remind', kind: 'water', id: 'water', text: mainLine('water') });
    await wait(1500);
    petShots.push(await shot('water'));
    const drank = await clickBubble(true);
    if (drank !== 'ok') log.push(`${lang}: water button ${drank}`);
    await wait(1600);
    petShots.push(await shot('water-done'));
    await calm();
    pet.sendEvent({ type: 'mood-ask', text: mainLine('moodAsk') });
    await wait(1400);
    petShots.push(await shot('mood-ask'));
    await calm();
    pet.sendEvent({ type: 'mood-recorded', mood: 'sad', text: C.fill(i18n.phrases.moodReply.sad[1] || i18n.phrases.moodReply.sad[0], scheduler.vars()) });
    await wait(1500);
    petShots.push(await shot('mood-reply'));
    await wait(5000);
    await calm();
    pet.sendEvent({ type: 'celebrate', reason: 'birthday', text: mainLine('birthday') });
    await wait(900);
    petShots.push(await shot('birthday'));
    await wait(3000);
    await calm();
    const hello = scheduler.findLetter('hello');
    pet.sendEvent({ type: 'letter', id: 'hello', title: hello ? hello.title : '', text: mainLine('letter') });
    await wait(1400);
    petShots.push(await shot('letter'));
    await calm();
    petCommand({ type: 'sleep' });
    await wait(1400);
    petShots.push(await shot('sleep'));
    await wait(1500);
    await awake();

    const brief = BRIEF.includes(lang);

    // ---------- 哄人的动作 ----------
    const coaxShots = [];
    if (!brief) for (const kind of ['bow', 'flower', 'heart', 'hug', 'kiss', 'tea', 'cute', 'roll', 'dance', 'praise']) {
      petCommand({ type: 'coax', kind });
      await wait(kind === 'hug' ? 1400 : kind === 'roll' ? 700 : 900);
      coaxShots.push(await shot('coax-' + kind));
      await wait(3200);
      await calm();
    }

    // ---------- 跪搓衣板 ----------
    const kneelShots = [];
    if (!brief) {
    const asking = `!!document.querySelector('#bubble:not([hidden]) .btn.primary')`;
    await pjs(`window.__readme.redirect = { kneelFor: 'kneel' }; 0`);
    petCommand({ type: 'coax', kind: 'kneel' });
    await wait(1600);
    kneelShots.push(await shot('kneel-1'));
    await pjs(`window.__readme.redirect = {}; 0`);
    if (!(await waitFor(asking))) log.push(`${lang}: no forgive question after round 1`);
    await clickBubble(false);
    await wait(1800);
    kneelShots.push(await shot('kneel-2'));
    if (!(await waitFor(asking))) log.push(`${lang}: no forgive question after round 2`);
    await clickBubble(false);
    await wait(2500);
    kneelShots.push(await shot('kneel-3-gift'));
    // 送完花和奶茶再跪下，举起「最爱你」
    await waitFor(`__pet.brain.task?.name === 'kneel'`, 15000);
    await wait(1600);
    kneelShots.push(await shot('kneel-3'));
    if (!(await waitFor(asking))) log.push(`${lang}: no forgive question after round 3`);
    await clickBubble(true);
    await wait(700);
    kneelShots.push(await shot('forgiven'));
    await wait(3500);
    await calm();
    pet.sendEvent({ type: 'mood-recorded', mood: 'angry', text: '' });
    await wait(1600);
    kneelShots.push(await shot('mood-angry'));
    await wait(1000);
    await calm();
    }

    // ---------- 小窝 ----------
    const home = openHome('overview');
    home.setContentSize(HOME_W, HOME_H);
    await wait(2500);
    const hjs = (c) => home.webContents.executeJavaScript(c);
    await hjs(`document.querySelector('.modal .btn:not(.primary)')?.click(); 0`);
    await wait(400);
    const homeShot = async (file) => {
      home.webContents.send('home:navigate', 'overview');
      await wait(1200);
      await hjs(`(document.querySelector('.main') || document.scrollingElement).scrollTop = 0; 0`);
      await capture(home, file);
    };
    const homeRaw = path.join(raw, 'home.png');
    await homeShot(homeRaw);
    const themeShots = [];
    if (!brief) for (const t of themes) {
      store.set('settings.theme', t.id);
      await wait(300);
      const f = path.join(raw, `theme-${t.id}.png`);
      await homeShot(f);
      themeShots.push({ file: f, caption: themeName(lang, t.id) });
    }
    store.set('settings.theme', 'sakura');
    home.close();
    await wait(600);

    // ---------- 拼图 ----------
    const img = nativeImage.createFromPath(homeRaw);
    fs.writeFileSync(path.join(dir, 'home.png'), img.resize({ width: HOME_W, height: HOME_H, quality: 'best' }).toPNG());
    const tiles = (files, caps) => files.map((file, i) => ({ file, caption: caps[i] }));
    await compose(lang, path.join(dir, 'pet.png'), { width: 1400, cols: 5, tileW: 264, tileH: 255, gap: 12, fit: 'cover' }, tiles(petShots, cap.pet));
    if (!brief) await compose(lang, path.join(dir, 'coax.png'), { width: 1400, cols: 5, tileW: 264, tileH: 255, gap: 12, fit: 'cover' }, tiles(coaxShots, cap.coax));
    if (!brief) await compose(lang, path.join(dir, 'kneel.png'), { width: 1000, cols: 3, tileW: 315, tileH: 304, gap: 12, fit: 'cover' }, tiles(kneelShots, cap.kneel));
    if (!brief) await compose(lang, path.join(dir, 'themes.png'), { width: 1400, cols: 3, tileW: 440, tileH: Math.round((440 * HOME_H) / HOME_W), gap: 22, fit: 'fill' }, themeShots);
    log.push(`${lang}: ok (${petShots.length} pet, ${coaxShots.length} coax, ${kneelShots.length} kneel, ${themeShots.length} themes)`);
  }

  store.set('settings.language', 'auto');
  fs.writeFileSync(path.join(out, 'readme-log.txt'), log.join('\n') + '\n');
  app.quit();
};

function themeName(lang, id) {
  try {
    return require(`../../src/shared/locales/${lang}/data.json`).themes[id] || id;
  } catch {
    return id;
  }
}

// 在不显示的窗口里排版：圆角图块 + 下面一行粗体说明，白底
async function compose(lang, file, { width, cols, tileW, tileH, gap, fit }, tiles) {
  const dir = i18n.LANGS.find((l) => l.id === lang)?.dir === 'rtl' ? 'rtl' : 'ltr';
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const cells = tiles
    .map((t) => {
      const data = 'data:image/png;base64,' + fs.readFileSync(t.file).toString('base64');
      return `<figure><div class="tile"><img src="${data}"></div><figcaption>${esc(t.caption)}</figcaption></figure>`;
    })
    .join('');
  const pad = Math.round((width - cols * tileW - (cols - 1) * gap) / 2);
  const html = `<!doctype html><html lang="${lang}" dir="${dir}"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'"><style>
    html, body { margin: 0; background: #fff; }
    body { font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "PingFang TC", "Hiragino Sans", "Apple SD Gothic Neo", "Geeza Pro", "Segoe UI", sans-serif; }
    .grid { display: grid; grid-template-columns: repeat(${cols}, ${tileW}px); column-gap: ${gap}px; row-gap: 0; padding: 16px ${pad}px 0; }
    figure { margin: 0; }
    .tile { width: ${tileW}px; height: ${tileH}px; border-radius: 10px; overflow: hidden; box-shadow: 0 1px 6px rgba(80, 60, 70, 0.14); background: #eef3f8; }
    .tile img { width: 100%; height: 100%; display: block; object-fit: ${fit}; object-position: 50% 100%; }
    figcaption { height: 44px; line-height: 38px; text-align: center; font-size: 14px; font-weight: 700; color: #4a3b42; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  </style></head><body><div class="grid">${cells}</div></body></html>`;
  const htmlFile = path.join(path.dirname(file), 'raw', path.basename(file, '.png') + '.html');
  fs.writeFileSync(htmlFile, html);
  const win = new BrowserWindow({ width, height: 400, show: false, frame: false, useContentSize: true, webPreferences: { offscreen: true } });
  try {
    await win.loadFile(htmlFile);
    await win.webContents.executeJavaScript(`Promise.all([...document.images].map((i) => i.decode())).then(() => document.fonts.ready).then(() => 0)`);
    const height = await win.webContents.executeJavaScript(`Math.ceil(document.querySelector('.grid').getBoundingClientRect().bottom)`);
    win.setContentSize(width, height);
    await wait(600);
    win.webContents.invalidate();
    await wait(300);
    let img = await win.webContents.capturePage();
    const size = img.getSize();
    if (size.width !== width) img = img.resize({ width, height, quality: 'best' });
    fs.writeFileSync(file, img.toPNG());
  } finally {
    win.destroy();
  }
}
