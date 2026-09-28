#!/usr/bin/env node

const { execFileSync, execSync } = require('child_process');
const { existsSync, readFileSync } = require('fs');
const path = require('path');
const os = require('os');
const { getGitignoreExcludes } = require('./sync-excludes.cjs');
// ── 跨平台目录同步(Windows无rsync时的Node.js实现,solutions.md问题2) ──
const _isWin = process.platform === 'win32';
function syncDir(src, dest, excludes) {
  const {mkdirSync,readdirSync,statSync,copyFileSync,unlinkSync,rmdirSync,rmSync,renameSync} = require('fs');
  function matchGlob(pattern, rel) {
    const re = pattern.replace(/[.+^${}()|[\]\\]/g,'\\$&').replace(/\*\*\//g,'(?:.+/)?').replace(/\*/g,'[^/]*').replace(/\?/g,'[^/]');
    return new RegExp('(^|/)'+re+'($|/)').test(rel);
  }
  function skip(rel,ex) { return ex.some(p=>matchGlob(p,rel))||rel==='.git'; }
  function cp(src,dst,ex) {
    mkdirSync(dst,{recursive:true});
    for(const n of readdirSync(src)){
      const s=path.join(src,n),d=path.join(dst,n);
      if(skip(path.relative(path.dirname(src),s),ex)) continue;
      if(statSync(s).isDirectory()) cp(s,d,ex);
      else {
        mkdirSync(path.dirname(d),{recursive:true});
        // 按文件原子替换:先写临时副本再 rename 覆盖。dest 树被运行中的 worker
        // 与 Claude Code hooks 热读取,直接 copyFileSync 中途被杀会留下截断的
        // worker-service.cjs;同卷 renameSync 是原子的(Windows 走 MoveFileEx
        // REPLACE_EXISTING)。rename 因目标被占用等失败时回退旧式直写,保证
        // 同步可靠性优先、原子性尽力而为。
        const t=d+'.tmp~';
        try { copyFileSync(s,t); renameSync(t,d); }
        catch(e){ try{rmSync(t,{force:true});}catch{} copyFileSync(s,d); }
      }
    }
  }
  function clean(src,dst,ex) {
    if(!existsSync(dst)) return;
    for(const n of readdirSync(dst)){
      const s=path.join(src,n),d=path.join(dst,n);
      if(skip(path.relative(path.dirname(src),d),ex)) continue;
      if(!existsSync(s)){
        // Removing a stale dest entry must never abort the whole sync. On
        // Windows an IDE-locked or reparse-point file (e.g. .windsurf/rules)
        // throws EPERM on unlink; rmSync({recursive,force}) handles dirs and
        // symlinks, and a per-entry try/catch downgrades the rest to a warning
        // so the critical worker copy (already done in cp()) still lands.
        try { rmSync(d,{recursive:true,force:true,maxRetries:2}); }
        catch(e){ console.warn('  \x1b[33m(skip stale '+d+': '+(e&&e.code||e)+')\x1b[0m'); }
      }
      else if(statSync(d).isDirectory()) clean(s,d,ex);
    }
  }
  cp(src,dest,excludes); clean(src,dest,excludes);
}
function rsyncExec(src, dest, excludes) {
  if(_isWin){ syncDir(src,dest,excludes); return; }
  execFileSync('rsync', ['-av', '--delete', ...excludes.map(e => '--exclude='+e), src+'/', dest+'/'], {stdio:'inherit'});
}



const INSTALLED_PATH = path.join(os.homedir(), '.claude', 'plugins', 'marketplaces', 'thedotmack');
const CACHE_BASE_PATH = path.join(os.homedir(), '.claude', 'plugins', 'cache', 'thedotmack', 'claude-mem');

// Resolve bun cross-platform. The npm child shell that runs this script does
// not always inherit ~/.bun/bin on PATH — on Windows the installer adds it
// only to the *user* PATH (absent from an already-running process), and on
// macOS a non-login shell skips ~/.zprofile. Fall back to the canonical bun
// install location so `bun install` below never dies with "command not found".
function resolveBun() {
  const home = os.homedir();
  const candidates = process.platform === 'win32'
    ? [path.join(home, '.bun', 'bin', 'bun.exe'), path.join(home, '.bun', 'bin', 'bun')]
    : [path.join(home, '.bun', 'bin', 'bun'), '/usr/local/bin/bun', '/opt/homebrew/bin/bun'];
  for (const c of candidates) { if (existsSync(c)) return c; }
  return 'bun'; // last resort: trust PATH
}
const BUN = resolveBun();
const bunInstall = (cwd) => execSync(`"${BUN}" install`, { cwd, stdio: 'inherit' });

// 同步落地后断言关键运行时文件完整(与本地构建字节数一致)。中途死掉的同步
// 必须在这里响亮地失败,而不是留下一棵 hooks/worker 会去加载的半残部署树。
const CRITICAL_FILES = ['scripts/worker-service.cjs', 'scripts/bun-runner.js', 'hooks/hooks.json', 'package.json'];
function verifyCriticalFiles(srcPluginDir, destPluginDir) {
  const fs = require('fs');
  for (const rel of CRITICAL_FILES) {
    const s = path.join(srcPluginDir, rel);
    const d = path.join(destPluginDir, rel);
    if (!fs.existsSync(s)) continue; // 本地构建里就没有 → 不校验
    if (!fs.existsSync(d)) throw new Error(`critical file missing after sync: ${d}`);
    if (fs.statSync(s).size !== fs.statSync(d).size) throw new Error(`critical file size mismatch after sync: ${d}`);
  }
}

// Reject obviously invalid ports before they reach http.request, which would
// throw with a confusing error like "RangeError: Port should be > 0 and < 65536".
function parseWorkerPort(value) {
  const port = Number.parseInt(String(value ?? ''), 10);
  return Number.isInteger(port) && port >= 1 && port <= 65535 ? port : null;
}

function getCurrentBranch() {
  try {
    if (!existsSync(path.join(INSTALLED_PATH, '.git'))) {
      return null;
    }
    return execSync('git rev-parse --abbrev-ref HEAD', {
      cwd: INSTALLED_PATH,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe']
    }).trim();
  } catch {
    return null;
  }
}

const branch = getCurrentBranch();
const isForce = process.argv.includes('--force');

if (branch && branch !== 'main' && !isForce) {
  console.log('');
  console.log('\x1b[33m%s\x1b[0m', `WARNING: Installed plugin is on beta branch: ${branch}`);
  console.log('\x1b[33m%s\x1b[0m', 'Running rsync would overwrite beta code.');
  console.log('');
  console.log('Options:');
  console.log('  1. Use UI at http://localhost:37777 to update beta');
  console.log('  2. Switch to stable in UI first, then run sync');
  console.log('  3. Force rsync: npm run sync-marketplace:force');
  console.log('');
  process.exit(1);
}

function getPluginVersion() {
  try {
    const pluginJsonPath = path.join(__dirname, '..', 'plugin', '.claude-plugin', 'plugin.json');
    const pluginJson = JSON.parse(readFileSync(pluginJsonPath, 'utf-8'));
    return pluginJson.version;
  } catch (error) {
    console.error('\x1b[31m%s\x1b[0m', 'Failed to read plugin version:', error.message);
    process.exit(1);
  }
}

function detectInstalledVersion(buildVersion) {
  const dataDir = process.env.CLAUDE_MEM_DATA_DIR || path.join(os.homedir(), '.claude-mem');
  const settingsPath = path.join(dataDir, 'settings.json');
  let port = parseWorkerPort(process.env.CLAUDE_MEM_WORKER_PORT);
  if (!port && existsSync(settingsPath)) {
    try {
      const s = JSON.parse(readFileSync(settingsPath, 'utf8'));
      const settingsPort = parseWorkerPort(s.CLAUDE_MEM_WORKER_PORT);
      if (settingsPort) port = settingsPort;
    } catch {}
  }
  if (!port) {
    const uid = typeof process.getuid === 'function' ? process.getuid() : 77;
    port = 37700 + (uid % 100);
  }
  let healthBody;
  try {
    healthBody = execSync(`curl -s --max-time 2 http://127.0.0.1:${port}/api/health`, {
      stdio: ['ignore', 'pipe', 'ignore'],
    }).toString().trim();
  } catch {
    return null;
  }
  if (!healthBody) return null;
  let installedVersion;
  let installedPath;
  try {
    const j = JSON.parse(healthBody);
    installedVersion = j.version;
    installedPath = j.workerPath;
  } catch {
    return null;
  }
  if (!installedVersion || installedVersion === buildVersion) return null;
  return { installedVersion, installedPath };
}

const installedMismatch = detectInstalledVersion(getPluginVersion());
if (installedMismatch) {
  console.log('');
  console.log('\x1b[33m%s\x1b[0m', 'Version mismatch detected:');
  console.log(`  Building:   ${getPluginVersion()}`);
  console.log(`  Installed:  ${installedMismatch.installedVersion}`);
  if (installedMismatch.installedPath) console.log(`  Worker path: ${installedMismatch.installedPath}`);
  console.log('');
  console.log('Claude Code is pinned to the installed version, so the worker loads from');
  console.log(`its cache dir. Mirroring this build into the installed-version cache so the`);
  console.log('worker restart picks up new code without a Claude Code session restart.');
  console.log('');
  console.log('\x1b[36m%s\x1b[0m', `For a formal version bump, run \`claude plugin update thedotmack/claude-mem\``);
  console.log('\x1b[36m%s\x1b[0m', `and restart Claude Code so it loads the ${getPluginVersion()} cache dir.`);
  console.log('');
}

console.log('Syncing to marketplace...');
try {
  const rootDir = path.join(__dirname, '..');
  const gitignoreExcludes = getGitignoreExcludes(rootDir);

  rsyncExec('.', path.join(os.homedir(), '.claude', 'plugins', 'marketplaces', 'thedotmack'),
    ['.git','bun.lock','package-lock.json','scripts/package.json','scripts/node_modules'].concat(gitignoreExcludes));
  verifyCriticalFiles(path.join(rootDir, 'plugin'), path.join(INSTALLED_PATH, 'plugin'));

  console.log('Running bun install in marketplace...');
  bunInstall(path.join(os.homedir(), '.claude', 'plugins', 'marketplaces', 'thedotmack'));

  const version = getPluginVersion();
  const CACHE_VERSION_PATH = path.join(CACHE_BASE_PATH, version);

  const pluginDir = path.join(rootDir, 'plugin');
  const pluginGitignoreExcludes = getGitignoreExcludes(pluginDir);

  console.log(`Syncing to cache folder (version ${version})...`);
  rsyncExec(path.join(rootDir, 'plugin'), CACHE_VERSION_PATH, ['.git'].concat(pluginGitignoreExcludes));
  verifyCriticalFiles(path.join(rootDir, 'plugin'), CACHE_VERSION_PATH);

  console.log(`Running bun install in cache folder (version ${version})...`);
  bunInstall(CACHE_VERSION_PATH);

  if (installedMismatch && installedMismatch.installedVersion !== version) {
    const INSTALLED_CACHE_PATH = path.join(CACHE_BASE_PATH, installedMismatch.installedVersion);
    console.log(`Mirroring to installed-version cache (${installedMismatch.installedVersion}) for hot reload...`);
    rsyncExec(path.join(rootDir, 'plugin'), INSTALLED_CACHE_PATH, ['.git'].concat(pluginGitignoreExcludes));
    verifyCriticalFiles(path.join(rootDir, 'plugin'), INSTALLED_CACHE_PATH);
    console.log(`Running bun install in installed-version cache (${installedMismatch.installedVersion})...`);
    bunInstall(INSTALLED_CACHE_PATH);
  }

  console.log('\x1b[32m%s\x1b[0m', 'Sync complete!');

  // worker 接管策略三选一(if/else 结构,不用模块顶层 return —— CJS 包装下
  // 虽合法,但日后转 ESM/被 import 即 SyntaxError):
  // 1) CLAUDE_MEM_SYNC_NO_RESTART=1:调用方(install-claude-mem)自管生命周期,
  //    异步重启只会与其竞争,实测会把 worker 留在停止态 → 干净跳过。
  // 2) --restart-worker:确定性 stop+start(bun worker-service.cjs restart),
  //    worker 已死时端口本空闲、直接启动。供 build-and-sync 使用 —— 替代旧的
  //    npm 脚本尾段 `sleep 1 && (cd ~/...)`,后者在 Windows cmd.exe 下必败
  //    (sleep 非 cmd 命令、~ 不展开),曾把已停止的 worker 永久留死。
  // 3) 默认:向运行中的 worker 发异步 /api/admin/restart(手动 sync 场景)。
  if (process.env.CLAUDE_MEM_SYNC_NO_RESTART === '1') {
    console.log('ℹ Skipping worker restart trigger (caller manages worker lifecycle)');
  } else if (process.argv.includes('--restart-worker')) {
    console.log('\n🔄 Restarting worker (deterministic stop+start)...');
    const workerCjs = path.join(INSTALLED_PATH, 'plugin', 'scripts', 'worker-service.cjs');
    execSync(`"${BUN}" "${workerCjs}" restart`, { stdio: 'inherit' });
    console.log('\x1b[32m%s\x1b[0m', '✓ Worker restarted onto the freshly-synced build');
  } else {
    console.log('\n🔄 Triggering worker restart...');
    const http = require('http');
    const dataDir = process.env.CLAUDE_MEM_DATA_DIR || path.join(os.homedir(), '.claude-mem');
    const settingsPath = path.join(dataDir, 'settings.json');
    let settingsPort = null;
    if (existsSync(settingsPath)) {
      try {
        const settings = JSON.parse(readFileSync(settingsPath, 'utf8'));
        settingsPort = parseWorkerPort(settings.CLAUDE_MEM_WORKER_PORT);
      } catch {
        // fall through to env / default
      }
    }
    const uid = typeof process.getuid === 'function' ? process.getuid() : 77;
    const defaultPort = 37700 + (uid % 100);
    const workerPort =
      parseWorkerPort(process.env.CLAUDE_MEM_WORKER_PORT) ??
      settingsPort ??
      defaultPort;
    const req = http.request({
      hostname: '127.0.0.1',
      port: workerPort,
      path: '/api/admin/restart',
      method: 'POST',
      timeout: 2000
    }, (res) => {
      if (res.statusCode === 200) {
        console.log('\x1b[32m%s\x1b[0m', `✓ Worker restart triggered on port ${workerPort}`);
      } else {
        console.log('\x1b[33m%s\x1b[0m', `ℹ Worker restart on port ${workerPort} returned status ${res.statusCode}`);
      }
    });
    req.on('error', () => {
      console.log('\x1b[33m%s\x1b[0m', `ℹ No worker reachable on port ${workerPort}; run with --restart-worker for a deterministic start.`);
    });
    req.on('timeout', () => {
      req.destroy();
      console.log('\x1b[33m%s\x1b[0m', `ℹ Worker restart on port ${workerPort} timed out`);
    });
    req.end();
  }

} catch (error) {
  console.error('\x1b[31m%s\x1b[0m', 'Sync failed:', error.message);
  process.exit(1);
}
