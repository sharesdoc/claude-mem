# types.ts 需求说明

> 源文件：src/ui/viewer/types.ts ｜ 类型：源码 ｜ 行数：253 ｜ 所属模块：viewer/types ｜ 分析日期：2026-07-23

## 1. 文件定位总述

types.ts 是 Viewer 前端的统一类型定义文件，声明了所有与后端 API 交互的数据结构。它涵盖核心业务实体（Observation、Summary、UserPrompt）、流式事件（StreamEvent）、项目目录（ProjectCatalog）、配置（Settings）、统计（Stats、AnalyticsResponse）、报告（WeeklyReportItem、DailyReportOverview 等）。该文件是前后端数据契约的核心参考。

## 2. 功能需求

此文件为纯类型定义文件，不承载功能需求，以总述代替表格。

types.ts 为 Viewer 前端定义了所有数据实体接口，确保与后端 API 返回的数据结构保持一致。核心实体包括 Observation（观察记录，含 JSON 字符串化的 facts/concepts/files_read/files_modified）、Summary（会话总结，含四个可选章节）、UserPrompt（用户输入，含处理时间展示字段）。联合类型 FeedItem 通过 `itemType` 标签字段区分三种卡片类型，供 Feed 组件的排序和路由渲染使用。统计相关类型（AnalyticsResponse、AnalyticsPoint、ReportStats 等）支撑 Analytics 面板的所有图表和表格数据。

## 6. 数据结构

### 核心业务实体

**Observation** — 观察记录（`src/ui/viewer/types.ts:2-25`）
- `id: number` — 主键
- `memory_session_id: string` — 会话 ID
- `project: string` — 项目标识
- `merged_into_project?: string | null` — 合并目标项目
- `platform_source: string` — 平台来源（claude/codex）
- `type: string` — 观察类型
- `title / subtitle / narrative / text: string | null` — 内容字段
- `facts / concepts / files_read / files_modified: string | null` — JSON 字符串化数据
- `user_name?: string | null` — OS 用户名
- `user_label?: string | null` — 同步身份标签（T-20）
- `created_at_epoch: number` — 创建时间戳
- `content_hash?: string | null` — 去重哈希

**Summary** — 会话总结（`src/ui/viewer/types.ts:27-41`）
- `investigated / learned / completed / next_steps?: string` — 四个可选章节
- `request?: string` — 会话请求标题
- 其余字段与 Observation 类似

**UserPrompt** — 用户输入提示词（`src/ui/viewer/types.ts:43-59`）
- `prompt_text: string` — 提示词全文
- `prompt_number: number` — 提示词序号
- `completed_at_epoch?: number | null` — 完成时间
- `think_time_ms?: number` — 思考时间
- `processing_time_display?: string | null` — 预计算的展示字符串（null/"A15s"/"H3m + A15s"/"cancelled"）

**FeedItem** — 联合类型（`src/ui/viewer/types.ts:61-64`）
- `Observation & { itemType: 'observation' }` | `Summary & { itemType: 'summary' }` | `UserPrompt & { itemType: 'prompt' }`

### 流式事件

**StreamEvent**（`src/ui/viewer/types.ts:66-86`）
- 事件类型：`initial_load | new_observation | new_summary | new_prompt | processing_status | projects_deleted | prompt_deleted`
- 各类型携带对应的单条或批量数据

### 统计与分析

**AnalyticsResponse**（`src/ui/viewer/types.ts:154-198`）— 统计数据总览
- 包含用户维度的 promptsByUserByDay、observationsByUserByDay、summariesByUserByDay
- 项目维度的 promptsByProject、projectProcessingTime、projectEditor
- 用户汇总的 userProcessingTime、userProjectMeta、userSummaryCounts
- 时间维度的 dailyProcessingTimeByUser、chartBuckets
- 历史维度的 historyMonths（最多36个月）、historyWeeks（最近26周）
- 图表粒度：`'hour' | 'day' | 'week'`

### 报告

**WeeklyReportItem**（`src/ui/viewer/types.ts:206-213`）— 周报列表项
- `complete?: boolean` — 该周已结束后生成，锁定不再重生成

**DailyReportOverview**（`src/ui/viewer/types.ts:230-240`）— 日报状态总览
- `today / yesterday: string` — 服务端本地日期

### 配置

**Settings**（`src/ui/viewer/types.ts:94-121`）— 全部字段为 string 类型，多数可选

### 其他

**ProjectCatalog**（`src/ui/viewer/types.ts:88-92`）— 项目目录，含 projectsBySource 按来源分组
**Stats**（`src/ui/viewer/types.ts:138-141`）— WorkerStats + DatabaseStats
**WorkerStats / DatabaseStats**（`src/ui/viewer/types.ts:123-136`）— Worker 和数据库统计

## 5. 依赖关系

- 上游：后端 API 响应结构
- 下游：所有 Viewer 组件和 Hooks（通过 import 引用类型）

## 8. 逆向备注

- 所有字段类型均为 string（包括 Settings 中的数值配置如 WORKER_PORT），与后端 JSON 序列化保持一致，前端不做类型转换。`src/ui/viewer/types.ts:94-121`
- `content_hash` 字段在三个核心实体中均为可选，注释标明用于"跨本地+同步源的去重"（dedup across local + sync sources）。`src/ui/viewer/types.ts:24, 41, 58`
- `AnalyticsResponse` 中多处注释使用中文（如"各项目用户输入提示词总数"、"每用户 AI 处理请求的总时间"），表明代码由中文开发者维护。`src/ui/viewer/types.ts:158-177`
