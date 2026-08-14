import { timingSafeEqual, createHash } from 'crypto';
import type { Request, Response, NextFunction } from 'express';
import { logger } from '../../../../utils/logger.js';
import type { AdminSessionStore } from '../AdminSessionStore.js';
import { extractBearerToken } from '../AdminSessionStore.js';
import { isAutoLoginAllowed } from '../middleware.js';
import { SettingsDefaultsManager, type SettingsDefaults } from '../../../../shared/SettingsDefaultsManager.js';
import { USER_SETTINGS_PATH } from '../../../../shared/paths.js';

/**
 * Local auto-login (X-005): loopback callers skip the token requirement
 * unless CLAUDE_MEM_SERVER_LOCAL_AUTO_LOGIN=false. Read fresh per check so
 * flipping the setting takes effect without a worker restart; only invoked
 * on requests that failed every other authenticator.
 *
 * `isAutoLoginAllowed` is the strict part: it rejects the bypass when proxy
 * headers (X-Forwarded-For / X-Real-IP) or a non-loopback Host are present, so
 * a request tunneled/proxied in from outside cannot impersonate a local one.
 *
 * Exported (not just used by `tokenAuth` below) so the report routes' own
 * `authorized()` checks can apply the EXACT same rule — otherwise the stats
 * page's daily/weekly tables would 401 on loopback while the analytics endpoint
 * (which goes through tokenAuth) succeeds. Single source of truth = no drift.
 */
export function loopbackBypassAllowed(req: Request): boolean {
  if (!isAutoLoginAllowed(req)) return false;
  const settings = SettingsDefaultsManager.loadFromFile(USER_SETTINGS_PATH);
  return (settings.CLAUDE_MEM_SERVER_LOCAL_AUTO_LOGIN ?? 'true') !== 'false';
}

/**
 * Shared-access-token middleware for LAN deployments.
 *
 * Simpler than the full ApiKeyAuth / per-user-key system: the server
 * operator sets one shared token in settings, every client presents
 * the same token in the `Authorization: Bearer <token>` header.
 *
 * When the token is empty / unset the middleware is a no-op (allow all).
 * This is the default, keeping backward compatibility.
 *
 * When an `AdminSessionStore` is provided, the middleware also accepts a
 * valid admin session token (obtained via POST /api/admin/login). This
 * allows the viewer UI to reuse its existing login session instead of
 * requiring the user to separately configure the static access token in
 * every browser.
 *
 * Constant-time comparison prevents timing side-channel leakage of the
 * token length / prefix.
 *
 * X-036: 双轨迁移——服务端除明文键 CLAUDE_MEM_SERVER_ACCESS_TOKEN 外新增
 * CLAUDE_MEM_SYNC_SHASUM_VALUE(共享令牌的 sha1 十六进制)。请求头
 * X-Claude-Mem-Auth-Version: 2 走新路径 sha1(presented) 恒时比对哈希;
 * 无该头走老路径明文恒时比对。两键皆空仍为"未配置直通"(调用方处理)。
 */

/** 共享令牌的 sha1 十六进制(与 shasum 命令输出一致, 40 位小写)。 */
export function sha1Hex(value: string): string {
  return createHash('sha1').update(value).digest('hex');
}

/** 服务端令牌鉴权配置(明文 + 哈希双键, trim 后小写归一化哈希)。
 *  settings 可注入(测试); 缺省读 settings.json。 */
export function loadAccessAuth(settings?: SettingsDefaults): { plain: string; shasum: string } {
  try {
    const s = settings ?? SettingsDefaultsManager.loadFromFile(USER_SETTINGS_PATH);
    return {
      plain: (s.CLAUDE_MEM_SERVER_ACCESS_TOKEN ?? '').trim(),
      shasum: (s.CLAUDE_MEM_SYNC_SHASUM_VALUE ?? '').trim().toLowerCase(),
    };
  } catch {
    return { plain: '', shasum: '' };
  }
}

/** 恒时十六进制/ASCII 比对(补齐至 256 字节防长度侧信道)。 */
function timingSafeCompare(a: string, b: string): boolean {
  const MAX = 256;
  const ab = Buffer.alloc(MAX, 0);
  Buffer.from(a.slice(0, MAX), 'ascii').copy(ab);
  const bb = Buffer.alloc(MAX, 0);
  Buffer.from(b.slice(0, MAX), 'ascii').copy(bb);
  return timingSafeEqual(ab, bb);
}

/**
 * 校验携带令牌 (X-036)。两键皆未配置 → false(调用方决定直通语义);
 * 版本头=2 → sha1(presented) 对 CLAUDE_MEM_SYNC_SHASUM_VALUE;
 * 否则 → 明文对 CLAUDE_MEM_SERVER_ACCESS_TOKEN。settings 可注入(测试)。
 */
export function verifyAccessToken(req: Request, presented: string, settings?: SettingsDefaults): boolean {
  const auth = loadAccessAuth(settings);
  if (!auth.plain && !auth.shasum) return false;
  const version = String(req.headers['x-claude-mem-auth-version'] ?? '').trim();
  if (version === '2') {
    if (!auth.shasum) return false;
    return timingSafeCompare(sha1Hex(presented), auth.shasum);
  }
  if (!auth.plain) return false;
  return timingSafeCompare(presented, auth.plain);
}

export function tokenAuth(serverToken: string, adminSessions?: AdminSessionStore) {
  const hasAdminFallback = adminSessions !== undefined;
  const auth = loadAccessAuth();

  // No authenticator configured at all → pass through (standalone / client).
  if (!auth.plain && !auth.shasum && !hasAdminFallback) {
    return (_req: Request, _res: Response, next: NextFunction): void => next();
  }

  return (req: Request, res: Response, next: NextFunction): void => {
    const header = extractBearer(req);
    if (!header) {
      if (loopbackBypassAllowed(req)) {
        next();
        return;
      }
      logger.warn('HTTP', 'tokenAuth: missing Authorization header', {
        path: req.path,
        address: req.socket.remoteAddress ?? '(unknown)',
      });
      res.status(401).json({
        error: 'unauthorized',
        reason: 'missing access token — set Authorization: Bearer <token>',
      });
      return;
    }

    // 1) Try static access token (X-036: 明文/哈希双轨, 恒时比对).
    if (verifyAccessToken(req, header)) {
      next();
      return;
    }

    // 2) Fall back to admin session token (viewer login).
    if (hasAdminFallback && adminSessions!.verify(extractBearerToken(req))) {
      next();
      return;
    }

    // 3) Loopback with a stale/foreign token — still the local operator.
    if (loopbackBypassAllowed(req)) {
      next();
      return;
    }

    logger.warn('HTTP', 'tokenAuth: invalid access token', {
      path: req.path,
      address: req.socket.remoteAddress ?? '(unknown)',
    });
    res.status(401).json({
      error: 'unauthorized',
      reason: 'invalid access token',
    });
  };
}

function extractBearer(req: Request): string | null {
  const header = req.headers['authorization'];
  if (typeof header !== 'string') return null;
  const trimmed = header.trim();
  if (!trimmed.startsWith('Bearer ')) return null;
  const token = trimmed.slice(7).trim();
  if (token.length === 0) return null;
  // Reject unreasonably long tokens before buffer allocation.
  if (token.length > 256) return null;
  return token;
}
