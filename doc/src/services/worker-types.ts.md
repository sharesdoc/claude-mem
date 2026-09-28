# worker-types.ts 需求说明

> 源文件：src/services/worker-types.ts ｜ 类型：源码/类型定义 ｜ 行数：196 ｜ 所属模块：services ｜ 分析日期：2026-07-23

## 1. 文件定位总述

worker-types.ts 是 Worker 服务的核心类型定义文件，定义了活跃会话、待处理消息、观察记录、会话摘要、用户提示、SSE 事件、分页结果等贯穿整个 Worker 子系统的接口。它是 Worker 模块间数据传递的契约层，几乎所有 Worker 相关的文件都依赖此文件中的类型定义。文件还从 `@anthropic-ai/claude-agent-sdk` 重新导出 `SDKUserMessage` 类型。

## 2. 功能需求

本文件为纯类型定义文件，不包含功能逻辑。系统通过这些类型约束确保 Worker 各组件之间的数据结构一致性。

## 3. 业务规则与约束

- **ActiveSession 状态字段**：`currentProvider` 可取值 `'claude' | 'gemini' | 'openrouter' | 'qwen' | null`，标识当前使用的 LLM 提供商 (`worker-types.ts:27`)
- **DBSession 状态枚举**：`status` 为 `'active' | 'completed' | 'failed'` 三态 (`worker-types.ts:157`)
- **PendingMessage 类型**：区分 `observation`（工具使用记录）和 `summarize`（总结请求）两种消息类型 (`worker-types.ts:42`)
- **分页约束**：`PaginationParams` 包含 offset/limit 必填字段和 project/platformSource 可选过滤 (`worker-types.ts:86-90`)
- **Viewer 设置项**：`ViewerSettings` 包含 sidebarOpen、selectedProject、theme 三项 (`worker-types.ts:92-96`)

## 4. 对外暴露

| 类型/接口 | 说明 |
|----------|------|
| `ConversationMessage` | 对话消息（role + content） |
| `ActiveSession` | 活跃会话完整状态（含消息队列、生成器、token 统计等） |
| `PendingMessage` | 待处理消息（observation/summarize） |
| `PendingMessageWithId` | 带持久化 ID 的待处理消息 |
| `ObservationData` | 观察数据（工具使用详情） |
| `SSEEvent` | SSE 推送事件结构 |
| `SSEClient` | SSE 客户端（Response 类型别名） |
| `PaginatedResult<T>` | 泛型分页结果 |
| `PaginationParams` | 分页参数 |
| `ViewerSettings` | 查看器 UI 设置 |
| `Observation` | 观察记录（含 memory_session_id、project、concepts 等） |
| `Summary` | 会话摘要 |
| `UserPrompt` | 用户提示记录 |
| `DBSession` | 数据库会话记录 |
| `ParsedObservation` | 解析后的观察结构 |
| `ParsedSummary` | 解析后的摘要结构 |
| `DatabaseStats` | 数据库统计（含分项目统计） |
| `SDKUserMessage` | 重导出自 claude-agent-sdk |

## 5. 依赖关系

- **外部依赖**：`@anthropic-ai/claude-agent-sdk`（重导出 SDKUserMessage）
- **内部依赖**：`./worker/RestartGuard.js`（ActiveSession 中引用 RestartGuard 类型）
- **下游影响**：整个 Worker 子系统、SessionManager、消息处理管道、HTTP 路由

## 6. 数据结构

**ActiveSession**（核心接口，`worker-types.ts:10-39`）关键字段：
- `sessionDbId`: 数据库自增 ID
- `contentSessionId`: Claude Code 内容会话 ID
- `memorySessionId`: 记忆系统会话 ID（可 null）
- `pendingMessages`: 待处理消息队列
- `abortController`: 用于取消生成
- `generatorPromise`: 异步生成器 Promise
- `cumulativeInputTokens` / `cumulativeOutputTokens`: token 累计统计
- `consecutiveRestarts`: 连续重启计数
- `abortReason`: 中止原因枚举
- `modelOverride`: 模型覆盖

**DatabaseStats**（`worker-types.ts:184-195`）：
```typescript
{
  totalObservations: number;
  totalSessions: number;
  totalPrompts: number;
  totalSummaries: number;
  projectCounts: Record<string, { observations, sessions, prompts, summaries }>;
}
```

## 7. 复杂逻辑图示

不适用（纯类型定义文件）。

## 8. 逆向备注

- `ActiveSession` 接口包含 `forceInit?: boolean`、`idleTimedOut?: boolean`、`lastSummaryStored?: boolean`、`respawnTimer?` 等可选字段，这些是运行时状态标记，不属于持久化数据 (`worker-types.ts:31-38`)。
- `abortReason` 类型为字符串联合加 `string | null`，既有枚举值又允许自定义字符串，说明中止原因可能由外部模块扩展 (`worker-types.ts:37`)。
- `SSEClient` 直接别名化为 `Response`，表明 SSE 推送直接通过 Express Response 对象实现，不使用专门的 SSE 库 (`worker-types.ts:76`)。
- `Observation` 接口中有 `user_name?: string | null` 可选字段，注释说明是"OS username captured when this row's session was created" (`worker-types.ts:114-115`)。
