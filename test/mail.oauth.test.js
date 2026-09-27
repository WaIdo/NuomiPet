// Outlook 等微软邮箱：用微软账号登录（OAuth2 设备代码流程）。本地 http 服务器模拟微软的 devicecode / token 端点，
// hoodiecrow（XOAUTH2）和 smtp-server（XOAUTH2）验证带 access_token 的收发。
const test = require('node:test');
const { before, after } = require('node:test');
const assert = require('node:assert');
const Module = require('module');
const http = require('http');
const os = require('os');
const path = require('path');

const opened = [];
const fakeElectron = {
  safeStorage: {
    isEncryptionAvailable: () => true,
    encryptString: (s) => Buffer.from('ENC:' + s, 'utf8'),
    decryptString: (b) => b.toString('utf8').replace(/^ENC:/, ''),
  },
  net: { fetch: (...args) => fetch(...args) },
  shell: { openExternal: (url) => opened.push(url) },
};
const origLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === 'electron') return fakeElectron;
  return origLoad.call(this, request, parent, isMain);
};

const hoodiecrow = require('hoodiecrow-imap');
const { SMTPServer } = require('smtp-server');
const { simpleParser } = require('mailparser');
const { createMail, unseal, MS_SCOPE } = require('../src/main/mail');
const { Store } = require('../src/main/store');
const { createDefaults } = require('../src/main/defaults');
const i18n = require('../src/main/i18n');

const t = i18n.t;
const PET = 'pet@outlook.com';
const HOUR = 3600 * 1000;
const enc = (s) => `=?UTF-8?B?${Buffer.from(s, 'utf8').toString('base64')}?=`;
const rawMail = ({ from, subject, body, id }) =>
  [`From: ${from}`, `To: ${PET}`, `Subject: ${enc(subject)}`, `Message-ID: <${id}@example.com>`, `Date: ${new Date().toUTCString()}`, 'MIME-Version: 1.0', 'Content-Type: text/plain; charset=utf-8', 'Content-Transfer-Encoding: base64', '', Buffer.from(body).toString('base64')].join('\r\n');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const listen = (server) => new Promise((r) => server.listen(0, '127.0.0.1', r));

// ---------- 假的微软 ----------
const ms = {
  requests: [], // { path, form, at }
  deviceSeq: 0,
  device: () => ({ device_code: `dc-${++ms.deviceSeq}`, user_code: 'ABCD-1234', verification_uri: 'https://microsoft.com/devicelogin', expires_in: 900, interval: 1 }),
  polls: [], // 设备代码轮询依次返回的结果；用完了一直 pending
  refresh: () => ({ error: 'invalid_grant' }),
};
const msServer = http.createServer((req, res) => {
  let body = '';
  req.on('data', (d) => (body += d));
  req.on('end', () => {
    const form = Object.fromEntries(new URLSearchParams(body));
    const p = new URL(req.url, 'http://x').pathname;
    ms.requests.push({ path: p, form, at: Date.now() });
    let out;
    if (p === '/devicecode') out = ms.device();
    else if (form.grant_type === 'refresh_token') out = ms.refresh(form);
    else out = ms.polls.length ? ms.polls.shift() : { error: 'authorization_pending' };
    res.writeHead(out.error ? 400 : 200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(out));
  });
});

// ---------- 用 XOAUTH2 登录的收发服务器 ----------
let token = 'at-1'; // 两边都认这个 access_token
const smtpLogins = [];
const sent = [];
const users = { [PET]: { password: 'not-used', xoauth2: { accessToken: token } } };
const imap = hoodiecrow({
  plugins: ['ID', 'SASL-IR', 'XOAUTH2', 'UNSELECT', 'ENABLE', 'LITERALPLUS'],
  users,
  storage: { INBOX: { messages: [{ raw: rawMail({ from: 'him@example.com', subject: '想你', body: '今天也想你', id: 'o1' }), flags: [] }] } },
});
const smtp = new SMTPServer({
  authMethods: ['XOAUTH2'],
  allowInsecureAuth: true,
  disabledCommands: ['STARTTLS'],
  logger: false,
  onAuth(auth, _s, cb) {
    smtpLogins.push({ method: auth.method, user: auth.username, accessToken: auth.accessToken });
    if (auth.method === 'XOAUTH2' && auth.username === PET && auth.accessToken === token) cb(null, { user: PET });
    else cb(new Error('Invalid token'));
  },
  onData(stream, session, cb) {
    const chunks = [];
    stream.on('data', (d) => chunks.push(d));
    stream.on('end', async () => {
      sent.push({ to: session.envelope.rcptTo.map((r) => r.address), mail: await simpleParser(Buffer.concat(chunks)) });
      cb();
    });
  },
});
const setToken = (next) => {
  token = next;
  users[PET].xoauth2.accessToken = next;
};

let store;
let mail;

// 等 mail.ms 的状态从 waiting 变成别的
async function settled(ms = 5000) {
  const until = Date.now() + ms;
  while (store.get('mail.ms.state') === 'waiting' && Date.now() < until) await wait(10);
  return store.get('mail.ms');
}

// 把「现在」往后拨（让 access_token 过期），用完拨回来
async function later(offset, fn) {
  const real = Date.now;
  Date.now = () => real() + offset;
  try {
    return await fn();
  } finally {
    Date.now = real;
  }
}

before(async () => {
  await listen(msServer);
  await new Promise((r) => imap.listen(0, '127.0.0.1', r));
  await listen(smtp);
  store = new Store(path.join(os.tmpdir(), `mochi-oauth-${process.pid}-${Math.random()}.json`), createDefaults({}));
  store.saveNow = () => {};
  mail = createMail({
    store,
    version: '1.0.0',
    msBase: `http://127.0.0.1:${msServer.address().port}`,
    overrides: {
      outlook: {
        imap: { host: '127.0.0.1', port: imap.server.address().port, secure: false },
        smtp: { host: '127.0.0.1', port: smtp.server.address().port, secure: false },
      },
    },
    timeScale: 0.01,
  });
});

after(async () => {
  mail.stop();
  await new Promise((r) => msServer.close(r));
  await new Promise((r) => imap.close(r));
  await new Promise((r) => smtp.close(r));
});

test('没填应用 ID：不能用微软账号登录，原因说清楚', async () => {
  mail.save({ address: PET, server: 'auto', allow: 'him@example.com' });
  const g = mail.get();
  assert.equal(g.auth, 'oauth');
  assert.equal(g.resolved.provider, 'outlook');
  assert.equal(g.ready, false);
  assert.deepEqual(await mail.msLoginStart(), { ok: false, error: t('main.mail.error.msNoClientId') });
  assert.equal((await mail.check()).error, t('main.mail.error.msNoClientId'));
  assert.equal(ms.requests.length, 0);
  // 填了应用 ID，还没登录
  mail.save({ msClientId: ' client-123 ' });
  assert.equal(mail.get().msClientId, 'client-123');
  assert.equal((await mail.check()).error, t('main.mail.error.msLogin'));
  assert.equal((await mail.pickup({})).error, t('main.mail.error.msLogin'));
});

test('登录：先等她同意（pending）、再 slow_down、然后成功；refresh_token 加密存', async () => {
  ms.polls = [{ error: 'authorization_pending' }, { error: 'slow_down' }, { access_token: 'at-1', refresh_token: 'rt-1', expires_in: 3600, token_type: 'Bearer' }];
  const r = await mail.msLoginStart();
  assert.deepEqual(r, { ok: true, userCode: 'ABCD-1234', verificationUri: 'https://microsoft.com/devicelogin', expiresIn: 900 });
  const waiting = store.get('mail.ms');
  assert.equal(waiting.state, 'waiting');
  assert.equal(waiting.userCode, 'ABCD-1234');
  assert.ok(waiting.expiresAt > Date.now());
  // 在浏览器里打开网址
  assert.deepEqual(mail.msOpen(), { ok: true });
  assert.deepEqual(opened, ['https://microsoft.com/devicelogin']);
  const done = await settled();
  assert.equal(done.state, 'ok');
  assert.equal(done.account, PET);
  assert.equal(done.error, '');
  // 发给微软的请求
  const [dc, ...polls] = ms.requests;
  assert.equal(dc.path, '/devicecode');
  assert.deepEqual(dc.form, { client_id: 'client-123', scope: MS_SCOPE });
  assert.equal(polls.length, 3);
  for (const p of polls) assert.deepEqual(p.form, { grant_type: 'urn:ietf:params:oauth:grant-type:device_code', client_id: 'client-123', device_code: 'dc-1' });
  // slow_down 以后等得更久（间隔加 5 秒，这里按 0.01 缩短）
  assert.ok(polls[2].at - polls[1].at >= 50, `slow_down 后的间隔 ${polls[2].at - polls[1].at}ms`);
  // 凭据加密存，页面拿不到
  const m = store.get('mail');
  assert.match(m.msTokenEnc, /^enc:/);
  assert.equal(unseal(m.msTokenEnc), 'rt-1');
  const shown = mail.redact(store.data).mail;
  assert.equal('msTokenEnc' in shown, false);
  assert.equal(shown.hasMsToken, true);
  const g = mail.get();
  assert.equal(g.hasMsToken, true);
  assert.equal(g.ready, true);
});

test('收发：IMAP 和 SMTP 都用 access_token 登录（XOAUTH2）', async () => {
  assert.deepEqual(await mail.test(), { ok: true, imap: { ok: true, error: '' }, smtp: { ok: true, error: '' } });
  const r = await mail.check();
  assert.deepEqual(r, { ok: true, added: 1, error: '' });
  assert.equal(store.get('letters.custom').at(-1).title, '想你');
  assert.equal(sent.length, 1, '确认邮件');
  assert.deepEqual(sent[0].to, ['him@example.com']);
  assert.ok(smtpLogins.length >= 2);
  for (const l of smtpLogins) assert.deepEqual(l, { method: 'XOAUTH2', user: PET, accessToken: 'at-1' });
  // 没过期：不去换新的
  assert.equal(ms.requests.filter((q) => q.form.grant_type === 'refresh_token').length, 0);
});

test('access_token 快过期时自动换新的；微软换了 refresh_token 也存下来', async () => {
  setToken('at-2');
  ms.refresh = (form) => (form.refresh_token === 'rt-1' ? { access_token: 'at-2', refresh_token: 'rt-2', expires_in: 3600 } : { error: 'invalid_grant' });
  await later(2 * HOUR, async () => {
    assert.deepEqual(await mail.test(), { ok: true, imap: { ok: true, error: '' }, smtp: { ok: true, error: '' } });
    // 同一个新的 access_token 接着用
    store.set('mail.lastPickup', 0);
    const r = await mail.pickup({ when: 'now', note: '门口见' });
    assert.deepEqual(r, { ok: true, via: ['mail'], error: '' });
  });
  const refreshes = ms.requests.filter((q) => q.form.grant_type === 'refresh_token');
  assert.equal(refreshes.length, 1);
  assert.deepEqual(refreshes[0].form, { client_id: 'client-123', grant_type: 'refresh_token', refresh_token: 'rt-1', scope: MS_SCOPE });
  assert.equal(unseal(store.get('mail.msTokenEnc')), 'rt-2');
  assert.equal(smtpLogins.at(-1).accessToken, 'at-2');
  assert.deepEqual(sent.at(-1).to, ['him@example.com']);
});

test('换新的失败（授权被撤销、过期）：要重新登录，说明清楚，凭据清掉', async () => {
  ms.refresh = () => ({ error: 'invalid_grant', error_description: 'AADSTS70000: The provided grant has expired.\r\nTrace ID: 123' });
  const r = await later(4 * HOUR, () => mail.check());
  assert.deepEqual(r, { ok: false, added: 0, error: t('main.mail.error.msRelogin') });
  const m = store.get('mail');
  assert.equal(m.ms.state, 'error');
  assert.equal(m.ms.error, t('main.mail.error.msRelogin'));
  assert.equal(m.msTokenEnc, '');
  assert.equal(m.lastError, t('main.mail.error.msRelogin'));
  assert.equal(mail.get().ready, false);
  // 之后再收信：直接说要重新登录，不再去问微软
  const before = ms.requests.length;
  assert.equal((await mail.check()).error, t('main.mail.error.msRelogin'));
  assert.equal(ms.requests.length, before);
});

test('登录没成功：代码过期、没同意、别的错误', async () => {
  ms.polls = [{ error: 'authorization_pending' }, { error: 'expired_token' }];
  assert.equal((await mail.msLoginStart()).ok, true);
  assert.deepEqual([(await settled()).state, store.get('mail.ms.error')], ['error', t('main.mail.error.msExpired')]);

  ms.polls = [{ error: 'access_denied' }];
  await mail.msLoginStart();
  assert.equal((await settled()).error, t('main.mail.error.msDenied'));

  ms.polls = [{ error: 'invalid_request', error_description: 'AADSTS90023: bad request\r\nTrace ID: abc' }];
  await mail.msLoginStart();
  assert.equal((await settled()).error, t('main.mail.error.msFailed', { error: 'AADSTS90023: bad request' }));

  // 过了有效期还没同意：这边自己停下
  const device = ms.device;
  ms.device = () => ({ ...device(), expires_in: 0.001 });
  ms.polls = [];
  await mail.msLoginStart();
  assert.equal((await settled()).error, t('main.mail.error.msExpired'));
  ms.device = device;

  // 应用 ID 不对：一开始就失败
  ms.device = () => ({ error: 'unauthorized_client', error_description: "AADSTS700016: Application with identifier 'x' was not found." });
  const r = await mail.msLoginStart();
  assert.equal(r.ok, false);
  assert.equal(r.error, t('main.mail.error.msFailed', { error: "AADSTS700016: Application with identifier 'x' was not found." }));
  assert.equal(store.get('mail.ms.state'), 'error');
  ms.device = device;
});

test('重新开始登录会停掉上一次的等待；退出登录清掉凭据；换了应用 ID 要重新登录', async () => {
  ms.polls = [];
  await mail.msLoginStart();
  const first = `dc-${ms.deviceSeq}`;
  await wait(40);
  await mail.msLoginStart();
  const second = `dc-${ms.deviceSeq}`;
  await wait(20); // 已经发出去的那一次可能还会回来
  const mark = ms.requests.length;
  await wait(60);
  const after = ms.requests.slice(mark).filter((q) => q.form.device_code);
  assert.ok(after.length > 0);
  assert.ok(after.every((q) => q.form.device_code === second), `还在问 ${first}`);
  // 退出：不再问，状态回到 idle
  assert.deepEqual(mail.msLogout(), { ok: true });
  const stopped = ms.requests.length;
  await wait(60);
  assert.equal(ms.requests.length, stopped);
  assert.deepEqual(store.get('mail.ms'), { state: 'idle', account: '', error: '', userCode: '', verificationUri: '', expiresAt: 0 });
  // 登录成功以后换了应用 ID：原来的凭据作废
  ms.polls = [{ access_token: 'at-3', refresh_token: 'rt-3', expires_in: 3600 }];
  await mail.msLoginStart();
  assert.equal((await settled()).state, 'ok');
  assert.equal(mail.get().hasMsToken, true);
  mail.save({ msClientId: 'client-456' });
  assert.equal(mail.get().hasMsToken, false);
  assert.equal(store.get('mail.ms.state'), 'idle');
  // 只在浏览器里打开微软的网址
  store.set('mail.ms', { ...store.get('mail.ms'), verificationUri: 'https://evil.example.com/devicelogin' });
  const count = opened.length;
  assert.deepEqual(mail.msOpen(), { ok: false });
  assert.equal(opened.length, count);
});
