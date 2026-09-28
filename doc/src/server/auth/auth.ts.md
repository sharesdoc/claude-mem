# auth.ts 需求说明

> 源文件：src/server/auth/auth.ts ｜ 类型：源码 ｜ 行数：25 ｜ 所属模块：server/auth ｜ 分析日期：2026-07-23

## 1. 文件定位总述

auth.ts 是 Server Beta 的 Better Auth 认证实例工厂，负责创建和配置基于 Better Auth 框架的认证系统。它使用 bun:sqlite 作为数据库后端，挂载 API Key 插件和 Organization（含 teams）插件，为 Server Beta 提供用户认证、API 密钥管理和团队/组织层面的多租户能力。

## 2. 功能需求

| 编号 | 需求描述（系统应当…） | 触发条件 / 输入 | 处理规则与输出 | 证据 |
|------|----------------------|----------------|---------------|------|
| FR-BAUTH-01 | 系统应当能创建一个 Better Auth 实例，配置 bun:sqlite 数据库、baseURL 和 basePath | 调用 `createAuth(database: Database)` | 返回配置好的 Better Auth 实例，basePath 为 `/api/auth` | `auth.ts:9-24` |
| FR-BAUTH-02 | 系统应当在认证实例中启用 API Key 插件，支持基于密钥的认证方式 | 创建 Better Auth 实例时 | 插件列表中包含 `apiKey()` | `auth.ts:16` |
| FR-BAUTH-03 | 系统应当在认证实例中启用 Organization 插件并开启 teams 功能，支持多团队组织管理 | 创建 Better Auth 实例时 | 插件列表中包含 `organization({ teams: { enabled: true } })` | `auth.ts:17-20` |

## 3. 业务规则与约束

1. **baseURL 优先级**：环境变量 `BETTER_AUTH_URL` > `CLAUDE_MEM_SERVER_URL` > 默认值 `http://127.0.0.1:37777`（`auth.ts:13`）
2. **basePath 固定为 `/api/auth`**：所有 Better Auth 的认证端点都挂载在此路径下（`auth.ts:14`）
3. **数据目录保障**：创建 auth 前先调用 `ensureDir(DATA_DIR)` 确保数据目录存在（`auth.ts:10`）

## 4. 对外暴露

| 导出项 | 类型 | 说明 |
|--------|------|------|
| `createAuth` | function | 接受 Database 参数，返回 Better Auth 实例 |

## 5. 依赖关系

- **上游**：`better-auth`（核心框架）、`@better-auth/api-key`（API Key 插件）、`better-auth/plugins`（Organization 插件）、`../../shared/paths.js`（DATA_DIR）
- **下游**：被 `BetterAuthRoutes.ts` 消费，创建 handler 注册到 Express 路由

## 6. 数据结构

不适用。

## 7. 复杂逻辑图示

不适用。

## 8. 逆向备注

无特殊备注。
