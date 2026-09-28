# register.ts 需求说明

> 源文件：src/server/mcp/register.ts ｜ 类型：源码 ｜ 行数：14 ｜ 所属模块：server/mcp ｜ 分析日期：2026-07-23

## 1. 文件定位总述

register.ts 是 Server Beta MCP（Model Context Protocol）表面的注册入口，负责将 tools、resources、prompts 三个子模块的导出聚合为一个统一的 MCP surface 对象。该文件是 MCP 集成的最顶层聚合点，供外部 MCP transport 层调用以获取 Claude-Mem Server 暴露的全部 MCP 能力定义。

## 2. 功能需求

| 编号 | 需求描述（系统应当…） | 触发条件 / 输入 | 处理规则与输出 | 证据 |
|------|----------------------|----------------|---------------|------|
| FR-REG-01 | 系统应当提供一个聚合函数，将 tools、resources、prompts 三个 MCP 子模块的导出统一为一个 surface 对象 | 调用 `getServerMcpSurface()` | 返回 `{ tools: ServerMcpToolDefinition[], resources: ..., prompts: ... }` | `register.ts:7-13` |

## 3. 业务规则与约束

无明显业务规则，该文件为纯聚合层。

## 4. 对外暴露

| 导出项 | 类型 | 说明 |
|--------|------|------|
| `getServerMcpSurface` | function | 返回包含 tools、resources、prompts 的聚合对象 |

## 5. 依赖关系

- **上游**：`./prompts.js`（serverMemoryPrompts）、`./resources.js`（serverMemoryResources）、`./tools.js`（serverMemoryTools）
- **下游**：被 MCP transport 层消费，注册到 Claude Code 的 MCP 协议层

## 6. 数据结构

返回值结构：
```typescript
{
  tools: ServerMcpToolDefinition[];    // 来自 tools.ts
  resources: typeof serverMemoryResources;  // 来自 resources.ts
  prompts: typeof serverMemoryPrompts;     // 来自 prompts.ts
}
```

## 7. 复杂逻辑图示

不适用，该文件为简单聚合函数。

## 8. 逆向备注

该文件使用 Apache-2.0 许可证标记（`register.ts:1`），与项目其他文件的许可证风格一致。
