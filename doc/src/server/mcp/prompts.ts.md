# prompts.ts 需求说明

> 源文件：src/server/mcp/prompts.ts ｜ 类型：源码 ｜ 行数：13 ｜ 所属模块：server/mcp ｜ 分析日期：2026-07-23

## 1. 文件定位总述

prompts.ts 定义了 Server Beta MCP 层暴露的 prompt 模板列表。目前仅包含一个 `record_decision` prompt，用于引导 Claude Code 在对话中捕获项目决策并记录到 Claude-Mem Server 的持久记忆中。该文件是 MCP prompts 能力的声明式定义，不包含处理逻辑。

## 2. 功能需求

| 编号 | 需求描述（系统应当…） | 触发条件 / 输入 | 处理规则与输出 | 证据 |
|------|----------------------|----------------|---------------|------|
| FR-MCPPRM-01 | 系统应当声明一个 `record_decision` MCP prompt，接受 projectId 和 decision 两个必要参数 | MCP 客户端请求 prompt 列表时 | 返回 prompt 定义，name 为 `record_decision`，描述为 "Capture a project decision in Claude-Mem Server memory." | `prompts.ts:3-12` |

## 3. 业务规则与约束

1. `projectId` 参数标记为 required，描述为 "Server project id"
2. `decision` 参数标记为 required，描述为 "Decision text"
3. 导出为 `as const`，类型不可变

## 4. 对外暴露

| 导出项 | 类型 | 说明 |
|--------|------|------|
| `serverMemoryPrompts` | readonly array | MCP prompt 定义数组，当前仅含 `record_decision` |

## 5. 依赖关系

- **上游**：无
- **下游**：被 `./register.ts` 通过 `getServerMcpSurface()` 聚合导出

## 6. 数据结构

不适用。

## 7. 复杂逻辑图示

不适用。

## 8. 逆向备注

无特殊备注。
