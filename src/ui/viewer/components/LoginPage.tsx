import React, { useState, useCallback, useEffect, useRef } from 'react';

interface LoginPageProps {
  onLogin: (password: string) => Promise<boolean>;
  isLoading: boolean;
  error: string | null;
  attemptsRemaining: number | null;
  retryAfterSec: number | null;
}

export function LoginPage({ onLogin, isLoading, error, attemptsRemaining, retryAfterSec }: LoginPageProps) {
  const [password, setPassword] = useState('');
  const [countdown, setCountdown] = useState(retryAfterSec);
  const inputRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Countdown timer for rate limit cooldown
  useEffect(() => {
    if (retryAfterSec !== null && retryAfterSec > 0) {
      setCountdown(retryAfterSec);
      timerRef.current = setInterval(() => {
        setCountdown(prev => {
          if (prev !== null && prev <= 1) {
            if (timerRef.current) clearInterval(timerRef.current);
            return null;
          }
          return prev !== null ? prev - 1 : null;
        });
      }, 1000);
      return () => { if (timerRef.current) clearInterval(timerRef.current); };
    } else {
      setCountdown(null);
    }
  }, [retryAfterSec]);

  // Auto-focus password field
  useEffect(() => {
    if (!isLoading && countdown === null) {
      inputRef.current?.focus();
    }
  }, [isLoading, countdown]);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password || isLoading || countdown !== null) return;
    const ok = await onLogin(password);
    if (!ok) setPassword('');
  }, [password, isLoading, countdown, onLogin]);

  const isLocked = error?.includes('locked');
  const isDisabled = isLoading || countdown !== null || isLocked;

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-card-header">
          <img
            className="login-logo"
            src="claude-mem-logomark.webp"
            alt="claude-mem logo"
          />
          <h1 className="login-title">claude-mem</h1>
          <p className="login-subtitle">Server Administration</p>
        </div>

        <form onSubmit={handleSubmit} className="login-form">
          <div className="login-field-group">
            <label htmlFor="login-username">Username</label>
            <input
              id="login-username"
              type="text"
              value="admin"
              disabled
              className="login-input"
            />
          </div>

          <div className="login-field-group">
            <label htmlFor="login-password">Password</label>
            <input
              id="login-password"
              ref={inputRef}
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Enter admin password"
              disabled={isDisabled}
              className="login-input"
            />
          </div>

          {countdown !== null && (
            <div className="login-countdown">
              <span className="login-countdown-dot" />
              <span>Cooldown — try again in {countdown}s</span>
            </div>
          )}

          {error && countdown === null && (
            <div className={`login-error-msg ${isLocked ? 'is-error' : 'is-warn'}`}>
              {isLocked
                ? 'Account locked. Reset password via CLI:'
                : error}
              {isLocked && (
                <span className="attempts-hint">
                  <code style={{ fontFamily: 'Monaco, Menlo, Consolas, monospace', fontSize: 11 }}>
                    ./install-claude-mem --admin-password &lt;new-password&gt;
                  </code>
                </span>
              )}
              {attemptsRemaining !== null && !isLocked && (
                <span className="attempts-hint">{attemptsRemaining} attempts remaining today</span>
              )}
            </div>
          )}

          <button
            type="submit"
            disabled={!password || isDisabled}
            className="login-btn"
          >
            {isLoading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <div className="login-footer">
          <span>claude-mem</span> server mode
        </div>
      </div>
    </div>
  );
}
