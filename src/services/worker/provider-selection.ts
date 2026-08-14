
// ---------------------------------------------------------------------------
// provider-selection — 摘要生成 provider 选择的唯一权威 (X-017)。
// 语义: 严格按 CLAUDE_MEM_PROVIDER 选择——selected && available 才启用对应厂商,
// 否则回落 claude (Claude Agent SDK)。不存在"某厂商有 key 就自动抢跑"的兜底。
// worker-service.ts 与 SessionRoutes.ts 共用本模块, 消除双份分支逻辑。
// ---------------------------------------------------------------------------

import { isQwenSelected, isQwenAvailable } from './QwenProvider.js';
import { isDeepSeekSelected, isDeepSeekAvailable } from './DeepSeekProvider.js';
import { isOpenRouterSelected, isOpenRouterAvailable } from './OpenRouterProvider.js';
import { isGeminiSelected, isGeminiAvailable } from './GeminiProvider.js';

export type ProviderId = 'claude' | 'qwen' | 'deepseek' | 'openrouter' | 'gemini';

export interface ProviderFlags {
  qwenSelected: boolean;
  qwenAvailable: boolean;
  deepseekSelected: boolean;
  deepseekAvailable: boolean;
  openrouterSelected: boolean;
  openrouterAvailable: boolean;
  geminiSelected: boolean;
  geminiAvailable: boolean;
}

/** 纯函数: 由 flags 决议当前 provider。默认 claude。 */
export function resolveProviderId(f: ProviderFlags): ProviderId {
  if (f.qwenSelected && f.qwenAvailable) return 'qwen';
  if (f.deepseekSelected && f.deepseekAvailable) return 'deepseek';
  if (f.openrouterSelected && f.openrouterAvailable) return 'openrouter';
  if (f.geminiSelected && f.geminiAvailable) return 'gemini';
  return 'claude';
}

/** 从各 provider 的 is*Selected/is*Available 读取当前 flags。 */
export function collectProviderFlags(): ProviderFlags {
  return {
    qwenSelected: isQwenSelected(),
    qwenAvailable: isQwenAvailable(),
    deepseekSelected: isDeepSeekSelected(),
    deepseekAvailable: isDeepSeekAvailable(),
    openrouterSelected: isOpenRouterSelected(),
    openrouterAvailable: isOpenRouterAvailable(),
    geminiSelected: isGeminiSelected(),
    geminiAvailable: isGeminiAvailable(),
  };
}
