# Feed.tsx 需求说明

> 源文件：src/ui/viewer/components/Feed.tsx ｜ 类型：源码 ｜ 行数：124 ｜ 所属模块：viewer/components ｜ 分析日期：2026-07-23

## 1. 文件定位总述

Feed 是 Viewer 的核心内容流组件，负责合并三种数据类型（Observation、Summary、UserPrompt）为统一时间线，并通过 IntersectionObserver 实现无限滚动加载。它是所有卡片组件的容器，管理加载状态、空状态、错误重试和"已加载全部"提示。

## 2. 功能需求

| 编号 | 需求描述（系统应当…） | 触发条件 / 输入 | 处理规则与输出 | 证据 |
|------|----------------------|----------------|---------------|------|
| FR-Feed-01 | 系统应当将三种数据类型合并为按时间降序排列的统一列表 | 传入 observations/summaries/prompts 数组 | 合并后按 `created_at_epoch` 降序排序 | `src/ui/viewer/components/Feed.tsx:70-78` |
| FR-Feed-02 | 系统应当通过 IntersectionObserver 自动触发加载更多 | 哨兵元素进入视口（交叉比 >= 0.1）且有更多数据且非加载中 | 调用 onLoadMore 回调 | `src/ui/viewer/components/Feed.tsx:50-58` |
| FR-Feed-03 | 系统应当根据 itemType 渲染对应的卡片组件 | 遍历 items | observation→ObservationCard, summary→SummaryCard, prompt→PromptCard | `src/ui/viewer/components/Feed.tsx:86-92` |
| FR-Feed-04 | 系统应当在列表为空且有错误时显示重试按钮 | items.length === 0 且 error 且 onRetry | 渲染"加载失败"提示和"重试"按钮 | `src/ui/viewer/components/Feed.tsx:94-100` |
| FR-Feed-05 | 系统应当在列表为空无错误时显示空状态提示 | items.length === 0 且无 error 且无 isLoading | 显示 "No items to display" | `src/ui/viewer/components/Feed.tsx:102-106` |
| FR-Feed-06 | 系统应当显示加载中的 spinner | isLoading === true | 渲染 spinner 和 "Loading more..." 文本 | `src/ui/viewer/components/Feed.tsx:107-112` |
| FR-Feed-07 | 系统应当在有更多数据时放置滚动触发哨兵 | hasMore && !isLoading && items.length > 0 | 渲染一个 20px 高的 div 作为 IntersectionObserver 目标 | `src/ui/viewer/components/Feed.tsx:113-115` |
| FR-Feed-08 | 系统应当在没有更多数据时显示结束提示 | !hasMore && items.length > 0 | 显示 "No more items to load" | `src/ui/viewer/components/Feed.tsx:116-120` |

## 3. 业务规则与约束

- LOAD_MORE_THRESHOLD 为 0.1（来自 UI 常量），表示哨兵元素只需 10% 可见即触发加载。`src/ui/viewer/components/Feed.tsx:57`
- 卡片 React key 格式为 `{itemType}-{id}`，确保跨类型不冲突。`src/ui/viewer/components/Feed.tsx:85`
- onLoadMore 通过 ref 传递到 useEffect 中，避免闭包过期。`src/ui/viewer/components/Feed.tsx:40-44`
- 重试按钮使用内联样式（非 CSS 类），带有 CSS 变量 fallback。`src/ui/viewer/components/Feed.tsx:12-20`

## 4. 对外暴露

**Props 接口**：
| 属性 | 类型 | 说明 |
|------|------|------|
| `observations` | `Observation[]` | 观察列表 |
| `summaries` | `Summary[]` | 总结列表 |
| `prompts` | `UserPrompt[]` | 提示词列表 |
| `onLoadMore` | `() => void` | 加载更多回调 |
| `onPromptDeleted` | `(id: number) => void`（可选） | 提示词删除回调 |
| `isLoading` | `boolean` | 加载状态 |
| `hasMore` | `boolean` | 是否有更多数据 |
| `error` | `Error \| null`（可选） | 加载错误 |
| `onRetry` | `() => void`（可选） | 手动重试回调 |

## 5. 依赖关系

- 上游：App 根组件（提供数据数组和分页状态）
- 下游：ObservationCard、SummaryCard、PromptCard、ScrollToTop 组件

## 8. 逆向备注

- 注释标注 X-003 表示首次加载失败的重试机制。`src/ui/viewer/components/Feed.tsx:11`
- 错误重试按钮使用 `retryButtonStyle` 内联样式而非 CSS 类，可能是为了在错误状态下仍能正常渲染（即使 CSS 加载失败）。`src/ui/viewer/components/Feed.tsx:12-20`
