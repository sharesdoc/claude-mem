import React, { useState, useCallback } from 'react';

interface LoginPageProps {
  onLogin: (password: string) => Promise<boolean>;
  isLoading: boolean;
  error: string | null;
  attemptsRemaining: number | null;
  retryAfterSec: number | null;
}

export function LoginPage({ onLogin, isLoading, error, attemptsRemaining, retryAfterSec }: LoginPageProps) {
  const [password, setPassword] = useState('');

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password || isLoading || retryAfterSec !== null) return;
    const ok = await onLogin(password);
    if (!ok) setPassword('');
  }, [password, isLoading, retryAfterSec, onLogin]);

  const isLocked = error?.includes('locked');

  return (
    <div className="login-page">
      <div className="login-card">
        <h1 className="login-title">claude-mem</h1>
        <p className="login-subtitle">Server Administration</p>

        <form onSubmit={handleSubmit} className="login-form">
          <div className="login-field">
            <label htmlFor="login-username">Username</label>
            <input
              id="login-username"
              type="text"
              value="admin"
              disabled
              className="login-input"
            />
          </div>

          <div className="login-field">
            <label htmlFor="login-password">Password</label>
            <input
              id="login-password"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Enter admin password"
              disabled={isLoading || retryAfterSec !== null || isLocked}
              autoFocus
              className="login-input"
            />
          </div>

          {retryAfterSec !== null && (
            <div className="login-msg login-msg-warn">
              Too many attempts. Try again in {retryAfterSec}s.
            </div>
          )}

          {error && retryAfterSec === null && (
            <div className={`login-msg ${isLocked ? 'login-msg-error' : 'login-msg-warn'}`}>
              {isLocked
                ? 'Account locked. Reset password via CLI: ./install-claude-mem --admin-password <new-password>'
                : error}
              {attemptsRemaining !== null && !isLocked && (
                <span className="login-attempts-left"> ({attemptsRemaining} attempts remaining today)</span>
              )}
            </div>
          )}

          <button
            type="submit"
            disabled={!password || isLoading || retryAfterSec !== null || isLocked}
            className="login-btn"
          >
            {isLoading ? 'Signing in...' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  );
}
