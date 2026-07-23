# context-generator.ts 需求说明

> 源文件：src/services/context-generator.ts ｜ 类型：源码（桶文件） ｜ 行数：5 ｜ 所属模块：services ｜ 分析日期：2026-07-23

## 1. 文件定位总述

本文件是上下文生成能力的顶层桶导出文件，对外暴露 `generateContext` 函数及相关类型。它将 context 子模块的实现细节封装在内部，仅导出业务层需要的接口。

## 2. 功能需求

| 编号 | 需求描述（系统应当…） | 触发条件 / 输入 | 处理规则与输出 | 证据 |
|------|----------------------|----------------|---------------|------|
| FR-CtxGen-01 | 系统应当导出 generateContext 函数供外部模块调用 | 外部模块导入 | 重导出自 `./context/index.js` | `src/services/context-generator.ts:3` |
| FR-CtxGen-02 | 系统应当导出 ContextInput 和 ContextConfig 类型定义 | 外部模块导入 | 重导出自 `./context/types.js` | `src/services/context-generator.ts:4` |

## 3. 业务规则与约束

无。本文件是纯桶导出。

## 4. 对外暴露

| 类别 | 名称 | 类型 | 来源 |
|------|------|------|------|
| 重导出 | generateContext | 函数 | `./context/index.js` |
| 重导出 | ContextInput, ContextConfig | 类型 | `./context/types.js` |

## 5. 依赖关系

- **上游**：`./context/index.js`、`./context/types.js`
- **下游**：Worker 服务层需要生成上下文的模块（如 session-init hook）

## 6. 数据结构

不适用。

## 7. 复杂逻辑图示

不适用。

## 8. 逆向备注

推断：本文件位于 services 根目录而非 context 子目录内，是为了提供更短的导入路径，使上层代码可以直接从 `../context-generator.js` 导入，而不需要知道 context 内部结构。
