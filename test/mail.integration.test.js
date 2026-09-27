// 邮件的完整流程：本地起 IMAP（hoodiecrow）、SMTP（smtp-server）和接推送的 http 服务器，
// 收他的信、回确认邮件、去重、「来接我」、把用法发给他、出错时的说明。
const test = require('node:test');
const { before, after } = require('node:test');
const assert = require('node:assert');
const Module = require('module');
const http = require('http');
const os = require('os');
const path = require('path');

// 假的 electron：safeStorage 做个可逆的「加密」，推送用 node 自带的 fetch
const fakeElectron = {
  safeStorage: {
    isEncryptionAvailable: () => true,
    encryptString: (s) => Buffer.from('ENC:' + s, 'utf8'),
    decryptString: (b) => b.toString('utf8').replace(/^ENC:/, ''),
  },
  net: { fetch: (...args) => fetch(...args) },
};
const origLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === 'electron') return fakeElectron;
  return origLoad.call(this, request, parent, isMain);
};

const hoodiecrow = require('hoodiecrow-imap');
const { SMTPServer } = require('smtp-server');
const { simpleParser } = require('mailparser');
const { ImapFlow } = require('imapflow');
const { createMail, stripSecrets } = require('../src/main/mail');
const { Store } = require('../src/main/store');
const { createDefaults } = require('../src/main/defaults');
const letters = require('../src/main/letters');
const i18n = require('../src/main/i18n');
const C = require('../src/shared/common');

const t = i18n.t;
const PET = 'pet@example.com';
const PASS = 'auth-code-7x9';
const nextYear = new Date().getFullYear() + 1;

const enc = (s) => `=?UTF-8?B?${Buffer.from(s, 'utf8').toString('base64')}?=`;
function rawMail({ from, name, subject, body, id, date = new Date() }) {
  return [
    `From: ${name ? `${enc(name)} <${from}>` : from}`,
    `To: ${PET}`,
    `Subject: ${enc(subject)}`,
    `Message-ID: <${id}@example.com>`,
    `Date: ${date.toUTCString()}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=utf-8',
    'Content-Transfer-Encoding: base64',
    '',
    Buffer.from(body, 'utf8').toString('base64'),
  ].join('\r\n');
}

const listen = (server, ...args) => new Promise((resolve) => server.listen(0, '127.0.0.1', ...args, resolve));

function imapServer(messages, uidvalidity = 7) {
  return hoodiecrow({
    plugins: ['ID', 'IDLE', 'UNSELECT', 'ENABLE', 'CONDSTORE', 'SPECIAL-USE', 'LITERALPLUS'],
    id: { name: 'hoodiecrow' },
    users: { [PET]: { password: PASS } },
    storage: { INBOX: { uidvalidity, messages: messages.map((raw) => ({ raw, flags: [] })) } },
  });
}

// 收到的邮件（SMTP）和推送请求
const sent = [];
const pushes = [];
let imap;
let smtp;
let web;
let store;
let mail;
const delivered = [];

const HIS = [
  rawMail({ from: 'Him@Example.com', name: '豪豪', subject: '今天也想你', body: '下班早点回家，我给你做好吃的。', id: 'm1' }),
  rawMail({ from: 'him@example.com', name: '豪豪', subject: `Re: 【${nextYear}-02-14】情人节快乐`, body: '这封要到情人节才能拆开哦。', id: 'm2' }),
];
const STRANGER = rawMail({ from: 'stranger@spam.com', subject: '中奖通知', body: '点击领取', id: 'm3' });

before(async () => {
  imap = imapServer([HIS[0], STRANGER, HIS[1]]);
  await new Promise((resolve) => imap.listen(0, '127.0.0.1', resolve));
  smtp = new SMTPServer({
    authOptional: false,
    allowInsecureAuth: true,
    disabledCommands: ['STARTTLS'],
    onAuth: (auth, _session, cb) => (auth.username === PET && auth.password === PASS ? cb(null, { user: auth.username }) : cb(new Error('Invalid username or password'))),
    onData(stream, session, cb) {
      const chunks = [];
      stream.on('data', (d) => chunks.push(d));
      stream.on('end', async () => {
        sent.push({ to: session.envelope.rcptTo.map((r) => r.address), mail: await simpleParser(Buffer.concat(chunks)) });
        cb();
      });
    },
    logger: false,
  });
  await listen(smtp);
  web = http.createServer((req, res) => {
    pushes.push(new URL(req.url, 'http://x'));
    res.end('ok');
  });
  await listen(web);

  store = new Store(path.join(os.tmpdir(), `mochi-mail-${process.pid}-${Math.random()}.json`), createDefaults({}));
  store.saveNow = () => {};
  mail = createMail({ store, version: '1.0.0', onLetters: (list) => delivered.push(...list) });
  const r = mail.save({
    address: PET,
    password: PASS,
    server: 'custom',
    imap: { host: '127.0.0.1', port: imap.server.address().port, secure: false },
    smtp: { host: '127.0.0.1', port: smtp.server.address().port, secure: false },
    allow: '豪豪 <Him@Example.com>',
    pushUrl: `http://127.0.0.1:${web.address().port}/push?title={title}&body={body}`,
  });
  assert.equal(r.ok, true, r.error);
});

after(async () => {
  mail.stop();
  await new Promise((r) => imap.close(r));
  await new Promise((r) => smtp.close(r));
  await new Promise((r) => web.close(r));
});

test('设置：授权码和推送网址加密存，给页面的只有 hasPass、hasPush', () => {
  const m = store.get('mail');
  assert.match(m.passEnc, /^enc:/);
  assert.match(m.pushEnc, /^enc:/);
  assert.ok(!JSON.stringify(m).includes(PASS));
  const g = mail.get();
  assert.equal('passEnc' in g || 'pushEnc' in g || 'password' in g || 'pushUrl' in g, false);
  assert.equal(g.hasPass, true);
  assert.equal(g.hasPush, true);
  assert.equal(g.encryption, true);
  assert.equal(g.ready, true);
  assert.equal(g.resolved.provider, 'custom');
  const shown = mail.redact(store.data);
  assert.equal('passEnc' in shown.mail || 'pushEnc' in shown.mail, false);
  assert.equal(shown.mail.hasPass, true);
  assert.equal(store.get('mail.passEnc').startsWith('enc:'), true, 'redact 不改原数据');
  const exported = stripSecrets(JSON.parse(JSON.stringify(store.data)));
  assert.equal('passEnc' in exported.mail || 'pushEnc' in exported.mail, false);
  // 推送网址不对：不存，返回错误
  const bad = mail.save({ pushUrl: 'ftp://example.com' });
  assert.equal(bad.ok, false);
  assert.equal(bad.error, t('main.mail.error.pushUrl'));
  assert.equal(mail.get().hasPush, true);
  // 不认识的字段、运行状态不能从页面改
  mail.save({ lastUid: 99, seen: ['x'], interval: 7 });
  assert.equal(store.get('mail.lastUid'), 0);
  assert.equal(store.get('mail.interval'), 5);
});

test('测试连接：两边都能登录；授权码不对时说明登录失败', async () => {
  const good = await mail.test();
  assert.deepEqual(good, { ok: true, imap: { ok: true, error: '' }, smtp: { ok: true, error: '' } });
  mail.save({ password: 'wrong' });
  const bad = await mail.test();
  assert.equal(bad.ok, false);
  assert.equal(bad.imap.error, t('main.mail.error.auth'));
  assert.equal(bad.smtp.error, t('main.mail.error.auth'));
  mail.save({ password: PASS });
  assert.equal(mail.get().hasPass, true);
});

test('收信：他的两封进信箱（一封定了日期），陌生人的不进；标成已读；各回一封确认邮件；马上递信', async () => {
  const r = await mail.check();
  assert.deepEqual(r, { ok: true, added: 2, error: '' });
  const got = store.get('letters.custom');
  assert.equal(got.length, 2);
  const [a, b] = got;
  assert.equal(a.title, '今天也想你');
  assert.equal(a.body, '下班早点回家，我给你做好吃的。');
  assert.equal(a.unlock, '');
  assert.equal(a.from, '豪豪');
  assert.equal(a.source, 'mail');
  assert.equal(a.mailFrom, 'him@example.com');
  assert.match(a.id, /^mail-[0-9a-f]{12}$/);
  assert.equal(b.title, '情人节快乐');
  assert.equal(b.unlock, `${nextYear}-02-14`);
  assert.ok(!got.some((l) => /中奖/.test(l.title)));
  // 他的标成已读，陌生人的不动
  const flags = imap.storage.INBOX.messages.map((m) => m.flags.includes('\\Seen'));
  assert.deepEqual(flags, [true, false, true]);
  // 确认邮件
  assert.equal(sent.length, 2);
  for (const s of sent) assert.deepEqual(s.to, ['him@example.com']);
  const [r1, r2] = sent.map((s) => s.mail);
  assert.equal(r1.inReplyTo, '<m1@example.com>');
  assert.equal(r2.inReplyTo, '<m2@example.com>');
  assert.equal(r1.from.value[0].address, PET);
  assert.equal(r1.from.value[0].name, '糯米');
  assert.equal(r1.text.trim(), t('main.mail.receipt.body', { pet: '糯米', nick: '宝贝', title: '今天也想你' }));
  assert.equal(r2.text.trim(), t('main.mail.receipt.bodyLater', { pet: '糯米', nick: '宝贝', title: '情人节快乐', date: i18n.fmtDate(C.parseKey(`${nextYear}-02-14`)) }));
  // 马上递信、状态
  assert.deepEqual(delivered.map((l) => l.title), ['今天也想你', '情人节快乐']);
  const m = store.get('mail');
  assert.equal(m.lastCount, 2);
  assert.equal(m.lastError, '');
  assert.ok(m.lastOk >= m.lastCheck && m.lastCheck > 0);
  assert.equal(m.uidValidity, '7');
  assert.equal(m.lastUid, 3);
  assert.deepEqual(m.seen, ['<m1@example.com>', '<m2@example.com>']);
});

test('再收一次不会重复', async () => {
  const r = await mail.check();
  assert.deepEqual(r, { ok: true, added: 0, error: '' });
  assert.equal(store.get('letters.custom').length, 2);
  assert.equal(sent.length, 2);
  assert.equal(delivered.length, 2);
});

test('uidValidity 变了（UID 重新编号）也不会重复', async () => {
  imap.storage.INBOX.uidvalidity = 99;
  const r = await mail.check();
  assert.deepEqual(r, { ok: true, added: 0, error: '' });
  assert.equal(store.get('mail.uidValidity'), '99');
  assert.equal(store.get('letters.custom').length, 2);
  // 她删掉了一封邮件寄来的信：以后也不会再收回来
  store.set('letters.custom', store.get('letters.custom').slice(1));
  imap.storage.INBOX.uidvalidity = 100;
  assert.equal((await mail.check()).added, 0);
  assert.equal(store.get('letters.custom').length, 1);
});

test('暗号：没写暗号的信不收（记下原因），写了的收下并去掉暗号；署名用她设置的「你的署名」', async () => {
  const client = new ImapFlow({ host: '127.0.0.1', port: imap.server.address().port, secure: false, auth: { user: PET, pass: PASS }, logger: false });
  await client.connect();
  await client.append('INBOX', rawMail({ from: 'him@example.com', subject: '没暗号', body: '你好', id: 's1' }));
  await client.append('INBOX', rawMail({ from: 'him@example.com', subject: '小猫 周末去看海', body: '拆开日期：12-25\n小猫说：周末见', id: 's2' }));
  await client.logout();
  mail.save({ secret: '小猫' });
  store.set('owner.sender', '老公');
  const before = sent.length;
  const r = await mail.check();
  assert.equal(r.ok, true);
  assert.equal(r.added, 1);
  assert.equal(r.error, t('main.mail.error.noSecret'));
  const last = store.get('letters.custom').at(-1);
  assert.equal(last.title, '周末去看海');
  assert.equal(last.body, '说：周末见');
  assert.equal(last.from, '老公');
  assert.equal(last.unlock, C.nextYearly('12-25').date);
  assert.equal(store.get('mail.lastError'), t('main.mail.error.noSecret'));
  assert.equal(sent.length, before + 1);
  mail.save({ secret: '' });
  store.set('owner.sender', '');
});

test('「来接我」：发一封邮件、推送一条，内容对；60 秒内再点返回 tooSoon', async () => {
  store.set('owner.nickname', '小宝贝');
  const before = sent.length;
  const r = await mail.pickup({ when: '30', note: '  在公司门口\n等你  ' });
  assert.deepEqual(r, { ok: true, via: ['mail', 'push'], error: '' });
  assert.equal(sent.length, before + 1);
  const msg = sent.at(-1);
  assert.deepEqual(msg.to, ['him@example.com']);
  const vars = { nick: '小宝贝', pet: '糯米', note: '在公司门口 等你' };
  assert.equal(msg.mail.subject, t('main.mail.pickup.subject30', vars));
  assert.match(msg.mail.text, /小宝贝在 \d\d:\d\d 叫你来接她/);
  assert.match(msg.mail.text, /在公司门口 等你/);
  assert.match(msg.mail.text.trim(), /——糯米$/);
  assert.equal(pushes.length, 1);
  assert.equal(pushes[0].pathname, '/push');
  assert.equal(pushes[0].searchParams.get('title'), msg.mail.subject);
  assert.equal(pushes[0].searchParams.get('body'), msg.mail.text.trim());
  assert.ok(store.get('mail.lastPickup') > 0);
  // 马上再点
  const again = await mail.pickup({ when: 'now' });
  assert.equal(again.ok, false);
  assert.equal(again.tooSoon, true);
  assert.equal(again.error, t('main.mail.error.tooSoon'));
  assert.equal(sent.length, before + 1);
  assert.equal(pushes.length, 1);
  store.set('owner.nickname', '');
});

test('「来接我」：推送失败、邮件成功也算发出去了，带上推送失败的原因；通知发到 notifyTo', async () => {
  const closed = http.createServer();
  await listen(closed);
  const port = closed.address().port;
  await new Promise((r) => closed.close(r));
  mail.save({ pushUrl: `http://127.0.0.1:${port}/{title}`, notifyTo: '接我的人 <Driver@Example.com>' });
  store.set('mail.lastPickup', 0);
  const r = await mail.pickup({ when: '60' });
  assert.equal(r.ok, true);
  assert.deepEqual(r.via, ['mail']);
  assert.equal(r.error, t('main.mail.error.pushFailed', { error: t('main.mail.error.connect') }));
  assert.deepEqual(sent.at(-1).to, ['driver@example.com']);
  assert.equal(sent.at(-1).mail.subject, t('main.mail.pickup.subject60', { nick: '宝贝' }));
  mail.save({ pushUrl: '', notifyTo: '' });
  assert.equal(mail.get().hasPush, false);
});

test('把用法发给他：发到允许名单里的第一个邮箱', async () => {
  mail.save({ allow: 'first@example.com, him@example.com', secret: '小猫' });
  const r = await mail.sendGuide();
  assert.deepEqual(r, { ok: true, to: 'first@example.com', error: '' });
  const g = sent.at(-1);
  assert.deepEqual(g.to, ['first@example.com']);
  assert.equal(g.mail.subject, t('main.mail.guide.subject', { nick: '宝贝' }));
  for (const part of [PET, '拆开日期：', '小猫', 'him@example.com']) assert.ok(g.mail.text.includes(part), part);
  mail.save({ allow: '豪豪 <Him@Example.com>', secret: '' });
});

test('出错时：没设置好、连不上服务器，说明存进 lastError', async () => {
  // 连不上：换一个没人听的端口
  const closed = http.createServer();
  await listen(closed);
  const port = closed.address().port;
  await new Promise((r) => closed.close(r));
  const imapConf = store.get('mail.imap');
  mail.save({ imap: { ...imapConf, port } });
  const r = await mail.check();
  assert.deepEqual(r, { ok: false, added: 0, error: t('main.mail.error.connect') });
  assert.equal(store.get('mail.lastError'), t('main.mail.error.connect'));
  mail.save({ imap: imapConf });
  // 没填授权码
  mail.save({ password: '' });
  assert.equal(mail.get().hasPass, false);
  assert.deepEqual(await mail.check(), { ok: false, added: 0, error: t('main.mail.error.notReady') });
  store.set('mail.lastPickup', 0);
  assert.equal((await mail.pickup({})).error, t('main.mail.error.notReady'));
  assert.equal((await mail.sendGuide()).error, t('main.mail.error.notReady'));
  mail.save({ password: PASS });
  // Outlook：要用微软账号登录，没填应用 ID 时说明原因
  mail.save({ server: 'auto', address: 'pet@outlook.com' });
  assert.equal(mail.get().resolved.provider, 'outlook');
  assert.equal(mail.get().auth, 'oauth');
  assert.equal((await mail.check()).error, t('main.mail.error.msNoClientId'));
  assert.deepEqual(await mail.msLoginStart(), { ok: false, error: t('main.mail.error.msNoClientId') });
  // 没认出的邮箱
  mail.save({ address: 'pet@company.example' });
  assert.equal((await mail.check()).error, t('main.mail.error.unknownServer'));
  mail.save({ server: 'custom', address: PET });
});

test('同一时间只跑一个收信任务', async () => {
  const [a, b] = [mail.check(), mail.check()];
  assert.equal(a, b);
  assert.equal((await a).ok, true);
});

test('信件：邮件寄来的信不导出；改信封时保留来源', () => {
  const list = [
    { id: 'my-1', title: '我写的', from: '', unlock: '', body: 'a', createdAt: 1 },
    { id: 'mail-1', title: '邮件', from: '豪豪', unlock: '', body: 'b', createdAt: 2, source: 'mail', mailFrom: 'him@example.com' },
  ];
  assert.deepEqual(letters.writtenHere(list).map((l) => l.id), ['my-1']);
  assert.deepEqual(JSON.parse(letters.exportLetters(list)).letters.map((l) => l.id), ['my-1']);
  const r = letters.saveLetter(list, { id: 'mail-1', title: '改了标题', from: '豪豪', unlock: '' });
  assert.equal(r.ok, true);
  assert.equal(r.letter.source, 'mail');
  assert.equal(r.letter.mailFrom, 'him@example.com');
  assert.equal(r.letter.body, 'b');
});
