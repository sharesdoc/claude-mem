# Prompts.ts 需求说明

> 源文件：src/services/sqlite/Prompts.ts ｜ 类型：源码（桶文件） ｜ 行数：6 ｜ 所属模块：sqlite ｜ 分析日期：2026-07-23

## 1. 文件定位总述

本文件是 SQLite 数据访问层中用户提示词（Prompts）子模块的桶导出文件，统一导出提示词的类型定义、存储操作和查询操作。它使得上层业务代码可以通过单一入口访问所有提示词相关的数据操作能力。

## 2. 功能需求

| 编号 | 需求描述（系统应当…） | 触发条件 / 输入 | 处理规则与输出 | 证据 |
|------|----------------------|----------------|---------------|------|
| FR-Prompts-01 | 系统应当统一导出提示词的类型定义、存储函数和查询函数 | 外部模块导入 | 重导出 types.js、store.js、get.js 的全部公开符号 | `src/services/sqlite/Prompts.ts:3-5` |

## 3. 业务规则与约束

无。本文件是纯桶导出。

## 4. 对外暴露

| 类别 | 名称 | 类型 | 来源 |
|------|------|------|------|
| 重导出 | PromptWithProject, GetPromptsByIdsOptions 等类型 | 类型 | `./prompts/types.js` |
| 重导出 | saveUserPrompt 等 | 函数 | `./prompts/store.js` |
| 重导出 | getUserPrompt 等 | 函数 | `./prompts/get.js` |

## 5. 依赖关系

- **上游**：`./prompts/types.js`、`./prompts/store.js`、`./prompts/get.js`
- **下游**：Worker 服务层、隐私校验器等需要读写用户提示词的模块

## 6. 数据结构

不适用（具体类型定义见 `./prompts/types.ts`）。

## 7. 复杂逻辑图示

不适用。

## 8. 逆向备注

推断：提示词数据存储在 SQLite 的 `user_prompts` 表中（见 store.ts 中的 INSERT 语句），每个提示词关联 content_session_id 和 prompt_number。
