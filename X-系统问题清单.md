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
- 提交：&lt;TBD&gt;
