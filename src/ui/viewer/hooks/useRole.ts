import { useEffect, useState } from 'react';
import { authFetch } from '../utils/api';

/**
 * Resolved server-side role + identity (T-18 / S-doc §11).
 *
 * Fetched once at viewer boot. The result gates the user selector
 * (T-21) and the "you are pushing as X" badge (future T-25).
 *
 * On error we default to `client` / null — that's the conservative
 * choice: an unknown role hides the multi-user UI rather than showing
 * a broken selector.
 */
export interface RoleInfo {
  role: 'client' | 'server';
  /**
   * Display-only refinement of `role`: 'client'/'server' only when the
   * operator explicitly installed with `--role`, otherwise 'standalone'
   * (local-only use). Gates the header branding, not the multi-user UI.
   */
  deployment: 'client' | 'server' | 'standalone';
  userLabel: string | null;
  ready: boolean;
}

// Default to 'standalone' so the header shows generic branding until the
// role fetch resolves (and on error) instead of flashing "Client".
const DEFAULT: RoleInfo = { role: 'client', deployment: 'standalone', userLabel: null, ready: false };

export function useRole(): RoleInfo {
  const [info, setInfo] = useState<RoleInfo>(DEFAULT);

  useEffect(() => {
    let cancelled = false;
    authFetch('/api/admin/role')
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((body: { role?: string; deployment?: string; userLabel?: string | null }) => {
        if (cancelled) return;
        const role: 'client' | 'server' = body.role === 'server' ? 'server' : 'client';
        const deployment: 'client' | 'server' | 'standalone' =
          body.deployment === 'server' ? 'server' : body.deployment === 'client' ? 'client' : 'standalone';
        setInfo({ role, deployment, userLabel: body.userLabel ?? null, ready: true });
      })
      .catch(() => {
        if (cancelled) return;
        setInfo({ ...DEFAULT, ready: true });
      });
    return () => { cancelled = true; };
  }, []);

  return info;
}
