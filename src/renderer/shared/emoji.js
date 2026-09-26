// 系统 emoji 字体缺字时换成老一点的 emoji（主要是 Windows 10：自带字体只到 Emoji 12）。
// 启动时在 canvas 上试画一下，画出来不是彩色的就算缺字，然后把 catalog 和 phrases 里的就地换掉。
// 入口文件要第一个 import 这里，别的模块读到的就是换好的数据；代码里直接写的 emoji 用 em() 包一下。
import catalog from '../../shared/catalog.json' with { type: 'json' };
import phrases from '../../shared/phrases.json' with { type: 'json' };
import { EMOJI_FALLBACK, swapEmoji } from './common.mjs';

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
    // 缺字时画出来的是黑色方框，只有灰度像素
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

swapEmoji(catalog, missingEmoji);
swapEmoji(phrases, missingEmoji);
