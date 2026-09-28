# team.ts 需求说明

> 源文件：src/core/schemas/team.ts ｜ 类型：源码 ｜ 行数：46 ｜ 所属模块：core/schemas ｜ 分析日期：2026-07-23

## 1. 文件定位总述

本文件定义了 `Team`（团队）和 `TeamMember`（团队成员）两个实体的 Zod Schema 及其创建专用 Schema。Team 是 claude-mem 多租户/团队协作功能的核心模型，支持 owner、admin、member、viewer 四种角色。该文件同时包含团队角色枚举定义，是 Auth 和权限体系的基础依赖。

## 2. 功能需求

| 编号 | 需求描述（系统应当…） | 触发条件 / 输入 | 处理规则与输出 | 证据 |
|------|----------------------|----------------|---------------|------|
| FR-TEAM-01 | 系统应当定义 TeamRole 枚举 Schema，限定角色为 owner、admin、member、viewer 四种 | 创建团队/成员时校验角色 | 仅接受四种枚举值 | `team.ts:5` |
| FR-TEAM-02 | 系统应当定义 Team 完整 Schema，包含 id、name、slug、metadata、createdAtEpoch、updatedAtEpoch | 创建/校验 Team 对象 | id、name 必填；slug、metadata 可选有默认值；时间戳必填 | `team.ts:7-14` |
| FR-TEAM-03 | 系统应当定义 CreateTeam Schema，排除系统字段（id、createdAtEpoch、updatedAtEpoch），将 slug、metadata 设为可选 | 创建新团队时校验输入 | 仅需传入 name（必填） | `team.ts:16-23` |
| FR-TEAM-04 | 系统应当定义 TeamMember 完整 Schema，包含 id、teamId、userId、role、metadata、createdAtEpoch | 创建/校验团队成员 | id、teamId、userId、role 必填；metadata 可选 | `team.ts:25-32` |
| FR-TEAM-05 | 系统应当定义 CreateTeamMember Schema，排除 id 和 createdAtEpoch，将 metadata 设为可选 | 添加团队成员时校验输入 | 必填字段为 teamId、userId、role | `team.ts:34-39` |
| FR-TEAM-06 | 系统应当推导 TeamRole、Team、CreateTeam、TeamMember、CreateTeamMember 五个 TypeScript 类型 | 外部模块导入 | 从各自 Schema 推导 | `team.ts:41-45` |

## 3. 业务规则与约束

- 角色体系为四级：`owner > admin > member > viewer`。`team.ts:5`
- 团队成员必须关联一个团队（teamId）和一个用户（userId）。`team.ts:27-28`
- 团队和成员的时间戳字段均由系统自动生成。`team.ts:12-13, 31`
- `metadata` 为自由键值对，支持存储扩展属性。`team.ts:11, 30`

## 4. 对外暴露

| 导出名 | 类型 | 说明 |
|--------|------|------|
| `TeamRoleSchema` | `z.ZodEnum` | 团队角色枚举 Schema |
| `TeamSchema` | `z.ZodObject` | Team 完整校验 Schema |
| `CreateTeamSchema` | `z.ZodObject` | 创建团队时输入 Schema |
| `TeamMemberSchema` | `z.ZodObject` | TeamMember 完整校验 Schema |
| `CreateTeamMemberSchema` | `z.ZodObject` | 添加成员时输入 Schema |
| `TeamRole` | TypeScript type | 角色枚举类型 |
| `Team` | TypeScript type | 从 TeamSchema 推导 |
| `CreateTeam` | TypeScript type | 从 CreateTeamSchema 推导 |
| `TeamMember` | TypeScript type | 从 TeamMemberSchema 推导 |
| `CreateTeamMember` | TypeScript type | 从 CreateTeamMemberSchema 推导 |

共 10 个公开导出。

## 5. 依赖关系

- 外部依赖：`zod`

## 6. 数据结构

```
Team {
  id: string              // 必填，系统生成
  name: string            // 必填，团队名称
  slug: string | null     // 可选，默认 null
  metadata: Record<string, unknown>  // 可选，默认 {}
  createdAtEpoch: number  // 必填
  updatedAtEpoch: number  // 必填
}

TeamMember {
  id: string              // 必填，系统生成
  teamId: string          // 必填，所属团队
  userId: string          // 必填，用户 ID
  role: "owner" | "admin" | "member" | "viewer"  // 必填
  metadata: Record<string, unknown>  // 可选，默认 {}
  createdAtEpoch: number  // 必填
}

CreateTeam {
  name: string            // 必填
  slug?: string
  metadata?: Record<string, unknown>
}

CreateTeamMember {
  teamId: string          // 必填
  userId: string          // 必填
  role: TeamRole          // 必填
  metadata?: Record<string, unknown>
}
```

## 7. 复杂逻辑图示

不适用——纯 Schema 定义文件。

## 8. 逆向备注

无。
