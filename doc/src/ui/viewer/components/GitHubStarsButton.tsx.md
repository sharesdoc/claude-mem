# GitHubStarsButton.tsx 需求说明

> 源文件：src/ui/viewer/components/GitHubStarsButton.tsx ｜ 类型：源码 ｜ 行数：50 ｜ 所属模块：viewer/components ｜ 分析日期：2026-07-23

## 1. 文件定位总述

GitHubStarsButton 是一个展示 GitHub 仓库 Star 数量的链接按钮组件，用于 Viewer Header 区域。它通过 useGitHubStars Hook 获取指定仓库的 star 数，显示星标图标和格式化后的数量。加载失败时降级为仅显示 GitHub 图标的普通链接。

## 2. 功能需求

| 编号 | 需求描述（系统应当…） | 触发条件 / 输入 | 处理规则与输出 | 证据 |
|------|----------------------|----------------|---------------|------|
| FR-GHS-01 | 系统应当展示仓库的 star 数量 | useGitHubStars 返回 stars 数据 | 显示星标图标 + 格式化数字（如 "1.2k"） | `src/ui/viewer/components/GitHubStarsButton.tsx:45-47` |
| FR-GHS-02 | 系统应当在加载中显示省略号占位 | `isLoading === true` | 星标数字位置显示 "..." | `src/ui/viewer/components/GitHubStarsButton.tsx:46` |
| FR-GHS-03 | 系统应当在请求失败时降级为仅 GitHub 图标 | `error === true` | 只渲染 GitHub 标志图标链接，不带 star 数 | `src/ui/viewer/components/GitHubStarsButton.tsx:15-29` |
| FR-GHS-04 | 系统应当链接到正确的 GitHub 仓库页面 | 渲染链接 | href 为 `https://github.com/{username}/{repo}`，新窗口打开 | `src/ui/viewer/components/GitHubStarsButton.tsx:13, 33-34` |

## 3. 业务规则与约束

- 链接始终使用 `target="_blank"` 和 `rel="noopener noreferrer"` 安全属性。`src/ui/viewer/components/GitHubStarsButton.tsx:34`
- star 数格式化由 `formatStarCount` 工具函数处理（位于 `../utils/formatNumber`）。

## 4. 对外暴露

**Props 接口**：
| 属性 | 类型 | 说明 |
|------|------|------|
| `username` | `string` | GitHub 用户名/组织名 |
| `repo` | `string` | 仓库名 |
| `className` | `string`（可选） | 附加 CSS 类名，默认空字符串 |

## 5. 依赖关系

- 上游：`useGitHubStars` Hook（获取 star 数）、`formatStarCount` 工具函数
- 下游：Header 组件

## 8. 逆向备注

- GitHub 图标 SVG（Octocat）直接内联在组件中，共出现两次（正常状态和错误降级状态），代码有重复。`src/ui/viewer/components/GitHubStarsButton.tsx:25, 39`
