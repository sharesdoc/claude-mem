import { describe, expect, it, mock } from 'bun:test';
import type { ActiveSession } from '../../../src/services/worker-types.js';
import { handleGeneratorExit } from '../../../src/services/worker/session/GeneratorExitHandler.js';
import { ClaudeMemDatabase } from '../../../src/services/sqlite/Database.js';
import { SessionStore } from '../../../src/services/sqlite/SessionStore.js';
import { SessionManager } from '../../../src/services/worker/SessionManager.js';

function createSession(): ActiveSession {
  return {
    sessionDbId: 42,
    contentSessionId: 'content-42',
    memorySessionId: 'memory-42',
    project: 'test-project',
    platformSource: 'claude-code',
    userPrompt: 'test',
    pendingMessages: [],
    abortController: new AbortController(),
    generatorPromise: Promise.resolve(),
    lastPromptNumber: 1,
    startTime: Date.now(),
    cumulativeInputTokens: 0,
    cumulativeOutputTokens: 0,
    earliestPendingTimestamp: null,
    conversationHistory: [],
    currentProvider: 'claude',
    consecutiveRestarts: 0,
    lastGeneratorActivity: Date.now(),
  };
}

function createDeps(pendingCount = 3) {
  const pendingStore = {
    clearPendingForSession: mock(() => undefined),
    getPendingCount: mock(() => pendingCount),
    resetProcessingToPending: mock(() => 0),
  };
  const sessionManager = {
    getPendingMessageStore: mock(() => pendingStore),
    removeSessionImmediate: mock(() => undefined),
    // Issue-20260928164327246-P1: natural-completion path now flushes the
    // final open input round before inspecting pending work. Defaults to a
    // no-op (0 = no open round) so existing pendingCount-driven tests keep
    // their original meaning unless a test overrides this mock.
    flushInputRound: mock(async () => 0),
  };
  const completionHandler = {
    finalizeSession: mock(() => undefined),
  };
  const restartGenerator = mock(() => undefined);

  return {
    pendingStore,
    sessionManager,
    completionHandler,
    restartGenerator,
    deps: {
      sessionManager: sessionManager as any,
      completionHandler: completionHandler as any,
      restartGenerator,
    },
  };
}

describe('handleGeneratorExit hard-stop reasons', () => {
  it('does not restart pending work after context overflow', async () => {
    const session = createSession();
    const { deps, pendingStore, completionHandler, sessionManager, restartGenerator } = createDeps();

    await handleGeneratorExit(session, 'overflow', deps);

    expect(pendingStore.clearPendingForSession).toHaveBeenCalledWith(42);
    expect(completionHandler.finalizeSession).toHaveBeenCalledWith(42);
    expect(sessionManager.removeSessionImmediate).toHaveBeenCalledWith(42);
    expect(pendingStore.getPendingCount).not.toHaveBeenCalled();
    expect(restartGenerator).not.toHaveBeenCalled();
  });

  it('does not restart pending work while quota guard is active', async () => {
    const session = createSession();
    const { deps, pendingStore, completionHandler, sessionManager, restartGenerator } = createDeps();

    await handleGeneratorExit(session, 'quota:hourly', deps);

    expect(pendingStore.clearPendingForSession).toHaveBeenCalledWith(42);
    expect(completionHandler.finalizeSession).toHaveBeenCalledWith(42);
    expect(sessionManager.removeSessionImmediate).toHaveBeenCalledWith(42);
    expect(pendingStore.getPendingCount).not.toHaveBeenCalled();
    expect(restartGenerator).not.toHaveBeenCalled();
  });

  it('removes hard-stopped sessions even when pending cleanup fails', async () => {
    const session = createSession();
    const { deps, pendingStore, completionHandler, sessionManager, restartGenerator } = createDeps();
    pendingStore.clearPendingForSession.mockImplementation(() => {
      throw new Error('simulated pending cleanup failure');
    });

    await handleGeneratorExit(session, 'overflow', deps);

    expect(pendingStore.clearPendingForSession).toHaveBeenCalledWith(42);
    expect(completionHandler.finalizeSession).toHaveBeenCalledWith(42);
    expect(sessionManager.removeSessionImmediate).toHaveBeenCalledWith(42);
    expect(pendingStore.getPendingCount).not.toHaveBeenCalled();
    expect(restartGenerator).not.toHaveBeenCalled();
  });

  it('removes hard-stopped sessions even when finalization fails', async () => {
    const session = createSession();
    const { deps, pendingStore, completionHandler, sessionManager, restartGenerator } = createDeps();
    completionHandler.finalizeSession.mockImplementation(() => {
      throw new Error('simulated finalization failure');
    });

    await handleGeneratorExit(session, 'quota', deps);

    expect(pendingStore.clearPendingForSession).toHaveBeenCalledWith(42);
    expect(completionHandler.finalizeSession).toHaveBeenCalledWith(42);
    expect(sessionManager.removeSessionImmediate).toHaveBeenCalledWith(42);
    expect(pendingStore.getPendingCount).not.toHaveBeenCalled();
    expect(restartGenerator).not.toHaveBeenCalled();
  });

  it('removes naturally completed sessions even when finalization fails', async () => {
    const session = createSession();
    const { deps, pendingStore, completionHandler, sessionManager, restartGenerator } = createDeps(0);
    completionHandler.finalizeSession.mockImplementation(() => {
      throw new Error('simulated finalization failure');
    });

    await handleGeneratorExit(session, 'idle', deps);

    expect(pendingStore.clearPendingForSession).not.toHaveBeenCalled();
    expect(completionHandler.finalizeSession).toHaveBeenCalledWith(42);
    expect(sessionManager.removeSessionImmediate).toHaveBeenCalledWith(42);
    expect(restartGenerator).not.toHaveBeenCalled();
  });

  it('keeps the active session paused after provider unavailability', async () => {
    const session = createSession();
    const { deps, pendingStore, completionHandler, sessionManager, restartGenerator } = createDeps();

    await handleGeneratorExit(session, 'provider-unavailable', deps);

    expect(pendingStore.resetProcessingToPending).toHaveBeenCalledWith(42);
    expect(session.recoveryPending).toBe(true);
    expect(completionHandler.finalizeSession).not.toHaveBeenCalled();
    expect(sessionManager.removeSessionImmediate).not.toHaveBeenCalled();
    expect(restartGenerator).not.toHaveBeenCalled();
  });
});

// Issue-20260928164327246-P1: a session that ends "naturally" (idle / no
// error) used to be judged safe to finalize using a pendingCount read taken
// BEFORE the final open input round was flushed into queue work. That flush
// only happened later, inside finalizeSession(), by which point the session
// was about to be removed from memory with nobody left to consume the newly
// queued work — an orphaned round slice that would never be processed.
describe('handleGeneratorExit natural completion pre-flushes the final input round', () => {
  it('flushes the final input round before checking pending work on natural exit', async () => {
    const session = createSession();
    const { deps, sessionManager, pendingStore } = createDeps(1);
    const calls: string[] = [];

    sessionManager.flushInputRound.mockImplementation(async () => {
      calls.push('flush');
      return 1;
    });
    pendingStore.getPendingCount.mockImplementation(async () => {
      calls.push('pending-count');
      return 1;
    });

    await handleGeneratorExit(session, 'idle', deps);

    expect(calls.slice(0, 2)).toEqual(['flush', 'pending-count']);

    // Cleanup: a restart was scheduled because pendingCount > 0; clear the
    // backoff timer so it cannot fire after this test completes.
    if (session.respawnTimer) {
      clearTimeout(session.respawnTimer);
      session.respawnTimer = undefined;
    }
  });

  it('schedules a generator restart instead of finalizing when the flush surfaces new pending work', async () => {
    const session = createSession();
    // getPendingCount alone reports 0 (matching the pre-fix bug scenario:
    // the round had not been flushed yet), but flushInputRound() finds an
    // open round, closes it, and enqueues one new round-slice task.
    const { deps, sessionManager, pendingStore, completionHandler } = createDeps(0);
    sessionManager.flushInputRound.mockImplementation(async () => {
      pendingStore.getPendingCount.mockImplementation(async () => 1);
      return 1;
    });

    await handleGeneratorExit(session, 'idle', deps);

    // The freshly-flushed work must route through the existing "pending > 0"
    // restart-with-backoff branch, not straight to finalize/remove.
    expect(completionHandler.finalizeSession).not.toHaveBeenCalled();
    expect(sessionManager.removeSessionImmediate).not.toHaveBeenCalled();
    expect(session.respawnTimer).toBeDefined();

    if (session.respawnTimer) {
      clearTimeout(session.respawnTimer);
      session.respawnTimer = undefined;
    }
  });

  it('still finalizes immediately when there is no open round and no pending work', async () => {
    const session = createSession();
    const { deps, sessionManager, completionHandler, pendingStore } = createDeps(0);

    await handleGeneratorExit(session, 'idle', deps);

    expect(sessionManager.flushInputRound).toHaveBeenCalledWith(42);
    expect(pendingStore.getPendingCount).toHaveBeenCalledWith(42);
    expect(completionHandler.finalizeSession).toHaveBeenCalledWith(42);
    expect(session.respawnTimer).toBeUndefined();
  });
});

// Issue-20260928164327246-P1 real-link regression: drives handleGeneratorExit
// with a real SQLite-backed SessionManager so the final round is actually
// closed, sliced, and queued — not just a mocked function call — proving the
// orphaned-slice bug is fixed at the storage layer, not only in call order.
describe('handleGeneratorExit real SessionManager integration', () => {
  it('flushing the final open round during natural exit actually enqueues its slice for a consumer to claim', async () => {
    const db = new ClaudeMemDatabase(':memory:').db;
    const store = new SessionStore(db);
    const dbManager = {
      getSessionStore: () => store,
      getSessionById: (sessionDbId: number) => {
        const dbSession = store.getSessionById(sessionDbId);
        if (!dbSession) throw new Error(`Session ${sessionDbId} not found`);
        return dbSession;
      },
    } as any;
    const manager = new SessionManager(dbManager);

    try {
      const sessionDbId = store.createSDKSession('natural-final-round', 'test-project', 'final prompt');
      const session = manager.initializeSession(sessionDbId, 'final prompt', 1);

      // Open the input round for prompt #1, then queue an observation while
      // it is still open — production code holds it back (not queued yet)
      // until the round closes.
      manager.beginInputRound(sessionDbId, 1, 'final prompt');
      await manager.queueObservation(sessionDbId, {
        tool_name: 'Read',
        tool_input: { path: '/tmp/final.txt' },
        tool_response: { content: 'final-round-content' },
        prompt_number: 1,
        toolUseId: 'final-round-tool',
      });

      expect(
        db.prepare(`SELECT status FROM input_rounds WHERE content_session_id = ? AND prompt_number = 1`)
          .get('natural-final-round')
      ).toEqual({ status: 'open' });
      expect(await manager.getPendingMessageStore().getPendingCount(sessionDbId)).toBe(0);

      const completionHandler = {
        finalizeSession: mock(() => undefined),
      };
      const restartGenerator = mock(() => undefined);
      const deps = {
        sessionManager: manager as any,
        completionHandler: completionHandler as any,
        restartGenerator,
      };

      // Simulate the generator exiting naturally before prompt #1's round
      // has been explicitly closed by a follow-up prompt or session end.
      await handleGeneratorExit(session, 'idle', deps);

      // The bug: pre-fix, this would already be 'finalize/remove' with the
      // round slice never created. Post-fix, the round must be closed and
      // sliced, and the slice must be claimable by a real consumer.
      const round = db.prepare(`SELECT status FROM input_rounds WHERE content_session_id = ? AND prompt_number = 1`)
        .get('natural-final-round');
      expect(round).toEqual({ status: 'closed' });

      expect(await manager.getPendingMessageStore().getPendingCount(sessionDbId)).toBe(1);

      const iterator = manager.getMessageIterator(sessionDbId);
      const next = await iterator.next();
      expect(next.done).toBe(false);
      expect(next.value?.roundSlice).toEqual(
        expect.objectContaining({ promptNumber: 1, sliceNumber: 1 })
      );
      await iterator.return?.();

      if (session.respawnTimer) {
        clearTimeout(session.respawnTimer);
        session.respawnTimer = undefined;
      }
    } finally {
      await manager.shutdownAll();
      db.close();
    }
  });
});
