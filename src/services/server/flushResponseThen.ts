import { Response } from 'express';
import { logger } from '../../utils/logger.js';

export function flushResponseThen(
  res: Response,
  payload: unknown,
  action: () => void | Promise<void>
): void {
  res.on('finish', async () => {
    try {
      await action();
    } catch (error) {
      // Without this catch the action's failure was swallowed silently and
      // the process exited mid-teardown with zero diagnostics (X-004).
      logger.error('SYSTEM', 'Post-response action failed before exit', {},
        error instanceof Error ? error : new Error(String(error)));
    } finally {
      process.exit(0);
    }
  });
  res.json(payload);
}
