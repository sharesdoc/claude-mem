# mcp-server.ts 需求说明

> 源文件：src/servers/mcp-server.ts ｜ 类型：源码 ｜ 行数：1048 ｜ 所属模块：servers ｜ 分析日期：2026-07-23

## 1. 文件定位总述

本文件是 claude-mem 作为 MCP（Model Context Protocol）服务器的主入口，通过 stdio 传输层向 Claude Code 暴露工具集。它承载两类运行时：**worker 模式**下通过本地 HTTP 调用 Worker 进程的搜索/时间线/批量观察等能力；**server-beta 模式**下通过 REST 客户端直连远端 API 进行观察的写入、搜索与事件记录。文件同时负责 Worker 自动启动、父进程心跳检测与孤儿防护、marketplace 目录就绪检查等基础设施职责。

## 2. 功能需求

| 编号 | 需求描述（系统应当…） | 触发条件 / 输入 | 处理规则与输出 | 证据 |
|------|----------------------|----------------|---------------|------|
| FR-MCPServer-01 | 系统应当通过 stdio 传输层启动 MCP 服务器并注册工具列表与调用处理器 | 进程启动 | 创建 `StdioServerTransport`，连接 `Server` 实例，注册 `ListToolsRequestSchema` 和 `CallToolRequestSchema` 处理器 | `src/servers/mcp-server.ts:1014-1017` |
| FR-MCPServer-02 | 系统应当拦截 `console.log` 以保护 MCP 协议不受 stdout 污染 | 模块加载时 | 将 `console.log` 重写为通过 logger 记录 ERROR 级别日志 | `src/servers/mcp-server.ts:7-9` |
| FR-MCPServer-03 | 系统应当提供 3 层搜索工作流指引工具 `__IMPORTANT` | MCP 工具调用 | 返回文本说明 search → timeline → get_observations 的分层调用顺序，引导 LLM 节省 token | `src/servers/mcp-server.ts:426-458` |
| FR-MCPServer-04 | 系统应当提供 `search` 工具，通过 Worker GET `/api/search` 端点执行记忆搜索 | MCP 工具调用，参数含 query 等 | 将参数拼为 URLSearchParams 调用 Worker API，返回 `{content, isError}` 结构 | `src/servers/mcp-server.ts:65-68,477-480` |
| FR-MCPServer-05 | 系统应当提供 `timeline` 工具，通过 Worker GET `/api/timeline` 获取时间线上下文 | MCP 工具调用，参数含 anchor 或 query | 转发至 Worker `/api/timeline`，支持按 anchor/depth 前后扩展 | `src/servers/mcp-server.ts:484-500` |
| FR-MCPServer-06 | 系统应当提供 `get_observations` 工具，通过 Worker POST `/api/observations/batch` 批量获取观察详情 | MCP 工具调用，参数含 ids 数组 | POST JSON body 到 Worker，返回格式化结果 | `src/servers/mcp-server.ts:502-519` |
| FR-MCPServer-07 | 系统应当提供 `observation_add` 工具，在 server-beta 模式下插入手动观察 | MCP 工具调用，参数含 content（必填） | 校验 runtime 必须为 server-beta，调用 client.addObservation | `src/servers/mcp-server.ts:525-540` |
| FR-MCPServer-08 | 系统应当提供 `observation_record_event` 工具，在 server-beta 模式下记录代理事件 | MCP 工具调用，参数含 eventType（必填） | 调用 server-beta `/v1/events`，自动填充 occurredAtEpoch 默认值 | `src/servers/mcp-server.ts:542-561` |
| FR-MCPServer-09 | 系统应当提供 `observation_search` 工具，在 server-beta 模式下全文搜索观察 | MCP 工具调用，参数含 query（必填） | 调用 server-beta `/v1/search` GIN tsvector 索引 | `src/servers/mcp-server.ts:563-576` |
| FR-MCPServer-10 | 系统应当提供 `observation_context` 工具，在 server-beta 模式下获取上下文注入用的观察 | MCP 工具调用，参数含 query（必填） | 调用 server-beta `/v1/context`，返回匹配观察和预拼接的上下文字符串 | `src/servers/mcp-server.ts:578-591` |
| FR-MCPServer-11 | 系统应当提供 `observation_generation_status` 工具，查询观察生成作业状态 | MCP 工具调用，参数含 jobId（必填） | 调用 server-beta `/v1/jobs/:id` | `src/servers/mcp-server.ts:593-604` |
| FR-MCPServer-12 | 系统应当提供 `memory_add`、`memory_search`、`memory_context` 兼容别名工具，委托给对应的 observation_* 处理器 | MCP 工具调用使用旧名称 | `memory_add` 将 narrative 映射为 content，将 title 放入 metadata.title | `src/servers/mcp-server.ts:610-669` |
| FR-MCPServer-13 | 系统应当提供 `smart_search` 工具，使用 tree-sitter AST 搜索代码库 | MCP 工具调用，参数含 query（必填） | 本地调用 searchCodebase + formatSearchResults，不依赖 Worker | `src/servers/mcp-server.ts:671-706` |
| FR-MCPServer-14 | 系统应当提供 `smart_unfold` 工具，展开指定符号的完整源码 | MCP 工具调用，参数含 file_path 和 symbol_name | 解析文件后调用 unfoldSymbol，未找到时列出可用符号 | `src/servers/mcp-server.ts:708-750` |
| FR-MCPServer-15 | 系统应当提供 `smart_outline` 工具，获取文件结构大纲（折叠体） | MCP 工具调用，参数含 file_path | 解析文件后调用 formatFoldedView | `src/servers/mcp-server.ts:752-780` |
| FR-MCPServer-16 | 系统应当提供知识语料库工具组：`build_corpus`、`list_corpora`、`prime_corpus`、`query_corpus`、`rebuild_corpus`、`reprime_corpus` | MCP 工具调用 | build/list 通过 GET/POST Worker API，prime/query/rebuild/reprime 通过 POST 带路径参数 | `src/servers/mcp-server.ts:782-885` |
| FR-MCPServer-17 | 系统应当在启动后尝试自动连接或启动 Worker（非 server-beta 模式时） | 启动后 setTimeout(0) | 先检测 Worker 健康检查，失败则调用 ensureWorkerStarted；server-beta 模式下跳过 | `src/servers/mcp-server.ts:1024-1041` |
| FR-MCPServer-18 | 系统应当检测父进程是否死亡并在检测到时自动退出，防止孤儿进程 | 每 30 秒心跳 | 比较 process.ppid 与初始值，不匹配或为 1 时执行 cleanup；Windows 平台跳过 | `src/servers/mcp-server.ts:958-973` |
| FR-MCPServer-19 | 系统应当在启动时检查 marketplace 目录是否存在，缺失时输出诊断日志 | main() 中 | 遍历候选路径，若 marketplace 不存在但 cache 存在则输出 ERROR 级别日志 | `src/servers/mcp-server.ts:988-1012` |
| FR-MCPServer-20 | 系统应当在 stdin 关闭、stdio 错误、SIGTERM、SIGINT 时执行清理并退出码 0 | 生命周期事件 | isCleaningUp 防重入，清除心跳定时器，分离 stdin 监听器 | `src/servers/mcp-server.ts:935-986` |

## 3. 业务规则与约束

- **runtime 选择策略**：observation_* 工具要求 `CLAUDE_MEM_RUNTIME=server-beta`，否则抛出 `ServerBetaClientError`，提示用户使用 worker 模式的 search/timeline/get_observations 工具（`src/servers/mcp-server.ts:235-247`）
- **server-beta 配置完整性**：当 server-beta 被选中但缺少 url/api_key/project_id 时，工具返回 `available: false` 的诊断信息（`src/servers/mcp-server.ts:191-205`）
- **Worker 自动启动容错**：Worker 启动失败（返回 `dead`）不阻止 MCP 服务器继续运行，仅记录错误日志（`src/servers/mcp-server.ts:406-411`）
- **console.log 协议保护**：MCP 协议使用 stdout 通信，console.log 被重定向到 logger.error 以防污染（`src/servers/mcp-server.ts:7-9`）
- **兼容别名字段映射**：`memory_add` 中 `narrative` 映射到 `content`，`title` 放入 `metadata.title`（`src/servers/mcp-server.ts:628-637`）

## 4. 对外暴露

| 类别 | 名称 | 类型 | 说明 |
|------|------|------|------|
| MCP Tool | `__IMPORTANT` | 指引工具 | 3 层工作流说明 |
| MCP Tool | `search` | 工具 | Worker 模式记忆搜索 |
| MCP Tool | `timeline` | 工具 | Worker 模式时间线 |
| MCP Tool | `get_observations` | 工具 | Worker 模式批量获取观察 |
| MCP Tool | `observation_add` | 工具 | server-beta 写入观察 |
| MCP Tool | `observation_record_event` | 工具 | server-beta 记录事件 |
| MCP Tool | `observation_search` | 工具 | server-beta 全文搜索 |
| MCP Tool | `observation_context` | 工具 | server-beta 上下文获取 |
| MCP Tool | `observation_generation_status` | 工具 | server-beta 作业状态查询 |
| MCP Tool | `memory_add` / `memory_search` / `memory_context` | 兼容工具 | 委托给 observation_* |
| MCP Tool | `smart_search` / `smart_unfold` / `smart_outline` | 工具 | AST 代码搜索与导航 |
| MCP Tool | `build_corpus` / `list_corpora` / `prime_corpus` / `query_corpus` / `rebuild_corpus` / `reprime_corpus` | 工具 | 知识语料库管理 |

## 5. 依赖关系

- **上游**：`@modelcontextprotocol/sdk`（MCP 协议框架）、`../shared/worker-utils.js`（Worker HTTP 通信）、`../services/worker-spawner.js`（Worker 自动启动）、`../services/smart-file-read/`（AST 搜索/解析）
- **上游**：`../services/hooks/server-beta-client.js`（server-beta REST 客户端）、`../services/hooks/runtime-selector.js`（运行时选择）
- **下游**：本地 Worker HTTP API（`/api/search`、`/api/timeline`、`/api/observations/batch`、`/api/corpus/*`）；server-beta REST API（`/v1/memories`、`/v1/events`、`/v1/search`、`/v1/context`、`/v1/jobs/:id`）

## 6. 数据结构

```typescript
// Worker API 通信统一返回格式
interface ToolResult {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
}

// server-beta 运行时解析结果
type ServerBetaResolution = ServerBetaAvailable | ServerBetaUnavailable;
```

## 7. 复杂逻辑图示

```mermaid
flowchart TB
    A["MCP 工具调用"] --> B{工具名称}
    B --> C["__IMPORTANT: 返回指引文本"]
    B --> D["worker 模式工具\nsearch / timeline / get_observations"]
    B --> E["server-beta 工具\nobservation_*"]
    B --> F["兼容别名\nmemory_*"]
    B --> G["AST 工具\nsmart_*"]
    B --> H["语料库工具\ncorpus_*"]

    D --> I["callWorkerAPI / callWorkerAPIPost\n→ Worker HTTP 端点"]
    E --> J{selectRuntime()}
    J -->|"server-beta"| K["requireServerBetaForObservationTool\n→ ServerBetaClient REST"]
    J -->|"worker"| L["抛出 ServerBetaClientError"]
    F --> K
    G --> M["本地 searchCodebase / parseFile\n无需 Worker"]
    H --> I
```

上图展示了 MCP 工具调用的核心路由逻辑：worker 模式工具走本地 HTTP，server-beta 工具要求 runtime 切换，AST 工具完全本地化。

## 8. 逆向备注

- 推断：`__IMPORTANT` 工具名使用双下划线前缀是为了在工具列表中排在最前面，引导 LLM 优先阅读工作流指引。
- `packageVersion` 通过构建时注入的 `__DEFAULT_PACKAGE_VERSION__` 常量获取，fallback 为 `'0.0.0-dev'`（`src/servers/mcp-server.ts:2-3`）。
- main() 中的 fatal catch 回调使用 `process.exit(0)` 而非 `process.exit(1)`，遵循项目退出码策略（不阻塞宿主终端）（`src/servers/mcp-server.ts:1044-1047`）。
