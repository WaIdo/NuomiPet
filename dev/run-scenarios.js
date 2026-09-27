// 在真实窗口里依次跑 dev/scenarios 下的场景（CI 和本机都能用）。
// 每个场景用新的数据目录，截图和日志放在 <out>/<场景名>/ 下；有报错、FAIL 或超时就以非 0 退出。
// 用法：node dev/run-scenarios.js [--out=目录] [场景名 ...]
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const electron = require('electron');

const ROOT = path.join(__dirname, '..');
// 多语言场景要把 7 种语言各走一遍，时间长得多
const TIMEOUT_MS = { languages: 1200000, readme: 2400000 };
const timeoutOf = (name) => TIMEOUT_MS[name] || 240000;

const args = process.argv.slice(2);
const outArg = args.find((a) => a.startsWith('--out='));
const out = path.resolve(outArg ? outArg.slice('--out='.length) : 'scenario-output');
const all = fs
  .readdirSync(path.join(__dirname, 'scenarios'))
  .filter((f) => f.endsWith('.js'))
  .map((f) => f.slice(0, -3))
  .sort();
const names = args.filter((a) => !a.startsWith('--'));
const list = names.length ? names : all;

function run(name) {
  return new Promise((resolve) => {
    const dir = path.join(out, name);
    fs.mkdirSync(dir, { recursive: true });
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), `nuomi-${name}-`));
    const started = Date.now();
    const child = spawn(electron, ['.', `--data-dir=${dataDir}`, `--dev-script=dev/scenarios/${name}.js`], {
      cwd: ROOT,
      env: { ...process.env, SNAP_DIR: dir },
    });
    let log = '';
    child.stdout.on('data', (d) => (log += d));
    child.stderr.on('data', (d) => (log += d));
    const timer = setTimeout(() => {
      log += '\n[runner] TIMEOUT\n';
      child.kill();
    }, timeoutOf(name));
    child.on('exit', (code) => {
      clearTimeout(timer);
      fs.writeFileSync(path.join(dir, 'run.log'), log);
      resolve({ name, code, log, dir, secs: Math.round((Date.now() - started) / 1000) });
    });
  });
}

// 找出日志里的问题：渲染进程报错、预加载报错、脚本异常、超时，以及场景自己记下的 FAIL
function problems(r) {
  const found = [];
  for (const line of r.log.split(/\r?\n/)) {
    if (/\[renderer:error\]|\[preload-error\]|\[dev-script\] (?!done)|\[runner\] TIMEOUT/.test(line)) found.push(line.trim());
  }
  for (const f of fs.readdirSync(r.dir).filter((x) => x.endsWith('.txt'))) {
    for (const line of fs.readFileSync(path.join(r.dir, f), 'utf8').split(/\r?\n/)) {
      if (/^FAIL\b|=missing\b/.test(line)) found.push(`${f}: ${line.trim()}`);
    }
  }
  return found;
}

(async () => {
  fs.mkdirSync(out, { recursive: true });
  let failed = 0;
  for (const name of list) {
    const r = await run(name);
    const bad = problems(r);
    const warnings = r.log.split(/\r?\n/).filter((l) => l.includes('[renderer:warning]'));
    const shots = fs.readdirSync(r.dir).filter((f) => f.endsWith('.png')).length;
    console.log(`${bad.length ? 'FAIL' : 'ok  '} ${name.padEnd(18)} ${String(r.secs).padStart(4)}s  ${shots} 张截图${warnings.length ? `  ${warnings.length} 条警告` : ''}`);
    for (const line of [...bad, ...warnings].slice(0, 20)) console.log('       ' + line);
    if (bad.length) failed++;
  }
  console.log(failed ? `${failed} 个场景有问题` : '全部通过');
  process.exit(failed ? 1 : 0);
})();
