# database.ts 需求说明

> 源文件：src/types/database.ts ｜ 类型：源码 ｜ 行数：76 ｜ 所属模块：types ｜ 分析日期：2026-07-23

## 1. 文件定位总述

本文件定义了 SQLite 存储层的全部数据模型类型。它涵盖数据库元信息（表列、索引、表名、版本）和四大核心业务实体——观察记录（ObservationRecord）、会话摘要（SessionSummaryRecord）、用户提示（UserPromptRecord）、最新提示查询结果（LatestPromptResult）。这些类型描述了 SQLite 数据库的行级结构，服务于项目本地的 claude-mem 核心存储（区别于 Server Beta 的 PostgreSQL 模式）。

## 2. 功能需求

| 编号 | 需求描述（系统应当…） | 触发条件 / 输入 | 处理规则与输出 | 证据 |
|------|----------------------|----------------|---------------|------|
| FR-DB-01 | 系统应当定义表列元信息类型 TableColumnInfo，包含 cid、name、type、notnull、pk 五个字段 | SQLite PRAGMA table_info() 结果映射 | 用于描述表的列结构 | `src/types/database.ts:2-8` |
| FR-DB-02 | 系统应当定义索引元信息类型 IndexInfo，包含 name、unique、origin、partial 四个字段 | SQLite PRAGMA index_list() 结果映射 | 用于描述表的索引结构 | `src/types/database.ts:10-15` |
| FR-DB-03 | 系统应当定义观察记录类型 ObservationRecord，type 字段限定为 6 种枚举值 | 观察数据查询结果映射 | type: 'decision' \| 'bugfix' \| 'feature' \| 'refactor' \| 'discovery' \| 'change' | `src/types/database.ts:31` |
| FR-DB-04 | 系统应当定义会话摘要类型 SessionSummaryRecord，包含 request/investigated/learned/completed/next_steps 五个文本字段 | 会话摘要查询结果映射 | 所有文本字段可为 null | `src/types/database.ts:39-52` |
| FR-DB-05 | 系统应当定义用户提示类型 UserPromptRecord，包含 content_session_id、prompt_number、prompt_text 三个核心字段 | 用户提示查询结果映射 | project 和 platform_source 为可选字段 | `src/types/database.ts:54-63` |
| FR-DB-06 | 系统应当定义最新提示查询结果类型 LatestPromptResult，关联 content_session_id 和 memory_session_id | 跨表查询结果 | 包含 platform_source、prompt_number、prompt_text 等字段 | `src/types/database.ts:65-74` |

## 3. 业务规则与约束

| 编号 | 规则描述 | 证据 |
|------|---------|------|
| BR-DB-01 | ObservationRecord.type 有 6 种固定值，代表不同类型的开发观察 | `src/types/database.ts:31` |
| BR-DB-02 | 时间字段同时存在 ISO 字符串形式（created_at）和 epoch 数字形式（created_at_epoch） | `src/types/database.ts:32-33,49-50` |

## 4. 对外暴露

| 导出项 | 类型 | 用途 |
|--------|------|------|
| `TableColumnInfo` | interface | 表列元信息 |
| `IndexInfo` | interface | 索引元信息 |
| `TableNameRow` | interface | 表名行 |
| `SchemaVersion` | interface | Schema 版本 |
| `ObservationRecord` | interface | 观察记录（本地 SQLite） |
| `SessionSummaryRecord` | interface | 会话摘要 |
| `UserPromptRecord` | interface | 用户提示 |
| `LatestPromptResult` | interface | 最新提示查询结果 |

## 5. 依赖关系

- **被依赖**：SQLite 存储层（`src/services/sqlite/` 目录下的各文件）、Viewer 前端的类型引用

## 6. 数据结构

### ObservationRecord（观察记录）
| 字段 | 类型 | 说明 |
|------|------|------|
| id | number | 自增主键 |
| memory_session_id | string | 关联的内存会话 ID |
| project | string | 项目名称 |
| text | string \| null | 观察文本 |
| type | 枚举 | decision/bugfix/feature/refactor/discovery/change |
| created_at | string | ISO 创建时间 |
| created_at_epoch | number | epoch 创建时间 |
| title | string? | 标题（可选） |
| concept | string? | 概念（可选） |
| prompt_number | number? | 提示序号（可选） |
| discovery_tokens | number? | 发现 token 数（可选） |

### SessionSummaryRecord（会话摘要）
| 字段 | 类型 | 说明 |
|------|------|------|
| request | string \| null | 请求内容 |
| investigated | string \| null | 调查内容 |
| learned | string \| null | 学到内容 |
| completed | string \| null | 完成内容 |
| next_steps | string \| null | 后续步骤 |

## 7. 复杂逻辑图示

不适用（纯类型定义文件）。

## 8. 逆向备注

- 本文件中所有类型使用 `string` 而非 `Date` 表示时间字段（created_at），与 PostgreSQL 模块中使用 epoch number 的风格不同，推断 SQLite 层直接存储 ISO 字符串。
- ObservationRecord 与 PostgresObservation（PostgreSQL 模块）结构差异较大：前者用数字 id + memory_session_id + project 名称，后者用字符串 id + projectId/teamId UUID。推断两套存储服务于不同场景（本地单用户 vs 服务端多租户）。
