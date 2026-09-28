# project.ts 需求说明

> 源文件：src/core/schemas/project.ts ｜ 类型：源码 ｜ 行数：27 ｜ 所属模块：core/schemas ｜ 分析日期：2026-07-23

## 1. 文件定位总述

本文件定义了 `Project`（项目）实体的 Zod Schema 及其创建专用的 `CreateProject` Schema。Project 是 claude-mem 数据模型中的顶层聚合根之一，代表用户在一个工作目录下开展的 AI 编程项目。文件同时导出了只读类型供服务层和 API 层使用。

## 2. 功能需求

| 编号 | 需求描述（系统应当…） | 触发条件 / 输入 | 处理规则与输出 | 证据 |
|------|----------------------|----------------|---------------|------|
| FR-PROJ-01 | 系统应当定义 Project 完整 Schema，包含 id、name、slug、rootPath、metadata、createdAtEpoch、updatedAtEpoch | 创建/校验 Project 对象 | id 和 name 必填非空；slug、rootPath、metadata 可选有默认值；时间戳必填非负整数 | `project.ts:5-13` |
| FR-PROJ-02 | 系统应当定义 CreateProject Schema，自动排除系统生成字段（id、createdAtEpoch、updatedAtEpoch），并将 slug、rootPath、metadata 设为可选 | 创建新项目时校验输入 | 仅需传入 name（必填），其余字段可选 | `project.ts:15-23` |
| FR-PROJ-03 | 系统应当推导 Project 和 CreateProject 两个 TypeScript 类型 | 外部模块导入 | 从各自 Schema 推导类型 | `project.ts:25-26` |

## 3. 业务规则与约束

- `id` 由系统生成，创建时不可传入。`project.ts:16`
- `createdAtEpoch` 和 `updatedAtEpoch` 由系统生成，创建时不可传入。`project.ts:17-18`
- `slug` 可选，用于生成 URL 友好的项目标识符。`project.ts:8`
- `rootPath` 可选，记录项目在文件系统中的根路径。`project.ts:9`
- `metadata` 为自由键值对，默认空对象，可用于存储扩展属性。`project.ts:10`

## 4. 对外暴露

| 导出名 | 类型 | 说明 |
|--------|------|------|
| `ProjectSchema` | `z.ZodObject` | Project 完整校验 Schema |
| `CreateProjectSchema` | `z.ZodObject` | 创建项目时的输入校验 Schema |
| `Project` | TypeScript type | 从 ProjectSchema 推导 |
| `CreateProject` | TypeScript type | 从 CreateProjectSchema 推导 |

共 4 个公开导出。

## 5. 依赖关系

- 外部依赖：`zod`

## 6. 数据结构

```
Project {
  id: string              // 必填，系统生成
  name: string            // 必填，项目名称
  slug: string | null     // 可选，默认 null
  rootPath: string | null // 可选，默认 null
  metadata: Record<string, unknown>  // 可选，默认 {}
  createdAtEpoch: number  // 必填，创建时间戳
  updatedAtEpoch: number  // 必填，更新时间戳
}

CreateProject {
  name: string            // 必填
  slug?: string           // 可选
  rootPath?: string       // 可选
  metadata?: Record<string, unknown> // 可选
}
```

## 7. 复杂逻辑图示

不适用——纯 Schema 定义文件。

## 8. 逆向备注

无。
