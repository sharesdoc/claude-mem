import { useEffect, useState } from 'react';
import { authFetch } from '../utils/api';

/**
 * `/api/users` aggregates from sdk_sessions (T-19). Server-mode-only;
 * client mode returns 404 and the hook resolves to an empty list so the
 * UI can simply not render the selector.
 */
export interface UserRow {
  user_label: string;
  sessions: number;
  last_active: number | null;
}

export interface UseUsersResult {
  users: UserRow[];
  ready: boolean;
}

export function useUsers(enabled: boolean): UseUsersResult {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!enabled) {
      setUsers([]);
      setReady(true);
      return;
    }
    let cancelled = false;
    authFetch('/api/users')
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((body: { users?: UserRow[] }) => {
        if (cancelled) return;
        setUsers(Array.isArray(body.users) ? body.users : []);
        setReady(true);
      })
      .catch(() => {
        if (cancelled) return;
        setUsers([]);
        setReady(true);
      });
    return () => { cancelled = true; };
  }, [enabled]);

  return { users, ready };
}
