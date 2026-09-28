# get.ts 需求说明

> 源文件：src/services/sqlite/prompts/get.ts ｜ 类型：源码 ｜ 行数：168 ｜ 所属模块：sqlite/prompts ｜ 分析日期：2026-07-23

## 1. 文件定位总述

get.ts 是 user_prompts 表的只读查询层，提供按会话+序号、会话最新、文本去重检测、全局最近、ID 单条、ID 批量等多种维度的用户提示查询功能。它是提示去重、上下文注入和搜索结果展示链路中的数据获取组件。查询大多通过 JOIN sdk_sessions 表获取关联的项目信息，支持 project 过滤和排序控制。

## 2. 功能需求

| 编号 | 需求描述（系统应当…） | 触发条件 / 输入 | 处理规则与输出 | 证据 |
|------|----------------------|----------------|---------------|------|
| FR-GET-01 | 系统应当按会话和序号获取用户提示文本 | 调用 getUserPrompt(db, contentSessionId, promptNumber) | 查询 user_prompts 表，返回 prompt_text 或 null | `get.ts:8-22` |
| FR-COUNT-01 | 系统应当统计会话中的提示数量 | 调用 getPromptNumberFromUserPrompts(db, contentSessionId) | 返回 COUNT(*) 结果 | `get.ts:24-29` |
| FR-LATEST-01 | 系统应当获取会话的最新提示及关联信息 | 调用 getLatestUserPrompt(db, contentSessionId) | JOIN sdk_sessions 获取 memory_session_id 和 project，按 created_at_epoch DESC LIMIT 1 | `get.ts:31-48` |
| FR-DUPCHECK-01 | 系统应当检测指定时间窗口内的重复提示 | 调用 findRecentDuplicateUserPrompt(db, contentSessionId, promptText, windowMs) | 在时间窗口内查找相同 contentSessionId + promptText 的记录；回退到 DEFAULT_PLATFORM_SOURCE 作为 platform_source 默认值 | `get.ts:50-73` |
| FR-RECENT-01 | 系统应当获取全局最近的用户提示列表 | 调用 getAllRecentUserPrompts(db, limit) | LEFT JOIN sdk_sessions 获取 project，按 created_at_epoch DESC 排序，默认限制 100 条 | `get.ts:75-95` |
| FR-BYID-01 | 系统应当按 ID 获取单条提示及项目信息 | 调用 getPromptById(db, id) | LEFT JOIN sdk_sessions 获取 project，返回 PromptWithProject 或 null | `get.ts:97-114` |
| FR-BYIDS-01 | 系统应当按 ID 批量获取提示 | 调用 getPromptsByIds(db, ids) | WHERE id IN (...) 构建，按 created_at_epoch DESC 排序；空 IDs 返回空数组 | `get.ts:116-136` |
| FR-GETBYIDS-FULL-01 | 系统应当按 ID 批量获取完整提示记录 | 调用 getUserPromptsByIds(db, ids, options) | JOIN sdk_sessions 获取 project 和 memory_session_id；支持 project 过滤、排序、limit；空 IDs 返回空数组 | `get.ts:138-167` |

## 3. 业务规则与约束

- **空值保护**：所有批量查询在 ids 为空数组时直接返回空结果，避免无效 SQL (`get.ts:22,117,142`)
- **默认限制**：getAllRecentUserPrompts 默认 limit 100 (`get.ts:78`)
- **排序默认**：批量查询默认按 created_at_epoch DESC (`get.ts:133,147`)
- **重复检测窗口**：findRecentDuplicateUserPrompt 基于 epoch 时间差计算截止点 (`get.ts:56`)
- **platform_source 回退**：findRecentDuplicateUserPrompt 中使用 COALESCE 将空 platform_source 替换为 DEFAULT_PLATFORM_SOURCE (`get.ts:62`)

## 4. 对外暴露

| 公开函数 | 签名 | 说明 |
|---------|------|------|
| getUserPrompt | (db, contentSessionId, promptNumber): string \| null | 按会话+序号获取提示文本 |
| getPromptNumberFromUserPrompts | (db, contentSessionId): number | 统计会话提示数 |
| getLatestUserPrompt | (db, contentSessionId): LatestPromptResult \| undefined | 获取最新提示 |
| findRecentDuplicateUserPrompt | (db, contentSessionId, promptText, windowMs): LatestPromptResult \| undefined | 重复提示检测 |
| getAllRecentUserPrompts | (db, limit?): RecentUserPromptResult[] | 获取全局最近提示 |
| getPromptById | (db, id): PromptWithProject \| null | 按 ID 获取单条 |
| getPromptsByIds | (db, ids[]): PromptWithProject[] | 按 ID 批量获取 |
| getUserPromptsByIds | (db, ids[], options?): UserPromptRecord[] | 按 ID 批量获取完整记录 |

## 5. 依赖关系

- **上游调用**：SessionManager（重复检测）、ObservationCompiler、搜索处理器
- **类型依赖**：UserPromptRecord、LatestPromptResult、RecentUserPromptResult、PromptWithProject、GetPromptsByIdsOptions
- **数据库表**：user_prompts、sdk_sessions（JOIN）
- **常量**：DEFAULT_PLATFORM_SOURCE

## 6. 数据结构

消费多种 Result 类型（LatestPromptResult、RecentUserPromptResult、PromptWithProject），均定义在 `./types.ts` 和 `../../../types/database.ts`。

## 7. 复杂逻辑图示

不适用（该文件为一系列独立的查询函数，每个函数逻辑线性）。

## 8. 逆向备注

- getPromptsByIds 和 getUserPromptsByIds 是两个相似但不同的批量查询：前者返回 PromptWithProject（轻量），后者返回 UserPromptRecord（完整），供不同场景使用 (`get.ts:116-136 vs 138-167`)。
- findRecentDuplicateUserPrompt 中的 SQL 使用字符串模板嵌入 DEFAULT_PLATFORM_SOURCE 常量，而非参数化查询——这是唯一一个非完全参数化的查询 (`get.ts:62`)。
- getPromptById 使用 `(result as ...) || null` 模式确保 undefined 被转为 null，与 getUserPrompt 的 `?. ?? null` 模式不一致 (`get.ts:113 vs 21`)。
