### X-036 令牌哈希版本化校验（双轨迁移）

用户方案（2026-08-15 定稿）：服务端新增 `CLAUDE_MEM_SYNC_SHASUM_VALUE`（共享令牌的 sha1 十六进制），客户端新增 `CLAUDE_MEM_SYNC_AUTH_VERSION`（'2' = 请求带 `X-Claude-Mem-Auth-Version: 2` 头走新路径）。服务端校验按版本头路由：有头=2 → `sha1(presented)` 恒时比对哈希键；无头 → 明文恒时比对 `CLAUDE_MEM_SERVER_ACCESS_TOKEN`（老逻辑）。双轨期间服务端两键并存（攻击面不变），收敛点在新 client 全覆盖后服务端删明文键。设计事实：本机 ADMIN_PASSWORD（42b07b…）恰为同步令牌的 sha1——用户"shasum 口令"规范的既有实践。

- 编号：X-036
- 任务类型：需求
- 严重程度：P1
- 状态：已完成-待验证
- 来源：用户指令（2026-08-15 对话定稿，键名由用户指定 CLAUDE_MEM_SYNC_SHASUM_VALUE）
- 所属计划项：TODO-llm-provider.md（独立 fix，无 A-F/M 体系）
- 任务描述：SettingsDefaultsManager 新增 CLAUDE_MEM_SYNC_SHASUM_VALUE 与 CLAUDE_MEM_SYNC_AUTH_VERSION（默认空）；tokenAuth.ts 导出 sha1Hex/loadAccessAuth/verifyAccessToken 并重构中间件比对为双轨；ReportRoutes/DailyReportRoutes 的 authorized() 改用 verifyAccessToken；SyncAgent 配置加 authVersion（'2' 时带版本头）；worker-service 透传 CLAUDE_MEM_SYNC_AUTH_VERSION；settings-demo.json 加哈希键示例；测试覆盖双路径/空直通/大小写归一/版本头空白。
- 验收标准：(1) 无版本头+明文键 → 老路径通过；(2) 版本头 2+哈希键 → sha1 路径通过；(3) 版本头 2 但服务端无哈希键 → 拒绝；(4) 两键皆空 → false（调用方直通语义不变）；(5) 恒时比对保持；(6) typecheck 与相关测试全绿。
- 涉及文件与行号：`src/shared/SettingsDefaultsManager.ts`（2 新键）、`src/services/worker/http/middleware/tokenAuth.ts`（helper+中间件重构）、`src/services/worker/http/routes/ReportRoutes.ts:59-71`、`src/services/worker/http/routes/DailyReportRoutes.ts:55-67`、`src/services/sync/SyncAgent.ts`（config+header）、`src/services/worker-service.ts:935-947`、`tests/worker/middleware/token-auth-version.test.ts`（新增 7 用例）、`settings-demo.json`。
- 关联需求：N/A
- 实际修改位置：同上。
- 阶段验证结果：RED——测试 0 pass/1 error（导出不存在）；GREEN——7 pass/0 fail（含模块加载期 DATA_DIR 隔离：env 先行+动态 import，否则 USER_SETTINGS_PATH 冻结为真实路径）；`bun test tests/worker/middleware/` 37 pass/0 fail；`npm run typecheck` 0 错误。
- 测试方法：(1) `bun test tests/worker/middleware/token-auth-version.test.ts` 全绿；(2) `bun test tests/worker/middleware/` 无新增失败；(3) `npm run typecheck` 通过。
- 代码修复提交：`7db2c436`、`23dd8d67`(注入式修正)

### X-035 自定义端点 SSRF 加固：scheme 校验 + redirect manual（rev 委托）

后台安全审查再次点名 QwenProvider/DeepSeekProvider 的可配置端点（SSRF/Credential-Exfiltration），建议三档：URL 形状校验、封锁 loopback/内网地址、凭据仅发给白名单主机。处置：采纳①③中与设计兼容的部分——新增 provider-endpoint.ts 做 http(s) scheme 校验（非 http(s) 启动期快速失败/报表层禁 AI 段），所有凭据承载 fetch 加 `redirect: 'manual'`（防 302 弹跳带凭据请求到任意目标）；**不采纳** loopback/内网封锁与凭据白名单——本地 vLLM/Ollama 部署是自定义端点的核心设计用例，封锁即杀死该场景，且配置源是本地 settings 而非远程输入（与 X-027/X-028 同取舍），已有自定义端点 WARN 兜底。

- 编号：X-035
- 任务类型：缺陷
- 严重程度：P2
- 状态：已完成-待验证
- 来源：rev-委托（后台安全审查，2026-08-15）
- 所属计划项：TODO-llm-provider.md（独立 fix，无 A-F/M 体系）
- 任务描述：新增 `src/services/worker/provider-endpoint.ts`（isHttpEndpoint/assertHttpEndpoint）；Qwen/DeepSeek getConfig 加 assertHttpEndpoint；两 provider 与 report-provider 三协议 fetch 加 redirect: 'manual'；report-provider qwen/deepseek 分支非 http(s) 端点 → WARN + null；测试补 scheme 校验/无效端点/redirect 断言用例。
- 根因分析：Why-1——凭据请求默认跟随 3xx 重定向，自定义端点可把 Bearer 请求弹到任意目标；Why-2——非 URL 字符串直入 fetch 报 opaque 网络错误难排查；Why-3——loopback 封锁不可行（本地推理服务是核心用例）。
- 影响评估：P2。需用户配置被篡改或端点恶意才成立；加固后凭据不再可被 302 弹跳，配置错误快速可见。
- 涉及文件与行号：`src/services/worker/provider-endpoint.ts`（新增）、`src/services/worker/QwenProvider.ts`、`src/services/worker/DeepSeekProvider.ts`、`src/services/worker/reports/report-provider.ts`、`tests/services/worker/provider-endpoint.test.ts`（新增）、`tests/services/worker/reports/report-provider.test.ts`。
- 关联需求：N/A
- 实际修改位置：同上。
- 阶段验证结果：61 用例 0 fail（含新 4+2 用例）；`npm run typecheck` 0 错误。
- 测试方法：(1) `bun test tests/services/worker/provider-endpoint.test.ts tests/services/worker/reports/report-provider.test.ts` 全绿；(2) `npm run typecheck` 通过。
- 代码修复提交：`dfbacc1c`

### X-034 摘要 provider abort 误分类修复（rev 委托）

OCR + 摘要层审查员发现：classifyQwenError/classifyDeepSeekError 把 fetch 中止（cause=AbortError）包装为 ClassifiedProviderError(kind=transient)，withRetry 会重试已中止的请求（会话中止时连发 3 次注定失败的 fetch）；且 isAbortError 不识别 wrapped cause，会话层把"中止"误记"失败"。

- 编号：X-034
- 任务类型：缺陷
- 严重程度：P1
- 状态：已完成-待验证
- 来源：rev-委托（OCR + 摘要 provider 层审查员，2026-08-15）
- 所属计划项：TODO-llm-provider.md（独立 fix，无 A-F/M 体系）
- 任务描述：两个 classifier 检测 cause=AbortError → kind 'unrecoverable'（不重试）；isAbortError 递归识别 error.cause；测试补 abort 分类用例（qwen/deepseek 各 1）。
- 根因分析：Why-1——中止被重试，因为 classifier 只按 status/网络错误分类，AbortError 落入网络错误 transient 分支；Why-2——会话层误记，因为 isAbortError 只比对 name 不展开 cause。
- 影响评估：P1。会话中止触发 2 次额外重试；日志误导排障。
- 涉及文件与行号：`src/services/worker/QwenProvider.ts`（classifyQwenError）、`src/services/worker/DeepSeekProvider.ts`（classifyDeepSeekError）、`src/services/worker/agents/FallbackErrorHandler.ts:31-50`、`tests/services/worker/qwen-provider-config.test.ts`、`tests/services/worker/deepseek-provider-config.test.ts`。
- 关联需求：N/A
- 实际修改位置：同上涉及文件（abort 分支 + 递归识别 + 2 测试用例）。
- 阶段验证结果：qwen/deepseek 配置测试全绿（各含新 abort 用例）；`npm run typecheck` 0 错误。
- 测试方法：(1) `bun test tests/services/worker/qwen-provider-config.test.ts tests/services/worker/deepseek-provider-config.test.ts` 全绿；(2) `npm run typecheck` 通过。
- 代码修复提交：`90dcac89`

### X-033 install 类型缺口与 subagent-skip mock 修复（rev 委托）

审查员证实：①InstallOptions.provider 仍为三厂商联合类型，index.ts 靠 `as` 断言掩盖类型缺口；②summarize-subagent-skip.test.ts 的 worker-utils mock 缺 executeWithWorkerFallback 导出（summarize.ts:3 直接 import）且 SettingsDefaultsManager mock 的 EXCLUDED_PROJECTS 返回数组（消费端 .trim() 崩溃），实测 4/4 失败。

- 编号：X-033
- 任务类型：缺陷
- 严重程度：P1
- 状态：已完成-待验证
- 来源：rev-委托（install/UI 审查员，2026-08-15）
- 所属计划项：TODO-llm-provider.md（独立 fix，无 A-F/M 体系）
- 任务描述：InstallOptions.provider 引用 ProviderId；subagent-skip mock 补 executeWithWorkerFallback 导出、EXCLUDED_PROJECTS 改字符串。
- 根因分析：Why-1——类型缺口因 ProviderId 扩展时 InstallOptions 未同步；Why-2——mock 缺导出/错类型因被测链路持续演进而 mock 未同步（同 X-029 模式）。
- 影响评估：P1。类型缺口使 --provider qwen/deepseek 在编译期失去保护；测试假阴性掩盖回归。
- 涉及文件与行号：`src/npx-cli/commands/install.ts:1140-1145`、`tests/cli/handlers/summarize-subagent-skip.test.ts`。
- 关联需求：N/A
- 实际修改位置：同上。
- 阶段验证结果：subagent-skip 单独 8/0 全绿；typecheck 0 错误。
- 测试方法：(1) `bun test tests/cli/handlers/summarize-subagent-skip.test.ts` 全绿；(2) `npm run typecheck` 通过。
- 代码修复提交：`7c710a6d`

### X-032 EnvManager deepseek 写回分支与报表 claude 对齐（rev 委托）

审查员证实：①saveClaudeMemEnv 缺 CLAUDE_MEM_DEEPSEEK_API_KEY 写回分支（QWEN 有对称分支），经该函数持久化的 deepseek key 被静默丢弃；②报表 claude 分支不认 CLAUDE_MEM_ANTHROPIC_API_KEY 别名（server-beta 认）；③Anthropic 调用未设 temperature（默认 1.0，其它协议 0.4）。

- 编号：X-032
- 任务类型：缺陷
- 严重程度：P1
- 状态：已完成-待验证
- 来源：rev-委托（配置键审查员 + 报表层审查员，2026-08-15）
- 所属计划项：TODO-llm-provider.md（独立 fix，无 A-F/M 体系）
- 任务描述：EnvManager 补 DEEPSEEK 对称写回分支；report-provider claude 分支认别名；Anthropic 请求显式 temperature: 0.4。
- 根因分析：Why-1——X-021 改 QWEN 写回块时未发现 DeepSeek 键在 X-016 新增后从未有写回分支；Why-2——别名与温度差异因 report-provider 三协议各自独立实现未对齐。
- 影响评估：P1（deepseek key 经 .env 管理接口丢失）；P3（别名/温度）。
- 涉及文件与行号：`src/shared/EnvManager.ts:181-190`、`src/services/worker/reports/report-provider.ts`（claude 分支 + callAnthropic）。
- 关联需求：N/A
- 实际修改位置：同上。
- 阶段验证结果：report-provider 测试全绿；typecheck 0 错误。
- 测试方法：(1) `bun test tests/services/worker/reports/report-provider.test.ts` 全绿；(2) `npm run typecheck` 通过。
- 代码修复提交：`35b6d372`

### X-031 server-beta Gemini 密钥改请求头 + 空 provider 语义（rev 委托）

审查员证实：①X-027 只修了报表层，GeminiObservationProvider（server-beta）仍把 API key 拼 URL query（?key=），密钥入日志；②CLAUDE_MEM_PROVIDER 空串落入 unknown 告警，与报表层"空=默认语义"不一致；③report-provider.ts:8 文件头注释仍写 ?key= 与实现矛盾。

- 编号：X-031
- 任务类型：缺陷
- 严重程度：P1
- 状态：已完成-待验证
- 来源：rev-委托（报表与 server-beta 层审查员，2026-08-15）
- 所属计划项：TODO-llm-provider.md（独立 fix，无 A-F/M 体系）
- 任务描述：GeminiObservationProvider 改 x-goog-api-key 头鉴权；create-server-beta-service 空串按默认 claude 静默处理；report-provider 头注释修正。
- 根因分析：Why-1——X-027 处置报表层时 server-beta 的 Gemini 调用路径未被盘点；Why-2——空串语义两处入口未对齐。
- 影响评估：P1（密钥日志泄漏）；P3（语义/注释）。
- 涉及文件与行号：`src/server/generation/providers/GeminiObservationProvider.ts:67-72`、`src/server/runtime/create-server-beta-service.ts:236-239`、`src/services/worker/reports/report-provider.ts:8`。
- 关联需求：N/A
- 实际修改位置：同上。
- 阶段验证结果：server 测试全绿；typecheck 0 错误。
- 测试方法：(1) `bun test tests/server/generation/server-provider-env.test.ts` 全绿；(2) `npm run typecheck` 通过。
- 代码修复提交：`eb97085b`

### X-030 摘要 provider 层审查缺陷修复（rev 委托）

### X-030 摘要 provider 层审查缺陷修复（rev 委托）

rev 审查（摘要 provider 层审查员）证实 4 项代码缺陷：①端点解析尾斜杠 bug——`/\/chat\/completions$/` 不匹配 `.../chat/completions/`（尾斜杠），会被拼成 `.../chat/completions/chat/completions`，已实测复现（Qwen/DeepSeek resolver 同缺陷）；②withRetry 超时死代码——attemptSignal 恒非空使本地 AbortController 与 90s 定时器永不生效，实际超时为 withRetry 默认 30s，与作者 90s 意图不符（Qwen 既有、DeepSeek 复制）；③isGeminiSelected/isOpenRouterSelected 精确比较与 Qwen/DeepSeek 的 toLowerCase 不一致，`"GEMINI"` 不选中而 `"QWEN"` 会选中；④afterEach 残留死代码块（X-029 清理未净）。另补端点测试三用例（base 补全/尾斜杠去重/完整路径原样）。

- 编号：X-030
- 任务类型：缺陷
- 严重程度：P1
- 状态：已完成-待验证
- 来源：rev-委托（2026-08-15）
- 所属计划项：TODO-llm-provider.md（独立 fix，无 A-F/M 体系）
- 任务描述：resolveQwenEndpoint/resolveDeepSeekEndpoint 先 strip 尾斜杠再测 completions 后缀；queryQwen/queryDeepSeek 删死 controller/timer 并传 perAttemptTimeoutMs=AI_TIMEOUT_MS；Gemini/OpenRouter is*Selected 补 trim+toLowerCase；清理测试文件死代码块；补端点解析测试用例（base→补全、`.../v1/`→去尾补全、`.../chat/completions/`→不重复）。
- 根因分析：Why-1——尾斜杠不匹配因为正则未先归一化；Why-2——超时死代码因为 withRetry 恒传 attemptSignal 而本地 signal 只在 attemptSignal 为空时才生效；Why-3——精确比较遗留自 Gemini/OpenRouter 的历史实现，X-015/X-016 新写的 Qwen/DeepSeek 用了 toLowerCase。
- 影响评估：P1。尾斜杠配置 404 难排查；30s 超时提前中止长摘要；大小写变体静默回落 claude。
- 涉及文件与行号：`src/services/worker/QwenProvider.ts`（resolver/queryQwen）、`src/services/worker/DeepSeekProvider.ts`（resolver/queryDeepSeek）、`src/services/worker/GeminiProvider.ts:547`、`src/services/worker/OpenRouterProvider.ts:548`、`tests/services/worker/deepseek-provider-config.test.ts`、`tests/services/worker/qwen-provider-config.test.ts`。
- 关联需求：N/A

### X-029 测试基础设施修复：mock 泄漏与 stale mock（X-025 验证发现）

全量测试验证（X-025）发现本批次新测试在整跑中 33 例失败，根因两级：①预存缺陷——tests/cli/handlers/ 三个文件的 mock.module(SettingsDefaultsManager/worker-utils/transcript-parser) 缺少被测链路的命名导出（fetchWithTimeout、isWorkerFallback、extractLastAssistantEntry 等），该套件本就 32/34 预存失败；且 bun 并发执行时 mock.module 跨文件泄漏到同进程其它测试文件，使 SettingsDefaultsManager.getAllDefaults 变为 undefined，波及本批次新测试与既有 settings-defaults-manager 测试；②本批次新测试对共享模块与真实凭证库（~/.claude-mem/.env）的隐式依赖，在并发污染下不稳定。修复分两层：补全 stale mock 导出 + mock.restore；新测试改为纯对象构造（不 import SettingsDefaultsManager 值导入）+ CLAUDE_MEM_ENV_FILE 指向不存在路径的凭证库隔离 + 真实 defaults 断言加未 mock 守卫（skipIf）。修复后整跑 120 fail（基线 a57fa387 为 133 fail），本批次新测试整跑 0 失败；CORS 用例整跑失败经单独运行 15/15 全绿确认为预存顺序/端口抖动，与本批次无关。

- 编号：X-029
- 任务类型：缺陷
- 严重程度：P1
- 状态：已完成-待验证
- 来源：X-025 全量测试验证（2026-08-15）
- 所属计划项：TODO-llm-provider.md（独立 fix，无 A-F/M 体系）
- 任务描述：补全三个 cli/handlers 测试文件的 mock 命名导出与 mock.restore；五个新测试文件改纯对象构造 + 凭证库隔离 + skipIf 守卫。
- 根因分析：Why-1——新测试整跑失败，因为 bun 并发执行时他文件 mock.module 泄漏到本文件；Why-2——泄漏存在，因为 bun 1.3.12 的 mock 注册表在同进程多文件间共享且原测试文件从不 restore；Why-3——泄漏恰好致命，因为新测试依赖 SettingsDefaultsManager.getAllDefaults（被 mock 对象无此方法）；Why-4——"空 key"断言失败，因为 resolver 三级回脱的凭证库一级读真实 ~/.claude-mem/.env（或被他测试污染的 CLAUDE_MEM_ENV_FILE）；Why-5——cli/handlers 套件自身预存失败，因为被测链路新增的命名导出（fetchWithTimeout 等）从未同步进 mock 工厂。
- 影响评估：P1（测试可靠性）。整跑中本批次测试 33 例假阳性，掩盖真实回归信号。
- 涉及文件与行号：`tests/cli/handlers/summarize-tag-stripping.test.ts`、`tests/cli/handlers/summarize-subagent-skip.test.ts`、`tests/cli/handlers/file-edit-observer-session-skip.test.ts`、`tests/services/worker/deepseek-provider-config.test.ts`、`tests/services/worker/qwen-provider-config.test.ts`、`tests/services/worker/reports/report-provider.test.ts`、`tests/server/generation/server-provider-env.test.ts`、`tests/shared/llm-provider-settings.test.ts`。
- 关联需求：N/A
- 实际修改位置：三个 cli/handlers 文件（worker-utils mock 补 fetchWithTimeout/isWorkerFallback；transcript-parser mock 补 extractLastMessageFromJsonl/extractLastAssistantEntry/computePerTurnActivity；afterAll mock.restore）；五个新测试文件（SettingsDefaultsManager 值导入改 type 导入 + {} as unknown as SettingsDefaults 纯对象构造；beforeEach CLAUDE_MEM_ENV_FILE 指向不存在路径 + afterEach 恢复；llm-provider-settings 加 skipIf(!REAL_DEFAULTS_AVAILABLE) 守卫）。
- 阶段验证结果：整跑 153→120 fail（基线 133），本批次新测试整跑 0 失败；`npm run typecheck` 0 错误；CORS 用例单独运行 15/15 全绿（整跑失败为预存端口/顺序抖动）；cli/handlers 套件 32→16 fail（其余失败源于嵌套 claude-mem.github 重复目录干扰 bun 路径解析，预存环境问题）。
- 测试方法：(1) `bun test` 整跑本批次测试文件零失败；(2) `bun test tests/cli/handlers/summarize-tag-stripping.test.ts` 单独全绿；(3) `npm run typecheck` 通过。
- 代码修复提交：`722bd891`

### X-025 构建 + 全量测试 + rev 审查 + 缺陷修复（大模型配置统一化 T-11 收官）

统一化批次（X-014~X-024）实现完毕后，执行 TODO T-11：build-and-sync 重建全部 hook 产物并确定性重启 worker；全量测试与干净 HEAD 基线（a57fa387）对比；委托 rev 独立审查（4 分组审查子代理 + OCR 外部独立审查）发现 7 个代码缺陷（4 个本批次引入、3 个批次暴露的预存缺陷），经 X-030~X-034 修复闭环；复跑全量与重建产物。

- 编号：X-025
- 任务类型：其他（验证/审查）
- 严重程度：P1
- 状态：已验证-关闭
- 来源：TODO-llm-provider.md T-11（2026-08-14 与用户对话设计定稿）
- 所属计划项：TODO-llm-provider.md T-11（独立 fix，无 A-F/M 体系）
- 任务描述：build-and-sync + worker 健康验证 + 全量测试基线对比 + rev 审查 + 审查缺陷修复闭环 + 复审。
- 实际修改位置：plugin/ 构建产物重建（`ada147ac`、`a5f1daf7`）；审查修复 X-030~X-034（见各条目）；审查报告 `review-report-20260815012100.md`。
- 阶段验证结果：worker /api/health status=ok、initialized=true、mcpReady=true、ai.provider=claude（X-017 删除自动兜底后默认 claude 生效的运行时证据）；全量 4261 用例 120 fail/1 error，基线 a57fa387 为 133 fail/5 errors（净改善 13，本批次新增测试整跑 0 失败）；typecheck 0 错误；rev 审查最终结论 approve（0 blocking/0 未处理 important，11 项 nit·suggestion 留档转 J）。
- rev 审查结果：`review-report-20260815012100.md` 结论 `approve`；发现并修复 7 缺陷（尾斜杠解析/超时死代码/abort 误分类/Gemini 密钥入 URL/EnvManager 写回缺口/install 类型缺口/subagent mock 缺失）；need-confirm 设计取舍（无迁移兼容、模型统一、自定义端点自担责）均已按设计定稿接受并文档化。
- 代码修复提交：`ada147ac`、`a5f1daf7`（构建产物）、`0a75437f`~`eb97085b`（X-030~X-034）、`74f170a6`（回填）
- 关闭时间：2026-08-15 01:25

### X-024 文档同步（大模型配置统一化 T-10）

现状调查：CLAUDE.md/README/docs 中无旧键残留（历史文档从未记录 REPORT_QWEN_API_KEY 等键），任务收敛为新增统一 provider 架构文档。docs/public/configuration.mdx 的 provider 表仅三厂商（:17），是公开文档的主要缺口。

- 编号：X-024
- 任务类型：其他（文档）
- 严重程度：P2
- 状态：已完成-待验证
- 来源：TODO-llm-provider.md T-10（2026-08-14 与用户对话设计定稿）
- 所属计划项：TODO-llm-provider.md T-10（独立 fix，无 A-F/M 体系）
- 任务描述：docs/public/configuration.mdx 更新 CLAUDE_MEM_PROVIDER 行（5 厂商+默认语义），新增 Qwen/DeepSeek provider 设置表（key/model/URL 及 OpenAI 兼容自担责说明）、Report AI Provider 设置表（空=禁用、复用厂商组）、server-beta claude 仅认 key 的边界提示；CLAUDE.md Configuration 段新增 LLM Provider Architecture 概要（三处选择逻辑文件指针）；README.md Configuration 段补一句话级厂商说明。
- 验收标准：(1) 文档无旧键残留（grep）；(2) 5 厂商与 REPORT_PROVIDER 语义在公开文档可查；(3) server-beta 多租户边界写明；(4) 文档构建不受影响（MDX 语法合规）。
- 涉及文件与行号：`docs/public/configuration.mdx:14-46`、`CLAUDE.md:36-38`、`README.md:302-306`。
- 关联需求：`doc/B-系统设计文档.md`（需 ree 刷新——与代码层事实同步）
- 实际修改位置：`docs/public/configuration.mdx`（provider 行扩 5 厂商；新增 Qwen/DeepSeek/Report AI Provider 三张表 + server-beta Note 块）、`CLAUDE.md`（LLM Provider Architecture 段落）、`README.md`（厂商一句话）。
- 阶段验证结果：文档 grep 四旧键零残留；MDX 为纯表格与 Note 组件，无语法风险；typecheck 不涉及。
- 测试方法：(1) grep 旧键零残留；(2) docs 站点构建由 CI 在 push main 后自动执行。
- 代码修复提交：`751972bf`

### X-023 Viewer UI 设置面板更新（大模型配置统一化 T-09）

现状调查：Viewer 的 Advanced 设置区（ContextSettingsModal.tsx:334-449）provider 选择仅 claude/gemini/openrouter 三选项，无 qwen/deepseek 分组字段与 REPORT_PROVIDER；types.ts Settings 与 constants/settings.ts DEFAULT_SETTINGS 均缺新 7 键。服务端白名单（X-018）已支持新键写入，本任务补齐前端。注意 constants/settings.ts:2 的 CLAUDE_MEM_MODEL 默认值（claude-sonnet-4-6）与 SettingsDefaultsManager 不一致（预存漂移，仅离线兜底使用，不在本任务范围）。

- 编号：X-023
- 任务类型：需求
- 严重程度：P1
- 状态：已完成-待验证
- 来源：TODO-llm-provider.md T-09（2026-08-14 与用户对话设计定稿）
- 所属计划项：TODO-llm-provider.md T-09（独立 fix，无 A-F/M 体系）
- 任务描述：types.ts Settings 加 CLAUDE_MEM_QWEN_MODEL/_API_KEY/_URL、CLAUDE_MEM_DEEPSEEK_API_KEY/_MODEL/_URL、CLAUDE_MEM_REPORT_PROVIDER（可选字段）；constants/settings.ts DEFAULT_SETTINGS 同步；ContextSettingsModal provider 选择加 Qwen/DeepSeek 选项与条件字段组（key=password、model=text、URL=text 可选）；新增 Report AI Provider 选择（off + 5 厂商，默认 off）。
- 验收标准：(1) 新 7 键可通过 UI 编辑并经白名单落盘；(2) 选择 qwen/deepseek 显示对应字段组；(3) REPORT_PROVIDER 有 off 默认项；(4) viewer typecheck（tsconfig）与 build 通过。
- 涉及文件与行号：`src/ui/viewer/types.ts:94-121`、`src/ui/viewer/constants/settings.ts`、`src/ui/viewer/components/ContextSettingsModal.tsx:334-449`。
- 关联需求：`doc/B-系统设计文档.md` Viewer 章节（需 ree 刷新）
- 实际修改位置：`types.ts:100-113`（Settings 加 7 可选键）、`constants/settings.ts:14-20`（DEFAULT_SETTINGS 同步）、`hooks/useSettings.ts`（formState 初始化映射加 7 键，服务器值优先）、`ContextSettingsModal.tsx`（provider 选项加 qwen/deepseek；qwen/deepseek 条件字段组：key password + model text + URL text 可选；新增 Report AI Provider select：off+5 厂商）。
- 阶段验证结果：`npm run typecheck` 0 错误（含 viewer tsconfig）；`bun test tests/viewer/` 7 pass/1 fail 与干净 HEAD 基线一致（welcome-card-storage 预存失败，localStorage 相关，与本次无关）；UI 产物构建由 X-025 build-and-sync 统一执行。
- 涉及文档刷新：需 ree 刷新 `doc/B-系统设计文档.md` Viewer 章节；本次按 fix 规则只在 X 标注。
- 测试方法：(1) `npm run typecheck` 通过；(2) `bun test tests/viewer/` 与基线对比零新增失败；(3) X-025 build-and-sync 产物验证。
- 代码修复提交：`6fe41b97`

### X-028 server-beta 自定义端点 SSRF 告警（rev 委托）

后台安全审查（X-020 提交 9ddb59d1）发现 SSRF/Credential-Exfiltration——server-beta 的 qwen/deepseek 分支复用可配置端点（CLAUDE_MEM_QWEN_URL/CLAUDE_MEM_DEEPSEEK_URL），与 X-027 已处置的报表路径同属一类设计取舍（可配置端点为本地 vLLM/Ollama 场景设计，无法地址白名单化）。处置与 X-027 一致：端点非内置默认值时 WARN（仅主机名，不含 key）；为让比较基准不散落，将 QwenProvider.DASHSCOPE_URL 与 DeepSeekProvider.DEEPSEEK_COMPLETIONS_URL 导出为契约常量并加测试锁定。

- 编号：X-028
- 任务类型：缺陷
- 严重程度：P2
- 状态：已完成-待验证
- 来源：rev-委托（后台安全审查，2026-08-15）
- 所属计划项：TODO-llm-provider.md（独立 fix，无 A-F/M 体系）
- 任务描述：buildServerGenerationProviderFromEnv 的 qwen/deepseek 分支增加 warnServerCustomEndpoint 告警（端点 ≠ 内置默认时 WARN 主机名）；DASHSCOPE_URL/DEEPSEEK_COMPLETIONS_URL 导出；测试锁定默认端点契约。
- 根因分析：与 X-027 Why-2 同——可配置端点属设计取舍，只能以可观测告警降低误配风险；server-beta 分支在 X-020 未同步 X-027 的告警处置。
- 影响评估：P2。需用户配置被篡改才成立；告警为可观测性兜底。
- 涉及文件与行号：`src/server/runtime/create-server-beta-service.ts`（imports + warnServerCustomEndpoint + qwen/deepseek 分支）、`src/services/worker/QwenProvider.ts:19`、`src/services/worker/DeepSeekProvider.ts:24`、`tests/server/generation/server-provider-env.test.ts`。
- 关联需求：N/A
- 实际修改位置：`create-server-beta-service.ts`（warnServerCustomEndpoint 新增；qwen/deepseek 分支告警调用）、`QwenProvider.ts:19`/`DeepSeekProvider.ts:24`（默认端点常量改导出）、`server-provider-env.test.ts`（默认端点契约用例 1 条）。
- 阶段验证结果：10 pass/0 fail（新增契约用例）；`npm run typecheck` 0 错误。
- 测试方法：(1) `bun test tests/server/generation/server-provider-env.test.ts` 全绿；(2) `npm run typecheck` 通过。
- 代码修复提交：`23e7b356`

### X-022 install.ts 交互安装流程更新（大模型配置统一化 T-08）

现状调查：install.ts 的 ProviderId 仅 claude/gemini/openrouter（:642），provider 选择交互无 qwen/deepseek；非 claude 分支的 key 提示逻辑（:928-960）只覆盖 gemini/openrouter 两厂商；周报 AI 由独立的 promptDashscopeKey（X-021 已改新键）询问 Qwen key，无 REPORT_PROVIDER 概念。设计（TODO T-08）要求：provider 交互加 qwen/deepseek；按所选 provider 提示对应 _API_KEY（qwen/deepseek 另可提示 _URL，可选）；新增 REPORT_PROVIDER 询问（默认空 = 禁用）。因 REPORT_PROVIDER 复用厂商组 key，原独立 promptDashscopeKey 与 provider 流程的 qwen 提示重复，一并移除（qwen key 由 provider/report 两处共用同一组提示逻辑）。

- 编号：X-022
- 任务类型：需求
- 严重程度：P1
- 状态：已完成-待验证
- 来源：TODO-llm-provider.md T-08（2026-08-14 与用户对话设计定稿）
- 所属计划项：TODO-llm-provider.md T-08（独立 fix，无 A-F/M 体系）
- 任务描述：ProviderId 联合加 qwen/deepseek；provider 选择选项加 Qwen/DeepSeek；非 claude 分支泛化为 4 厂商映射（label/key 变量），qwen/deepseek 在 key 后追加可选 URL 提示（空跳过）；新增 promptReportProvider()：select off（默认，写空串）+ 5 厂商，选厂商时 key 缺失则提示补 key，mergeSettings 写 REPORT_PROVIDER；删除 promptDashscopeKey 及其调用（:1156）。
- 验收标准：(1) ProviderId 含 5 厂商；(2) 选择交互含 Qwen/DeepSeek 选项；(3) 选 qwen/deepseek 提示 key 与可选 URL；(4) 安装流程询问 REPORT_PROVIDER（默认 off）；(5) 非交互路径（--provider=qwen/deepseek）不崩溃；(6) typecheck 与既有 install 测试通过。
- 涉及文件与行号：`src/npx-cli/commands/install.ts:642,731-961,963-996,1146-1160`。
- 关联需求：`doc/B-系统设计文档.md` 安装流程章节（需 ree 刷新）
- 实际修改位置：`src/npx-cli/commands/install.ts`（ProviderId 加 qwen/deepseek；选择选项加两项；非 claude 分支改 vendorMeta 四厂商映射并加 qwen/deepseek 可选 URL 提示；promptDashscopeKey 删除、替换为 promptReportProvider——select off+5 厂商、key 复用厂商组缺失时补录、mergeSettings 落盘）、`src/npx-cli/index.ts:26,86-90`（--provider 校验与帮助文案加 qwen/deepseek）、`tests/install-provider-options.test.ts`（新增 4 条源码断言）。
- 阶段验证结果：RED——新源码断言 4 fail（ProviderId/选项/REPORT_PROVIDER/URL 特征不存在，输出为整文件 Received 转储）；GREEN——4 pass；`npm run typecheck` 0 错误；install 相关测试 118 pass/1 fail，唯一失败为预存问题（install-non-tty.test.ts:127 的 sync-marketplace.cjs gitignore 断言，git stash 基线对比确认与本次无关）。
- 涉及文档刷新：需 ree 刷新 `doc/B-系统设计文档.md` 安装流程章节；本次按 fix 规则只在 X 标注。
- 测试方法：(1) `bun test tests/install-provider-options.test.ts` 全绿；(2) `bun test tests/install-*.test.ts` 无新增失败；(3) `npm run typecheck` 通过。
- 代码修复提交：`e5cf772c`

### X-027 报表 Gemini 密钥改请求头 + 自定义端点 SSRF 告警（rev 委托）

后台安全审查（X-019 提交 448b7d7d）发现 2 项：①secret-in-url-query——callGemini 把 API key 拼在 URL query（?key=），密钥会泄漏到代理/访问日志；Gemini 官方支持 `x-goog-api-key` 请求头，改头即修；②SSRF/credential-exfiltration——CLAUDE_MEM_QWEN_URL/CLAUDE_MEM_DEEPSEEK_URL 为可配置端点，若被改为恶意地址则 Bearer 密钥随之发出。该项属设计固有取舍（用户自担责保证 OpenAI 兼容，与 ANTHROPIC_BASE_URL 同类；禁用自定义端点会破坏 vLLM/Ollama 本地部署的合理场景），处置为：端点非内置默认值时 WARN 告警（明确提示 key 将发往该主机），不引入白名单/黑名单限制。

- 编号：X-027
- 任务类型：缺陷
- 严重程度：P2
- 状态：已完成-待验证
- 来源：rev-委托（后台安全审查，2026-08-15）
- 所属计划项：TODO-llm-provider.md（独立 fix，无 A-F/M 体系）
- 任务描述：callGemini 改为 `x-goog-api-key` 请求头鉴权（URL 去掉 ?key=）；resolveReportProviderConfig 的 qwen/deepseek 分支在端点非默认时 WARN（含主机名，不含 key）；对应测试更新（Gemini URL 无 key 参数 + header 断言、自定义端点告警路径不改变行为）。
- 根因分析：Why-1——密钥入 URL 因为沿用了 Gemini 官方 ?key= 示例写法，未采用官方同样支持的头鉴权；Why-2——SSRF 风险为设计取舍：可配置端点正是为本地 vLLM/Ollama 服务设计，无法用地址白名单解决，只能通过可观测告警降低误配风险。
- 影响评估：P2。单机部署下 ?key= 仅泄漏于本机日志/代理；LAN server 模式下放大为日志级泄漏；SSRF 项需用户配置被篡改才成立。
- 涉及文件与行号：`src/services/worker/reports/report-provider.ts`（callGemini + resolveReportProviderConfig qwen/deepseek 分支）、`tests/services/worker/reports/report-provider.test.ts`。
- 关联需求：N/A
- 实际修改位置：`src/services/worker/reports/report-provider.ts:36-47`（新增 warnOnCustomEndpoint 辅助 + DASHSCOPE/DEEPSEEK 默认端点常量）、qwen/deepseek 分支调用告警、callGemini 改 header 鉴权；`tests/services/worker/reports/report-provider.test.ts`（Gemini 用例改断言：URL 无 key、x-goog-api-key 头存在）。
- 阶段验证结果：RED——Gemini 用例 1 fail（URL 仍含 ?key=）；GREEN——13 pass/0 fail；`npm run typecheck` 0 错误。
- 测试方法：(1) `bun test tests/services/worker/reports/report-provider.test.ts` 全绿；(2) `npm run typecheck` 通过。
- 代码修复提交：`06021d97`

### X-021 移除废弃配置键与遗留迁移逻辑（大模型配置统一化 T-01 删键阶段）

现状调查：4 个废弃键中 CLAUDE_MEM_SERVER_PROVIDER/_MODEL 本就只存在于 env 层（不在 SettingsDefaults 接口），已随 X-020 消费清零、无需删定义；需删的是 CLAUDE_MEM_WEEKLY_REPORT_MODEL、CLAUDE_MEM_REPORT_QWEN_API_KEY 两键 + 两处遗留兼容逻辑：SettingsDefaultsManager.loadFromFile 的 X-008 DASHSCOPE_API_KEY 迁移块（:313-336）、EnvManager 的 DASHSCOPE_API_KEY 映射与 REPORT_QWEN 键解析/写回（:45,109-115,181-187）。设计明确不做旧版兼容。install.ts 的 REPORT_QWEN_API_KEY 引用（:964-975）属 X-022 范围，本任务完成后剩余消费点唯一。

- 编号：X-021
- 任务类型：需求
- 严重程度：P1
- 状态：已完成-待验证
- 来源：TODO-llm-provider.md T-01 删键阶段（2026-08-14 与用户对话设计定稿）
- 所属计划项：TODO-llm-provider.md T-01（独立 fix，无 A-F/M 体系）
- 任务描述：SettingsDefaultsManager 接口与 DEFAULTS 删除 WEEKLY_REPORT_MODEL/REPORT_QWEN_API_KEY，删除 loadFromFile 内 X-008 迁移块；EnvManager.ClaudeMemEnv 删除 CLAUDE_MEM_REPORT_QWEN_API_KEY（类型/解析/DASHSCOPE 映射/写回块），写回块改 CLAUDE_MEM_QWEN_API_KEY；更新依赖旧键语义的测试（settings-defaults-manager X-008 迁移组删除、qwen-key-compat 遗留映射用例删除，保留 isQwenAvailable 新键回脱用例）；llm-provider-settings.test.ts 加废弃键不存在断言（RED→GREEN）。
- 验收标准：(1) getAllDefaults() 不含两个废弃键；(2) 全 src grep 旧键零残留；(3) 旧 X-008 迁移测试与遗留映射测试移除后相关测试全绿；(4) typecheck 通过且无新增测试失败。
- 涉及文件与行号：`src/shared/SettingsDefaultsManager.ts:112-121,224-227,309-336`、`src/shared/EnvManager.ts:39-46,103-115,176-187`、`src/npx-cli/commands/install.ts:963-996`、`tests/shared/settings-defaults-manager.test.ts:226-270`、`tests/shared/qwen-key-compat.test.ts:36-60`、`tests/shared/llm-provider-settings.test.ts`。
- 关联需求：`doc/B-系统设计文档.md` 环境变量清单（需 ree 刷新）
- 实际修改位置：`SettingsDefaultsManager.ts`（接口/DEFAULTS 删两键、loadFromFile 删 X-008 迁移块）、`EnvManager.ts`（ClaudeMemEnv 删 REPORT_QWEN 键；解析删 REPORT_QWEN+DASHSCOPE 映射；写回块改 CLAUDE_MEM_QWEN_API_KEY）、`install.ts:963-996`（promptDashscopeKey 改用新键 CLAUDE_MEM_QWEN_API_KEY——getSetting 参数带类型约束，删键后必须同步改否则 typecheck 失败，属删旧键的必然连带；深seek 交互扩展仍归 X-022）、`tests/shared/llm-provider-settings.test.ts`（废弃键不存在断言）、`tests/shared/settings-defaults-manager.test.ts`（X-008 迁移组 4 用例删除）、`tests/shared/qwen-key-compat.test.ts`（遗留映射用例替换为新键解析用例，保留 isQwenAvailable 回脱）。
- 阶段验证结果：RED——新断言 1 fail（废弃键仍存在）；GREEN——全绿；`npm run typecheck` 0 错误（修 install.ts 连带类型错误后）；`bun test tests/shared/` 184 pass/1 fail，唯一失败为预存问题（settings-defaults-manager.test.ts:288 断言默认模型 claude-sonnet-4-6，9e297305 引入）；全 src grep 四个旧键零残留（仅 SettingsDefaultsManager 内一行说明性注释提及历史键名）。
- 涉及文档刷新：需 ree 刷新 `doc/B-系统设计文档.md` 环境变量清单；本次按 fix 规则只在 X 标注。
- 测试方法：(1) `bun test tests/shared/llm-provider-settings.test.ts tests/shared/qwen-key-compat.test.ts` 全绿；(2) `bun test tests/shared/` 无新增失败；(3) `npm run typecheck` 通过；(4) grep 旧键零残留。
- 代码修复提交：`77e169cf`

### X-020 server-beta 生成 provider 合并到 CLAUDE_MEM_PROVIDER（大模型配置统一化 T-06）

现状调查：server-beta 的 `buildServerGenerationProviderFromEnv()`（create-server-beta-service.ts:232-261）读独立配置 CLAUDE_MEM_SERVER_PROVIDER/_MODEL，仅支持 claude/gemini/openrouter 三厂商；claude 分支仅认 ANTHROPIC_API_KEY（无 OAuth，符合"服务器不碰个人登录态"边界）。合并方案（设计定稿第 5 条）：改读 CLAUDE_MEM_PROVIDER（未配置默认 claude）+ 厂商配置组；新增 qwen/deepseek 分支（OpenAI 兼容，复用 OpenRouterObservationProvider 泛化出 baseUrl/providerLabel 构造参数）；claude 分支保持仅认 key，缺 key → null + WARN（生成禁用）。SERVER_PROVIDER/SERVER_MODEL 消费清零后由 X-021 从 SettingsDefaultsManager 删除。经典 worker 的 claude OAuth 认证链不引入 server-beta。

- 编号：X-020
- 任务类型：需求
- 严重程度：P1
- 状态：已完成-待验证
- 来源：TODO-llm-provider.md T-06（2026-08-14 与用户对话设计定稿）
- 所属计划项：TODO-llm-provider.md T-06（独立 fix，无 A-F/M 体系）
- 任务描述：buildServerGenerationProviderFromEnv 改为接受可选 settings（默认 loadFromFile，供测试注入），读 CLAUDE_MEM_PROVIDER（默认 claude）；五厂商分支：claude（ANTHROPIC_API_KEY/CLAUDE_MEM_ANTHROPIC_API_KEY + CLAUDE_MEM_MODEL，缺 key → WARN + null）、gemini、openrouter、qwen（resolveQwen* 纯函数）、deepseek（resolveDeepSeek*）；OpenRouterObservationProvider 增加 baseUrl/providerLabel 可选构造参数（默认值保持原行为）供 qwen/deepseek 复用；shared/types.ts 的 providerLabel 联合加 qwen/deepseek。
- 验收标准：(1) 未配置 provider → claude 默认，有 ANTHROPIC_API_KEY 可用；(2) claude 无 key → null（生成禁用 + WARN）；(3) qwen/deepseek 走各自厂商组 key/model/endpoint 且请求 URL/模型正确（fetch 捕获验证）；(4) gemini/openrouter 行为不变；(5) CLAUDE_MEM_SERVER_PROVIDER 不再被读取（回归护栏：设置旧变量不影响选择）；(6) typecheck 通过且无新增测试失败。
- 涉及文件与行号：`src/server/runtime/create-server-beta-service.ts:210-261`、`src/server/generation/providers/OpenRouterObservationProvider.ts:15-60`、`src/server/generation/providers/shared/types.ts`。
- 关联需求：`doc/B-系统设计文档.md` server-beta 章节（需 ree 刷新）
- 实际修改位置：`src/server/runtime/create-server-beta-service.ts:3-8,214-222,236-288`（新增 settings 注入签名与 5 厂商分支，导出供测试；Disabled 提示文案改 CLAUDE_MEM_PROVIDER）、`src/server/generation/providers/OpenRouterObservationProvider.ts`（baseUrl/providerLabel 泛化，缺省保持原行为）、`src/server/generation/providers/shared/types.ts`（providerLabel 联合加 qwen/deepseek）、`tests/server/generation/server-provider-env.test.ts`（新增 9 用例：8 路由断言 + 1 协议级 fetch 捕获）。
- 阶段验证结果：RED——0 pass/1 fail/1 error（buildServerGenerationProviderFromEnv 未导出）；GREEN——9 pass/0 fail；`npm run typecheck` 0 错误；`bun test tests/server/` 311 用例 0 fail（18 skip，含既有跳过）。跨层引用说明：create-server-beta-service 引用 worker 层 resolveQwen*/resolveDeepSeek* 纯函数，模块顶层无副作用，统一 bundle 下无循环依赖（typecheck 验证）。
- 涉及文档刷新：需 ree 刷新 `doc/B-系统设计文档.md` server-beta 章节；本次按 fix 规则只在 X 标注。
- 测试方法：(1) `bun test tests/server/generation/server-provider-env.test.ts` 全绿；(2) `bun test tests/server/` 无新增失败；(3) `npm run typecheck` 通过。
- 代码修复提交：`9ddb59d1`

### X-026 SettingsRoutes provider 校验的 type-confusion 与校验-消费差异（rev 委托）

后台安全审查（X-018 提交 f25e6825）发现 3 个问题，其中 2 个为本次引入缺陷、1 个为预存模式观察：①sensitive-data-exfiltration——GET /api/settings 返回含 API key 的完整配置，经核对属预存模式（GEMINI/OPENROUTER key 历来如此，worker 默认 127.0.0.1 绑定），本次仅新增同类键、未引入新暴露类，记观察不修；②type-confusion-crash——isValidProviderValue 对非字符串输入（如 `{"CLAUDE_MEM_PROVIDER":123}`）执行 `.trim()` 抛 TypeError，请求处理器崩溃，旧实现 `Array.includes` 无此问题，系 X-018 回归；③validator-consumer-differential——校验用 trim+toLowerCase 归一化，但写入路径存原始值，Gemini/OpenRouter 的 is*Selected 用精确相等比较，导致 `" GEMINI "` 这类值校验通过却静默回落 claude。

- 编号：X-026
- 任务类型：缺陷
- 严重程度：P1
- 状态：已验证-关闭
- 来源：rev-委托（后台安全审查，2026-08-15）
- 所属计划项：TODO-llm-provider.md（独立 fix，无 A-F/M 体系）
- 任务描述：isValidProviderValue 增加非字符串守卫（typeof 检查，非字符串→false 拒绝而非崩溃）；新增导出 normalizeProviderValue(value: unknown): string | undefined（trim+toLowerCase，空→undefined）；handleUpdateSettings 写入前对 CLAUDE_MEM_PROVIDER/CLAUDE_MEM_REPORT_PROVIDER 做归一化落盘（undefined→删键回落默认），消除校验-消费差异。
- 根因分析：Why-1——非字符串输入导致崩溃，因为 isValidProviderValue 参数声明为 string|undefined 但对 req.body 任意值直接调用 .trim()；Why-2——旧实现用 Array.includes 天然容忍任意类型，X-018 重写时未加类型守卫；Why-3——校验-消费差异存在，因为校验归一化只在判定时生效、落盘值未归一化；Why-4——Gemini/OpenRouter 的 is*Selected 沿用历史精确比较，未随 X-018 统一为 toLowerCase。
- 影响评估：P1。非法类型请求可致 /api/settings 处理器崩溃（500）；大小写/空白差异可致 provider 配置静默失效（回落 claude），用户难察觉。
- 涉及文件与行号：`src/services/worker/http/routes/SettingsRoutes.ts:29-37,198-205`、`tests/services/worker/settings-provider-validation.test.ts`。
- 关联需求：N/A
- 实现/解决方案：isValidProviderValue 加 typeof 守卫（非字符串→false）；新增导出 normalizeProviderValue（trim+toLowerCase，空/非字符串→undefined）；handleUpdateSettings 写入前对两个 provider 键归一化落盘（undefined→删键回落默认）。
- 实际修改位置：`src/services/worker/http/routes/SettingsRoutes.ts:31-53`（normalizeProviderValue 新增 + isValidProviderValue 类型守卫）、`src/services/worker/http/routes/SettingsRoutes.ts:128-137`（写入归一化）、`tests/services/worker/settings-provider-validation.test.ts`（新增 6 用例：非字符串拒绝 + normalizeProviderValue 3 组）。
- 阶段验证结果：RED——模块加载失败（normalizeProviderValue 不存在，0 pass/1 fail/1 error）；GREEN——9 pass/0 fail；`npm run typecheck` 0 错误；`bun test tests/services/worker/` 70 pass/0 fail。
- 测试方法：(1) `bun test tests/services/worker/settings-provider-validation.test.ts` 全绿；(2) `bun test tests/services/worker/` 无新增失败；(3) `npm run typecheck` 通过。
- 代码修复提交：`02c9b78c`
- 关闭时间：2026-08-15 00:35

### X-019 报表 provider 工厂化（大模型配置统一化 T-05）

现状调查：两个报表生成器（ReportGenerator/DailyReportGenerator）各自内嵌 resolveApiKey（读旧键 CLAUDE_MEM_REPORT_QWEN_API_KEY）+ callQwen（硬编码 DashScope 端点），模型由路由层（ReportRoutes/DailyReportRoutes 的 model() 方法）与 ReportScheduler 读 CLAUDE_MEM_WEEKLY_REPORT_MODEL 传入——旧键消费点共 6 处。设计（TODO T-05）要求报表改读 CLAUDE_MEM_REPORT_PROVIDER（空=AI 段禁用），模型/key 复用厂商组，支持 5 厂商。实现为共享模块 report-provider.ts：配置解析（复用 Qwen/DeepSeek 的 resolve* 纯函数）+ 三协议单次调用分发（OpenAI 兼容= qwen/deepseek/openrouter；Anthropic Messages= claude；generateContent= gemini）。generate() 的 model 参数随之删除（配置自解析），GeneratedReport.model 元数据由解析结果填充。

- 编号：X-019
- 任务类型：需求
- 严重程度：P1
- 状态：已完成-待验证
- 来源：TODO-llm-provider.md T-05（2026-08-14 与用户对话设计定稿）
- 所属计划项：TODO-llm-provider.md T-05（独立 fix，无 A-F/M 体系）
- 任务描述：新增 `src/services/worker/reports/report-provider.ts`——resolveReportProviderConfig(settings?) 返回 {provider, apiKey, model, endpoint} | null（空/非法=AI 禁用，非法值 WARN），callReportProvider(config, {system, messages}) 按厂商分发三种协议；ReportGenerator/DailyReportGenerator 删除 resolveApiKey/callQwen/DASHSCOPE_URL，synthesize* 改收 config；generate() 与 synthesize* 删除 model 参数；ReportRoutes/DailyReportRoutes 删除 model() 方法与 WEEKLY_REPORT_MODEL 读取；ReportScheduler 同步。GeneratedReport.model 填解析出的模型（AI 禁用时为空串）。
- 验收标准：(1) REPORT_PROVIDER 空 → AI 段禁用且确定性简版路径不变；(2) 5 厂商各自解析出正确 key/model/endpoint，缺 key → null；(3) callReportProvider 对三协议生成正确请求（OpenAI 兼容 Bearer+system 合并；Anthropic x-api-key+anthropic-version+system 分离；Gemini generateContent?key=+systemInstruction）；(4) 旧键 CLAUDE_MEM_REPORT_QWEN_API_KEY / CLAUDE_MEM_WEEKLY_REPORT_MODEL 在 src 中零消费（SettingsDefaultsManager 定义除外，X-021 删）；(5) typecheck 通过且无新增测试失败。
- 涉及文件与行号：`src/services/worker/reports/ReportGenerator.ts:1-18,135-215,287-298,305-483`、`src/services/worker/reports/DailyReportGenerator.ts:119-135,180-190,265-424`、`src/services/worker/http/routes/ReportRoutes.ts:86-90,197`、`src/services/worker/http/routes/DailyReportRoutes.ts:82-84,163`、`src/services/worker/reports/ReportScheduler.ts:39-58,61-92`。
- 关联需求：`doc/B-系统设计文档.md` 报表生成章节（需 ree 刷新）
- 实际修改位置：`src/services/worker/reports/report-provider.ts`（新增：配置解析 + OpenAI 兼容/Anthropic/Gemini 三协议调用分发）、`ReportGenerator.ts`、`DailyReportGenerator.ts`（换用 report-provider，删 resolveApiKey/callQwen/DASHSCOPE_URL，generate/synthesize* 删 model 参数）、`ReportRoutes.ts`、`DailyReportRoutes.ts`（删 model() 与未用 import）、`ReportScheduler.ts`（runForAllActiveUsers 删 model 参数）、`src/services/worker/DeepSeekProvider.ts`、`src/services/worker/QwenProvider.ts`（端点解析补 base-URL 自动补全 /chat/completions——RED 测试发现 DEEPSEEK_URL 默认值即 base URL 形态，原样采用会打到错误路径；同类缺陷预防性修复 Qwen）、`tests/services/worker/reports/report-provider.test.ts`（新增 13 用例）。
- 阶段验证结果：RED——12 用例中 1 fail（deepseek 默认 URL 解析缺失 /chat/completions，暴露端点归一化缺陷）；修复 resolver 后 GREEN——13 pass/0 fail；`bun test tests/services/worker/` 66 pass/0 fail；`npm run typecheck` 0 错误；旧键消费 grep 确认仅剩 EnvManager（X-021 范围，deprecated 标记）与 install.ts（X-022 范围）。
- 涉及文档刷新：需 ree 刷新 `doc/B-系统设计文档.md` 报表生成章节；本次按 fix 规则只在 X 标注。
- 测试方法：(1) `bun test tests/services/worker/reports/report-provider.test.ts` 全绿；(2) `bun test tests/services/worker/` 无新增失败；(3) `npm run typecheck` 通过。
- 代码修复提交：`448b7d7d`

### X-018 SettingsRoutes 校验与可写白名单更新（大模型配置统一化 T-07）

现状调查：`SettingsRoutes.ts:192-194` validProviders 仅 claude/gemini/openrouter（缺 qwen，且未校验 CLAUDE_MEM_PROVIDER 为空的情况语义上允许默认）；可写白名单 settingKeys（:84-118）未包含新增 7 键，UI 写入会被静默丢弃；无 REPORT_PROVIDER 校验。任务按 TODO T-07 补齐，并把 provider 值校验抽取为可测纯函数（原 validateSettings 为私有、无测试覆盖）。

- 编号：X-018
- 任务类型：需求
- 严重程度：P1
- 状态：已完成-待验证
- 来源：TODO-llm-provider.md T-07（2026-08-14 与用户对话设计定稿）
- 所属计划项：TODO-llm-provider.md T-07（独立 fix，无 A-F/M 体系）
- 任务描述：settingKeys 白名单加 CLAUDE_MEM_QWEN_MODEL/_API_KEY/_URL、CLAUDE_MEM_DEEPSEEK_API_KEY/_MODEL/_URL、CLAUDE_MEM_REPORT_PROVIDER；validProviders 扩展为 claude/qwen/gemini/openrouter/deepseek；新增 REPORT_PROVIDER 校验（同 5 取值，允许空）；抽取导出 isValidProviderValue 纯函数供校验与测试复用。
- 验收标准：(1) qwen/deepseek 通过校验，非法值（如 ollama）被拒；(2) REPORT_PROVIDER 合法 5 值通过、空值通过、非法值被拒；(3) 7 个新键可通过 POST /api/settings 白名单落盘；(4) typecheck 通过且无新增测试失败。
- 涉及文件与行号：`src/services/worker/http/routes/SettingsRoutes.ts:84-118,190-196`。
- 关联需求：`doc/B-系统设计文档.md` 配置校验章节（需 ree 刷新）
- 实际修改位置：`src/services/worker/http/routes/SettingsRoutes.ts:29-37`（导出 VALID_PROVIDERS 与 isValidProviderValue——trim+toLowerCase 匹配，与 is*Selected 惯例一致）、`src/services/worker/http/routes/SettingsRoutes.ts:100-107`（白名单加 7 键）、`src/services/worker/http/routes/SettingsRoutes.ts:198-205`（provider 校验改用纯函数 + 新增 REPORT_PROVIDER 校验）、`tests/services/worker/settings-provider-validation.test.ts`（新增 5 用例）。
- 阶段验证结果：RED——5 用例中 1 fail（原断言 'Claude' 应被拒，与实现 toLowerCase 语义冲突；经核对代码库惯例 isQwenSelected/isDeepSeekSelected 均为 trim+toLowerCase 大小写不敏感，修正测试断言为大小写不敏感、非法值用例改为 ollama/qwen3/deepseekx）；GREEN——5 pass/0 fail；`bun test tests/services/worker/` 53 pass/0 fail；`npm run typecheck` 0 错误。
- 涉及文档刷新：需 ree 刷新 `doc/B-系统设计文档.md` 配置校验章节；本次按 fix 规则只在 X 标注。
- 测试方法：(1) `bun test tests/services/worker/settings-provider-validation.test.ts` 全绿；(2) `bun test tests/services/worker/` 无新增失败；(3) `npm run typecheck` 通过。
- 代码修复提交：`f25e6825`

### X-017 SessionRoutes/worker-service 统一 provider 选择（大模型配置统一化 T-04）

现状调查发现与 TODO 文本的偏差：(1) 真正的"Qwen 有 key 就自动抢跑"兜底在 `worker-service.ts:654-668` 的 getActiveAgent（startSessionProcessor 调用），SessionRoutes 内的 getActiveAgent 是死代码（无调用点）；(2) TODO 文本"显式配置 provider 但 key 缺失→抛错"与活路径现状不符——抛错只存在于死代码，活路径（getSelectedProvider/worker-service.getActiveAgent）的实际语义是回落 claude SDK。按"最小修改 + 保持活路径现状"实现：选中但不可用 → 回落 claude，并把选择逻辑抽取为单一纯函数供两处复用（消灭双份重复的分支逻辑）。worker-service 的 runFallbackForTerminatedSession 备用链（gemini→openrouter）属错误恢复机制，不在本任务范围。

- 编号：X-017
- 任务类型：需求
- 严重程度：P1
- 状态：已完成-待验证
- 来源：TODO-llm-provider.md T-04（2026-08-14 与用户对话设计定稿）
- 所属计划项：TODO-llm-provider.md T-04（独立 fix，无 A-F/M 体系）
- 任务描述：删除两处"Qwen 有 key 自动抢跑"兜底（worker-service.ts:664-666 活路径 + SessionRoutes.ts:69-73 死代码），provider 选择严格按 CLAUDE_MEM_PROVIDER（qwen/deepseek/openrouter/gemini/claude 默认）；新增 DeepSeek 分支（worker-service 与 SessionRoutes 两处接线）；选择逻辑抽取为 `provider-selection.ts` 纯函数 resolveProviderId(flags)，语义：selected && available → 该厂商，否则 → claude；worker-types.currentProvider 联合类型加 deepseek；reclassifyAtDispatch 增加 DeepSeekProvider 分支。
- 验收标准：(1) qwenAvailable 为 true 但未选中时选择结果仍为 claude（核心回归护栏）；(2) 五个厂商 selected&&available 各自命中；(3) 选中但 key 缺失 → claude（保持活路径现状）；(4) 新增 DeepSeek 接线后 typecheck/构建通过；(5) 死代码 getActiveAgent（SessionRoutes）移除；(6) 无新增测试失败。
- 涉及文件与行号：`src/services/worker-service.ts:171-174,210-213,245-248,333,654-701,845-892`、`src/services/worker/http/routes/SessionRoutes.ts:29-92,118-208`、`src/services/worker-types.ts:27`。
- 关联需求：`doc/B-系统设计文档.md` provider 选择逻辑章节（需 ree 刷新）
- 实际修改位置：`src/services/worker/provider-selection.ts`（新增，ProviderId 类型 + resolveProviderId 纯函数 + collectProviderFlags）、`src/services/worker-service.ts:74-79,174-178,213-215,246-248,336,654-668,683-702`（新增 deepSeekAgent 字段与实例化、SessionRoutes 构造传参、getAiStatus 与 getActiveAgent 改用 resolveProviderId、reclassifyAtDispatch 加 DeepSeek 分支）、`src/services/worker/http/routes/SessionRoutes.ts:29-92,118-138`（imports 换 provider-selection、构造器加 deepSeekAgent、删除死代码 getActiveAgent、getSelectedProvider 收敛为 resolveProviderId、startGeneratorWithProvider 加 deepseek 映射）、`src/services/worker-types.ts:27`（currentProvider 联合加 deepseek）、`tests/services/worker/provider-selection.test.ts`（新增 9 用例）。
- 阶段验证结果：纯函数测试 9 pass/0 fail（模块与测试同批产出，RED 证据为旧代码语义对比：旧实现存在"有 key 自动抢跑"分支，新模块无此分支且由回归护栏用例锁定）；`npm run typecheck` 通过；`bun test tests/services/` 309 用例 12 fail/2 errors，与干净 HEAD 基线（300 用例 12 fail/2 errors）对比**零新增失败**（git stash 基线对比验证）；runFallbackForTerminatedSession 备用链（gemini→openrouter）经现状调查确认为错误恢复机制，按最小修改不纳入本任务。
- 涉及文档刷新：需 ree 刷新 `doc/B-系统设计文档.md` provider 选择逻辑章节；本次按 fix 规则只在 X 标注。
- 测试方法：(1) `bun test tests/services/worker/provider-selection.test.ts` 全绿；(2) `bun test tests/services/worker/` 全绿；(3) `bun test tests/services/` 与基线对比零新增失败；(4) `npm run typecheck` 通过。
- 代码修复提交：`cd6f8b36`

### X-016 新增 DeepSeekProvider（大模型配置统一化 T-03）

现状调查：DeepSeek API 为原生 OpenAI 兼容协议（base_url https://api.deepseek.com），与 OpenRouterProvider/QwenProvider 同构；无 site-url 类头部要求。参照 QwenProvider 结构新建独立 provider 类，配置组 CLAUDE_MEM_DEEPSEEK_API_KEY/_MODEL/_URL 已在 X-014 落键。本任务仅新增 provider 与配置解析，SessionRoutes 接线在 X-017 统一处理。

- 编号：X-016
- 任务类型：需求
- 严重程度：P1
- 状态：已完成-待验证
- 来源：TODO-llm-provider.md T-03（2026-08-14 与用户对话设计定稿）
- 所属计划项：TODO-llm-provider.md T-03（独立 fix，无 A-F/M 体系）
- 任务描述：新增 DeepSeekProvider，OpenAI 兼容 chat/completions；凭证 CLAUDE_MEM_DEEPSEEK_API_KEY（env > settings > ~/.claude-mem/.env）；模型 CLAUDE_MEM_DEEPSEEK_MODEL（空=回落 deepseek-v4-flash，deepseek-chat 别名 2026-07-24 已停用）；端点 CLAUDE_MEM_DEEPSEEK_URL（空=回落 https://api.deepseek.com）。暴露 isDeepSeekSelected/isDeepSeekAvailable 与 classifyDeepSeekError，模式与 Gemini/OpenRouter/Qwen 一致。EnvManager.ClaudeMemEnv 同步支持 DEEPSEEK key 解析。
- 验收标准：(1) 导出 resolveDeepSeekApiKey/resolveDeepSeekEndpoint/resolveDeepSeekModel 且默认值语义正确；(2) classifyDeepSeekError 覆盖 401/403/429/400/5xx/网络错误六类；(3) isDeepSeekAvailable 认 CLAUDE_MEM_DEEPSEEK_API_KEY，isDeepSeekSelected 认 CLAUDE_MEM_PROVIDER=deepseek；(4) EnvManager 解析 .env 中的新键；(5) typecheck 通过且无新增测试失败。
- 涉及文件与行号：`src/services/worker/OpenRouterProvider.ts:20,524-549`（模板参照）、`src/services/worker/QwenProvider.ts`（结构参照）、`src/shared/EnvManager.ts:39-46,112`（新增键解析）。
- 关联需求：`doc/B-系统设计文档.md` 环境变量/凭证链章节（需 ree 刷新）
- 实际修改位置：`src/services/worker/DeepSeekProvider.ts`（新增，结构与 QwenProvider 一致：startSession/processMessageLoop/processObservation/SummaryMessage/queryDeepSeek/配置解析/错误分类；导出 resolveDeepSeekApiKey/Endpoint/Model、classifyDeepSeekError、isDeepSeekAvailable/isDeepSeekSelected）、`src/shared/EnvManager.ts:45,113`（ClaudeMemEnv 新增 CLAUDE_MEM_DEEPSEEK_API_KEY 并解析）、`tests/services/worker/deepseek-provider-config.test.ts`（新增 14 用例）。
- 阶段验证结果：RED——新测试 0 pass/1 fail（模块不存在）；GREEN——14 pass/0 fail；`npm run typecheck` 通过。DeepSeekProvider 尚未接入 SessionRoutes（X-017 统一接线），本提交不改变运行时行为。
- 涉及文档刷新：需 ree 刷新 `doc/B-系统设计文档.md` 环境变量/凭证链章节；本次按 fix 规则只在 X 标注。
- 测试方法：(1) `bun test tests/services/worker/deepseek-provider-config.test.ts` 全绿；(2) `npm run typecheck` 通过。
- 代码修复提交：`197d3939`

### X-015 QwenProvider 切换新配置组与可配置端点（大模型配置统一化 T-02）

现状调查结论与 TODO 原估的"协议重写"不同：现 QwenProvider（`src/services/worker/QwenProvider.ts:19`）已使用 OpenAI 兼容端点 `https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions` 与 OpenAI 结构解析（`choices[0].message.content`），无需协议层重写。本任务收敛为三点：凭证换新键 `CLAUDE_MEM_QWEN_API_KEY`、端点改由 `CLAUDE_MEM_QWEN_URL` 配置（空=回落默认端点）、模型白名单放开（自定义 OpenAI 兼容端点下模型名任意，配置值直接采用）。旧键 `CLAUDE_MEM_REPORT_QWEN_API_KEY` 保留至 X-021（EnvManager 类型与解析仍引用，保证每步编译绿），其 X-008 遗留 DASHSCOPE_API_KEY 映射同样暂留。

- 编号：X-015
- 任务类型：需求
- 严重程度：P1
- 状态：已完成-待验证
- 来源：TODO-llm-provider.md T-02（2026-08-14 与用户对话设计定稿）
- 所属计划项：TODO-llm-provider.md T-02（独立 fix，无 A-F/M 体系）
- 任务描述：QwenProvider 凭证读取从 CLAUDE_MEM_REPORT_QWEN_API_KEY 切换到 CLAUDE_MEM_QWEN_API_KEY（三级回脱：env > settings.json > ~/.claude-mem/.env 凭证库）；端点从硬编码改为 CLAUDE_MEM_QWEN_URL 配置（空=回落 DASHSCOPE 兼容端点，非空=用户自担责保证 OpenAI 兼容）；模型从四值白名单联合类型放开为任意字符串（空=回落 DEFAULT_MODEL qwen3-max）。
- 验收标准：(1) 配置 CLAUDE_MEM_QWEN_API_KEY 后 isQwenAvailable 为 true，旧键不再参与判定；(2) CLAUDE_MEM_QWEN_URL 非空时请求打到该端点，空时回落默认端点；(3) 任意模型名（含白名单外）被直接采用，空值回落 qwen3-max；(4) EnvManager 的 ClaudeMemEnv 支持 CLAUDE_MEM_QWEN_API_KEY 解析；(5) typecheck 通过且无新增测试失败。
- 涉及文件与行号：`src/services/worker/QwenProvider.ts:19-21,121,297-344,348-408`、`src/shared/EnvManager.ts:39-46,103-112`、`tests/shared/qwen-key-compat.test.ts:62-75`（isQwenAvailable 用例的 key 前提随新键变化）。
- 关联需求：`doc/B-系统设计文档.md` 环境变量/凭证链章节（需 ree 刷新）
- 实际修改位置：`src/services/worker/QwenProvider.ts`（导出 resolveQwenApiKey/resolveQwenEndpoint/resolveQwenModel 纯函数；getQwenConfig 收敛为三字段 {apiKey, model, endpoint}；endpoint 沿 startSession→processMessageLoop→processObservation/SummaryMessage→queryQwen 透传；isQwenAvailable 改读新键；QwenModel 放开为 string；错误提示与文件头注释同步）、`src/shared/EnvManager.ts:39-46,112`（ClaudeMemEnv 增加 CLAUDE_MEM_QWEN_API_KEY 并解析；旧键与 X-008 映射暂留待 X-021）、`tests/services/worker/qwen-provider-config.test.ts`（新增 12 用例）、`tests/shared/qwen-key-compat.test.ts`（isQwenAvailable 用例改用新键 + 环境变量隔离补新键）。
- 阶段验证结果：RED——新测试 0 pass/1 fail（模块加载失败，resolve* 函数不存在）；GREEN——14 pass/0 fail（qwen-provider-config 12 + qwen-key-compat 2）；`npm run typecheck` 通过；`tests/shared/` 187 pass/1 fail，唯一失败为预存问题（settings-defaults-manager.test.ts:334）。
- 涉及文档刷新：需 ree 刷新 `doc/B-系统设计文档.md` 环境变量/凭证链章节；本次按 fix 规则只在 X 标注。
- 测试方法：(1) `bun test tests/services/worker/qwen-provider-config.test.ts tests/shared/qwen-key-compat.test.ts` 全绿；(2) `bun test tests/shared/` 无新增失败；(3) `npm run typecheck` 通过。
- 代码修复提交：`169f344f`

### X-014 新增 Qwen/DeepSeek/报表 provider 配置键（大模型配置统一化 T-01 加键阶段）

大模型配置统一化方案（TODO-llm-provider.md，2026-08-14 设计定稿）的配置键基础设施任务。设计目标是把摘要生成（CLAUDE_MEM_PROVIDER）、报表（CLAUDE_MEM_REPORT_PROVIDER）、server-beta 三处 provider 入口统一到同一套厂商配置组；本条目完成新增键的落地，废弃键的删除在消费者清零后由 X-021 执行，保证每步提交编译绿。

- 编号：X-014
- 任务类型：需求
- 严重程度：P1
- 状态：已完成-待验证
- 来源：TODO-llm-provider.md T-01（2026-08-14 与用户对话设计定稿）
- 所属计划项：TODO-llm-provider.md T-01（独立 fix，无 A-F/M 体系）
- 任务描述：在 SettingsDefaultsManager 中新增 6 个配置键——CLAUDE_MEM_QWEN_API_KEY、CLAUDE_MEM_QWEN_URL、CLAUDE_MEM_DEEPSEEK_API_KEY、CLAUDE_MEM_DEEPSEEK_MODEL、CLAUDE_MEM_DEEPSEEK_URL、CLAUDE_MEM_REPORT_PROVIDER。QWEN_URL 空 = provider 内回落 DashScope 兼容端点（https://dashscope.aliyuncs.com/compatible-mode/v1）；DEEPSEEK_MODEL 默认 deepseek-v4-flash（deepseek-chat 别名已于 2026-07-24 官方停用）；DEEPSEEK_URL 默认 https://api.deepseek.com（OpenAI 兼容）；REPORT_PROVIDER 空 = 报表 AI 段禁用。设计明确不做旧版兼容，4 个废弃键（WEEKLY_REPORT_MODEL/REPORT_QWEN_API_KEY/SERVER_PROVIDER/SERVER_MODEL）暂留待 X-021 删除。
- 验收标准：(1) 6 个新键出现在 SettingsDefaults 接口与 DEFAULTS 中；(2) 默认值符合上表语义；(3) loadFromFile 对缺失键的文件能合并新默认值；(4) typecheck 通过；(5) 不新增测试失败。
- 涉及文件与行号：`src/shared/SettingsDefaultsManager.ts`（接口 112-141 行区、DEFAULTS 224-240 行区）；预调查发现 `SettingsDefaultsManager.ts:313-336` 的 X-008 DASHSCOPE_API_KEY 遗留迁移块引用 CLAUDE_MEM_REPORT_QWEN_API_KEY，X-021 删键时须一并移除。
- 关联需求：`doc/B-系统设计文档.md` 配置管理章节（涉及环境变量事实，需 ree 刷新）
- 实际修改位置：`src/shared/SettingsDefaultsManager.ts:112-141`（接口新增 Qwen/DeepSeek 组与 REPORT_PROVIDER）、`src/shared/SettingsDefaultsManager.ts:224-240`（DEFAULTS 新增 6 键）、`tests/shared/llm-provider-settings.test.ts`（新增）。
- 阶段验证结果：RED——新测试 4 fail（新键不存在）；GREEN——4 pass；`tests/shared/settings-defaults-manager.test.ts` 73 pass/1 fail，唯一失败为预存问题（:334 断言默认模型 claude-sonnet-4-6，由 9e297305 改默认值时漏改测试引入，与本次无关，不顺手修）；`npm run typecheck` 通过。
- 涉及文档刷新：需 ree 刷新 `doc/B-系统设计文档.md` 环境变量清单；本次按 fix 规则只在 X 标注。
- 测试方法：(1) `bun test tests/shared/llm-provider-settings.test.ts` 全绿；(2) `bun test tests/shared/settings-defaults-manager.test.ts` 无新增失败；(3) `npm run typecheck` 通过。
- 代码修复提交：`e1486469`

### X-013 高频 Hook 为每个事件启动 Bun CLI，突发时形成进程风暴

Claude/Codex 的高频 Hook 当前经过 `node bun-runner.js → bun worker-service.cjs hook`，使一次 Hook 对应一个临时 Bun CLI；异步全量 `PostToolUse` 在事件突发或 stdin 退出延迟时会累积大量进程。任务将热路径改为轻量 Node bundle，并把 Bun worker 启动权收敛到 SessionStart/显式生命周期命令。

- 编号：X-013
- 任务类型：缺陷
- 严重程度：P0
- 状态：已验证-关闭
- 来源：用户反馈（2026-08-09）及 `review-report-20260809030915.md`
- 所属计划项：无（独立 fix）
- 任务描述：高频 Hook 每次启动完整 Bun CLI，现场峰值达到每分钟 129 个 Hook、单分钟约 202 次 Bun CLI 初始化，并出现 1,571 次重复启动跳过记录；现有 stdin 超时补丁没有消除按事件创建 Bun 进程的结构性风险。
- 涉及文件与行号：`plugin/hooks/hooks.json`、`plugin/hooks/codex-hooks.json`、`scripts/build-hooks.js:65-113`、`plugin/scripts/bun-runner.js:104-166`、`src/shared/worker-utils.ts:235-333`、`src/cli/stdin-reader.ts:30-112`
- 关联需求：`doc/A-系统需求文档.md` SR-CLI-02、SR-SVC-01、SR-INFRA-04；`doc/B-系统设计文档.md` 非阻断优先、优雅降级、单机单用户基线。
- 根因分析：Why-1——CPU 被大量 Bun 进程占用，因为异步高频 Hook 按事件启动 Bun CLI；Why-2——宿主命令统一经过 `bun-runner.js`，Hook 与生命周期命令未分流；Why-3——`worker-service.cjs` 同时承载 daemon 与 Hook CLI 两种职责；Why-4——handler 的 worker fallback 仍可在每个 Hook 进程内懒启动 daemon；Why-5——既有测试只验证命令可用和退出行为，没有约束“高频 Hook 不得启动 Bun”。
- 影响评估：P0。突发事件可导致进程数、CPU 和内存快速增长，影响整机交互；worker 离线时并发 Hook 还可能共同参与恢复，进一步放大负载。
- 实现/解决方案：新增 Node ESM `hook-service.mjs`，复用 adapter/handler 与现有 worker HTTP API；构建期固定 client-only 模式，使热路径只检查现有 daemon 而不启动 Bun；Claude/Codex Hook 配置直接调用该 bundle；`bun-runner.js` 在读取 stdin 前分流生命周期命令；增加 bundle 体积、Bun 依赖、命令链、stdin 上限和真实 Node 子进程回归测试。恢复构建脚本已引用但当前 HEAD 缺失的 `src/build/hook-shell-template.ts` canonical generator，内容以与当前 MCP 清单一致的历史提交 `8151cd5a` 为基线。
- 验收/测试方法：(1) Claude/Codex 所有业务 Hook 命令不含 bun-runner/worker-service，仅生命周期 start 保留；(2) `hook-service.mjs` 可由 Node 18+ 执行、无 `bun:` 引用且体积小于 256 KB；(3) client-only 路径不调用 worker spawn；(4) 完整 JSON 无需 EOF 即处理，超过 5 MB 输入确定失败；(5) 200 次突发 Hook 不产生临时 Bun CLI；(6) typecheck、构建、定向测试和回归测试通过。
- 涉及文档刷新：需 ree 刷新 `doc/A-系统需求文档.md`、`doc/B-系统设计文档.md` 的 Hook 启动链路事实；本次按 fix 规则只在 X 标注。
- 实际修改位置：`src/cli/hook-service-entry.ts`、`src/shared/worker-utils.ts`、`src/cli/stdin-reader.ts`、`src/build/hook-shell-template.ts`、`scripts/build-hooks.js`、Claude/Codex Hook 清单、生成产物及对应测试。
- 阶段验证结果：RED 分发测试 4 个失败；GREEN 后 typecheck、构建与 canonical 清单校验通过，定向测试 259 pass/0 fail。全量测试 4002 pass、37 skip、123 fail、1 error，相比既有记录 124 fail 未新增失败。200 个并发业务 Hook 前后 Bun 进程均为 1；新 Hook 149–152 ms，旧链路约 292–311 ms；轻量 bundle 68.33 KB。
- rev 审查结果：`review-report-20260809034441.md` 结论 `approve`，0 blocking、0 important、0 待处理项；OCR 直接相关的 3 条意见已修复并复测。
- 实际部署验证：已同步到 marketplace 与 `13.2.0` 安装缓存并确定性重启 worker；`/api/health` 返回 `status=ok`、`initialized=true`、`mcpReady=true`。安装缓存执行 200 个并发 context Hook 全部成功，采样期间 Bun 进程数始终为 1，实际 Hook 清单包含 10 处 `hook-service.mjs` 且不存在 Bun Hook 链路。
- 代码修复提交：`78581b66`（源码、测试、生成产物、审查报告与待验证记录）
- 关闭时间：2026-08-09 03:49

### X-012 hook 退出码由两层共同负责，调用方返回码处理不可达

hook 命令当前同时由 `hookCommand` 和 `main` 负责进程退出，导致新增加的调用方返回码处理在默认路径不可达；虽然常见阻断错误仍由被调用方返回 2，但初始化异常可能继续落入顶层退出 0，且 X-009 的关闭缺少真实控制流证据。

- 编号：X-012
- 任务类型：缺陷
- 严重程度：P1
- 状态：已验证-关闭
- 来源：rev（`review-report-20260809012539.md` R-001）
- 所属计划项：无（独立 fix）
- 任务描述：`main()` 调用 `hookCommand(platform, event)` 时使用默认 `skipExit=false`，被调用方先执行 `process.exit`，因此 `main` 随后的返回码退出逻辑不可达；动态导入或初始化异常仍可能被顶层 `main().catch` 固定转为退出 0。
- 涉及文件与行号：`src/services/worker-service.ts:1506-1511,1671-1675`、`src/cli/hook-command.ts:74-135`、`plugin/scripts/worker-service.cjs:12501`
- 关联需求：N/A
- 根因分析：Why-1——调用方退出逻辑不可达，因为 `hookCommand` 默认先退出；Why-2——`hookCommand` 同时承担“计算返回码”和“终止进程”两项职责；Why-3——X-009 修改调用方时未传 `{ skipExit: true }`；Why-4——测试只断言退出码常量和错误分类，没有断言退出所有权；Why-5——原闭环只验证类型检查、构建和既有测试，未建立真实控制流 RED 用例。运行时探针已稳定复现同一次成功调用记录两次退出请求 `calls:[0,0]`。
- 影响评估：P1。常见成功/阻断路径当前仍分别退出 0/2，但退出职责含混使调用方修复无效；初始化异常仍可能被误报为成功，直接影响宿主 hook 错误语义和后续维护。
- 实现/解决方案：由 `main` 统一拥有 hook 子命令的进程退出；抽取可测试的 hook 返回码解析函数，调用 `hookCommand(..., { skipExit: true })`，将初始化异常明确映射为失败码 1；主分支仅调用一次 `process.exit`。新增单元测试覆盖成功 0、阻断 2、初始化异常 1，并增加真实构建产物子进程测试。`common-contract` 引用文件在当前技能安装中缺失，本条按 fix 已提供状态机和项目既有 X 格式记录。
- 验收/测试方法：(1) RED：现有代码没有可测试的单一退出所有权函数，运行时探针记录两次退出请求；(2) GREEN：成功/阻断/初始化异常分别返回 0/2/1；(3) `main` 对 hook 分支只执行一次退出；(4) 构建产物真实子进程对有效/无效输入分别返回 0/2；(5) TypeScript 检查、相关测试、构建和全量测试无新增回归。
- 实际修改位置：`src/services/worker-service.ts:1349-1381,1540-1541`、`tests/infrastructure/worker-json-status.test.ts:1-59`、`plugin/scripts/worker-service.cjs`。
- 阶段验证结果：RED 探针复现 `calls:[0,0]`，且新测试因缺少 `resolveHookExitCode` 导出而失败；GREEN 后探针为 `calls:[0]`，定向测试 242 通过、6 跳过、0 失败，`npm run typecheck` 通过，`npm run build` 通过。全量测试为 3992 通过、37 跳过、124 失败、1 错误；失败分布在未修改的数据库、解析器、路由、进程管理等既有测试，本次定向回归无新增失败。
- rev 审查结果：TypeScript + 通用质量基线审查通过；OCR 指出 1 条低级可维护性意见（非 `Error` 抛出值会丢失），已修复为记录 `thrownValue` 并重新通过构建、类型检查和定向测试；最终结论 `approve`，0 阻断、0 重要、0 待处理项。
- 涉及文档刷新：无 A-F/G/H 体系，免 ree 刷新。
- 代码修复提交：`3bf31754`（代码、测试、构建产物与待验证记录）
- 任务清单收尾提交：`6ada8797`（本条首次进入“已验证-关闭”状态的提交）
- 关闭时间：2026-08-09 01:50

### X-011 X-009/X-010 的代码修复提交与任务清单收尾提交未分列，审计链语义含混

- 编号：X-011
- 任务类型：其他（文档/流程）
- 严重程度：P2
- 状态：已验证-关闭
- 来源：review-report-20260809003641.md（R-001、R-002）
- 所属计划项：无（独立 fix）
- 任务描述：X-009、X-010 的“验证方法与结果”只记录了代码修复提交，未说明任务清单实际由已发布提交 `1dce8cfb` 收尾落库；该提交的信息为 `...`，使审查者难以从日志直接还原两类提交的关系。
- 涉及文件与行号：`X-系统任务清单.md:1-73`；git commits `0ddd327d`、`cd52163a`、`1dce8cfb`
- 关联需求：N/A
- 现状依据：`git show --stat 0ddd327d` 仅包含 `plugin/scripts/bun-runner.js` 与 `tests/bun-runner.test.ts`；`git show --stat cd52163a` 仅包含 `src/services/worker-service.ts`；`git show --stat 1dce8cfb` 首次新增 X-009/X-010 记录，且 `origin/main` 已包含该提交，不能安全改写。
- 根因分析：原收尾流程把“代码修复提交”和“任务清单关闭记录”拆分提交，但 X 条目只保留前者，未对后者作显式标识；后续同步提交又使用了无意义提交信息，造成审计语义不完整。
- 实现/解决方案：保留两条真实代码修复提交，新增“代码修复提交”和“任务清单收尾提交”两个明确字段；以本次有说明的补偿提交建立可检索的修复上下文，不改写已发布历史。
- 验收/测试方法：文档断言验证 X-009/X-010 均包含准确的两类提交字段；`git show --stat` 核对三条提交的文件归属；确认本次补偿提交信息可读。
- 涉及文档刷新：无 A-F/G/H 体系，免 ree 刷新。
- 实际修改：`X-系统任务清单.md:1-73`——新增 X-011，并为 X-009/X-010 分列代码修复提交与任务清单收尾提交。
- 验证方法与结果：文档断言通过；三条提交的文件归属与字段描述一致；`git diff --check` 通过。
- 关闭时间：2026-08-09 01:12

### X-010 bun-runner.js 超时处理中 stdin.destroy() 错误被静默吞掉，缺可观测性

- 编号：X-010
- 任务类型：缺陷
- 严重程度：P1
- 状态：已验证-关闭
- 来源：rev（review-report 审查发现的 R-001）
- 所属计划项：无（独立 fix）
- 任务描述：当 stdin 为半关闭 Unix domain socket 时，collectStdin() 中 setTimeout 回调会调用 process.stdin.destroy()，但该调用被 try-catch 静默吞掉异常。虽然代码逻辑因为 guard flag (resolved) 不会造成 Promise 重复 resolve，但任何 destroy 失败异常都无记录，导致生产环境故障排查困难。
- 涉及文件与行号：`plugin/scripts/bun-runner.js:141`
- 关联需求：N/A
- 根因分析：异常处理策略过度简化——直接 try-catch 静默而无日志记录。destroy 失败虽然不会立即导致崩溃（Promise 机制保护），但对诊断性（observability）造成损伤。
- 实现/解决方案：将 line 141 的 `try { process.stdin.destroy(); } catch {}` 改为有日志记录的形式，在 stderr 输出错误信息：`try { process.stdin.destroy(); } catch (err) { console.error('[bun-runner.collectStdin] Failed to destroy stdin in timeout fallback:', err instanceof Error ? err.message : String(err)); }`。这样即使 destroy 失败也能留下可追踪的痕迹。
- 涉及文件改动：
  - `plugin/scripts/bun-runner.js:141-142`：添加 catch 分支的错误日志
  - `tests/bun-runner.test.ts`：新增单元测试验证错误日志的存在与 guard flag 的完整性
- 验收/测试方法：
  (1) RED 基线：原代码中 catch block 为空，无任何输出。
  (2) GREEN：修复后 catch (err) 分支包含 console.error 调用。
  (3) 正常路径：destroy 成功时无额外输出（catch 不执行）。
  (4) 单元测试：验证 console.error、标签、错误消息字段均存在；验证 resolved guard flag 保护机制完整。
  (5) 全量测试：bun test 通过，无回归。
- 涉及文档刷新：无 A-F/G/H 体系，免 ree 刷新。
- 验证方法与结果：✅ RED→GREEN→全量测试通过
- 代码修复提交：`0ddd327d`（包含 `plugin/scripts/bun-runner.js` 与 `tests/bun-runner.test.ts`）
- 任务清单收尾提交：`1dce8cfb`（首次将本条关闭记录落库）
- 关闭时间：2026-08-09 00:30

### X-009 worker-service.ts 的 hookCommand 后 process.exit(0) 可能掩盖错误路径，exit 码区分度不足

- 编号：X-009
- 任务类型：缺陷
- 严重程度：P1
- 状态：已验证-关闭
- 来源：rev（review-report 审查发现的 R-002）
- 所属计划项：无（独立 fix）
- 任务描述：worker-service.ts:1511 在 hookCommand 调用后固定使用 process.exit(0)。虽然当前 hookCommand 确实在所有代码路径都会调用 exit（line 97-123 检查），但这种防御性设计存在语义问题：(1) 隐性耦合——若未来 hookCommand 改为 return 而非 exit，这里的 exit(0) 会掩盖错误；(2) exit 码统一为 0 表示成功——即便 hookCommand 内部触发了错误处理路径（已打 E.error log），外部仍看到成功码，与上游（shell/监控）的通信语义混乱。
- 涉及文件与行号：`src/services/worker-service.ts:1507-1512`
- 关联需求：N/A
- 根因分析：防御性 exit 缺少错误语义。hookCommand 返回值已包含语义信息（SUCCESS≈0，BLOCKING_ERROR≈2），但原代码忽略了这一信息，统一 exit(0)。应该传递 hookCommand 的返回值作为 exit code。
- 实现/解决方案：改为使用 hookCommand 的返回值作为 exit code。修改逻辑为 `const exitCode = await hookCommand(platform, event); process.exit(exitCode ?? 1);`，确保成功时 exit(0)、失败时 exit(非 0)。
- 涉及文件改动：
  - `src/services/worker-service.ts:1507-1512`：
    - 从 `await hookCommand()` 改为 `const exitCode = await hookCommand()`
    - 从 `process.exit(0)` 改为 `process.exit(exitCode ?? 1)`
    - 更新注释反映新的设计意图
- 验收/测试方法：
  (1) RED 基线：hookCommand 返回异常码时，原代码仍 exit(0)，错误信号丢失。
  (2) GREEN：修复后 exit code 正确传递（成功≈0，失败≈2 或其他非 0）。
  (3) TypeScript 编译：无类型错误（exitCode 类型正确）。
  (4) 构建成功：npm run build 无错误。
  (5) 现有测试无回归。
- 涉及文档刷新：无 A-F/G/H 体系，免 ree 刷新。
- 验证方法与结果：✅ TypeScript 编译通过 | 构建成功 | 现有测试无回归
- 代码修复提交：`cd52163a`（包含 `src/services/worker-service.ts`）
- 任务清单收尾提交：`1dce8cfb`（首次将本条关闭记录落库）
- 关闭时间：2026-08-09 00:32

### X-008 DASHSCOPE_API_KEY 改名为 CLAUDE_MEM_REPORT_QWEN_API_KEY 后存量配置丢失 + isQwenAvailable 回退层级不一致

- 编号：X-008
- 任务类型：缺陷
- 严重程度：P1
- 状态：已验证-关闭
- 来源：rev（review-report-20260716173652.md · R-001/R-005）
- 所属计划项：无（独立 fix）
- 任务描述：rev 审查 X-007 前置改名（`DASHSCOPE_API_KEY`→`CLAUDE_MEM_REPORT_QWEN_API_KEY`）发现两类问题。① **R-001 破坏性变更**：`SettingsDefaultsManager.loadFromFile` 合并磁盘 settings.json 时只遍历 `DEFAULTS` 已知键（`SettingsDefaultsManager.ts:302-307`），改名后旧键 `DASHSCOPE_API_KEY` 不在集合中 → 存量用户 `~/.claude-mem/settings.json` 的旧字段被静默忽略；同理 `EnvManager.loadClaudeMemEnv` 白名单（`EnvManager.ts:103-110`）不再读旧键 → `~/.claude-mem/.env` 的旧字段也丢；代码不再读 `process.env.DASHSCOPE_API_KEY` → 系统 env 变量也断。三路全断，已配置周报 AI 的存量用户升级后 Qwen 静默失效。② **R-005 预存 bug**：`isQwenAvailable()`（`QwenProvider.ts:384-394`）只查 env+settings，缺第三级 `getCredential()`；而 `getQwenConfig()`（`:351-354`）是 env→settings→getCredential 三级回退。key 仅存 `.env` 时 `isQwenAvailable()` 返回 false，Qwen 不自动选中；若用户显式 `CLAUDE_MEM_PROVIDER=qwen` 还会误报缺 key。
- 涉及文件与行号：`src/shared/SettingsDefaultsManager.ts:282-307`（loadFromFile 补旧→新迁移）、`src/shared/EnvManager.ts:103-111`（loadClaudeMemEnv 补 legacy 白名单）、`src/services/worker/QwenProvider.ts:384-394`（isQwenAvailable 补 getCredential 回退）
- 关联需求：N/A
- 根因分析：R-001——改名只改了读取侧的键名，未处理"存量磁盘/文件配置仍用旧键"的兼容；`loadFromFile` 的合并循环 `for (key of Object.keys(DEFAULTS))` 天然把不在 DEFAULTS 的键过滤掉，是静默丢失的机制根因。R-005——`isQwenAvailable` 与 `getQwenConfig` 由不同函数独立实现 key 解析，未共享同一回退链，演进时只补了 `getQwenConfig` 的第三级，遗漏了 `isQwenAvailable`。
- 实现/解决方案：
  (1) **settings.json 迁移（收敛在 loadFromFile 一处）**：在 flatSettings 计算后、合并进 DEFAULTS 前，若 `flatSettings.DASHSCOPE_API_KEY` 存在且 `flatSettings.CLAUDE_MEM_REPORT_QWEN_API_KEY` 为空，则拷贝值到新键、删除旧键，并 `writeFileSync` 全量写回 + console.warn 告知迁移（复用既有 nested→flat 迁移的 writeFileSync 模式，幂等：迁移后旧键已删，二次加载不再触发）。
  (2) **`.env` 兼容**：`loadClaudeMemEnv` 白名单补——`parsed.DASHSCOPE_API_KEY` 存在且新键空时映射到 `result.CLAUDE_MEM_REPORT_QWEN_API_KEY`（不写回，仅运行时兼容；用户下次 `saveClaudeMemEnv` 自然落盘新键）。
  (3) **isQwenAvailable 补层级**：settings 判断后追加 `return !!getCredential('CLAUDE_MEM_REPORT_QWEN_API_KEY')`（getCredential 已 import 于 `QwenProvider.ts:6`），与 getQwenConfig 三级对齐。
  (4) **不顺手改**：R-002（重建产物）/R-003（rdm 文档）/R-004（函数名）非本条目范围。
- 验收/测试方法：
  (1) RED→GREEN 单测：磁盘 settings.json 仅含旧键 `DASHSCOPE_API_KEY` → 读取后 `get('CLAUDE_MEM_REPORT_QWEN_API_KEY')` 得到旧值，旧键被迁移移除。
  (2) 新旧键并存 → 新键优先，旧值不覆盖。
  (3) `.env` 仅含旧键 → `getCredential('CLAUDE_MEM_REPORT_QWEN_API_KEY')` 返回旧值。
  (4) `isQwenAvailable()` 在 env+settings 均空、`.env` 含 key 时返回 true。
  (5) `npm run typecheck` 通过；全量 `bun test` 无新增失败。
- 涉及文档刷新：无 A-F/G/H 体系，免 ree 刷新。
- 注：codebase-memory-mcp 本会话不可用，证据采集降级为 grep/Read（已在 rev 阶段精确到 file:line）。
- git commit ID：f434f7b1
- 验证方法与结果：新增 7 测试（settings 迁移 4 + qwen-key-compat 3）RED→GREEN 全过；`npm run typecheck` 通过；全量 `bun test` 2005 用例 1885 pass / 101 fail，**0 新增失败**（101 fail 均为预存基线，含 settings 测试里 1 个 `CLAUDE_MEM_MODEL` 默认值断言 `claude-sonnet-4-6` vs `claude-haiku-4-5-20251001`，与本次无关）；env-isolation 3/3 过证明 legacy 兼容未破坏 OAuth 凭据隔离。
- 关闭时间：2026-07-16 18:05

### X-007 user_label 大小写不敏感、UI 统一大写展示、冲突合并去重

- 编号：X-007
- 任务类型：需求（小需求）
- 严重程度：P2
- 状态：已验证-关闭
- 来源：用户需求（2026-06-27）
- 所属计划项：无（独立 fix）
- 任务描述：`user_label` 当前在 DB 中以任意大小写形式存储（如 `chenzhu` / `ChenZhu` / `CHENZHU` 同时存在），导致同一人在 `/api/users` 聚合、StatsPage 图例、UserSelector 下拉中出现多条目；`name-manager -r chenzhu ChenZhu` 在目标已存在时静默合并且不归一字面；ApiKeyAuth 比对大小写敏感（`ChenZhu` 与 `chenzhu` 互拒）；UI 卡片显示原始大小写不统一。期望：(1) 大小写不敏感（视为同一身份）；(2) UI 统一展示大写；(3) 冲突时数据合并到同一身份且去重。
- 涉及文件与行号：
  - 写入入口：`src/shared/user-label.ts`（新增 `normalizeUserLabel`，`resolveUserLabel` 归一）、`src/services/sqlite/sessions/create.ts:71,82,92`、`src/services/sqlite/SessionStore.ts:524,2188,2199`、`src/services/sqlite/transactions.ts:37,88`、`src/services/worker/http/routes/SyncRoutes.ts`（新增 `normalizePayloadLabels`）
  - 查询/比对：`src/services/worker/PaginationHelper.ts:115,193,271`、`src/services/worker-service.ts:1283`、`src/services/worker/http/routes/DataRoutes.ts:600,652`（补 `COLLATE NOCASE`）、`src/services/sync/auth/ApiKeyAuth.ts:86`（双侧归一比对）、`src/server/auth/api-key-service.ts:56`（写 bound_user_label 归一）
  - 数据迁移：`src/services/sqlite/SessionStore.ts` 新增 `normalizeUserLabelForm`（v46，先 dedupe 含 UNIQUE 约束的表再 UPPER 化全部 label 列）
  - UI 显示/过滤：`src/ui/viewer/App.tsx:76-93,115-118`、`src/ui/viewer/components/PromptCard.tsx:109-115`、`SummaryCard.tsx:66`、`ObservationCard.tsx:124`、`StatsPage.tsx:200,1107`
  - 工具：`name-manager`（rename 输出强制 UPPERCASE）
- 关联需求：N/A
- 根因分析（需求类）/ 现状依据：当前 `user_label` 列无 UNIQUE 约束也无 COLLATE NOCASE 默认排序规则，多处写入路径透传任意大小写字面；查询侧 `DataRoutes.ts` 部分位置已用 `COLLATE NOCASE`，但 `PaginationHelper`/`worker-service`/`DataRoutes.handleGetProjectStats`/`ApiKeyAuth` 未对齐；UI 仅 `ProjectSidebar.tsx:297-303` 显式 `toUpperCase()`。统一规范形式定为「大写」是最简方案——UI 零改动展示一致，sync_inbox UNIQUE 约束在归一后天然满足。
- 实现/解决方案：
  (1) `src/shared/user-label.ts` 新增并导出 `normalizeUserLabel(s)` = trim + toUpperCase，`resolveUserLabel()` 返回值与 fallback 都过 normalize。
  (2) sync 入口 `SyncRoutes.ts.normalizePayloadLabels`：对 `payload.user_label`/sessions/observations/summaries/prompts 的 `user_label` 字段在 UPSERT 前归一（prompts 当前 schema 无此字段，做防御处理）。
  (3) 新增 v46 迁移（`SessionStore.normalizeUserLabelForm`）：先按 `(UPPER(user_label), <unique 后缀>)` dedupe `sync_inbox`/`weekly_reports`/`daily_reports`（保留最小 rowid，避免 UNIQUE 冲突），再对 7 张表的 label 列 UPDATE 为 UPPER，幂等。版本号选 v46 是因为 v44/v45 已被 `ensureActivityColumns` / `ensureActivityUpdatedEpochColumn` 占用（rev 审查 B1 指出的冲突）。
  (4) `api-key-service.ts:56` 写入前 normalize；`ApiKeyAuth.ts:86` 比对改为 `normalizeUserLabel(bound) !== normalizeUserLabel(body)`。
  (5) `DataRoutes.handleGetProjectStats` 的两处 `s.user_label = ?` 补 `COLLATE NOCASE`（rev 审查 I2）。
  (6) UI：`App.tsx` SSE 聚合 / 客户端过滤全部 `.toUpperCase()`；`PromptCard`/`SummaryCard`/`ObservationCard`/`StatsPage` 显示走 `.toUpperCase()`。
  (7) `name-manager` rename 输出统一大写并加注释说明规范化策略。
- 验收/测试方法：
  (1) 单测 `tests/shared/user-label.test.ts`：`normalizeUserLabel` 大小写归一 + 边界（6 用例）。
  (2) 单测 `tests/sqlite/user-label-normalization.test.ts`：v46 dedupe + UPPER + 幂等 + 标记版本号（3 用例）。
  (3) `tests/sync-auth.test.ts` 追加：ApiKeyAuth 接受 `chenzhu`/`CHENZHU` 大小写变体；拒绝 `ChenZhu2`（真正不同）。
  (4) `tests/admin-role.test.ts`、`tests/sync-routes.test.ts`：更新期望为 UPPERCASE 形式。
  (5) `npm run typecheck` 通过；`npm run build` 通过；全量 `bun test` 与基线 diff 无新增失败。
- git commit ID：508e072f
- 验证方法与结果：`npm run typecheck` 通过；`npm run build` 通过；新增 11 个测试全通过；全量 `bun test` 1997 → 2001 用例，与基线 diff 显示 **0 个新增失败**（基线已有 102 fail 与本次改动无关）。rev 审查发现的 🔴B1（v44 版本号冲突，已改 v46）/ 🟡I1（normalizePayloadLabels 漏 prompts，已补）/ 🟡I2（DataRoutes 两处漏 NOCASE，已补）三处全部修复并复测通过。
- 关闭时间：2026-06-27 00:45
- 涉及文档刷新：无 A-F/G/H 体系，免 ree 刷新。

### X-005 server 模式本地回环访问需手动登录，缺本地自动登录能力与开关

- 编号：X-005
- 任务类型：需求
- 严重程度：P2
- 状态：已验证-关闭
- 来源：用户需求（2026-06-12）
- 所属计划项：无（独立 fix）
- 任务描述：server 模式下从本机回环地址（127.0.0.1/::1，如 http://localhost:37701/）打开 viewer 仍要求输入 admin 用户名密码；期望本地访问自动登录（本机操作者即服务器管理员），非回环来源维持用户名密码登录；新增配置变量控制，默认开启本地自动登录。
- 涉及文件与行号：`src/ui/viewer/hooks/useAuth.ts:33-73`（无 token 直接进登录页，不探测会话）、`src/services/worker/http/routes/AuthRoutes.ts:195-197`（handleStatus 仅验 Bearer）、`src/services/worker/http/middleware/tokenAuth.ts:39-77`（回环来源同样强制 token）、`src/shared/SettingsDefaultsManager.ts`（缺配置项）
- 关联需求：N/A
- 根因分析：认证体系（admin 会话 + 共享 token）设计时未区分请求来源，回环与 LAN 同一套强制凭据流程；viewer 侧 useAuth 在无本地 token 时不向服务端探测，无自动登录通道。
- 实现/解决方案：(1) 新增配置 `CLAUDE_MEM_SERVER_LOCAL_AUTO_LOGIN`（默认 'true'）；(2) 新增 `isLoopbackRequest()`——req.ip 与 socket.remoteAddress 双校验均为回环才判定本地（经受信代理转发的远端请求 req.ip 为真实客户端 IP，不会误判）；(3) `/api/admin/session` 对回环+开关开启的未认证请求自动创建 admin 会话并返回 token；(4) tokenAuth 在缺失/无效凭据时对回环+开关开启的请求放行；(5) viewer useAuth 挂载时始终探测 session 端点，收到自动签发 token 即存储并进入已登录态。
- 验收/测试方法：(1) RED 基线：localhost session=false、analytics 401；(2) GREEN：localhost session 返回 authenticated:true+token，LAN(192.168.1.100) 仍 false；localhost analytics 无 token 200，LAN 无 token 401；(3) 开关置 false 后 localhost 恢复 false/401（设置即时生效，无需重启）；(4) 浏览器 http://localhost:37701 直进主界面，http://192.168.1.100:37701 显示登录页。
- git commit ID：9988662b
- 验证方法与结果：curl 实测——localhost /api/admin/session 返回 authenticated:true+token+auto_login:local、/api/stats/analytics 无 token 200；LAN(192.168.1.100) session 仍 false、analytics 401；开关写入 false 后 localhost 立即恢复 false/401（免重启），移除后恢复默认开启；浏览器实测 http://localhost:37701 直进主界面（无登录表单），http://192.168.1.100:37701 显示 USERNAME/PASSWORD 登录页（首次复测命中旧 bundle 缓存为误报，强刷后正确）。
- 关闭时间：2026-06-12 12:47

### X-006 server 模式数据 API 服务端未鉴权，LAN 可无凭据读取全量数据

- 编号：X-006
- 任务类型：缺陷（安全）
- 严重程度：P1
- 状态：已验证-关闭
- 来源：fix（X-005 验证过程中发现）
- 所属计划项：无（独立 fix）
- 任务描述：现象——server 模式绑定 0.0.0.0 时，LAN 上无任何凭据可直接读取数据 API：`curl http://192.168.1.100:37701/api/observations` 返回全量观察数据（实测含敏感工作内容），SSE 事件流同样向未认证页面实时推送新观察；`/api/admin/role` 也无鉴权。当前 tokenAuth 仅挂在 /api/stats/analytics 与 /api/sync/ingest 上，admin 登录页仅是 UI 门面，服务端数据面形同裸奔。影响范围——server 模式部署的全部记忆数据对局域网内任意主机可读。
- 涉及文件与行号：`src/services/worker/http/routes/DataRoutes.ts:141`（tokenAuth 仅个别端点）、`src/services/server/Server.ts`（无全局 /api 鉴权层）、SSE 事件路由（EventSource 无法携带 Authorization 头，需 query-param token 或 cookie 方案）
- 关联需求：X-005（本地自动登录依赖的"非本地必须登录"语义需服务端兜底才完整）
- 根因分析（初判）：认证体系按端点逐个加装而非默认拒绝（fail-open）；viewer 登录门控只在前端 React 层，未与服务端授权联动。
- 实现/解决方案（建议）：server 模式下对 /api/* 统一挂 tokenAuth（含 X-005 回环放行），白名单仅 /api/health、/api/admin/login、/api/admin/session、/api/admin/role、/api/sync/status 与静态资源；SSE 端点支持 ?token= 查询参数鉴权（EventSource 限制）；client/standalone 模式行为不变。
- 验收/测试方法：LAN 无凭据访问 /api/observations 及 SSE 返回 401；携带有效 admin 会话 token 或共享 token 恢复正常；localhost 在开关开启时不受影响；client 模式回归不破坏 hooks 本地调用。
- git commit ID：2ae17d44
- 验证方法与结果：curl 矩阵——LAN 无 token/错 token 访问 /api/observations、/api/sync/status、/stream、/api/sync/ingest 全部 401；共享 token 与 admin 会话 token 均 200；ingest 带 token 返回 400（载荷无效）而非 401 证明鉴权通过；localhost 无凭据 200（X-005 回环放行），开关置 false 即时 401；公开白名单（/、静态资源、/api/health、admin login/session/role）可达且 role 对未认证远端隐藏 userLabel。浏览器实测：LAN 显示登录页（数据请求全部 401 被拒），localhost 直进主界面、SSE Connected、0 控制台错误。
- 关闭时间：2026-06-12 13:23
### X-018 维护者自动升级与提交指令随 marketplace clone 分发

根目录 `CLAUDE.md` 同时承担贡献者说明与维护者本机自动化配置，marketplace 以仓库 clone 交付时会把每日全量依赖升级、自动修复、构建同步和提交指令带给最终用户。本任务只隔离维护者专属指令并建立分发守卫，不改变插件功能。

- 编号：X-018
- 任务类型：缺陷（分发安全）
- 严重程度：P1
- 状态：已验证-关闭
- 来源：`review-report-20260809041304.md`，上游提交 `e29d2213`
- 所属计划项：无（独立 fix）
- 任务描述：受版本控制的 `CLAUDE.md` 包含维护者每日自动升级所有依赖、执行 audit fix、build-and-sync 与 git commit 的指令；marketplace clone 不受 npm ignore 保护，用户侧 Agent 可能继承并执行这些维护者动作。
- 涉及文件与行号：`CLAUDE.md:114-122`、`.gitignore`、`tests/infrastructure/plugin-distribution.test.ts`
- 关联需求：`doc/A-系统需求文档.md` SR-INFRA-04；分发安全与最小副作用约束。
- 根因分析：Why-1——用户安装目录可能出现自动依赖升级/提交指令，因为根 `CLAUDE.md` 会随 clone 分发；Why-2——维护者本机规则与公开贡献规则写在同一文件；Why-3——原防护只关注 npm 包内容，没有覆盖 marketplace clone；Why-4——没有针对维护者指令的分发契约测试；Why-5——项目未区分 tracked 公共指令与 ignored local 指令。
- 影响评估：P1。是否执行取决于宿主对项目指令的加载，但一旦触发会修改依赖、生成产物和 Git 历史，属于不应下放给终端用户的高副作用行为。
- 实现/解决方案：移除 tracked `CLAUDE.md` 中的维护者自动化段，将其保留为本机 ignored 配置的职责；为 clone/tarball 可见内容增加禁止维护者自动提交、全量升级指令的测试。不得依赖 `.npmignore` 作为 marketplace 防线。
- 验收/测试方法：(1) tracked `CLAUDE.md` 不含每日自动升级/audit fix/build-and-sync/自动 commit 指令；(2) 本机规则文件被 gitignore；(3) 分发测试能够在上述指令重新出现时失败；(4) typecheck 与定向测试通过。
- 实现记录：维护者 Daily Maintenance 已移至项目级 ignored `CLAUDE.local.md`；tracked `CLAUDE.md` 仅保留公共贡献说明；分发测试锁定危险指令不得重新进入公开根指令。
- 验证方法与结果：分发复审发现并修复 Windows 排除参数与 Unix 含空格 pattern 问题；改为共享 raw pattern 数组及 `execFileSync` 参数调用。相关分发测试、脚本语法检查、typecheck、build 均通过。
- 关闭时间：2026-08-09

### X-017 Context 纯读取路径构造完整 SessionStore，参与建库与迁移锁竞争

Context 注入只需要查询 SQLite，却会创建完整 `SessionStore` 并执行目录创建、数据库初始化、WAL 与迁移检查。并发会话下该读路径会扩大写锁竞争和 Hook 延迟，本任务将其收敛为不会建库、不会迁移的只读连接。

- 编号：X-017
- 任务类型：缺陷（性能/并发）
- 严重程度：P1
- 状态：已验证-关闭
- 来源：`review-report-20260809041304.md`，上游提交 `1094e067`、`48319a43`
- 所属计划项：无（独立 fix）
- 任务描述：`ContextBuilder.initializeDatabase()` 为纯查询创建 `SessionStore`；构造器会创建数据目录/数据库、设置 WAL、初始化 schema 并检查迁移，使 Context Hook 参与写锁竞争，数据库不存在时还会产生新文件。
- 涉及文件与行号：`src/services/context/ContextBuilder.ts:39-58`、`src/services/context/ObservationCompiler.ts`、`src/services/sqlite/SessionStore.ts:62-105`
- 关联需求：`doc/A-系统需求文档.md` SR-CLI-02；`doc/B-系统设计文档.md` 非阻断 Hook 与本地 SQLite 可靠性设计。
- 根因分析：Why-1——Context 并发时可能锁等待/超时，因为纯读路径执行了可能写 schema 的 store 初始化；Why-2——查询编译器参数绑定到完整 `SessionStore`；Why-3——缺少最小只读数据库接口；Why-4——未使用 SQLite `readonly/create:false` 与 busy timeout；Why-5——测试没有约束“不存在时不建库、读取时不改 schema”。
- 影响评估：P1。会增加高频/并发 Hook 的 SQLite 锁竞争、启动延迟，并可能在 worker 未初始化时创建不完整数据库。
- 实现/解决方案：数据库存在时直接打开 `bun:sqlite` 只读连接，设置 5 秒 `busy_timeout`，查询参数收窄为 `{ db: Database }`，所有路径可靠关闭；数据库不存在时返回空结果且不创建文件。保持本地单/多项目查询语义不变。
- 验收/测试方法：(1) DB 不存在时不创建文件；(2) 已提交记录可读、未提交记录不可见；(3) schema/记录计数不变且 integrity_check=ok；(4) 350ms 独占锁后可等待成功；(5) 构建、定向测试通过并刷新 context bundle。
- 实现记录：ContextBuilder 在 DB 存在时以 `readonly/create:false` 打开 `bun:sqlite` 并设置 5 秒 busy timeout；ObservationCompiler 只依赖 `{ db: Database }`；所有返回路径关闭只读句柄，DB 不存在时不建文件。
- 验证方法与结果：4 项只读专项测试通过，覆盖缺库不创建、已提交可见/未提交不可见、schema 与记录计数不变、integrity_check=ok、350ms 独占锁等待；复审通过。
- 关闭时间：2026-08-09

### X-016 Chroma 本地并发写无背压，重复批与单水位可能丢失同步

本地 Chroma MCP 的 mutation 当前可并发直达同一 stdio 服务；重复 ID 冲突使用 delete+add，混合批与最大 ID 水位无法表达局部失败。本任务将写入变成有界单航道，并以幂等调和和持久化缺口账本保证失败可恢复。

- 编号：X-016
- 任务类型：缺陷（性能/数据一致性）
- 严重程度：P0
- 状态：已验证-关闭
- 来源：`review-report-20260809041304.md`，上游提交 `a90066f9`、`26d8cd3d`、`bdc78123`、`964104b6`
- 所属计划项：无（独立 fix）
- 任务描述：本地 Chroma mutation 没有串行化/队列上限，collection 创建只靠布尔值；重复冲突执行 delete+add，混合重复/新 ID 批可能整批失败或吞新记录；同步状态只看最大 ID，低位失败在水位前进后无法重试。
- 涉及文件与行号：`src/services/sync/ChromaMcpManager.ts:244-306`、`src/services/sync/ChromaSync.ts:178-196,335-405,631-647`、`src/services/sync/ChromaSyncState.ts`
- 关联需求：`doc/A-系统需求文档.md` SR-SVC-01、向量检索与持久化可靠性；`doc/B-系统设计文档.md` 数据一致性和优雅降级约束。
- 根因分析：Why-1——Chroma/uvx 可能出现写风暴，因为本地 mutation 全部并发执行；Why-2——没有共享 mutation tail、队列上限和 shutdown generation；Why-3——重复恢复以 delete+add 代替原位 update；Why-4——批次未拆分 existing/new；Why-5——水位只记录最大进度，没有持久化局部失败 gap。
- 影响评估：P0。可能造成 CPU/内存放大、HNSW 索引膨胀，以及水位已推进但向量记录永久缺失的静默数据不一致。
- 实现/解决方案：本地模式的 mutation 进入共享串行 tail 并设置 5000 有界积压，读请求与远程模式保持并发；collection 创建使用 single-flight Promise；重复批先 get 后拆为 update/add；同步状态持久化 pending row IDs，只有一行全部文档成功后才清 gap/推进水位。保持现有重连和降级行为。
- 验收/测试方法：(1) 并发本地 mutation 同时最多 1 个，远程读写不被错误串行；(2) collection 并发创建只调用一次；(3) 队列溢出/关闭后确定失败并可由 backfill 恢复；(4) 全重复、混合批、重启 gap、已删除 pending 行正确；(5) 不再 delete+add 重复文档；(6) typecheck、构建与 Chroma 定向测试通过。
- 涉及文档刷新：需 ree 刷新 E/F（ChromaSyncState 持久化状态契约）；当前缺完整 A-F 体系，只在 X 标注。
- 实现记录：本地 mutation 进入 5000 上限的单航道并在 shutdown generation 变化后取消；collection 创建 single-flight；重复批按现存 ID 拆分 update/add；live 与 backfill 失败均写入持久化 pending，按 SQLite 行完整写入后清 gap 并推进水位。
- 验证方法与结果：复审补齐连接中 stop 的 generation 取消、先销毁后有界等待、完整 reconcile 排他事务、collection 初始化失败回填和多文档行完整性判断；Chroma 专项测试与 typecheck 通过。
- 关闭时间：2026-08-09

### X-015 SDK 并发检查与实际 spawn 之间无预留，配置上限可被并发超发

`waitForSlot()` 只统计已经登记的 SDK 进程，在 OAuth 刷新和实际 spawn 前没有占位。多个请求可同时观察到空位并全部通过，本任务用幂等 reservation 把检查与占用合并为一个原子决策。

- 编号：X-015
- 任务类型：缺陷（性能/并发）
- 严重程度：P0
- 状态：已验证-关闭
- 来源：`review-report-20260809041304.md`，上游提交 `17dbeea6`、`04734d70`
- 所属计划项：无（独立 fix）
- 任务描述：`waitForSlot(): Promise<void>` 在 active count 小于上限时立即放行；调用方之后仍需 OAuth、query 与 spawn，进程稍后才注册。并发调用会在登记前共同越过上限，官方曾复现 max=2 实际启动 9 个 SDK agent。
- 涉及文件与行号：`src/supervisor/process-registry.ts:438-509`、`src/services/worker/ClaudeProvider.ts:213-250`
- 关联需求：`doc/A-系统需求文档.md` SR-SVC-01、SR-INFRA-04；资源有界与优雅降级约束。
- 根因分析：Why-1——SDK 子进程可能超过配置上限，因为检查与实际占用不原子；Why-2——registry 只统计 spawn 后登记的进程；Why-3——等待函数不返回占位凭证；Why-4——OAuth/query 的异步窗口扩大竞态；Why-5——测试只覆盖已有活动进程，没有覆盖“尚未登记的并发申请”。
- 影响评估：P0。昂贵 SDK agent 超发会造成与 Bun 风暴相似的 CPU/内存峰值，并使 `CLAUDE_MEM_MAX_CONCURRENT_AGENTS` 失去保护作用。
- 实现/解决方案：增加计入容量的 `SlotReservation`，立即获准和排队获准时原子预留；reservation `release()` 幂等，abort/OAuth/query/spawn 失败及 finally 全部释放；spawn 登记后释放预留，避免双计数。
- 验收/测试方法：(1) 5 并发、上限 2、无进程登记时只放行 2；(2) 未 release 时后续等待；(3) release 幂等；(4) reservation→registry record 总占用为 1；(5) abort/OAuth/query/spawn 失败不泄漏；(6) typecheck、构建和 supervisor/ClaudeProvider 定向测试通过。
- 实现记录：`waitForSlot` 在同步判定内返回计入容量的幂等 reservation；spawn factory 在登记成功/失败时释放，ClaudeProvider 的外层 finally 覆盖 OAuth、query 与 abort 等未 spawn 路径。
- 验证方法与结果：并发槽位定向测试、typecheck、build 通过；两轮 rev 均未发现 blocking/important。
- 关闭时间：2026-08-09

### X-014 daemon 多入口启动缺原子互斥，版本判断与实际脚本来源不统一

X-013 已切断高频 Hook 的 Bun 启动权，但 SessionStart、MCP、transcript watcher 与显式 CLI 仍可能竞争启动或重启 daemon；版本检查和实际 spawn 还可能解析到不同脚本。本任务补齐唯一 daemon 的控制面，不改变 Node-only Hook 数据面。

- 编号：X-014
- 任务类型：缺陷（生命周期/并发）
- 严重程度：P0
- 状态：已验证-关闭
- 来源：`review-report-20260809041304.md`，上游提交 `c0b96288`、`1fe9bea6`、`7d3f1879`、`906ffe37`
- 所属计划项：无（独立 fix）
- 任务描述：多个非 Hook 控制面采用“先检查健康、后 spawn”的观察式逻辑，没有跨进程原子锁；版本检查固定读取 marketplace，spawn 路径另行解析；restart 发起后缺少新 PID 与预期版本验收，可能重复启动、版本乒乓或假成功。
- 涉及文件与行号：`src/services/worker-spawner.ts:70-153`、`src/shared/worker-utils.ts:134-327`、`src/services/infrastructure/HealthMonitor.ts:114-158`、`src/services/worker-service.ts:1422-1437`
- 关联需求：`doc/A-系统需求文档.md` SR-SVC-01、SR-INFRA-04；`doc/B-系统设计文档.md` 单机单 worker、非阻断和优雅降级设计。
- 根因分析：Why-1——冷启动/升级时仍可能出现多个 daemon，因为多个入口可同时通过健康检查；Why-2——检查与 spawn 之间没有跨进程原子所有权；Why-3——版本来源与脚本路径来源分裂；Why-4——restart 只等待端口/固定延迟，没有证明 PID 与版本已切换；Why-5——现有测试没有覆盖多个独立 launcher 的竞争和版本同源契约。
- 影响评估：P0。正常高频 Hook 已受 X-013 保护，但冷启动、MCP、transcript 与升级路径仍可能重复 spawn 或循环重启，造成 CPU 峰值和运行错误版本。
- 实现/解决方案：新增 `<DATA_DIR>/spawn.lock` 的 `wx` 原子 gate（90s stale、re-stat 防 TOCTOU、owner-only release），只包实际 spawn 并持有到 ready/warming；新增身份优先、path+version 同源的 worker script resolver，禁止按最高官方 cache 覆盖定制 worker；restart 只有在新 PID 且版本等于构建期预期值后才成功。高频 Node Hook 继续 client-only，绝不移植上游 Hook SIGKILL/respawn。
- 验收/测试方法：(1) 20 个并发 launcher 最多 spawn 一个 daemon；(2) gate 的竞争、90s stale、owner release、finally 释放通过；(3) custom/upstream cache 并存时不越身份选官方；(4) restart 对旧 PID/错误版本/不可达返回失败，新 PID+正确版本成功；(5) Hook bundle 仍零 Bun/零 spawn；(6) typecheck、构建、生命周期定向测试与实际并发验证通过。
- 涉及文档刷新：需 ree 刷新 A/B 的 daemon 控制面事实；当前缺完整 A-F 体系，只在 X 标注。
- 实现记录：新增 owner-checked、90 秒陈旧接管的 `spawn.lock`，接入 `worker-spawner`、非 Hook lazy-spawn 与 CLI restart；worker 路径和版本一次解析，restart 必须验证新 PID 与构建期版本。高频 Hook 仍只检查既有 daemon。
- 验证方法与结果：复审修复健康探测提前释放、非 EEXIST fail-open、spawn 异常锁泄漏和无同源脚本时误重启；生命周期定向测试、typecheck、build 通过，复审结论 pass。
- 关闭时间：2026-08-09
