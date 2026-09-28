
import { describe, it, expect, mock, spyOn } from 'bun:test';
import type { Database } from 'bun:sqlite';

// 必须在 import ClaudeProvider（经 SessionRoutes.ts 间接引入）之前 mock，
// 避免测试环境里真的去查找/校验 claude 可执行文件
// （findClaudeExecutable 在 startSession 里先于模型名校验执行）。
mock.module('../../../../../src/shared/find-claude-executable.js', () => ({
  findClaudeExecutable: () => '/usr/bin/claude',
}));

import { SessionRoutes } from '../../../../../src/services/worker/http/routes/SessionRoutes.js';
import { ClaudeProvider } from '../../../../../src/services/worker/ClaudeProvider.js';
import { SettingsDefaultsManager, type SettingsDefaults } from '../../../../../src/shared/SettingsDefaultsManager.js';
import { paths } from '../../../../../src/shared/paths.js';
import type { DatabaseManager } from '../../../../../src/services/worker/DatabaseManager.js';
import type { SessionManager } from '../../../../../src/services/worker/SessionManager.js';
import { ClaudeMemDatabase } from '../../../../../src/services/sqlite/Database.js';
import { SessionStore } from '../../../../../src/services/sqlite/SessionStore.js';
import {
  SqliteObservationQueueEngine,
  type InspectableObservationQueueEngine,
} from '../../../../../src/server/queue/ObservationQueueEngine.js';
import { BullMqObservationQueueEngine } from '../../../../../src/server/queue/BullMqObservationQueueEngine.js';

// 依据: doc/rev-report-20260927102826977.md R-001（用户裁决：tier routing 也纳入
// "未显式配置不回落默认值"新规则，CLAUDE_MEM_TIER_SIMPLE_MODEL 出厂默认值清零）。
//
// 本测试贯穿真实调用链——先走 SessionRoutes.applyTierRouting() 真实逻辑（而非直接
// 构造 session.modelOverride），再调用 ClaudeProvider.startSession()——验证零配置
// 场景下 pending 消息全为简单只读工具时，tier routing 不会再用出厂默认 'haiku' 短路
// 掉 ClaudeProvider 的模型名判空校验。这正是三轮独立验证从未覆盖到的调用链缺口。
//
// lastPromptNumber=1 时 targetPrompt=0，applyTierRouting() 根本不会调用
// peekPendingTypesForRound（见 SessionRoutes.ts 的 `targetPrompt > 0` 短路判断），
// 所以这里的 fakePendingStore 不需要实现该方法即可验证"零配置不短路模型判空"。
describe('SessionRoutes.applyTierRouting -> ClaudeProvider.startSession real call chain (rev-report R-001)', () => {
  it('should still throw "Claude model not configured" when pending messages are all simple read-only tools and CLAUDE_MEM_TIER_SIMPLE_MODEL default is cleared', async () => {
    // 零配置基线：CLAUDE_MEM_MODEL 为空、CLAUDE_MEM_TIER_ROUTING_ENABLED 保持出厂默认
    // 'true'、CLAUDE_MEM_TIER_SIMPLE_MODEL 为裁决后清零的新默认值 ''。
    const settings = {
      CLAUDE_MEM_MODEL: '',
      CLAUDE_MEM_TIER_ROUTING_ENABLED: 'true',
      CLAUDE_MEM_TIER_SIMPLE_MODEL: '',
      CLAUDE_MEM_TIER_SUMMARY_MODEL: '',
    } as unknown as SettingsDefaults;
    const loadFromFileSpy = spyOn(SettingsDefaultsManager, 'loadFromFile').mockImplementation(() => settings);

    // 见 tests/services/worker/claude-provider-model-config.test.ts 的同类自愈说明：
    // 防止其它并发测试文件残留的 paths 污染导致 getModelId() 在到达 loadFromFile
    // 之前先抛 "paths.settings is not a function"。
    const originalSettingsFn = (paths as { settings?: () => string }).settings;
    (paths as { settings: () => string }).settings = () => '/tmp/claude-mem-test-settings.json';

    try {
      const fakePendingStore = {
        peekPendingTypes: async () => [
          { message_type: 'observation', tool_name: 'Read' },
          { message_type: 'observation', tool_name: 'Grep' },
        ],
      };
      const fakeSessionManager = {
        getPendingMessageStore: () => fakePendingStore,
      } as unknown as SessionManager;

      const routes = new SessionRoutes(
        fakeSessionManager,
        {} as DatabaseManager,
        {} as ClaudeProvider,
        {} as any, // geminiAgent — 本测试不涉及
        {} as any, // openRouterAgent — 本测试不涉及
        {} as any, // qwenAgent — 本测试不涉及
        {} as any, // deepSeekAgent — 本测试不涉及
        {} as any, // eventBroadcaster — 本测试不涉及
        {} as any, // workerService — 本测试不涉及
        {} as any, // completionHandler — 本测试不涉及
      );

      const session = {
        sessionDbId: 1,
        contentSessionId: 'test-session',
        memorySessionId: null,
        modelOverride: undefined,
        lastPromptNumber: 1,
        forceInit: false,
        abortController: new AbortController(),
      } as any;

      // 真实调用链第一段：走 applyTierRouting() 的实际逻辑。
      await (routes as any).applyTierRouting(session);

      // 裁决前会短路成 'haiku'（非空真值）；裁决后 CLAUDE_MEM_TIER_SIMPLE_MODEL 为空，
      // `if (simpleModel)` 判断为假，modelOverride 应保持 undefined。
      expect(session.modelOverride).toBeUndefined();

      // 真实调用链第二段：session 未被 tier routing 垫上默认模型后，
      // ClaudeProvider.startSession() 的模型名判空校验应该真正生效并抛错。
      const provider = new ClaudeProvider({} as DatabaseManager, {} as SessionManager);
      await expect(provider.startSession(session)).rejects.toThrow(
        'Claude model not configured. Set CLAUDE_MEM_MODEL in settings or environment.'
      );
    } finally {
      loadFromFileSpy.mockRestore();
      (paths as { settings?: () => string }).settings = originalSettingsFn;
    }
  });
});

// Issue-20260928164327221-P0 回归覆盖：applyTierRouting() 曾经用
// `as unknown as { peekPendingTypesForRound?: ... }` 调用一个生产队列引擎接口/
// 实现里都不存在的方法，导致该方法恒为 undefined、分级路由永远拿不到数据。旧测试
// 用手写假对象自己伪造了这个不存在的方法，掩盖了回归——这里改用真实的
// SqliteObservationQueueEngine / BullMqObservationQueueEngine 驱动
// applyTierRouting()，确保回归会被真正捕获。
async function applyTierRoutingWithEngine(
  engine: InspectableObservationQueueEngine,
  sessionDbId: number,
  contentSessionId: string,
  lastPromptNumber: number,
): Promise<any> {
  const settings = {
    CLAUDE_MEM_MODEL: 'default-model',
    CLAUDE_MEM_TIER_ROUTING_ENABLED: 'true',
    CLAUDE_MEM_TIER_SIMPLE_MODEL: 'simple-model',
    CLAUDE_MEM_TIER_SUMMARY_MODEL: 'summary-model',
  } as unknown as SettingsDefaults;
  const loadFromFileSpy = spyOn(SettingsDefaultsManager, 'loadFromFile').mockImplementation(() => settings);

  try {
    const fakeSessionManager = {
      getPendingMessageStore: () => engine,
    } as unknown as SessionManager;

    const routes = new SessionRoutes(
      fakeSessionManager,
      {} as DatabaseManager,
      {} as ClaudeProvider,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );

    const session = {
      sessionDbId,
      contentSessionId,
      modelOverride: undefined,
      lastPromptNumber,
    } as any;

    await (routes as any).applyTierRouting(session);
    return session;
  } finally {
    loadFromFileSpy.mockRestore();
  }
}

// 每个场景都在目标轮次（prompt_number = targetPrompt）里混入一条"同 prompt 但不是
// round slice"的干扰任务、以及一条"更早轮次的 round slice"干扰任务，用来同时验证
// peekPendingTypesForRound() 与 peekPendingTypesForPrompt() 的行为差异（不能只按
// prompt_number 过滤，必须同时要求 round_slice_key 非空）——这正是旧的假对象测试
// 完全没有覆盖到的边界。
async function seedRoundScenario(
  engine: InspectableObservationQueueEngine,
  sessionDbId: number,
  contentSessionId: string,
  targetPrompt: number,
  roundMessages: Array<{ type: 'observation' | 'summarize'; tool_name?: string; sliceNumber: number }>,
): Promise<void> {
  for (const msg of roundMessages) {
    await engine.enqueue(sessionDbId, contentSessionId, {
      type: msg.type,
      tool_name: msg.tool_name,
      prompt_number: targetPrompt,
      roundSlice: {
        promptNumber: targetPrompt,
        sliceNumber: msg.sliceNumber,
        startRawEventId: msg.sliceNumber * 10,
        endRawEventId: msg.sliceNumber * 10 + 1,
        idempotencyKey: `${contentSessionId}:${targetPrompt}:${msg.sliceNumber}`,
      },
    });
  }

  // 干扰项 1：同一轮次、但不是 round slice 的旧式任务——ForRound 必须排除它。
  await engine.enqueue(sessionDbId, contentSessionId, {
    type: 'summarize',
    prompt_number: targetPrompt,
  });

  // 干扰项 2：更早轮次的 round slice——ForRound 必须只看目标轮次。
  const olderPrompt = targetPrompt - 1;
  if (olderPrompt > 0) {
    await engine.enqueue(sessionDbId, contentSessionId, {
      type: 'summarize',
      prompt_number: olderPrompt,
      roundSlice: {
        promptNumber: olderPrompt,
        sliceNumber: 1,
        startRawEventId: 1,
        endRawEventId: 2,
        idempotencyKey: `${contentSessionId}:${olderPrompt}:1`,
      },
    });
  }
}

describe('SessionRoutes.applyTierRouting with real queue engines (Issue-20260928164327221-P0)', () => {
  describe('with SqliteObservationQueueEngine', () => {
    // pending_messages.session_db_id 有外键约束（引用 sdk_sessions.id），round
    // slice 入队前必须先有一个真实存在的会话记录，否则插入会因外键校验失败。
    function createSqliteEngine(contentSessionId: string): { engine: SqliteObservationQueueEngine; db: Database; sessionDbId: number } {
      const db = new ClaudeMemDatabase(':memory:').db;
      const store = new SessionStore(db);
      const sessionDbId = store.createSDKSession(contentSessionId, 'tier-routing-test', 'seed prompt');
      const engine = new SqliteObservationQueueEngine(db);
      return { engine, db, sessionDbId };
    }

    it('routes a simple closed round to the simple model', async () => {
      const { engine, db, sessionDbId } = createSqliteEngine('sqlite-tier-simple');
      try {
        await seedRoundScenario(engine, sessionDbId, 'sqlite-tier-simple', 1, [
          { type: 'observation', tool_name: 'Read', sliceNumber: 1 },
          { type: 'observation', tool_name: 'Grep', sliceNumber: 2 },
        ]);

        const session = await applyTierRoutingWithEngine(engine, sessionDbId, 'sqlite-tier-simple', 2);

        expect(session.modelOverride).toBe('simple-model');
      } finally {
        db.close();
      }
    });

    // PendingMessageStore.enqueueRoundSlice() 在 INSERT 语句里把 message_type 硬
    // 编码成字面量 'observation'，不管传入的 message.type 是什么（见
    // src/services/sqlite/PendingMessageStore.ts:92）。这意味着任何 round slice——
    // 包括这里特意传入 type: 'summarize' 的这条——落到 SQLite 存储层后
    // message_type 一律变成 'observation'，applyTierRouting() 里的
    // hasSummarize 判断因此永远不可能为 true。这不是本次 Issue-20260928164327221-P0
    // 要修的问题（那份档案只管"方法调用不到"），这里改成如实断言这个既有行为，
    // 并已经另建 doc/Issue-20260928183041382-P1.md 跟踪这条更深层的分级路由设计缺口。
    it('coerces round-slice message_type to observation at the storage layer, so a summarize round never reaches the summary model', async () => {
      const { engine, db, sessionDbId } = createSqliteEngine('sqlite-tier-summary');
      try {
        await seedRoundScenario(engine, sessionDbId, 'sqlite-tier-summary', 1, [
          { type: 'summarize', sliceNumber: 1 },
        ]);

        const session = await applyTierRoutingWithEngine(engine, sessionDbId, 'sqlite-tier-summary', 2);

        // 如实记录当前行为：即使这一轮只有一条 summarize 类型的 round slice，
        // 存储层已经把它的 message_type 强制改成了 'observation'，所以
        // hasSummarize 判断不到，最终仍然停留在默认模型，不是 summary-model。
        expect(session.modelOverride).toBeUndefined();
      } finally {
        db.close();
      }
    });

    it('keeps the default model when the round mixes simple and non-simple tools', async () => {
      const { engine, db, sessionDbId } = createSqliteEngine('sqlite-tier-mixed');
      try {
        await seedRoundScenario(engine, sessionDbId, 'sqlite-tier-mixed', 1, [
          { type: 'observation', tool_name: 'Read', sliceNumber: 1 },
          { type: 'observation', tool_name: 'Write', sliceNumber: 2 },
        ]);

        const session = await applyTierRoutingWithEngine(engine, sessionDbId, 'sqlite-tier-mixed', 2);

        expect(session.modelOverride).toBeUndefined();
      } finally {
        db.close();
      }
    });
  });

  describe('with BullMqObservationQueueEngine', () => {
    // 最小内存 BullMQ 传输层 fixture，参照
    // tests/services/queue/bullmq-observation-queue-engine.test.ts 里已验证可用的
    // FakeQueue/FakeRedis 写法裁剪而来，只保留 enqueue + getJobs 所需的最小接口。
    class FakeJob {
      state = 'waiting';
      constructor(readonly id: string, readonly data: any) {}
      async getState(): Promise<string> { return this.state; }
    }

    class FakeQueue {
      readonly jobs: FakeJob[] = [];
      async add(_name: string, data: any, opts: { jobId?: string } = {}): Promise<FakeJob> {
        const id = opts.jobId ?? String(this.jobs.length + 1);
        const existing = this.jobs.find(job => job.id === id);
        if (existing) return existing;
        const job = new FakeJob(id, data);
        this.jobs.push(job);
        return job;
      }
      async getJob(jobId: string): Promise<FakeJob | undefined> {
        return this.jobs.find(job => job.id === jobId);
      }
      async getJobs(types: string[]): Promise<FakeJob[]> {
        return this.jobs.filter(job => types.includes(job.state));
      }
      async getJobCounts(...types: string[]): Promise<Record<string, number>> {
        return Object.fromEntries(types.map(type => [type, this.jobs.filter(job => job.state === type).length]));
      }
      async obliterate(): Promise<void> { this.jobs.length = 0; }
      async close(): Promise<void> {}
    }

    class FakeRedis {
      status = 'wait';
      async connect(): Promise<void> { this.status = 'ready'; }
      async ping(): Promise<string> { return 'PONG'; }
      async sadd(): Promise<number> { return 1; }
      async srem(): Promise<number> { return 1; }
      async smembers(): Promise<string[]> { return []; }
      async quit(): Promise<void> {}
      disconnect(): void {}
    }

    function createBullMqEngine(): BullMqObservationQueueEngine {
      const queues = new Map<string, FakeQueue>();
      const redis = new FakeRedis();
      const getQueue = (name: string) => {
        let queue = queues.get(name);
        if (!queue) {
          queue = new FakeQueue();
          queues.set(name, queue);
        }
        return queue;
      };
      return new BullMqObservationQueueEngine({
        config: {
          engine: 'bullmq',
          mode: 'external',
          url: null,
          host: '127.0.0.1',
          port: 6379,
          prefix: 'tier-routing-test',
          connection: { host: '127.0.0.1', port: 6379, lazyConnect: true, maxRetriesPerRequest: null },
        } as any,
        lockDurationMs: 60_000,
        pollIntervalMs: 5,
        queueFactory: name => getQueue(name) as any,
        workerFactory: () => ({ getNextJob: async () => undefined, close: async () => {} }) as any,
        redisFactory: () => redis as any,
      });
    }

    it('routes a simple closed round to the simple model', async () => {
      const engine = createBullMqEngine();
      try {
        await seedRoundScenario(engine, 11, 'bullmq-tier-simple', 1, [
          { type: 'observation', tool_name: 'Read', sliceNumber: 1 },
          { type: 'observation', tool_name: 'Grep', sliceNumber: 2 },
        ]);

        const session = await applyTierRoutingWithEngine(engine, 11, 'bullmq-tier-simple', 2);

        expect(session.modelOverride).toBe('simple-model');
      } finally {
        await engine.close();
      }
    });

    // 与 SQLite 引擎的同名用例对照：BullMQ 这一侧的 job.data 原样保留调用方传入
    // 的 message.type（不像 SQLite 的 PendingMessageStore.enqueueRoundSlice()
    // 会把 message_type 硬编码成 'observation'），所以这里确实能拿到
    // summary-model。两个引擎对"round slice 的 message_type 该不该保留"这件事
    // 行为不一致，属于 doc/Issue-20260928183041382-P1.md 里记录的既有缺口之一，
    // 不在本次 Issue-20260928164327221-P0 的修复范围内。
    it('routes a summarize closed round to the summary model', async () => {
      const engine = createBullMqEngine();
      try {
        await seedRoundScenario(engine, 12, 'bullmq-tier-summary', 1, [
          { type: 'summarize', sliceNumber: 1 },
        ]);

        const session = await applyTierRoutingWithEngine(engine, 12, 'bullmq-tier-summary', 2);

        expect(session.modelOverride).toBe('summary-model');
      } finally {
        await engine.close();
      }
    });

    it('ignores non-round and older pending jobs', async () => {
      const engine = createBullMqEngine();
      try {
        // 只塞干扰项（同轮次非 round slice + 更早轮次 round slice），不塞目标轮次的
        // round slice——分级路由必须保持默认模型，不能被干扰项误判。
        await seedRoundScenario(engine, 13, 'bullmq-tier-noise', 2, []);

        const session = await applyTierRoutingWithEngine(engine, 13, 'bullmq-tier-noise', 3);

        expect(session.modelOverride).toBeUndefined();
      } finally {
        await engine.close();
      }
    });
  });
});
