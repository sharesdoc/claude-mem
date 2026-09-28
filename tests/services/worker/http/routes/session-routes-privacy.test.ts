import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  mock,
  spyOn,
} from 'bun:test';
import type { Request, Response } from 'express';

import { logger } from '../../../../../src/utils/logger.js';
import { SessionStore } from '../../../../../src/services/sqlite/SessionStore.js';
import { SessionManager } from '../../../../../src/services/worker/SessionManager.js';
import { SessionRoutes } from '../../../../../src/services/worker/http/routes/SessionRoutes.js';

let loggerSpies: ReturnType<typeof spyOn>[] = [];

interface RawUserInputRow {
  tool_input: string | null;
  payload: string | null;
  prompt_number: number | null;
}

function createMockReqRes(body: Record<string, unknown>): {
  req: Partial<Request>;
  res: Partial<Response>;
  jsonSpy: ReturnType<typeof mock>;
  statusSpy: ReturnType<typeof mock>;
} {
  const jsonSpy = mock(() => {});
  const statusSpy = mock(() => ({ json: jsonSpy }));

  return {
    req: {
      body,
      path: '/api/sessions/init',
      query: {},
    } as Partial<Request>,
    res: {
      json: jsonSpy,
      status: statusSpy,
    } as unknown as Partial<Response>,
    jsonSpy,
    statusSpy,
  };
}

function capturePostChain(
  mockApp: any,
  targetPath: string
): (req: Request, res: Response) => Promise<void> {
  let middleware:
    | ((req: Request, res: Response, next: () => void) => unknown)
    | undefined;

  let handler:
    | ((req: Request, res: Response) => unknown)
    | undefined;

  mockApp.post = mock((path: string, ...rest: any[]) => {
    if (path !== targetPath) return;

    if (rest.length === 1) {
      handler = rest[0];
    } else {
      middleware = rest[0];
      handler = rest[1];
    }
  });

  return async (req: Request, res: Response): Promise<void> => {
    if (!handler) {
      throw new Error(`No handler registered for ${targetPath}`);
    }

    if (!middleware) {
      await handler(req, res);
      return;
    }

    let nextCalled = false;

    await middleware(req, res, () => {
      nextCalled = true;
    });

    if (nextCalled) {
      await handler(req, res);
    }
  };
}

describe('SessionRoutes — raw_events privacy regression (Issue-20260928164327193-P0)', () => {
  let store: SessionStore;
  let sessionManager: SessionManager;
  let routes: SessionRoutes;
  let runSessionInit: (req: Request, res: Response) => Promise<void>;

  beforeEach(() => {
    loggerSpies = [
      spyOn(logger, 'info').mockImplementation(() => {}),
      spyOn(logger, 'debug').mockImplementation(() => {}),
      spyOn(logger, 'warn').mockImplementation(() => {}),
      spyOn(logger, 'error').mockImplementation(() => {}),
      spyOn(logger, 'failure').mockImplementation(() => {}),
    ];

    store = new SessionStore(':memory:');

    const dbManager = {
      getSessionStore: () => store,
      getSessionById: (sessionDbId: number) => {
        const session = store.getSessionById(sessionDbId);
        if (!session) {
          throw new Error(`Session ${sessionDbId} not found`);
        }
        return session;
      },
    };

    sessionManager = new SessionManager(dbManager as any);

    routes = new SessionRoutes(
      sessionManager,
      dbManager as any,
      {} as any, // sdkAgent
      {} as any, // geminiAgent
      {} as any, // openRouterAgent
      {} as any, // qwenAgent
      {} as any, // deepSeekAgent
      {} as any, // eventBroadcaster
      {} as any, // workerService
      {} as any, // completionHandler
    );

    const mockApp: any = {
      post: mock(() => {}),
      get: mock(() => {}),
      delete: mock(() => {}),
      use: mock(() => {}),
    };

    runSessionInit = capturePostChain(mockApp, '/api/sessions/init');
    routes.setupRoutes(mockApp as any);
  });

  afterEach(() => {
    store.close();
    loggerSpies.forEach(spy => spy.mockRestore());
    mock.restore();
  });

  function getRawUserInputRows(
    contentSessionId: string
  ): RawUserInputRow[] {
    return store.db.query(`
      SELECT tool_input, payload, prompt_number
      FROM raw_events
      WHERE content_session_id = ?
        AND event_type = 'user_input'
      ORDER BY id
    `).all(contentSessionId) as RawUserInputRow[];
  }

  it('does not persist fully-private prompt plaintext into raw_events', async () => {
    const contentSessionId = 'privacy-fully-private';
    const secret = '敏感数据ABC123';
    const prompt = `<private>${secret}</private>`;

    const { req, res, jsonSpy } = createMockReqRes({
      contentSessionId,
      project: 'privacy-test',
      prompt,
    });

    await runSessionInit(req as Request, res as Response);

    expect(jsonSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        skipped: true,
        reason: 'private',
      })
    );

    const rows = getRawUserInputRows(contentSessionId);

    expect(rows).toHaveLength(1);

    // Entire prompt is private, therefore the archival representation
    // must contain no user-visible content.
    expect(rows[0].tool_input).toBe('');
    expect(rows[0].payload).toBe('');

    const serialized = JSON.stringify(rows);
    expect(serialized).not.toContain(secret);
    expect(serialized).not.toContain('<private>');
  });

  it('does not persist fully-private prompt plaintext into sdk_sessions.user_prompt', async () => {
    const contentSessionId = 'privacy-sdk-session-fully-private';
    const secret = 'SDK_SESSION_SECRET_ABC123';
    const prompt = `<private>${secret}</private>`;

    const { req, res, jsonSpy } = createMockReqRes({
      contentSessionId,
      project: 'privacy-test',
      prompt,
    });

    await runSessionInit(req as Request, res as Response);

    expect(jsonSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        skipped: true,
        reason: 'private',
      })
    );

    const row = store.db.query(`
      SELECT user_prompt
      FROM sdk_sessions
      WHERE content_session_id = ?
    `).get(contentSessionId) as { user_prompt: string | null } | null;

    expect(row).not.toBeNull();
    expect(row?.user_prompt).toBe('');
    expect(row?.user_prompt).not.toContain(secret);
    expect(row?.user_prompt).not.toContain('<private>');
  });

  it('archives cleanedPrompt, not raw prompt, when dedupe branch is hit', async () => {
    const contentSessionId = 'privacy-deduplicated';
    const visiblePrompt = 'Repeated prompt';
    const secret = 'SECRET_DUPLICATE_ABC123';

    // Seed the prompt that the cleaned second request must match.
    store.createSDKSession(
      contentSessionId,
      'privacy-test',
      visiblePrompt
    );
    store.saveUserPrompt(
      contentSessionId,
      1,
      visiblePrompt
    );

    // raw prompt differs from cleanedPrompt:
    //
    // raw:
    //   <private>SECRET_DUPLICATE_ABC123</private>Repeated prompt
    //
    // cleaned:
    //   Repeated prompt
    //
    // This is important: a plain duplicate where prompt === cleanedPrompt
    // would pass both before and after the production fix and therefore
    // would not protect line 528 against regression.
    const rawPrompt =
      `<private>${secret}</private>${visiblePrompt}`;

    const { req, res, jsonSpy } = createMockReqRes({
      contentSessionId,
      project: 'privacy-test',
      prompt: rawPrompt,
    });

    await runSessionInit(req as Request, res as Response);

    expect(jsonSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        skipped: true,
        reason: 'duplicate',
        promptNumber: 1,
      })
    );

    const rows = getRawUserInputRows(contentSessionId);

    expect(rows).toHaveLength(1);

    expect(rows[0].prompt_number).toBe(1);
    expect(rows[0].tool_input).toBe(visiblePrompt);
    expect(rows[0].payload).toBe(visiblePrompt);

    const serialized = JSON.stringify(rows);
    expect(serialized).not.toContain(secret);
    expect(serialized).not.toContain('<private>');
  });
});
