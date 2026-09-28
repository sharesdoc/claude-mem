# useRole.ts 需求说明

> 源文件：src/ui/viewer/hooks/useRole.ts ｜ 类型：源码 ｜ 行数：52 ｜ 所属模块：viewer/hooks ｜ 分析日期：2026-07-23

## 1. 文件定位总述

useRole 是 Viewer 启动时获取服务端角色和身份信息的 Hook（T-18）。它一次性请求 `/api/admin/role` 端点，确定当前实例是 client/server/standalone 模式，并获取用户标签。该信息用于控制 Header 品牌显示、多用户选择器和同步状态徽章的可见性。错误时保守降级为 standalone。

## 2. 功能需求

| 编号 | 需求描述（系统应当…） | 触发条件 / 输入 | 处理规则与输出 | 证据 |
|------|----------------------|----------------|---------------|------|
| FR-UR-01 | 系统应当在组件挂载时一次性请求角色信息 | 组件 mount | 调用 `authFetch('/api/admin/role')` 解析响应中的 role、deployment、userLabel | `src/ui/viewer/hooks/useRole.ts:35-48` |
| FR-UR-02 | 系统应当将 role 解析为 'client' 或 'server'（非 server 均为 client） | 响应中 `role` 字段 | `body.role === 'server' ? 'server' : 'client'` | `src/ui/viewer/hooks/useRole.ts:39` |
| FR-UR-03 | 系统应当将 deployment 解析为三种模式之一 | 响应中 `deployment` 字段 | server→server, client→client, 其他→standalone | `src/ui/viewer/hooks/useRole.ts:40-41` |
| FR-UR-04 | 系统应当在请求失败时保守降级为 standalone | fetch 失败或非 ok | 返回 `role: 'client', deployment: 'standalone', userLabel: null, ready: true` | `src/ui/viewer/hooks/useRole.ts:46-47` |
| FR-UR-05 | 系统应当在请求过程中保持默认的 standalone 状态 | 组件 mount 后、请求完成前 | 返回 `ready: false` 的默认状态 | `src/ui/viewer/hooks/useRole.ts:28` |

## 3. 业务规则与约束

- 降级策略：未知角色隐藏多用户 UI 而非展示损坏的选择器。`src/ui/viewer/hooks/useRole.ts:11`
- 默认 deployment 为 'standalone'，避免在请求未完成时闪现 "Client" 标签。`src/ui/viewer/hooks/useRole.ts:27`
- 组件卸载时通过 `cancelled` 标志防止竞态更新。`src/ui/viewer/hooks/useRole.ts:48`

## 4. 对外暴露

| 导出名称 | 类型 | 说明 |
|---------|------|------|
| `RoleInfo` | interface | 角色信息结构（role、deployment、userLabel、ready） |
| `useRole` | `() => RoleInfo` | Hook 函数 |

**RoleInfo 结构**：
- `role: 'client' | 'server'` — 功能角色
- `deployment: 'client' | 'server' | 'standalone'` — 展示用部署模式
- `userLabel: string | null` — 同步身份标签
- `ready: boolean` — 请求是否完成

## 5. 依赖关系

- 上游：`authFetch`（`src/ui/viewer/utils/api.ts`）
- 下游：Header 组件（品牌显示）、SyncStatusBadge（server 模式隐藏）、用户选择器

## 8. 逆向备注

- `role` 和 `deployment` 是两个独立维度：role 控制 API 路由行为，deployment 控制 UI 品牌展示。注释明确说明了此设计。`src/ui/viewer/hooks/useRole.ts:17-20`
