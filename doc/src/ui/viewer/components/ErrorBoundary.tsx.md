# ErrorBoundary.tsx 需求说明

> 源文件：src/ui/viewer/components/ErrorBoundary.tsx ｜ 类型：源码 ｜ 行数：63 ｜ 所属模块：viewer/components ｜ 分析日期：2026-07-23

## 1. 文件定位总述

ErrorBoundary 是一个 React 类组件错误边界，包裹整个 Viewer 应用。当子组件树中发生渲染错误时，它捕获异常并渲染一个包含错误详情的可折叠面板，引导用户刷新页面。这是 Viewer 的最后一道防线，防止整个应用白屏崩溃。

## 2. 功能需求

| 编号 | 需求描述（系统应当…） | 触发条件 / 输入 | 处理规则与输出 | 证据 |
|------|----------------------|----------------|---------------|------|
| FR-EB-01 | 系统应当在子组件渲染抛出错误时捕获并切换到错误状态 | React 渲染阶段抛出 Error | `getDerivedStateFromError` 设置 `hasError=true` 和 `error` 对象 | `src/ui/viewer/components/ErrorBoundary.tsx:23-25` |
| FR-EB-02 | 系统应当记录错误信息和组件调用栈 | 错误被捕获后 | `componentDidCatch` 中 `console.error` 输出 error 和 errorInfo，并保存到 state | `src/ui/viewer/components/ErrorBoundary.tsx:27-33` |
| FR-EB-03 | 系统应当在错误状态下渲染错误恢复界面 | `hasError === true` | 显示红色标题、提示文字、可折叠的 `<details>` 包含错误信息和组件栈 | `src/ui/viewer/components/ErrorBoundary.tsx:36-58` |
| FR-EB-04 | 系统应当在正常状态下透传子组件 | `hasError === false` | 渲染 `this.props.children` | `src/ui/viewer/components/ErrorBoundary.tsx:61` |

## 3. 业务规则与约束

- 使用深色主题硬编码样式（`backgroundColor: '#1a1a1a'`），不依赖 CSS 变量或主题系统。`src/ui/viewer/components/ErrorBoundary.tsx:38`
- 错误面板不提供"重试"按钮，仅提示用户刷新页面。`src/ui/viewer/components/ErrorBoundary.tsx:41`
- 初始状态为 `hasError: false, error: null, errorInfo: null`。`src/ui/viewer/components/ErrorBoundary.tsx:16-20`

## 4. 对外暴露

**Props 接口**：
| 属性 | 类型 | 说明 |
|------|------|------|
| `children` | `ReactNode` | 需要保护的子组件树 |

## 5. 依赖关系

- 上游：App 根组件（包裹整个应用）
- 下游：React 内置生命周期方法（getDerivedStateFromError、componentDidCatch）

## 8. 逆向备注

- 使用类组件而非函数组件，因为 React 错误边界目前仅支持类组件。
- 错误信息面板使用 `<details>` HTML 元素实现原生可折叠功能。`src/ui/viewer/components/ErrorBoundary.tsx:44`
