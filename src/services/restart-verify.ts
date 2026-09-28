import { getWorkerHost, fetchWithTimeout } from '../shared/worker-utils.js';

interface HealthSnapshot {
  pid?: unknown;
  version?: unknown;
}

export type RestartVerifyResult =
  | { ok: true; pid: number; version: string }
  | { ok: false; lastObserved: string };

async function fetchHealth(port: number, timeoutMs: number): Promise<HealthSnapshot> {
  const response = await fetchWithTimeout(
    `http://${getWorkerHost()}:${port}/api/health`,
    {},
    timeoutMs
  );
  // A degraded worker may answer 503 while still proving pid and version.
  return await response.json() as HealthSnapshot;
}

/** Captures the current daemon PID before shutdown; unreachable is valid. */
export async function getCurrentWorkerPid(port: number, timeoutMs = 2000): Promise<number | null> {
  try {
    const health = await fetchHealth(port, timeoutMs);
    return typeof health.pid === 'number' ? health.pid : null;
  } catch {
    return null;
  }
}

/** Proves that restart produced a new process running the caller's version. */
export async function verifyRestartedWorker(
  port: number,
  oldPid: number | null,
  expectedVersion: string,
  deadlineMs: number,
  options: { pollIntervalMs?: number; requestTimeoutMs?: number } = {}
): Promise<RestartVerifyResult> {
  const deadline = Date.now() + deadlineMs;
  const interval = options.pollIntervalMs ?? 500;
  const requestTimeout = options.requestTimeoutMs ?? 2000;
  let lastObserved = 'no health response observed before deadline';

  while (Date.now() < deadline) {
    try {
      const health = await fetchHealth(port, requestTimeout);
      lastObserved = `last health payload: ${JSON.stringify({ pid: health.pid, version: health.version })}`;
      if (
        typeof health.pid === 'number' &&
        health.pid !== oldPid &&
        health.version === expectedVersion
      ) {
        return { ok: true, pid: health.pid, version: expectedVersion };
      }
    } catch (error) {
      lastObserved = `connection error: ${error instanceof Error ? error.message : String(error)}`;
    }
    await new Promise(resolve => setTimeout(resolve, interval));
  }
  return { ok: false, lastObserved };
}
