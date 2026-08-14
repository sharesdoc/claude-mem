
import { FALLBACK_ERROR_PATTERNS } from './types.js';
import { logger } from '../../../utils/logger.js';

export function shouldFallbackToClaude(error: unknown): boolean {
  const message = getErrorMessage(error);

  return FALLBACK_ERROR_PATTERNS.some(pattern => message.includes(pattern));
}

function getErrorMessage(error: unknown): string {
  if (error === null || error === undefined) {
    return '';
  }

  if (typeof error === 'string') {
    return error;
  }

  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === 'object' && 'message' in error) {
    return String((error as { message: unknown }).message);
  }

  return String(error);
}

export function isAbortError(error: unknown): boolean {
  if (error === null || error === undefined) {
    return false;
  }

  if (error instanceof Error && error.name === 'AbortError') {
    return true;
  }

  if (typeof error === 'object' && 'name' in error) {
    return (error as { name: unknown }).name === 'AbortError';
  }

  // X-034: 包装型错误(如 ClassifiedProviderError)的 cause 可能是 AbortError,
  // 递归识别以便会话层正确记录"已中止"而非"失败"。
  if (error instanceof Error && 'cause' in error) {
    return isAbortError(error.cause);
  }

  return false;
}
