// 设置：宠物行为、打扰与声音、系统、天气城市、数据、关于。
import { h, cx, pageHead, cardHead, toggle, segmented, toast, icon, modal, petEl, shake, fmtDate } from '../ui.js';
import { t, petName, nickname, getLang, LANGS } from '../../shared/i18n.mjs';
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
      { class: 'theme-grid' },
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
  leave() {
    ui.results = null;
    ui.error = false;
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
              h('div', { class: 'about-ver' }, t('home.settings.about.version', { version: info.version || '1.0.0' }), info.electron ? ` · Electron ${info.electron}` : ''),
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
