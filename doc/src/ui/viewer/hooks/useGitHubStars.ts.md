# useGitHubStars.ts 需求说明

> 源文件：src/ui/viewer/hooks/useGitHubStars.ts ｜ 类型：源码（React Hook） ｜ 行数：45 ｜ 所属模块：ui/viewer ｜ 分析日期：2026-07-23

## 1. 文件定位总述

本文件实现一个 React Hook，用于从 GitHub 公开 API 获取指定仓库的 star 数量。Hook 管理 loading、error 和数据三种状态，在组件挂载时自动请求 GitHub API（`https://api.github.com/repos/<user>/<repo>`），返回 stargazers_count。该数据用于 Viewer UI 中展示项目的社区关注度。

## 2. 功能需求

| 编号 | 需求描述（系统应当…） | 触发条件 / 输入 | 处理规则与输出 | 证据 |
|------|----------------------|----------------|---------------|------|
| FR-GH-01 | 系统应当在组件挂载时自动请求 GitHub API 获取 star 数 | 组件首次渲染 | fetch(`https://api.github.com/repos/${username}/${repo}`) | `src/ui/viewer/hooks/useGitHubStars.ts:23` |
| FR-GH-02 | 系统应当管理三种状态：stars(number|null)、isLoading(boolean)、error(Error|null) | 请求生命周期 | 初始 isLoading=true, stars=null, error=null；请求中重置；成功后更新 | `src/ui/viewer/hooks/useGitHubStars.ts:16-17` |
| FR-GH-03 | 系统应当在 GitHub API 返回非 2xx 时抛出包含状态码的错误 | response.ok === false | throw new Error(`GitHub API error: ${response.status}`) | `src/ui/viewer/hooks/useGitHubStars.ts:25-27` |
| FR-GH-04 | 系统应当在请求失败时记录 console.error 并设置 error 状态 | 请求异常或非 2xx | console.error + setError(error) | `src/ui/viewer/hooks/useGitHubStars.ts:32-33` |

## 3. 业务规则与约束

| 编号 | 规则描述 | 证据 |
|------|---------|------|
| BR-GH-01 | GitHub API 无认证（无 token），受 GitHub 未认证速率限制（60 次/小时） | `src/ui/viewer/hooks/useGitHubStars.ts:23`（直接使用 fetch 而非 authFetch） |

## 4. 对外暴露

| 导出项 | 类型 | 用途 |
|--------|------|------|
| `useGitHubStars` | React Hook | 返回 { stars: number \| null, isLoading: boolean, error: Error \| null } |
| `GitHubStarsData` | interface | API 响应类型：{ stargazers_count: number } |
| `UseGitHubStarsReturn` | interface | Hook 返回值类型 |

## 5. 依赖关系

- **外部依赖**：react
- **被依赖**：Viewer Header 组件中展示 GitHub star 数

## 6. 数据结构

**GitHubStarsData**: `{ stargazers_count: number }`

**UseGitHubStarsReturn**: `{ stars: number | null, isLoading: boolean, error: Error | null }`

## 7. 复杂逻辑图示

不适用（简单的数据获取 Hook）。

## 8. 逆向备注

- fetchStars 使用 useCallback 但未列出 username 和 repo 在依赖数组中（实际上它们通过闭包捕获），推断因为 username/repo 通常为常量不会变化。
- 未实现错误重试机制，GitHub API 请求失败后 stars 保持 null，UI 可能显示 fallback 内容。
- 未使用 authFetch 而是直接使用 fetch，确认 GitHub API 调用不需要 admin token。
