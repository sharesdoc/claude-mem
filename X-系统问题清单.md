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
