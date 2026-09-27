// 主进程的多语言：读入所有语言的文字，按「设置 → 语言」和系统语言选定当前语言。
// 选定的语言写进 runtime.lang，各个窗口看到数据变化后跟着换。
const core = require('../shared/i18n');
const catalog = require('../shared/catalog.json');
const festivals = require('../shared/festivals.json');
const themes = require('../shared/themes.json');

const bundles = {};
for (const { id } of core.LANGS) {
  const load = (name) => require(`../shared/locales/${id}/${name}.json`);
  bundles[id] = {
    ui: core.mergeUi(core.UI_FILES.map(load)),
    phrases: load('phrases'),
    data: load('data'),
  };
}

// 各处共用的台词对象，切换语言时就地替换
const phrases = {};
const i18n = core.createI18n(bundles, { phrases, catalog, festivals, themes });
// common.js 的 fill 按当前语言选单复数
const { setLang: setPluralLang } = require('../shared/common');
setPluralLang(i18n.lang);
i18n.onChange((lang) => setPluralLang(lang));

function systemLangs() {
  const { app } = require('electron');
  // 测试用：假装系统是某种语言（CI 的机器系统是英文，场景脚本按中文界面写）
  if (!app.isPackaged && process.env.NUOMI_SYSTEM_LANG) return [process.env.NUOMI_SYSTEM_LANG];
  try {
    const list = app.getPreferredSystemLanguages();
    if (list && list.length) return list;
  } catch {}
  try {
    return [app.getLocale()];
  } catch {
    return [];
  }
}

// 只按系统语言选（不看设置）。建数据之前用它，第一次启动时的默认内容就是系统语言
const detect = () => core.resolveLang('auto', systemLangs());

// 按设置和系统语言定下当前语言，写进 runtime.lang。返回当前语言
function sync(store) {
  const lang = core.resolveLang(store.get('settings.language'), systemLangs());
  i18n.setLang(lang);
  if (store.get('runtime.lang') !== lang) store.set('runtime.lang', lang);
  return lang;
}

// 宠物的名字和对她的称呼：没改过（空）就用当前语言的默认值（糯米 / Mochi……）
const petName = (data) => String((data && data.pet && data.pet.name) || '').trim() || i18n.data('defaults.petName') || '';
const nickname = (data) => String((data && data.owner && data.owner.nickname) || '').trim() || i18n.data('defaults.nickname') || '';

module.exports = {
  LANGS: core.LANGS,
  petName,
  nickname,
  phrases,
  detect,
  sync,
  t: i18n.t,
  has: i18n.has,
  data: i18n.data,
  lines: i18n.lines,
  fill: i18n.fill,
  fmtDate: i18n.fmtDate,
  weekday: i18n.weekday,
  setLang: i18n.setLang,
  onChange: i18n.onChange,
  lang: () => i18n.lang,
};
