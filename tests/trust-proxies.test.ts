import { describe, it, expect } from 'bun:test';
import { trustProxies } from '../src/services/worker/http/middleware/trustProxies.js';
import type { Request, Response, NextFunction } from 'express';

/**
 * T-11 — socket-level CIDR allow list.
 */

function mockReq(remote: string | undefined, path = '/api/sync/ingest'): Request {
  return {
    path,
    socket: { remoteAddress: remote } as unknown as Request['socket'],
  } as unknown as Request;
}

function mockRes(): { res: Response; capture: { status: number | null; body: unknown } } {
  const capture = { status: null as number | null, body: null as unknown };
  const res = {
    status(code: number) { capture.status = code; return this; },
    json(payload: unknown) { capture.body = payload; return this; },
  } as unknown as Response;
  return { res, capture };
}

async function run(allow: string, remote: string | undefined): Promise<{ called: boolean; capture: { status: number | null; body: unknown } }> {
  const mw = trustProxies(allow);
  const { res, capture } = mockRes();
  let called = false;
  const next: NextFunction = () => { called = true; };
  await mw(mockReq(remote), res, next);
  return { called, capture };
}

describe('trustProxies', () => {
  it('allows all when csv is empty', async () => {
    const r = await run('', '203.0.113.50');
    expect(r.called).toBe(true);
    expect(r.capture.status).toBeNull();
  });

  it('admits CIDR-matched IPv4', async () => {
    const r = await run('127.0.0.1/32, 10.0.0.0/8', '10.5.4.3');
    expect(r.called).toBe(true);
  });

  it('rejects with 403 when not in list', async () => {
    const r = await run('127.0.0.1/32', '8.8.8.8');
    expect(r.called).toBe(false);
    expect(r.capture.status).toBe(403);
  });

  it('strips IPv6-mapped IPv4 prefix', async () => {
    const r = await run('127.0.0.1/32', '::ffff:127.0.0.1');
    expect(r.called).toBe(true);
  });

  it('admits exact IPv4 (no /mask) when bare entry given', async () => {
    const r = await run('127.0.0.1', '127.0.0.1');
    expect(r.called).toBe(true);
  });

  it('admits IPv6 loopback when allowed', async () => {
    const r = await run('::1/128', '::1');
    expect(r.called).toBe(true);
  });

  it('rejects when remote address is missing', async () => {
    const r = await run('127.0.0.1/32', undefined);
    expect(r.called).toBe(false);
    expect(r.capture.status).toBe(403);
  });

  it('silently skips unparseable entries in the csv', async () => {
    const r = await run('not-an-ip, 127.0.0.1/32, /99', '127.0.0.1');
    expect(r.called).toBe(true);
  });
});
