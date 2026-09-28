# useSyncStatus.ts 需求说明

> 源文件：src/ui/viewer/hooks/useSyncStatus.ts ｜ 类型：源码 ｜ 行数：49 ｜ 所属模块：viewer/hooks ｜ 分析日期：2026-07-23

## 1. 文件定位总述

useSyncStatus 是一个 React 自定义 Hook，负责轮询后端同步状态 API 并将结果暴露给 UI 组件。它以可配置间隔（默认 30 秒）定期拉取 `/api/sync/status` 端点，返回同步状态快照和就绪标志。该 Hook 主要被 SyncStatusBadge 组件消费，在 Header 区域显示客户端同步代理的健康状态。

## 2. 功能需求

| 编号 | 需求描述（系统应当…） | 触发条件 / 输入 | 处理规则与输出 | 证据 |
|------|----------------------|----------------|---------------|------|
| FR-USS-01 | 系统应当在组件挂载后立即发起首次同步状态查询 | 组件 mount，无参数 | 调用 `authFetch('/api/sync/status')`，成功则设置 status 和 ready=true | `src/ui/viewer/hooks/useSyncStatus.ts:43` |
| FR-USS-02 | 系统应当以可配置间隔持续轮询同步状态 | 首次请求完成后 | 启动 `setInterval`，周期为 `intervalMs`（默认 30000ms），每次执行与首次相同的查询逻辑 | `src/ui/viewer/hooks/useSyncStatus.ts:44` |
| FR-USS-03 | 系统应当在组件卸载时取消轮询并标记取消 | 组件 unmount | 设置 `cancelled = true`，清除 interval，后续响应不更新状态 | `src/ui/viewer/hooks/useSyncStatus.ts:45` |
| FR-USS-04 | 系统应当在请求失败时仍将 ready 标记为 true | HTTP 响应非 ok 或网络异常 | catch 分支中设置 `ready = true`，status 保持不变 | `src/ui/viewer/hooks/useSyncStatus.ts:39` |

## 3. 业务规则与约束

- 使用 `authFetch`（带认证的 fetch）而非原生 fetch，说明同步状态端点需要鉴权。`src/ui/viewer/hooks/useSyncStatus.ts:31`
- 请求失败时仅标记 ready 而不抛出错误，保证 UI 不会因轮询失败而无限等待。

## 4. 对外暴露

| 导出名称 | 类型 | 说明 |
|---------|------|------|
| `SyncStatus` | interface | 同步状态数据结构（role、sync_enabled、upstream、last_sync_at 等） |
| `useSyncStatus` | `(intervalMs?: number) => { status: SyncStatus \| null; ready: boolean }` | Hook 函数 |

## 5. 依赖关系

- 上游：`authFetch`（`src/ui/viewer/utils/api.ts`）
- 下游：`SyncStatusBadge` 组件

## 6. 数据结构

**SyncStatus 接口**：
- `role: 'client' | 'server'` — 当前角色
- `sync_enabled: boolean` — 同步是否启用
- `upstream: string` — 上游地址
- `last_sync_at: number` — 最后同步时间戳
- `last_success_at: number` — 最后成功时间戳
- `consecutive_failures: number` — 连续失败次数
- `last_error: string | null` — 最后错误信息
- `lag: { sessions, observations, summaries, prompts, total }` — 待推送条目数

## 8. 逆向备注

- 接口类型直接在文件中定义并导出，非从 types.ts 统一导入。
