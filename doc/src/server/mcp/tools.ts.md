# tools.ts 需求说明

> 源文件：src/server/mcp/tools.ts ｜ 类型：源码 ｜ 行数：97 ｜ 所属模块：server/mcp ｜ 分析日期：2026-07-23

## 1. 文件定位总述

tools.ts 定义了 Server Beta MCP 层暴露的工具（tool）列表，是 Claude-Mem Server 通过 MCP 协议对外提供核心记忆操作能力的声明式定义。包含 6 个工具：memory_add（添加记忆）、memory_search（搜索记忆）、memory_context（构建上下文包）、memory_forget（遗忘/归档记忆）、memory_list_recent（列出近期记忆）和 memory_record_decision（记录架构决策）。每个工具定义了名称、描述和 JSON Schema 输入规范，所有操作均以 projectId 为必需参数实现项目级隔离。

## 2. 功能需求

| 编号 | 需求描述（系统应当…） | 触发条件 / 输入 | 处理规则与输出 | 证据 |
|------|----------------------|----------------|---------------|------|
| FR-MCPTL-01 | 系统应当声明 `memory_add` 工具，用于添加团队作用域的记忆项，必需 projectId、kind、type | MCP 客户端请求工具列表时 | 工具接受 projectId(string)、kind(enum: observation/summary/prompt/manual)、type(string) 等参数 | `tools.ts:15-29` |
| FR-MCPTL-02 | 系统应当声明 `memory_search` 工具，用于在授权项目/团队范围内搜索记忆，必需 projectId、query | MCP 客户端请求工具列表时 | 工具接受 projectId(string)、query(string)、limit(number 1-100) 参数 | `tools.ts:31-42` |
| FR-MCPTL-03 | 系统应当声明 `memory_context` 工具，用于从匹配的记忆中构建紧凑上下文包，必需 projectId、query | MCP 客户端请求工具列表时 | 工具接受 projectId(string)、query(string)、limit(number 1-50) 参数 | `tools.ts:44-56` |
| FR-MCPTL-04 | 系统应当声明 `memory_forget` 工具，用于遗忘或归档记忆项，必需 projectId、memoryId | MCP 客户端请求工具列表时 | 工具接受 projectId(string)、memoryId(string)、reason(string) 参数 | `tools.ts:58-69` |
| FR-MCPTL-05 | 系统应当声明 `memory_list_recent` 工具，用于列出授权项目的近期记忆，必需 projectId | MCP 客户端请求工具列表时 | 工具接受 projectId(string)、limit(number 1-100) 参数 | `tools.ts:71-81` |
| FR-MCPTL-06 | 系统应当声明 `memory_record_decision` 工具，用于记录架构或产品决策为记忆，必需 projectId、title、decision | MCP 客户端请求工具列表时 | 工具接受 projectId(string)、title(string)、decision(string)、rationale(string)、consequences(array) 参数 | `tools.ts:83-96` |

## 3. 业务规则与约束

1. **所有工具均以 projectId 为必需参数**，确保操作在项目级隔离范围内执行
2. **limit 参数范围**：memory_search 和 memory_list_recent 为 1-100，memory_context 为 1-50
3. **kind 枚举限定**：memory_add 的 kind 仅接受 `observation`、`summary`、`prompt`、`manual` 四种值
4. **导出为 `as const`**，类型不可变

## 4. 对外暴露

| 导出项 | 类型 | 说明 |
|--------|------|------|
| `ServerMcpToolDefinition` | interface | MCP 工具定义结构（name, description, inputSchema） |
| `serverMemoryTools` | readonly array | 6 个 MCP 工具定义的常量数组 |

## 5. 依赖关系

- **上游**：无
- **下游**：被 `./register.ts` 通过 `getServerMcpSurface()` 聚合导出

## 6. 数据结构

```typescript
interface ServerMcpToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}
```

## 7. 复杂逻辑图示

不适用，该文件为声明式工具定义。

## 8. 逆向备注

无特殊备注。
