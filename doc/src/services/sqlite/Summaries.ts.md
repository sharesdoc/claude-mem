# Summaries.ts 需求说明

> 源文件：src/services/sqlite/Summaries.ts ｜ 类型：源码（桶文件） ｜ 行数：7 ｜ 所属模块：sqlite ｜ 分析日期：2026-07-23

## 1. 文件定位总述

本文件是 SQLite 数据访问层中摘要（Summaries）子模块的桶导出文件，统一导出摘要的类型定义、存储操作、查询操作和近期查询操作。它为上层业务模块提供摘要数据的单一导入入口。

## 2. 功能需求

| 编号 | 需求描述（系统应当…） | 触发条件 / 输入 | 处理规则与输出 | 证据 |
|------|----------------------|----------------|---------------|------|
| FR-Summaries-01 | 系统应当统一导出摘要的类型定义、存储函数、查询函数和近期查询函数 | 外部模块导入 | 重导出 types.js、store.js、get.js、recent.js | `src/services/sqlite/Summaries.ts:3-6` |

## 3. 业务规则与约束

无。本文件是纯桶导出。

## 4. 对外暴露

| 类别 | 名称 | 类型 | 来源 |
|------|------|------|------|
| 重导出 | Summary 相关类型 | 类型 | `./summaries/types.js` |
| 重导出 | storeSummary 等 | 函数 | `./summaries/store.js` |
| 重导出 | getSummary 等 | 函数 | `./summaries/get.js` |
| 重导出 | getRecentSummaries 等 | 函数 | `./summaries/recent.js` |

## 5. 依赖关系

- **上游**：`./summaries/types.js`、`./summaries/store.js`、`./summaries/get.js`、`./summaries/recent.js`
- **下游**：Worker 服务层的摘要处理、上下文生成等模块

## 6. 数据结构

不适用。

## 7. 复杂逻辑图示

不适用。

## 8. 逆向备注

无特殊备注。
