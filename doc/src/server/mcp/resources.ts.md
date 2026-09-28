# resources.ts 需求说明

> 源文件：src/server/mcp/resources.ts ｜ 类型：源码 ｜ 行数：17 ｜ 所属模块：server/mcp ｜ 分析日期：2026-07-23

## 1. 文件定位总述

resources.ts 定义了 Server Beta MCP 层暴露的资源（resource）列表。包含两个资源：项目列表（`claude-mem://server/projects`）和近期记忆（`claude-mem://server/memories/recent`）。这些资源声明了 Claude-Mem Server 通过 MCP 协议对外提供的数据端点，供 Claude Code 等客户端在对话中按需读取授权范围内的项目信息和记忆内容。

## 2. 功能需求

| 编号 | 需求描述（系统应当…） | 触发条件 / 输入 | 处理规则与输出 | 证据 |
|------|----------------------|----------------|---------------|------|
| FR-MCPRSC-01 | 系统应当声明一个 `projects` MCP resource，URI 为 `claude-mem://server/projects`，MIME 类型为 application/json | MCP 客户端请求资源列表时 | 返回资源定义，名称为 "Claude-Mem Server Projects"，描述为授权项目列表 | `resources.ts:5-9` |
| FR-MCPRSC-02 | 系统应当声明一个 `recent memories` MCP resource，URI 为 `claude-mem://server/memories/recent`，MIME 类型为 application/json | MCP 客户端请求资源列表时 | 返回资源定义，名称为 "Recent Claude-Mem Server Memories"，描述为近期授权记忆项 | `resources.ts:11-15` |

## 3. 业务规则与约束

1. 两个资源的 MIME 类型均为 `application/json`
2. 导出为 `as const`，类型不可变

## 4. 对外暴露

| 导出项 | 类型 | 说明 |
|--------|------|------|
| `serverMemoryResources` | readonly array | MCP resource 定义数组，含 projects 和 recent memories |

## 5. 依赖关系

- **上游**：无
- **下游**：被 `./register.ts` 通过 `getServerMcpSurface()` 聚合导出

## 6. 数据结构

不适用。

## 7. 复杂逻辑图示

不适用。

## 8. 逆向备注

无特殊备注。
