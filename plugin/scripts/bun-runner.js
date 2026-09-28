#!/usr/bin/env node
import { spawnSync, spawn } from 'child_process';
import { existsSync, readFileSync, mkdirSync, appendFileSync, writeFileSync } from 'fs';
import { join, dirname, resolve } from 'path';
import { homedir } from 'os';
import { fileURLToPath } from 'url';

const IS_WINDOWS = process.platform === 'win32';

const __bun_runner_dirname = dirname(fileURLToPath(import.meta.url));
const RESOLVED_PLUGIN_ROOT = process.env.CLAUDE_PLUGIN_ROOT || resolve(__bun_runner_dirname, '..');

function fixBrokenScriptPath(argPath) {
  if (argPath.startsWith('/scripts/') && !existsSync(argPath)) {
    const fixedPath = join(RESOLVED_PLUGIN_ROOT, argPath);
    if (existsSync(fixedPath)) {
      return fixedPath;
    }
  }
  return argPath;
}

function findBun() {
  const pathCheck = IS_WINDOWS
    ? spawnSync('where bun', {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
        shell: true
      })
    : spawnSync('which', ['bun'], {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe']
      });

  if (pathCheck.status === 0 && pathCheck.stdout.trim()) {
    if (IS_WINDOWS) {
      const bunCmdPath = pathCheck.stdout.split('\n').find(line => line.trim().endsWith('bun.cmd'));
      if (bunCmdPath) {
        return bunCmdPath.trim();
      }
    }
    return 'bun'; 
  }

  const bunPaths = IS_WINDOWS
    ? [join(homedir(), '.bun', 'bin', 'bun.exe')]
    : [
        join(homedir(), '.bun', 'bin', 'bun'),
        '/usr/local/bin/bun',
        '/opt/homebrew/bin/bun',
        '/home/linuxbrew/.linuxbrew/bin/bun'
      ];

  for (const bunPath of bunPaths) {
    if (existsSync(bunPath)) {
      return bunPath;
    }
  }

  return null;
}

function isPluginDisabledInClaudeSettings() {
  try {
    const configDir = process.env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude');
    const settingsPath = join(configDir, 'settings.json');
    if (!existsSync(settingsPath)) return false;
    const settings = JSON.parse(readFileSync(settingsPath, 'utf-8'));
    // No optional chaining (?.) here: this launcher must parse on the oldest
    // Node that any host might invoke it with. Some Claude Code installs run
    // hooks under a bundled pre-ES2020 Node whose ESM loader throws
    // "SyntaxError: Unexpected token '.'" on `?.` (issue #2791).
    return Boolean(
      settings &&
      settings.enabledPlugins &&
      settings.enabledPlugins['claude-mem@thedotmack'] === false
    );
  } catch {
    return false;
  }
}

if (isPluginDisabledInClaudeSettings()) {
  process.exit(0);
}

const args = process.argv.slice(2);

if (args.length === 0) {
  console.error('Usage: node bun-runner.js <script> [args...]');
  process.exit(1);
}

args[0] = fixBrokenScriptPath(args[0]);

// Lifecycle commands never consume hook payloads. Detect them before touching
// stdin so a half-closed host pipe cannot delay daemon start/stop operations.
const lifecycleCommands = ['start', 'stop', 'restart', 'status'];
const isLifecycle = lifecycleCommands.some((cmd) => args.includes(cmd));

const bunPath = findBun();

if (!bunPath) {
  console.error('Error: Bun not found. Please install Bun: https://bun.sh');
  console.error('After installation, restart your terminal.');
  process.exit(1);
}

// Collect stdin data with a non-blocking timeout.
// WARNING: setTimeout-based fallback does NOT reliably fire on Node.js v25
// when stdin is a half-closed Unix domain socket (the event loop poll phase
// hangs).  We destroy stdin immediately after the timeout to force the
// stream closed, which unblocks the event loop and lets the timer fire.
// See incident: /Users/johnson/doc/claude-mem-incident/incident.log
function collectStdin() {
  return new Promise((resolve) => {
    if (process.stdin.isTTY) {
      resolve(null);
      return;
    }

    const chunks = [];
    let resolved = false;

    function resolveWith(value) {
      if (resolved) return;
      resolved = true;
      process.stdin.removeAllListeners();
      process.stdin.pause();
      resolve(value);
    }

    process.stdin.on('data', (chunk) => chunks.push(chunk));
    process.stdin.on('end', () => {
      resolveWith(chunks.length > 0 ? Buffer.concat(chunks) : null);
    });
    process.stdin.on('error', () => {
      resolveWith(null);
    });

    // Primary timeout
    setTimeout(() => {
      resolveWith(chunks.length > 0 ? Buffer.concat(chunks) : null);
      // Force-close the stream so the event loop unblocks even if the socket
      // is half-closed (prevents the timer phase from hanging indefinitely).
      try { process.stdin.destroy(); } catch (err) {
        console.error('[bun-runner.collectStdin] Failed to destroy stdin in timeout fallback:', err instanceof Error ? err.message : String(err));
      }
    }, 5000);
  });
}

const stdinData = isLifecycle ? null : await collectStdin();

const spawnOptions = {
  stdio: ['pipe', 'inherit', 'inherit'],
  windowsHide: true,
  env: process.env
};

let spawnCmd = bunPath;
let spawnArgs = args;

if (IS_WINDOWS) {
  const quote = (s) => `"${String(s).replace(/"/g, '\\"')}"`;
  spawnOptions.shell = true;
  spawnCmd = [bunPath, ...args].map(quote).join(' ');
  spawnArgs = [];
}

const child = spawn(spawnCmd, spawnArgs, spawnOptions);

if (child.stdin) {
  if (stdinData && stdinData.length > 0) {
    child.stdin.write(stdinData);
    child.stdin.end();
  } else {
    // Lifecycle subcommands (start, stop, restart, status) never consume stdin —
    // they manage the worker daemon, not hook payloads.  Killing the child here
    // prevents the daemon from starting/stopping on platforms where Claude Code
    // doesn't pipe a payload for SessionStart (e.g. Windows CC ≤ 2.1.145).
    if (isLifecycle) {
      // Lifecycle commands don't need stdin — close pipe and let child run.
      try { child.stdin.end(); } catch {}
    } else {
      // Issue #2188: empty/missing stdin previously masked by `|| '{}'` fallback,
      // which silently hid WSL bash failures (e.g. hooks invoked under a broken
      // shell that never piped a payload). Surface the failure mode instead.
      const dataDir = process.env.CLAUDE_MEM_DATA_DIR || join(homedir(), '.claude-mem');
      const payloadType = stdinData === null
        ? 'null (no data event or stream error)'
        : stdinData === undefined
          ? 'undefined'
          : Buffer.isBuffer(stdinData) && stdinData.length === 0
            ? 'empty Buffer (zero bytes received)'
            : `unexpected (${typeof stdinData})`;
      const payloadByteLength = (stdinData && typeof stdinData.length === 'number')
        ? stdinData.length
        : 0;
      const diagnostic = [
        `[bun-runner] empty stdin payload received — issue #2188`,
        `  script: ${args[0]}`,
        `  payload byte length: ${payloadByteLength}`,
        `  payload type: ${payloadType}`,
        `  platform: ${process.platform}`,
        `  shell: ${process.env.SHELL || 'n/a'}`,
        `  stdin TTY: ${process.stdin.isTTY === true ? 'true' : process.stdin.isTTY === false ? 'false' : 'undefined'}`,
        `  timestamp: ${new Date().toISOString()}`,
        `  CLAUDE_PLUGIN_ROOT: ${RESOLVED_PLUGIN_ROOT}`,
      ].join('\n');

      // Write to stderr so Claude Code surfaces the diagnostic.
      console.error(diagnostic);

      // Persist diagnostic to the runner-errors log and drop a CAPTURE_BROKEN marker
      // file so the next session-start hint can surface the failure. We exit 0 to
      // honor the project's exit-code strategy (worker/hook errors exit 0 to
      // prevent Windows Terminal tab pileup) — the marker file is the durable
      // signal that something is wrong, not the exit code.
      try {
        const logsDir = join(dataDir, 'logs');
        mkdirSync(logsDir, { recursive: true });
        appendFileSync(join(logsDir, 'runner-errors.log'), diagnostic + '\n\n');
        mkdirSync(dataDir, { recursive: true });
        writeFileSync(join(dataDir, 'CAPTURE_BROKEN'), diagnostic + '\n');
      } catch (writeErr) {
        console.error(`[bun-runner] failed to persist diagnostic: ${writeErr && writeErr.message ? writeErr.message : writeErr}`);
      }

      try { child.stdin.end(); } catch {}
      try { child.kill(); } catch {}
      process.exit(0);
    }
  }
}

child.on('error', (err) => {
  console.error(`Failed to start Bun: ${err.message}`);
  process.exit(1);
});

child.on('close', (code, signal) => {
  if ((signal || code > 128) && args.includes('start')) {
    process.exit(0);
  }
  // Exit Code Strategy (see CLAUDE.md): worker/hook errors must exit 0 so
  // Claude Code never surfaces a spurious non-blocking failure — e.g. a
  // cold-start race where worker-service.cjs dies with code 1 during module
  // init before the hook handler's try/catch installs. Only `start` was
  // honoring this on the close path; normalize non-blocking code 1 for every
  // subcommand. Blocking code 2 is intentional (fed to Claude) and passes
  // through untouched; the worker/runner layer surfaces real failures via
  // runner-errors.log and the logger, not the exit code.
  if (code === 1) process.exit(0);
  process.exit(code || 0);
});
