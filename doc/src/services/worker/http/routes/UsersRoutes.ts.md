# UsersRoutes.ts 需求说明

> 源文件：src/services/worker/http/routes/UsersRoutes.ts | 类型：源码 | 行数：52 | 所属模块：worker/http/routes | 分析日期：2026-07-23

## 1. 文件定位总述

UsersRoutes 是 Server 模式专属的 HTTP 路由处理器，提供 `/api/users` 端点，用于聚合多用户会话统计数据。该路由仅在 `CLAUDE_MEM_NODE_ROLE=server` 时注册，Client 模式不暴露此端点。它为 Viewer UI 的"员工选择器"和"按用户活跃度"视图提供数据支撑。

## 2. 功能需求

| 编号 | 需求描述（系统应当…） | 触发条件 / 输入 | 处理规则与输出 | 证据 |
|------|----------------------|----------------|---------------|------|
| FR-Users-01 | 系统应当提供用户列表聚合查询接口 | HTTP GET `/api/users` | 从 `sdk_sessions` 表按 `user_label` 分组，聚合每个用户的会话数（`COUNT(*)`）和最近活跃时间（`MAX(started_at_epoch)`）。过滤掉 `user_label` 为 NULL 或空白的记录，按最近活跃时间降序、用户名升序排列。返回 `{ users: UserRow[] }` | `src/services/worker/http/routes/UsersRoutes.ts:32-50` |

## 3. 业务规则与约束

- **Server 模式专属**：路由类本身始终定义，但注册时机由 `worker-service.ts` 根据 `CLAUDE_MEM_NODE_ROLE=server` 条件控制。Client 模式下此端点不注册，访问将得到 404。`src/services/worker/http/routes/UsersRoutes.ts:23-26`
- **NULL/空白过滤**：查询 WHERE 子句排除 `user_label IS NOT NULL AND TRIM(user_label) <> ''`，确保不返回无效用户。`src/services/worker/http/routes/UsersRoutes.ts:43-44`
- **单身份假设**：注释说明 Client 模式只有单一 user_label，因此不需要此端点。`src/services/worker/http/routes/UsersRoutes.ts:17-19`

## 4. 对外暴露

| 名称 | 类型 | 说明 |
|------|------|------|
| `GET /api/users` | HTTP 端点 | 返回 `{ users: [{ user_label, sessions, last_active }] }` |

## 5. 依赖关系

- **BaseRouteHandler**（`../BaseRouteHandler.js`）：提供 `wrapHandler` 错误处理和路由注册基类
- **DatabaseManager**（`../../DatabaseManager.js`）：提供 SQLite 数据库连接（`getConnection()`）

## 6. 数据结构

**UserRow**（内部接口）：
```typescript
{
  user_label: string;
  sessions: number;       // COUNT(*) 聚合
  last_active: number | null; // MAX(started_at_epoch)
}
```

## 7. 复杂逻辑图示

不适用（单端点，逻辑简单）。

## 8. 逆向备注

- 代码注释标注为 `TODO T-19 / S-doc S11`，表明此功能与规划中的 Server 模式多用户视图相关，可能仍有后续迭代。
