# SessionRoutes.ts 需求说明
> 源文件：src/services/worker/http/routes/SessionRoutes.ts ｜ 类型：源码 ｜ 行数：673 ｜ 所属模块：worker/http/routes ｜ 分析日期：2026-07-23

## 1. 文件定位总述

SessionRoutes 是 claude-mem 会话生命周期的核心路由控制器，负责会话初始化、观察记录摄入、会话总结触发与生成器（Generator）管理。它实现了一套多 Provider 动态路由机制（Claude SDK / Gemini / OpenRouter / Qwen），支持运行时切换 AI 提供商；集成了隐私检查、提示词去重、思考时间计算、活跃/挂起时长回填等业务逻辑；通过层级消息队列（pending message store）和异步生成器实现会话处理的非阻塞流水线。

## 2. 功能需求

| 编号 | 需求描述 | 触发条件 | 处理规则与输出 | 证据 `path:line` |
|------|---------|---------|---------------|-----------------|
| FR-01 | 会话初始化 | `POST /api/sessions/init`，请求体符合 sessionInitByClaudeIdSchema | 创建/获取会话（createSDKSession），保存用户提示词（saveUserPrompt），初始化会话上下文（initializeSession），启动生成器（ensureGeneratorRunning），广播事件；返回 { sessionDbId, promptNumber, skipped, contextInjected, status } | `src/services/worker/http/routes/SessionRoutes.ts:213-216,433-625` |
| FR-02 | 观察记录摄入 | `POST /api/sessions/observations`，请求体符合 observationsByClaudeIdSchema | 调用 ingestObservation 入库，根据结果返回 queued/skipped/error；支持 tool_use_id 和 toolUseId 双字段兼容 | `src/services/worker/http/routes/SessionRoutes.ts:217-219,260-297` |
| FR-03 | 会话总结触发 | `POST /api/sessions/summarize`，请求体符合 summarizeByClaudeIdSchema | 创建/更新会话，执行隐私检查（跳过 private/subagent），回填完成时间和活跃/挂起时长，清理内存标签后入队总结（queueSummarize），启动生成器；返回 { status: 'queued' } | `src/services/worker/http/routes/SessionRoutes.ts:220-224,299-403` |
| FR-04 | 会话状态查询 | `GET /api/sessions/status?contentSessionId=` | 查询会话是否存在、队列深度、最后总结存储时间、运行时长；返回 { status, sessionDbId, queueLength, summaryStored, uptime } | `src/services/worker/http/routes/SessionRoutes.ts:227,405-431` |
| FR-05 | 内部协议跳过 | session-init 收到以特定格式开头的 prompt | 调用 isInternalProtocolPayload 判断，内部协议消息直接跳过不入库，返回 { skipped: true, reason: 'internal_protocol' } | `src/services/worker/http/routes/SessionRoutes.ts:448-452` |
| FR-06 | 隐私提示词跳过 | session-init 收到全部为 <private> 标签的 prompt | stripMemoryTagsFromPrompt 清理后为空字符串则跳过，返回 { skipped: true, reason: 'private' } | `src/services/worker/http/routes/SessionRoutes.ts:499-515` |
| FR-07 | 重复提示词去重 | session-init 时在 USER_PROMPT_DEDUPE_WINDOW_MS 窗口内发现相似 prompt | 调用 findRecentDuplicateUserPrompt 检测，重复则返回 { skipped: true, reason: 'duplicate', contextInjected } | `src/services/worker/http/routes/SessionRoutes.ts:517-540` |
| FR-08 | 提示词大小限制 | session-init 时 prompt 字节数超过 256KB | 按 UTF-8 边界截断至 256KB（避免截断多字节字符的中间字节），记录日志 | `src/services/worker/http/routes/SessionRoutes.ts:456-469` |
| FR-09 | 思考时间计算 | session-init 时 promptNumber > 1 | 计算上一条 prompt 完成到当前提交的时间间隔（gap），按 CLAUDE_MEM_THINK_TIME_CAP_MINUTES 天花板夹紧（cap=0 时不限制）；promptNumber=1 时 thinkTimeMs=0 | `src/services/worker/http/routes/SessionRoutes.ts:543-555` |
| FR-10 | 完成时间回填 | summarize 时 | 按优先级：(1) transcript_completed_at_epoch（最高，无条件覆盖）；(2) stop hook 时间戳经 15 分钟宽限截断（防止跨夜膨胀）；写入 updatePromptCompletedAt | `src/services/worker/http/routes/SessionRoutes.ts:329-357` |
| FR-11 | 活跃/挂起时长回填 | summarize 时携带 turn_activities | 按"区间归属"将 transcript turn 的 active/idle 时长聚合到所属 prompt（5 秒容差对齐 created_at_epoch），调用 updatePromptActivity 写入 | `src/services/worker/http/routes/SessionRoutes.ts:359-391` |
| FR-12 | 多 Provider 动态路由 | ensureGeneratorRunning 或 startGeneratorWithProvider 调用时 | 优先级：显式配置 CLAUDE_MEM_PROVIDER > Qwen 自动兜底（有 key 即用）；运行时 Provider 变更时让当前 generator 自然完成，下次使用新 Provider | `src/services/worker/http/routes/SessionRoutes.ts:44-92,94-116` |
| FR-13 | Tier 路由（模型分级） | applyTierRouting 在生成器启动前执行 | 检查 pending 队列消息类型：有 summarize -> 使用 summaryModel；全部为简单工具（Read/Glob/Grep/LS/ListMcpResourcesTool） -> 使用 simpleModel；否则不覆盖 | `src/services/worker/http/routes/SessionRoutes.ts:631-672` |
| FR-14 | 生成器错误恢复 | 生成器运行时抛出异常 | 捕获后：(1) aborted 信号 -> 忽略；(2) code 143/SIGTERM -> 中止会话防 respawn；(3) 其他错误 -> 将 processing 消息重置为 pending 并记录日志 | `src/services/worker/http/routes/SessionRoutes.ts:156-193` |
| FR-15 | 生成器生命周期管理 | 生成器 Promise resolve 后 | 调用 handleGeneratorExit 处理退出逻辑（完成/超时/中止），根据策略决定是否重启生成器 | `src/services/worker/http/routes/SessionRoutes.ts:195-208` |
| FR-16 | Cursor 平台跳过 SDK 初始化 | platformSource 为 cursor 时 | 不初始化 SDK agent 和生成器，仅保存 prompt 到数据库 | `src/services/worker/http/routes/SessionRoutes.ts:567,614-616` |
| FR-17 | Chroma 向量同步 | session-init 保存 prompt 后（非 Cursor） | 异步调用 ChromaSync.syncUserPrompt 将用户提示词同步到向量数据库，失败仅记录日志不阻断 | `src/services/worker/http/routes/SessionRoutes.ts:584-608` |
| FR-18 | SSE 事件广播 | session-init 和 summarize 成功后 | 广播 sessionStarted、newPrompt、summarizeQueued 等事件通知前端 | `src/services/worker/http/routes/SessionRoutes.ts:574-582,400,613` |

## 3. 业务规则与约束

1. **Provider 优先级链**：Qwen 显式配置 > OpenRouter 显式配置 > Gemini 显式配置 > Qwen 自动兜底（有 key）> Claude SDK（`SessionRoutes.ts:44-92`）。
2. **简单工具集定义**：Read、Glob、Grep、LS、ListMcpResourcesTool 五种工具被视为"简单工具"，Tier 路由时全部为简单工具的队列可使用低成本模型（`SessionRoutes.ts:627-629`）。
3. **观察完成时间 15 分钟宽限**：从 Stop hook 时间戳到最近 observation 的时间间隔超过 15 分钟时，使用 observation 时间作为完成时间，防止跨夜/闲置 session 的时间膨胀（`SessionRoutes.ts:349-353`）。
4. **Turn 活跃时长 5 秒容差**：transcript turn 的 promptedAt 与 DB prompt 的 created_at_epoch 之间存在 1-2 秒固有延迟，使用 5 秒容差对齐，远小于相邻轮次间隔（`SessionRoutes.ts:366`）。
5. **提示词最大字节数**：256KB = 262144 字节（`MAX_USER_PROMPT_BYTES`），截断时按 UTF-8 字符边界对齐（`SessionRoutes.ts:27,456-469`）。
6. **subagent 跳过总结**：当 summarize 请求携带 agentId 时直接返回 { status: 'skipped', reason: 'subagent_context' }，不触发总结生成（`SessionRoutes.ts:306-308`）。
7. **斜杠命令处理**：非 Cursor 平台时，prompt 以 `/` 开头的指令在传给 SDK 时去掉前导斜杠（`SessionRoutes.ts:568`）。
8. **生成器单实例**：每个 session 最多一个活跃 generatorPromise，Provider 切换时等当前 generator 自然完成（`SessionRoutes.ts:100-116`）。

## 4. 对外暴露

| 类别 | 名称 | 类型 | 说明 |
|------|------|------|------|
| HTTP 端点 | `POST /api/sessions/init` | REST API | 会话初始化（创建会话+保存提示词+启动生成器） |
| HTTP 端点 | `POST /api/sessions/observations` | REST API | 观察记录摄入 |
| HTTP 端点 | `POST /api/sessions/summarize` | REST API | 会话总结触发 |
| HTTP 端点 | `GET /api/sessions/status` | REST API | 会话状态查询 |
| 公开方法 | `ensureGeneratorRunning(sessionDbId, source)` | instance method | 确保 session 的生成器正在运行 |
| 导出类 | `SessionRoutes` | class | 继承 BaseRouteHandler |

## 5. 依赖关系

**上游导入**：
- `express`, `zod` -- Web 框架与请求校验（`SessionRoutes.ts:2-3`）
- `ingestObservation` -- 共享观察摄入逻辑（`SessionRoutes.ts:4`）
- `validateBody` -- 中间件（`SessionRoutes.ts:5`）
- `stripMemoryTagsFromPrompt`, `isInternalProtocolPayload` -- 隐私标签处理（`SessionRoutes.ts:7`）
- `SessionManager` -- 会话管理器（`SessionRoutes.ts:8`）
- `DatabaseManager` -- 数据库（`SessionRoutes.ts:9`）
- `ClaudeProvider`, `GeminiProvider`, `OpenRouterProvider`, `QwenProvider` -- 多 AI 提供商（`SessionRoutes.ts:10-13`）
- `BaseRouteHandler` -- 路由基类（`SessionRoutes.ts:15`）
- `SessionEventBroadcaster` -- SSE 事件广播（`SessionRoutes.ts:16`）
- `PrivacyCheckValidator` -- 隐私检查（`SessionRoutes.ts:17`）
- `SettingsDefaultsManager`, `USER_SETTINGS_PATH` -- 配置（`SessionRoutes.ts:18-19`）
- `getProjectContext` -- 项目上下文（`SessionRoutes.ts:20`）
- `normalizePlatformSource` -- 平台来源规范化（`SessionRoutes.ts:21`）
- `handleGeneratorExit` -- 生成器退出处理（`SessionRoutes.ts:22`）
- `SessionCompletionHandler` -- 会话完成处理（`SessionRoutes.ts:23`）
- `getUptimeSeconds` -- 运行时长（`SessionRoutes.ts:24`）
- `USER_PROMPT_DEDUPE_WINDOW_MS` -- 去重窗口（`SessionRoutes.ts:25`）

**下游调用方**：由 Worker Service 在 setupRoutes 阶段注册到 Express app，Claude Code hook（UserPromptSubmit、PostToolUse、Stop）通过 HTTP 调用。

## 6. 数据结构

**sessionInitByClaudeIdSchema**（Zod schema）：
```
{ contentSessionId: string(min 1), project?: string, prompt?: string, platformSource?: string, customTitle?: string }
```

**observationsByClaudeIdSchema**（Zod schema）：
```
{ contentSessionId: string(min 1), tool_name: string(min 1), tool_input?: unknown, tool_response?: unknown, cwd?: string, agentId?: string, agentType?: string, platformSource?: string, tool_use_id?: string, toolUseId?: string }
```

**summarizeByClaudeIdSchema**（Zod schema）：
```
{ contentSessionId: string(min 1), last_assistant_message?: string, agentId?: string, platformSource?: string, project?: string, user_prompt?: string }
```

## 7. 复杂逻辑图示

```mermaid
flowchart TD
    A["POST /api/sessions/init"] --> B["validateBody"]
    B --> C["isInternalProtocolPayload?"]
    C -- 是 --> D["返回 skipped: internal_protocol"]
    C -- 否 --> E{"prompt > 256KB?"}
    E -- 是 --> F["UTF-8 安全截断"]
    E -- 否 --> G["stripMemoryTagsFromPrompt"]
    F --> G
    G --> H{"prompt 为空(private)?"}
    H -- 是 --> I["返回 skipped: private"]
    H -- 否 --> J{"窗口内重复?"}
    J -- 是 --> K["返回 skipped: duplicate"]
    J -- 否 --> L["createSDKSession + saveUserPrompt"]
    L --> M{"platformSource = cursor?"}
    M -- 是 --> N["跳过 SDK 初始化"]
    M -- 否 --> O["initializeSession"]
    O --> P["ChromaSync(异步)"]
    P --> Q["ensureGeneratorRunning"]
    N --> R["返回 initialized"]
    Q --> R

    S["POST /api/sessions/summarize"] --> T["validateBody"]
    T --> U{"agentId?"}
    U -- 是 --> V["返回 skipped: subagent_context"]
    U -- 否 --> W["PrivacyCheckValidator"]
    W --> X{"private?"}
    X -- 是 --> Y["返回 skipped: private"]
    X -- 否 --> Z["回填完成时间"]
    Z --> AA["回填活跃/挂起时长"]
    AA --> AB["queueSummarize"]
    AB --> AC["ensureGeneratorRunning"]
    AC --> AD["返回 queued"]
