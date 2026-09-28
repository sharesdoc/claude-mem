import { describe, expect, it, mock } from 'bun:test';
import {
  runHookService,
  validateHookSelectors,
  type HookExecutor,
} from '../src/cli/hook-service-entry.js';

describe('lightweight hook service entry', () => {
  it('accepts supported platform and event selectors', () => {
    expect(() => validateHookSelectors('claude-code', 'observation')).not.toThrow();
    expect(() => validateHookSelectors('codex', 'context')).not.toThrow();
  });

  it('rejects unsupported selectors before reading stdin', () => {
    expect(() => validateHookSelectors('unknown', 'observation')).toThrow(/Unsupported hook platform/);
    expect(() => validateHookSelectors('claude-code', 'unknown')).toThrow(/Unsupported hook event/);
  });

  it('delegates execution without allowing the handler to exit the process', async () => {
    const execute = mock(async () => 2) as HookExecutor;

    const exitCode = await runHookService(['claude-code', 'observation'], execute);

    expect(exitCode).toBe(2);
    expect(execute).toHaveBeenCalledWith('claude-code', 'observation', { skipExit: true });
  });
});
