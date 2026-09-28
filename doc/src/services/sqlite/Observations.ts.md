# Observations.ts 需求说明

> 源文件：src/services/sqlite/Observations.ts ｜ 类型：源码（桶文件） ｜ 行数：8 ｜ 所属模块：sqlite ｜ 分析日期：2026-07-23

## 1. 文件定位总述

本文件是 SQLite 数据访问层中观察记录（Observations）子模块的桶导出文件，统一导出观察的类型定义、存储操作、查询操作、近期查询操作和文件关联查询操作。观察记录是系统的核心数据实体，承载工具使用记忆。

## 2. 功能需求

| 编号 | 需求描述（系统应当…） | 触发条件 / 输入 | 处理规则与输出 | 证据 |
|------|----------------------|----------------|---------------|------|
| FR-Obs-01 | 系统应当统一导出观察记录的类型、存储、查询、近期查询和文件关联查询 | 外部模块导入 | 重导出五个子模块 | `src/services/sqlite/Observations.ts:3-7` |

## 3. 业务规则与约束

无。本文件是纯桶导出。

## 4. 对外暴露

| 类别 | 名称 | 类型 | 来源 |
|------|------|------|------|
| 重导出 | Observation 相关类型 | 类型 | `./observations/types.js` |
| 重导出 | storeObservation 等 | 函数 | `./observations/store.js` |
| 重导出 | getObservation 等 | 函数 | `./observations/get.js` |
| 重导出 | getRecentObservations 等 | 函数 | `./observations/recent.js` |
| 重导出 | getFileObservations 等 | 函数 | `./observations/files.js` |

## 5. 依赖关系

- **上游**：`./observations/types.js`、`./observations/store.js`、`./observations/get.js`、`./observations/recent.js`、`./observations/files.js`
- **下游**：Worker 搜索模块、上下文生成器、MCP 工具调用处理

## 6. 数据结构

不适用。

## 7. 复杂逻辑图示

不适用。

## 8. 逆向备注

推断：`files.js` 子模块的存在暗示观察记录与文件路径存在关联关系，支持按文件路径检索相关的观察记录。这对应 MCP 工具中 `build_corpus` 的 files 过滤参数。
