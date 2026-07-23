# get.ts (summaries) 需求说明

> 源文件：src/services/sqlite/summaries/get.ts | 类型：源码 | 行数：61 | 所属模块：sqlite/summaries | 分析日期：2026-07-23

## 1. 文件定位总述

本文件是 `session_summaries` 表的只读查询层，提供三种查询方式：按 memory_session_id 获取最近摘要、按主键 id 获取单条记录、按 id 列表批量获取并支持过滤排序。它是摘要数据从 SQLite 数据库到上层业务逻辑的数据通道，服务于上下文注入、搜索和 Viewer 展示等场景。

## 2. 功能需求

| 编号 | 需求描述（系统应当…） | 触发条件 / 输入 | 处理规则与输出 | 证据 |
|------|----------------------|----------------|---------------|------|
| FR-SummaryGet-01 | 系统应当根据 memory_session_id 获取该会话最近一条摘要 | 调用 `getSummaryForSession`，传入 db 和 memorySessionId | 按 `created_at_epoch DESC` 排序取第一条，返回 `SessionSummary` 或 null | `src/services/sqlite/summaries/get.ts:6-22` |
| FR-SummaryGet-02 | 系统应当根据主键 id 获取摘要完整记录 | 调用 `getSummaryById`，传入 db 和 id | 执行 `SELECT * FROM session_summaries WHERE id = ?`，返回 `SessionSummaryRecord` 或 null | `src/services/sqlite/summaries/get.ts:24-33` |
| FR-SummaryGet-03 | 系统应当根据 id 列表批量获取摘要并支持过滤和排序 | 调用 `getSummariesByIds`，传入 db、ids 数组和可选 options | 空数组直接返回空结果。支持 `orderBy`（date_desc/date_asc）、`limit`、`project` 过滤选项。返回 `SessionSummaryRecord[]` | `src/services/sqlite/summaries/get.ts:35-61` |

## 3. 业务规则与约束

- **空数组快速返回**：`getSummariesByIds` 在 ids 为空数组时直接返回 `[]`，避免生成无效 SQL。`src/services/sqlite/summaries/get.ts:41`
- **默认排序**：批量查询默认按 `created_at_epoch DESC` 排序（最近的优先）。`src/services/sqlite/summaries/get.ts:43`
- **可选项目过滤**：当 `options.project` 有值时，在 WHERE 子句追加 `AND project = ?` 条件。`src/services/sqlite/summaries/get.ts:48-51`

## 4. 对外暴露

| 名称 | 类型 | 说明 |
|------|------|------|
| `getSummaryForSession(db, memorySessionId)` | 函数 | 按 session id 获取最近摘要 |
| `getSummaryById(db, id)` | 函数 | 按主键获取摘要记录 |
| `getSummariesByIds(db, ids, options?)` | 函数 | 按 id 列表批量获取摘要 |

## 5. 依赖关系

- **bun:sqlite**（`Database` 类型）：SQLite 数据库连接
- **SessionSummary / SessionSummaryRecord**（`../../../types/database.js`）：数据库记录类型
- **GetByIdsOptions**（`./types.js`）：批量查询选项类型
- **logger**（`../../../utils/logger.js`）：日志工具（已导入但本文件中未显式使用）

## 6. 数据结构

**SessionSummary**（返回类型，`getSummaryForSession`）：包含 request、investigated、learned、completed、next_steps、files_read、files_edited、notes、prompt_number、created_at、created_at_epoch 字段。

**GetByIdsOptions**（查询选项）：
```typescript
{
  orderBy?: 'date_desc' | 'date_asc';  // 默认 date_desc
  limit?: number;
  project?: string;
}
```

## 7. 复杂逻辑图示

不适用（纯查询层，逻辑直接）。

## 8. 逆向备注

- `logger` 已导入但未在本文件中调用。推断：（可能是从其他查询函数复制过来的遗留导入，或者预留用于后续调试）。
