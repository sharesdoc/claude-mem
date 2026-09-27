
import { describe, it, expect, mock, spyOn } from 'bun:test';

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

// 依据: doc/rev-report-20260927102826977.md R-001（用户裁决：tier routing 也纳入
// "未显式配置不回落默认值"新规则，CLAUDE_MEM_TIER_SIMPLE_MODEL 出厂默认值清零）。
//
// 本测试贯穿真实调用链——先走 SessionRoutes.applyTierRouting() 真实逻辑（而非直接
// 构造 session.modelOverride），再调用 ClaudeProvider.startSession()——验证零配置
// 场景下 pending 消息全为简单只读工具时，tier routing 不会再用出厂默认 'haiku' 短路
// 掉 ClaudeProvider 的模型名判空校验。这正是三轮独立验证从未覆盖到的调用链缺口。
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
      // pending 消息全为 SessionRoutes.SIMPLE_TOOLS 里的只读工具类型（Read/Glob/Grep/
      // LS/ListMcpResourcesTool），这是插件日常最常见的观察场景。
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

  it('uses only the current closed round slices and never falls back to older session pending rows', async () => {
    const settings = {
      CLAUDE_MEM_MODEL: 'default-model',
      CLAUDE_MEM_TIER_ROUTING_ENABLED: 'true',
      CLAUDE_MEM_TIER_SIMPLE_MODEL: 'simple-model',
      CLAUDE_MEM_TIER_SUMMARY_MODEL: 'summary-model',
    } as unknown as SettingsDefaults;
    const loadFromFileSpy = spyOn(SettingsDefaultsManager, 'loadFromFile').mockImplementation(() => settings);
    try {
      const fakePendingStore = {
        peekPendingTypes: async () => [{ message_type: 'summarize', tool_name: null }],
        peekPendingTypesForRound: async (_sessionDbId: number, promptNumber: number) => {
          expect(promptNumber).toBe(1);
          return [{ message_type: 'observation', tool_name: 'Read' }];
        },
      };
      const fakeSessionManager = { getPendingMessageStore: () => fakePendingStore } as unknown as SessionManager;
      const routes = new SessionRoutes(
        fakeSessionManager, {} as DatabaseManager, {} as ClaudeProvider,
        {} as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any,
      );
      const session = {
        sessionDbId: 2, contentSessionId: 'tier-round', modelOverride: undefined,
        lastPromptNumber: 2,
      } as any;
      await (routes as any).applyTierRouting(session);
      expect(session.modelOverride).toBe('simple-model');
    } finally {
      loadFromFileSpy.mockRestore();
    }
  });
});
