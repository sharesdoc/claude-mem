# user-message.ts 需求说明

> 源文件：src/cli/handlers/user-message.ts ｜ 类型：源码 ｜ 行数：39 ｜ 所属模块：cli/handlers ｜ 分析日期：2026-07-23

## 1. 文件定位总述

本文件实现 `userMessageHandler` 事件处理器，响应 `user-message` hook 事件。它在每次用户提交消息时向 Worker 发起 GET 请求获取上下文注入内容，然后将格式化的提示信息（包含已加载的上下文、隐私标签使用提示、社区链接和实时浏览器查看链接）输出到 stderr，供用户在终端查看。该处理器不向 stdout 写入 JSON 输出，仅通过 stderr 提供可视化提示，并通过 exitCode 控制进程退出。

## 2. 功能需求

| 编号 | 需求描述（系统应当…） | 触发条件 / 输入 | 处理规则与输出 | 证据 |
|------|----------------------|----------------|---------------|------|
| FR-UM-01 | 系统应当向 Worker 请求项目上下文注入内容 | user-message 事件触发时 | 通过 `buildContextInjectPath(context.allProjects)` 构建查询路径，Claude Code 平台追加 `&colors=true` 参数，执行 GET 请求 | `src/cli/handlers/user-message.ts:14-22` |
| FR-UM-02 | 系统应当在 Worker 不可用时静默跳过 | Worker 请求失败（isWorkerFallback 为 true） | 直接返回 exitCode=SUCCESS，不输出任何内容 | `src/cli/handlers/user-message.ts:24-26` |
| FR-UM-03 | 系统应当向 stderr 输出格式化的上下文加载提示 | Worker 返回上下文内容后 | 输出包含：上下文内容、隐私标签提示、社区链接、实时浏览器链接（含端口号） | `src/cli/handlers/user-message.ts:29-35` |
| FR-UM-04 | 系统应当始终以成功退出码结束 | 处理完成时 | 返回 exitCode = HOOK_EXIT_CODES.SUCCESS | `src/cli/handlers/user-message.ts:37` |

## 3. 业务规则与约束

- 上下文内容仅输出到 stderr 而非 stdout，因为 stdout 保留给 hook 的 JSON 响应 `src/cli/handlers/user-message.ts:29`
- 隐私提示使用 `<private> ... </private>` 标签语法，告知用户如何防止敏感信息被存储 `src/cli/handlers/user-message.ts:32`
- 浏览器实时查看链接使用当前 Worker 端口 `getWorkerPort()` 构建 `src/cli/handlers/user-message.ts:34`

## 4. 对外暴露

| 导出名 | 类型 | 用途 |
|--------|------|------|
| `userMessageHandler` | `EventHandler` | user-message 事件处理器实例 |

## 5. 依赖关系

- **`../../shared/worker-utils.js`**：`executeWithWorkerFallback`, `isWorkerFallback`, `getWorkerPort` `src/cli/handlers/user-message.ts:3-7`
- **`../../shared/hook-constants.js`**：`HOOK_EXIT_CODES` `src/cli/handlers/user-message.ts:8`
- **`../../utils/project-name.js`**：`getProjectContext` `src/cli/handlers/user-message.ts:9`
- **`../../shared/query-utils.js`**：`buildContextInjectPath` `src/cli/handlers/user-message.ts:10`

## 6. 数据结构

不适用。

## 7. 复杂逻辑图示

```mermaid
flowchart TB
  A["userMessageHandler.execute(input)"] --> B["获取 Worker 端口"]
  B --> C["解析项目上下文 (cwd)"]
  C --> D["构建上下文 API 路径<br/>(Claude Code 追加 colors=true)"]
  D --> E["GET 请求 Worker"]
  E --> F{"Worker 可用?"}
  F -->|否 (fallback)| G["返回 exitCode=SUCCESS"]
  F -->|是| H["格式化输出到 stderr<br/>(上下文+隐私提示+社区链接+浏览器链接)"]
  H --> I["返回 exitCode=SUCCESS"]
```

## 8. 逆向备注

- 本处理器不返回 hookSpecificOutput 或 systemMessage，仅通过 stderr 输出用户可见信息，说明 user-message 事件的目标是终端提示而非注入上下文到 agent `src/cli/handlers/user-message.ts:37`
- `colors=true` 参数仅针对 Claude Code 平台追加，推断其他平台不支持 ANSI 颜色输出 `src/cli/handlers/user-message.ts:16`
