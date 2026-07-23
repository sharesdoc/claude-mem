# ViewModeToggle.tsx 需求说明

> 源文件：src/ui/viewer/components/ViewModeToggle.tsx ｜ 类型：源码（React 组件） ｜ 行数：33 ｜ 所属模块：ui/viewer ｜ 分析日期：2026-07-23

## 1. 文件定位总述

本文件实现视图模式切换组件，提供"全部"和"提示"两种视图模式的切换按钮。组件类型定义中包含 'stats' 模式但当前 UI 仅渲染两个按钮。组件以 role="group" 的按钮组形式呈现，当前激活模式通过 CSS 类名 `is-active` 标识。它用于 Viewer 主界面的内容筛选。

## 2. 功能需求

| 编号 | 需求描述（系统应当…） | 触发条件 / 输入 | 处理规则与输出 | 证据 |
|------|----------------------|----------------|---------------|------|
| FR-VMT-01 | 系统应当渲染"全部"和"提示"两个切换按钮 | 组件渲染 | 第一个按钮调用 onChange('all')，第二个按钮调用 onChange('prompts') | `src/ui/viewer/components/ViewModeToggle.tsx:14-30` |
| FR-VMT-02 | 系统应当通过 CSS 类名高亮当前激活的视图模式 | mode prop 匹配 | 匹配时添加 `is-active` 类名 | `src/ui/viewer/components/ViewModeToggle.tsx:16,22` |
| FR-VMT-03 | 系统应当支持通过 labels prop 国际化按钮文字 | 通过 labels prop | labels.all 和 labels.prompts 分别作为两个按钮的文字和 title | `src/ui/viewer/components/ViewModeToggle.tsx:13-14` |

## 3. 业务规则与约束

| 编号 | 规则描述 | 证据 |
|------|---------|------|
| BR-VMT-01 | ViewMode 类型定义包含 'stats' 值，但 UI 中未渲染对应按钮，推断 'stats' 模式由其他方式触发（如直接编程设置） | `src/ui/viewer/components/ViewModeToggle.tsx:3` |

## 4. 对外暴露

### Props（ViewModeToggleProps）

| 属性 | 类型 | 必填 | 说明 |
|------|------|------|------|
| mode | ViewMode | 是 | 当前视图模式 |
| onChange | (mode: ViewMode) => void | 是 | 视图切换回调 |
| labels | { all: string; prompts: string } | 是 | 按钮国际化文字 |

### 导出类型

| 导出项 | 类型 | 用途 |
|--------|------|------|
| `ViewMode` | type | 视图模式类型：'all' \| 'prompts' \| 'stats' |

## 5. 依赖关系

- **外部依赖**：react
- **被依赖**：App 组件中使用

## 6. 数据结构

**ViewMode**: `'all' | 'prompts' | 'stats'`

## 7. 复杂逻辑图示

不适用（简单的双按钮切换组件）。

## 8. 逆向备注

- ViewMode 类型包含 'stats' 但组件只渲染两个按钮（all 和 prompts），推断 stats 模式可能在其他入口触发或预留用于未来扩展。
- 组件使用受控模式（mode 由父组件管理），不维护内部状态。
- aria-label 通过 labels.all + ' / ' + labels.prompts 动态拼接，推断为了在无障碍阅读器中描述整个按钮组的用途。
