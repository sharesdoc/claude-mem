# TerminalPreview.tsx 需求说明

> 源文件：src/ui/viewer/components/TerminalPreview.tsx ｜ 类型：源码 ｜ 行数：140 ｜ 所属模块：viewer/components ｜ 分析日期：2026-07-23

## 1. 文件定位总述

TerminalPreview 是一个终端风格的内容预览组件，用于设置面板中展示上下文注入效果。它将 ANSI 转义码转换为 HTML（通过 ansi-to-html），使用 DOMPurify 进行 XSS 清理，并模拟 macOS 终端窗口的视觉效果（红绿黄三点、自动换行切换按钮）。该组件维护滚动位置以在内容更新时不跳动。

## 2. 功能需求

| 编号 | 需求描述（系统应当…） | 触发条件 / 输入 | 处理规则与输出 | 证据 |
|------|----------------------|----------------|---------------|------|
| FR-TP-01 | 系统应当将 ANSI 转义码转换为 HTML | content 变化 | 使用 AnsiToHtml 转换器处理，前景 `#dcd6cc`，背景 `#252320` | `src/ui/viewer/components/TerminalPreview.tsx:11-17` |
| FR-TP-02 | 系统应当对转换后的 HTML 进行 XSS 清理 | HTML 转换完成 | 使用 DOMPurify.sanitize，仅允许 span/div/br 标签和 style/class 属性 | `src/ui/viewer/components/TerminalPreview.tsx:30-34` |
| FR-TP-03 | 系统应当在内容更新时保持滚动位置 | content 变化触发重新渲染 | 渲染前记录 scrollTop，useLayoutEffect 后恢复 | `src/ui/viewer/components/TerminalPreview.tsx:25-27, 37-41` |
| FR-TP-04 | 系统应当提供自动换行/水平滚动切换按钮 | 用户点击窗口栏按钮 | 切换 wordWrap 状态，改变 CSS white-space 和 word-break | `src/ui/viewer/components/TerminalPreview.tsx:87-114` |
| FR-TP-05 | 系统应当显示 macOS 终端窗口的三色按钮装饰 | 渲染窗口栏 | 红色 #ff5f57、黄色 #ffbd2e、绿色 #28c840 三个圆点 | `src/ui/viewer/components/TerminalPreview.tsx:83-85` |
| FR-TP-06 | 系统应当在加载中显示占位文本 | isLoading === true | 显示 "Loading preview..." | `src/ui/viewer/components/TerminalPreview.tsx:118-128` |

## 3. 业务规则与约束

- DOMPurify 白名单严格：仅允许 `span`、`div`、`br` 标签，仅允许 `style`、`class` 属性，禁止 `data-*` 属性。`src/ui/viewer/components/TerminalPreview.tsx:31-33`
- 默认自动换行开启（`wordWrap = true`）。`src/ui/viewer/components/TerminalPreview.tsx:22`
- 内容为空时返回空字符串，不渲染任何内容。`src/ui/viewer/components/TerminalPreview.tsx:28`
- 组件使用 `dangerouslySetInnerHTML` 渲染经 DOMPurify 清理后的 HTML 内容。`src/ui/viewer/components/TerminalPreview.tsx:134`

## 4. 对外暴露

**Props 接口**：
| 属性 | 类型 | 说明 |
|------|------|------|
| `content` | `string` | 终端内容文本（含 ANSI 转义码） |
| `isLoading` | `boolean`（可选，默认 false） | 加载状态 |
| `className` | `string`（可选，默认空） | 附加 CSS 类名 |

## 5. 依赖关系

- 上游：Settings 面板中的 ContextPreview 子组件（传入预览文本）
- 下游：`ansi-to-html` 库、`dompurify` 库

## 8. 逆向备注

- AnsiToHtml 实例在模块顶层创建并复用，其配置 `stream: false` 表示不按流式处理。`src/ui/viewer/components/TerminalPreview.tsx:11-17`
- 滚动位置保持通过 `scrollTopRef` + `useMemo` + `useLayoutEffect` 三步实现：useMemo 中记录 scrollTop，useLayoutEffect 中恢复。`src/ui/viewer/components/TerminalPreview.tsx:24-41`
