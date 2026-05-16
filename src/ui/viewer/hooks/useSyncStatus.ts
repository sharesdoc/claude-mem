import { useEffect, useState } from 'react';
import { authFetch } from '../utils/api';

export interface SyncStatus {
  role: 'client' | 'server';
  sync_enabled: boolean;
  upstream: string;
  last_sync_at: number;
  last_success_at: number;
  consecutive_failures: number;
  last_error: string | null;
  lag: {
    sessions: number; observations: number; summaries: number; prompts: number; total: number;
  };
}

/**
 * Polls /api/sync/status every `intervalMs` ms (default 30s). Returns
 * the latest snapshot + `ready` flag so the Header badge can show a
 * neutral state during the first fetch instead of flashing "disabled".
 */
export function useSyncStatus(intervalMs: number = 30_000): { status: SyncStatus | null; ready: boolean } {
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function tick() {
      try {
        const r = await authFetch('/api/sync/status');
        if (!r.ok) throw new Error(String(r.status));
        const body = await r.json() as SyncStatus;
        if (!cancelled) {
          setStatus(body);
          setReady(true);
        }
      } catch {
        if (!cancelled) setReady(true);
      }
    }

    void tick();
    const timer = setInterval(tick, intervalMs);
    return () => { cancelled = true; clearInterval(timer); };
  }, [intervalMs]);

  return { status, ready };
}
