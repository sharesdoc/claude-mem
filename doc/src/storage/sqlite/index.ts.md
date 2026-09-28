# index.ts（SQLite storage）需求说明

> 源文件：`src/storage/sqlite/index.ts` ｜ 类型：源码 ｜ 行数：10 ｜ 所属模块：storage/sqlite ｜ 分析日期：2026-07-23

## 1. 文件定位总述

本文件是 SQLite 存储层的统一入口模块（barrel file），负责将 SQLite 各子模块的公共导出汇聚到一处。它是 `src/storage/sqlite/` 包的外部访问面，上层代码通过 `import ... from './sqlite/index.js'` 即可获取全部存储能力，无需逐一引用子文件。

## 2. 功能需求

本文件为纯重导出模块，无独立业务逻辑。总述如下：系统应当提供一个统一的导出入口，将 agent-events、auth、memory-items、projects、schema、server-sessions、teams 七个子模块的公开符号全部暴露给外部调用方。

## 3. 业务规则与约束

1. 模块使用 Apache-2.0 许可证头。`src/storage/sqlite/index.ts:1`
2. 导出采用 ESM 的 `export * from` 语法，各子模块以 `.js` 扩展名引用。`src/storage/sqlite/index.ts:3-9`

## 4. 对外暴露

通过 barrel 重新导出以下子模块的全部公开符号：

| 子模块 | 源路径 | 导出的关键符号 |
|--------|--------|----------------|
| agent-events | `./agent-events.js` | `AgentEventsRepository` |
| auth | `./auth.js` | `AuthRepository` |
| memory-items | `./memory-items.js` | `MemoryItemsRepository` |
| projects | `./projects.js` | `ProjectsRepository` |
| schema | `./schema.js` | `ensureServerStorageSchema`, `SERVER_STORAGE_SCHEMA_VERSION`, `SERVER_OWNED_TABLES` |
| server-sessions | `./server-sessions.js` | `ServerSessionsRepository` |
| teams | `./teams.js` | `TeamsRepository` |

## 5. 依赖关系

- **内部依赖**：7 个同目录子模块
- **下游调用方**：推断为 `src/storage/` 的上层模块或直接使用 SQLite 的业务代码

## 6. 数据结构

不适用。

## 7. 复杂逻辑图示

不适用。

## 8. 逆向备注

无。
