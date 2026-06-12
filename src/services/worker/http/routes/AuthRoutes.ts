import express, { Request, Response } from 'express';
import { createHash } from 'crypto';
import { BaseRouteHandler } from '../BaseRouteHandler.js';
import { AdminSessionStore, extractBearerToken } from '../AdminSessionStore.js';
import { isLoopbackRequest } from '../middleware.js';
import { logger } from '../../../../utils/logger.js';
import type { DatabaseManager } from '../../DatabaseManager.js';
import { SettingsDefaultsManager } from '../../../../shared/SettingsDefaultsManager.js';
import { USER_SETTINGS_PATH } from '../../../../shared/paths.js';
import { existsSync, readFileSync, writeFileSync } from 'fs';

const DAY_START = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

function sha1(input: string): string {
  return createHash('sha1').update(input).digest('hex');
}

function loadSettings(): Record<string, string> {
  try {
    if (existsSync(USER_SETTINGS_PATH)) {
      const raw = JSON.parse(readFileSync(USER_SETTINGS_PATH, 'utf-8'));
      return raw.env ?? raw ?? {};
    }
  } catch { /* */ }
  return {};
}

function saveSetting(key: string, value: string): void {
  let raw: Record<string, unknown> = {};
  try {
    if (existsSync(USER_SETTINGS_PATH)) {
      raw = JSON.parse(readFileSync(USER_SETTINGS_PATH, 'utf-8'));
    }
  } catch { /* */ }
  if (!raw.env || typeof raw.env !== 'object') raw.env = {};
  (raw.env as Record<string, string>)[key] = value;
  writeFileSync(USER_SETTINGS_PATH, JSON.stringify(raw, null, 2) + '\n', 'utf-8');
}

function deleteSetting(key: string): void {
  let raw: Record<string, unknown> = {};
  try {
    if (existsSync(USER_SETTINGS_PATH)) {
      raw = JSON.parse(readFileSync(USER_SETTINGS_PATH, 'utf-8'));
    }
  } catch { /* */ }
  if (raw.env && typeof raw.env === 'object') {
    delete (raw.env as Record<string, string>)[key];
  }
  writeFileSync(USER_SETTINGS_PATH, JSON.stringify(raw, null, 2) + '\n', 'utf-8');
}

export class AuthRoutes extends BaseRouteHandler {
  constructor(
    private readonly dbManager: DatabaseManager,
    private readonly sessions: AdminSessionStore,
  ) {
    super();
  }

  private ensureSchema(): void {
    try {
      const db = this.dbManager.getConnection();
      db.run(`
        CREATE TABLE IF NOT EXISTS admin_login_attempts (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          attempted_at_epoch INTEGER NOT NULL,
          success INTEGER NOT NULL DEFAULT 0
        )
      `);
      db.run('CREATE INDEX IF NOT EXISTS idx_admin_attempts_epoch ON admin_login_attempts(attempted_at_epoch)');
    } catch {
      // DB not initialized yet — called again on first login
    }
  }

  setupRoutes(app: express.Application): void {
    app.post('/api/admin/login', this.handleLogin);
    app.post('/api/admin/logout', this.handleLogout);
    app.get('/api/admin/session', this.handleStatus);
  }

  private handleLogin = this.wrapHandler(async (req: Request, res: Response): Promise<void> => {
    this.ensureSchema();
    const { username, password } = (req.body ?? {}) as { username?: string; password?: string };

    if (!username || !password) {
      res.status(400).json({ error: 'missing_fields', reason: 'username and password required' });
      return;
    }

    if (username !== 'admin') {
      res.status(401).json({ error: 'bad_credentials', reason: 'invalid username' });
      return;
    }

    const settings = loadSettings();
    const storedHash = settings.CLAUDE_MEM_ADMIN_PASSWORD || '94a0c82eed3ba3039400f0f7bda6a602af533166';
    const inputHash = sha1(password);

    // Lockout check
    if (settings.CLAUDE_MEM_ADMIN_LOCKED === 'true') {
      res.status(423).json({ error: 'locked', reason: 'account locked — reset password via CLI' });
      return;
    }

    const db = this.dbManager.getConnection();
    const now = Date.now();

    // ── Rate limiting: sliding windows (shortest first) ─────────────────
    // Rules: 2/min, 10/10min, 20/hour, 20 fails/day → lockout

    // 1 minute window: max 2 attempts
    const oneMinCount = db.prepare(
      'SELECT COUNT(*) AS n FROM admin_login_attempts WHERE attempted_at_epoch > ?'
    ).get(now - 60_000) as { n: number };
    if (oneMinCount.n >= 2) {
      const waitSec = Math.ceil((60_000 - (now - this.getLastAttemptEpoch(db))) / 1000);
      res.status(429).json({
        error: 'rate_limited',
        reason: 'Too many attempts — try again shortly',
        retry_after_sec: Math.max(1, waitSec),
      });
      return;
    }

    // 10 minute window: max 10 attempts
    const tenMinCount = db.prepare(
      'SELECT COUNT(*) AS n FROM admin_login_attempts WHERE attempted_at_epoch > ?'
    ).get(now - 600_000) as { n: number };
    if (tenMinCount.n >= 10) {
      const waitSec = Math.ceil((600_000 - (now - this.getLastAttemptEpoch(db))) / 1000);
      res.status(429).json({
        error: 'rate_limited',
        reason: 'Too many attempts — try again shortly',
        retry_after_sec: Math.max(1, waitSec),
      });
      return;
    }

    // 1 hour window: max 20 attempts
    const oneHourCount = db.prepare(
      'SELECT COUNT(*) AS n FROM admin_login_attempts WHERE attempted_at_epoch > ?'
    ).get(now - 3_600_000) as { n: number };
    if (oneHourCount.n >= 20) {
      const waitSec = Math.ceil((3_600_000 - (now - this.getLastAttemptEpoch(db))) / 1000);
      res.status(429).json({
        error: 'rate_limited',
        reason: 'Too many attempts — try again later',
        retry_after_sec: Math.max(1, waitSec),
      });
      return;
    }

    // Daily: 20 failed attempts → permanent lockout
    const todayFails = db.prepare(
      'SELECT COUNT(*) AS n FROM admin_login_attempts WHERE success = 0 AND attempted_at_epoch > ?'
    ).get(DAY_START()) as { n: number };
    if (todayFails.n >= 20) {
      saveSetting('CLAUDE_MEM_ADMIN_LOCKED', 'true');
      logger.warn('SYSTEM', 'Admin account locked after 20 failed attempts');
      res.status(423).json({ error: 'locked', reason: 'account locked — reset password via CLI' });
      return;
    }

    // Verify password
    if (inputHash !== storedHash) {
      db.prepare('INSERT INTO admin_login_attempts (attempted_at_epoch, success) VALUES (?, 0)').run(now);
      const remaining = 20 - todayFails.n - 1;
      res.status(401).json({
        error: 'bad_credentials',
        reason: 'invalid password',
        attempts_remaining: Math.max(0, remaining),
      });
      return;
    }

    // Success
    db.prepare('INSERT INTO admin_login_attempts (attempted_at_epoch, success) VALUES (?, 1)').run(now);

    const { token, expiresAt } = this.sessions.create(now);

    logger.info('SYSTEM', 'Admin login successful');
    res.json({ token, expires_at: expiresAt });
  });

  private handleLogout = this.wrapHandler(async (req: Request, res: Response): Promise<void> => {
    this.sessions.destroy(extractBearerToken(req));
    res.json({ success: true });
  });

  private handleStatus = this.wrapHandler(async (req: Request, res: Response): Promise<void> => {
    if (this.sessions.verify(extractBearerToken(req))) {
      res.json({ authenticated: true });
      return;
    }

    // Local auto-login (X-005): a loopback caller is the server operator —
    // issue an admin session without credentials unless disabled via
    // CLAUDE_MEM_SERVER_LOCAL_AUTO_LOGIN=false (read fresh, no restart needed).
    const autoLoginEnabled = (loadSettings().CLAUDE_MEM_SERVER_LOCAL_AUTO_LOGIN ?? 'true') !== 'false';
    if (autoLoginEnabled && isLoopbackRequest(req)) {
      const { token, expiresAt } = this.sessions.create(Date.now());
      logger.info('SYSTEM', 'Admin session auto-issued for loopback request');
      res.json({ authenticated: true, token, expires_at: expiresAt, auto_login: 'local' });
      return;
    }

    res.json({ authenticated: false });
  });

  private getLastAttemptEpoch(db: ReturnType<DatabaseManager['getConnection']>): number {
    const row = db.prepare(
      'SELECT MAX(attempted_at_epoch) AS m FROM admin_login_attempts'
    ).get() as { m: number | null };
    return row?.m ?? 0;
  }
}
