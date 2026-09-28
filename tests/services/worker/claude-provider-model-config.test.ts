
import { describe, it, expect, mock, spyOn } from 'bun:test';

// 必须在 import ClaudeProvider 之前 mock，避免测试环境里真的去查找/校验
// claude 可执行文件（findClaudeExecutable 在 startSession 里先于模型名校验执行）。
mock.module('../../../src/shared/find-claude-executable.js', () => ({
  findClaudeExecutable: () => '/usr/bin/claude',
}));

import { ClaudeProvider } from '../../../src/services/worker/ClaudeProvider.js';
import { SettingsDefaultsManager, type SettingsDefaults } from '../../../src/shared/SettingsDefaultsManager.js';
import { paths } from '../../../src/shared/paths.js';
import type { DatabaseManager } from '../../../src/services/worker/DatabaseManager.js';
import type { SessionManager } from '../../../src/services/worker/SessionManager.js';

// 依据: Task-20260927091425627-P2 — Claude 是选型链条终点，模型名缺失时没有
// "跳到下一家"可用，只能直接报错阻塞，不再悄悄垫 claude-haiku-4-5-20251001。

describe('ClaudeProvider.startSession model guard (Task-20260927091425627-P2)', () => {
  it('should throw when session.modelOverride is unset and CLAUDE_MEM_MODEL is empty', async () => {
    // X-029: 纯对象构造——bun 并发执行时其它文件的 mock.module(SettingsDefaultsManager)
    // 会泄漏到本文件使 getAllDefaults 失效; getModelId() 只按需读取这一个字段。
    const settings = { CLAUDE_MEM_MODEL: '' } as unknown as SettingsDefaults;
    const loadFromFileSpy = spyOn(SettingsDefaultsManager, 'loadFromFile').mockImplementation(() => settings);

    // 第二轮独立验证发现: 全量套件里有些旧测试文件(如
    // tests/worker/http/routes/data-routes-delete-auth.test.ts)用
    // mock.module('.../shared/paths.js', ...) 把整个 paths 对象换成只剩
    // { database } 的残缺对象、且从不还原——ClaudeProvider.getModelId() 先调用
    // paths.settings() 再把结果传给上面已 mock 好的 loadFromFile，若残缺对象
    // 没有 settings 字段就会在到达 loadFromFile 之前先抛
    // "paths.settings is not a function"。这里自愈: 不管 paths 对象当前是否被
    // 污染，主动把 settings 恢复成一个可用函数，跑完再还原原状，不反过来污染
    // 排在自己后面的文件。
    const originalSettingsFn = (paths as { settings?: () => string }).settings;
    (paths as { settings: () => string }).settings = () => '/tmp/claude-mem-test-settings.json';

    try {
      const provider = new ClaudeProvider({} as DatabaseManager, {} as SessionManager);
      const session = {
        sessionDbId: 1,
        contentSessionId: 'test-session',
        memorySessionId: null,
        modelOverride: undefined,
        lastPromptNumber: 1,
        forceInit: false,
        abortController: new AbortController(),
      } as any;

      await expect(provider.startSession(session)).rejects.toThrow(
        'Claude model not configured. Set CLAUDE_MEM_MODEL in settings or environment.'
      );
    } finally {
      loadFromFileSpy.mockRestore();
      (paths as { settings?: () => string }).settings = originalSettingsFn;
    }
  });

  // 依据: doc/rev-report-20260927102826977.md R-002 — getModelId() 原先未 trim，
  // 纯空格字符串是真值，会绕过 startSession() 的 `if (!modelId) throw` 判空校验。
  it('should throw when CLAUDE_MEM_MODEL is a whitespace-only string', async () => {
    const settings = { CLAUDE_MEM_MODEL: '   ' } as unknown as SettingsDefaults;
    const loadFromFileSpy = spyOn(SettingsDefaultsManager, 'loadFromFile').mockImplementation(() => settings);

    const originalSettingsFn = (paths as { settings?: () => string }).settings;
    (paths as { settings: () => string }).settings = () => '/tmp/claude-mem-test-settings.json';

    try {
      const provider = new ClaudeProvider({} as DatabaseManager, {} as SessionManager);
      const session = {
        sessionDbId: 1,
        contentSessionId: 'test-session',
        memorySessionId: null,
        modelOverride: undefined,
        lastPromptNumber: 1,
        forceInit: false,
        abortController: new AbortController(),
      } as any;

      await expect(provider.startSession(session)).rejects.toThrow(
        'Claude model not configured. Set CLAUDE_MEM_MODEL in settings or environment.'
      );
    } finally {
      loadFromFileSpy.mockRestore();
      (paths as { settings?: () => string }).settings = originalSettingsFn;
    }
  });
});
