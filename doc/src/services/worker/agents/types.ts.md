# types.ts (agents) 需求说明

> 源文件：src/services/worker/agents/types.ts | 类型：源码 | 行数：102 | 所属模块：worker/agents | 分析日期：2026-07-23

## 1. 文件定位总述

本文件是 Agent 子系统的类型定义中心，统一定义了 Agent 处理管线中涉及的 SSE 事件载荷、存储结果、处理上下文、解析结果和 Agent 配置等核心数据结构。同时导出了 `FALLBACK_ERROR_PATTERNS` 常量，用于 Agent 错误恢复的模式匹配。这些类型是 Agent 响应解析 -> 观察/摘要存储 -> SSE 广播整个数据流的契约。

## 2. 功能需求

作为纯类型/常量定义文件，不承载功能需求。核心能力是为 Agent 子系统提供类型安全的数据契约和错误模式常量。

## 3. 业务规则与约束

- **降级错误模式**：`FALLBACK_ERROR_PATTERNS` 定义了 8 种需要触发错误恢复的 HTTP/网络错误模式：429（限流）、500/502/503（服务端错误）、ECONNREFUSED（连接拒绝）、ETIMEDOUT（超时）、fetch failed（网络故障）。`src/services/worker/agents/types.ts:93-101`
- **SSE 载荷双类型**：SSEEventPayload 是包含 new_observation 和 new_summary 两种事件的联合类型，共享 created_at、created_at_epoch、content_hash 等字段。`src/services/worker/agents/types.ts:66-68`
- **content_hash 字段**：ObservationSSEPayload 和 SummarySSEPayload 都包含可选的 `content_hash` 字段，用于本地+同步源的跨源去重。`src/services/worker/agents/types.ts:44,63`
- **user_label 字段**：SSE 载荷中包含可选的 user_label，注释说明 Viewer 用它来更新 project->user 映射。`src/services/worker/agents/types.ts:40-41`

## 4. 对外暴露

| 名称 | 类型 | 说明 |
|------|------|------|
| `WorkerRef` | 接口 | Worker 引用（SSE 广播 + 同步代理） |
| `ObservationSSEPayload` | 接口 | 观察 SSE 事件载荷 |
| `SummarySSEPayload` | 接口 | 摘要 SSE 事件载荷 |
| `SSEEventPayload` | 联合类型 | SSE 事件载荷（观察或摘要） |
| `StorageResult` | 接口 | 存储结果（observationIds + summaryId） |
| `ResponseProcessingContext` | 接口 | 响应处理上下文 |
| `ParsedResponse` | 接口 | 解析后的响应（观察 + 摘要） |
| `BaseAgentConfig` | 接口 | Agent 基础配置 |
| `FALLBACK_ERROR_PATTERNS` | 常量 | 降级错误模式列表 |

## 5. 依赖关系

- **worker-types.ts**（`../../worker-types.js`）：提供 ActiveSession 类型
- **parser.ts**（`../../../sdk/parser.js`）：提供 ParsedObservation、ParsedSummary 类型

## 6. 数据结构

**ObservationSSEPayload**（核心 SSE 载荷）：
```typescript
{
  id: number;
  memory_session_id: string | null;
  session_id: string;
  platform_source: string;
  type: string;
  title: string | null;
  subtitle: string | null;
  text: string | null;
  narrative: string | null;
  facts: string;
  concepts: string;
  files_read: string;
  files_modified: string;
  project: string;
  prompt_number: number;
  user_name?: string | null;
  user_label?: string | null;
  created_at: string;
  created_at_epoch: number;
  content_hash?: string | null;
}
```

**WorkerRef**（Worker 引用接口）：
```typescript
{
  sseBroadcaster?: { broadcast(event: SSEEventPayload): void };
  broadcastProcessingStatus?: () => void;
  syncAgent?: { scheduleSoon(): void };
}
```

## 7. 复杂逻辑图示

不适用（纯类型定义文件）。

## 8. 逆向备注

- `WorkerRef` 的 `syncAgent` 是可选的，注释说明 client-only/disabled-sync 安装不运行同步代理。这表明系统支持两种部署模式：带同步和不带同步。
