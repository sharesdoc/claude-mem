# types.ts 需求说明

> 源文件：src/services/sqlite/prompts/types.ts ｜ 类型：源码（类型定义） ｜ 行数：30 ｜ 所属模块：sqlite/prompts ｜ 分析日期：2026-07-23

## 1. 文件定位总述

本文件定义了用户提示词查询结果的数据结构类型，包括近期提示词结果、带项目信息的提示词和批量 ID 查询的选项参数。这些类型为提示词查询函数提供强类型的返回值和参数约束。

## 2. 功能需求

| 编号 | 需求描述（系统应当…） | 触发条件 / 输入 | 处理规则与输出 | 证据 |
|------|----------------------|----------------|---------------|------|
| FR-PromptTypes-01 | 系统应当定义 RecentUserPromptResult 类型，包含 id、content_session_id、project、prompt_number、prompt_text、created_at、created_at_epoch 字段 | 类型使用 | 作为近期提示词查询的返回类型 | `src/services/sqlite/prompts/types.ts:5-13` |
| FR-PromptTypes-02 | 系统应当定义 PromptWithProject 类型，与 RecentUserPromptResult 结构相同但语义上表示"带项目信息的提示词" | 类型使用 | 作为按 ID 批量查询的返回类型 | `src/services/sqlite/prompts/types.ts:15-23` |
| FR-PromptTypes-03 | 系统应当定义 GetPromptsByIdsOptions 类型，支持 orderBy、limit、project 三个可选参数 | 类型使用 | 作为批量查询的过滤选项 | `src/services/sqlite/prompts/types.ts:25-30` |

## 3. 业务规则与约束

- **排序选项约束**：orderBy 仅允许 `'date_desc' | 'date_asc'` 两个值（`src/services/sqlite/prompts/types.ts:26`）
- **project 过滤**：project 为可选参数，不传时不过滤（`src/services/sqlite/prompts/types.ts:28`）

## 4. 对外暴露

| 类别 | 名称 | 类型 | 说明 |
|------|------|------|------|
| 接口 | RecentUserPromptResult | interface | 近期提示词查询结果 |
| 接口 | PromptWithProject | interface | 带项目信息的提示词 |
| 接口 | GetPromptsByIdsOptions | interface | 按 ID 批量查询的选项 |

## 5. 依赖关系

- **上游**：`bun:sqlite`（Database 类型）、`../../../utils/logger.js`
- **下游**：prompts/get.js（查询函数使用这些类型）

## 6. 数据结构

```typescript
interface RecentUserPromptResult {
  id: number;
  content_session_id: string;
  project: string;
  prompt_number: number;
  prompt_text: string;
  created_at: string;
  created_at_epoch: number;
}

// PromptWithProject 与 RecentUserPromptResult 结构相同
// 但语义上用于不同的查询上下文

interface GetPromptsByIdsOptions {
  orderBy?: 'date_desc' | 'date_asc';
  limit?: number;
  project?: string;
}
```

## 7. 复杂逻辑图示

不适用。

## 8. 逆向备注

- `RecentUserPromptResult` 和 `PromptWithProject` 两个接口的字段完全相同，区别仅在语义命名上：前者用于"最近的提示词"查询，后者用于"按 ID 批量获取带项目信息的提示词"查询。
- `project` 字段在类型定义中存在，但 `store.ts` 中的 INSERT 语句未写入 project 字段，推断 project 字段通过 JOIN session 表获取而非存储在 user_prompts 表中。
