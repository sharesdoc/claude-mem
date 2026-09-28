# types.ts 需求说明

> 源文件：src/server/generation/providers/shared/types.ts ｜ 类型：源码 ｜ 行数：34 ｜ 所属模块：server/generation/providers/shared ｜ 分析日期：2026-07-23

## 1. 文件定位总述

types.ts 定义了 Server Beta 生成层（provider 层）的核心类型接口，是所有 AI 模型提供商适配器的契约。它规定了生成上下文（`ServerGenerationContext`）、生成结果（`ServerGenerationResult`）和提供商抽象（`ServerGenerationProvider`）三个关键接口。这些类型确保不同提供商（Claude、Gemini、OpenRouter）在统一的输入输出契约下运行，同时通过注释强调上下文必须从 Postgres 重新加载而非携带 worker 会话状态。

## 2. 功能需求

| 编号 | 需求描述（系统应当…） | 触发条件 / 输入 | 处理规则与输出 | 证据 |
|------|----------------------|----------------|---------------|------|
| FR-SGNTYPE-01 | 系统应当定义生成上下文接口，包含任务、事件列表和项目信息 | provider 的 generate 方法被调用时 | `ServerGenerationContext` 包含 job（PostgresObservationGenerationJob）、events（PostgresAgentEvent[]）和 project 子对象 | `types.ts:9-18` |
| FR-SGNTYPE-02 | 系统应当定义生成结果接口，包含原始文本、token 用量和提供商标识 | provider 完成生成后 | `ServerGenerationResult` 包含 rawText（必需）、tokensUsed（可选）、providerLabel（必需）、modelId（可选） | `types.ts:23-28` |
| FR-SGNTYPE-03 | 系统应当定义提供商抽象接口，所有 AI 模型适配器必须实现 | 注册 provider 时 | `ServerGenerationProvider` 要求实现 `providerLabel`（'claude' | 'gemini' | 'openrouter'）和 `generate(context, signal?)` 方法 | `types.ts:30-33` |

## 3. 业务规则与约束

1. **上下文重新加载**：注释明确要求 `ServerGenerationContext` 每次重试都从 Postgres 重新加载，BullMQ payload 仅作参考（`types.ts:8`）
2. **反模式防护**：上下文不得携带 worker session 状态（`types.ts:9`）
3. **空字符串语义**：`rawText` 为空字符串表示 provider 未返回内容，由上游 processGeneratedResponse 处理为"跳过无观察"（`types.ts:25`）
4. **providerLabel 枚举约束**：限定为 `'claude' | 'gemini' | 'openrouter'` 三个值（`types.ts:31`）

## 4. 对外暴露

| 导出项 | 类型 | 说明 |
|--------|------|------|
| `ServerGenerationContext` | interface | 生成任务上下文（job + events + project） |
| `ServerGenerationResult` | interface | 生成结果（rawText + tokensUsed + providerLabel + modelId） |
| `ServerGenerationProvider` | interface | 提供商抽象（providerLabel + generate 方法） |

## 5. 依赖关系

- **上游**：`../../../../storage/postgres/agent-events.js`（PostgresAgentEvent）、`../../../../storage/postgres/generation-jobs.js`（PostgresObservationGenerationJob）
- **下游**：被 GeminiObservationProvider、OpenRouterObservationProvider 等具体实现引用

## 6. 数据结构

```typescript
interface ServerGenerationContext {
  readonly job: PostgresObservationGenerationJob;
  readonly events: readonly PostgresAgentEvent[];
  readonly project: {
    readonly projectId: string;
    readonly teamId: string;
    readonly serverSessionId: string | null;
    readonly projectName?: string | null;
  };
}

interface ServerGenerationResult {
  readonly rawText: string;
  readonly tokensUsed?: number;
  readonly providerLabel: string;
  readonly modelId?: string;
}

interface ServerGenerationProvider {
  readonly providerLabel: 'claude' | 'gemini' | 'openrouter';
  generate(context: ServerGenerationContext, signal?: AbortSignal): Promise<ServerGenerationResult>;
}
```

## 7. 复杂逻辑图示

不适用，该文件为纯类型定义。

## 8. 逆向备注

无特殊备注。
