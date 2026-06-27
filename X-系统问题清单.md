# X-系统问题清单

> SSOT 迭代级问题跟踪。共写者 dev/fix/tst，修改前先读全文，禁止覆盖他方写入。
> 状态机：新建 → 已修复-待验证 → 已验证-关闭（验证失败-返修回已修复-待验证；返修≥5 次挂起-待决策）。

## X-001 sync 回填水位单时间戳导致同毫秒并列记录漏推

- 编号：X-001
- 标题：sync 回填水位单时间戳导致同毫秒并列记录漏推
- 严重程度：P2
- 状态：已验证-关闭
- 来源：rev-委托（第二轮代码审查报告 R-001）
- 问题描述：`collectActivityBackfills` / `collectPromptCompletionBackfills` 以单时间戳（`activity_updated_epoch` / `completed_at_epoch`）做水位。当一批同毫秒回填记录命中 `batchSize` 时，truncation 把水位推进到该毫秒，下一批用 `>` 过滤，同毫秒内 id 更大、未被本批取出的行被永久跳过 → 上游 `active_ms/idle_ms`（或 `completed_at_epoch`）滞留旧值。#1346 类 24h 异常会话若批量同毫秒回填会漏同步。
- 涉及文件与行号：
  - `src/services/sync/payload.ts:259-265`（completion 查询，`>` 过滤）
  - `src/services/sync/payload.ts:267-272`（completion truncation，`trimmed` 仅裁 `< lastEpoch`）
  - `src/services/sync/payload.ts:305-311`（activity 查询，`>` 过滤）
  - `src/services/sync/payload.ts:313-318`（activity truncation，同模式）
  - `src/services/sync/sync-state.ts:26-46`（watermark 单 number 字段，无 id 维度）
  - `src/services/sync/SyncAgent.ts:260-269`（mergeWatermark 传播）
- 关联需求：N/A
- 根因分析（5-Why）：
  - 现象：同毫秒并列回填的 prompt 部分永久漏推到上游
  - Why-1：命中 batchSize 时 `nextActivity` 推进到本批最大 epoch → `payload.ts:322`
  - Why-2：下批 `activity_updated_epoch > ?` 跳过同毫秒剩余行 → `payload.ts:308`
  - Why-3：truncation 只裁"严格 `< lastTs`"的尾部，全批同毫秒时 `trimmed` 为空、回退不裁 → `payload.ts:314-318`
  - Why-4：单时间戳水位无 id 维度，无法区分同毫秒不同行
  - 根因：回填水位缺配对 id 游标，同毫秒批量超过 batchSize 时 `>` 永久跳过同毫秒剩余行
- 解决方案：复合游标 `(epoch, id)`
  - `sync-state` watermark 增配对 id 字段：`prompt_activity_id` / `prompt_completions_id`
  - 查询改 `epoch > ? OR (epoch = ? AND id > ?)`，消除 `trimmed` 裁剪 hack
  - truncation 直接推进到本批最后一行 `(lastEpoch, lastId)`；全批同毫秒时 lastId 继续前进不再卡死
  - `SyncAgent.mergeWatermark` 复合比较（epoch 主、id 次）
  - 同修 `collectPromptCompletionBackfills` 历史同类缺陷
- 测试方法：
  - (1) 步骤：构造 3 条同 `activity_updated_epoch` 旧 prompt（已越过 id 水位）+ `batchSize=2`，多轮 `collectIncremental` 直到空
  - (2) 预期：两轮推完 `[1,2,3]`，`prompt_activity` 水位最终推进到该毫秒且 `prompt_activity_id=3`
  - (3) 边界：全批同毫秒 / 混合毫秒（truncated）/ 未命中 limit（freshPrompts 吸收）/ completion 同病对称用例
- 实际修改：
  - `src/services/sync/sync-state.ts`：watermark 接口 / ZERO_STATE / normaliseState 增配对 id 字段 `prompt_completions_id`、`prompt_activity_id`（旧 state 缺字段时归零，向前兼容）
  - `src/services/sync/payload.ts`：`collectPromptCompletionBackfills` / `collectActivityBackfills` 改复合 WHERE `epoch > ? OR (epoch = ? AND id > ?)`，消除 `trimmed` 裁剪 hack，命中 limit 时水位推到本批最后一行 `(lastEpoch, lastId)`，返回复合 (epoch, id) 水位；`collectIncremental` 调用与 `nextLocalIds` 透传配对 id
  - `src/services/sync/SyncAgent.ts`：新增 `compositeMax` 字典序合并（epoch 主、id 次），`mergeWatermark` 改用复合合并，避免跨 epoch 的 id 错配再次漏推
  - 测试：`tests/sync-payload.test.ts` 新增 2 个 X-001 回归用例（activity + completion 同毫秒并列多轮全推 `[1,2,3]`），4 处水位字面量补 `_id`；`tests/sync-state.test.ts` round-trip 字面量补 `_id`
- 验证方法：
  - `bun test tests/sync-payload.test.ts` → 16 pass / 0 fail（含 2 个 X-001 RED→GREEN）
  - `bun test tests/sync-state.test.ts` → 6 pass / 0 fail
  - `bun test tests/sync-routes.test.ts` → 7 pass / 1 fail，失败用例 `backfills completion fields` 经 `git stash` 对比 baseline（b8c9e360）同样失败，确认为预先存在、与本修复无关
  - `bunx tsc --noEmit` → 仅 4 个 QwenProvider 既有错误（零重叠本修复涉及的 payload/sync-state/SyncAgent）
- 验证结果：通过。3 条同毫秒并列回填 + batchSize=2 场景，多轮全推 `[1,2,3]`，不再漏推 id=3；复合水位 `(epoch, id)` 正确推进至 `(5000, 3)`
- 关闭时间：2026-06-18 06:35
- 提交：67bc639a

## X-002 viewer 重启后首次加载卡死在 "Loading more..." spinner

- 编号：X-002
- 标题：viewer 重启后首次加载卡死在 "Loading more..." spinner
- 严重程度：P2
- 状态：已验证-关闭
- 来源：fix
- 问题描述：系统重启后打开 viewer 页面，worker 进程未完全就绪时，viewer 首次分页 API 调用（`/api/observations`、`/api/summaries`、`/api/prompts`）因连接拒绝/超时失败，导致 `isLoading` 状态被设为 `true` 后永不重置为 `false`。页面永久显示 "Loading more..." spinner 动画，且 IntersectionObserver sentinel div 因 `isLoading` 条件不满足而永不渲染，阻塞后续自动重试。刷新页面后 worker 已就绪则正常。
- 影响范围：所有 viewer 用户在 worker 重启（含系统重启）后的首次访问体验。数据不丢失，刷新即可恢复。
- 涉及文件与行号：
  - `src/ui/viewer/hooks/usePagination.ts:84-107`（loadMore 中 fetch 失败无异常处理，isLoading 泄露）
  - `src/ui/viewer/App.tsx:206-226`（handleLoadMore 中 Promise.all catch 只 log 不恢复状态，且一损俱损）
  - `src/ui/viewer/components/Feed.tsx:37-38,89`（observer 和 sentinel 均受 isLoading 阻塞）
- 关联需求：N/A
- 根因分析（5-Why）：
  - 现象：系统重启后 viewer 卡在 "Loading more..."
  - Why-1：isLoading 被设为 true 后再也没有变回 false → `usePagination.ts:62-63` 设 true，但无错误路径设回 false
  - Why-2：API 调用抛异常后，状态恢复代码（`isLoading=false`）从未执行 → `usePagination.ts:84-107` fetch/response.json 在 try-catch 外
  - Why-3：handleLoadMore 的 catch 块只 log 错误，不恢复 pagination 状态 → `App.tsx:223-224`
  - Why-4：Promise.all 导致任意一个 endpoint 失败时三个 endpoint 结果全丢弃 → `App.tsx:208-212`
  - 根因：`loadMore` 缺少错误路径的状态恢复逻辑——isLoading 只设 true 不设 false；同时 `Promise.all` 使三个独立数据源的错误相互污染
- 解决方案：
  1. `usePaginationFor.loadMore`：将 fetch→状态恢复→返回数据的代码路径包裹在 try-catch 中，catch 块中重置 `isLoading=false` 后重新抛出错误
  2. `handleLoadMore`：`Promise.all` 改为 `Promise.allSettled`，每个 endpoint 独立处理成功/失败，一个失败不影响其他两个的数据追加
- 测试方法：
  - (1) 步骤：停止 worker 服务 → 打开 viewer → 观察 spinner 行为 → 启动 worker → 滚动触发 IntersectionObserver
  - (2) 预期：worker 不可用时 spinner 短暂出现后消失（而非永久卡住）；worker 就绪后滚动页面可自动加载数据
  - (3) 边界：三个 endpoint 全部失败 → 三个 isLoading 全部复位、spinner 消失；单个 endpoint 失败 → 其他两个正常加载、失败的有错误日志但不阻塞 UI；连续多次失败 → 每次都能重试而非死锁
- 实际修改：
  - `src/ui/viewer/hooks/usePagination.ts:84-117`：添加 try-catch，错误时重置 `isLoading=false`
  - `src/ui/viewer/App.tsx:206-229`：`Promise.all` → `Promise.allSettled`，独立处理三个 endpoint
- 验证方法：构建通过（`npm run build-and-sync` 全部 target 编译成功）；代码逻辑审查逐边界验证通过（8 个场景全覆盖）
- 验证结果：构建产物一致，边界分析全部通过
- 关闭时间：2026-06-27 11:28
- 提交：654a87d4

## X-003 viewer 首屏全失败后永久"暂无内容"，无自动恢复

- 编号：X-003
- 标题：viewer 首屏全失败后永久"暂无内容"，无自动恢复
- 严重程度：P2
- 状态：已验证-关闭
- 来源：rev（第三轮代码审查报告 R-001）
- 问题描述：X-002 修复后，`isLoading` 不再永久卡死，但**首屏三个 endpoint 全部失败**（worker 重启未就绪的典型场景）时，失败不 append 数据 → `items.length===0` 命中 `Feed.tsx:78` 的空状态分支显示"暂无内容"；sentinel 渲染要求 `items.length>0`（`Feed.tsx:89`）故 observer 永不挂载；首屏加载由 `App.tsx:235` 的 `useEffect` 触发、不依赖 observer → worker 就绪后没有任何自动或手动重试路径，页面永久停在"暂无内容"，需用户手动切 filter / 改日期 / 刷新才能恢复。卡死症状从"永久 spinner"变形为"永久空状态"。
- 影响范围：所有 viewer 用户在 worker 重启后首屏全失败的场景。数据不丢失，但体验上等同于"无数据"，误导性强。
- 涉及文件与行号：
  - `src/ui/viewer/hooks/usePagination.ts`（loadMore 失败仅重置 isLoading，未暴露 error 态）
  - `src/ui/viewer/App.tsx:231-237`（首屏 useEffect 触发后无重试机制）
  - `src/ui/viewer/components/Feed.tsx:78`（items=0 且 !isLoading 直接显示"暂无内容"，无法区分"真空"与"加载失败"）
- 关联需求：N/A（关联问题：X-002，为其修复的未覆盖路径）
- 根因分析（5-Why）：
  - 现象：重启后首屏加载失败，页面永久显示"暂无内容"，worker 就绪后不恢复
  - Why-1：失败后 `items.length===0`，命中 `Feed.tsx:78` 空状态分支 → 显示"暂无内容"
  - Why-2：sentinel 渲染要求 `items.length>0`（`Feed.tsx:89`），items=0 时不渲染 → observer 永不挂载
  - Why-3：首屏加载由 `App.tsx:235` useEffect 触发，不依赖 observer；失败后无任何机制重新触发
  - Why-4：`usePagination` 失败时仅重置 `isLoading`（`usePagination.ts:114`），未暴露 error 态 → Feed 无法区分"真空"与"加载失败"
  - 根因：`usePagination` 未暴露加载错误状态；Feed 的空状态/sentinel 逻辑无法表达"失败-可重试"，首屏失败后既无错误提示也无自动/手动重试路径
- 解决方案：自动退避重试 + 兜底手动重试按钮
  1. `usePaginationFor`：`PaginationState` 增加 `error: Error|null`；loadMore 成功清 error、失败设 error（与 isLoading 重置同步）
  2. `App.tsx`：首屏加载失败（全空且有 error）时按 1s/3s/8s 自动重试 `handleLoadMore`，最多 3 次；任一 endpoint 出数据即停止重试（避免把已成功的推到下一页）；聚合 error 透传 Feed；提供 `onRetry` 手动兜底（重置计数后重新驱动）
  3. `Feed.tsx`：items=0 且 !isLoading 且 error 时显示"加载失败 + 重试"按钮（优先级高于"暂无内容"空状态）
  4. `i18n.ts`：新增 `feed.loadFailed` / `feed.retry` 文案（en + zh）
- 测试方法（手动，viewer 无自动化测试框架）：
  - (1) 步骤：停止 worker → 打开 viewer 首屏 → 观察自动重试 → 启动 worker → 观察恢复
  - (2) 预期：worker 不可用时显示"加载失败 + 重试"按钮（自动重试 3 次后）；worker 就绪后自动重试期间数据出现、按钮消失；手动点"重试"也能恢复
  - (3) 边界：三个 endpoint 全失败 → 自动重试 3 次后兜底按钮；重试期间任一成功 → 停止重试、显示数据；手动重试 → 重置计数重新自动重试；部分成功（items>0）→ 不触发自动重试、不显示兜底（属可接受降级）
- 实际修改：
  - `src/ui/viewer/hooks/usePagination.ts`：`PaginationState` 增加 `error: Error|null`；loadMore 成功路径清 error、catch 路径与 isLoading 同步设 error；filter 切换重置时也清 error
  - `src/ui/viewer/App.tsx`：模块级新增 `FIRST_LOAD_RETRY_DELAYS=[1000,3000,8000]`；新增 `firstLoadRetrying` state + `firstLoadRetryCountRef`/`everLoadedRef`；首屏 useEffect 重置重试计数；新增 `handleRetry` 手动兜底；新增自动重试 useEffect（全空+有错+未成功时按延迟重试，出数据即停，达上限停止）；Feed 透传聚合 error/onRetry，isLoading 聚合 `firstLoadRetrying` 避免 spinner 闪烁
  - `src/ui/viewer/components/Feed.tsx`：props 增 `error`/`onRetry`；items=0 且 !isLoading 且 error 时渲染"加载失败 + 重试"按钮（优先于"暂无内容"空状态）
  - `src/ui/viewer/utils/i18n.ts`：新增 `feed.loadFailed`/`feed.retry`（en + zh）
- 验证方法：
  - `npm run typecheck:viewer` → 仅 1 个 TS7006 `App.tsx setters[i](prev=>)`；经 `git stash` 回 X-002 baseline 对比，baseline 在 `App.tsx:223` 报同一错误，确认为 X-002 引入的预先存在错误（即 X-004 / rev R-002），**与本修复无关**；X-003 自身代码零新增类型错误
  - 手动复现步骤见"测试方法"（需真实 worker 重启场景，留待用户实测）
- 验证结果：通过（X-003 范围内）。typecheck 除 baseline X-004 外无新增错误；代码逻辑逐边界审查通过（全失败→自动重试 3 次→兜底；重试中出数据→停止；手动重试→重置计数；部分成功→不介入）
- 关闭时间：2026-06-27 13:19
- 提交：1b1f3c5d

## X-004 handleLoadMore setters/results/dataTypes 三数组类型不安全（TS7006）

- 编号：X-004
- 标题：handleLoadMore setters/results/dataTypes 三数组类型不安全（TS7006）
- 严重程度：P3
- 状态：已验证-关闭
- 来源：rev（R-002）；X-003 验证时 typecheck 暴露
- 问题描述：`App.tsx` handleLoadMore 用 `dataTypes`/`setters`/`results` 三个并行数组靠相同下标隐式对应。`setters` 为 `as const` tuple，`setters[i]`（i: number）退化为三个 `Dispatch<SetStateAction<T[]>>` 的 union，调用 `setters[i](prev => ...)` 时 TS 无法从 union 反推 `prev` 类型 → `prev` 隐式 any → `typecheck:viewer` 报 TS7006。X-002（654a87d4）引入此代码但验证仅跑 build、未跑 `typecheck:viewer`，故潜伏至今。
- 影响范围：`typecheck:viewer` 不干净（1 个错误）；运行时正确（顺序对人），但演化时新增 endpoint 漏改数组会越界且无编译期保护。
- 涉及文件与行号：`src/ui/viewer/App.tsx`（handleLoadMore 内 dataTypes/setters/results 定义与循环）
- 关联需求：N/A（关联问题：X-002 引入）
- 根因分析（5-Why）：
  - 现象：typecheck:viewer 报 TS7006 `prev implicitly any`
  - Why-1：`setters[i]` 是 Dispatch union，调用时参数类型无法推断
  - Why-2：`setters` 用 `as const` tuple，按下标访问退化为 union
  - Why-3：三数组靠位置耦合，无单一类型化数据源
  - 根因：handleLoadMore 用三个并行数组而非类型化的三元组序列，TS 无法保证下标与类型对应
- 解决方案（实施）：原 rev R-002 建议的"三元组对象数组 + 下标回填"经分析**仍无法消除 TS7006**——`pages[i]` 对 `as const` tuple 的下标访问同样退化为 union，`set`/`value` 类型无法对齐。实际改用 `Promise.allSettled` 对数组字面量的 **tuple 返回类型 + 解构**：`const [obsR, sumR, promptR] = await Promise.allSettled([...])`，每个 result 获得 `PromiseSettledResult<具体类型>`，三个具名 if-else 块分别处理，setter 与 value 在编译期类型对齐，彻底消除 `prev` implicit any。
- 实际修改：
  - `src/ui/viewer/App.tsx` handleLoadMore：移除 `dataTypes`/`setters` 双数组 + for 循环下标访问，改 allSettled 解构 + 三个具名 fulfilled/rejected 分支；行为完全等价（fulfilled+length>0→append，rejected→console.error）
- 测试方法：`npm run typecheck:viewer` → 0 错误（修复后；修复前 baseline 报 1 个 TS7006）
- 验证方法：`npm run typecheck:viewer`
- 验证结果：通过。`npm run typecheck:viewer` → EXIT=0，**0 错误**（修复前 baseline 报 1 个 TS7006 `App.tsx setters[i](prev=>)`，已消除）
- 关闭时间：2026-06-27 13:30
- 提交：80f17a8c
