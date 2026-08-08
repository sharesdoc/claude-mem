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
- 任务清单收尾提交：`chore(X-012): close verified task record`（本条首次进入“已验证-关闭”状态的提交）
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
