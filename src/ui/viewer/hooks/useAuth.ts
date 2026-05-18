import { useState, useEffect, useCallback, useRef } from 'react';

interface AuthState {
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  attemptsRemaining: number | null;
  retryAfterSec: number | null;
}

const TOKEN_KEY = 'claude-mem-admin-token';
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

  // Check auth status on mount
  useEffect(() => {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) {
      setState(prev => ({ ...prev, isLoading: false }));
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;

    fetch('/api/admin/session', {
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
    })
      .then(r => r.json())
      .then((body: { authenticated: boolean }) => {
        if (!controller.signal.aborted) {
          setState({
            isAuthenticated: body.authenticated === true,
            isLoading: false,
            error: null,
            attemptsRemaining: null,
            retryAfterSec: null,
          });
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
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

    try {
      const r = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'admin', password }),
      });

      const body = await r.json() as {
        token?: string;
        error?: string;
        reason?: string;
        attempts_remaining?: number;
        retry_after_sec?: number;
      };

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

        // Auto-clear cooldown
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
    } catch {
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: 'network error',
      }));
      return false;
    }
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
