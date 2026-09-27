// SPDX-License-Identifier: Apache-2.0

import { logger } from '../../../utils/logger.js';
import {
  ServerClassifiedProviderError,
  classifyHttpProviderError,
} from './shared/error-classification.js';
import { buildServerGenerationPrompt } from './shared/prompt-builder.js';
import type {
  ServerGenerationContext,
  ServerGenerationProvider,
  ServerGenerationResult,
} from './shared/types.js';

const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';

export interface OpenRouterObservationProviderOptions {
  apiKey: string;
  model?: string;
  maxOutputTokens?: number;
  siteUrl?: string;
  appName?: string;
  fetchImpl?: typeof fetch;
  // X-020: 泛化参数——OpenAI 兼容的其它厂商 (qwen/deepseek) 复用本实现,
  // 只需换端点与 providerLabel; 缺省保持 OpenRouter 原行为。
  baseUrl?: string;
  providerLabel?: 'openrouter' | 'qwen' | 'deepseek';
}

interface OpenRouterResponse {
  choices?: Array<{ message?: { content?: string } }>;
  usage?: { total_tokens?: number };
  error?: { code?: string | number; message?: string };
}

export class OpenRouterObservationProvider implements ServerGenerationProvider {
  readonly providerLabel: 'openrouter' | 'qwen' | 'deepseek';
  private readonly apiKey: string;
  private readonly model: string;
  private readonly maxOutputTokens: number;
  private readonly siteUrl: string;
  private readonly appName: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: OpenRouterObservationProviderOptions) {
    if (!options.apiKey) {
      throw new ServerClassifiedProviderError('OpenRouter API key not configured', {
        kind: 'auth_invalid',
        cause: new Error('apiKey is required'),
      });
    }
    // 依据: Task-20260927091425627-P2 — 模型名不再有默认值回落，缺失即抛错。
    // 注: 本类被 qwen/deepseek server-beta 分支复用(providerLabel 泛化)，
    // 该门槛同样适用于这两家。
    if (!options.model) {
      throw new ServerClassifiedProviderError(`${options.providerLabel ?? 'OpenRouter'} model not configured`, {
        kind: 'unrecoverable',
        cause: new Error('model is required'),
      });
    }
    this.apiKey = options.apiKey;
    this.model = options.model;
    this.maxOutputTokens = options.maxOutputTokens ?? 4096;
    this.siteUrl = options.siteUrl ?? 'https://github.com/thedotmack/claude-mem';
    this.appName = options.appName ?? 'claude-mem';
    this.baseUrl = options.baseUrl ?? OPENROUTER_API_URL;
    this.providerLabel = options.providerLabel ?? 'openrouter';
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async generate(
    context: ServerGenerationContext,
    signal?: AbortSignal,
  ): Promise<ServerGenerationResult> {
    const { prompt, skippedAll } = buildServerGenerationPrompt(context);
    if (skippedAll) {
      return {
        rawText: '<skip_summary reason="all_events_private" />',
        providerLabel: this.providerLabel,
        modelId: this.model,
      };
    }

    let response: Response;
    try {
      response = await this.fetchImpl(this.baseUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'HTTP-Referer': this.siteUrl,
          'X-Title': this.appName,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.model,
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.3,
          max_tokens: this.maxOutputTokens,
        }),
        signal,
      });
    } catch (networkError) {
      throw classifyHttpProviderError({
        cause: networkError,
        providerLabel: 'OpenRouter',
      });
    }

    if (!response.ok) {
      const bodyText = await safeReadBody(response);
      throw classifyHttpProviderError({
        status: response.status,
        bodyText,
        headers: response.headers,
        cause: new Error(`OpenRouter API error: ${response.status} - ${bodyText}`),
        providerLabel: 'OpenRouter',
      });
    }

    let data: OpenRouterResponse;
    try {
      data = (await response.json()) as OpenRouterResponse;
    } catch (parseError) {
      throw new ServerClassifiedProviderError('OpenRouter returned invalid JSON', {
        kind: 'parse_error',
        cause: parseError,
      });
    }

    if (data.error) {
      throw classifyHttpProviderError({
        status: response.status,
        bodyText: `${data.error.code ?? ''} ${data.error.message ?? ''}`,
        headers: response.headers,
        cause: new Error(`OpenRouter API error: ${data.error.code} - ${data.error.message}`),
        providerLabel: 'OpenRouter',
      });
    }

    const rawText = data.choices?.[0]?.message?.content?.trim() ?? '';
    if (!rawText) {
      logger.warn('SDK', 'OpenRouter returned empty content', {
        provider: 'openrouter',
        model: this.model,
      });
    }

    const tokensUsed = typeof data.usage?.total_tokens === 'number' ? data.usage.total_tokens : undefined;

    return {
      rawText,
      ...(tokensUsed !== undefined ? { tokensUsed } : {}),
      providerLabel: this.providerLabel,
      modelId: this.model,
    };
  }
}

async function safeReadBody(response: Response): Promise<string> {
  try {
    return await response.text();
  } catch {
    return '';
  }
}
