// 邮件：在主进程里起本地 IMAP（hoodiecrow）、SMTP（smtp-server）和接推送的 http 服务器（端口都由系统分配），
// 收他的两封信（一封马上能拆、一封拆开日期在以后）和一封陌生人的信，截宠物递信的气泡；
// 检查信箱、已读标记、确认邮件、再收一次不重复，再从宠物窗口（preload 的 window.mochi.mail）叫他来接我。
// 结果写进 mail-log.txt，失败的行以 FAIL 开头。
const path = require('path');
const fs = require('fs');
const http = require('http');
const hoodiecrow = require('hoodiecrow-imap');
const { SMTPServer } = require('smtp-server');
const { simpleParser } = require('mailparser');
const { seal } = require('../../src/main/mail');

const out = process.env.SNAP_DIR || '/tmp';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const PET = 'pet@example.com';
const PASS = 'auth-code-7x9';

const enc = (s) => `=?UTF-8?B?${Buffer.from(s, 'utf8').toString('base64')}?=`;
const rawMail = ({ from, name, subject, body, id }) =>
  [
    `From: ${name ? `${enc(name)} <${from}>` : from}`,
    `To: ${PET}`,
    `Subject: ${enc(subject)}`,
    `Message-ID: <${id}@example.com>`,
    `Date: ${new Date().toUTCString()}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=utf-8',
    'Content-Transfer-Encoding: base64',
    '',
    Buffer.from(body, 'utf8').toString('base64'),
  ].join('\r\n');

module.exports = async ({ app, store, scheduler, pet, mail, capture }) => {
  const log = [];
  const check = (name, ok, extra = '') => log.push(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? '  ' + extra : ''}`);
  const year = new Date().getFullYear() + 1;
  const servers = [];
  try {
    // 只看邮件：别的定时事件（问候、提醒）先停掉，自我介绍信当已经读过
    scheduler.goAway = () => {};
    scheduler.tick = () => {};
    store.set('runtime.welcomed', true);
    store.set('runtime.profileDone', true);
    store.set('letters.read', { hello: Date.now() });
    store.set('letters.notified', { hello: Date.now() });
    store.set('owner.sender', '豪豪');

    // ---------- 本地服务器 ----------
    const imap = hoodiecrow({
      plugins: ['ID', 'IDLE', 'UNSELECT', 'ENABLE', 'CONDSTORE', 'SPECIAL-USE', 'LITERALPLUS'],
      id: { name: 'hoodiecrow' },
      users: { [PET]: { password: PASS } },
      storage: {
        INBOX: {
          messages: [
            { raw: rawMail({ from: 'him@example.com', name: '豪豪', subject: '今天也想你', body: '下班早点回家，我给你做好吃的。', id: 'm1' }), flags: [] },
            { raw: rawMail({ from: 'stranger@spam.com', subject: '中奖通知', body: '点击领取大奖', id: 'm2' }), flags: [] },
            { raw: rawMail({ from: 'Him@Example.com', name: '豪豪', subject: `【${year}-02-14】情人节快乐`, body: '这封要到情人节才能拆开哦。', id: 'm3' }), flags: [] },
          ],
        },
      },
    });
    await new Promise((r) => imap.listen(0, '127.0.0.1', r));
    servers.push((cb) => imap.close(cb));
    const sent = [];
    const smtp = new SMTPServer({
      allowInsecureAuth: true,
      disabledCommands: ['STARTTLS'],
      logger: false,
      onAuth: (auth, _s, cb) => (auth.username === PET && auth.password === PASS ? cb(null, { user: PET }) : cb(new Error('bad auth'))),
      onData(stream, session, cb) {
        const chunks = [];
        stream.on('data', (d) => chunks.push(d));
        stream.on('end', async () => {
          sent.push({ to: session.envelope.rcptTo.map((x) => x.address), mail: await simpleParser(Buffer.concat(chunks)) });
          cb();
        });
      },
    });
    await new Promise((r) => smtp.listen(0, '127.0.0.1', r));
    servers.push((cb) => smtp.close(cb));
    const pushes = [];
    const web = http.createServer((req, res) => {
      pushes.push(new URL(req.url, 'http://x'));
      res.end('ok');
    });
    await new Promise((r) => web.listen(0, '127.0.0.1', r));
    servers.push((cb) => web.close(cb));
    log.push(`ports: imap ${imap.server.address().port}, smtp ${smtp.server.address().port}, push ${web.address().port}`);

    // 授权码和推送网址用不加密的存法（不碰系统钥匙串）；自动收信不开，场景里手动收
    store.set('mail', {
      ...store.get('mail'),
      enabled: false,
      address: PET,
      passEnc: seal(PASS, { plain: true }),
      pushEnc: seal(`http://127.0.0.1:${web.address().port}/push?title={title}&body={body}`, { plain: true }),
      server: 'custom',
      imap: { host: '127.0.0.1', port: imap.server.address().port, secure: false },
      smtp: { host: '127.0.0.1', port: smtp.server.address().port, secure: false },
      allow: '豪豪 <him@example.com>',
      receipt: true,
    });

    const pjs = (code) => pet.win.webContents.executeJavaScript(code);
    await wait(2500);
    await pjs(`__pet.brain.scheduleIdle = () => {}; clearTimeout(__pet.brain.idleTimer); __pet.bubble.dismiss(); __pet.bubble.clearQueue(); 0`);
    await wait(500);

    // ---------- 收信 ----------
    const r1 = await mail.check();
    check('收信：新增 2 封', r1.ok && r1.added === 2 && !r1.error, JSON.stringify(r1));
    await wait(1600);
    await capture(pet.win, path.join(out, 'mail-01-letter.png'), 'linear-gradient(#8fb6de,#c3d8ee)');
    const bubble = await pjs(`document.querySelector('#bubble:not([hidden]) .text')?.textContent || ''`);
    check('宠物递信的气泡', bubble.includes('今天也想你'), JSON.stringify(bubble));

    const fromMail = (store.get('letters.custom') || []).filter((l) => l.source === 'mail');
    check('信箱里多了 2 封邮件寄来的信', fromMail.length === 2, JSON.stringify(fromMail.map((l) => [l.title, l.from, l.unlock])));
    check('陌生人的信没进来', !(store.get('letters.custom') || []).some((l) => /中奖/.test(l.title + l.body)));
    const state = scheduler.lettersState();
    const later = state.find((l) => l.title === '情人节快乐');
    check('定了日期的那封还封着', !!later && !later.unlocked && later.daysLeft > 0 && later.body === undefined && later.source === 'mail', JSON.stringify(later && { unlocked: later.unlocked, daysLeft: later.daysLeft }));
    const flags = imap.storage.INBOX.messages.map((m) => m.flags.includes('\\Seen'));
    check('他的两封标成已读，陌生人的没动', JSON.stringify(flags) === '[true,false,true]', JSON.stringify(flags));
    const receipts = sent.filter((s) => s.mail.inReplyTo);
    check(
      '确认邮件发出去了',
      receipts.length === 2 && receipts.every((s) => s.to.join() === 'him@example.com') && receipts.map((s) => s.mail.inReplyTo).join() === '<m1@example.com>,<m3@example.com>',
      JSON.stringify(receipts.map((s) => s.mail.subject)),
    );
    check('确认邮件的内容', receipts.length === 2 && receipts[0].mail.text.includes('今天也想你') && /会在 .+ 那天交给她/.test(receipts[1].mail.text), JSON.stringify(receipts.map((s) => s.mail.text.trim())));

    // ---------- 从宠物窗口调用（preload 的接口） ----------
    const shown = await pjs(`window.mochi.getData().then((d) => ({ keys: Object.keys(d.mail), hasPass: d.mail.hasPass, hasPush: d.mail.hasPush, hasMsToken: d.mail.hasMsToken }))`);
    check(
      '页面拿到的数据里没有授权码、推送网址和微软的登录凭据',
      !['passEnc', 'pushEnc', 'msTokenEnc'].some((k) => shown.keys.includes(k)) && shown.hasPass === true && shown.hasPush === true && shown.hasMsToken === false,
      JSON.stringify(shown),
    );
    const sentBefore = sent.length;
    const r2 = await pjs(`window.mochi.mail.check()`);
    check('再收一次不重复', r2.ok && r2.added === 0 && store.get('letters.custom').filter((l) => l.source === 'mail').length === 2 && sent.length === sentBefore, JSON.stringify(r2));

    const r3 = await pjs(`window.mochi.mail.pickup({ when: '30', note: '在公司门口等你' })`);
    check('来接我：邮件和推送都发出去了', r3.ok && JSON.stringify(r3.via) === '["mail","push"]' && !r3.error, JSON.stringify(r3));
    const pick = sent.at(-1);
    const pickText = pick ? pick.mail.text.trim() : '';
    check(
      '来接我：邮件内容',
      !!pick && pick.to.join() === 'him@example.com' && pick.mail.subject.includes('半小时后') && pickText.includes('在公司门口等你') && pickText.endsWith('——糯米'),
      JSON.stringify(pick && { to: pick.to, subject: pick.mail.subject, text: pickText }),
    );
    check('来接我：推送收到了', pushes.length === 1 && pushes[0].searchParams.get('title') === (pick && pick.mail.subject), JSON.stringify(pushes.map((u) => u.searchParams.get('title'))));
    const r4 = await pjs(`window.mochi.mail.pickup({ when: 'now' })`);
    check('来接我：一分钟内再点只提示，不重复发', r4.ok === false && r4.tooSoon === true && pushes.length === 1, JSON.stringify(r4));
    check('状态', store.get('mail.lastCount') === 0 && store.get('mail.lastError') === '' && store.get('mail.lastPickup') > 0, JSON.stringify({ lastCount: store.get('mail.lastCount'), lastError: store.get('mail.lastError') }));
    await capture(pet.win, path.join(out, 'mail-02-after.png'), 'linear-gradient(#8fb6de,#c3d8ee)');
  } catch (err) {
    check('场景出错', false, err && err.stack);
  } finally {
    for (const close of servers) await new Promise((r) => close(r));
    fs.writeFileSync(path.join(out, 'mail-log.txt'), log.join('\n') + '\n');
    app.quit();
  }
};
