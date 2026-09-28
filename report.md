# 代码审查报告

本次审查覆盖仓库 `/Users/johnson/wks/ai/plugins/claude-mem` 的当前工作区源码、构建配置、安装脚本、服务端路由、同步链路、数据库 schema、前端 viewer 类型与测试结果。结论是 `request-changes`：当前代码无法通过 TypeScript 类型检查，测试套件存在大量失败，并且存在若干安全与项目规范冲突项。用户要求“don't fix code”，本报告只记录审查结论，不修改业务代码。

## 审查结论

当前代码不建议发布或合并。阻断项主要集中在编译门禁、测试门禁、密码哈希安全策略、数据库约束策略与同步配置一致性。审查期间未运行外部依赖漏洞扫描工具；安全结论基于源码静态检查和项目内测试命令。

| 维度 | 结果 |
|---|---|
| 总体裁决 | 🔄 request-changes |
| 🔴 blocking | 5 |
| 🟡 important | 3 |
| 🟢 nit | 1 |
| 只读诊断 | `npm run typecheck` 失败；`npm test` 失败 |

## 🔴 Blocking

### R-001 [blocking] TypeScript 类型检查当前失败，构建门禁不可通过

- 位置：`src/npx-cli/commands/install.ts:435`、`src/services/integrations/CursorHooksInstaller.ts:18`、`src/services/sqlite/SessionStore.ts:10`、`src/services/sync/sync-state.ts:120`、`src/services/worker/agents/ResponseProcessor.ts:226`、`src/services/worker/http/BaseRouteHandler.ts:25`
- 审查员：typescript-reviewer + code-reviewer
- 事实依据：执行 `npm run typecheck` 返回退出码 2，包含多类编译错误：`spinner?.stop()` 参数数量不匹配、`Platform` 未从 `./types.js` 导出、`SdkSessionRecord` 未从 `../../types/database.js` 导出、`normaliseState()` 对 `{}` 访问 `sessions/observations/summaries/prompts`、SSE payload 缺少 `created_at`、Express 路由参数类型为 `string | string[]` 却传给只接收 `string` 的函数。
- 推理说明：这是项目定义的正式 `typecheck` 脚本，失败意味着源码无法满足当前类型契约；后续构建或发布可能依赖旧构建产物，掩盖源码已不可编译的事实。
- 影响范围：NPX installer、Cursor hooks、SQLite session store、sync state、SSE broadcast、HTTP route parameter parsing。
- 修复建议：按模块逐项修正类型契约，优先恢复导出类型、补齐 SSE payload 字段、收窄 Express 参数类型，并确认 `@clack/prompts` spinner API 使用方式。
- 需补测试：恢复 `npm run typecheck` 全绿后，再跑相关单测和 `npm run build`。
- 置信度：高。
- 处理建议：发布前必须修复。

### R-002 [blocking] 全量测试套件当前失败，已有质量门禁显示真实回归

- 位置：`tests/logger-usage-standards.test.ts:126`、`tests/logger-usage-standards.test.ts:146`
- 审查员：code-reviewer
- 事实依据：执行 `npm test` 结果为 `3432 pass / 36 skip / 202 fail / 65 errors`。首个失败的 logger 标准测试明确抛错：13 个后台服务文件使用 `console.log/console.error`，15 个高优先级文件缺少 logger import。
- 推理说明：测试失败数量不是单一 flaky 现象，覆盖日志规范、GeminiProvider、分页、sync ingest、SyncAgent、server REST API、settings defaults、观察存储、hook、SSE、schema repair、supervisor 等多条核心链路。
- 影响范围：构建发布可信度、后台服务可观测性、同步与服务端 API 行为。
- 修复建议：先按失败簇分组处理：编译错误、logger 标准、sync/ingest、server API、settings defaults、provider 行为，再恢复全量测试。
- 需补测试：当前已有测试即为验收门禁，必须恢复 `npm test` 通过或明确隔离不稳定测试并记录原因。
- 置信度：高。
- 处理建议：发布前必须修复。

### R-003 [blocking] 管理员密码使用 SHA1 存储和校验，不符合当前安全要求

- 位置：`src/services/worker/http/routes/AuthRoutes.ts:17`、`src/services/worker/http/routes/AuthRoutes.ts:100`、`src/services/worker/http/routes/AuthRoutes.ts:170`、`install-claude-mem:1026`、`install-claude-mem:1052`
- 审查员：security-reviewer
- 事实依据：AuthRoutes 使用 `createHash('sha1')` 计算登录输入；安装脚本同样用 SHA1 写入 `CLAUDE_MEM_ADMIN_PASSWORD`，并在输出中显示 `SHA1: $hash`。
- 推理说明：SHA1 不适合作为管理员密码存储算法；即使项目宪法要求“shasum 生成的 40 位哈希值”，也至少应避免在终端输出完整密码哈希，并统一说明该策略的风险边界。当前实现既使用弱哈希，又暴露完整哈希值。
- 影响范围：server-mode viewer 管理员登录、安全审计、安装日志。
- 修复建议：按项目当前约束至少停止输出完整哈希；更合理方案是迁移到带 salt 的慢哈希算法，并兼容旧 SHA1 存量值一次性升级。
- 需补测试：管理员密码设置不回显完整哈希、旧哈希兼容、错误密码限流、重置后解除锁定。
- 置信度：高。
- 处理建议：发布前必须修复或形成明确安全例外。

### R-004 [blocking] 数据库 schema 使用物理外键，违反项目“禁用物理外键”约束

- 位置：`src/storage/sqlite/schema.ts:51`、`src/storage/sqlite/schema.ts:67`、`src/storage/sqlite/schema.ts:81`、`src/storage/sqlite/schema.ts:103`、`src/services/sqlite/SessionStore.ts:529`、`src/services/sqlite/SessionStore.ts:611`、`src/services/sqlite/SessionStore.ts:704`
- 审查员：database-reviewer
- 事实依据：SQLite schema 和 SessionStore 迁移中多处创建 `FOREIGN KEY ... REFERENCES ... ON DELETE ...` 物理约束。
- 推理说明：用户项目规则明确禁止物理外键，要求应用层控制依赖。当前 schema 直接依赖数据库约束，且测试中也有外键修复相关用例，说明这是明确设计分支而不是偶然残留。
- 影响范围：server storage schema、legacy SQLite session/observation/summary 存储、迁移兼容性。
- 修复建议：需要架构层决策：如果遵循项目规则，应改为逻辑外键 + 普通索引 + 应用层删除级联；如果保留物理外键，应更新项目约束并解释例外。
- 需补测试：无物理外键时的删除级联、孤儿数据修复、应用层依赖校验。
- 置信度：高。
- 处理建议：发布前必须完成规则与实现的一致性决策。

### R-005 [blocking] 同步 payload 的 think-time cap 仍从 `process.env` 读取，和持久化 settings 路径不一致

- 位置：`src/services/sync/payload.ts:165`、`src/services/sync/payload.ts:169`、`src/services/worker/http/routes/SyncRoutes.ts:363`
- 审查员：typescript-reviewer + code-reviewer
- 事实依据：客户端同步 payload 填充 `think_time_cap_minutes` 时读取 `process.env.CLAUDE_MEM_THINK_TIME_CAP_MINUTES`，而 server ingest 端每批次从 `SettingsDefaultsManager.loadFromFile(USER_SETTINGS_PATH)` 读取持久化设置并在不一致时纠正。
- 推理说明：近期配置管理已经转向 settings.json 持久化；客户端仍读进程环境会导致已通过安装脚本或 UI 写入的设置无法进入同步 payload，服务端每次都认为 cap mismatch 并重算。该问题会造成跨节点统计口径不稳定和无效日志噪声。
- 影响范围：client sync payload、server ingest、统计页面 H/A 时间口径。
- 修复建议：客户端 payload 构建改为和其他运行时配置一致地读取 SettingsDefaultsManager/USER_SETTINGS_PATH，避免使用非持久 env 快照。
- 需补测试：settings.json 修改 cap 后，payload 中 `think_time_cap_minutes` 与文件值一致；server 不再无故记录 correction。
- 置信度：高。
- 处理建议：发布前必须修复。

## 🟡 Important

### R-006 [important] logger 规范失败会让后台服务问题不可观测

- 位置：`tests/logger-usage-standards.test.ts:137`、`src/server/runtime/ServerBetaService.ts:304`、`src/services/integrations/McpIntegrations.ts:55`、`src/shared/plugin-state.ts:17`
- 审查员：code-reviewer
- 事实依据：logger 标准测试报告 13 个后台服务文件仍使用 `console.log/console.error`；测试说明这些日志在后台进程中不可见。
- 推理说明：对于 worker/server-beta 这类 daemon，stdout/stderr 经常不进入项目日志，故障排查会丢失关键上下文。CLI 命令可保留 console 输出，但后台服务路径应使用统一 logger。
- 影响范围：server beta、集成安装、shared 状态读取、transcript watcher、smart-file-read 等。
- 修复建议：区分 CLI 用户输出与后台服务日志，将后台路径迁移到 `logger.debug/info/warn/error`。
- 需补测试：`tests/logger-usage-standards.test.ts` 通过。
- 置信度：高。

### R-007 [important] `SettingsDefaultsManager.ts.orig` 等 `.orig` 文件留在源码树，容易污染审查与发布

- 位置：`src/shared/SettingsDefaultsManager.ts.orig:55`、`src/shared/SettingsDefaultsManager.ts:56`
- 审查员：code-reviewer
- 事实依据：源码目录保留 `.orig` 文件，且旧文件缺少 `CLAUDE_MEM_PROMPT_SHOW_PROCESSING_TIME` 与 `CLAUDE_MEM_THINK_TIME_CAP_MINUTES` 字段；当前 `rg` 与人工审查都会命中这些旧代码。
- 推理说明：`.orig` 文件不一定进入 TypeScript 编译，但会被安全扫描、文本替换、打包脚本或人工审查误读。配置默认值是近期高频变更面，保留旧版本会提高误操作概率。
- 影响范围：配置管理、发布包内容、审查准确性。
- 修复建议：确认 `.orig` 文件是否仍有用途；若只是备份，应移出源码树或加入明确忽略策略。
- 需补测试：检查 npm package files 与构建脚本不会携带 `.orig`。
- 置信度：中高。

### R-008 [important] Express route param 类型未统一收窄，已经表现为编译错误

- 位置：`src/services/worker/http/BaseRouteHandler.ts:24`、`src/services/worker/http/routes/CorpusRoutes.ts:107`、`src/services/worker/http/routes/CorpusRoutes.ts:140`、`src/services/worker/http/routes/CorpusRoutes.ts:176`
- 审查员：typescript-reviewer
- 事实依据：TypeScript 6 + Express 类型下，`req.params.name` 推断为 `string | string[]`，而 CorpusRoutes 直接传给只接受 `string` 的 store/builder/agent API。
- 推理说明：这不只是类型噪音；如果路由参数解析或框架类型允许数组，底层文件名/语料库名 API 会收到非预期值。
- 影响范围：knowledge corpus 查询、删除、重建、prime/query/reprime。
- 修复建议：提供统一的 route param 解析助手，校验必须是单个非空字符串。
- 需补测试：数组或空参数返回 400，正常字符串继续工作。
- 置信度：高。

## 🟢 Nit

### R-009 [nit] 管理员登录失败的错误信息可进一步减少枚举信号

- 位置：`src/services/worker/http/routes/AuthRoutes.ts:95`、`src/services/worker/http/routes/AuthRoutes.ts:170`
- 建议：用户名错误和密码错误可返回统一的 `bad_credentials` 文案。
- 原因：当前系统固定管理员账号为 `admin`，实际风险较低；但统一错误消息可减少认证枚举信号，也更符合安全审计口径。

## 审查限制

本次没有修复代码，也没有运行浏览器端人工交互验证。`npm test` 输出非常长，报告只摘录了关键失败簇；完整失败列表应以本地最新测试输出为准。没有运行 `npm audit`、`gitleaks`、`bandit` 等外部安全扫描，因此依赖漏洞和历史密钥泄露不在本次结论覆盖范围内。

## 建议处理顺序

1. 先恢复 `npm run typecheck`，否则后续行为验证没有稳定基础。
2. 按失败簇恢复 `npm test`，优先 sync/server/settings/storage/logger。
3. 对管理员密码哈希和数据库物理外键做架构决策，避免实现继续和项目规则分叉。
4. 清理配置读取路径，确保 settings.json 是持久配置单一来源。
