// 邮件：他用邮件往她的信箱寄信（IMAP 收信，存成信箱里的信），以及「来接我」通知（SMTP 发信 + 推送网址）。
// 上半部分是纯逻辑（拆开日期、标题、暗号、允许名单、服务器识别、推送网址、错误说明、邮件内容），
// 下半部分是收发（imapflow / nodemailer / 推送）和定时收信。设计见 mail-spec。
// 授权码、推送网址只在这里解密使用：不传给页面，也不写进日志；日志里也不打印邮件正文。
const crypto = require('crypto');
const C = require('../shared/common');
const i18n = require('./i18n');
const { LIMITS } = require('./letters');

const DAY = 24 * 3600 * 1000;
const INTERVALS = [2, 5, 10, 30]; // 收信间隔（分钟）
const WHEN = ['now', '30', '60']; // 「来接我」：现在 / 半小时后 / 一小时后
const SEEN_MAX = 300; // 记住最近多少个处理过的 Message-ID
const NOTE_MAX = 60; // 「来接我」附的一句话
const PICKUP_GAP = 60 * 1000; // 「来接我」多久内只发一次
const FIRST_CHECK = 20 * 1000; // 应用启动后多久收第一次
const SOON_CHECK = 5 * 1000; // 刚打开自动收信时，多久后收第一次
const BIG_MAIL = 8 * 1024 * 1024; // 超过这么大的邮件（多半带了大附件）只下载开头这么多
const BIG_PART = 1024 * 1024;

// ---------- 纯逻辑 ----------

const escapeRe = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// 全角数字和 ／－． 换成半角
const halfWidth = (s) => String(s || '').replace(/[\uFF10-\uFF19\uFF0D\uFF0E\uFF0F]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
// 从右往左的文字里夹着的方向控制符
const BIDI = /[\u200E\u200F\u202A-\u202E\u2066-\u2069]/g;

// 日期的写法：2026-12-25、2026/12/25、2026.12.25、2026年12月25日、12月25日、12-25、12/25。没写年的第 1 组是空的
const DATE_FORMATS = [
  /^(\d{4})\s*[-/.]\s*(\d{1,2})\s*[-/.]\s*(\d{1,2})$/,
  /^(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*[日号]?$/, // i18n-ignore: 认日期用的中日文写法
  /^()(\d{1,2})\s*月\s*(\d{1,2})\s*[日号]?$/, // i18n-ignore: 认日期用的中日文写法
  /^()(\d{1,2})\s*[-/]\s*(\d{1,2})$/,
];

/**
 * 认一个日期，返回 'YYYY-MM-DD'；认不出或者日期不存在返回 null。
 * 只写月日时：今年的这天还没过就用今年，否则用明年。
 */
function parseDate(text, now = new Date()) {
  const s = halfWidth(text).replace(BIDI, '').trim();
  for (const re of DATE_FORMATS) {
    const m = re.exec(s);
    if (!m) continue;
    const month = Number(m[2]);
    const day = Number(m[3]);
    let year = m[1] ? Number(m[1]) : now.getFullYear();
    if (!m[1]) {
      const today = C.todayParts(now);
      if (month < today.m || (month === today.m && day < today.d)) year += 1;
    }
    const p = C.parseKey(`${year}-${month}-${day}`);
    return p ? `${p.y}-${C.pad2(p.m)}-${C.pad2(p.d)}` : null;
  }
  return null;
}

// 主题开头括起来的日期：【2026-12-25】、[2026-12-25]、(12-25)、（12月25日）
const SUBJECT_DATE = /^\s*[[(\u3010\uFF08]\s*([^\])\u3011\uFF09]{1,24}?)\s*[\])\u3011\uFF09]\s*/;

function takeSubjectDate(subject, now) {
  const m = SUBJECT_DATE.exec(subject);
  if (!m) return null;
  const date = parseDate(m[1], now);
  return date ? { date, rest: subject.slice(m[0].length) } : null;
}

// 正文里写拆开日期用的关键词：各种语言都认（不区分大小写），长的排前面
const UNLOCK_WORDS = [
  ...['拆开日期', '拆开', '解锁日期', '解锁', '拆開日期', '拆開', '解鎖', '開封日', '開封'], // i18n-ignore: 邮件里写拆开日期用的关键词
  ...['unlock', 'open on', 'open', '개봉일', '개봉', 'ouvrir le', 'ouverture', 'تاريخ الفتح', 'يفتح في'], // i18n-ignore: 同上（英、韩、法、阿拉伯文）
].sort((a, b) => b.length - a.length);
const BODY_DATE = new RegExp(`^\\s*(${UNLOCK_WORDS.map(escapeRe).join('|')})\\s*[:\\uFF1A]\\s*(.+?)\\s*$`, 'i');

// 正文前 3 个非空行里「关键词：日期」的一行；找到了就把那一行去掉
function takeBodyDate(body, now) {
  const lines = body.split('\n');
  let count = 0;
  for (let i = 0; i < lines.length && count < 3; i++) {
    const line = lines[i].replace(BIDI, '');
    if (!line.trim()) continue;
    count++;
    const m = BODY_DATE.exec(line);
    const date = m && parseDate(m[2], now);
    if (!date) continue;
    lines.splice(i, 1);
    return { date, rest: lines.join('\n') };
  }
  return null;
}

// 主题开头的 Re:、Fwd:、回复：……（可能叠了好几层）
const REPLY_PREFIX = /^\s*(?:re|fwd?|fw|回复|答复|转发|回覆|轉寄|轉發)\s*[:\uFF1A]\s*/i; // i18n-ignore: 邮件主题里回复、转发的前缀

function stripReply(subject) {
  let s = String(subject || '');
  for (let prev = null; prev !== s; ) {
    prev = s;
    s = s.replace(REPLY_PREFIX, '');
  }
  return s;
}

/**
 * 暗号：没设置就原样返回；设置了的话主题或正文里要有（不区分大小写），有就去掉，没有返回 null。
 */
function takeSecret(subject, body, secret) {
  const s = String(secret || '').trim();
  if (!s) return { subject, body };
  if (!new RegExp(escapeRe(s), 'i').test(subject) && !new RegExp(escapeRe(s), 'i').test(body)) return null;
  const all = new RegExp(escapeRe(s), 'gi');
  return { subject: subject.replace(all, ''), body: body.replace(all, '') };
}

// 从「豪豪 <Him@Example.com>」这类写法里取出纯地址（小写）；没有地址返回 ''
function pureAddress(text) {
  const m = /[^\s<>()[\]"',;:\uFF0C\uFF1B\u3001]+@[^\s<>()[\]"',;:\uFF0C\uFF1B\u3001]+/.exec(String(text || ''));
  return m ? m[0].toLowerCase().replace(/\.+$/, '') : '';
}

// 允许寄信的邮箱：逗号、分号、空格、换行分开，可以带显示名。返回去重后的纯地址（小写）
function parseAllow(text) {
  const out = [];
  for (const part of String(text || '').split(/[\s,;\uFF0C\uFF1B\u3001]+/)) {
    const a = pureAddress(part);
    if (a && !out.includes(a)) out.push(a);
  }
  return out;
}

const isAllowed = (address, allow) => {
  const a = pureAddress(address);
  return !!a && (Array.isArray(allow) ? allow : parseAllow(allow)).includes(a);
};

// 邮箱服务商。auto 按 domains 认；企业邮箱用自己的域名，认不出来，只能在列表里选。
// auth：'password'（授权码、应用专用密码）或 'oauth'（微软账号登录，见下面的「微软账号登录」）。
// starttls：先明文连上再升级加密（587 端口），这时一定要升级成功才发信。
// perDomain：自动识别到的域名用「imap.域名」「smtp.域名」（网易的几个域名各有各的服务器）
const imapSSL = (host) => ({ host, port: 993, secure: true });
const smtpSSL = (host) => ({ host, port: 465, secure: true });
const smtpTLS = (host) => ({ host, port: 587, secure: false, starttls: true });
const PROVIDERS = [
  { id: 'qq', domains: ['qq.com', 'foxmail.com', 'vip.qq.com'], imap: imapSSL('imap.qq.com'), smtp: smtpSSL('smtp.qq.com') },
  { id: 'exmail', domains: [], imap: imapSSL('imap.exmail.qq.com'), smtp: smtpSSL('smtp.exmail.qq.com') },
  { id: 'netease', domains: ['163.com', '126.com', 'yeah.net', '188.com', 'vip.163.com', 'vip.126.com'], perDomain: true, imap: imapSSL('imap.163.com'), smtp: smtpSSL('smtp.163.com') },
  { id: 'qiye163', domains: [], imap: imapSSL('imaphz.qiye.163.com'), smtp: smtpSSL('smtphz.qiye.163.com') },
  { id: 'gmail', domains: ['gmail.com', 'googlemail.com'], imap: imapSSL('imap.gmail.com'), smtp: smtpSSL('smtp.gmail.com') },
  { id: 'outlook', domains: ['outlook.com', 'hotmail.com', 'live.com', 'msn.com'], auth: 'oauth', imap: imapSSL('outlook.office365.com'), smtp: smtpTLS('smtp-mail.outlook.com') },
  { id: 'icloud', domains: ['icloud.com', 'me.com', 'mac.com'], imap: imapSSL('imap.mail.me.com'), smtp: smtpTLS('smtp.mail.me.com') },
  { id: 'yahoo', domains: ['yahoo.com'], imap: imapSSL('imap.mail.yahoo.com'), smtp: smtpSSL('smtp.mail.yahoo.com') },
  { id: 'sina', domains: ['sina.com', 'sina.cn'], imap: imapSSL('imap.sina.com'), smtp: smtpSSL('smtp.sina.com') },
  { id: 'sohu', domains: ['sohu.com'], imap: imapSSL('imap.sohu.com'), smtp: smtpSSL('smtp.sohu.com') },
  { id: 'aliyun', domains: ['aliyun.com'], imap: imapSSL('imap.aliyun.com'), smtp: smtpSSL('smtp.aliyun.com') },
  { id: '139', domains: ['139.com'], imap: imapSSL('imap.139.com'), smtp: smtpSSL('smtp.139.com') },
];

// 给设置页下拉框用的服务商列表：自动识别、各家、其他（手动填）。名字和开通说明是语言文件里的 key
function providerList() {
  const item = (id, p = {}) => ({
    id,
    nameKey: `main.mail.provider.${id}.name`,
    helpKey: `main.mail.provider.${id}.help`,
    auth: p.auth || (p.imap ? 'password' : null),
    imap: p.imap ? { ...p.imap } : null,
    smtp: p.smtp ? { ...p.smtp } : null,
    domains: [...(p.domains || [])],
  });
  return [item('auto'), ...PROVIDERS.map((p) => item(p.id, p)), { ...item('custom'), auth: 'password' }];
}

function cleanServer(v, fallback = {}, defPort = 993) {
  const src = v && typeof v === 'object' ? v : {};
  const port = Math.round(Number(src.port !== undefined ? src.port : fallback.port));
  return {
    host: String(src.host !== undefined ? src.host : fallback.host || '').trim().slice(0, 200),
    port: port >= 1 && port <= 65535 ? port : defPort,
    secure: src.secure !== undefined ? !!src.secure : fallback.secure !== undefined ? !!fallback.secure : true,
  };
}

/**
 * 收信、发信用哪台服务器：{ imap, smtp, provider, auth, unsupported }（unsupported 现在总是 false，留着兼容）。
 * server 是 'custom' 用设置里填的；是某个服务商的 id 就用那一家；'auto' 按邮箱域名找，找不到时 imap/smtp 是 null、provider 是 ''。
 * overrides：{ 服务商 id: { imap, smtp } }，测试时把某一家指到本地服务器
 */
function resolveServer(m = {}, overrides = {}) {
  if (m.server === 'custom') {
    const imap = cleanServer(m.imap, {}, 993);
    const smtp = cleanServer(m.smtp, {}, 465);
    return { imap: imap.host ? imap : null, smtp: smtp.host ? smtp : null, provider: 'custom', auth: 'password', unsupported: false };
  }
  const domain = pureAddress(m.address).split('@')[1] || '';
  const p = PROVIDERS.find((x) => x.id === m.server) || PROVIDERS.find((x) => x.domains.includes(domain));
  if (!p) return { imap: null, smtp: null, provider: '', auth: 'password', unsupported: false };
  let imap = { ...p.imap };
  let smtp = { ...p.smtp };
  if (p.perDomain && p.domains.includes(domain)) {
    imap.host = `imap.${domain}`;
    smtp.host = `smtp.${domain}`;
  }
  const o = overrides && overrides[p.id];
  if (o && o.imap) imap = { ...o.imap };
  if (o && o.smtp) smtp = { ...o.smtp };
  return { imap, smtp, provider: p.id, auth: p.auth || 'password', unsupported: false };
}

// 邮件变成的信的 id：Message-ID 的 sha1 前 12 位（同一封邮件总是同一个 id）
const mailLetterId = (key) => 'mail-' + crypto.createHash('sha1').update(String(key)).digest('hex').slice(0, 12);

// 去重用的钥匙：Message-ID，没有的话用发件人、时间和主题凑一个
const mailKey = (mail) => mail.messageId || `${pureAddress(mail.fromAddress)}|${mail.date ? +new Date(mail.date) : ''}|${mail.subject || ''}`;

const isPushUrl = (url) => {
  const s = String(url || '').trim();
  if (!/^https?:\/\/\S+$/i.test(s)) return false;
  try {
    new URL(s.replace(/\{(title|body)\}/g, 'x'));
    return true;
  } catch {
    return false;
  }
};

// 推送网址里的 {title}、{body} 换成 URL 编码后的标题和正文
const fillPushUrl = (url, title, body) =>
  String(url).split('{title}').join(encodeURIComponent(String(title))).split('{body}').join(encodeURIComponent(String(body)));

// 只有 HTML 的邮件：粗略转成文字
function htmlToText(html) {
  return String(html || '')
    .replace(/<(script|style|head)[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|tr|h[1-6]|blockquote)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (m, n) => (Number(n) > 0 && Number(n) <= 0x10ffff ? String.fromCodePoint(Number(n)) : m))
    .replace(/&amp;/gi, '&')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n');
}

const normalizeText = (s) => String(s || '').replace(/\r\n?/g, '\n');

/**
 * 一封邮件 → 信箱里的一封信。
 * mail: { messageId, fromAddress, fromName, subject, text, html, date }
 * 返回 { letter } 或 { skip: 'secret' | 'empty', title }（跳过的原因）
 */
function buildLetter(mail, { secret = '', sender = '', now = new Date() } = {}) {
  let subject = String(mail.subject || '');
  let body = normalizeText(mail.text || (mail.html ? htmlToText(mail.html) : ''));
  const withSecret = takeSecret(subject, body, secret);
  if (!withSecret) return { skip: 'secret', title: stripReply(subject).trim().slice(0, LIMITS.title) };
  subject = stripReply(withSecret.subject);
  body = withSecret.body;
  let unlock = '';
  const inSubject = takeSubjectDate(subject, now);
  if (inSubject) {
    unlock = inSubject.date;
    subject = inSubject.rest;
  } else {
    const inBody = takeBodyDate(body, now);
    if (inBody) {
      unlock = inBody.date;
      body = inBody.rest;
    }
  }
  const title = subject.replace(/\s+/g, ' ').trim().slice(0, LIMITS.title) || i18n.t('main.letter.untitled');
  body = body.trim().slice(0, LIMITS.body);
  if (!body) return { skip: 'empty', title };
  const address = pureAddress(mail.fromAddress);
  const from = (String(sender || '').trim() || String(mail.fromName || '').trim() || address.split('@')[0]).slice(0, LIMITS.from);
  const date = mail.date ? +new Date(mail.date) : NaN;
  const createdAt = Number.isFinite(date) && date > 0 ? Math.min(date, +now) : +now;
  return { letter: { id: mailLetterId(mailKey(mail)), title, from, unlock, body, createdAt, source: 'mail', mailFrom: address } };
}

// 常见的出错原因转成人能看懂的话（当前语言）。ctx：{ provider, auth }，登录失败时按服务商给不同的说明
function friendlyError(err, ctx = {}) {
  if (err && err.friendly) return err.friendly;
  const code = String((err && err.code) || '');
  const text = [err && err.message, err && err.response, err && err.responseText].filter((x) => typeof x === 'string').join(' ');
  if (/unsafe login/i.test(text)) return i18n.t('main.mail.error.unsafe');
  if ((err && err.authenticationFailed) || code === 'EAUTH' || /authenticat\w* fail|invalid credentials|login fail|\b535\b/i.test(text)) {
    if (ctx && ctx.auth === 'oauth') return i18n.t('main.mail.error.msAuth');
    if (ctx && ctx.provider === 'gmail') return i18n.t('main.mail.error.authGmail');
    return i18n.t('main.mail.error.auth');
  }
  if (code === 'ETLS' || /CERT|SSL|TLS/.test(code) || /certificate|self[- ]signed|wrong version number|\bSSL\b|\bTLS\b|STARTTLS/i.test(text)) {
    return i18n.t('main.mail.error.tls');
  }
  if (/TIMEDOUT|TIMEOUT/i.test(code) || /timed? ?out/i.test(text)) return i18n.t('main.mail.error.timeout');
  if (/^(ECONNREFUSED|ENOTFOUND|EAI_AGAIN|ECONNRESET|EHOSTUNREACH|ENETUNREACH|EPIPE|ECONNECTION|ESOCKET|EDNS|NoConnection)$/.test(code) || /ECONNREFUSED|ENOTFOUND|EAI_AGAIN|getaddrinfo|socket hang up|fetch failed|connection closed/i.test(text)) {
    return i18n.t('main.mail.error.connect');
  }
  if (err && err.status) return i18n.t('main.mail.error.http', { status: err.status });
  return i18n.t('main.mail.error.other', { error: String((err && err.message) || err || '').slice(0, 200) });
}

// 收到信后回给他的确认邮件
function receiptMessage({ pet, nick, title, unlock, now = new Date() }) {
  const later = !!unlock && C.daysUntil(unlock, now) > 0;
  const vars = { pet, nick, title, date: later ? i18n.fmtDate(C.parseKey(unlock)) : '' };
  return {
    subject: i18n.t('main.mail.receipt.subject', vars),
    text: later ? i18n.t('main.mail.receipt.bodyLater', vars) : i18n.t('main.mail.receipt.body', vars),
  };
}

// 「来接我」的邮件（推送用同样的标题和正文）
function pickupMessage({ when = 'now', note = '', pet, nick, time }) {
  const vars = { pet, nick, time, note };
  const subject = when === '30' ? i18n.t('main.mail.pickup.subject30', vars) : when === '60' ? i18n.t('main.mail.pickup.subject60', vars) : i18n.t('main.mail.pickup.subjectNow', vars);
  const text = note ? i18n.t('main.mail.pickup.bodyNote', vars) : i18n.t('main.mail.pickup.body', vars);
  return { subject, text };
}

// 「把用法发给他」的说明邮件
function guideMessage({ pet, nick, address, allow = [], secret = '', receipt = true, now = new Date() }) {
  // 举例用的日期：下一个 12 月 25 日
  const date = parseDate('12-25', now);
  const parts = [
    i18n.t('main.mail.guide.intro', { pet, nick, address }),
    allow.length ? i18n.t('main.mail.guide.from', { list: allow.join(i18n.t('main.mail.listSep')) }) : '',
    i18n.t('main.mail.guide.format'),
    i18n.t('main.mail.guide.date', { date }),
    String(secret || '').trim() ? i18n.t('main.mail.guide.secret', { secret: String(secret).trim(), pet }) : '',
    receipt ? i18n.t('main.mail.guide.receipt', { pet }) : '',
    i18n.t('main.mail.guide.sign', { pet }),
  ];
  return { subject: i18n.t('main.mail.guide.subject', { pet, nick }), text: parts.filter(Boolean).join('\n\n') };
}

// ---------- 授权码、推送网址的存法 ----------
// 'enc:' + base64：用 electron.safeStorage 加密；'raw:' + base64：系统不支持加密时（个别 Linux）只能明文存

function electron() {
  try {
    const e = require('electron');
    return e && typeof e === 'object' ? e : {};
  } catch {
    return {};
  }
}

function safeStorage() {
  const s = electron().safeStorage;
  try {
    return s && s.isEncryptionAvailable() ? s : null;
  } catch {
    return null;
  }
}

// plain：不加密（测试和开发场景用，不碰系统钥匙串）
function seal(text, { plain = false } = {}) {
  const s = String(text || '');
  if (!s) return '';
  const safe = plain ? null : safeStorage();
  if (safe) return 'enc:' + safe.encryptString(s).toString('base64');
  return 'raw:' + Buffer.from(s, 'utf8').toString('base64');
}

// 解不开（换了电脑、钥匙串变了）就当没填
function unseal(stored) {
  const s = String(stored || '');
  try {
    if (s.startsWith('raw:')) return Buffer.from(s.slice(4), 'base64').toString('utf8');
    if (s.startsWith('enc:')) {
      const safe = safeStorage();
      return safe ? safe.decryptString(Buffer.from(s.slice(4), 'base64')) : '';
    }
  } catch {}
  return '';
}

// ---------- 收发 ----------
// c：{ address, pass 或 accessToken, server }。有 accessToken 时用 OAuth2（XOAUTH2）登录

function imapClient(c, version) {
  const { ImapFlow } = require('imapflow');
  const client = new ImapFlow({
    host: c.server.imap.host,
    port: c.server.imap.port,
    secure: c.server.imap.secure,
    auth: c.accessToken ? { user: c.address, accessToken: c.accessToken } : { user: c.address, pass: c.pass },
    // 网易邮箱要先发 ID 才让打开收件箱
    clientInfo: { name: 'NuomiPet', version },
    logger: false,
    disableAutoIdle: true,
    connectionTimeout: 20000,
    greetingTimeout: 15000,
    socketTimeout: 60000,
  });
  // 连接断了会发 error 事件；没人听的话整个主进程会崩。出错由调用的地方处理
  client.on('error', () => {});
  return client;
}

async function closeImap(client) {
  try {
    await client.logout();
  } catch {
    try {
      client.close();
    } catch {}
  }
}

/**
 * 收一次信。只下载 isAllowed 通过的邮件，交给 handle(mails) 处理；handle 返回要标成已读的 UID。
 * 返回 { uidValidity, lastUid }（lastUid 包括跳过的邮件）。
 */
async function receive(c, { uidValidity, lastUid, since, version, isAllowed: allowed }, handle) {
  const { simpleParser } = require('mailparser');
  const client = imapClient(c, version);
  try {
    await client.connect();
    const box = await client.mailboxOpen('INBOX');
    const validity = String(box.uidValidity);
    const from = uidValidity !== null && uidValidity !== undefined && String(uidValidity) === validity ? Number(lastUid) || 0 : 0;
    const query = from > 0 ? { uid: `${from + 1}:*` } : { since };
    // 「n:*」在没有新信时也会带回最后一封，所以要再筛一遍
    const uids = ((await client.search(query, { uid: true })) || []).filter((u) => u > from).sort((a, b) => a - b);
    let maxUid = from;
    const mails = [];
    if (uids.length) {
      const heads = await client.fetchAll(uids, { uid: true, envelope: true, size: true }, { uid: true });
      for (const h of heads.sort((a, b) => a.uid - b.uid)) {
        maxUid = Math.max(maxUid, h.uid);
        const sender = (h.envelope && h.envelope.from && h.envelope.from[0]) || {};
        if (!allowed(sender.address || '')) continue;
        const [msg] = await client.fetchAll(String(h.uid), { uid: true, source: h.size > BIG_MAIL ? { maxLength: BIG_PART } : true }, { uid: true });
        if (!msg || !msg.source) continue;
        let parsed;
        try {
          parsed = await simpleParser(msg.source, { skipImageLinks: true, skipTextLinks: true, skipTextToHtml: true });
        } catch (err) {
          // 解析不了的邮件跳过（lastUid 照样前进），不然每次收信都卡在这一封上
          console.error('[mail] parse failed', h.uid, err && err.message);
          continue;
        }
        const pf = (parsed.from && parsed.from.value && parsed.from.value[0]) || {};
        mails.push({
          uid: h.uid,
          messageId: parsed.messageId || (h.envelope && h.envelope.messageId) || '',
          fromAddress: sender.address || pf.address || '',
          fromName: pf.name || sender.name || '',
          subject: parsed.subject || (h.envelope && h.envelope.subject) || '',
          text: parsed.text || '',
          html: typeof parsed.html === 'string' ? parsed.html : '',
          date: parsed.date || (h.envelope && h.envelope.date) || null,
        });
      }
    }
    const seenUids = await handle(mails);
    if (seenUids && seenUids.length) {
      try {
        await client.messageFlagsAdd(seenUids, ['\\Seen'], { uid: true });
      } catch (err) {
        console.error('[mail] mark seen failed', err && err.code);
      }
    }
    return { uidValidity: validity, lastUid: maxUid };
  } finally {
    await closeImap(client);
  }
}

async function testImap(c, version) {
  const client = imapClient(c, version);
  try {
    await client.connect();
    await client.mailboxOpen('INBOX');
    return { ok: true, error: '' };
  } catch (err) {
    return { ok: false, error: friendlyError(err, c.server) };
  } finally {
    await closeImap(client);
  }
}

function smtpTransport(c) {
  const nodemailer = require('nodemailer');
  return nodemailer.createTransport({
    host: c.server.smtp.host,
    port: c.server.smtp.port,
    secure: c.server.smtp.secure,
    // 587 端口的服务商：一定要升级成加密连接才登录（自己填的服务器不强制）
    requireTLS: !!c.server.smtp.starttls,
    auth: c.accessToken ? { type: 'OAuth2', user: c.address, accessToken: c.accessToken } : { user: c.address, pass: c.pass },
    connectionTimeout: 20000,
    greetingTimeout: 15000,
    socketTimeout: 30000,
  });
}

async function testSmtp(c) {
  const tr = smtpTransport(c);
  try {
    await tr.verify();
    return { ok: true, error: '' };
  } catch (err) {
    return { ok: false, error: friendlyError(err, c.server) };
  } finally {
    tr.close();
  }
}

// 用宠物的邮箱发信。messages: [{ to, subject, text, inReplyTo, references }]；返回每封的错误（成功是 null）
async function sendMails(c, fromName, messages) {
  const tr = smtpTransport(c);
  const errors = [];
  try {
    for (const msg of messages) {
      try {
        await tr.sendMail({ from: { name: fromName, address: c.address }, ...msg });
        errors.push(null);
      } catch (err) {
        errors.push(err);
      }
    }
  } finally {
    tr.close();
  }
  return errors;
}

// 推送：GET 一下填好的网址，10 秒超时
async function push(url, title, body, fetchImpl) {
  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  const res = await withTimeout(fetchImpl(fillPushUrl(url, title, body), controller ? { signal: controller.signal } : {}), 10000, () => controller && controller.abort());
  if (!res || !res.ok) {
    const err = new Error('HTTP ' + (res && res.status));
    err.status = res && res.status;
    throw err;
  }
}

// ---------- 微软账号登录（Outlook、Hotmail、Microsoft 365）----------
// 微软不让用密码登录邮箱了，要走 OAuth2 的设备代码流程：拿到一个代码，她在浏览器里打开微软的网址、输入代码并同意，
// 这边一直问微软「好了没有」，好了就拿到 refresh_token（加密存进 mail.msTokenEnc），以后用它换 access_token 收发信。
// client_id 必须是自己在微软注册的应用（mail.msClientId，默认取送礼配置的 mailMsClientId）。

const MS_BASE = 'https://login.microsoftonline.com/common/oauth2/v2.0';
const MS_SCOPE = 'https://outlook.office.com/IMAP.AccessAsUser.All https://outlook.office.com/SMTP.Send offline_access';
// 这些错误说明 refresh_token 不能用了（被撤销、过期、改了密码），要重新登录
const MS_RELOGIN = ['invalid_grant', 'interaction_required', 'consent_required', 'login_required', 'invalid_client', 'unauthorized_client'];
// 只允许打开微软的网址
const MS_HOSTS = ['microsoft.com', 'microsoftonline.com', 'live.com'];

function msOpenable(url) {
  try {
    const u = new URL(String(url || ''));
    return u.protocol === 'https:' && MS_HOSTS.some((h) => u.hostname === h || u.hostname.endsWith('.' + h));
  } catch {
    return false;
  }
}

const msIdle = () => ({ state: 'idle', account: '', error: '', userCode: '', verificationUri: '', expiresAt: 0 });

// 微软返回的错误说明很长（带跟踪号），只留第一句
const msDetail = (res) => String((res && (res.error_description || res.error)) || '').split(/\r?\n|Trace ID/)[0].trim().slice(0, 200);

function withTimeout(promise, ms, onTimeout) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      if (onTimeout) onTimeout();
      const err = new Error('timeout');
      err.code = 'ETIMEDOUT';
      reject(err);
    }, ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

// 带着给人看的说明的错误（friendlyError 直接用这句）
function explained(text, code = '') {
  const err = new Error(code || text);
  err.friendly = text;
  return err;
}

// ---------- 服务：设置、收信、「来接我」、定时 ----------

/**
 * store：数据；onLetters(letters)：存好新信以后调用（让宠物马上把信递过去）；
 * version：应用版本（发给 IMAP 服务器的 ID）；fetch：推送和微软登录用（默认 electron 的 net.fetch）；
 * msClientId：设置里没填时用的微软应用 ID（送礼配置的 mailMsClientId）。
 * 测试用：msBase（微软登录的地址）、overrides（把某个服务商指到本地服务器）、timeScale（登录时轮询的等待按比例缩短）、shell。
 */
function createMail({ store, onLetters = () => {}, version = '0.0.0', fetch: fetchImpl, msClientId: defaultClientId = '', msBase = MS_BASE, overrides = {}, timeScale = 1, shell } = {}) {
  let firstTimer = null;
  let timer = null;
  let running = null; // 正在收信（同一时间只跑一个）
  let sending = false; // 正在发「来接我」
  let started = false;
  let plan = ''; // 影响定时收信的设置（开没开、间隔），变了才重新排
  let msAccess = null; // { token, exp }：微软的 access_token，只放在内存里
  let refreshing = null; // 正在换 access_token
  let loginSeq = 0; // 每次开始登录或退出加一，旧的轮询看到对不上就停
  let pollTimer = null;

  const doFetch = fetchImpl || ((url, opts) => (electron().net ? electron().net.fetch(url, opts) : globalThis.fetch(url, opts)));
  const settings = () => store.get('mail') || {};
  const patchMail = (patch) => store.set('mail', { ...settings(), ...patch });
  const clientId = (m = settings()) => String(m.msClientId || defaultClientId || '').trim();
  const setMs = (ms) => patchMail({ ms: { ...msIdle(), ...ms } });

  // 收发要用的东西：地址、解开的授权码和推送网址、服务器
  function conf() {
    const m = settings();
    const server = resolveServer(m, overrides);
    return {
      m,
      address: String(m.address || '').trim(),
      pass: unseal(m.passEnc),
      push: unseal(m.pushEnc),
      msToken: unseal(m.msTokenEnc),
      server,
    };
  }

  // 缺了什么：need 里是 'imap'、'smtp'。都齐了返回 ''，不然返回说明
  function missing(c, need = ['imap', 'smtp']) {
    if (!c.address) return i18n.t('main.mail.error.notReady');
    if (need.some((k) => !c.server[k])) return i18n.t('main.mail.error.unknownServer');
    if (c.server.auth === 'oauth') {
      if (!clientId(c.m)) return i18n.t('main.mail.error.msNoClientId');
      if (!c.msToken) return (c.m.ms && c.m.ms.state === 'error' && c.m.ms.error) || i18n.t('main.mail.error.msLogin');
      return '';
    }
    if (!c.pass) return i18n.t('main.mail.error.notReady');
    return '';
  }

  // 微软的 access_token：还有 5 分钟以上就接着用，不然用 refresh_token 换一个新的
  async function accessToken() {
    const refresh = unseal(settings().msTokenEnc);
    if (!refresh) throw explained(i18n.t('main.mail.error.msLogin'));
    if (msAccess && msAccess.exp - Date.now() > 5 * 60 * 1000) return msAccess.token;
    if (!refreshing) refreshing = refreshAccess(refresh).finally(() => (refreshing = null));
    return refreshing;
  }

  async function refreshAccess(refresh) {
    const res = await msPost('token', { client_id: clientId(), grant_type: 'refresh_token', refresh_token: refresh, scope: MS_SCOPE });
    if (res.access_token) {
      msAccess = { token: res.access_token, exp: Date.now() + (Number(res.expires_in) || 3600) * 1000 };
      // 微软有时会换一个新的 refresh_token
      if (res.refresh_token && res.refresh_token !== refresh) patchMail({ msTokenEnc: seal(res.refresh_token) });
      return msAccess.token;
    }
    if (MS_RELOGIN.includes(res.error)) {
      // 被撤销、过期、改了密码：要重新登录
      const error = i18n.t('main.mail.error.msRelogin');
      msAccess = null;
      console.error('[mail] microsoft refresh failed', res.error);
      patchMail({ msTokenEnc: '', ms: { ...msIdle(), state: 'error', error } });
      throw explained(error, res.error);
    }
    throw explained(i18n.t('main.mail.error.msFailed', { error: msDetail(res) }), res.error);
  }

  // 收发前准备好登录用的东西：OAuth 的服务商要先拿 access_token
  async function withCred(c) {
    if (c.server.auth !== 'oauth') return c;
    return { ...c, accessToken: await accessToken() };
  }

  async function msPost(path, form) {
    const res = await withTimeout(
      doFetch(`${msBase}/${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
        body: new URLSearchParams(form).toString(),
      }),
      20000,
    );
    let json = null;
    try {
      json = await res.json();
    } catch {}
    if (!json || typeof json !== 'object') {
      const err = new Error('HTTP ' + res.status);
      err.status = res.status;
      throw err;
    }
    return json;
  }

  // 开始用微软账号登录：返回 { ok, userCode, verificationUri, expiresIn } 给页面显示，然后在后台等她在浏览器里同意。
  // 进度和结果写进 mail.ms（state：idle / waiting / ok / error）
  async function msLoginStart() {
    const id = clientId();
    if (!id) return { ok: false, error: i18n.t('main.mail.error.msNoClientId') };
    stopLogin();
    const seq = loginSeq;
    let res;
    try {
      res = await msPost('devicecode', { client_id: id, scope: MS_SCOPE });
    } catch (err) {
      const error = friendlyError(err);
      if (seq === loginSeq) setMs({ state: 'error', error });
      return { ok: false, error };
    }
    if (seq !== loginSeq) return { ok: false, error: '' }; // 这期间又点了一次登录，或者退出了
    if (!res.device_code || !res.user_code) {
      const error = i18n.t('main.mail.error.msFailed', { error: msDetail(res) });
      setMs({ state: 'error', error });
      return { ok: false, error };
    }
    const expiresIn = Number(res.expires_in) || 900;
    const verificationUri = res.verification_uri || res.verification_url || '';
    setMs({ state: 'waiting', userCode: res.user_code, verificationUri, expiresAt: Date.now() + expiresIn * 1000 });
    poll(seq, { deviceCode: res.device_code, clientId: id, interval: Number(res.interval) || 5, expiresAt: Date.now() + expiresIn * 1000 });
    return { ok: true, userCode: res.user_code, verificationUri, expiresIn };
  }

  function poll(seq, st) {
    pollTimer = setTimeout(async () => {
      pollTimer = null;
      if (seq !== loginSeq) return;
      if (Date.now() > st.expiresAt) return loginFailed(seq, i18n.t('main.mail.error.msExpired'));
      let res;
      try {
        res = await msPost('token', { grant_type: 'urn:ietf:params:oauth:grant-type:device_code', client_id: st.clientId, device_code: st.deviceCode });
      } catch {
        // 网络一时不通：接着等
        if (seq === loginSeq) poll(seq, st);
        return;
      }
      if (seq !== loginSeq) return;
      if (res.access_token) return loginOk(seq, res);
      if (res.error === 'authorization_pending') return poll(seq, st);
      if (res.error === 'slow_down') {
        st.interval += 5;
        return poll(seq, st);
      }
      if (res.error === 'expired_token' || res.error === 'code_expired') return loginFailed(seq, i18n.t('main.mail.error.msExpired'));
      if (res.error === 'access_denied' || res.error === 'authorization_declined') return loginFailed(seq, i18n.t('main.mail.error.msDenied'));
      return loginFailed(seq, i18n.t('main.mail.error.msFailed', { error: msDetail(res) }));
    }, st.interval * 1000 * timeScale);
  }

  function loginOk(seq, res) {
    if (!res.refresh_token) return loginFailed(seq, i18n.t('main.mail.error.msFailed', { error: 'no refresh_token' }));
    msAccess = { token: res.access_token, exp: Date.now() + (Number(res.expires_in) || 3600) * 1000 };
    patchMail({ msTokenEnc: seal(res.refresh_token), lastError: '', ms: { ...msIdle(), state: 'ok', account: String(settings().address || '').trim() } });
  }

  function loginFailed(seq, error) {
    if (seq === loginSeq) setMs({ state: 'error', error });
  }

  function stopLogin() {
    loginSeq++;
    clearTimeout(pollTimer);
    pollTimer = null;
  }

  function msLogout() {
    stopLogin();
    msAccess = null;
    patchMail({ msTokenEnc: '', ms: msIdle() });
    return { ok: true };
  }

  // 在浏览器里打开登录的网址（只开微软的网址）
  function msOpen() {
    const uri = (settings().ms || {}).verificationUri;
    if (!msOpenable(uri)) return { ok: false };
    try {
      (shell || electron().shell).openExternal(uri);
      return { ok: true };
    } catch {
      return { ok: false };
    }
  }

  const interval = (m) => (INTERVALS.includes(Number(m.interval)) ? Number(m.interval) : 5);
  const isActive = () => {
    const c = conf();
    return !!c.m.enabled && !missing(c, ['imap']);
  };
  const SERVERS = ['auto', 'custom', ...PROVIDERS.map((p) => p.id)];

  function get() {
    const c = conf();
    const m = c.m;
    let encryption = false;
    try {
      encryption = !!safeStorage();
    } catch {}
    return {
      enabled: !!m.enabled,
      address: m.address || '',
      server: SERVERS.includes(m.server) ? m.server : 'auto',
      imap: cleanServer(m.imap, {}, 993),
      smtp: cleanServer(m.smtp, {}, 465),
      allow: m.allow || '',
      secret: m.secret || '',
      notifyTo: m.notifyTo || '',
      receipt: m.receipt !== false,
      interval: interval(m),
      msClientId: clientId(m),
      hasPass: !!c.pass,
      hasPush: !!c.push,
      hasMsToken: !!c.msToken,
      ms: { ...msIdle(), ...(m.ms || {}) },
      encryption,
      auth: c.server.auth,
      ready: !missing(c),
      lastCheck: m.lastCheck || 0,
      lastOk: m.lastOk || 0,
      lastCount: m.lastCount || 0,
      lastError: m.lastError || '',
      lastPickup: m.lastPickup || 0,
      resolved: c.server,
      providers: providerList(),
    };
  }

  // password、pushUrl 是明文：undefined 不改，'' 清掉。其他字段只收认识的
  function save(patch = {}) {
    const p = patch && typeof patch === 'object' ? patch : {};
    const cur = settings();
    const next = { ...cur };
    let error = '';
    if ('enabled' in p) next.enabled = !!p.enabled;
    if ('address' in p) next.address = String(p.address || '').trim().slice(0, 200);
    if ('server' in p) next.server = SERVERS.includes(String(p.server)) ? String(p.server) : 'auto';
    if (p.imap) next.imap = cleanServer(p.imap, cur.imap, 993);
    if (p.smtp) next.smtp = cleanServer(p.smtp, cur.smtp, 465);
    for (const k of ['allow', 'secret', 'notifyTo']) if (k in p) next[k] = String(p[k] === undefined || p[k] === null ? '' : p[k]).trim().slice(0, 1000);
    if ('receipt' in p) next.receipt = !!p.receipt;
    if ('interval' in p) next.interval = INTERVALS.includes(Number(p.interval)) ? Number(p.interval) : 5;
    if (p.password !== undefined) next.passEnc = seal(String(p.password || '').trim());
    if (p.pushUrl !== undefined) {
      const url = String(p.pushUrl || '').trim();
      if (url && !isPushUrl(url)) error = i18n.t('main.mail.error.pushUrl');
      else next.pushEnc = seal(url);
    }
    if ('msClientId' in p) {
      next.msClientId = String(p.msClientId || '').trim().slice(0, 100);
      // 换了应用：原来的登录是发给旧应用的，不能用了
      if (next.msClientId !== String(cur.msClientId || '')) {
        stopLogin();
        msAccess = null;
        next.msTokenEnc = '';
        next.ms = msIdle();
      }
    }
    // 换了邮箱或收信服务器：UID 对不上了，从最近 30 天重新找（Message-ID 去重，不会收重复）
    if (next.address !== cur.address || next.server !== cur.server || JSON.stringify(next.imap) !== JSON.stringify(cur.imap)) {
      next.uidValidity = null;
      next.lastUid = 0;
    }
    store.set('mail', next);
    return { ...get(), ok: !error, error };
  }

  async function test() {
    const c = conf();
    const why = missing(c);
    if (why) return { ok: false, imap: { ok: false, error: why }, smtp: { ok: false, error: why } };
    let cc;
    try {
      cc = await withCred(c);
    } catch (err) {
      const error = friendlyError(err, c.server);
      return { ok: false, imap: { ok: false, error }, smtp: { ok: false, error } };
    }
    const [imap, smtp] = await Promise.all([testImap(cc, version), testSmtp(cc)]);
    return { ok: imap.ok && smtp.ok, imap, smtp };
  }

  async function runCheck() {
    const startedAt = Date.now();
    const c = conf();
    const why = missing(c, ['imap']);
    if (why) {
      patchMail({ lastCheck: startedAt, lastError: why });
      return { ok: false, added: 0, error: why };
    }
    const m = c.m;
    const allow = parseAllow(m.allow);
    const self = pureAddress(c.address);
    const added = [];
    const notes = [];
    let cc;
    let result;
    try {
      cc = await withCred(c);
      result = await receive(
        cc,
        {
          uidValidity: m.uidValidity,
          lastUid: m.lastUid,
          since: new Date(startedAt - 30 * DAY),
          version,
          // 只收他（允许名单里）的信；自己发给自己的不收
          isAllowed: (a) => pureAddress(a) !== self && isAllowed(a, allow),
        },
        async (mails) => {
          const cur = store.get('letters.custom') || [];
          const ids = new Set(cur.map((l) => l.id));
          const seen = new Set(store.get('mail.seen') || []);
          const uids = [];
          for (const mail of mails) {
            const key = mailKey(mail);
            if (ids.has(mailLetterId(key)) || seen.has(key)) continue;
            const r = buildLetter(mail, { secret: m.secret, sender: store.get('owner.sender') || '' });
            if (r.skip === 'secret') {
              notes.push(i18n.t('main.mail.error.noSecret'));
              continue;
            }
            if (r.skip === 'empty') {
              notes.push(i18n.t('main.mail.error.emptyBody', { title: r.title }));
              continue;
            }
            added.push({ letter: r.letter, mail, key });
            ids.add(r.letter.id);
            seen.add(key);
            uids.push(mail.uid);
          }
          if (added.length) store.set('letters.custom', [...cur, ...added.map((a) => a.letter)]);
          return uids;
        },
      );
    } catch (err) {
      console.error('[mail] check failed', err && (err.code || err.message));
      const error = friendlyError(err, c.server);
      patchMail({ lastCheck: startedAt, lastError: error });
      return { ok: false, added: 0, error };
    }
    const seenList = [...(store.get('mail.seen') || []), ...added.map((a) => a.key)].slice(-SEEN_MAX);
    let error = notes[0] || '';
    patchMail({ lastCheck: startedAt, lastOk: Date.now(), lastCount: added.length, lastError: error, uidValidity: result.uidValidity, lastUid: result.lastUid, seen: seenList });
    if (added.length) {
      try {
        onLetters(added.map((a) => a.letter));
      } catch (err) {
        console.error('[mail] onLetters failed', err);
      }
    }
    // 回确认邮件（收信不受影响：发不出去只记下原因）
    if (added.length && m.receipt !== false && !missing(c, ['smtp'])) {
      const pet = i18n.petName(store.data);
      const nick = i18n.nickname(store.data);
      const messages = added.map(({ letter, mail }) => ({
        to: pureAddress(mail.fromAddress),
        ...receiptMessage({ pet, nick, title: letter.title, unlock: letter.unlock }),
        ...(mail.messageId ? { inReplyTo: mail.messageId, references: mail.messageId } : {}),
      }));
      const failed = (await sendMails(cc, pet, messages).catch((err) => [err])).find(Boolean);
      if (failed) {
        console.error('[mail] receipt failed', failed.code || failed.message);
        error = i18n.t('main.mail.error.receipt', { error: friendlyError(failed, c.server) });
        patchMail({ lastError: error });
      }
    }
    return { ok: true, added: added.length, error };
  }

  function check() {
    if (!running) running = runCheck().finally(() => (running = null));
    return running;
  }

  // 「来接我」：{ when: 'now' | '30' | '60', note }
  async function pickup({ when = 'now', note = '' } = {}) {
    const w = WHEN.includes(String(when)) ? String(when) : 'now';
    const text = String(note || '').replace(/\s+/g, ' ').trim().slice(0, NOTE_MAX);
    const last = Number(settings().lastPickup) || 0;
    if (sending || Date.now() - last < PICKUP_GAP) return { ok: false, tooSoon: true, via: [], error: i18n.t('main.mail.error.tooSoon') };
    const c = conf();
    const to = pureAddress(c.m.notifyTo) || parseAllow(c.m.allow)[0] || '';
    const mailWhy = missing(c, ['smtp']);
    if (mailWhy && !c.push) return { ok: false, via: [], error: mailWhy };
    if (!mailWhy && !to && !c.push) return { ok: false, via: [], error: i18n.t('main.mail.error.noRecipient') };
    sending = true;
    try {
      const pet = i18n.petName(store.data);
      const msg = pickupMessage({ when: w, note: text, pet, nick: i18n.nickname(store.data), time: C.hm() });
      const via = [];
      const errors = [];
      const jobs = [];
      if (!mailWhy && to) {
        jobs.push(
          withCred(c)
            .then((cc) => sendMails(cc, pet, [{ to, subject: msg.subject, text: msg.text }]))
            .then(([err]) => {
              if (err) throw err;
              via.push('mail');
            })
            .catch((err) => {
              console.error('[mail] pickup mail failed', err && (err.code || err.message));
              errors.push(i18n.t('main.mail.error.mailFailed', { error: friendlyError(err, c.server) }));
            }),
        );
      } else if (!mailWhy) {
        errors.push(i18n.t('main.mail.error.noRecipient'));
      }
      if (c.push) {
        jobs.push(
          push(c.push, msg.subject, msg.text, doFetch).then(
            () => via.push('push'),
            (err) => {
              console.error('[mail] push failed', err && (err.code || err.status || (err.cause && err.cause.code) || err.name));
              errors.push(i18n.t('main.mail.error.pushFailed', { error: friendlyError(err) }));
            },
          ),
        );
      }
      await Promise.all(jobs);
      via.sort();
      const ok = via.length > 0;
      if (ok) patchMail({ lastPickup: Date.now() });
      return { ok, via, error: errors.join('\n') };
    } finally {
      sending = false;
    }
  }

  // 「把用法发给他」：发到允许名单里的第一个邮箱
  async function sendGuide() {
    const c = conf();
    const why = missing(c, ['smtp']);
    if (why) return { ok: false, error: why };
    const allow = parseAllow(c.m.allow);
    if (!allow.length) return { ok: false, error: i18n.t('main.mail.error.noAllow') };
    const pet = i18n.petName(store.data);
    const msg = guideMessage({ pet, nick: i18n.nickname(store.data), address: c.address, allow, secret: c.m.secret, receipt: c.m.receipt !== false });
    let err;
    try {
      [err] = await sendMails(await withCred(c), pet, [{ to: allow[0], ...msg }]);
    } catch (e) {
      err = e;
    }
    if (err) return { ok: false, to: allow[0], error: friendlyError(err, c.server) };
    return { ok: true, to: allow[0], error: '' };
  }

  // ---------- 定时收信 ----------

  function auto() {
    if (isActive()) check().catch(() => {});
  }

  // 按现在的设置重新排定时收信；刚打开自动收信时过一会儿先收一次
  function reschedule() {
    const active = isActive();
    const next = active ? `on:${interval(settings())}` : 'off';
    if (next === plan) return;
    const wasOff = !plan.startsWith('on');
    plan = next;
    clearInterval(timer);
    timer = null;
    if (!active) return;
    timer = setInterval(auto, interval(settings()) * 60 * 1000);
    if (wasOff && started && !firstTimer) {
      firstTimer = setTimeout(() => {
        firstTimer = null;
        auto();
      }, SOON_CHECK);
    }
  }

  const onChange = (p) => {
    if (p === '*' || p === 'mail' || String(p).startsWith('mail.')) reschedule();
  };

  function start() {
    if (started) return;
    // 上次关掉应用时正在等微软登录：那次登录已经断了
    if ((settings().ms || {}).state === 'waiting') setMs({});
    reschedule();
    started = true;
    firstTimer = setTimeout(() => {
      firstTimer = null;
      auto();
    }, FIRST_CHECK);
    store.on('change', onChange);
  }

  function stop() {
    started = false;
    stopLogin();
    clearTimeout(firstTimer);
    clearInterval(timer);
    firstTimer = null;
    timer = null;
    plan = '';
    store.removeListener('change', onChange);
  }

  // 给页面看的数据：去掉加密存的授权码、推送网址和微软的登录凭据，换成「有没有」
  function redact(data) {
    const m = data && data.mail;
    if (!m || typeof m !== 'object') return data;
    const { passEnc, pushEnc, msTokenEnc, ...rest } = m;
    return { ...data, mail: { ...rest, hasPass: !!unseal(passEnc), hasPush: !!unseal(pushEnc), hasMsToken: !!unseal(msTokenEnc) } };
  }

  return { get, save, test, check, pickup, sendGuide, msLoginStart, msLogout, msOpen, start, stop, redact };
}

// 导出数据时去掉授权码、推送网址和微软的登录凭据（就地修改一份拷贝）
function stripSecrets(data) {
  if (data && data.mail && typeof data.mail === 'object') {
    delete data.mail.passEnc;
    delete data.mail.pushEnc;
    delete data.mail.msTokenEnc;
  }
  return data;
}

module.exports = {
  createMail,
  stripSecrets,
  seal,
  unseal,
  // 纯逻辑（测试用）
  parseDate,
  takeSubjectDate,
  takeBodyDate,
  stripReply,
  takeSecret,
  pureAddress,
  parseAllow,
  isAllowed,
  resolveServer,
  providerList,
  mailLetterId,
  mailKey,
  isPushUrl,
  fillPushUrl,
  htmlToText,
  buildLetter,
  friendlyError,
  receiptMessage,
  pickupMessage,
  guideMessage,
  msOpenable,
  PROVIDERS,
  MS_SCOPE,
};
