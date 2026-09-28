import path from "path";
import os from "os";
import { readFileSync, existsSync, writeFileSync, renameSync, mkdirSync } from "fs";
import { execSync } from "child_process";
import { spawnHidden } from "./spawn.js";
import { logger } from "../utils/logger.js";
import { HOOK_TIMEOUTS, HOOK_EXIT_CODES, getTimeout } from "./hook-constants.js";
import { SettingsDefaultsManager } from "./SettingsDefaultsManager.js";
import { MARKETPLACE_ROOT, DATA_DIR } from "./paths.js";
import { loadFromFileOnce } from "./hook-settings.js";
import { validateWorkerPidFile } from "../supervisor/index.js";
import { checkVersionMatch } from "../services/infrastructure/index.js";
import { acquireSpawnLock, releaseSpawnLock } from './worker-spawn-gate.js';

function readTimeoutEnv(
  envName: string,
  defaultValue: number,
  bounds: { min: number; max: number }
): number {
  const envVal = process.env[envName];
  if (envVal) {
    const parsed = parseInt(envVal, 10);
    if (Number.isFinite(parsed) && parsed >= bounds.min && parsed <= bounds.max) {
      return parsed;
    }
    logger.warn('SYSTEM', `Invalid ${envName}, using default`, {
      value: envVal, min: bounds.min, max: bounds.max
    });
  }
  return defaultValue;
}

const HEALTH_CHECK_TIMEOUT_MS = readTimeoutEnv(
  'CLAUDE_MEM_HEALTH_TIMEOUT_MS',
  getTimeout(HOOK_TIMEOUTS.HEALTH_CHECK),
  { min: 500, max: 300000 }
);

const API_REQUEST_TIMEOUT_MS = readTimeoutEnv(
  'CLAUDE_MEM_API_TIMEOUT_MS',
  getTimeout(HOOK_TIMEOUTS.API_REQUEST),
  { min: 500, max: 300000 }
);

const HOOK_READINESS_TIMEOUT_MS = readTimeoutEnv(
  'CLAUDE_MEM_HOOK_READINESS_TIMEOUT_MS',
  getTimeout(HOOK_TIMEOUTS.HOOK_READINESS_WAIT),
  { min: 0, max: 300000 }
);

export function fetchWithTimeout(url: string, init: RequestInit = {}, timeoutMs: number): Promise<Response> {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(
      () => reject(new Error(`Request timed out after ${timeoutMs}ms`)),
      timeoutMs
    );
    fetch(url, init).then(
      response => { clearTimeout(timeoutId); resolve(response); },
      err => { clearTimeout(timeoutId); reject(err); }
    );
  });
}

let cachedPort: number | null = null;
let cachedHost: string | null = null;

export function getWorkerPort(): number {
  if (cachedPort !== null) {
    return cachedPort;
  }

  const settingsPath = path.join(SettingsDefaultsManager.get('CLAUDE_MEM_DATA_DIR'), 'settings.json');
  const settings = SettingsDefaultsManager.loadFromFile(settingsPath);
  cachedPort = parseInt(settings.CLAUDE_MEM_WORKER_PORT, 10);
  return cachedPort;
}

export function getWorkerHost(): string {
  if (cachedHost !== null) {
    return cachedHost;
  }

  const settingsPath = path.join(SettingsDefaultsManager.get('CLAUDE_MEM_DATA_DIR'), 'settings.json');
  const settings = SettingsDefaultsManager.loadFromFile(settingsPath);
  cachedHost = settings.CLAUDE_MEM_WORKER_HOST;
  return cachedHost;
}

export function clearPortCache(): void {
  cachedPort = null;
  cachedHost = null;
}

export function buildWorkerUrl(apiPath: string): string {
  return `http://${getWorkerHost()}:${getWorkerPort()}${apiPath}`;
}

export function workerHttpRequest(
  apiPath: string,
  options: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
    timeoutMs?: number;
  } = {}
): Promise<Response> {
  const method = options.method ?? 'GET';
  const timeoutMs = options.timeoutMs ?? API_REQUEST_TIMEOUT_MS;

  const url = buildWorkerUrl(apiPath);
  const init: RequestInit = { method };
  if (options.headers) {
    init.headers = options.headers;
  }
  if (options.body) {
    init.body = options.body;
  }

  if (timeoutMs > 0) {
    return fetchWithTimeout(url, init, timeoutMs);
  }
  return fetch(url, init);
}

async function isWorkerHealthy(): Promise<boolean> {
  const response = await workerHttpRequest('/api/health', { timeoutMs: HEALTH_CHECK_TIMEOUT_MS });
  return response.ok;
}

async function isWorkerReady(): Promise<boolean> {
  const response = await workerHttpRequest('/api/readiness', { timeoutMs: HEALTH_CHECK_TIMEOUT_MS });
  return response.ok;
}

export interface WorkerScriptCandidate {
  scriptPath: string;
  version: string;
}

function readVersionForScript(scriptPath: string): string {
  let directory = path.dirname(scriptPath);
  for (let depth = 0; depth < 5; depth++) {
    const packagePath = path.join(directory, 'package.json');
    if (existsSync(packagePath)) {
      try {
        const parsed = JSON.parse(readFileSync(packagePath, 'utf8')) as { version?: unknown };
        if (typeof parsed.version === 'string') return parsed.version;
      } catch {
        // Continue upward; a partial package file must not select another identity.
      }
    }
    const parent = path.dirname(directory);
    if (parent === directory) break;
    directory = parent;
  }
  return 'unknown';
}

/** Resolves script and version from the same installation identity. */
export function resolveWorkerScript(): WorkerScriptCandidate | null {
  const candidates = [
    process.env.CLAUDE_MEM_WORKER_SCRIPT_PATH,
    path.join(MARKETPLACE_ROOT, 'plugin', 'scripts', 'worker-service.cjs'),
    path.join(process.cwd(), 'plugin', 'scripts', 'worker-service.cjs'),
  ].filter((candidate): candidate is string => Boolean(candidate));
  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return { scriptPath: candidate, version: readVersionForScript(candidate) };
    }
  }
  return null;
}

function resolveBunRuntime(): string | null {
  if (process.env.BUN && existsSync(process.env.BUN)) return process.env.BUN;

  // 规范安装位回退(跨平台/跨用户,绝不写死某个用户目录):hook 进程继承的
  // PATH 经常缺 ~/.bun/bin —— Windows 安装器只写用户级 PATH(已运行的进程
  // 看不到),macOS 非登录 shell 不读 ~/.zprofile。没有这层回退,worker 的
  // lazy-spawn 会报 "Bun runtime not found on PATH" 并让 worker 永久死亡,
  // 除非用户手动设置 BUN 环境变量。
  const home = os.homedir();
  const canonical = process.platform === 'win32'
    ? [path.join(home, '.bun', 'bin', 'bun.exe'), path.join(home, '.bun', 'bin', 'bun')]
    : [path.join(home, '.bun', 'bin', 'bun'), '/usr/local/bin/bun', '/opt/homebrew/bin/bun'];
  for (const candidate of canonical) {
    if (existsSync(candidate)) return candidate;
  }

  try {
    const cmd = process.platform === 'win32' ? 'where bun' : 'which bun';
    const output = execSync(cmd, {
      stdio: ['ignore', 'pipe', 'ignore'],
      encoding: 'utf-8',
      windowsHide: true,
    });
    const firstMatch = output
      .split(/\r?\n/)
      .map(line => line.trim())
      .find(line => line.length > 0);
    return firstMatch || null;
  } catch {
    return null;
  }
}

async function waitForWorkerPort(options: { attempts: number; backoffMs: number }): Promise<boolean> {
  let delayMs = options.backoffMs;
  for (let attempt = 1; attempt <= options.attempts; attempt++) {
    if (await isWorkerPortAlive()) return true;
    if (attempt < options.attempts) {
      await new Promise<void>(resolve => setTimeout(resolve, delayMs));
      delayMs *= 2;
    }
  }
  return false;
}

async function waitForWorkerReadiness(timeoutMs: number = HOOK_READINESS_TIMEOUT_MS): Promise<boolean> {
  if (timeoutMs <= 0) {
    try {
      return await isWorkerReady();
    } catch {
      return false;
    }
  }

  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      if (await isWorkerReady()) return true;
    } catch (error: unknown) {
      logger.debug('SYSTEM', 'Worker readiness check threw', {
        error: error instanceof Error ? error.message : String(error),
      });
    }

    const remainingMs = timeoutMs - (Date.now() - start);
    if (remainingMs <= 0) break;
    await new Promise<void>(resolve => setTimeout(resolve, Math.min(250, remainingMs)));
  }
  return false;
}

async function isWorkerPortAlive(): Promise<boolean> {
  let healthy: boolean;
  try {
    healthy = await isWorkerHealthy();
  } catch (error: unknown) {
    logger.debug('SYSTEM', 'Worker health check threw', {
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
  if (!healthy) return false;

  const pidStatus = validateWorkerPidFile({ logAlive: false });
  if (pidStatus === 'missing') return true;
  if (pidStatus === 'alive') return true;
  return false;
}

export async function ensureWorkerRunning(): Promise<boolean> {
  const resolvedWorker = resolveWorkerScript();
  if (await isWorkerPortAlive()) {
    if (!resolvedWorker) {
      logger.warn('SYSTEM', 'Worker is alive but no same-source worker script/version could be resolved; keeping the existing worker');
      return await waitForWorkerReadiness();
    }
    // A worker is already alive. If it is a DIFFERENT version than the
    // installed plugin (e.g. the user upgraded but the previous worker is
    // still squatting the port), recycle it so the current version takes
    // over — otherwise the stale worker keeps serving indefinitely.
    //
    // Previously this branch only logged the mismatch (debug level) and
    // returned, so a stale worker was reused across upgrades. We now act on
    // it: ask the running worker to restart via its localhost-only admin
    // endpoint, then fall through to the lazy-spawn + readiness path so the
    // current-version worker is (re)started and awaited.
    const { matches, pluginVersion, workerVersion } = await checkVersionMatch(
      getWorkerPort(),
      resolvedWorker.version
    );
    if (matches) {
      const ready = await waitForWorkerReadiness();
      if (!ready) {
        logger.warn('SYSTEM', 'Worker is healthy but not ready; skipping hook API call');
        return false;
      }
      return true;
    }

    logger.info('SYSTEM', 'Worker version mismatch — recycling stale worker', {
      pluginVersion,
      workerVersion,
    });
    try {
      await workerHttpRequest('/api/admin/restart', {
        method: 'POST',
        timeoutMs: HEALTH_CHECK_TIMEOUT_MS,
      });
    } catch (error: unknown) {
      logger.debug('SYSTEM', 'Worker restart request failed; falling through to lazy-spawn', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
    // Give the old worker a moment to release the port before the new one
    // attempts to bind. The restart endpoint returns immediately (async
    // shutdown), so without this pause the lazy-spawn below can hit an
    // EADDRINUSE on the first attempt and need a retry.
    await new Promise<void>(resolve => setTimeout(resolve, 1500));
    // Fall through to (re)spawn + readiness wait below.
  }

  const runtimePath = resolveBunRuntime();
  const scriptPath = resolvedWorker?.scriptPath ?? null;

  if (!runtimePath) {
    logger.warn('SYSTEM', 'Cannot lazy-spawn worker: Bun runtime not found on PATH');
    return false;
  }
  if (!scriptPath) {
    logger.warn('SYSTEM', 'Cannot lazy-spawn worker: worker-service.cjs not found in plugin/scripts');
    return false;
  }

  logger.info('SYSTEM', 'Worker not running — lazy-spawning', { runtimePath, scriptPath });

  if (!acquireSpawnLock()) {
    logger.info('SYSTEM', 'Another launcher owns daemon spawn; waiting for its worker');
    const alive = await waitForWorkerPort({ attempts: 6, backoffMs: 500 });
    return alive && await waitForWorkerReadiness();
  }

  // Cold boot (#2795): on the first session after a reboot the SessionStart
  // `start` hook is booting the daemon in parallel, and a cold macOS+Chroma
  // worker needs ~7s to bind. The old 3-attempt/250ms budget (~0.75s) expired
  // long before that, so the context (and session-init) hooks raced boot and
  // soft-failed to empty — dropping memory injection and the user_prompts row
  // (the upstream trigger for #2794). Wait up to ~15.5s (≈ POST_SPAWN_WAIT) so
  // whichever worker wins the port is seen before we give up.
  try {
    try {
      const proc = spawnHidden(runtimePath, [scriptPath, '--daemon'], {
        detached: true,
        stdio: ['ignore', 'ignore', 'ignore'],
      });
      proc.unref();
    } catch (error: unknown) {
      if (error instanceof Error) {
        logger.error('SYSTEM', 'Lazy-spawn of worker failed', { runtimePath, scriptPath }, error);
      } else {
        logger.error('SYSTEM', 'Lazy-spawn of worker failed (non-Error)', {
          runtimePath, scriptPath, error: String(error),
        });
      }
      return false;
    }

    const alive = await waitForWorkerPort({ attempts: 6, backoffMs: 500 });
    if (!alive) {
      logger.warn('SYSTEM', 'Worker port did not open after lazy-spawn within the cold-boot wait (~15s)');
      return false;
    }
    const ready = await waitForWorkerReadiness();
    if (!ready) {
      logger.warn('SYSTEM', 'Worker lazy-spawned but did not become ready before hook readiness timeout');
      return false;
    }
    return true;
  } finally {
    releaseSpawnLock();
  }
}

let aliveCache: boolean | null = null;

/**
 * Check an already-running worker without recycling or spawning a process.
 * High-frequency hook clients use this path so event volume can never control
 * the number of Bun processes. Worker lifecycle remains owned by SessionStart
 * and explicit start/restart commands.
 *
 * @returns True only when the existing daemon is healthy and ready.
 */
async function checkExistingWorkerReady(): Promise<boolean> {
  try {
    if (!await isWorkerHealthy()) return false;
    return await waitForWorkerReadiness();
  } catch (error: unknown) {
    logger.debug('SYSTEM', 'Existing worker health check failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

export async function ensureWorkerAliveOnce(): Promise<boolean> {
  if (aliveCache !== null) return aliveCache;
  aliveCache = process.env.CLAUDE_MEM_HOOK_CLIENT_ONLY === '1'
    ? await checkExistingWorkerReady()
    : await ensureWorkerRunning();
  return aliveCache;
}

interface HookFailureState {
  consecutiveFailures: number;
  lastFailureAt: number;
}

const FAIL_LOUD_DEFAULT_THRESHOLD = 3;

function getStateDir(): string {
  return path.join(DATA_DIR, 'state');
}

function getHookFailuresPath(): string {
  return path.join(getStateDir(), 'hook-failures.json');
}

function readHookFailureState(): HookFailureState {
  try {
    const raw = readFileSync(getHookFailuresPath(), 'utf-8');
    const parsed = JSON.parse(raw) as Partial<HookFailureState>;
    return {
      consecutiveFailures: typeof parsed.consecutiveFailures === 'number' && Number.isFinite(parsed.consecutiveFailures)
        ? Math.max(0, Math.floor(parsed.consecutiveFailures))
        : 0,
      lastFailureAt: typeof parsed.lastFailureAt === 'number' && Number.isFinite(parsed.lastFailureAt)
        ? parsed.lastFailureAt
        : 0,
    };
  } catch {
    return { consecutiveFailures: 0, lastFailureAt: 0 };
  }
}

function writeHookFailureStateAtomic(state: HookFailureState): void {
  const stateDir = getStateDir();
  const dest = getHookFailuresPath();
  const tmp = `${dest}.tmp`;
  try {
    if (!existsSync(stateDir)) {
      mkdirSync(stateDir, { recursive: true });
    }
    writeFileSync(tmp, JSON.stringify(state), 'utf-8');
    renameSync(tmp, dest);
  } catch (error: unknown) {
    logger.debug('SYSTEM', 'Failed to persist hook-failure counter', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

function getFailLoudThreshold(): number {
  try {
    const settings = loadFromFileOnce();
    const raw = settings.CLAUDE_MEM_HOOK_FAIL_LOUD_THRESHOLD;
    const parsed = parseInt(raw, 10);
    if (Number.isFinite(parsed) && parsed >= 1) return parsed;
  } catch {
    // settings unreadable — fall through to default
  }
  return FAIL_LOUD_DEFAULT_THRESHOLD;
}

function recordWorkerUnreachable(): number {
  const state = readHookFailureState();
  const next: HookFailureState = {
    consecutiveFailures: state.consecutiveFailures + 1,
    lastFailureAt: Date.now(),
  };
  writeHookFailureStateAtomic(next);

  const threshold = getFailLoudThreshold();
  if (next.consecutiveFailures >= threshold) {
    process.stderr.write(
      `claude-mem worker unreachable for ${next.consecutiveFailures} consecutive hooks.\n`
    );
    process.exit(HOOK_EXIT_CODES.BLOCKING_ERROR);
  }
  return next.consecutiveFailures;
}

function resetWorkerFailureCounter(): void {
  const state = readHookFailureState();
  if (state.consecutiveFailures === 0) return;
  writeHookFailureStateAtomic({ consecutiveFailures: 0, lastFailureAt: 0 });
}

const WORKER_FALLBACK_BRAND: unique symbol = Symbol.for('claude-mem/worker-fallback');

export type WorkerFallback =
  | { continue: true; [WORKER_FALLBACK_BRAND]: true }
  | { continue: true; reason: string; [WORKER_FALLBACK_BRAND]: true };

export type WorkerCallResult<T> = T | WorkerFallback;

export function isWorkerFallback<T>(result: WorkerCallResult<T>): result is WorkerFallback {
  return typeof result === 'object'
    && result !== null
    && (result as { [WORKER_FALLBACK_BRAND]?: unknown })[WORKER_FALLBACK_BRAND] === true;
}

export interface WorkerFallbackOptions {
  timeoutMs?: number;
}

export async function executeWithWorkerFallback<T = unknown>(
  url: string,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  body?: unknown,
  options: WorkerFallbackOptions = {},
): Promise<WorkerCallResult<T>> {
  const alive = await ensureWorkerAliveOnce();
  if (!alive) {
    recordWorkerUnreachable();
    return { continue: true, reason: 'worker_unreachable', [WORKER_FALLBACK_BRAND]: true };
  }

  const init: { method: string; headers?: Record<string, string>; body?: string; timeoutMs?: number } = { method };
  if (body !== undefined) {
    init.headers = { 'Content-Type': 'application/json' };
    init.body = JSON.stringify(body);
  }
  if (options.timeoutMs !== undefined) {
    init.timeoutMs = options.timeoutMs;
  }

  const response = await workerHttpRequest(url, init);
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    resetWorkerFailureCounter();
    if (response.status === 429 || response.status >= 500) {
      logger.warn('SYSTEM', `Worker API ${method} ${url} returned ${response.status}; skipping hook API call`, {
        body: text.substring(0, 200),
      });
      return {
        continue: true,
        reason: `worker_api_${response.status}`,
        [WORKER_FALLBACK_BRAND]: true,
      };
    }

    let parsed: unknown = text;
    try { parsed = JSON.parse(text); } catch { /* keep raw text */ }
    return parsed as T;
  }

  resetWorkerFailureCounter();
  const text = await response.text();
  if (text.length === 0) return undefined as unknown as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    return text as unknown as T;
  }
}
