// 在应用里写的信：校验、保存、删除，以及导出成文件带到另一台电脑再导入。
const { parseKey, uid } = require('../shared/common');
const i18n = require('./i18n');

const LIMITS = { title: 30, from: 16, body: 5000 };
const FILE_KIND = 'nuomi-letters';

const clean = (v, max) => String(v == null ? '' : v).replace(/\r\n?/g, '\n').trim().slice(0, max);

function validUnlock(v) {
  const s = String(v || '').trim();
  if (!s) return '';
  const p = parseKey(s);
  return p && p.y ? `${p.y}-${String(p.m).padStart(2, '0')}-${String(p.d).padStart(2, '0')}` : null;
}

/**
 * 新建或修改一封信。修改时不传 body 表示正文不变（封好的信看不到正文，只能改标题、署名和拆开日期）。
 * 返回 { ok, list, letter, error }，list 是新的 custom 数组。
 */
function saveLetter(list, input, now = Date.now()) {
  const cur = Array.isArray(list) ? list : [];
  if (!input || typeof input !== 'object') return { ok: false, error: i18n.t('main.letter.error.invalid') };
  const unlock = validUnlock(input.unlock);
  if (unlock === null) return { ok: false, error: i18n.t('main.letter.error.badDate') };
  const existing = input.id ? cur.find((l) => l.id === String(input.id)) : null;
  const body = input.body === undefined && existing ? existing.body : clean(input.body, LIMITS.body);
  if (!body) return { ok: false, error: i18n.t('main.letter.error.empty') };
  const letter = {
    // 改的时候留着原来的其他字段（比如邮件来的信的 source、mailFrom）
    ...(existing || {}),
    id: existing ? existing.id : 'my-' + uid(),
    title: clean(input.title, LIMITS.title) || i18n.t('main.letter.untitled'),
    from: clean(input.from, LIMITS.from),
    unlock,
    body,
    createdAt: existing ? existing.createdAt || now : now,
  };
  const next = existing ? cur.map((l) => (l.id === letter.id ? letter : l)) : [...cur, letter];
  return { ok: true, list: next, letter, changedUnlock: !existing || existing.unlock !== unlock };
}

function deleteLetter(list, id) {
  const cur = Array.isArray(list) ? list : [];
  const next = cur.filter((l) => l.id !== String(id));
  return { ok: next.length !== cur.length, list: next };
}

// 在这里写的信（不算邮件寄来的）
const writtenHere = (list) => (Array.isArray(list) ? list : []).filter((l) => l && l.source !== 'mail');

// 导出文件里的正文用 base64 存，打开文件不会一眼看到内容。邮件寄来的信不导出
function exportLetters(list) {
  return JSON.stringify(
    {
      kind: FILE_KIND,
      version: 1,
      exportedAt: new Date().toISOString(),
      letters: writtenHere(list).map((l) => ({ ...l, body: Buffer.from(String(l.body), 'utf8').toString('base64') })),
    },
    null,
    2,
  );
}

function importLetters(list, text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, error: i18n.t('main.letter.error.badFile') };
  }
  if (!data || data.kind !== FILE_KIND || !Array.isArray(data.letters)) return { ok: false, error: i18n.t('main.letter.error.notLetters') };
  let next = Array.isArray(list) ? [...list] : [];
  let count = 0;
  for (const raw of data.letters) {
    if (!raw || typeof raw !== 'object') continue;
    let body = '';
    try {
      body = Buffer.from(String(raw.body || ''), 'base64').toString('utf8');
    } catch {
      continue;
    }
    const id = /^my-[\w-]{4,40}$/.test(String(raw.id || '')) ? String(raw.id) : undefined;
    const withoutOld = id ? next.filter((l) => l.id !== id) : next;
    const r = saveLetter(withoutOld, { ...raw, id: undefined, body });
    if (!r.ok) continue;
    const letter = { ...r.letter, id: id || r.letter.id, createdAt: Number(raw.createdAt) || r.letter.createdAt };
    next = [...withoutOld, letter];
    count++;
  }
  return count ? { ok: true, list: next, count } : { ok: false, error: i18n.t('main.letter.error.nothingToImport') };
}

module.exports = { saveLetter, deleteLetter, exportLetters, importLetters, writtenHere, LIMITS };
