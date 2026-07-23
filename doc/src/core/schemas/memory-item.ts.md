# memory-item.ts 需求说明

> 源文件：src/core/schemas/memory-item.ts ｜ 类型：源码 ｜ 行数：73 ｜ 所属模块：core/schemas ｜ 分析日期：2026-07-23

## 1. 文件定位总述

本文件定义了 `MemoryItem`（记忆条目）和 `MemorySource`（记忆来源）两个核心实体的 Zod Schema 及其创建专用 Schema。MemoryItem 是 claude-mem 记忆系统的核心数据模型，代表一条经过 AI 压缩或用户手动创建的记忆单元，支持多种类型（observation、summary、prompt、manual），并携带关联的文件列表、事实列表、概念标签等丰富元数据。MemorySource 记录记忆条目的溯源信息。该文件是 Schema 层中被依赖最多的模块之一。

## 2. 功能需求

| 编号 | 需求描述（系统应当…） | 触发条件 / 输入 | 处理规则与输出 | 证据 |
|------|----------------------|----------------|---------------|------|
| FR-MI-01 | 系统应当定义 MemoryItemKind 枚举 Schema，限定记忆类型为 observation、summary、prompt、manual | 记忆条目创建/分类 | 仅接受四种枚举值 | `memory-item.ts:5` |
| FR-MI-02 | 系统应当定义 MemorySourceType 枚举 Schema，限定来源类型为 observation、session_summary、user_prompt、manual、import | 记忆溯源记录 | 仅接受五种枚举值 | `memory-item.ts:6` |
| FR-MI-03 | 系统应当定义 MemoryItem 完整 Schema，包含 id、projectId、serverSessionId、legacyObservationId、kind、type、title、subtitle、text、narrative、facts、concepts、filesRead、filesModified、metadata、createdAtEpoch、updatedAtEpoch | 创建/校验记忆条目 | id、projectId、kind、type 必填；其余大多可选有默认值 | `memory-item.ts:8-26` |
| FR-MI-04 | 系统应当定义 CreateMemoryItem Schema，排除 id、createdAtEpoch、updatedAtEpoch，并将 serverSessionId、legacyObservationId、title、subtitle、text、narrative、facts、concepts、filesRead、filesModified、metadata 设为可选 | 创建新记忆条目时校验输入 | 必填字段为 projectId、kind、type | `memory-item.ts:28-44` |
| FR-MI-05 | 系统应当定义 MemorySource 完整 Schema，包含 id、memoryItemId、sourceType、legacyTable、legacyId、sourceUri、metadata、createdAtEpoch | 创建/校验记忆来源 | id、memoryItemId、sourceType 必填；其余可选 | `memory-item.ts:46-55` |
| FR-MI-06 | 系统应当定义 CreateMemorySource Schema，排除 id、createdAtEpoch，并将 legacyTable、legacyId、sourceUri、metadata 设为可选 | 创建新记忆来源时校验输入 | 必填字段为 memoryItemId、sourceType | `memory-item.ts:57-65` |
| FR-MI-07 | 系统应当推导 MemoryItemKind、MemoryItem、CreateMemoryItem、MemorySourceType、MemorySource、CreateMemorySource 六个 TypeScript 类型 | 外部模块导入 | 从各自 Schema 推导 | `memory-item.ts:67-72` |

## 3. 业务规则与约束

- 记忆类型（kind）为四类：`observation`（观测）、`summary`（摘要）、`prompt`（提示词）、`manual`（手动）。`memory-item.ts:5`
- 记忆来源类型（sourceType）为五类：`observation`、`session_summary`、`user_prompt`、`manual`、`import`。`memory-item.ts:6`
- `legacyObservationId` 可选，用于从旧版 observation 表迁移时的关联。`memory-item.ts:12`
- `facts` 和 `concepts` 均为字符串数组，用于结构化存储从观测中提取的事实和概念标签。`memory-item.ts:19-20`
- `filesRead` 和 `filesModified` 记录与该记忆条目关联的文件操作列表。`memory-item.ts:21-22`
- `type` 字段为必填自由字符串（与 kind 枚举独立），用于更细粒度的分类标识。`memory-item.ts:14`
- MemorySource 的 `sourceUri` 可选，支持通过 URI 标识外部来源。`memory-item.ts:52`

## 4. 对外暴露

| 导出名 | 类型 | 说明 |
|--------|------|------|
| `MemoryItemKindSchema` | `z.ZodEnum` | 记忆类型枚举 |
| `MemorySourceTypeSchema` | `z.ZodEnum` | 记忆来源类型枚举 |
| `MemoryItemSchema` | `z.ZodObject` | MemoryItem 完整校验 Schema |
| `CreateMemoryItemSchema` | `z.ZodObject` | 创建记忆时输入 Schema |
| `MemorySourceSchema` | `z.ZodObject` | MemorySource 完整校验 Schema |
| `CreateMemorySourceSchema` | `z.ZodObject` | 创建记忆来源时输入 Schema |
| `MemoryItemKind` | TypeScript type | 记忆类型 |
| `MemoryItem` | TypeScript type | 从 MemoryItemSchema 推导 |
| `CreateMemoryItem` | TypeScript type | 从 CreateMemoryItemSchema 推导 |
| `MemorySourceType` | TypeScript type | 来源类型 |
| `MemorySource` | TypeScript type | 从 MemorySourceSchema 推导 |
| `CreateMemorySource` | TypeScript type | 从 CreateMemorySourceSchema 推导 |

共 12 个公开导出。

## 5. 依赖关系

- 外部依赖：`zod`
- 被依赖：被 `context-pack.ts` 导入（MemoryItemSchema 作为 items 数组元素的校验）

## 6. 数据结构

```
MemoryItem {
  id: string              // 必填，系统生成
  projectId: string       // 必填
  serverSessionId: string | null  // 可选，默认 null
  legacyObservationId: number | null  // 可选，默认 null
  kind: "observation" | "summary" | "prompt" | "manual"  // 必填
  type: string            // 必填，自由字符串
  title: string | null    // 可选，默认 null
  subtitle: string | null // 可选，默认 null
  text: string | null    // 可选，默认 null
  narrative: string | null // 可选，默认 null
  facts: string[]         // 可选，默认 []
  concepts: string[]      // 可选，默认 []
  filesRead: string[]     // 可选，默认 []
  filesModified: string[] // 可选，默认 []
  metadata: Record<string, unknown>  // 可选，默认 {}
  createdAtEpoch: number  // 必填
  updatedAtEpoch: number  // 必填
}

MemorySource {
  id: string              // 必填，系统生成
  memoryItemId: string    // 必填，关联的记忆条目
  sourceType: MemorySourceType  // 必填
  legacyTable: string | null  // 可选，默认 null
  legacyId: number | null // 可选，默认 null
  sourceUri: string | null // 可选，默认 null
  metadata: Record<string, unknown>  // 可选，默认 {}
  createdAtEpoch: number  // 必填
}
```

## 7. 复杂逻辑图示

不适用——纯 Schema 定义文件。

## 8. 逆向备注

无。
