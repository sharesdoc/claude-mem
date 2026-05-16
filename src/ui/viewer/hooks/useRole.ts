import { useEffect, useState } from 'react';
import { authFetch } from '../utils/api';

/**
 * Resolved server-side role + identity (T-18 / S-doc §11).
 *
 * Fetched once at viewer boot. The result gates the employee selector
 * (T-21) and the "you are pushing as X" badge (future T-25).
 *
 * On error we default to `client` / null — that's the conservative
 * choice: an unknown role hides the multi-user UI rather than showing
 * a broken selector.
 */
export interface RoleInfo {
  role: 'client' | 'server';
  userLabel: string | null;
  ready: boolean;
}

const DEFAULT: RoleInfo = { role: 'client', userLabel: null, ready: false };

export function useRole(): RoleInfo {
  const [info, setInfo] = useState<RoleInfo>(DEFAULT);

  useEffect(() => {
    let cancelled = false;
    authFetch('/api/admin/role')
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((body: { role?: string; userLabel?: string | null }) => {
        if (cancelled) return;
        const role: 'client' | 'server' = body.role === 'server' ? 'server' : 'client';
        setInfo({ role, userLabel: body.userLabel ?? null, ready: true });
      })
      .catch(() => {
        if (cancelled) return;
        setInfo({ ...DEFAULT, ready: true });
      });
    return () => { cancelled = true; };
  }, []);

  return info;
}
