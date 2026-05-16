import { BlockList, isIPv4, isIPv6 } from 'net';
import type { Request, Response, NextFunction } from 'express';
import { logger } from '../../../../utils/logger.js';

/**
 * T-11 — trustProxies middleware.
 *
 * Server-mode perimeter check: only sources whose socket-level remote
 * address falls inside `CLAUDE_MEM_SERVER_TRUSTED_PROXIES` may POST to
 * the sync ingest route. Empty / unset config = allow all (back-compat
 * + dev convenience; T-12 still gates by user_label).
 *
 * Deliberately ignores `X-Forwarded-For` — that header is trivially
 * forgeable. The expected deployment is nginx + frpc terminating on the
 * same host, so the socket peer is always 127.0.0.1 from the worker's
 * point of view; spoofed XFF cannot raise an attacker's privilege.
 */
export function trustProxies(allowedCsv: string) {
  const list = compileBlockList(allowedCsv);

  return (req: Request, res: Response, next: NextFunction): void => {
    if (list === null) {
      // No config -> allow all. Logged at DEBUG for observability.
      logger.debug('HTTP', 'trustProxies: no allow list configured, accepting request');
      next();
      return;
    }

    const remote = normaliseAddress(req.socket.remoteAddress ?? '');
    if (!remote) {
      logger.warn('HTTP', 'trustProxies: request has no socket remote address, rejecting', { path: req.path });
      res.status(403).json({ error: 'forbidden', reason: 'untrusted_proxy', address: null });
      return;
    }

    const family = isIPv6(remote) ? 'ipv6' : isIPv4(remote) ? 'ipv4' : null;
    if (!family) {
      logger.warn('HTTP', 'trustProxies: unparseable remote address', { path: req.path, address: remote });
      res.status(403).json({ error: 'forbidden', reason: 'untrusted_proxy', address: remote });
      return;
    }

    if (list.check(remote, family)) {
      next();
      return;
    }

    logger.warn('HTTP', 'trustProxies: rejecting request from untrusted source', { path: req.path, address: remote });
    res.status(403).json({ error: 'forbidden', reason: 'untrusted_proxy', address: remote });
  };
}

/**
 * Compile the csv into a Node net.BlockList. Returns null when the csv
 * is empty (= "no filtering").
 *
 * Accepts CIDR notation (`127.0.0.1/32`, `::1/128`) and bare addresses
 * (treated as /32 v4 or /128 v6).
 */
function compileBlockList(raw: string): BlockList | null {
  const entries = (raw ?? '').split(',').map(s => s.trim()).filter(Boolean);
  if (entries.length === 0) return null;

  const list = new BlockList();
  for (const entry of entries) {
    try {
      const [addr, maskRaw] = entry.split('/');
      const ip = normaliseAddress(addr);
      if (!ip) {
        logger.warn('HTTP', 'trustProxies: skipping unparseable entry', { entry });
        continue;
      }
      const family = isIPv6(ip) ? 'ipv6' : 'ipv4';
      if (maskRaw) {
        const mask = Number.parseInt(maskRaw, 10);
        if (!Number.isFinite(mask)) {
          logger.warn('HTTP', 'trustProxies: skipping entry with bad mask', { entry });
          continue;
        }
        list.addSubnet(ip, mask, family);
      } else {
        list.addAddress(ip, family);
      }
    } catch (err: unknown) {
      logger.warn(
        'HTTP',
        'trustProxies: failed to compile entry',
        { entry },
        err instanceof Error ? err : new Error(String(err)),
      );
    }
  }
  return list;
}

function normaliseAddress(addr: string): string | null {
  if (!addr) return null;
  // Express returns IPv6-mapped IPv4 as `::ffff:1.2.3.4` for v4 sockets.
  // Strip the prefix so the BlockList match uses the v4 family.
  const trimmed = addr.startsWith('::ffff:') ? addr.slice(7) : addr;
  if (isIPv4(trimmed) || isIPv6(trimmed)) return trimmed;
  return null;
}
