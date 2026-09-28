# types.ts 需求说明

> 源文件：src/services/integrations/types.ts ｜ 类型：源码（类型定义） ｜ 行数：26 ｜ 所属模块：integrations ｜ 分析日期：2026-07-23

## 1. 文件定位总述

本文件定义了 claude-mem 与 Cursor IDE 集成所需的类型结构，包括 Cursor MCP 服务器配置、安装目标类型、平台类型和 Cursor hooks.json 结构定义。这些类型为 claude-mem 的跨 IDE 集成能力提供类型安全保障。

## 2. 功能需求

| 编号 | 需求描述（系统应当…） | 触发条件 / 输入 | 处理规则与输出 | 证据 |
|------|----------------------|----------------|---------------|------|
| FR-IntTypes-01 | 系统应当定义 CursorMcpConfig 类型，描述 MCP 服务器配置的嵌套结构 | 类型使用 | 包含 mcpServers 字段，键为服务器名称，值为含 command、可选 args 和 env 的配置对象 | `src/services/integrations/types.ts:3-10` |
| FR-IntTypes-02 | 系统应当定义 CursorInstallTarget 联合类型 | 类型使用 | 可选值为 `'project' | 'user' | 'enterprise'` | `src/services/integrations/types.ts:12` |
| FR-IntTypes-03 | 系统应当定义 Platform 联合类型 | 类型使用 | 可选值为 `'windows' | 'unix'` | `src/services/integrations/types.ts:14` |
| FR-IntTypes-04 | 系统应当定义 CursorHooksJson 类型，描述 Cursor hooks.json 配置结构 | 类型使用 | 包含 version 数字和 hooks 对象，hooks 含 5 个可选钩子数组 | `src/services/integrations/types.ts:16-26` |

## 3. 业务规则与约束

- **Cursor hooks 生命周期**：定义了 5 个可选钩子阶段：beforeSubmitPrompt、afterMCPExecution、afterShellExecution、afterFileEdit、stop（`src/services/integrations/types.ts:18-23`）
- **MCP 服务器配置**：每个 MCP 服务器配置必须包含 command 字段，args 和 env 为可选（`src/services/integrations/types.ts:5-9`）
- **安装层级**：支持 project、user、enterprise 三种安装范围（`src/services/integrations/types.ts:12`）

## 4. 对外暴露

| 类别 | 名称 | 类型 | 说明 |
|------|------|------|------|
| 接口 | CursorMcpConfig | interface | Cursor MCP 服务器配置 |
| 类型 | CursorInstallTarget | union type | 安装目标范围 |
| 类型 | Platform | union type | 操作系统平台 |
| 接口 | CursorHooksJson | interface | Cursor hooks.json 配置结构 |

## 5. 依赖关系

- **上游**：无
- **下游**：integrations 模块中负责 Cursor IDE 集成安装/配置的逻辑

## 6. 数据结构

```typescript
interface CursorMcpConfig {
  mcpServers: {
    [name: string]: {
      command: string;
      args?: string[];
      env?: Record<string, string>;
    };
  };
}

interface CursorHooksJson {
  version: number;
  hooks: {
    beforeSubmitPrompt?: Array<{ command: string }>;
    afterMCPExecution?: Array<{ command: string }>;
    afterShellExecution?: Array<{ command: string }>;
    afterFileEdit?: Array<{ command: string }>;
    stop?: Array<{ command: string }>;
  };
}
```

## 7. 复杂逻辑图示

不适用。

## 8. 逆向备注

- 推断：claude-mem 通过生成 CursorHooksJson 配置实现与 Cursor IDE 的集成，使其 hook 系统能够在 Cursor 的不同生命周期阶段触发 claude-mem 的观察捕获。
- CursorHooksJson 中的钩子阶段与 claude-mem 自身的 hook 生命周期存在对应关系：beforeSubmitPrompt 对应 UserPromptSubmit，afterMCPExecution 对应 PostToolUse，stop 对应 Stop。
