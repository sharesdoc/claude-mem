# index.tsx 需求说明

> 源文件：src/ui/viewer/index.tsx ｜ 类型：源码 ｜ 行数：17 ｜ 所属模块：ui/viewer ｜ 分析日期：2026-07-23

## 1. 文件定位总述

本文件是 Viewer 前端应用的 HTML 入口点。它负责在 DOM 中查找 root 元素，通过 React 18 的 createRoot API 挂载应用根组件 App，并用 ErrorBoundary 组件包裹以捕获渲染异常。作为整个 Viewer SPA 的启动文件，它是构建产物 viewer.html 内嵌脚本链的终点。

## 2. 功能需求

| 编号 | 需求描述（系统应当…） | 触发条件 / 输入 | 处理规则与输出 | 证据 |
|------|----------------------|----------------|---------------|------|
| FR-ENTRY-01 | 系统应当在 DOM 中查找 id 为 "root" 的元素，若不存在则抛出异常阻止启动 | 页面加载 | document.getElementById('root')；不存在时 throw new Error('Root element not found') | `src/ui/viewer/index.tsx:6-9` |
| FR-ENTRY-02 | 系统应当使用 React 18 createRoot API 创建并渲染应用 | root 元素存在 | createRoot(container).render() | `src/ui/viewer/index.tsx:11-16` |
| FR-ENTRY-03 | 系统应当用 ErrorBoundary 组件包裹 App 组件，捕获渲染阶段的全局异常 | 渲染过程 | `<ErrorBoundary><App /></ErrorBoundary>` | `src/ui/viewer/index.tsx:13-15` |

## 3. 业务规则与约束

无特殊约束。

## 4. 对外暴露

无对外暴露（入口文件，不被其他模块导入）。

## 5. 依赖关系

- **内部依赖**：`./App`（App 组件）、`./components/ErrorBoundary`（错误边界组件）
- **外部依赖**：react、react-dom/client

## 6. 数据结构

不适用。

## 7. 复杂逻辑图示

不适用（简单的启动逻辑）。

## 8. 逆向备注

- 使用 React 18 的 createRoot API 而非旧的 ReactDOM.render，推断项目已迁移到 React 18 的 Concurrent Mode。
