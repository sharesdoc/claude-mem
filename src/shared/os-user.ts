import { userInfo } from 'os';

/**
 * Cached OS username for the worker process (one syscall per process).
 *
 * Returned value is the username the worker is running as — which, for
 * claude-mem's single-machine single-user model, equals the username that
 * produced the data the worker is recording. The value persists for the
 * life of the process; restarting the worker (or installing on a new
 * machine) re-evaluates it.
 *
 * Cross-platform: backed by `os.userInfo().username`, which Node provides
 * on macOS, Linux and Windows.
 *
 * Failure path: any error during username lookup (rare, but happens in
 * locked-down headless environments) is swallowed and we return `null`
 * rather than crashing — downstream code treats null as "user unknown"
 * and renders nothing, which is the right UX fallback.
 */
let cached: string | null | undefined;
export function getOsUserName(): string | null {
  if (cached !== undefined) return cached;
  try {
    const name = userInfo().username;
    cached = typeof name === 'string' && name.length > 0 ? name : null;
  } catch {
    cached = null;
  }
  return cached;
}
