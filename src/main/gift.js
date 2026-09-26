// 读取送礼配置：打包进应用的 gift.config.json + 用户数据目录里的同名文件（可选，用于不重新打包就追加信件）。
const fs = require('fs');
const path = require('path');
const { app } = require('electron');

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

function loadGift() {
  const bundled = readJson(path.join(app.getAppPath(), 'gift.config.json')) || {};
  const override = readJson(path.join(app.getPath('userData'), 'gift.config.json')) || {};
  const merged = { ...bundled, ...override };
  const letters = new Map();
  for (const l of [...(bundled.letters || []), ...(override.letters || [])]) {
    if (l && l.id && l.body) letters.set(String(l.id), { ...l, id: String(l.id) });
  }
  merged.letters = [...letters.values()];
  return merged;
}

module.exports = { loadGift };
