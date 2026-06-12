import { useState, useEffect, useCallback, useRef } from 'react';

interface AuthState {
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  attemptsRemaining: number | null;
  retryAfterSec: number | null;
}

export const TOKEN_KEY = 'claude-mem-admin-token';
const COOLDOWN_RESET_MS = 60_000;

export function useAuth() {
  const [state, setState] = useState<AuthState>({
    isAuthenticated: false,
    isLoading: true,
    error: null,
    attemptsRemaining: null,
    retryAfterSec: null,
  });
  const cooldownRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const clearCooldown = () => {
    if (cooldownRef.current) {
      clearTimeout(cooldownRef.current);
      cooldownRef.current = null;
    }
  };

  // Check auth status on mount. Always probe — even without a stored token —
  // because a loopback origin may receive an auto-issued session (X-005
  // local auto-login, CLAUDE_MEM_SERVER_LOCAL_AUTO_LOGIN).
  useEffect(() => {
    const token = localStorage.getItem(TOKEN_KEY);

    const controller = new AbortController();
    abortRef.current = controller;

    fetch('/api/admin/session', {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      signal: controller.signal,
    })
      .then(async r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((body: { authenticated: boolean; token?: string }) => {
        if (controller.signal.aborted) return;
        if (body.token) {
          localStorage.setItem(TOKEN_KEY, body.token);
        } else if (!body.authenticated && token) {
          localStorage.removeItem(TOKEN_KEY);
        }
        setState({
          isAuthenticated: body.authenticated === true,
          isLoading: false,
          error: null,
          attemptsRemaining: null,
          retryAfterSec: null,
        });
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          if (token) localStorage.removeItem(TOKEN_KEY);
          setState(prev => ({ ...prev, isLoading: false }));
        }
      });

    return () => {
      controller.abort();
      clearCooldown();
    };
  }, []);

  const login = useCallback(async (password: string): Promise<boolean> => {
    setState(prev => ({ ...prev, isLoading: true, error: null, retryAfterSec: null }));

    let r: Response;
    try {
      r = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'admin', password }),
      });
    } catch {
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: 'Cannot reach server — is the worker running?',
      }));
      return false;
    }

    // Parse JSON safely — non-JSON responses (e.g. HTML 404) shouldn't crash.
    let body: { token?: string; error?: string; reason?: string; attempts_remaining?: number; retry_after_sec?: number };
    try {
      body = await r.json();
    } catch {
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: `Server returned unexpected response (HTTP ${r.status}). Check that the worker is running in server mode.`,
      }));
      return false;
    }

    if (r.ok && body.token) {
      localStorage.setItem(TOKEN_KEY, body.token);
      setState({
        isAuthenticated: true,
        isLoading: false,
        error: null,
        attemptsRemaining: null,
        retryAfterSec: null,
      });
      return true;
    }

    // Handle rate limiting
    if (r.status === 429) {
      const waitSec = body.retry_after_sec ?? 60;
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: body.reason ?? 'rate limited',
        attemptsRemaining: null,
        retryAfterSec: waitSec,
      }));

      clearCooldown();
      cooldownRef.current = setTimeout(() => {
        setState(prev => prev.retryAfterSec === waitSec ? { ...prev, retryAfterSec: null, error: null } : prev);
      }, waitSec * 1000);

      return false;
    }

    // Bad credentials or locked
    setState(prev => ({
      ...prev,
      isLoading: false,
      error: body.reason ?? body.error ?? 'login failed',
      attemptsRemaining: body.attempts_remaining ?? null,
    }));

    return false;
  }, []);

  const logout = useCallback(async () => {
    const token = localStorage.getItem(TOKEN_KEY);
    localStorage.removeItem(TOKEN_KEY);
    if (token) {
      try {
        await fetch('/api/admin/logout', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        });
      } catch { /* best effort */ }
    }
    setState({
      isAuthenticated: false,
      isLoading: false,
      error: null,
      attemptsRemaining: null,
      retryAfterSec: null,
    });
  }, []);

  // Cleanup on unmount
  useEffect(() => () => {
    clearCooldown();
    abortRef.current?.abort();
  }, []);

  return { ...state, login, logout };
}
