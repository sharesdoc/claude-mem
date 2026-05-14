
import type { EventHandler, NormalizedHookInput, HookResult } from '../types.js';
import {
  executeWithWorkerFallback,
  isWorkerFallback,
  getWorkerPort,
} from '../../shared/worker-utils.js';
import { HOOK_EXIT_CODES } from '../../shared/hook-constants.js';
import { getProjectContext } from '../../utils/project-name.js';
import { buildContextInjectPath } from '../../shared/query-utils.js';

export const userMessageHandler: EventHandler = {
  async execute(input: NormalizedHookInput): Promise<HookResult> {
    const port = getWorkerPort();
    const context = getProjectContext(input.cwd ?? process.cwd());
    const colorsParam = input.platform === 'claude-code' ? '&colors=true' : '';
    const apiPath = buildContextInjectPath(context.allProjects);

    const result = await executeWithWorkerFallback<string>(
      `${apiPath}${colorsParam}`,
      'GET',
    );

    if (isWorkerFallback(result)) {
      return { exitCode: HOOK_EXIT_CODES.SUCCESS };
    }

    const output = typeof result === 'string' ? result : '';
    process.stderr.write(
      "\n\n" + String.fromCodePoint(0x1F4DD) + " Claude-Mem Context Loaded\n\n" +
      output +
      "\n\n" + String.fromCodePoint(0x1F4A1) + " Wrap any message with <private> ... </private> to prevent storing sensitive information.\n" +
      "\n" + String.fromCodePoint(0x1F4AC) + " Community https://discord.gg/J4wttp9vDu" +
      `\n` + String.fromCodePoint(0x1F4FA) + ` Watch live in browser http://localhost:${port}/\n`
    );

    return { exitCode: HOOK_EXIT_CODES.SUCCESS };
  },
};
