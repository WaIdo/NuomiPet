// 邮件的纯逻辑：拆开日期、标题、暗号、允许名单、服务器识别、去重 id、推送网址、错误说明、邮件内容
const test = require('node:test');
const assert = require('node:assert');
const M = require('../src/main/mail');
const i18n = require('../src/main/i18n');

const now = new Date(2026, 8, 27, 10, 0); // 2026-09-27
const t = i18n.t;

test('日期：各种写法都认，只写月日时今年过了就算明年', () => {
  const ok = [
    ['2026-12-25', '2026-12-25'],
    ['2026/12/25', '2026-12-25'],
    ['2026.12.25', '2026-12-25'],
    ['2026-1-5', '2026-01-05'],
    ['2026年12月25日', '2026-12-25'],
    ['2026 年 1 月 5 日', '2026-01-05'],
    ['12月25日', '2026-12-25'],
    ['12月25号', '2026-12-25'],
    ['12-25', '2026-12-25'],
    ['12/25', '2026-12-25'],
    ['9-27', '2026-09-27'], // 今天还没过
    ['9/26', '2027-09-26'], // 昨天，算明年
    ['1/5', '2027-01-05'],
    ['２０２６－１２－２５', '2026-12-25'], // 全角
    ['2020-01-01', '2020-01-01'], // 过去的日期照样认（马上能拆）
  ];
  for (const [text, want] of ok) assert.equal(M.parseDate(text, now), want, text);
  for (const bad of ['', 'abc', '13-40', '2026-02-30', '2027-02-29', '12', '2026-12', '1225', '12.25']) {
    assert.equal(M.parseDate(bad, now), null, bad);
  }
});

test('拆开日期：主题开头括起来的日期，去掉那一段', () => {
  assert.deepEqual(M.takeSubjectDate('【2026-12-25】圣诞快乐', now), { date: '2026-12-25', rest: '圣诞快乐' });
  assert.deepEqual(M.takeSubjectDate('[2026-12-25] Merry', now), { date: '2026-12-25', rest: 'Merry' });
  assert.deepEqual(M.takeSubjectDate('(12-25)你好', now), { date: '2026-12-25', rest: '你好' });
  assert.deepEqual(M.takeSubjectDate('（12月25日） 你好', now), { date: '2026-12-25', rest: '你好' });
  // 括号里不是日期、日期不在开头：不算
  assert.equal(M.takeSubjectDate('[重要] 你好', now), null);
  assert.equal(M.takeSubjectDate('你好【12-25】', now), null);
  assert.equal(M.takeSubjectDate('【2026-02-30】你好', now), null);
});

test('拆开日期：正文前 3 个非空行里「关键词：日期」，各种语言，去掉那一行', () => {
  const lines = [
    '拆开日期：2026-12-25',
    '拆开: 12-25',
    '解锁日期：12月25日',
    '解鎖：2026/12/25',
    'Unlock: 2026-12-25',
    'OPEN ON: 12/25',
    'open: 12-25',
    '開封日：2026年12月25日',
    '개봉일: 2026-12-25',
    'Ouvrir le : 12-25',
    'تاريخ الفتح: 2026-12-25',
  ];
  for (const line of lines) {
    const r = M.takeBodyDate(`${line}\n圣诞快乐`, now);
    assert.ok(r, line);
    assert.equal(r.date, '2026-12-25', line);
    assert.equal(r.rest, '圣诞快乐', line);
  }
  // 前面有空行和别的行也行（前 3 个非空行以内）
  assert.deepEqual(M.takeBodyDate('\n\n亲爱的：\n今天好冷\n拆开：12-25\n正文', now), { date: '2026-12-25', rest: '\n\n亲爱的：\n今天好冷\n正文' });
  // 第 4 个非空行、没有冒号、不是关键词、日期不对：都不算
  assert.equal(M.takeBodyDate('1\n2\n3\n拆开日期：12-25', now), null);
  assert.equal(M.takeBodyDate('拆开日期 12-25\n正文', now), null);
  assert.equal(M.takeBodyDate('opening: 12-25\n正文', now), null);
  assert.equal(M.takeBodyDate('拆开日期：明天\n正文', now), null);
});

test('标题：去掉回复、转发的前缀和日期，最长 30 字，空的用「一封信」', () => {
  assert.equal(M.stripReply('Re: RE: 回复：Fwd: FW: 转发：答复：你好'), '你好');
  assert.equal(M.stripReply('Reunion: 周末'), 'Reunion: 周末');
  const build = (subject, body = '正文') => M.buildLetter({ messageId: '<x@y>', fromAddress: 'him@example.com', subject, text: body }, { now }).letter;
  assert.equal(build('Re: 【12-25】 圣诞快乐').title, '圣诞快乐');
  assert.equal(build('Re: 【12-25】 圣诞快乐').unlock, '2026-12-25');
  assert.equal(build('  Fwd:   ').title, t('main.letter.untitled'));
  assert.equal(build('好'.repeat(40)).title, '好'.repeat(30));
  assert.equal(build('多个   空格\t标题').title, '多个 空格 标题');
});

test('暗号：主题或正文里要有（不区分大小写），存信时去掉', () => {
  assert.deepEqual(M.takeSecret('生日快乐', '正文', ''), { subject: '生日快乐', body: '正文' });
  assert.equal(M.takeSecret('生日快乐', '正文', '小猫'), null);
  assert.deepEqual(M.takeSecret('小猫 生日快乐', '正文', '小猫'), { subject: ' 生日快乐', body: '正文' });
  assert.deepEqual(M.takeSecret('hi', 'Meow meow body', 'MEOW'), { subject: 'hi', body: '  body' });
  assert.deepEqual(M.takeSecret('a.b', 'x', 'a.b'), { subject: '', body: 'x' }); // 特殊字符按原样比
  const mail = { messageId: '<s@y>', fromAddress: 'him@example.com', subject: '生日快乐', text: '暗号小猫\n正文' };
  assert.equal(M.buildLetter(mail, { secret: '狗狗', now }).skip, 'secret');
  const letter = M.buildLetter(mail, { secret: '小猫', now }).letter;
  assert.equal(letter.body, '暗号\n正文');
});

test('允许名单：带显示名、大小写、各种分隔符', () => {
  assert.deepEqual(M.parseAllow('豪豪 <Him@Example.com>, other@x.com；third@y.cn、fourth@z.org\nhim@example.com'), ['him@example.com', 'other@x.com', 'third@y.cn', 'fourth@z.org']);
  assert.deepEqual(M.parseAllow(''), []);
  assert.equal(M.pureAddress('"豪豪" <Him@Example.COM>'), 'him@example.com');
  assert.equal(M.pureAddress('mailto:him@example.com.'), 'him@example.com');
  assert.equal(M.pureAddress('没有地址'), '');
  assert.equal(M.isAllowed('豪豪 <HIM@example.com>', '豪豪 <him@EXAMPLE.com>'), true);
  assert.equal(M.isAllowed('him@example.com', ['him@example.com']), true);
  assert.equal(M.isAllowed('hi@example.com', 'him@example.com'), false);
  assert.equal(M.isAllowed('', 'him@example.com'), false);
});

test('服务器识别：按邮箱域名', () => {
  const r = (address) => M.resolveServer({ address });
  const box = (host, port, secure = true) => ({ host, port, secure });
  const tls = (host) => ({ host, port: 587, secure: false, starttls: true });
  const pw = (imap, smtp, provider) => ({ imap, smtp, provider, auth: 'password', unsupported: false });
  assert.deepEqual(r('pet@qq.com'), pw(box('imap.qq.com', 993), box('smtp.qq.com', 465), 'qq'));
  assert.equal(r('pet@foxmail.com').imap.host, 'imap.qq.com');
  assert.equal(r('pet@vip.qq.com').smtp.host, 'smtp.qq.com');
  for (const d of ['163.com', '126.com', 'yeah.net', '188.com', 'vip.163.com', 'vip.126.com']) {
    assert.deepEqual(r(`Pet@${d.toUpperCase()}`), pw(box(`imap.${d}`, 993), box(`smtp.${d}`, 465), 'netease'), d);
  }
  assert.deepEqual(r('pet@gmail.com'), pw(box('imap.gmail.com', 993), box('smtp.gmail.com', 465), 'gmail'));
  assert.equal(r('a@googlemail.com').imap.host, 'imap.gmail.com');
  for (const d of ['outlook.com', 'hotmail.com', 'live.com', 'msn.com']) {
    assert.deepEqual(r(`a@${d}`), { imap: box('outlook.office365.com', 993), smtp: tls('smtp-mail.outlook.com'), provider: 'outlook', auth: 'oauth', unsupported: false }, d);
  }
  assert.deepEqual(r('a@me.com').smtp, tls('smtp.mail.me.com'));
  assert.equal(r('a@icloud.com').imap.host, 'imap.mail.me.com');
  assert.equal(r('a@yahoo.com').imap.host, 'imap.mail.yahoo.com');
  assert.equal(r('a@sina.cn').imap.host, 'imap.sina.com');
  assert.equal(r('a@sohu.com').smtp.host, 'smtp.sohu.com');
  assert.equal(r('a@aliyun.com').imap.host, 'imap.aliyun.com');
  assert.equal(r('a@139.com').smtp.host, 'smtp.139.com');
  // 企业邮箱用自己的域名，自动认不出来
  assert.deepEqual(r('a@example.org'), { imap: null, smtp: null, provider: '', auth: 'password', unsupported: false });
  assert.deepEqual(r(''), { imap: null, smtp: null, provider: '', auth: 'password', unsupported: false });
});

test('服务器：在列表里选了服务商就用那一家（企业邮箱、公司的 Microsoft 365）', () => {
  const box = (host, port, secure = true) => ({ host, port, secure });
  const pick = (server, address = 'me@company.com') => M.resolveServer({ server, address });
  assert.deepEqual(pick('exmail'), { imap: box('imap.exmail.qq.com', 993), smtp: box('smtp.exmail.qq.com', 465), provider: 'exmail', auth: 'password', unsupported: false });
  assert.deepEqual(pick('qiye163'), { imap: box('imaphz.qiye.163.com', 993), smtp: box('smtphz.qiye.163.com', 465), provider: 'qiye163', auth: 'password', unsupported: false });
  assert.equal(pick('outlook').auth, 'oauth');
  assert.equal(pick('outlook').imap.host, 'outlook.office365.com');
  // 选了网易、地址是网易的某个域名：用那个域名的服务器；不是网易的域名：用 163 的
  assert.equal(pick('netease', 'a@126.com').imap.host, 'imap.126.com');
  assert.equal(pick('netease').smtp.host, 'smtp.163.com');
  // 不认识的 id 当成自动识别
  assert.equal(M.resolveServer({ server: 'nope', address: 'a@qq.com' }).provider, 'qq');
  // 手动填的
  const custom = M.resolveServer({ server: 'custom', address: 'a@qq.com', imap: { host: ' 127.0.0.1 ', port: '1143', secure: false }, smtp: { host: '', port: 25 } });
  assert.deepEqual(custom, { imap: box('127.0.0.1', 1143, false), smtp: null, provider: 'custom', auth: 'password', unsupported: false });
  // 测试用：把某一家指到本地服务器
  const local = M.resolveServer({ address: 'a@outlook.com' }, { outlook: { imap: box('127.0.0.1', 1), smtp: box('127.0.0.1', 2, false) } });
  assert.deepEqual([local.imap.port, local.smtp.port, local.auth], [1, 2, 'oauth']);
});

test('服务商列表：自动识别在最前、手动填在最后，名字和开通说明都在语言文件里', () => {
  const list = M.providerList();
  assert.equal(list[0].id, 'auto');
  assert.equal(list.at(-1).id, 'custom');
  assert.deepEqual(
    list.map((p) => p.id),
    ['auto', 'qq', 'exmail', 'netease', 'qiye163', 'gmail', 'outlook', 'icloud', 'yahoo', 'sina', 'sohu', 'aliyun', '139', 'custom'],
  );
  for (const p of list) {
    assert.ok(i18n.has(p.nameKey), p.nameKey);
    assert.ok(i18n.has(p.helpKey), p.helpKey);
  }
  assert.ok(i18n.has('main.mail.provider.outlook.register'));
  const outlook = list.find((p) => p.id === 'outlook');
  assert.equal(outlook.auth, 'oauth');
  assert.deepEqual(outlook.domains, ['outlook.com', 'hotmail.com', 'live.com', 'msn.com']);
  assert.equal(list.find((p) => p.id === 'exmail').domains.length, 0);
  assert.equal(list.find((p) => p.id === 'gmail').auth, 'password');
  // 拿到的是拷贝，改了不影响里面的表
  list[1].imap.host = 'x';
  assert.equal(M.providerList()[1].imap.host, 'imap.qq.com');
});

test('微软登录：只在浏览器里打开微软的网址', () => {
  for (const ok of ['https://microsoft.com/devicelogin', 'https://www.microsoft.com/link', 'https://login.microsoftonline.com/common/oauth2/deviceauth', 'https://login.live.com/oauth20_remoteconnect.srf']) {
    assert.equal(M.msOpenable(ok), true, ok);
  }
  for (const bad of ['http://microsoft.com/devicelogin', 'https://microsoft.com.evil.com/x', 'https://evilmicrosoft.com/', 'javascript:alert(1)', '', 'file:///etc/passwd']) {
    assert.equal(M.msOpenable(bad), false, bad);
  }
});

test('去重 id：同一个 Message-ID 总是同一个 id', () => {
  const a = M.mailLetterId('<a1@example.com>');
  assert.match(a, /^mail-[0-9a-f]{12}$/);
  assert.equal(M.mailLetterId('<a1@example.com>'), a);
  assert.notEqual(M.mailLetterId('<a2@example.com>'), a);
  const mail = { messageId: '<a1@example.com>', fromAddress: 'him@example.com', subject: 'x', text: 'y' };
  assert.equal(M.buildLetter(mail, { now }).letter.id, a);
  // 没有 Message-ID：用发件人、时间、主题凑
  const k1 = M.mailKey({ fromAddress: 'Him@Example.com', date: new Date(0), subject: 's' });
  assert.equal(k1, M.mailKey({ fromAddress: 'him@example.com', date: new Date(0), subject: 's' }));
  assert.notEqual(k1, M.mailKey({ fromAddress: 'him@example.com', date: new Date(1000), subject: 's' }));
});

test('推送网址：{title}、{body} 换成 URL 编码后的标题和正文', () => {
  assert.equal(M.fillPushUrl('https://api.day.app/KEY/{title}/{body}', '🚗 来接我 a&b', '第一行\n第二行'), `https://api.day.app/KEY/${encodeURIComponent('🚗 来接我 a&b')}/${encodeURIComponent('第一行\n第二行')}`);
  assert.equal(M.fillPushUrl('https://x.y/send?t={title}&t2={title}&d={body}', 'a b', 'c'), 'https://x.y/send?t=a%20b&t2=a%20b&d=c');
  assert.equal(M.fillPushUrl('https://x.y/ping', 'a', 'b'), 'https://x.y/ping');
  assert.equal(M.isPushUrl('https://sctapi.ftqq.com/KEY.send?title={title}&desp={body}'), true);
  assert.equal(M.isPushUrl('http://127.0.0.1:8080/{title}'), true);
  for (const bad of ['', 'ftp://x.y', 'api.day.app/KEY', 'https://', 'https://a b']) assert.equal(M.isPushUrl(bad), false, bad);
});

test('错误说明：常见的出错原因转成人能看懂的话', () => {
  const e = (message, props = {}) => Object.assign(new Error(message), props);
  assert.equal(M.friendlyError(e('Command failed', { authenticationFailed: true, response: 'LOGIN failed' })), t('main.mail.error.auth'));
  assert.equal(M.friendlyError(e('Invalid login: 535 Error: authentication failed', { code: 'EAUTH', responseCode: 535 })), t('main.mail.error.auth'));
  // 按服务商给不同的说明：Gmail 要应用专用密码，微软的邮箱是登录授权的问题
  assert.equal(M.friendlyError(e('Invalid login', { code: 'EAUTH' }), { provider: 'gmail', auth: 'password' }), t('main.mail.error.authGmail'));
  assert.equal(M.friendlyError(e('Command failed', { authenticationFailed: true }), { provider: 'outlook', auth: 'oauth' }), t('main.mail.error.msAuth'));
  // 已经带着说明的错误原样用
  assert.equal(M.friendlyError(Object.assign(new Error('invalid_grant'), { friendly: '要重新登录' })), '要重新登录');
  assert.equal(M.friendlyError(e('Command failed', { responseText: 'Unsafe Login. Please contact kefu@188.com for help' })), t('main.mail.error.unsafe'));
  assert.equal(M.friendlyError(e('connect ECONNREFUSED 127.0.0.1:993', { code: 'ECONNREFUSED' })), t('main.mail.error.connect'));
  assert.equal(M.friendlyError(e('connect ECONNREFUSED 127.0.0.1:465', { code: 'ESOCKET' })), t('main.mail.error.connect'));
  assert.equal(M.friendlyError(e('getaddrinfo ENOTFOUND imap.example.com', { code: 'ENOTFOUND' })), t('main.mail.error.connect'));
  assert.equal(M.friendlyError(e('Connection timeout', { code: 'ETIMEDOUT' })), t('main.mail.error.timeout'));
  assert.equal(M.friendlyError(e('Failed to establish connection in required time', { code: 'CONNECT_TIMEOUT' })), t('main.mail.error.timeout'));
  assert.equal(M.friendlyError(e('self-signed certificate', { code: 'ESOCKET' })), t('main.mail.error.tls'));
  assert.equal(M.friendlyError(e('certificate has expired', { code: 'CERT_HAS_EXPIRED' })), t('main.mail.error.tls'));
  assert.equal(M.friendlyError(e('HTTP 500', { status: 500 })), t('main.mail.error.http', { status: 500 }));
  assert.equal(M.friendlyError(e('something odd')), t('main.mail.error.other', { error: 'something odd' }));
  assert.equal(M.friendlyError(null), t('main.mail.error.other', { error: '' }));
});

test('一封邮件变成一封信：署名、HTML、空正文、时间', () => {
  const base = { messageId: '<m@y>', fromAddress: 'Him@Example.com', fromName: '豪豪', subject: '想你', text: '\r\n  今天也想你  \r\n' };
  const a = M.buildLetter(base, { now }).letter;
  assert.deepEqual(
    { title: a.title, from: a.from, unlock: a.unlock, body: a.body, source: a.source, mailFrom: a.mailFrom },
    { title: '想你', from: '豪豪', unlock: '', body: '今天也想你', source: 'mail', mailFrom: 'him@example.com' },
  );
  // 署名：她设置的「你的署名」优先，其次发件人名字，再其次地址 @ 前面
  assert.equal(M.buildLetter(base, { sender: '老公', now }).letter.from, '老公');
  assert.equal(M.buildLetter({ ...base, fromName: '' }, { now }).letter.from, 'him');
  // 只有 HTML
  const html = M.buildLetter({ ...base, text: '', html: '<p>第一段&nbsp;&amp;</p><p>第二段<br>换行</p><script>x()</script>' }, { now }).letter;
  assert.equal(html.body, '第一段 &\n第二段\n换行');
  // 正文是空的（去掉日期那一行以后）
  assert.equal(M.buildLetter({ ...base, text: '拆开日期：12-25' }, { now }).skip, 'empty');
  // 正文里的拆开日期
  const dated = M.buildLetter({ ...base, text: '拆开日期：2026年12月25日\n圣诞快乐' }, { now }).letter;
  assert.equal(dated.unlock, '2026-12-25');
  assert.equal(dated.body, '圣诞快乐');
  // 主题和正文都有日期：主题的为准，正文那一行留着
  const both = M.buildLetter({ ...base, subject: '【12-24】平安夜', text: '拆开：12-25\n正文' }, { now }).letter;
  assert.equal(both.unlock, '2026-12-24');
  assert.equal(both.body, '拆开：12-25\n正文');
  // 正文最长 5000 字
  assert.equal(M.buildLetter({ ...base, text: '字'.repeat(6000) }, { now }).letter.body.length, 5000);
  // 时间：邮件的发信时间，不会晚于现在
  assert.equal(M.buildLetter({ ...base, date: new Date(2026, 0, 1) }, { now }).letter.createdAt, +new Date(2026, 0, 1));
  assert.equal(M.buildLetter({ ...base, date: new Date(2099, 0, 1) }, { now }).letter.createdAt, +now);
});

test('邮件内容：确认邮件、「来接我」、用法说明', () => {
  const r1 = M.receiptMessage({ pet: '糯米', nick: '宝贝', title: '想你', unlock: '', now });
  assert.equal(r1.text, t('main.mail.receipt.body', { pet: '糯米', nick: '宝贝', title: '想你' }));
  const r2 = M.receiptMessage({ pet: '糯米', nick: '宝贝', title: '圣诞快乐', unlock: '2026-12-25', now });
  assert.match(r2.text, /2026年12月25日/);
  assert.equal(r2.text, t('main.mail.receipt.bodyLater', { pet: '糯米', nick: '宝贝', title: '圣诞快乐', date: '2026年12月25日' }));
  // 拆开日期已经过了：不说「会在那天交给她」
  assert.equal(M.receiptMessage({ pet: '糯米', nick: '宝贝', title: 'x', unlock: '2020-01-01', now }).text, t('main.mail.receipt.body', { pet: '糯米', nick: '宝贝', title: 'x' }));

  const v = { pet: '糯米', nick: '宝贝', time: '18:05' };
  assert.equal(M.pickupMessage({ ...v, when: 'now' }).subject, t('main.mail.pickup.subjectNow', v));
  assert.equal(M.pickupMessage({ ...v, when: '30' }).subject, t('main.mail.pickup.subject30', v));
  assert.equal(M.pickupMessage({ ...v, when: '60' }).subject, t('main.mail.pickup.subject60', v));
  assert.equal(M.pickupMessage({ ...v, when: 'now' }).text, t('main.mail.pickup.body', v));
  const withNote = M.pickupMessage({ ...v, when: 'now', note: '在公司门口' }).text;
  assert.match(withNote, /宝贝在 18:05 叫你来接她/);
  assert.match(withNote, /在公司门口/);
  assert.match(withNote, /——糯米$/);

  const g = M.guideMessage({ pet: '糯米', nick: '宝贝', address: 'pet@qq.com', allow: ['him@example.com'], secret: '小猫', receipt: true, now });
  assert.equal(g.subject, t('main.mail.guide.subject', { pet: '糯米', nick: '宝贝' }));
  for (const part of ['pet@qq.com', 'him@example.com', '【2026-12-25】', '拆开日期：2026-12-25', '小猫', t('main.mail.guide.receipt', { pet: '糯米' })]) {
    assert.ok(g.text.includes(part), part);
  }
  const plain = M.guideMessage({ pet: '糯米', nick: '宝贝', address: 'pet@qq.com', allow: [], secret: '', receipt: false, now });
  assert.ok(!plain.text.includes(t('main.mail.guide.receipt', { pet: '糯米' })));
  assert.ok(!plain.text.includes('暗号'));
});

test('授权码的存法：没有加密时用明文存，解不开就当没填', () => {
  const raw = M.seal('abc', { plain: true });
  assert.match(raw, /^raw:/);
  assert.equal(M.unseal(raw), 'abc');
  assert.equal(M.seal(''), '');
  assert.equal(M.unseal(''), '');
  assert.equal(M.unseal('enc:AAAA'), ''); // 这里没有 safeStorage，解不开
  assert.equal(M.unseal('garbage'), '');
  assert.deepEqual(M.stripSecrets({ mail: { passEnc: 'x', pushEnc: 'y', address: 'a' } }), { mail: { address: 'a' } });
});
