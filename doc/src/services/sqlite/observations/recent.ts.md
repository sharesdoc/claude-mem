# observations/recent.ts 需求说明

> 源文件：src/services/sqlite/observations/recent.ts ｜ 类型：源码 ｜ 行数：47 ｜ 所属模块：sqlite/observations ｜ 分析日期：2026-07-23

## 1. 文件定位总述

本文件提供观测记录的"最近"查询能力，支持三种查询维度：按项目查询最近的观测记录（精简字段）、跨项目查询全局最近观测记录（完整字段）、查询最早观测记录的创建时间。这些查询均按 `created_at_epoch` 降序排列并支持数量限制，服务于上下文注入、仪表盘展示和时间线起点计算等场景。

## 2. 功能需求

| 编号 | 需求描述（系统应当…） | 触发条件 / 输入 | 处理规则与输出 | 证据 |
|------|----------------------|----------------|---------------|------|
| FR-OR-01 | 系统应当能按项目查询最近的观测记录（精简字段） | 调用 `getRecentObservations(db, project, limit=20)` | 查询 `observations` 表按 `created_at_epoch DESC` 排序，返回 `type, text, prompt_number, created_at` | `src/services/sqlite/observations/recent.ts:6-19` |
| FR-OR-02 | 系统应当能跨项目查询全局最近观测记录（完整字段） | 调用 `getAllRecentObservations(db, limit=100)` | 查询全部项目的观测记录，返回含 `id, title, subtitle, project` 等完整字段 | `src/services/sqlite/observations/recent.ts:22-34` |
| FR-OR-03 | 系统应当能查询最早的观测记录创建时间，用于时间线起点 | 调用 `getFirstObservationCreatedAt(db)` | 按 `created_at_epoch ASC` 取第一条记录的 `created_at`，无记录返回 null | `src/services/sqlite/observations/recent.ts:36-46` |

## 3. 业务规则与约束

| 编号 | 规则描述 | 证据 |
|------|---------|------|
| BR-OR-01 | 按项目查询默认返回 20 条，全局查询默认返回 100 条 | `src/services/sqlite/observations/recent.ts:9` 和 `:25` |
| BR-OR-02 | 全部查询按 `created_at_epoch DESC` 排序（最新在前），最早记录查询为 ASC | `src/services/sqlite/observations/recent.ts:15` 和 `:38` |
| BR-OR-03 | 精简查询仅返回 4 个字段（type, text, prompt_number, created_at），减少数据传输量 | `src/services/sqlite/observations/recent.ts:12-13` |
| BR-OR-04 | 无记录时返回空数组（前两个函数）或 null（第三个函数） | 推断自 `stmt.all()` 和 `stmt.get()` 的 SQLite 行为 |

## 4. 对外暴露

| 导出项 | 类型 | 用途 |
|--------|------|------|
| `getRecentObservations` | 函数 | 按项目查询最近观测记录（精简） |
| `getAllRecentObservations` | 函数 | 跨项目查询全局最近观测记录（完整） |
| `getFirstObservationCreatedAt` | 函数 | 获取最早观测记录创建时间 |

## 5. 依赖关系

- **上游依赖**：`bun:sqlite`（`Database` 类型）、`../../../utils/logger.js`（已引入未使用）、`./types.js`（`RecentObservationRow`, `AllRecentObservationRow`）
- **下游消费者**：推断被上下文构建器、仪表盘 API、时间线渲染等模块引用

## 6. 数据结构

```typescript
// 精简行
interface RecentObservationRow {
  type: string;
  text: string;
  prompt_number: number | null;
  created_at: string;
}

// 完整行
interface AllRecentObservationRow {
  id: number;
  type: string;
  title: string | null;
  subtitle: string | null;
  text: string;
  project: string;
  prompt_number: number | null;
  created_at: string;
  created_at_epoch: number;
}
```

## 7. 复杂逻辑图示

不适用（三个独立的简单查询函数）。

## 8. 逆向备注

- `logger` 已导入但未使用，推断为预留。
- 三个查询函数的默认 limit 差异（20 vs 100）反映了不同使用场景的数据量需求：项目级精简快速、全局级需要更多数据覆盖。
