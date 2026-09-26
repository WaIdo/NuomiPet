// 生成应用图标和托盘图标：electron scripts/make-icons.js
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const root = path.join(__dirname, '..');
const page = pathToFileURL(path.join(root, 'dev/icon.html')).href;

let win = null;
async function render(query, size) {
  if (!win) win = new BrowserWindow({ width: size, height: size, show: false, transparent: true, frame: false, useContentSize: true, webPreferences: { offscreen: true } });
  win.setContentSize(size, size);
  await win.loadURL(`${page}?${query}&t=${Date.now()}`);
  await new Promise((r) => setTimeout(r, 400));
  const img = await win.webContents.capturePage();
  return img.resize({ width: size, height: size, quality: 'best' });
}

// 用 PNG 数据拼一个多尺寸 .ico
function ico(pngs) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(pngs.length, 4);
  const dir = Buffer.alloc(16 * pngs.length);
  let offset = 6 + dir.length;
  pngs.forEach(({ size, buf }, i) => {
    const o = i * 16;
    dir.writeUInt8(size >= 256 ? 0 : size, o);
    dir.writeUInt8(size >= 256 ? 0 : size, o + 1);
    dir.writeUInt8(0, o + 2);
    dir.writeUInt8(0, o + 3);
    dir.writeUInt16LE(1, o + 4);
    dir.writeUInt16LE(32, o + 6);
    dir.writeUInt32LE(buf.length, o + 8);
    dir.writeUInt32LE(offset, o + 12);
    offset += buf.length;
  });
  return Buffer.concat([header, dir, ...pngs.map((p) => p.buf)]);
}

app.disableHardwareAcceleration();
app.whenReady().then(() => main().catch((err) => {
  console.error(err);
  app.exit(1);
}));

async function main() {
  const out = (p) => path.join(root, p);
  fs.mkdirSync(out('build'), { recursive: true });
  fs.mkdirSync(out('assets/tray'), { recursive: true });

  const appIcon = await render('kind=app', 1024);
  fs.writeFileSync(out('build/icon.png'), appIcon.toPNG());

  for (const [name, size] of [['trayTemplate.png', 16], ['trayTemplate@2x.png', 32]]) {
    const img = await render('kind=trayTemplate', size * 4);
    fs.writeFileSync(out('assets/tray/' + name), img.resize({ width: size, height: size, quality: 'best' }).toPNG());
  }

  const traySizes = [16, 20, 24, 32, 40, 48, 64];
  const trayPngs = [];
  for (const size of traySizes) {
    const big = await render(`kind=tray&sw=${size <= 20 ? 11 : size <= 32 ? 9 : 7}`, size * 4);
    trayPngs.push({ size, buf: big.resize({ width: size, height: size, quality: 'best' }).toPNG() });
  }
  fs.writeFileSync(out('assets/tray/tray.ico'), ico(trayPngs));
  fs.writeFileSync(out('assets/tray/tray.png'), trayPngs.find((p) => p.size === 32).buf);

  console.log('icons written');
  app.quit();
}
