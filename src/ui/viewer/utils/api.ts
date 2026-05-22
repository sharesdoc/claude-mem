import { TOKEN_KEY } from '../hooks/useAuth';

/**
 * fetch wrapper that attaches the admin bearer token (set on server-mode
 * login) when one is present. In client/standalone mode there is no token, so
 * this is a transparent passthrough. Server-mode endpoints that gate on the
 * admin session (e.g. destructive deletes) rely on this header.
 */
export function authFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  let token: string | null = null;
  try {
    token = localStorage.getItem(TOKEN_KEY);
  } catch {
    /* localStorage unavailable — fall through as unauthenticated */
  }
  if (!token) return fetch(input, init);

  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${token}`);
  return fetch(input, { ...init, headers });
}
