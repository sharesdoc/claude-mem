# projects.ts（Postgres）需求说明

> 源文件：`src/storage/postgres/projects.ts` ｜ 类型：源码 ｜ 行数：66 ｜ 所属模块：storage/postgres ｜ 分析日期：2026-07-23

## 1. 文件定位总述

本文件是 PostgreSQL 存储层中项目（Project）实体的 Repository 实现，提供项目的创建和按 ID+团队范围查询的能力。它与 SQLite 版 `ProjectsRepository` 形成双存储引擎的平行实现，但字段结构不同（Postgres 版使用 `team_id` 替代 SQLite 版的 `slug`/`root_path`），适配 Server 模式下多团队架构。

## 2. 功能需求

| 编号 | 需求描述（系统应当…） | 触发条件 / 输入 | 处理规则与输出 | 证据 |
|------|----------------------|----------------|---------------|------|
| FR-proj-create-01 | 系统应当创建新项目 | 调用 `create(input)` | 输入包含 teamId、name、可选 metadata 和 id；若未提供 id 则自动生成 UUID；metadata 以 jsonb 类型存储；返回完整的 `PostgresProject` | `src/storage/postgres/projects.ts:27-44` |
| FR-proj-get-01 | 系统应当在指定团队范围内按 ID 查询项目 | 调用 `getByIdForTeam(id, teamId)` | SQL 同时匹配 id 和 team_id，实现租户隔离查询；未找到返回 null | `src/storage/postgres/projects.ts:46-53` |

## 3. 业务规则与约束

1. **租户隔离**：查询接口 `getByIdForTeam` 强制携带 teamId 参数，WHERE 条件同时匹配 `id = $1 AND team_id = $2`，确保跨团队不可见。`src/storage/postgres/projects.ts:49`
2. **metadata 默认值**：创建时 metadata 未提供时存储为 `{}`（空 JSON 对象）。`src/storage/postgres/projects.ts:41`
3. **ID 生成**：支持外部指定 ID（`input.id`），未指定时由 `newId()` 生成 UUID。`src/storage/postgres/projects.ts:33`

## 4. 对外暴露

| 名称 | 类型 | 签名 | 说明 |
|------|------|------|------|
| `PostgresProject` | exported interface | `{ id, teamId, name, metadata, createdAtEpoch, updatedAtEpoch }` | 项目实体 |
| `PostgresProjectsRepository` | exported class | 构造函数接收 `PostgresQueryable` | 项目 Repository |
| `create()` | public async method | `(input) => Promise<PostgresProject>` | 创建项目 |
| `getByIdForTeam()` | public async method | `(id, teamId) => Promise<PostgresProject \| null>` | 团队范围内查询 |

## 5. 依赖关系

- **上游依赖**：`./utils.js`（`newId`, `queryOne`, `toEpoch`, `toJsonObject`）
- **下游调用方**：通过 `./index.ts` barrel 导出被 `createPostgresStorageRepositories` 组装进 `PostgresStorageRepositories`

## 6. 数据结构

### PostgresProject

| 字段 | 类型 | 说明 |
|------|------|------|
| id | string | 项目 UUID |
| teamId | string | 所属团队 ID |
| name | string | 项目名称 |
| metadata | JsonObject | JSON 元数据 |
| createdAtEpoch | number | 创建时间（epoch ms） |
| updatedAtEpoch | number | 更新时间（epoch ms） |

## 7. 复杂逻辑图示

不适用。

## 8. 逆向备注

1. **与 SQLite 版差异**：SQLite 版 `ProjectsRepository` 有 `upsert`、`getByRootPath`、`list` 等方法，Postgres 版仅有 `create` 和 `getByIdForTeam`，能力子集。推断 Postgres 版按需实现，尚未完全对齐。
