// 设置：宠物行为、打扰与声音、系统、天气城市、数据、关于。
import { h, cx, pageHead, cardHead, toggle, segmented, toast, icon, modal, petEl, shake } from '../ui.js';

const ACTIVITY = [
  { value: 'quiet', label: '安静' },
  { value: 'normal', label: '适中' },
  { value: 'lively', label: '活泼' },
];

const ui = { searching: false, results: null, error: '' };

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
      if (actual !== on) toast('系统没有允许开机启动，可以去系统设置里打开', 'err');
      else toast('已保存 ✓');
    }
  } catch (err) {
    console.error('[settings] setLoginItem failed', err);
    app.state.settings.launchAtLogin = !on;
    toast('没设置成功，再试一次吧', 'err');
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
  ui.error = '';
  ui.results = null;
  app.rerender();
  try {
    const res = await app.mochi.weather.search(q);
    ui.results = Array.isArray(res) ? res.slice(0, 8) : [];
  } catch (err) {
    ui.results = null;
    ui.error = '搜索失败了，检查一下网络再试试吧';
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
  ui.error = '';
  toast(`天气城市设成「${name}」啦`);
}

function weatherCard(app) {
  const w = app.state.weather || {};
  const hasCity = w.lat != null && w.lon != null;
  const cur = app.weather?.status === 'ok' ? app.weather.data : null;
  const results = ui.results;
  return h(
    'section',
    { class: 'card set-card', key: 'weather' },
    cardHead('🌤️', '天气'),
    row('在首页显示天气', '还会根据天气提醒你带伞、加衣服', toggle(!!w.enabled, (v) => app.set('weather.enabled', v), { label: '显示天气' }), { key: 'wx-on' }),
    h(
      'div',
      { class: 'city-now', key: 'city-now' },
      h('span', { class: 'cn-label' }, '当前城市'),
      hasCity ? h('b', w.city || '已选择') : h('span', { class: 'muted' }, '还没有选'),
      cur && h('span', { class: 'cn-wx' }, `${cur.emoji || ''} ${Math.round(cur.temp)}° ${cur.desc || ''}`),
      w.enabled && !hasCity && h('span', { class: 'cn-warn' }, '先搜一下城市吧'),
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
          placeholder: '搜索城市，比如：杭州、Tokyo',
          maxlength: 40,
          'aria-label': '搜索城市',
          onkeydown: (e) => e.key === 'Enter' && !e.isComposing && search(app, e),
        }),
        h('button', { type: 'button', class: 'btn soft', key: 'go', disabled: ui.searching, onclick: (e) => search(app, e) }, icon('search'), ui.searching ? '找找看…' : '搜索'),
      ),
      ui.error && h('p', { class: 'cs-state err', key: 'err' }, ui.error),
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
          : h('p', { class: 'cs-state', key: 'none' }, '没有找到这个城市，换个名字试试？')),
    ),
  );
}

async function doExport(app) {
  try {
    const r = await app.mochi.app.exportData();
    if (r && r.ok) toast(r.path ? `导出好啦：${String(r.path).split(/[\\/]/).pop()}` : '导出好啦 ✓');
    else if (r && r.error) toast(`导出失败：${r.error}`, 'err');
  } catch (err) {
    toast('导出失败了', 'err');
  }
}

async function doImport(app) {
  const ok = await modal({
    title: '导入数据？',
    text: '导入之后，现在的设置和记录会被文件里的内容替换掉哦。',
    ok: '选择文件',
    cancel: '算了',
  });
  if (!ok) return;
  try {
    const r = await app.mochi.app.importData();
    if (r && r.ok) toast('导入成功 ✓');
    else if (r && r.error) toast(`导入失败：${r.error}`, 'err');
  } catch (err) {
    toast('导入失败了', 'err');
  }
}

async function doReset(app) {
  const pet = app.state.pet?.name || '糯米';
  const ok = await modal({
    title: '真的要重置吗？',
    text: `所有的设置、待办、心情和纪念日都会被清空，${pet}也会忘掉你们一起的回忆……`,
    ok: '确定重置',
    cancel: '再想想',
    danger: true,
    look: app.look(),
    pose: 'sad',
    face: ['sad', 'wavy'],
  });
  if (!ok) return;
  try {
    const r = await app.mochi.app.resetData();
    if (r && r.ok === false) toast(`重置失败：${r.error || '未知原因'}`, 'err');
    else toast('已经重置啦');
  } catch (err) {
    toast('重置失败了', 'err');
  }
}

export default {
  id: 'settings',
  icon: '⚙️',
  label: '设置',
  leave() {
    ui.results = null;
    ui.error = '';
  },
  render(app) {
    const s = app.state.settings || {};
    const vol = Math.max(0, Math.min(1, Number(s.volume ?? 0.6)));
    const info = app.info || {};
    return h(
      'div',
      { class: 'page page-settings' },
      pageHead('⚙️', '设置', '按你喜欢的样子来～'),
      h(
        'div',
        { class: 'set-col' },
        h(
          'section',
          { class: 'card set-card', key: 'pet' },
          cardHead('🐾', '宠物'),
          settingToggle(app, 'alwaysOnTop', '始终在最前面', '宠物不会被其他窗口挡住'),
          settingToggle(app, 'walkAround', '自由走动', '闲着的时候在屏幕底下走来走去'),
          settingToggle(app, 'followMouse', '跟着鼠标走', '鼠标去哪儿，它就慢慢跟到哪儿'),
          settingToggle(app, 'gravity', '重力', '松手会掉到屏幕底部'),
          settingToggle(app, 'eyeTracking', '眼睛跟随鼠标', '眼睛会一直看着你的鼠标'),
          row('活泼程度', '动作和小表演的多少', segmented(ACTIVITY, s.activity || 'normal', (v) => app.set('settings.activity', v), { cls: 'sm' })),
        ),
        h(
          'section',
          { class: 'card set-card', key: 'quiet' },
          cardHead('🔔', '打扰与声音'),
          settingToggle(app, 'dnd', '勿扰模式', '不主动说话，只保留自定义提醒'),
          settingToggle(app, 'sound', '声音', '说话和互动时的小音效'),
          row(
            '音量',
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
                'aria-label': '音量',
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
          cardHead('💻', '系统'),
          row('开机自动启动', '打开电脑就能见到它', toggle(!!s.launchAtLogin, (v) => setLogin(app, v), { label: '开机自动启动' })),
        ),
        weatherCard(app),
        h(
          'section',
          { class: 'card set-card', key: 'data' },
          cardHead('💾', '数据'),
          row('导出数据', '把所有设置和记录存成一个文件', h('button', { type: 'button', class: 'btn ghost sm', onclick: () => doExport(app) }, '导出')),
          row('导入数据', '从导出的文件里恢复', h('button', { type: 'button', class: 'btn ghost sm', onclick: () => doImport(app) }, '导入')),
          row('重置所有数据', '清空一切，回到刚见面的样子', h('button', { type: 'button', class: 'btn danger sm', onclick: () => doReset(app) }, '重置'), { cls: 'danger-row' }),
        ),
        h(
          'section',
          { class: 'card set-card about', key: 'about' },
          cardHead('💗', '关于'),
          h(
            'div',
            { class: 'about-top' },
            h('div', { class: 'about-pet' }, petEl(app.look(), { size: 64, blink: true, pose: 'idle', key: 'about-pet' })),
            h(
              'div',
              { class: 'about-text' },
              h('div', { class: 'about-name' }, info.name || '糯米桌宠'),
              h('div', { class: 'about-ver' }, `版本 ${info.version || '1.0.0'}${info.electron ? ` · Electron ${info.electron}` : ''}`),
              h('div', { class: 'about-love' }, '给最可爱的你 💗'),
            ),
          ),
          h(
            'div',
            { class: 'tips' },
            h('div', { class: 'tip' }, h('span', { class: 'kbd' }, '右键'), '宠物可以打开菜单'),
            h('div', { class: 'tip' }, h('span', { class: 'kbd' }, '双击'), '宠物打开快捷面板'),
          ),
        ),
      ),
    );
  },
};
