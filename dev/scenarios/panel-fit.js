// 快捷面板按钮上的字：7 种语言、每一页，字都在自己的格子里，不压到旁边的按钮。
// 再把字距加宽，模拟 Windows 上更宽的字体（Malgun Gothic、Segoe UI），同样检查一遍。
// 结果写进 panel-fit.txt（PASS / FAIL），每种语言的主页截一张图。
const path = require('path');
const fs = require('fs');
const i18n = require('../../src/main/i18n');

const out = process.env.SNAP_DIR || '/tmp';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const VIEWS = ['main', 'coax', 'food', 'mood'];
// 加宽的程度：0 是本机字体；1.2px 大约让一个韩文字宽 10%
const SPACING = [0, 1.2];

module.exports = async ({ app, store, pet, capture }) => {
  const lines = [];
  const check = (ok, name, detail = '') => lines.push(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? '  ' + detail : ''}`);
  store.set('runtime.welcomed', true);
  store.set('runtime.profileDone', true);
  store.set('owner.sender', '');
  const pjs = (c) => pet.win.webContents.executeJavaScript(c);
  await wait(2500);
  await pjs(`__pet.brain.scheduleIdle = () => {}; clearTimeout(__pet.brain.idleTimer); 0`);

  // 每个按钮：字的实际宽度不超过自己的框；相邻按钮的字不重叠；折行的最多两行
  const measure = `(() => {
    const res = [];
    const lbls = [...document.querySelectorAll('#panel .pbtn .lbl')];
    const boxes = lbls.map((l) => {
      const r = document.createRange();
      r.selectNodeContents(l);
      const rects = [...r.getClientRects()];
      const left = Math.min(...rects.map((x) => x.left)), right = Math.max(...rects.map((x) => x.right));
      return { text: l.textContent, left, right, top: l.getBoundingClientRect().top, box: l.getBoundingClientRect(), wrap: l.classList.contains('wrap'), size: getComputedStyle(l).fontSize, lines: Math.round(l.getBoundingClientRect().height / parseFloat(getComputedStyle(l).lineHeight || 13)) };
    });
    boxes.forEach((b, i) => {
      if (b.right - b.left > b.box.width + 0.5 && !b.wrap) res.push('overflow ' + b.text + ' ' + Math.round(b.right - b.left) + '>' + Math.round(b.box.width));
      const n = boxes[i + 1];
      if (n && Math.abs(n.top - b.top) < 4) {
        const [a, c] = document.documentElement.dir === 'rtl' ? [n, b] : [b, n];
        if (a.right > c.left + 0.5) res.push('overlap ' + a.text + ' | ' + c.text);
      }
    });
    // 面板不能被撑宽到窗口外面
    const pr = document.getElementById('panel').getBoundingClientRect();
    if (pr.left < -0.5 || pr.right > document.documentElement.clientWidth + 0.5) res.push('panel outside window ' + Math.round(pr.left) + '..' + Math.round(pr.right));
    return { res, info: boxes.map((b) => b.text + (b.wrap ? '[2 lines]' : b.size !== '10.5px' ? '[' + b.size + ']' : '')).join(', ') };
  })()`;

  for (const { id: lang } of i18n.LANGS) {
    store.set('settings.language', lang);
    await wait(1000);
    for (const spacing of SPACING) {
      await pjs(`(() => { let s = document.getElementById('fit-test'); if (!s) { s = document.createElement('style'); s.id = 'fit-test'; document.head.append(s); } s.textContent = '.pbtn .lbl { letter-spacing: ${spacing}px }'; })(); 0`);
      for (const view of VIEWS) {
        await pjs(`__pet.panel.open('${view}'); 0`);
        await wait(500);
        const r = await pjs(measure);
        check(!r.res.length, `${lang} ${view}${spacing ? ' (wide font)' : ''}`, r.res.length ? r.res.join('; ') : r.info);
        if (view === 'main') await capture(pet.win, path.join(out, `${lang}-main${spacing ? '-wide' : ''}.png`), 'linear-gradient(#8fb6de,#c3d8ee)');
        await pjs(`__pet.panel.close(); 0`);
        await wait(300);
      }
    }
  }
  await pjs(`document.getElementById('fit-test')?.remove(); 0`);
  store.set('settings.language', 'auto');
  fs.writeFileSync(path.join(out, 'panel-fit.txt'), lines.join('\n') + '\n');
  app.quit();
};
