# session.ts 需求说明

> 源文件：src/core/schemas/session.ts ｜ 类型：源码 ｜ 行数：38 ｜ 所属模块：core/schemas ｜ 分析日期：2026-07-23

## 1. 文件定位总述

本文件定义了 `ServerSession`（服务器会话）实体的 Zod Schema 及其创建专用 Schema。ServerSession 是 claude-mem 会话管理的核心模型，代表一次 AI 编程会话的完整生命周期，支持 active、completed、failed 三种状态。它与 Project 多对一关联，并可同时关联 contentSessionId 和 memorySessionId 两个不同维度的会话标识。

## 2. 功能需求

| 编号 | 需求描述（系统应当…） | 触发条件 / 输入 | 处理规则与输出 | 证据 |
|------|----------------------|----------------|---------------|------|
| FR-SESS-01 | 系统应当定义 ServerSessionStatus 枚举 Schema，限定会话状态为 active、completed、failed | 会话创建/状态变更校验 | 仅接受三种枚举值 | `session.ts:5` |
| FR-SESS-02 | 系统应当定义 ServerSession 完整 Schema，包含 id、projectId、contentSessionId、memorySessionId、platformSource、title、status、metadata、startedAtEpoch、completedAtEpoch、updatedAtEpoch | 创建/校验 ServerSession 对象 | id、projectId、startedAtEpoch、updatedAtEpoch 必填；其余可选有默认值；status 默认 active | `session.ts:7-19` |
| FR-SESS-03 | 系统应当定义 CreateServerSession Schema，排除系统字段（id、startedAtEpoch、status、completedAtEpoch、updatedAtEpoch），并将其余多个字段设为可选 | 创建新会话时校验输入 | 必填字段仅为 projectId | `session.ts:21-33` |
| FR-SESS-04 | 系统应当推导 ServerSessionStatus、ServerSession、CreateServerSession 三个 TypeScript 类型 | 外部模块导入 | 从各自 Schema 推导 | `session.ts:35-37` |

## 3. 业务规则与约束

- 会话状态枚举为三态：`active`（进行中）、`completed`（已完成）、`failed`（失败）。`session.ts:5`
- 新建会话的 `status` 默认为 `active`。`session.ts:14`
- `platformSource` 默认为 `'claude'`，标识产生会话的平台来源。`session.ts:12`
- `contentSessionId` 和 `memorySessionId` 均可选，支持双维度会话追踪。`session.ts:10-11`
- `completedAtEpoch` 仅在会话结束时设置，默认 null。`session.ts:17`

## 4. 对外暴露

| 导出名 | 类型 | 说明 |
|--------|------|------|
| `ServerSessionStatusSchema` | `z.ZodEnum` | 会话状态枚举 Schema |
| `ServerSessionSchema` | `z.ZodObject` | ServerSession 完整校验 Schema |
| `CreateServerSessionSchema` | `z.ZodObject` | 创建会话时输入 Schema |
| `ServerSessionStatus` | TypeScript type | 状态枚举类型 |
| `ServerSession` | TypeScript type | 从 ServerSessionSchema 推导 |
| `CreateServerSession` | TypeScript type | 从 CreateServerSessionSchema 推导 |

共 6 个公开导出。

## 5. 依赖关系

- 外部依赖：`zod`

## 6. 数据结构

```
ServerSession {
  id: string              // 必填，系统生成
  projectId: string       // 必填，所属项目
  contentSessionId: string | null  // 可选，默认 null
  memorySessionId: string | null  // 可选，默认 null
  platformSource: string  // 可选，默认 "claude"
  title: string | null    // 可选，默认 null
  status: "active" | "completed" | "failed"  // 默认 "active"
  metadata: Record<string, unknown>  // 可选，默认 {}
  startedAtEpoch: number  // 必填，非负整数
  completedAtEpoch: number | null  // 可选，默认 null
  updatedAtEpoch: number  // 必填，非负整数
}

CreateServerSession {
  projectId: string       // 必填
  contentSessionId?: string
  memorySessionId?: string
  platformSource?: string   // 默认 "claude"
  title?: string
  metadata?: Record<string, unknown>
}
```

## 7. 复杂逻辑图示

不适用——纯 Schema 定义文件。

## 8. 逆向备注

无。
