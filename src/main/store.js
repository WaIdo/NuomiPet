// 本地 JSON 存储：主进程是唯一的数据源，渲染进程通过 IPC 读写。
const fs = require('fs');
const path = require('path');
const { EventEmitter } = require('events');

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const clone = (v) => (v === undefined ? v : JSON.parse(JSON.stringify(v)));
const BAD_KEYS = new Set(['__proto__', 'prototype', 'constructor']);

function fillDefaults(target, defaults) {
  for (const [k, v] of Object.entries(defaults)) {
    if (target[k] === undefined || (target[k] === null && v !== null)) target[k] = clone(v);
    else if (isObj(v) && isObj(target[k])) fillDefaults(target[k], v);
  }
  return target;
}

class Store extends EventEmitter {
  constructor(file, defaults) {
    super();
    this.file = file;
    this.defaults = defaults;
    this.saveTimer = null;
    this.data = this.load();
  }

  load() {
    let raw = null;
    try {
      raw = JSON.parse(fs.readFileSync(this.file, 'utf8'));
    } catch (err) {
      if (err.code !== 'ENOENT') {
        try {
          fs.renameSync(this.file, this.file.replace(/\.json$/, `.broken-${Date.now()}.json`));
        } catch {}
      }
    }
    this.isFresh = !isObj(raw);
    return fillDefaults(isObj(raw) ? raw : {}, this.defaults);
  }

  get(p) {
    if (!p) return this.data;
    return p.split('.').reduce((o, k) => (o == null ? undefined : o[k]), this.data);
  }

  set(p, value, { silent = false } = {}) {
    const keys = String(p).split('.');
    if (!keys.length || keys.some((k) => !k || BAD_KEYS.has(k))) throw new Error('bad path: ' + p);
    let o = this.data;
    for (const k of keys.slice(0, -1)) {
      if (!isObj(o[k])) o[k] = {};
      o = o[k];
    }
    o[keys[keys.length - 1]] = clone(value);
    this.touch(p, silent);
  }

  update(p, fn, opts) {
    this.set(p, fn(clone(this.get(p))), opts);
  }

  touch(p, silent = false) {
    if (!silent) this.emit('change', p);
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.saveNow(), 400);
  }

  replaceAll(data) {
    this.data = fillDefaults(isObj(data) ? data : {}, this.defaults);
    this.touch('*');
  }

  saveNow() {
    clearTimeout(this.saveTimer);
    this.saveTimer = null;
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      const tmp = this.file + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2));
      fs.renameSync(tmp, this.file);
    } catch (err) {
      console.error('[store] save failed', err);
    }
  }
}

module.exports = { Store };
