import { describe, it, expect } from 'bun:test';
import { tokenAuth } from '../src/services/worker/http/middleware/tokenAuth.js';
import type { Request, Response, NextFunction } from 'express';

function mockReq(headers: Record<string, string | string[]> = {}, remote = '127.0.0.1'): Request {
  return {
    path: '/api/sync/ingest',
    headers,
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

async function run(token: string, auth: string | undefined): Promise<{ called: boolean; status: number | null }> {
  const mw = tokenAuth(token);
  const { res, capture } = mockRes();
  let called = false;
  const next: NextFunction = () => { called = true; };
  await mw(mockReq(auth ? { authorization: auth } : {}), res, next);
  return { called, status: capture.status };
}

describe('tokenAuth', () => {
  it('allows all when server token is empty', async () => {
    const r = await run('', undefined);
    expect(r.called).toBe(true);
    expect(r.status).toBeNull();
  });

  it('rejects missing Authorization header when token is set', async () => {
    const r = await run('secret', undefined);
    expect(r.called).toBe(false);
    expect(r.status).toBe(401);
  });

  it('allows request with correct Bearer token', async () => {
    const r = await run('secret', 'Bearer secret');
    expect(r.called).toBe(true);
  });

  it('rejects wrong token', async () => {
    const r = await run('secret', 'Bearer wrong');
    expect(r.called).toBe(false);
    expect(r.status).toBe(401);
  });

  it('rejects non-Bearer auth header', async () => {
    const r = await run('secret', 'Basic dGVzdDp0ZXN0');
    expect(r.called).toBe(false);
    expect(r.status).toBe(401);
  });

  it('ignores token when whitespace-only', async () => {
    const r = await run('   ', undefined);
    expect(r.called).toBe(true);
  });
});
