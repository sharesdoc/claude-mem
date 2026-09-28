# WelcomeCard.tsx 需求说明

> 源文件：src/ui/viewer/components/WelcomeCard.tsx ｜ 类型：源码 ｜ 行数：220 ｜ 所属模块：viewer/components ｜ 分析日期：2026-07-23

## 1. 文件定位总述

WelcomeCard 是 Viewer 的欢迎引导弹窗组件，在用户首次使用时展示 claude-mem 的三大核心功能（实时流、调优、检索）。它以模态对话框形式呈现，支持点击遮罩关闭、Esc 键关闭和关闭按钮关闭三种方式。关闭状态持久化到 localStorage（key 含版本号 v3），用于后续访问时跳过显示。

## 2. 功能需求

| 编号 | 需求描述（系统应当…） | 触发条件 / 输入 | 处理规则与输出 | 证据 |
|------|----------------------|----------------|---------------|------|
| FR-WC-01 | 系统应当以模态对话框形式展示欢迎引导 | 欢迎 card 被触发渲染 | 渲染 backdrop 遮罩 + 居中 modal，role="dialog", aria-modal="true" | `src/ui/viewer/components/WelcomeCard.tsx:180-219` |
| FR-WC-02 | 系统应当展示三个核心功能介绍 | 渲染 modal 内容 | 显示 Stream（实时流）、Tune（调优）、Recall（检索）三个功能卡片，各带 SVG 插图 | `src/ui/viewer/components/WelcomeCard.tsx:142-161, 196-205` |
| FR-WC-03 | 系统应当提供三种关闭方式 | 用户交互 | 点击遮罩、Esc 键、关闭按钮，任一操作调用 onDismiss | `src/ui/viewer/components/WelcomeCard.tsx:166-177, 180, 188` |
| FR-WC-04 | 系统应当阻止点击弹窗内容区域时关闭 | 用户点击 modal 内部 | `e.stopPropagation()` 阻止事件冒泡 | `src/ui/viewer/components/WelcomeCard.tsx:181` |
| FR-WC-05 | 系统应当将关闭状态持久化到 localStorage | 用户关闭弹窗 | 调用 `setStoredWelcomeDismissed(true)` 写入 key `claude-mem-welcome-dismissed-v3` | `src/ui/viewer/components/WelcomeCard.tsx:166` |
| FR-WC-06 | 系统应当提供"工作原理"和"文档"链接 | 渲染 footer | 链接到 `/api/onboarding/explainer` 和 `https://docs.claude-mem.ai` | `src/ui/viewer/components/WelcomeCard.tsx:209-215` |
| FR-WC-07 | 系统应当提供读取和写入 localStorage dismissed 状态的公共函数 | 外部调用 | `getStoredWelcomeDismissed()` 和 `setStoredWelcomeDismissed()` 导出 | `src/ui/viewer/components/WelcomeCard.tsx:12-31` |

## 3. 业务规则与约束

- localStorage key 为 `claude-mem-welcome-dismissed-v3`，版本号 v3 意味着内容更新后可重新显示。`src/ui/viewer/components/WelcomeCard.tsx:8`
- 关闭后不可恢复：`setStoredWelcomeDismissed(true)` 写入后需通过 Header 的 "Show welcome card" 菜单手动重新打开。`src/ui/viewer/components/WelcomeCard.tsx:166`
- Esc 键监听器在 useEffect 中注册，组件卸载时自动移除。`src/ui/viewer/components/WelcomeCard.tsx:170-177`
- 三个 SVG 插图均为组件内定义的纯 React SVG，无外部图片依赖。`src/ui/viewer/components/WelcomeCard.tsx:50-133`

## 4. 对外暴露

**Props 接口**：
| 属性 | 类型 | 说明 |
|------|------|------|
| `onDismiss` | `() => void` | 关闭回调 |

**导出的公共函数**：
| 名称 | 类型 | 说明 |
|------|------|------|
| `getStoredWelcomeDismissed` | `() => boolean` | 读取 localStorage dismissed 状态 |
| `setStoredWelcomeDismissed` | `(dismissed: boolean) => void` | 写入 localStorage dismissed 状态 |

## 5. 依赖关系

- 上游：App 根组件（条件渲染，根据 getStoredWelcomeDismissed 决定是否显示）
- 下游：`useLocale` Hook、`EXPLAINER_URL` 和 `DOCS_URL` 常量

## 8. 逆向备注

- 所有 SVG 插图组件（StreamIllustration、TuneIllustration、RecallIllustration）使用了 `stroke="var(--color-border-observation)"` 等 CSS 变量，确保主题适配。`src/ui/viewer/components/WelcomeCard.tsx:63-65`
- `eslint-disable-next-line react-hooks/exhaustive-deps` 注释表明 handleDismiss 在 useEffect 中被引用但未列入依赖数组，这是有意为之——避免 onDismiss 变化时重复注册监听器。`src/ui/viewer/components/WelcomeCard.tsx:176`
