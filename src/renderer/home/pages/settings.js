// 设置：宠物行为、打扰与声音、系统、天气城市、数据、关于。
import { h, cx, pageHead, cardHead, toggle, segmented, toast, icon, modal, petEl, shake, fmtDate } from '../ui.js';
import { t, petName, nickname, getLang, LANGS } from '../../shared/i18n.mjs';
import C from '../../shared/common.mjs';
import themes from '../../../shared/themes.json' with { type: 'json' };

// 活泼程度；名字在 home.settings.activity.<id>
const ACTIVITY = ['quiet', 'normal', 'lively'];

// error：搜索城市失败时为 true（文字在显示时按当前语言取）
const ui = { searching: false, results: null, error: false };

function row(label, desc, ctrl, o = {}) {
  return h('div', { class: cx('set-row', o.cls), key: o.key || label }, h('div', { class: 'set-label' }, h('span', label), desc && h('small', desc)), ctrl);
}

function settingToggle(app, key, label, desc) {
  const v = !!app.state.settings?.[key];
  return row(label, desc, toggle(v, (on) => app.set('settings.' + key, on), { label }));
}

async function setLogin(app, on) {
  app.state.settings.launchAtLogin = on;
  try {
    const actual = await app.mochi.app.setLoginItem(on);
    if (typeof actual === 'boolean') {
      app.state.settings.launchAtLogin = actual;
      if (actual !== on) toast(t('home.settings.system.loginDenied'), 'err');
      else toast(t('home.toast.saved'));
    }
  } catch (err) {
    console.error('[settings] setLoginItem failed', err);
    app.state.settings.launchAtLogin = !on;
    toast(t('home.settings.system.loginFailed'), 'err');
  }
  app.rerender();
}

async function search(app, e) {
  const box = e.currentTarget.closest('.city-search');
  const input = box.querySelector('input');
  const q = input.value.trim();
  if (!q) {
    shake(input);
    input.focus();
    return;
  }
  ui.searching = true;
  ui.error = false;
  ui.results = null;
  app.rerender();
  try {
    const res = await app.mochi.weather.search(q);
    ui.results = Array.isArray(res) ? res.slice(0, 8) : [];
  } catch (err) {
    ui.results = null;
    ui.error = true;
  }
  ui.searching = false;
  app.rerender();
}

function pickCity(app, r) {
  const name = r.name || '';
  app.set('weather.city', name, { quiet: true });
  app.set('weather.lat', r.latitude, { quiet: true });
  app.set('weather.lon', r.longitude, { quiet: true });
  app.set('weather.enabled', true, { quiet: true });
  ui.results = null;
  ui.error = false;
  toast(t('home.settings.weather.picked', { city: name }));
}

function weatherCard(app) {
  const w = app.state.weather || {};
  const hasCity = w.lat != null && w.lon != null;
  const cur = app.weather?.status === 'ok' ? app.weather.data : null;
  const results = ui.results;
  return h(
    'section',
    { class: 'card set-card', key: 'weather' },
    cardHead('🌤️', t('home.weather.title')),
    row(t('home.settings.weather.show'), t('home.settings.weather.showHint'), toggle(!!w.enabled, (v) => app.set('weather.enabled', v), { label: t('home.settings.weather.showLabel') }), { key: 'wx-on' }),
    h(
      'div',
      { class: 'city-now', key: 'city-now' },
      h('span', { class: 'cn-label' }, t('home.settings.weather.city')),
      hasCity ? h('b', w.city || t('home.settings.weather.cityPicked')) : h('span', { class: 'muted' }, t('home.settings.weather.cityNone')),
      cur && h('span', { class: 'cn-wx' }, `${cur.emoji || ''} ${Math.round(cur.temp)}° ${cur.desc || ''}`),
      w.enabled && !hasCity && h('span', { class: 'cn-warn' }, t('home.settings.weather.cityFirst')),
    ),
    h(
      'div',
      { class: 'city-search', key: 'city-search' },
      h(
        'div',
        { class: 'cs-row' },
        h('input', {
          class: 'input grow',
          key: 'city-q',
          placeholder: t('home.settings.weather.searchPlaceholder'),
          maxlength: 40,
          'aria-label': t('home.settings.weather.searchLabel'),
          onkeydown: (e) => e.key === 'Enter' && !e.isComposing && search(app, e),
        }),
        h('button', { type: 'button', class: 'btn soft', key: 'go', disabled: ui.searching, onclick: (e) => search(app, e) }, icon('search'), ui.searching ? t('home.settings.weather.searching') : t('home.settings.weather.search')),
      ),
      ui.error && h('p', { class: 'cs-state err', key: 'err' }, t('home.settings.weather.searchFailed')),
      results &&
        (results.length
          ? h(
              'div',
              { class: 'cs-results', key: 'res' },
              results.map((r, i) =>
                h(
                  'button',
                  { type: 'button', class: 'cs-item', key: 'r' + i, onclick: () => pickCity(app, r) },
                  h('span', { class: 'cs-pin' }, '📍'),
                  h('b', r.name),
                  h('small', [r.admin1, r.country].filter((x, j, a) => x && a.indexOf(x) === j && x !== r.name).join(' · ')),
                ),
              ),
            )
          : h('p', { class: 'cs-state', key: 'none' }, t('home.settings.weather.notFound'))),
    ),
    h('p', { class: 'wx-credit', key: 'credit' }, t('home.settings.weather.credit')),
  );
}

/* ---------------- 邮件 ---------------- */

// 他用邮件往信箱寄信、叫他来接（主进程 mail.js；接口见 window.mochi.mail）。
// info：mail.get() 的结果（设置、服务商列表、自动识别出的服务器……）；form：正在改、还没保存的设置；
// busy：正在做的操作（save / test / check / guide / ms）；test：上次「测试连接」的结果
const mail = { info: null, loading: false, form: null, showPass: false, busy: '', test: null };
const MAIL_KEYS = ['address', 'server', 'allow', 'secret', 'notifyTo', 'receipt', 'interval', 'msClientId'];
const MAIL_INTERVALS = [2, 5, 10, 30];

const mailForm = (info) => ({
  ...Object.fromEntries(MAIL_KEYS.map((k) => [k, info[k]])),
  imap: { ...info.imap },
  smtp: { ...info.smtp },
  password: '', // 明文，只在保存时发给主进程；空 = 不改
  pushUrl: '',
});

// 和已经保存的比，改了哪些（给 mail.save 的 patch）
function mailPatch() {
  const f = mail.form;
  const i = mail.info;
  if (!f || !i) return {};
  const p = {};
  for (const k of MAIL_KEYS) if (f[k] !== i[k]) p[k] = f[k];
  if (f.server === 'custom') {
    if (JSON.stringify(f.imap) !== JSON.stringify(i.imap)) p.imap = f.imap;
    if (JSON.stringify(f.smtp) !== JSON.stringify(i.smtp)) p.smtp = f.smtp;
  }
  if (f.password.trim()) p.password = f.password.trim();
  if (f.pushUrl.trim()) p.pushUrl = f.pushUrl.trim();
  return p;
}

async function loadMail(app) {
  if (!app.mochi.mail || mail.loading) return;
  mail.loading = true;
  try {
    const info = await app.mochi.mail.get();
    const dirty = Object.keys(mailPatch()).length > 0;
    mail.info = info;
    if (!mail.form || !dirty) mail.form = mailForm(info);
  } catch (err) {
    console.error('[settings] mail.get failed', err);
  }
  mail.loading = false;
  app.rerender();
}

// 保存改动；没改就直接算成功。返回是否都存上了
async function saveMail(app, { quiet = false } = {}) {
  const patch = mailPatch();
  if (!Object.keys(patch).length) {
    if (!quiet) toast(t('home.toast.saved'));
    return true;
  }
  mail.busy = 'save';
  app.rerender();
  let ok = false;
  try {
    const r = await app.mochi.mail.save(patch);
    mail.info = r;
    // 推送网址不对时别的都存上了，填的网址留着给她改
    mail.form = { ...mailForm(r), pushUrl: r.ok ? '' : patch.pushUrl || '' };
    ok = !!r.ok;
    if (!ok) toast(r.error || t('home.toast.saveFailed'), 'err');
    else if (!quiet) toast(t('home.toast.saved'));
  } catch (err) {
    console.error('[settings] mail.save failed', err);
    toast(t('home.toast.saveFailed'), 'err');
  }
  mail.busy = '';
  app.rerender();
  return ok;
}

async function setMailEnabled(app, on) {
  try {
    const r = await app.mochi.mail.save({ enabled: on });
    mail.info = r;
    if (on && !r.ready) toast(t('home.settings.mail.notReady', { pet: petName(app.state) }), 'err');
    else toast(t('home.toast.saved'));
  } catch (err) {
    console.error('[settings] mail.save failed', err);
    toast(t('home.toast.saveFailed'), 'err');
  }
  app.rerender();
}

// 先把改动存上，再做 fn（测试、收信、发用法、微软登录都用存好的设置）
async function mailAction(app, busy, fn) {
  if (mail.busy || !(await saveMail(app, { quiet: true }))) return;
  mail.busy = busy;
  app.rerender();
  try {
    await fn();
  } catch (err) {
    console.error('[settings] mail', busy, 'failed', err);
    toast(t('home.settings.mail.failed'), 'err');
  }
  mail.busy = '';
  app.rerender();
  loadMail(app);
}

const mailTest = (app) =>
  mailAction(app, 'test', async () => {
    mail.test = null;
    mail.test = await app.mochi.mail.test();
  });

const mailCheck = (app) =>
  mailAction(app, 'check', async () => {
    const r = await app.mochi.mail.check();
    if (!r.ok) toast(r.error || t('home.settings.mail.failed'), 'err');
    else if (r.added) toast(t('home.settings.mail.checkAdded', { n: r.added }));
    else toast(r.error || t('home.settings.mail.checkNone'), r.error ? 'err' : '');
  });

const mailGuide = (app) =>
  mailAction(app, 'guide', async () => {
    const r = await app.mochi.mail.sendGuide();
    if (r.ok) toast(t('home.settings.mail.guideSent', { to: r.to }));
    else toast(r.error || t('home.settings.mail.failed'), 'err');
  });

const msLogin = (app) =>
  mailAction(app, 'ms', async () => {
    const r = await app.mochi.mail.msLoginStart();
    if (!r.ok) toast(r.error || t('home.settings.mail.failed'), 'err');
  });

async function msLogout(app) {
  await app.mochi.mail.msLogout();
  toast(t('home.settings.mail.ms.loggedOut'));
  loadMail(app);
}

async function copyCode(code) {
  try {
    await navigator.clipboard.writeText(code);
    toast(t('home.settings.mail.ms.copied'));
  } catch {
    toast(t('home.settings.mail.failed'), 'err');
  }
}

// 现在用哪家：选了具体的服务商就是那家；自动识别时按邮箱的域名找
function mailProvider(info, f) {
  const list = info.providers || [];
  if (f.server !== 'auto') return list.find((p) => p.id === f.server) || null;
  const domain = String(f.address || '').trim().toLowerCase().split('@')[1] || '';
  return list.find((p) => p.domains.includes(domain)) || null;
}

const serverText = (x) => (x && x.host ? `${x.host}:${x.port} ${x.starttls ? 'STARTTLS' : x.secure ? 'SSL' : ''}`.trim() : '');

function mailField(label, control, hint, o = {}) {
  return h('div', { class: cx('field', o.cls), key: o.key }, h('span', { class: 'field-label' }, label, o.tag), control, hint && h('span', { class: 'field-hint' }, hint));
}

function mailInput(app, key, o = {}) {
  return h('input', {
    class: 'input',
    key,
    name: 'mail-' + key,
    type: o.type || 'text',
    value: mail.form[key] ?? '',
    placeholder: o.placeholder,
    maxlength: o.max || 200,
    autocomplete: 'off',
    spellcheck: 'false',
    // 邮箱地址、网址总是从左往右写（从右往左的界面里不这样，数字开头的地址会被倒过来显示）
    dir: o.ltr ? 'ltr' : null,
    'aria-label': o.label,
    oninput: (e) => {
      mail.form[key] = e.target.value;
      app.rerender(); // 认服务器、「默认发到」、登录按钮跟着变；正在输入的框不会被打断
    },
  });
}

// 手动填的收信 / 发信服务器：地址、端口、SSL
function serverRow(app, which, label) {
  const sv = mail.form[which];
  const set = (k, v) => {
    mail.form[which] = { ...mail.form[which], [k]: v };
    app.rerender();
  };
  return h(
    'div',
    { class: 'field mail-server', key: 'srv-' + which },
    h('span', { class: 'field-label' }, label),
    h(
      'div',
      { class: 'ms-row' },
      h('input', { class: 'input', key: 'host', dir: 'ltr', value: sv.host, placeholder: which + '.example.com', maxlength: 200, 'aria-label': t('home.settings.mail.host'), oninput: (e) => (mail.form[which] = { ...mail.form[which], host: e.target.value.trim() }) }),
      h('input', { class: 'input', key: 'port', type: 'number', min: 1, max: 65535, value: sv.port, 'aria-label': t('home.settings.mail.port'), onchange: (e) => set('port', Number(e.target.value) || sv.port) }),
      h('span', { class: 'ms-ssl' }, toggle(!!sv.secure, (v) => set('secure', v), { label: 'SSL' }), 'SSL'),
    ),
  );
}

// 微软邮箱（Outlook）：先要有应用 ID，再用设备代码登录
function msBlock(app, info) {
  const f = mail.form;
  const ms = { ...(info.ms || {}), ...(app.state.mail?.ms || {}) };
  const busy = mail.busy === 'ms';
  const kids = [];
  if (!info.msClientId) {
    kids.push(h('p', { class: 'mail-help', key: 'reg' }, t('main.mail.provider.outlook.register')));
    kids.push(mailField(t('home.settings.mail.ms.clientId'), mailInput(app, 'msClientId', { placeholder: '00000000-0000-0000-0000-000000000000', max: 100, ltr: true }), null, { key: 'cid' }));
  }
  if (ms.state === 'ok' || (app.state.mail?.hasMsToken && ms.state !== 'waiting')) {
    kids.push(
      h(
        'div',
        { class: 'mail-ms ok', key: 'ok' },
        h('span', t('home.settings.mail.ms.loggedIn', { account: ms.account || f.address })),
        h('button', { type: 'button', class: 'btn ghost sm', onclick: () => msLogout(app) }, t('home.settings.mail.ms.logout')),
      ),
    );
  } else if (ms.state === 'waiting' && ms.userCode) {
    kids.push(
      h(
        'div',
        { class: 'mail-ms waiting', key: 'wait' },
        h('p', { class: 'mail-help' }, t('home.settings.mail.ms.waiting')),
        h(
          'div',
          { class: 'ms-code-row' },
          h('b', { class: 'ms-code' }, ms.userCode),
          h('button', { type: 'button', class: 'btn ghost sm', onclick: () => copyCode(ms.userCode) }, t('home.settings.mail.ms.copy')),
          h('button', { type: 'button', class: 'btn primary sm', onclick: () => app.mochi.mail.msOpen() }, t('home.settings.mail.ms.open')),
        ),
      ),
    );
  } else {
    if (ms.state === 'error' && ms.error) kids.push(h('p', { class: 'mail-warn', key: 'err' }, ms.error));
    kids.push(
      h(
        'div',
        { class: 'mail-ms', key: 'login' },
        h('button', { type: 'button', class: 'btn soft sm', disabled: busy || !(f.msClientId || '').trim() || !f.address.trim(), onclick: () => msLogin(app) }, busy ? t('home.settings.mail.working') : t('home.settings.mail.ms.login')),
      ),
    );
  }
  return h('div', { class: 'mail-oauth', key: 'oauth' }, kids);
}

function mailCard(app) {
  const pet = petName(app.state);
  if (!app.mochi.mail) return null;
  const info = mail.info;
  const f = mail.form;
  const head = (extra) => cardHead('📮', t('home.settings.mail.title'), extra, t('home.settings.mail.sub', { pet }));
  if (!info || !f) return h('section', { class: 'card set-card mail-card', key: 'mail', id: 'mail-card' }, head(null), h('p', { class: 'muted', key: 'loading' }, t('home.settings.mail.loading')));
  const live = app.state.mail || {};
  const provider = mailProvider(info, f);
  const oauth = f.server !== 'custom' && provider?.auth === 'oauth';
  const hasPass = live.hasPass ?? info.hasPass;
  const hasPush = live.hasPush ?? info.hasPush;
  const busy = mail.busy;
  // 他的第一个邮箱（「来接我」默认发到这里）；分隔符里有全角的逗号、分号
  const firstAllow = (f.allow.match(/[^\s,\uff0c;\uff1b<>]+@[^\s,\uff0c;\uff1b<>]+/) || [''])[0];

  // 服务器：手动填，或者显示认出来的
  let servers;
  if (f.server === 'custom') {
    servers = [h('p', { class: 'mail-help custom', key: 'help' }, t('main.mail.provider.custom.help')), serverRow(app, 'imap', t('home.settings.mail.imap')), serverRow(app, 'smtp', t('home.settings.mail.smtp'))];
  } else if (provider) {
    // 保存过的设置用主进程算出来的（网易等按域名换服务器），正在改的用服务商的默认服务器
    const same = f.address === info.address && f.server === info.server && info.resolved?.imap;
    const r = same ? info.resolved : provider;
    servers = [
      h('p', { class: 'mail-detected', key: 'det' }, t('home.settings.mail.detected', { name: t(provider.nameKey), imap: serverText(r.imap), smtp: serverText(r.smtp) })),
      h('p', { class: 'mail-help', key: 'help' }, t(provider.helpKey)),
    ];
  } else if (f.address.includes('@')) {
    servers = [h('p', { class: 'mail-warn', key: 'unknown' }, t('main.mail.error.unknownServer'))];
  } else {
    servers = [h('p', { class: 'mail-help', key: 'help' }, t('main.mail.provider.auto.help'))];
  }

  const passField = mailField(
    t('home.settings.mail.pass'),
    h(
      'div',
      { class: 'ms-row pass' },
      mailInput(app, 'password', { type: mail.showPass ? 'text' : 'password', placeholder: hasPass ? t('home.settings.mail.savedPlaceholder') : t('home.settings.mail.passPlaceholder') }),
      h(
        'button',
        {
          type: 'button',
          class: 'btn ghost sm',
          onclick: () => {
            mail.showPass = !mail.showPass;
            app.rerender();
          },
        },
        mail.showPass ? t('home.settings.mail.hide') : t('home.settings.mail.show'),
      ),
    ),
    t('home.settings.mail.passHint'),
    { key: 'pass', tag: hasPass && h('span', { class: 'mail-saved' }, t('home.settings.mail.saved')) },
  );

  const test = mail.test;
  const testLine = (which, r) => h('p', { class: cx('mail-result', { bad: !r.ok }), key: which }, r.ok ? t(`home.settings.mail.${which}Ok`) : t(`home.settings.mail.${which}Fail`, { error: r.error || '' }));
  const when = (ms) => {
    const d = new Date(ms);
    return t('home.settings.mail.when', { date: fmtDate(C.dateKey(d), { withYear: false }), time: C.hm(d) });
  };

  return h(
    'section',
    { class: 'card set-card mail-card', key: 'mail', id: 'mail-card' },
    head(toggle(!!info.enabled, (v) => setMailEnabled(app, v), { label: t('home.settings.mail.enabled') })),
    info.encryption === false && h('p', { class: 'notice', key: 'plain' }, t('home.settings.mail.plain')),
    h(
      'div',
      { class: 'mail-form', key: 'form' },
      h(
        'div',
        { class: 'mail-grid', key: 'who' },
        mailField(
          t('home.settings.mail.provider'),
          h(
            'select',
            {
              class: 'input',
              key: 'server',
              value: f.server,
              'aria-label': t('home.settings.mail.provider'),
              onchange: (e) => {
                f.server = e.target.value;
                app.rerender();
              },
            },
            (info.providers || []).map((p) => h('option', { value: p.id }, t(p.nameKey))),
          ),
          null,
          { key: 'provider' },
        ),
        mailField(t('home.settings.mail.address', { pet }), mailInput(app, 'address', { type: 'email', placeholder: t('home.settings.mail.addressPlaceholder'), ltr: true }), t('home.settings.mail.addressHint', { pet }), { key: 'address' }),
      ),
      h('div', { class: 'mail-servers', key: 'servers' }, servers),
      oauth ? msBlock(app, info) : passField,
      h(
        'div',
        { class: 'mail-grid', key: 'him' },
        mailField(t('home.settings.mail.allow'), mailInput(app, 'allow', { placeholder: t('home.settings.mail.allowPlaceholder'), max: 1000, ltr: true }), t('home.settings.mail.allowHint'), { key: 'allow' }),
        mailField(
          t('home.settings.mail.notifyTo'),
          // 空着就发到他的邮箱：提示里直接显示那个地址（只放地址，从左往右的框里不夹别的文字）
          mailInput(app, 'notifyTo', { placeholder: firstAllow, ltr: true }),
          t('home.settings.mail.notifyHint'),
          { key: 'notify' },
        ),
      ),
      mailField(t('home.settings.mail.secret'), mailInput(app, 'secret', { placeholder: t('home.settings.mail.secretPlaceholder'), max: 100 }), t('home.settings.mail.secretHint', { pet }), { key: 'secret' }),
      mailField(
        t('home.settings.mail.push'),
        h(
          'div',
          { class: 'ms-row' },
          mailInput(app, 'pushUrl', { placeholder: hasPush ? t('home.settings.mail.savedPlaceholder') : 'https://api.day.app/…', max: 1000, ltr: true }),
          hasPush && h('button', { type: 'button', class: 'btn ghost sm', key: 'clear', onclick: () => app.mochi.mail.save({ pushUrl: '' }).then(() => loadMail(app)) }, t('home.settings.mail.clear')),
        ),
        t('home.settings.mail.pushHint'),
        { key: 'push', tag: hasPush && h('span', { class: 'mail-saved' }, t('home.settings.mail.saved')) },
      ),
    ),
    row(
      t('home.settings.mail.receipt'),
      t('home.settings.mail.receiptHint'),
      toggle(!!f.receipt, (v) => {
        f.receipt = v;
        app.rerender();
      }, { label: t('home.settings.mail.receipt') }),
      { key: 'receipt' },
    ),
    row(
      t('home.settings.mail.interval'),
      t('home.settings.mail.intervalHint'),
      segmented(
        MAIL_INTERVALS.map((n) => ({ value: n, label: t('home.settings.mail.minutes', { n }) })),
        f.interval,
        (v) => {
          f.interval = v;
          app.rerender();
        },
        { cls: 'sm' },
      ),
      { key: 'interval' },
    ),
    h(
      'div',
      { class: 'mail-actions', key: 'actions' },
      h('button', { type: 'button', class: 'btn primary sm', disabled: !!busy, onclick: () => saveMail(app) }, busy === 'save' ? t('home.settings.mail.working') : t('common.save')),
      h('button', { type: 'button', class: 'btn ghost sm', disabled: !!busy, onclick: () => mailTest(app) }, busy === 'test' ? t('home.settings.mail.working') : t('home.settings.mail.test')),
      h('button', { type: 'button', class: 'btn ghost sm', disabled: !!busy, onclick: () => mailCheck(app) }, busy === 'check' ? t('home.settings.mail.working') : t('home.settings.mail.check')),
      h('button', { type: 'button', class: 'btn ghost sm', disabled: !!busy, onclick: () => mailGuide(app) }, busy === 'guide' ? t('home.settings.mail.working') : t('home.settings.mail.guide')),
    ),
    test && h('div', { class: 'mail-test', key: 'test' }, testLine('imap', test.imap || {}), testLine('smtp', test.smtp || {})),
    h(
      'p',
      { class: 'mail-status', key: 'status' },
      live.lastCheck ? [t('home.settings.mail.lastCheck', { time: when(live.lastCheck) }), ' · ', t('home.settings.mail.lastCount', { n: live.lastCount || 0 })] : t('home.settings.mail.never'),
    ),
    live.lastError && h('p', { class: 'mail-warn', key: 'lastError' }, live.lastError),
  );
}

async function doExport(app) {
  try {
    const r = await app.mochi.app.exportData();
    if (r && r.ok) toast(r.path ? t('home.settings.data.exportedTo', { file: String(r.path).split(/[\\/]/).pop() }) : t('home.settings.data.exported'));
    else if (r && r.error) toast(t('home.settings.data.exportError', { error: r.error }), 'err');
  } catch (err) {
    toast(t('home.settings.data.exportFailed'), 'err');
  }
}

async function doImport(app) {
  const ok = await modal({
    title: t('home.settings.data.importTitle'),
    text: t('home.settings.data.importText'),
    ok: t('home.settings.data.importOk'),
    cancel: t('home.settings.data.importCancel'),
  });
  if (!ok) return;
  try {
    const r = await app.mochi.app.importData();
    if (r && r.ok) toast(t('home.settings.data.imported'));
    else if (r && r.error) toast(t('home.settings.data.importError', { error: r.error }), 'err');
  } catch (err) {
    toast(t('home.settings.data.importFailed'), 'err');
  }
}

async function doReset(app) {
  const ok = await modal({
    title: t('home.settings.data.resetTitle'),
    text: t('home.settings.data.resetText', { pet: petName(app.state) }),
    ok: t('home.settings.data.resetOk'),
    cancel: t('home.settings.data.resetCancel'),
    danger: true,
    look: app.look(),
    pose: 'sad',
    face: ['sad', 'wavy'],
  });
  if (!ok) return;
  try {
    const r = await app.mochi.app.resetData();
    if (r && r.ok === false) toast(t('home.settings.data.resetError', { error: r.error || t('home.settings.data.unknownError') }), 'err');
    else toast(t('home.settings.data.resetDone'));
  } catch (err) {
    toast(t('home.settings.data.resetFailed'), 'err');
  }
}

// 小窝的颜色：几种主题 + 跟宠物的配色一样
function themeCard(app) {
  const cur = app.state.settings?.theme || 'sakura';
  const pal = app.catalog.palettes.find((p) => p.id === app.state.pet?.color);
  const auto = themes.find((x) => x.id === pal?.theme) || themes[0];
  const n = themes.length + 1;
  const opt = (id, name, th, extra) =>
    h(
      'button',
      {
        type: 'button',
        key: id,
        class: cx('theme-opt', { on: cur === id }),
        'aria-pressed': cur === id ? 'true' : 'false',
        onclick: () => {
          if (cur !== id) app.set('settings.theme', id);
        },
      },
      h('span', { class: 'theme-dot', style: { '--c': th.swatch, '--l': th.light } }, extra, cur === id && h('span', { class: 'theme-check' }, icon('check'))),
      h('span', { class: 'theme-name' }, name),
    );
  return h(
    'section',
    { class: 'card set-card', key: 'theme' },
    cardHead('🎨', t('home.settings.theme.title'), null, t('home.settings.theme.sub')),
    h(
      'div',
      // 选项多于一行（7 个）时排成几行一样多的，比如 9 个排 5+4、10 个排 5+5
      { class: cx('theme-grid', { rows: n > 7 }), style: n > 7 ? { '--cols': Math.ceil(n / Math.ceil(n / 7)) } : null },
      themes.map((th) => opt(th.id, th.name, th)),
      opt('auto', t('home.settings.theme.auto'), auto, h('span', { class: 'theme-paw' }, '🐾')),
    ),
  );
}

// 语言：跟随系统，或者固定一种。语言名用各自的语言写，不翻译，看不懂当前界面也能找到自己的语言
function langCard(app) {
  const cur = app.state.settings?.language || 'auto';
  const now = LANGS.find((l) => l.id === getLang()) || LANGS[0];
  const title = t('lang.title') + (getLang() === 'en' ? '' : ' · Language');
  // 设成固定语言时，界面用的就是那种语言，括号里的「现在是……」看不出系统语言，就不显示
  const opts = [{ id: 'auto', name: cur === 'auto' ? t('lang.autoNow', { name: now.name }) : t('lang.auto') }, ...LANGS.map((l) => ({ ...l, lang: l.id }))];
  return h(
    'section',
    { class: 'card set-card', key: 'lang' },
    cardHead('🌐', title),
    h(
      'div',
      { class: 'lang-grid', role: 'radiogroup', 'aria-label': title },
      opts.map((o) =>
        h(
          'button',
          {
            type: 'button',
            key: o.id,
            role: 'radio',
            lang: o.lang,
            class: cx('lang-opt', { on: cur === o.id }),
            'aria-checked': cur === o.id ? 'true' : 'false',
            onclick: () => {
              if (cur !== o.id) app.set('settings.language', o.id);
            },
          },
          h('span', { class: 'lang-name' }, o.name),
          cur === o.id && h('span', { class: 'lang-check' }, icon('check')),
        ),
      ),
    ),
  );
}

// 我们的资料：名字、昵称、生日、在一起的日子、署名
function profileCard(app) {
  const st = app.state;
  const C = app.C;
  const days = C.dayNumber(st.love?.togetherSince || '');
  const item = (label, value) => h('div', { class: 'pf-item' }, h('span', { class: 'pf-k' }, label), h('span', { class: cx('pf-v', { none: !value }) }, value || t('common.notSet')));
  return h(
    'section',
    { class: 'card set-card profile-card', key: 'profile' },
    cardHead('💞', t('home.profile.title'), h('button', { type: 'button', class: 'btn soft sm', onclick: () => app.openProfile({ first: false }) }, t('home.settings.profile.edit'))),
    h(
      'div',
      { class: 'pf-grid' },
      item(t('home.settings.profile.petName'), petName(st)),
      item(t('home.settings.profile.nickname'), nickname(st)),
      item(t('home.settings.profile.birthday'), fmtDate(st.love?.birthday || '')),
      item(t('home.together'), days ? t('home.settings.profile.togetherValue', { date: st.love.togetherSince, n: days }) : ''),
      item(t('home.settings.profile.sender'), st.owner?.sender),
    ),
  );
}

export default {
  id: 'settings',
  icon: '⚙️',
  enter(app) {
    mail.test = null;
    loadMail(app);
  },
  leave() {
    ui.results = null;
    ui.error = false;
    // 没保存的邮件设置不留着，下次进来按保存过的显示
    mail.form = null;
    mail.showPass = false;
  },
  render(app) {
    const s = app.state.settings || {};
    const vol = Math.max(0, Math.min(1, Number(s.volume ?? 0.6)));
    const info = app.info || {};
    return h(
      'div',
      { class: 'page page-settings' },
      pageHead('⚙️', t('home.nav.settings'), t('home.settings.sub')),
      h(
        'div',
        { class: 'set-col' },
        profileCard(app),
        langCard(app),
        themeCard(app),
        h(
          'section',
          { class: 'card set-card', key: 'pet' },
          cardHead('🐾', t('home.settings.pet.title')),
          settingToggle(app, 'alwaysOnTop', t('home.settings.pet.onTop'), t('home.settings.pet.onTopHint')),
          settingToggle(app, 'walkAround', t('home.settings.pet.walk'), t('home.settings.pet.walkHint')),
          settingToggle(app, 'followMouse', t('home.settings.pet.follow'), t('home.settings.pet.followHint')),
          settingToggle(app, 'gravity', t('home.settings.pet.gravity'), t('home.settings.pet.gravityHint')),
          settingToggle(app, 'eyeTracking', t('home.settings.pet.eyes'), t('home.settings.pet.eyesHint')),
          row(
            t('home.settings.pet.activity'),
            t('home.settings.pet.activityHint'),
            segmented(
              ACTIVITY.map((id) => ({ value: id, label: t(`home.settings.activity.${id}`) })),
              s.activity || 'normal',
              (v) => app.set('settings.activity', v),
              { cls: 'sm' },
            ),
          ),
        ),
        h(
          'section',
          { class: 'card set-card', key: 'quiet' },
          cardHead('🔔', t('home.settings.quiet.title')),
          settingToggle(app, 'dnd', t('home.settings.quiet.dnd'), t('home.settings.quiet.dndHint')),
          settingToggle(app, 'sound', t('home.settings.quiet.sound'), t('home.settings.quiet.soundHint')),
          row(
            t('home.settings.quiet.volume'),
            null,
            h(
              'div',
              { class: cx('vol', { off: !s.sound }) },
              h('span', { class: 'vol-ico' }, vol === 0 ? '🔇' : '🔈'),
              h('input', {
                type: 'range',
                class: 'range',
                key: 'vol',
                min: 0,
                max: 1,
                step: 0.05,
                value: vol,
                disabled: !s.sound,
                'aria-label': t('home.settings.quiet.volume'),
                style: { '--p': Math.round(vol * 100) + '%' },
                oninput: (e) => {
                  const v = Number(e.target.value);
                  app.state.settings.volume = v;
                  e.target.style.setProperty('--p', Math.round(v * 100) + '%');
                  const label = e.target.parentNode.querySelector('.vol-val');
                  if (label) label.textContent = Math.round(v * 100) + '%';
                },
                onchange: (e) => app.set('settings.volume', Number(e.target.value)),
              }),
              h('span', { class: 'vol-val' }, Math.round(vol * 100) + '%'),
            ),
            { key: 'vol-row', cls: 'vol-row' },
          ),
        ),
        h(
          'section',
          { class: 'card set-card', key: 'sys' },
          cardHead('💻', t('home.settings.system.title')),
          row(t('home.settings.system.login'), t('home.settings.system.loginHint'), toggle(!!s.launchAtLogin, (v) => setLogin(app, v), { label: t('home.settings.system.login') })),
        ),
        weatherCard(app),
        mailCard(app),
        h(
          'section',
          { class: 'card set-card', key: 'data' },
          cardHead('💾', t('home.settings.data.title')),
          row(t('home.settings.data.export'), t('home.settings.data.exportHint'), h('button', { type: 'button', class: 'btn ghost sm', onclick: () => doExport(app) }, t('home.settings.data.exportBtn'))),
          row(t('home.settings.data.import'), t('home.settings.data.importHint'), h('button', { type: 'button', class: 'btn ghost sm', onclick: () => doImport(app) }, t('home.settings.data.importBtn'))),
          row(t('home.settings.data.reset'), t('home.settings.data.resetHint'), h('button', { type: 'button', class: 'btn danger sm', onclick: () => doReset(app) }, t('home.settings.data.resetBtn')), { cls: 'danger-row' }),
        ),
        h(
          'section',
          { class: 'card set-card about', key: 'about' },
          cardHead('💗', t('home.settings.about.title')),
          h(
            'div',
            { class: 'about-top' },
            h('div', { class: 'about-pet' }, petEl(app.look(), { size: 64, blink: true, pose: 'idle', key: 'about-pet' })),
            h(
              'div',
              { class: 'about-text' },
              // 应用名按当前语言显示（主进程给的 info.name 是打包时的固定名字）
              h('div', { class: 'about-name' }, t('app.name')),
              h('div', { class: 'about-ver' }, t('home.settings.about.version', { version: info.version || '' }), info.electron ? ` · Electron ${info.electron}` : ''),
              h('div', { class: 'about-love' }, t('home.settings.about.love')),
            ),
          ),
          h(
            'div',
            { class: 'tips' },
            h('div', { class: 'tip' }, h('span', { class: 'kbd' }, t('home.settings.about.rightClick')), t('home.settings.about.rightClickTip')),
            h('div', { class: 'tip' }, h('span', { class: 'kbd' }, t('home.settings.about.doubleClick')), t('home.settings.about.doubleClickTip')),
            h('div', { class: 'tip' }, h('span', { class: 'kbd' }, t('home.settings.about.rub')), t('home.settings.about.rubTip')),
            h('div', { class: 'tip' }, h('span', { class: 'kbd' }, t('home.settings.about.drag')), t('home.settings.about.dragTip')),
            h('div', { class: 'tip' }, h('span', { class: 'kbd' }, app.mochi.platform === 'darwin' ? '⌘ ⌥ P' : 'Ctrl Alt P'), t('home.settings.about.hotkeyTip')),
          ),
          h(
            'p',
            { class: 'about-legal' },
            'Copyright © 2026 WaIdo · github.com/WaIdo/NuomiPet',
            h('br'),
            t('home.settings.about.license'),
          ),
        ),
      ),
    );
  },
};
