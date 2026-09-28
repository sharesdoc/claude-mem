# useContextPreview.ts 需求说明

> 源文件：src/ui/viewer/hooks/useContextPreview.ts ｜ 类型：源码 ｜ 行数：138 ｜ 所属模块：viewer/hooks ｜ 分析日期：2026-07-23

## 1. 文件定位总述

useContextPreview 是设置面板的上下文预览管理 Hook，负责获取项目列表、管理项目和来源选择器状态，并在选择变化后自动拉取上下文预览内容。它以 300ms 防抖机制在 settings 变更后刷新预览，为用户实时展示记忆注入效果。

## 2. 功能需求

| 编号 | 需求描述（系统应当…） | 触发条件 / 输入 | 处理规则与输出 | 证据 |
|------|----------------------|----------------|---------------|------|
| FR-UCP-01 | 系统应当在组件挂载时获取项目目录 | 组件 mount | 调用 `authFetch('/api/projects')`，返回 ProjectCatalog | `src/ui/viewer/hooks/useContextPreview.ts:39-71` |
| FR-UCP-02 | 系统应当将默认来源列表与后端返回的来源合并 | 获取到 sources 后 | 合并 ['claude', 'codex'] 与后端 sources，去重 | `src/ui/viewer/hooks/useContextPreview.ts:24-27` |
| FR-UCP-03 | 系统应当自动选择首选来源 | 获取到项目目录后 | 优先选 'claude'，其次 'codex'，最后取第一个可用来源 | `src/ui/viewer/hooks/useContextPreview.ts:18-22, 57` |
| FR-UCP-04 | 系统应当根据选中的来源筛选项目列表 | selectedSource 变化 | 从 projectsBySource[selectedSource] 获取对应项目列表 | `src/ui/viewer/hooks/useContextPreview.ts:73-83` |
| FR-UCP-05 | 系统应当在 settings 变更后以 300ms 防抖刷新预览 | settings 引用变化 | setTimeout 300ms 后调用 refresh() | `src/ui/viewer/hooks/useContextPreview.ts:119-124` |
| FR-UCP-06 | 系统应当根据选中的项目和来源拉取上下文预览 | refresh 被调用 | 请求 `/api/context/preview?project=...&platformSource=...` | `src/ui/viewer/hooks/useContextPreview.ts:93-114` |
| FR-UCP-07 | 系统应当在切换来源时保持项目选择有效 | selectedSource 变化 | 若当前选中项目不在新来源的项目列表中，自动选中第一个项目 | `src/ui/viewer/hooks/useContextPreview.ts:76, 82` |

## 3. 业务规则与约束

- 无来源选中时（selectedSource 为 null），显示全量项目列表。`src/ui/viewer/hooks/useContextPreview.ts:74-78`
- 无项目选中时，preview 显示 "No project selected" 而非发起请求。`src/ui/viewer/hooks/useContextPreview.ts:86-89`
- 防抖仅响应 settings 引用变化，不响应 selectedProject 或 selectedSource 变化。`src/ui/viewer/hooks/useContextPreview.ts:124`

## 4. 对外暴露

| 导出名称 | 类型 | 说明 |
|---------|------|------|
| `useContextPreview` | `(settings: Settings) => UseContextPreviewResult` | Hook 函数 |

**UseContextPreviewResult 结构**：
- `preview: string` — 预览文本内容
- `isLoading: boolean` — 加载状态
- `error: string | null` — 错误信息
- `refresh: () => Promise<void>` — 手动刷新
- `projects: string[]` — 当前来源下的项目列表
- `sources: string[]` — 可用来源列表
- `selectedSource: string | null` — 当前选中的来源
- `setSelectedSource: (source: string) => void` — 设置来源
- `selectedProject: string | null` — 当前选中的项目
- `setSelectedProject: (project: string) => void` — 设置项目

## 5. 依赖关系

- 上游：`authFetch`（API 请求）、`Settings` 类型
- 下游：Settings 面板的 ContextPreview 子组件

## 8. 逆向备注

- `withDefaultSources` 函数硬编码 'claude' 和 'codex' 为默认来源，确保即使后端未返回这些来源时选择器也显示它们。`src/ui/viewer/hooks/useContextPreview.ts:24-27`
