# summaries/recent.ts 需求说明

> 源文件：src/services/sqlite/summaries/recent.ts ｜ 类型：源码 ｜ 行数：56 ｜ 所属模块：sqlite/summaries ｜ 分析日期：2026-07-23

## 1. 文件定位总述

本文件提供摘要（Session Summary）的"最近"查询能力，支持三种查询维度：按项目查询最近摘要（含文件列表的完整摘要）、按项目查询最近摘要（含会话 ID 的精简版）、跨项目查询全局最近摘要（完整字段含项目名）。三种查询均按 `created_at_epoch` 降序排列并支持数量限制，服务于上下文注入、仪表盘展示和全局概览等场景。

## 2. 功能需求

| 编号 | 需求描述（系统应当…） | 触发条件 / 输入 | 处理规则与输出 | 证据 |
|------|----------------------|----------------|---------------|------|
| FR-SR-01 | 系统应当能按项目查询最近的摘要（完整版，含文件列表） | 调用 `getRecentSummaries(db, project, limit=10)` | 查询 `session_summaries` 表，返回含 request/investigated/learned/completed/next_steps/files_read/files_edited/notes/prompt_number/created_at 共 11 个字段 | `src/services/sqlite/summaries/recent.ts:5-21` |
| FR-SR-02 | 系统应当能按项目查询最近摘要（精简版，含会话 ID） | 调用 `getRecentSummariesWithSessionInfo(db, project, limit=3)` | 返回含 memory_session_id/request/learned/completed/next_steps/prompt_number/created_at 共 8 个字段 | `src/services/sqlite/summaries/recent.ts:23-39` |
| FR-SR-03 | 系统应当能跨项目查询全局最近摘要（完整字段含项目名） | 调用 `getAllRecentSummaries(db, limit=50)` | 返回含 id/project 等共 13 个字段 | `src/services/sqlite/summaries/recent.ts:41-55` |

## 3. 业务规则与约束

| 编号 | 规则描述 | 证据 |
|------|---------|------|
| BR-SR-01 | 三个查询的默认 limit 不同：项目完整 10 条、项目精简 3 条、全局 50 条 | `src/services/sqlite/summaries/recent.ts:9`、`:27`、`:44` |
| BR-SR-02 | 全部查询按 `created_at_epoch DESC` 排序（最新在前） | `src/services/sqlite/summaries/recent.ts:16`、`:32`、`:49` |
| BR-SR-03 | 精简版查询仅返回 3 条，推断用于"最近摘要快速预览"场景 | `src/services/sqlite/summaries/recent.ts:27` |

## 4. 对外暴露

| 导出项 | 类型 | 用途 |
|--------|------|------|
| `getRecentSummaries` | 函数 | 按项目查询最近摘要（完整版含文件列表） |
| `getRecentSummariesWithSessionInfo` | 函数 | 按项目查询最近摘要（精简版含会话 ID） |
| `getAllRecentSummaries` | 函数 | 跨项目查询全局最近摘要（完整版含项目名） |

## 5. 依赖关系

- **上游依赖**：`bun:sqlite`（`Database` 类型）、`../../../utils/logger.js`（已引入未使用）、`./types.js`（`RecentSummary`, `SummaryWithSessionInfo`, `FullSummary`）
- **下游消费者**：推断被上下文构建器、仪表盘 API、全局概览等模块引用

## 6. 数据结构

```typescript
// 完整摘要行（含文件列表）
interface RecentSummary {
  request/investigated/learned/completed/next_steps/files_read/files_edited/notes: string | null;
  prompt_number: number | null;
  created_at: string;
}

// 精简摘要行（含会话 ID）
interface SummaryWithSessionInfo {
  memory_session_id: string;
  request/learned/completed/next_steps: string | null;
  prompt_number: number | null;
  created_at: string;
}

// 全局完整摘要行（含项目名和 ID）
interface FullSummary {
  id: number;
  project: string;
  // ... 其余同 RecentSummary
  created_at_epoch: number;
}
```

## 7. 复杂逻辑图示

不适用（三个独立的简单查询函数）。

## 8. 逆向备注

- `logger` 已导入但未使用，推断为预留。
- 三种查询的默认 limit 差异反映了不同消费场景：精简版 3 条用于快速预览、项目版 10 条用于上下文注入、全局版 50 条用于仪表盘。
