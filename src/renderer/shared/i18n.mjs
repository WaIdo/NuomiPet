// 渲染进程的多语言：读入所有语言的文字（JSON 模块），跟着数据里的 runtime.lang 切换。
// 各窗口的入口文件要第一个 import 这里：catalog、节日、主题里的名字和台词先按语言填好，
// 系统字体画不出来的 emoji（Windows 10 只到 Emoji 12）也先换成老一点的。
// 代码里直接写的 emoji 用 em() 包一下。
import '../../shared/i18n.js';
import { EMOJI_FALLBACK, swapEmoji, setLang as setPluralLang } from './common.mjs';
import catalog from '../../shared/catalog.json' with { type: 'json' };
import festivals from '../../shared/festivals.json' with { type: 'json' };
import themes from '../../shared/themes.json' with { type: 'json' };
import zhCN_common from '../../shared/locales/zh-CN/common.json' with { type: 'json' };
import zhCN_main from '../../shared/locales/zh-CN/main.json' with { type: 'json' };
import zhCN_pet from '../../shared/locales/zh-CN/pet.json' with { type: 'json' };
import zhCN_home from '../../shared/locales/zh-CN/home.json' with { type: 'json' };
import zhCN_pages from '../../shared/locales/zh-CN/pages.json' with { type: 'json' };
import zhCN_phrases from '../../shared/locales/zh-CN/phrases.json' with { type: 'json' };
import zhCN_data from '../../shared/locales/zh-CN/data.json' with { type: 'json' };
import zhTW_common from '../../shared/locales/zh-TW/common.json' with { type: 'json' };
import zhTW_main from '../../shared/locales/zh-TW/main.json' with { type: 'json' };
import zhTW_pet from '../../shared/locales/zh-TW/pet.json' with { type: 'json' };
import zhTW_home from '../../shared/locales/zh-TW/home.json' with { type: 'json' };
import zhTW_pages from '../../shared/locales/zh-TW/pages.json' with { type: 'json' };
import zhTW_phrases from '../../shared/locales/zh-TW/phrases.json' with { type: 'json' };
import zhTW_data from '../../shared/locales/zh-TW/data.json' with { type: 'json' };
import en_common from '../../shared/locales/en/common.json' with { type: 'json' };
import en_main from '../../shared/locales/en/main.json' with { type: 'json' };
import en_pet from '../../shared/locales/en/pet.json' with { type: 'json' };
import en_home from '../../shared/locales/en/home.json' with { type: 'json' };
import en_pages from '../../shared/locales/en/pages.json' with { type: 'json' };
import en_phrases from '../../shared/locales/en/phrases.json' with { type: 'json' };
import en_data from '../../shared/locales/en/data.json' with { type: 'json' };
import ja_common from '../../shared/locales/ja/common.json' with { type: 'json' };
import ja_main from '../../shared/locales/ja/main.json' with { type: 'json' };
import ja_pet from '../../shared/locales/ja/pet.json' with { type: 'json' };
import ja_home from '../../shared/locales/ja/home.json' with { type: 'json' };
import ja_pages from '../../shared/locales/ja/pages.json' with { type: 'json' };
import ja_phrases from '../../shared/locales/ja/phrases.json' with { type: 'json' };
import ja_data from '../../shared/locales/ja/data.json' with { type: 'json' };
import ko_common from '../../shared/locales/ko/common.json' with { type: 'json' };
import ko_main from '../../shared/locales/ko/main.json' with { type: 'json' };
import ko_pet from '../../shared/locales/ko/pet.json' with { type: 'json' };
import ko_home from '../../shared/locales/ko/home.json' with { type: 'json' };
import ko_pages from '../../shared/locales/ko/pages.json' with { type: 'json' };
import ko_phrases from '../../shared/locales/ko/phrases.json' with { type: 'json' };
import ko_data from '../../shared/locales/ko/data.json' with { type: 'json' };
import fr_common from '../../shared/locales/fr/common.json' with { type: 'json' };
import fr_main from '../../shared/locales/fr/main.json' with { type: 'json' };
import fr_pet from '../../shared/locales/fr/pet.json' with { type: 'json' };
import fr_home from '../../shared/locales/fr/home.json' with { type: 'json' };
import fr_pages from '../../shared/locales/fr/pages.json' with { type: 'json' };
import fr_phrases from '../../shared/locales/fr/phrases.json' with { type: 'json' };
import fr_data from '../../shared/locales/fr/data.json' with { type: 'json' };
import ar_common from '../../shared/locales/ar/common.json' with { type: 'json' };
import ar_main from '../../shared/locales/ar/main.json' with { type: 'json' };
import ar_pet from '../../shared/locales/ar/pet.json' with { type: 'json' };
import ar_home from '../../shared/locales/ar/home.json' with { type: 'json' };
import ar_pages from '../../shared/locales/ar/pages.json' with { type: 'json' };
import ar_phrases from '../../shared/locales/ar/phrases.json' with { type: 'json' };
import ar_data from '../../shared/locales/ar/data.json' with { type: 'json' };

const core = self.MochiI18n;
const bundles = {
  'zh-CN': { ui: core.mergeUi([zhCN_common, zhCN_main, zhCN_pet, zhCN_home, zhCN_pages]), phrases: zhCN_phrases, data: zhCN_data },
  'zh-TW': { ui: core.mergeUi([zhTW_common, zhTW_main, zhTW_pet, zhTW_home, zhTW_pages]), phrases: zhTW_phrases, data: zhTW_data },
  'en': { ui: core.mergeUi([en_common, en_main, en_pet, en_home, en_pages]), phrases: en_phrases, data: en_data },
  'ja': { ui: core.mergeUi([ja_common, ja_main, ja_pet, ja_home, ja_pages]), phrases: ja_phrases, data: ja_data },
  'ko': { ui: core.mergeUi([ko_common, ko_main, ko_pet, ko_home, ko_pages]), phrases: ko_phrases, data: ko_data },
  'fr': { ui: core.mergeUi([fr_common, fr_main, fr_pet, fr_home, fr_pages]), phrases: fr_phrases, data: fr_data },
  'ar': { ui: core.mergeUi([ar_common, ar_main, ar_pet, ar_home, ar_pages]), phrases: ar_phrases, data: ar_data },
};

// 各处共用的台词对象，切换语言时就地替换
export const phrases = {};
const i18n = core.createI18n(bundles, { phrases, catalog, festivals, themes });

// 在 canvas 上试画一下，画出来不是彩色的就算缺字（缺字时画的是黑色方框，只有灰度像素）
function drawsInColor(emoji) {
  try {
    const size = 24;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const g = canvas.getContext('2d', { willReadFrequently: true });
    g.font = `20px 'Apple Color Emoji', 'Segoe UI Emoji', 'Noto Color Emoji', sans-serif`;
    g.textBaseline = 'top';
    g.fillStyle = '#000';
    g.fillText(emoji, 0, 0);
    const px = g.getImageData(0, 0, size, size).data;
    for (let i = 0; i < px.length; i += 4) {
      if (px[i + 3] > 0 && (px[i] !== px[i + 1] || px[i + 1] !== px[i + 2])) return true;
    }
    return false;
  } catch {
    return true;
  }
}

export const missingEmoji = new Set(Object.keys(EMOJI_FALLBACK).filter((e) => !drawsInColor(e)));
export const em = (text) => swapEmoji(text, missingEmoji);

// 换语言后名字和台词是新填进去的，缺字的 emoji 要再换一遍；common.js 的 fill 也要按新语言选单复数。
// 这个监听最先注册，先于各窗口的重绘
function swapData() {
  setPluralLang(i18n.lang);
  swapEmoji(catalog, missingEmoji);
  swapEmoji(phrases, missingEmoji);
  swapEmoji(festivals, missingEmoji);
}
swapData();
i18n.onChange(swapData);

export const LANGS = core.LANGS;
export const t = i18n.t;
export const has = i18n.has;
export const data = i18n.data;
export const lines = i18n.lines;
export const fill = i18n.fill;
export const fmtDate = i18n.fmtDate;
export const weekday = i18n.weekday;
export const onLangChange = i18n.onChange;
export const getLang = () => i18n.lang;

// 宠物的名字和对她的称呼：没改过（空）就用当前语言的默认值（糯米 / Mochi……）
export const petName = (state) => String((state && state.pet && state.pet.name) || '').trim() || i18n.data('defaults.petName') || '';
export const nickname = (state) => String((state && state.owner && state.owner.nickname) || '').trim() || i18n.data('defaults.nickname') || '';

// 按数据里的 runtime.lang 切换语言，同时设好 <html lang>（字形、字体跟着变）和 <html dir>（阿拉伯文从右往左）。返回是否换了
export function syncLang(state) {
  const changed = i18n.setLang((state && state.runtime && state.runtime.lang) || core.SOURCE);
  document.documentElement.lang = i18n.lang;
  document.documentElement.dir = core.dirOf(i18n.lang);
  return changed;
}

export const dirOf = core.dirOf;
