# auth.ts 需求说明

> 源文件：src/core/schemas/auth.ts ｜ 类型：源码 ｜ 行数：70 ｜ 所属模块：core/schemas ｜ 分析日期：2026-07-23

## 1. 文件定位总述

本文件定义了 `ApiKey`（API 密钥）和 `AuditLog`（审计日志）两个安全相关实体的 Zod Schema 及其创建专用 Schema。ApiKey 支持多团队/多项目范围限定、权限作用域（scopes）、有效期控制及吊销状态管理。AuditLog 记录系统操作的审计轨迹，支持区分 user、api_key、system 三种操作者类型。二者共同构成了 claude-mem 的安全与可追溯性基础设施。

## 2. 功能需求

| 编号 | 需求描述（系统应当…） | 触发条件 / 输入 | 处理规则与输出 | 证据 |
|------|----------------------|----------------|---------------|------|
| FR-AUTH-01 | 系统应当定义 ApiKeyStatus 枚举 Schema，限定密钥状态为 active、revoked | API 密钥状态管理 | 仅接受两种枚举值 | `auth.ts:5` |
| FR-AUTH-02 | 系统应当定义 AuditActorType 枚举 Schema，限定操作者类型为 user、api_key、system | 审计日志记录 | 仅接受三种枚举值 | `auth.ts:6` |
| FR-AUTH-03 | 系统应当定义 ApiKey 完整 Schema，包含 id、teamId、projectId、name、keyHash、prefix、scopes、status、lastUsedAtEpoch、expiresAtEpoch、metadata、createdAtEpoch、updatedAtEpoch | 创建/校验 ApiKey 对象 | id、name、keyHash 必填；teamId、projectId、prefix、scopes、status 可选有默认值；时间戳必填 | `auth.ts:8-22` |
| FR-AUTH-04 | 系统应当定义 CreateApiKey Schema，排除系统字段（id、status、lastUsedAtEpoch、createdAtEpoch、updatedAtEpoch），并将 teamId、projectId、prefix、scopes、expiresAtEpoch、metadata 设为可选 | 创建新密钥时校验输入 | 必填字段仅为 name、keyHash | `auth.ts:24-37` |
| FR-AUTH-05 | 系统应当定义 AuditLog 完整 Schema，包含 id、teamId、projectId、actorType、actorId、action、targetType、targetId、metadata、createdAtEpoch | 记录审计日志 | id、actorType、action 必填；其余可选有默认值 | `auth.ts:39-50` |
| FR-AUTH-06 | 系统应当定义 CreateAuditLog Schema，排除 id 和 createdAtEpoch，并将 teamId、projectId、actorId、targetType、targetId、metadata 设为可选 | 创建审计日志时校验输入 | 必填字段为 actorType、action | `auth.ts:52-62` |
| FR-AUTH-07 | 系统应当推导 ApiKeyStatus、ApiKey、CreateApiKey、AuditActorType、AuditLog、CreateAuditLog 六个 TypeScript 类型 | 外部模块导入 | 从各自 Schema 推导 | `auth.ts:64-69` |

## 3. 业务规则与约束

- API 密钥状态为双态：`active`（有效）和 `revoked`（已吊销），默认 active。`auth.ts:5,16`
- API 密钥必须存储哈希值（keyHash），而非明文密钥。`auth.ts:13`
- 密钥前缀（prefix）可选，用于在 UI 展示时标识密钥（如 `sk_live_...`）。`auth.ts:14`
- `scopes` 为字符串数组，定义密钥的权限范围，默认空数组。`auth.ts:15`
- 密钥支持过期时间（expiresAtEpoch），默认 null 表示永不过期。`auth.ts:18`
- 审计日志的操作者类型区分三类：`user`（终端用户）、`api_key`（API 密钥调用者）、`system`（系统自动操作）。`auth.ts:6`
- 审计日志的 action 字段为必填自由字符串，用于标识具体操作名称。`auth.ts:45`

## 4. 对外暴露

| 导出名 | 类型 | 说明 |
|--------|------|------|
| `ApiKeyStatusSchema` | `z.ZodEnum` | 密钥状态枚举 |
| `AuditActorTypeSchema` | `z.ZodEnum` | 审计操作者类型枚举 |
| `ApiKeySchema` | `z.ZodObject` | ApiKey 完整校验 Schema |
| `CreateApiKeySchema` | `z.ZodObject` | 创建密钥时输入 Schema |
| `AuditLogSchema` | `z.ZodObject` | AuditLog 完整校验 Schema |
| `CreateAuditLogSchema` | `z.ZodObject` | 创建审计日志时输入 Schema |
| `ApiKeyStatus` | TypeScript type | 密钥状态类型 |
| `ApiKey` | TypeScript type | 从 ApiKeySchema 推导 |
| `CreateApiKey` | TypeScript type | 从 CreateApiKeySchema 推导 |
| `AuditActorType` | TypeScript type | 审计操作者类型 |
| `AuditLog` | TypeScript type | 从 AuditLogSchema 推导 |
| `CreateAuditLog` | TypeScript type | 从 CreateAuditLogSchema 推导 |

共 12 个公开导出。

## 5. 依赖关系

- 外部依赖：`zod`

## 6. 数据结构

```
ApiKey {
  id: string              // 必填，系统生成
  teamId: string | null   // 可选，默认 null（团队范围）
  projectId: string | null // 可选，默认 null（项目范围）
  name: string            // 必填，密钥名称
  keyHash: string         // 必填，密钥哈希
  prefix: string | null   // 可选，默认 null
  scopes: string[]        // 可选，默认 []
  status: "active" | "revoked"  // 默认 "active"
  lastUsedAtEpoch: number | null // 可选，默认 null
  expiresAtEpoch: number | null // 可选，默认 null（永不过期）
  metadata: Record<string, unknown>  // 可选，默认 {}
  createdAtEpoch: number  // 必填
  updatedAtEpoch: number  // 必填
}

AuditLog {
  id: string              // 必填，系统生成
  teamId: string | null   // 可选，默认 null
  projectId: string | null // 可选，默认 null
  actorType: "user" | "api_key" | "system"  // 必填
  actorId: string | null  // 可选，默认 null
  action: string          // 必填
  targetType: string | null // 可选，默认 null
  targetId: string | null // 可选，默认 null
  metadata: Record<string, unknown>  // 可选，默认 {}
  createdAtEpoch: number  // 必填
}
```

## 7. 复杂逻辑图示

不适用——纯 Schema 定义文件。

## 8. 逆向备注

无。
