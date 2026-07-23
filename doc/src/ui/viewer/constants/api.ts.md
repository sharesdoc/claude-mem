# api.ts 需求说明

> 源文件：src/ui/viewer/constants/api.ts ｜ 类型：源码（常量） ｜ 行数：12 ｜ 所属模块：ui/viewer ｜ 分析日期：2026-07-23

## 1. 文件定位总述

本文件集中定义 Viewer 前端调用的所有后端 API 端点路径。这些端点指向本地 Worker 服务的 HTTP 路由，涵盖观察记录、摘要、提示、设置、统计、处理状态、项目管理和 SSE 流等 9 个资源路径。作为前端与后端通信的契约层，确保 API 路径在代码中只定义一次。

## 2. 功能需求

本文件以常量总述代替功能表格。系统应当通过 `API_ENDPOINTS` 常量对象集中管理全部 API 路径，包括 8 个 REST 端点和 1 个 SSE 流端点，使用 `as const` 确保类型收窄。各端点的请求方法、认证方式由调用方决定，本文件仅负责路径定义。

## 3. 业务规则与约束

无特殊约束。

## 4. 对外暴露

| 导出项 | 类型 | 用途 |
|--------|------|------|
| `API_ENDPOINTS` | const object | 全部 API 端点路径的只读对象 |

### API_ENDPOINTS 详情

| 常量名 | 路径 | 业务含义 |
|--------|------|---------|
| OBSERVATIONS | `/api/observations` | 观察记录 API |
| SUMMARIES | `/api/summaries` | 会话摘要 API |
| PROMPTS | `/api/prompts` | 用户提示 API |
| SETTINGS | `/api/settings` | 设置管理 API |
| STATS | `/api/stats` | 统计数据 API |
| PROCESSING_STATUS | `/api/processing-status` | 处理状态 API |
| PROJECTS_DELETE | `/api/projects/delete` | 项目删除 API |
| PROJECTS_STATS | `/api/projects/stats` | 项目统计 API |
| STREAM | `/stream` | SSE 实时流 |

## 5. 依赖关系

- **被依赖**：Viewer 前端各 Hook（useStats、useUsers 等）和组件通过 authFetch 调用这些端点

## 6. 数据结构

不适用。

## 7. 复杂逻辑图示

不适用。

## 8. 逆向备注

- STREAM 端点 `/stream` 是唯一不带 `/api` 前缀的端点，推断它使用 SSE（Server-Sent Events）协议，与其他 REST API 风格不同。
- PROJECTS_DELETE 使用子路径 `/api/projects/delete` 而非 RESTful 的 `/api/projects` + DELETE 方法，推断是为了通过路由路径区分读操作和删除操作。
