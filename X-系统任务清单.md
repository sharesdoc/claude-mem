
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
