# SummaryCard.tsx 需求说明

> 源文件：src/ui/viewer/components/SummaryCard.tsx ｜ 类型：源码 ｜ 行数：79 ｜ 所属模块：viewer/components ｜ 分析日期：2026-07-23

## 1. 文件定位总述

SummaryCard 是 Feed 列表中展示会话总结（Session Summary）的卡片组件。它以结构化布局呈现总结的四个可选章节（调查/学到/完成/下一步），每章配有专属图标。卡片头部显示平台来源、项目名称和会话请求标题，底部显示会话 ID、时间戳和用户信息。

## 2. 功能需求

| 编号 | 需求描述（系统应当…） | 触发条件 / 输入 | 处理规则与输出 | 证据 |
|------|----------------------|----------------|---------------|------|
| FR-SC-01 | 系统应当展示总结的四个可选章节，过滤掉空内容 | summary 对象的 investigated/learned/completed/next_steps 字段 | 只渲染有内容的章节，每章带图标和标签 | `src/ui/viewer/components/SummaryCard.tsx:14-19` |
| FR-SC-02 | 系统应当在卡片头部显示平台来源标识 | summary.platform_source | 渲染带 CSS 类 source-{platform_source} 的标识标签 | `src/ui/viewer/components/SummaryCard.tsx:26-28` |
| FR-SC-03 | 系统应当显示会话请求标题（如有） | summary.request 非空 | 渲染为 h2 标题 | `src/ui/viewer/components/SummaryCard.tsx:31-33` |
| FR-SC-04 | 系统应当显示用户标签和用户名 | summary.user_label 和/或 summary.user_name | 优先显示 user_label（大写），若 user_name 不同则额外显示 user_name | `src/ui/viewer/components/SummaryCard.tsx:64-75` |
| FR-SC-05 | 系统应当为各章节设置逐级延迟动画 | 章节列表渲染 | 每个章节的 animationDelay 为 index * 50ms | `src/ui/viewer/components/SummaryCard.tsx:41` |
| FR-SC-06 | 系统应当格式化时间戳显示 | summary.created_at_epoch | 调用 formatDate() 格式化并设为 time 元素的文本和 dateTime 属性 | `src/ui/viewer/components/SummaryCard.tsx:61-62` |

## 3. 业务规则与约束

- 四个章节的图标路径：/icon-thick-investigated.svg、/icon-thick-learned.svg、/icon-thick-completed.svg、/icon-thick-next-steps.svg，均使用绝对路径。`src/ui/viewer/components/SummaryCard.tsx:15-18`
- platform_source 默认为 'claude'（当字段为空时）。`src/ui/viewer/components/SummaryCard.tsx:26-28`
- user_label 和 user_name 的显示逻辑：有 label 时显示 label + 条件显示 name（不同时）；无 label 时仅显示 name。`src/ui/viewer/components/SummaryCard.tsx:64-75`

## 4. 对外暴露

**Props 接口**：
| 属性 | 类型 | 说明 |
|------|------|------|
| `summary` | `Summary` | 总结数据对象 |

## 5. 依赖关系

- 上游：Feed 组件（渲染 Summary 类型的 FeedItem）
- 下游：`formatDate` 工具、`useLocale` Hook

## 8. 逆向备注

- 四个章节的 key 使用预定义常量（investigated/learned/completed/next_steps），在 .filter() 后通过 section.key 作为 React key。`src/ui/viewer/components/SummaryCard.tsx:14-19, 38`
