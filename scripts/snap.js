// 开发用：把一个本地 HTML 页面渲染成 PNG。
// 用法：electron scripts/snap.js <html?query> <out.png> [width] [height] [waitMs] [--preload=file] [--eval=js] [--transparent]
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

app.disableHardwareAcceleration();
app.whenReady().then(async () => {
  const args = process.argv.slice(2);
  const flags = Object.fromEntries(args.filter((a) => a.startsWith('--')).map((a) => { const [k, ...v] = a.slice(2).split('='); return [k, v.join('=') || true]; }));
  const [target, out, w = '1400', h = '1000', wait = '700'] = args.filter((a) => !a.startsWith('--'));
  const [file, query] = target.split('?');
  const url = pathToFileURL(path.resolve(file)).href + (query ? '?' + query : '');
  const win = new BrowserWindow({
    width: +w, height: +h, show: false, transparent: !!flags.transparent,
    webPreferences: { offscreen: true, preload: flags.preload ? path.resolve(flags.preload) : undefined, sandbox: false, contextIsolation: true },
  });
  win.webContents.on('console-message', (e) => { if (e.level === 'error' || e.level === 'warning') console.log(`[console.${e.level}]`, e.message, e.sourceId ? `(${path.basename(e.sourceId)}:${e.lineNumber})` : ''); });
  win.webContents.on('preload-error', (_e, p, err) => console.log('[preload-error]', p, err));
  await win.loadURL(url);
  await new Promise((r) => setTimeout(r, +wait));
  if (flags.eval) { await win.webContents.executeJavaScript(String(flags.eval)); await new Promise((r) => setTimeout(r, 500)); }
  const img = await win.webContents.capturePage();
  fs.writeFileSync(out, img.toPNG());
  console.log('saved', out, img.getSize());
  app.quit();
});
