# types.ts 需求说明

> 源文件：src/server/runtime/types.ts ｜ 类型：源码 ｜ 行数：109 ｜ 所属模块：server/runtime ｜ 分析日期：2026-07-23

## 1. 文件定位总述

types.ts 是 Server Beta 运行时的核心类型定义文件，定义了运行时名称、认证模式、边界健康状态、队列指标、服务图（ServiceGraph）等关键类型，并提供了四个"禁用态"边界实现类（DisabledServerBetaQueueManager 等）。ServiceGraph 是 Server Beta 的顶层依赖聚合结构，将 Postgres 连接池、队列管理器、生成工作器管理器、提供商注册表、事件广播器和存储仓库统一为一个类型安全的服务图对象。

## 2. 功能需求

| 编号 | 需求描述（系统应当…） | 触发条件 / 输入 | 处理规则与输出 | 证据 |
|------|----------------------|----------------|---------------|------|
| FR-RTTYPE-01 | 系统应当定义 ServiceGraph 类型，聚合运行时所有核心服务的健康状态和实例引用 | Server Beta 启动时组装服务图 | `ServerBetaServiceGraph` 包含 runtime、postgres、authMode、queueManager、generationWorkerManager、providerRegistry、eventBroadcaster、storage | `types.ts:65-77` |
| FR-RTTYPE-02 | 系统应当为四种边界组件（队列管理器、生成工作器管理器、提供商注册表、事件广播器）提供统一的"禁用态"实现 | 队列引擎为 sqlite（非 bullmq）时 | DisabledServerBetaXxx 类返回 `{status:'disabled', reason}` 的健康状态，close() 为空操作 | `types.ts:79-108` |
| FR-RTTYPE-03 | 系统应当定义队列通道指标类型，包含 waiting、active、completed、failed、delayed、stalled 计数和 unavailable 标志 | 健康检查端点采样队列状态时 | `ServerBetaQueueLaneMetric` 包含 per-lane 的 BullMQ 计数和不可用标记 | `types.ts:28-39` |

## 3. 业务规则与约束

1. **认证模式枚举**：`api-key`、`local-dev`、`disabled` 三种（`types.ts:6`）
2. **边界健康状态**：`disabled`、`active`、`errored` 三种（`types.ts:8`）
3. **禁用态边界类统一行为**：getHealth() 返回 `{status:'disabled', reason}`，close() 为 async 空操作（`types.ts:87-92`）
4. **unavailable 语义**：队列通道指标中 `unavailable=true` 表示 Redis 不可达，健康端点不应因此 503（`types.ts:36`）

## 4. 对外暴露

| 导出项 | 类型 | 说明 |
|--------|------|------|
| `ServerBetaRuntimeName` | type | 固定为 `'server-beta'` |
| `ServerBetaAuthMode` | type | `'api-key' \| 'local-dev' \| 'disabled'` |
| `ServerBetaBoundaryHealth` | interface | 边界健康状态（status + reason + details?） |
| `ServerBetaQueueLaneMetric` | interface | 队列通道指标 |
| `ServerBetaQueueManager` | interface | 队列管理器接口 |
| `ServerBetaGenerationWorkerManager` | interface | 生成工作器管理器接口 |
| `ServerBetaProviderRegistry` | interface | 提供商注册表接口 |
| `ServerBetaEventBroadcaster` | interface | 事件广播器接口 |
| `ServerBetaServiceGraph` | interface | 顶层服务聚合图 |
| `DisabledServerBetaQueueManager` | class | 禁用态队列管理器 |
| `DisabledServerBetaGenerationWorkerManager` | class | 禁用态生成工作器管理器 |
| `DisabledServerBetaProviderRegistry` | class | 禁用态提供商注册表 |
| `DisabledServerBetaEventBroadcaster` | class | 禁用态事件广播器 |
| `ServerBetaBootstrapStatus` | interface | Postgres schema 初始化状态 |
| `ServerBetaBoundaryStatus` | type | `'disabled' \| 'active' \| 'errored'` |

## 5. 依赖关系

- **上游**：`../../storage/postgres/index.js`（PostgresPool, PostgresStorageRepositories）
- **下游**：被 Server Beta 的创建脚本、健康检查端点、路由处理器等消费

## 6. 数据结构

```typescript
interface ServerBetaServiceGraph {
  runtime: 'server-beta';
  postgres: { pool: PostgresPool; bootstrap: ServerBetaBootstrapStatus };
  authMode: 'api-key' | 'local-dev' | 'disabled';
  queueManager: ServerBetaQueueManager;
  generationWorkerManager: ServerBetaGenerationWorkerManager;
  providerRegistry: ServerBetaProviderRegistry;
  eventBroadcaster: ServerBetaEventBroadcaster;
  storage: PostgresStorageRepositories;
}
```

## 7. 复杂逻辑图示

不适用，该文件为纯类型定义。

## 8. 逆向备注

无特殊备注。
