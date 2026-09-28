import { pathToFileURL } from 'node:url';
import { hookCommand } from './hook-command.js';
import { HOOK_EXIT_CODES } from '../shared/hook-constants.js';

const SUPPORTED_PLATFORMS = new Set([
  'claude-code',
  'codex',
  'cursor',
  'gemini',
  'gemini-cli',
  'windsurf',
  'raw',
]);

const SUPPORTED_EVENTS = new Set([
  'context',
  'session-init',
  'observation',
  'summarize',
  'user-message',
  'file-edit',
  'file-context',
]);

export type HookExecutor = (
  platform: string,
  event: string,
  options: { skipExit: true },
) => Promise<number>;

/**
 * Validate the two command-line selectors before any hook input is consumed.
 * Keeping the accepted surface explicit prevents a host configuration error
 * from silently falling through to the raw adapter or no-op event handler.
 *
 * @param platform Host adapter name supplied by the hook manifest.
 * @param event Normalized hook event supplied by the hook manifest.
 * @throws Error when either selector is absent or unsupported.
 */
export function validateHookSelectors(platform: string | undefined, event: string | undefined): void {
  if (!platform || !SUPPORTED_PLATFORMS.has(platform)) {
    throw new Error(`Unsupported hook platform: ${platform ?? '<missing>'}`);
  }
  if (!event || !SUPPORTED_EVENTS.has(event)) {
    throw new Error(`Unsupported hook event: ${event ?? '<missing>'}`);
  }
}

/**
 * Execute one hook request without taking ownership of worker lifecycle.
 * The bundle replaces CLAUDE_MEM_HOOK_CLIENT_ONLY with the literal "1" at
 * build time, allowing esbuild to remove every worker-spawn branch.
 *
 * @param argv CLI arguments in `[platform, event]` order.
 * @param execute Injectable executor used by unit tests.
 * @returns The protocol exit code produced by the normalized hook handler.
 */
export async function runHookService(
  argv: string[] = process.argv.slice(2),
  execute: HookExecutor = hookCommand,
): Promise<number> {
  const [platform, event] = argv;
  try {
    validateHookSelectors(platform, event);
    return await execute(platform!, event!, { skipExit: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`[claude-mem hook-service] ${message}\n`);
    return HOOK_EXIT_CODES.FAILURE;
  }
}

const invokedPath = process.argv[1];
if (invokedPath && import.meta.url === pathToFileURL(invokedPath).href) {
  process.exitCode = await runHookService();
}
