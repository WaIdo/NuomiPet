// 在 ES module 里使用 src/shared/common.js（UMD）。
import '../../shared/common.js';

const C = self.MochiCommon;
export default C;
export const { pad2, dateKey, hm, parseKey, diffDays, nextYearly, dayNumber, daysUntil, isMilestone, fill, pick, uid, levelFor, todayParts, festivalOf, fortune, resolveTheme, EMOJI_FALLBACK, swapEmoji, setLang } = C;
