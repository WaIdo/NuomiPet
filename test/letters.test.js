// 自己写的信：保存、修改、删除、导出导入
const test = require('node:test');
const assert = require('node:assert');
const { saveLetter, deleteLetter, exportLetters, importLetters } = require('../src/main/letters');

test('新建一封信，空正文和错误日期会被拒绝', () => {
  assert.equal(saveLetter([], { title: 'x', body: '   ' }).ok, false);
  assert.equal(saveLetter([], { title: 'x', body: '你好', unlock: '2027-13-40' }).ok, false);
  const r = saveLetter([], { title: '  生日快乐  ', from: '阿杰', unlock: '2027-3-21', body: '第一行\r\n第二行' });
  assert.equal(r.ok, true);
  assert.equal(r.letter.title, '生日快乐');
  assert.equal(r.letter.unlock, '2027-03-21');
  assert.equal(r.letter.body, '第一行\n第二行');
  assert.match(r.letter.id, /^my-/);
  assert.equal(r.list.length, 1);
});

test('修改时不传正文，正文保持不变；改了日期会标记', () => {
  const a = saveLetter([], { title: 'a', body: '秘密', unlock: '2030-01-01' });
  const b = saveLetter(a.list, { id: a.letter.id, title: 'b', unlock: '2031-01-01' });
  assert.equal(b.ok, true);
  assert.equal(b.list.length, 1);
  assert.equal(b.letter.body, '秘密');
  assert.equal(b.letter.title, 'b');
  assert.equal(b.changedUnlock, true);
  const c = saveLetter(b.list, { id: a.letter.id, title: 'c', unlock: '2031-01-01' });
  assert.equal(c.changedUnlock, false);
});

test('删除', () => {
  const a = saveLetter([], { title: 'a', body: '1' });
  assert.equal(deleteLetter(a.list, a.letter.id).list.length, 0);
  assert.equal(deleteLetter(a.list, 'nope').ok, false);
});

test('导出的文件看不到明文，导入后内容一致，同 id 覆盖不重复', () => {
  const a = saveLetter([], { title: '给你', from: '阿杰', unlock: '2030-02-14', body: '我喜欢你' });
  const text = exportLetters(a.list);
  assert.doesNotMatch(text, /我喜欢你/);
  const r = importLetters([], text);
  assert.equal(r.ok, true);
  assert.equal(r.count, 1);
  assert.equal(r.list[0].body, '我喜欢你');
  assert.equal(r.list[0].id, a.letter.id);
  const again = importLetters(r.list, text);
  assert.equal(again.list.length, 1);
  assert.equal(importLetters([], '{"kind":"other"}').ok, false);
  assert.equal(importLetters([], 'not json').ok, false);
});
