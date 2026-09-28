# context-pack.ts 需求说明

> 源文件：src/core/schemas/context-pack.ts ｜ 类型：源码 ｜ 行数：16 ｜ 所属模块：core/schemas ｜ 分析日期：2026-07-23

## 1. 文件定位总述

本文件定义了 `ContextPack` 的 Zod Schema 及推导类型。ContextPack 是一个面向会话上下文注入的聚合数据结构，将一组 MemoryItem 打包为可携带 token 预算的上下文包，供 hook 层在会话初始化或 prompt 提交时注入 Claude 上下文。它是 memory-item 的上层容器，位于 Schema 层级体系的消费者端。

## 2. 功能需求

| 编号 | 需求描述（系统应当…） | 触发条件 / 输入 | 处理规则与输出 | 证据 |
|------|----------------------|----------------|---------------|------|
| FR-CP-01 | 系统应当定义 ContextPack 的校验 Schema，包含 projectId、serverSessionId、generatedAtEpoch、tokenBudget、items、metadata 字段 | 创建/校验 ContextPack 对象 | projectId 非空字符串必填；serverSessionId 默认 null；generatedAtEpoch 非负整数必填；tokenBudget 默认 null；items 默认空数组；metadata 默认空对象 | `context-pack.ts:6-13` |
| FR-CP-02 | 系统应当推导 ContextPack TypeScript 类型 | 导入 Schema 的模块 | 从 ContextPackSchema 推导出 `ContextPack` 类型 | `context-pack.ts:15` |

## 3. 业务规则与约束

- `projectId` 为必填字段且长度至少为 1，ContextPack 必须归属于一个项目。`context-pack.ts:7`
- `generatedAtEpoch` 为必填非负整数，标识上下文包的生成时间戳。`context-pack.ts:9`
- `tokenBudget` 可选（默认 null），表示上下文注入时的 token 上限。`context-pack.ts:10`
- `items` 内部元素须通过 MemoryItemSchema 校验，默认为空数组。`context-pack.ts:11`
- `serverSessionId` 可选，支持将上下文包关联到特定服务器会话。`context-pack.ts:8`

## 4. 对外暴露

| 导出名 | 类型 | 说明 |
|--------|------|------|
| `ContextPackSchema` | `z.ZodObject` | ContextPack Zod 校验 Schema |
| `ContextPack` | TypeScript type | 从 Schema 推导的类型 |

共 2 个公开导出。

## 5. 依赖关系

- 外部依赖：`zod`
- 内部依赖：`./memory-item.js`（MemoryItemSchema）

## 6. 数据结构

```
ContextPack {
  projectId: string          // 必填，所属项目 ID
  serverSessionId: string | null  // 可选，默认 null
  generatedAtEpoch: number  // 必填，非负整数，生成时间戳
  tokenBudget: number | null // 可选，默认 null，token 上限
  items: MemoryItem[]        // 默认空数组
  metadata: Record<string, unknown> // 默认空对象
}
```

## 7. 复杂逻辑图示

不适用——纯 Schema 定义文件，无流程逻辑。

## 8. 逆向备注

无。
