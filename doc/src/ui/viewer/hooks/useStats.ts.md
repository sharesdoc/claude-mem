# useStats.ts 需求说明

> 源文件：src/ui/viewer/hooks/useStats.ts ｜ 类型：源码 ｜ 行数：25 ｜ 所属模块：ui/viewer ｜ 分析日期：2026-07-23

## 1. 文件定位总述

本文件实现一个 React Hook，用于从 Worker 后端获取并缓存全局统计数据（如观察记录数、会话数等）。Hook 在组件首次挂载时自动加载数据，并暴露 refreshStats 方法供手动刷新。数据通过 authFetch（支持 admin token 认证）从 `/api/stats` 端点获取。

## 2. 功能需求

| 编号 | 需求描述（系统应当…） | 触发条件 / 输入 | 处理规则与输出 | 证据 |
|------|----------------------|----------------|---------------|------|
| FR-US-01 | 系统应当在组件挂载时自动从 `/api/stats` 端点加载统计数据 | 组件首次渲染 | useEffect 触发 loadStats()，通过 authFetch 请求 | `src/ui/viewer/hooks/useStats.ts:19-21` |
| FR-US-02 | 系统应当将获取到的统计数据存储在 state 中 | API 返回 JSON 数据 | setStats(data)，初始值为空对象 {} | `src/ui/viewer/hooks/useStats.ts:7,12` |
| FR-US-03 | 系统应当在请求失败时记录错误日志，不抛出异常 | fetch 异常 | console.error 记录，state 保持不变 | `src/ui/viewer/hooks/useStats.ts:14-15` |
| FR-US-04 | 系统应当暴露 refreshStats 方法供调用方手动触发重新加载 | 用户交互触发 | 返回 { stats, refreshStats: loadStats } | `src/ui/viewer/hooks/useStats.ts:23` |

## 3. 业务规则与约束

| 编号 | 规则描述 | 证据 |
|------|---------|------|
| BR-US-01 | 未实现定时自动刷新（对比 TIMING.STATS_REFRESH_INTERVAL_MS，推断定时刷新在其他地方实现或由父组件控制） | `src/ui/viewer/hooks/useStats.ts:19-21`（useEffect 无定时器） |

## 4. 对外暴露

| 导出项 | 类型 | 用途 |
|--------|------|------|
| `useStats` | React Hook | 返回 { stats: Stats, refreshStats: () => void } |

### 返回值结构

| 字段 | 类型 | 说明 |
|------|------|------|
| stats | Stats | 统计数据对象（来自 `/api/stats`） |
| refreshStats | () => void | 手动触发重新加载 |

## 5. 依赖关系

- **内部依赖**：`../types`（Stats 类型）、`../constants/api`（API_ENDPOINTS）、`../utils/api`（authFetch）
- **被依赖**：Viewer 组件中使用统计数据的页面

## 6. 数据结构

**Stats**: Record 类型（推断，定义在 `../types` 中），初始为 `{}`。

## 7. 复杂逻辑图示

不适用（简单的数据获取 Hook）。

## 8. 逆向备注

- loadStats 使用 useCallback 包裹但无依赖数组外的参数，确保引用稳定。
- stats 初始值为空对象 `Stats = {}`，UI 需要处理空状态。
- 未实现定时刷新，推断父组件通过 TIMING.STATS_REFRESH_INTERVAL_MS 控制 setInterval 来周期性调用 refreshStats。
