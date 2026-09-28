# migrations.ts 需求说明

> 源文件：src/services/sqlite/migrations.ts ｜ 类型：源码 ｜ 行数：550 ｜ 所属模块：sqlite ｜ 分析日期：2026-07-23

## 1. 文件定位总述

本文件是 claude-mem 数据库 Schema 的全量版本化迁移定义中心。它导出 10 个有序 `Migration` 对象（migration001~migration010），覆盖从空白建库到 FTS5 全文检索、子代理身份追踪、ROI 令牌计量等全部表结构变更。文件同时导出外部迁移执行器（`MigrationRunner`）和迁移数组 `migrations`，供 `Database` 模块在启动时按版本号升序执行。该文件是数据库层的唯一 Schema 真理源，所有表、索引、触发器、虚拟表的"当前状态"均可通过对迁移序列的累积 up() 推导得出。

## 2. 功能需求

| 编号 | 需求描述（系统应当…） | 触发条件 / 输入 | 处理规则与输出 | 证据 |
|------|----------------------|----------------|---------------|------|
| FR-SCHEMA-01 | 系统应当在首次初始化时创建核心持久化表：sessions、memories、overviews、diagnostics、transcript_events，并为每张表建立项目维和时间维索引 | 数据库不存在或版本为 0 | up() 通过 CREATE TABLE IF NOT EXISTS 批量建表，外键指向 sessions 表，确保 CASCADE 删除；transcript_events 具有 (session_id, event_index) UNIQUE 约束 | `src/services/sqlite/migrations.ts:7-123` |
| FR-SCHEMA-02 | 系统应当为 memories 表扩展层次化记忆字段（title、subtitle、facts、concepts、files_touched），以支持结构化知识提取 | 迁移版本 < 2 | ALTER TABLE ADD COLUMN 添加 5 列，并创建 title、concepts 索引 | `src/services/sqlite/migrations.ts:125-148` |
| FR-SCHEMA-03 | 系统应当创建 streaming_sessions 表用于实时会话追踪，记录 content_session_id 与 memory_session_id 的映射 | 迁移版本 < 3 | 建表含 content_session_id UNIQUE、status 默认 'active'、时间戳字段 | `src/services/sqlite/migrations.ts:150-186` |
| FR-SCHEMA-04 | 系统应当建立 SDK Agent 架构相关表：sdk_sessions、observation_queue、observations、session_summaries，以支撑 AI 代理的处理管线 | 迁移版本 < 4 | 4 张表通过 memory_session_id 外键级联关联，sdk_sessions 的 status 字段带 CHECK 约束限定为 active/completed/failed | `src/services/sqlite/migrations.ts:188-281` |
| FR-SCHEMA-05 | 系统应当清除废弃的 streaming_sessions 和 observation_queue 表，避免孤立数据残留 | 迁移版本达到 5 | DROP TABLE IF EXISTS 两张表 | `src/services/sqlite/migrations.ts:283-328` |
| FR-SCHEMA-06 | 系统应当为 observations 和 session_summaries 创建 FTS5 全文检索虚拟表及同步触发器，以支持本地关键词搜索；当平台不支持 FTS5 时须优雅降级并跳过 | 迁移版本达到 6 | 先通过探测表 _fts5_probe 检测 FTS5 可用性，不可用则 warn 并 return；可用时建虚拟表、回填已有数据、建 INSERT/DELETE/UPDATE 三个触发器保持同步 | `src/services/sqlite/migrations.ts:330-433` |
| FR-SCHEMA-07 | 系统应当为 observations 和 session_summaries 添加 discovery_tokens 列，以追踪每次处理的 ROI 令牌消耗 | 迁移版本达到 7 | ALTER TABLE ADD COLUMN discovery_tokens INTEGER DEFAULT 0 | `src/services/sqlite/migrations.ts:435-449` |
| FR-SCHEMA-08 | 系统应当创建 observation_feedback 表，用于记录观察结果的使用反馈信号（如 injection、click 等） | 迁移版本达到 25（注意版本跳跃） | 建表含 observation_id 外键 CASCADE、signal_type 字段、session_db_id、metadata，建立 observation_id 和 signal_type 索引 | `src/services/sqlite/migrations.ts:451-472` |
| FR-SCHEMA-09 | 系统应当为 observations 表按需添加 generated_by_model 和 relevance_count 列，用于追踪生成模型及引用次数 | 迁移版本达到 26 | 先通过 PRAGMA table_info 检测列是否已存在，不存在则 ALTER TABLE ADD COLUMN；relevance_count 默认值 0 | `src/services/sqlite/migrations.ts:474-491` |
| FR-SCHEMA-10 | 系统应当为 observations 和 pending_messages 表添加子代理身份字段（agent_type、agent_id），以支持多代理场景下的身份追踪 | 迁移版本达到 27 | 先检测 pending_messages 表是否存在，存在则一并 ALTER；创建 agent_type 和 agent_id 索引 | `src/services/sqlite/migrations.ts:493-536` |
| FR-SCHEMA-11 | 系统应当导出按版本号升序排列的完整迁移数组，供迁移运行器顺序执行 | 模块加载时 | `migrations` 数组包含 migration001 至 migration010 共 10 项 | `src/services/sqlite/migrations.ts:538-549` |

## 3. 业务规则与约束

1. **外键策略**：sessions 表为主表，memories、overviews、transcript_events 通过 session_id 外键 ON DELETE CASCADE 关联；sdk_sessions 为主表，observation_queue、observations、session_summaries 通过 memory_session_id 外键 ON DELETE CASCADE 关联；diagnostics 使用 ON DELETE SET NULL 允许 session 被删除后诊断记录保留。`src/services/sqlite/migrations.ts:42,62,82,101,221,238,262`
2. **时间双存储**：所有表均同时存储 `created_at`（ISO 文本）和 `created_at_epoch`（毫秒时间戳整数），前者用于可读性，后者用于高效排序。`src/services/sqlite/migrations.ts:15-16,37-38`
3. **默认值约束**：sessions.source 默认 'compress'，memories.origin 默认 'transcript'，overviews.origin 默认 'claude'，diagnostics.severity 默认 'info'、origin 默认 'system'，streaming_sessions.status 默认 'active'，sdk_sessions.status 带 CHECK 约束限定三态。`src/services/sqlite/migrations.ts:18,41,61,77-78,168,202`
4. **FTS5 降级策略**：当 FTS5 不可用时，搜索回退到 ChromaDB 向量检索，迁移不阻塞。`src/services/sqlite/migrations.ts:333-339`
5. **版本号跳跃**：migration008 版本号为 25，migration009 为 26，migration010 为 27，存在非连续版本号跳跃（从 7 跳至 25），推断中间版本可能曾在其他分支创建后合并，或为保持与外部迁移系统兼容。`src/services/sqlite/migrations.ts:452,475,494`
6. **幂等性保障**：所有 up() 使用 CREATE TABLE IF NOT EXISTS、CREATE INDEX IF NOT EXISTS、CREATE UNIQUE INDEX IF NOT EXISTS、CREATE TRIGGER IF NOT EXISTS，保障重复执行不报错。`src/services/sqlite/migrations.ts:11,25-27,105-108,341-377`
7. **列存在性检测**：migration009 和 migration010 在 ALTER TABLE 前先通过 PRAGMA table_info 检测列是否已存在，避免重复添加报错。`src/services/sqlite/migrations.ts:477-488,498-524`
8. **回滚限制**：SQLite 不完全支持 DROP COLUMN，多个 down() 仅输出警告提示需手动重建表。`src/services/sqlite/migrations.ts:144-147,445-448`

## 4. 对外暴露

| 导出项 | 类型 | 说明 |
|--------|------|------|
| `MigrationRunner` | class（re-export） | 迁移执行器，从 `./migrations/runner.js` 重导出 | `src/services/sqlite/migrations.ts:5` |
| `migration001` ~ `migration010` | Migration 对象 | 10 个独立迁移定义 | `src/services/sqlite/migrations.ts:7-536` |
| `migrations` | Migration[] | 按序排列的迁移数组 | `src/services/sqlite/migrations.ts:538-549` |

## 5. 依赖关系

- **上游**：`bun:sqlite`（Database 类型）、`./Database.js`（Migration 接口定义）、`../../utils/logger.js`（日志工具）
- **下游**：被 `./Database.js` 的迁移运行器导入执行，被 `./migrations/runner.js` 消费

## 6. 数据结构

### Migration 接口（推断，来自 ./Database.js）

```
Migration {
  version: number        // 迁移版本号
  up: (db: Database) => void   // 升级操作
  down: (db: Database) => void // 回滚操作
}
```

### 核心表结构一览

| 表名 | 主键 | 唯一约束 | 主要业务列 | 外键 |
|------|------|---------|-----------|------|
| sessions | id (AUTO) | session_id | project, created_at_epoch, archive_path, source | — |
| memories | id (AUTO) | document_id | session_id, text, title, subtitle, facts, concepts, project, origin | sessions.session_id CASCADE |
| overviews | id (AUTO) | — | session_id, content, project, origin | sessions.session_id CASCADE |
| diagnostics | id (AUTO) | — | session_id, message, severity, project, origin | sessions.session_id SET NULL |
| transcript_events | id (AUTO) | (session_id, event_index) | project, event_type, raw_json, captured_at_epoch | sessions.session_id CASCADE |
| sdk_sessions | id (AUTO) | content_session_id, memory_session_id | project, user_prompt, status(CHECK) | — |
| observations | id (AUTO) | — | memory_session_id, project, text, type, title, narrative, facts, concepts, discovery_tokens, generated_by_model, relevance_count, agent_type, agent_id | sdk_sessions.memory_session_id CASCADE |
| session_summaries | id (AUTO) | memory_session_id | project, request, investigated, learned, completed, next_steps, notes, discovery_tokens | sdk_sessions.memory_session_id CASCADE |
| observation_feedback | id (AUTO) | — | observation_id, signal_type, session_db_id, metadata | observations.id CASCADE |
| observations_fts | (虚拟表) | — | title, subtitle, narrative, text, facts, concepts | FTS5 content=observations |
| session_summaries_fts | (虚拟表) | — | request, investigated, learned, completed, next_steps, notes | FTS5 content=session_summaries |

## 7. 复杂逻辑图示

下图展示迁移序列执行后数据库表间的外键引用关系和 FTS5 同步机制：

```mermaid
flowchart TB
    subgraph "核心持久层（migration001）"
        S["sessions<br/>session_id UNIQUE"]
        M["memories<br/>session_id FK→sessions"]
        O["overviews<br/>session_id FK→sessions"]
        D["diagnostics<br/>session_id FK→sessions<br/>ON DELETE SET NULL"]
        T["transcript_events<br/>session_id FK→sessions<br/>UNIQUE(session_id,event_index)"]
    end

    subgraph "SDK Agent 架构（migration004）"
        SDK["sdk_sessions<br/>content_session_id UNIQUE<br/>memory_session_id UNIQUE"]
        OB["observations<br/>memory_session_id FK→sdk_sessions"]
        SS["session_summaries<br/>memory_session_id FK→sdk_sessions"]
        FB["observation_feedback<br/>observation_id FK→observations"]
    end

    subgraph "FTS5 全文检索（migration006）"
        FTS_OBS["observations_fts<br/>虚拟表 + 3触发器"]
        FTS_SS["session_summaries_fts<br/>虚拟表 + 3触发器"]
    end

    S -->|"ON DELETE CASCADE"| M
    S -->|"ON DELETE CASCADE"| O
    S -->|"ON DELETE SET NULL"| D
    S -->|"ON DELETE CASCADE"| T
    SDK -->|"ON DELETE CASCADE"| OB
    SDK -->|"ON DELETE CASCADE"| SS
    OB -->|"ON DELETE CASCADE"| FB
    OB <==|"AI/AD/AU 触发器同步"| FTS_OBS
    SS <==|"AI/AD/AU 触发器同步"| FTS_SS

    style S fill:#4a90d9,color:#fff
    style SDK fill:#d94a4a,color:#fff
    style FTS_OBS fill:#4ad97a,color:#fff
    style FTS_SS fill:#4ad97a,color:#fff
```

## 8. 逆向备注

1. **版本号跳跃**：从 version 7 直接跳至 version 25（migration008），版本号不连续。推断中间版本号可能在其他分支/PR 中使用后被废弃，为保持唯一性直接跳跃至 25。`src/services/sqlite/migrations.ts:452`
2. **streaming_sessions 的生命周期**：migration003 创建，migration005 删除。说明该表是临时设计，被 sdk_sessions 替代。`src/services/sqlite/migrations.ts:150-186,283-328`
3. **FTS5 列与 observations 表列不完全匹配**：migration006 创建 FTS5 虚拟表时引用了 `title, subtitle, narrative, text, facts, concepts` 列，但 observations 表中 `title, subtitle, narrative` 并非在 migration004 中定义，推断这些列在后续迁移中添加（可能在迁移版本 8-24 之间）。`src/services/sqlite/migrations.ts:342-351`
4. **pending_messages 表引用**：migration010 中引用了 pending_messages 表做列检测，但该表未在本文件任何迁移中创建，推断在别的迁移文件或外部流程中定义。`src/services/sqlite/migrations.ts:512-524`
5. **observation_queue 的双重生命周期**：migration004 创建 observation_queue（关联 sdk_sessions），migration005 删除它，但 migration005 的 down() 中又重新创建它（仍关联 sdk_sessions）。如果 migration004→005 顺序执行后再回滚 005，observation_queue 会被重新创建但关联已被删掉的外键。`src/services/sqlite/migrations.ts:213-227,288,313-324`
6. **console.log 与 logger 混用**：migration001-005 使用 console.log，migration006 及之后使用 logger.warn/debug。推断早期开发时未引入 logger，后期统一。`src/services/sqlite/migrations.ts:111,337`
