import { describe, it, expect, mock, beforeEach, afterEach, spyOn } from 'bun:test';
import type { Request, Response } from 'express';
import { logger } from '../../../../src/utils/logger.js';

mock.module('../../../../src/shared/paths.js', () => ({
  getPackageRoot: () => '/tmp/test',
  paths: { database: () => '/tmp/test/db.sqlite' },
}));
mock.module('../../../../src/shared/worker-utils.js', () => ({
  getWorkerPort: () => 37777,
}));

import { DataRoutes } from '../../../../src/services/worker/http/routes/DataRoutes.js';
import { AdminSessionStore } from '../../../../src/services/worker/http/AdminSessionStore.js';

let loggerSpies: ReturnType<typeof spyOn>[] = [];

function mockReqRes(id: string, authorization?: string) {
  const jsonSpy = mock(() => {});
  const statusSpy = mock(() => ({ json: jsonSpy }));
  return {
    req: { params: { id }, headers: { authorization }, path: '/test', query: {} } as unknown as Request,
    res: { json: jsonSpy, status: statusSpy } as unknown as Response,
    jsonSpy,
    statusSpy,
  };
}

/** Capture the handler registered for `app.delete(targetPath, handler)`. */
function captureDelete(routes: DataRoutes, targetPath: string): (req: Request, res: Response) => void {
  let handler: ((req: Request, res: Response) => void) | undefined;
  const mockApp: any = {
    get: () => {}, post: () => {}, put: () => {},
    delete: (path: string, h: (req: Request, res: Response) => void) => {
      if (path === targetPath) handler = h;
    },
  };
  routes.setupRoutes(mockApp);
  if (!handler) throw new Error(`No DELETE handler captured for ${targetPath}`);
  return handler;
}

describe('DataRoutes — delete prompt admin gate', () => {
  let deletePromptById: ReturnType<typeof mock>;
  let broadcast: ReturnType<typeof mock>;
  let dbManager: any;
  let sseBroadcaster: any;

  beforeEach(() => {
    loggerSpies = [
      spyOn(logger, 'info').mockImplementation(() => {}),
      spyOn(logger, 'debug').mockImplementation(() => {}),
      spyOn(logger, 'warn').mockImplementation(() => {}),
      spyOn(logger, 'error').mockImplementation(() => {}),
      spyOn(logger, 'failure').mockImplementation(() => {}),
    ];
    deletePromptById = mock(() => true);
    broadcast = mock(() => {});
    dbManager = { getSessionStore: () => ({ deletePromptById }) };
    sseBroadcaster = { broadcast };
  });

  afterEach(() => {
    loggerSpies.forEach(spy => spy.mockRestore());
    mock.restore();
  });

  function makeRoutes(adminSessions: AdminSessionStore, requireAdmin: boolean): DataRoutes {
    return new DataRoutes(
      {} as any, dbManager as any, {} as any, sseBroadcaster as any, {} as any, Date.now(),
      adminSessions, requireAdmin,
    );
  }

  it('server mode: rejects delete with no token (401, no DB write)', () => {
    const handler = captureDelete(makeRoutes(new AdminSessionStore(), true), '/api/prompt/:id');
    const { req, res, statusSpy } = mockReqRes('5');
    handler(req, res);
    expect(statusSpy).toHaveBeenCalledWith(401);
    expect(deletePromptById).not.toHaveBeenCalled();
    expect(broadcast).not.toHaveBeenCalled();
  });

  it('server mode: rejects delete with an invalid token (401)', () => {
    const handler = captureDelete(makeRoutes(new AdminSessionStore(), true), '/api/prompt/:id');
    const { req, res, statusSpy } = mockReqRes('5', 'Bearer bogus');
    handler(req, res);
    expect(statusSpy).toHaveBeenCalledWith(401);
    expect(deletePromptById).not.toHaveBeenCalled();
  });

  it('server mode: allows delete with a valid admin token', () => {
    const sessions = new AdminSessionStore();
    const { token } = sessions.create();
    const handler = captureDelete(makeRoutes(sessions, true), '/api/prompt/:id');
    const { req, res, jsonSpy } = mockReqRes('5', `Bearer ${token}`);
    handler(req, res);
    expect(deletePromptById).toHaveBeenCalledWith(5);
    expect(broadcast).toHaveBeenCalledWith({ type: 'prompt_deleted', id: 5 });
    expect(jsonSpy).toHaveBeenCalledWith({ deleted: true, id: 5 });
  });

  it('client/standalone mode: allows delete without any token', () => {
    const handler = captureDelete(makeRoutes(new AdminSessionStore(), false), '/api/prompt/:id');
    const { req, res, jsonSpy } = mockReqRes('5');
    handler(req, res);
    expect(deletePromptById).toHaveBeenCalledWith(5);
    expect(jsonSpy).toHaveBeenCalledWith({ deleted: true, id: 5 });
  });
});
