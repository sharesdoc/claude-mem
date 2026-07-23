# agent-event.ts 需求说明

> 源文件：src/core/schemas/agent-event.ts ｜ 类型：源码 ｜ 行数：33 ｜ 所属模块：core/schemas ｜ 分析日期：2026-07-23

## 1. 文件定位总述

本文件定义了 `AgentEvent`（代理事件）实体的 Zod Schema 及其创建专用 Schema。AgentEvent 是 claude-mem 领域模型中的核心事件实体，用于记录 AI Agent 在会话中执行的各种事件（如工具调用、prompt 提交等）。它携带丰富的关联关系（projectId、serverSessionId、contentSessionId、memorySessionId），是记忆系统的事实来源基础。

## 2. 功能需求

| 编号 | 需求描述（系统应当…） | 触发条件 / 输入 | 处理规则与输出 | 证据 |
|------|----------------------|----------------|---------------|------|
| FR-AE-01 | 系统应当定义 AgentEventSourceType 枚举 Schema，限定事件来源为 hook、worker、provider、server、api 五种类型 | 事件创建/校验 | 仅接受五种枚举值 | `agent-event.ts:5` |
| FR-AE-02 | 系统应当定义 AgentEvent 完整 Schema，包含 id、projectId、serverSessionId、sourceType、eventType、payload、contentSessionId、memorySessionId、occurredAtEpoch、createdAtEpoch | 事件记录 | id、projectId、sourceType、eventType、occurredAtEpoch、createdAtEpoch 必填；其余可选有默认值 | `agent-event.ts:7-18` |
| FR-AE-03 | 系统应当定义 CreateAgentEvent Schema，排除 id 和 createdAtEpoch，并将 serverSessionId、payload、contentSessionId、memorySessionId 设为可选 | 创建新事件时校验输入 | 必填字段为 projectId、sourceType、eventType、occurredAtEpoch | `agent-event.ts:20-28` |
| FR-AE-04 | 系统应当推导 AgentEventSourceType、AgentEvent、CreateAgentEvent 三个 TypeScript 类型 | 外部模块导入 | 从各自 Schema 推导 | `agent-event.ts:30-32` |

## 3. 业务规则与约束

- `sourceType` 必须为 `hook | worker | provider | server | api` 五种之一。`agent-event.ts:5`
- `eventType` 为自由字符串，表示具体事件类型（如工具名称等）。`agent-event.ts:12`
- `payload` 类型为 `unknown`，允许任意结构的事件负载。`agent-event.ts:13`
- `occurredAtEpoch` 记录事件实际发生时间，由调用者提供。`agent-event.ts:16`
- `contentSessionId` 和 `memorySessionId` 均可选，用于关联不同维度的会话标识。`agent-event.ts:14-15`

## 4. 对外暴露

| 导出名 | 类型 | 说明 |
|--------|------|------|
| `AgentEventSourceTypeSchema` | `z.ZodEnum` | 事件来源枚举 Schema |
| `AgentEventSchema` | `z.ZodObject` | AgentEvent 完整校验 Schema |
| `CreateAgentEventSchema` | `z.ZodObject` | 创建事件时的输入校验 Schema |
| `AgentEventSourceType` | TypeScript type | 枚举类型 |
| `AgentEvent` | TypeScript type | 从 AgentEventSchema 推导 |
| `CreateAgentEvent` | TypeScript type | 从 CreateAgentEventSchema 推导 |

共 6 个公开导出。

## 5. 依赖关系

- 外部依赖：`zod`

## 6. 数据结构

```
AgentEvent {
  id: string              // 必填，系统生成
  projectId: string       // 必填，所属项目
  serverSessionId: string | null  // 可选，默认 null
  sourceType: "hook" | "worker" | "provider" | "server" | "api"  // 必填
  eventType: string       // 必填，自由字符串
  payload: unknown        // 可选，默认 {}
  contentSessionId: string | null  // 可选，默认 null
  memorySessionId: string | null  // 可选，默认 null
  occurredAtEpoch: number // 必填，非负整数
  createdAtEpoch: number  // 必填，非负整数
}

CreateAgentEvent {
  projectId: string       // 必填
  sourceType: AgentEventSourceType  // 必填
  eventType: string       // 必填
  occurredAtEpoch: number // 必填
  serverSessionId?: string
  payload?: unknown
  contentSessionId?: string
  memorySessionId?: string
}
```

## 7. 复杂逻辑图示

不适用——纯 Schema 定义文件。

## 8. 逆向备注

无。
