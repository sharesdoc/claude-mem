
import { describe, it, expect, mock, beforeEach, afterEach, spyOn } from 'bun:test';
import type { Request, Response } from 'express';
import { logger } from '../../../../src/utils/logger.js';

const generateContextStub = mock(async () => 'CONTEXT_FROM_GENERATOR');
mock.module('../../../../src/services/context-generator.js', () => ({
  generateContext: generateContextStub,
}));

// Controlled settings mock — tests can toggle welcomeHintEnabled per-test.
let welcomeHintEnabled = 'true';
mock.module('../../../../src/shared/SettingsDefaultsManager.js', () => ({
  SettingsDefaultsManager: {
    loadFromFile: () => ({ CLAUDE_MEM_WELCOME_HINT_ENABLED: welcomeHintEnabled, CLAUDE_MEM_WORKER_PORT: '37777' }),
  },
}));

import { SearchRoutes, resetSettingsCache } from '../../../../src/services/worker/http/routes/SearchRoutes.js';

let loggerSpies: ReturnType<typeof spyOn>[] = [];

interface MockRes {
  setHeader: ReturnType<typeof mock>;
  send: ReturnType<typeof mock>;
  status: ReturnType<typeof mock>;
  json: ReturnType<typeof mock>;
  headersSent: boolean;
}

function createMockRes(): MockRes {
  const res: MockRes = {
    setHeader: mock(() => {}),
    send: mock(() => {}),
    status: mock(() => res as any),
    json: mock(() => {}),
    headersSent: false,
  };
  return res;
}

function captureContextInjectHandler(routes: SearchRoutes): (req: Request, res: Response) => void {
  let captured: ((req: Request, res: Response) => void) | undefined;
  const mockApp: any = {
    get: mock((path: string, handler: (req: Request, res: Response) => void) => {
      if (path === '/api/context/inject') {
        captured = handler;
      }
    }),
    post: mock(() => {}),
    delete: mock(() => {}),
    use: mock(() => {}),
  };
  routes.setupRoutes(mockApp);
  if (!captured) throw new Error('Failed to capture /api/context/inject handler');
  return captured;
}

describe('SearchRoutes Welcome Hint', () => {
  let countQueryStub: ReturnType<typeof mock>;
  let prepareStub: ReturnType<typeof mock>;
  let mockSessionStore: any;
  let mockSearchManager: any;

  beforeEach(() => {
    loggerSpies = [
      spyOn(logger, 'info').mockImplementation(() => {}),
      spyOn(logger, 'debug').mockImplementation(() => {}),
      spyOn(logger, 'warn').mockImplementation(() => {}),
      spyOn(logger, 'error').mockImplementation(() => {}),
      spyOn(logger, 'failure').mockImplementation(() => {}),
    ];

    countQueryStub = mock(() => ({ count: 0 }));
    prepareStub = mock(() => ({ get: countQueryStub }));
    mockSessionStore = { db: { prepare: prepareStub } };
    mockSearchManager = {
      getSessionStore: () => mockSessionStore,
    };

    generateContextStub.mockClear();
    welcomeHintEnabled = 'true';
    resetSettingsCache();
  });

  afterEach(() => {
    loggerSpies.forEach(spy => spy.mockRestore());
  });

  it('returns the welcome hint when project has zero observations', async () => {
    const routes = new SearchRoutes(mockSearchManager);
    const handler = captureContextInjectHandler(routes);

    const res = createMockRes();
    const req = { query: { projects: '/path/to/empty-project' } } as unknown as Request;

    handler(req, res as unknown as Response);
    await new Promise(resolve => setImmediate(resolve));

    expect(res.send).toHaveBeenCalledTimes(1);
    const body = (res.send as any).mock.calls[0][0] as string;
    expect(body).toContain('# claude-mem status');
    expect(body).toContain('/learn-codebase');
    expect(body).toContain('http://localhost:');
    expect(body).toContain('Memory injection starts on your second session in a project.');
    expect(body).toContain('disappears once the first observation lands');
    expect(body).not.toContain('Welcome');
    expect(generateContextStub).not.toHaveBeenCalled();
  });

  it('skips the welcome hint when at least one observation exists', async () => {
    countQueryStub = mock(() => ({ count: 7 }));
    prepareStub = mock(() => ({ get: countQueryStub }));
    mockSessionStore = { db: { prepare: prepareStub } };
    mockSearchManager = { getSessionStore: () => mockSessionStore };

    const routes = new SearchRoutes(mockSearchManager);
    const handler = captureContextInjectHandler(routes);

    const res = createMockRes();
    const req = { query: { projects: '/path/to/active-project' } } as unknown as Request;

    handler(req, res as unknown as Response);
    await new Promise(resolve => setImmediate(resolve));

    expect(generateContextStub).toHaveBeenCalledTimes(1);
    expect(res.send).toHaveBeenCalledWith('CONTEXT_FROM_GENERATOR');
  });

  it('skips the welcome hint when CLAUDE_MEM_WELCOME_HINT_ENABLED=false', async () => {
    welcomeHintEnabled = 'false';
    resetSettingsCache();

    const routes = new SearchRoutes(mockSearchManager);
    const handler = captureContextInjectHandler(routes);

    const res = createMockRes();
    const req = { query: { projects: '/path/to/empty-project' } } as unknown as Request;

    handler(req, res as unknown as Response);
    await new Promise(resolve => setImmediate(resolve));

    expect(generateContextStub).toHaveBeenCalledTimes(1);
    expect(res.send).toHaveBeenCalledWith('CONTEXT_FROM_GENERATOR');
  });

  it('queries both projects in a worktree (multi-project) request', async () => {
    const routes = new SearchRoutes(mockSearchManager);
    const handler = captureContextInjectHandler(routes);

    const res = createMockRes();
    const req = { query: { projects: 'parent-id,worktree-id' } } as unknown as Request;

    handler(req, res as unknown as Response);
    await new Promise(resolve => setImmediate(resolve));

    expect(res.send).toHaveBeenCalledTimes(1);
    expect(countQueryStub).toHaveBeenCalledWith(
      'parent-id',
      'worktree-id',
      'parent-id',
      'worktree-id',
    );
  });

  it('preserves commas inside a single project parameter that looks like a path', async () => {
    const routes = new SearchRoutes(mockSearchManager);
    const handler = captureContextInjectHandler(routes);

    const res = createMockRes();
    const req = { query: { projects: '/tmp/a,b/main' } } as unknown as Request;

    handler(req, res as unknown as Response);
    await new Promise(resolve => setImmediate(resolve));

    expect(res.send).toHaveBeenCalledTimes(1);
    expect(countQueryStub).toHaveBeenCalledWith(
      '/tmp/a,b/main',
      '/tmp/a,b/main',
    );
  });

  it('preserves commas inside repeated project parameters', async () => {
    const routes = new SearchRoutes(mockSearchManager);
    const handler = captureContextInjectHandler(routes);

    const res = createMockRes();
    const req = { query: { projects: ['/tmp/a,b/main', '/tmp/a,b/worktree'] } } as unknown as Request;

    handler(req, res as unknown as Response);
    await new Promise(resolve => setImmediate(resolve));

    expect(res.send).toHaveBeenCalledTimes(1);
    expect(countQueryStub).toHaveBeenCalledWith(
      '/tmp/a,b/main',
      '/tmp/a,b/worktree',
      '/tmp/a,b/main',
      '/tmp/a,b/worktree',
    );
  });
});
