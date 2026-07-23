# UserSelector.tsx 需求说明

> 源文件：src/ui/viewer/components/UserSelector.tsx ｜ 类型：源码（React 组件） ｜ 行数：43 ｜ 所属模块：ui/viewer ｜ 分析日期：2026-07-23

## 1. 文件定位总述

本文件实现 Server 模式下的用户选择器组件，以 `<select>` 下拉框形式呈现。用户可从列表中选择特定用户或"全部用户"（All）来筛选数据。组件使用内部标记值 `__all__` 表示"全部用户"选择，选中时向父组件传递 null。它是 Server 模式多用户管理功能的核心交互控件，由 App.tsx 通过判断 `/api/admin/role` 决定是否渲染。

## 2. 功能需求

| 编号 | 需求描述（系统应当…） | 触发条件 / 输入 | 处理规则与输出 | 证据 |
|------|----------------------|----------------|---------------|------|
| FR-USL-01 | 系统应当渲染一个下拉框，包含"全部用户"选项和各用户选项 | 组件渲染 | 第一个 option 值为 '__all__'，后续 option 值为 user_label | `src/ui/viewer/components/UserSelector.tsx:33-38` |
| FR-USL-02 | 系统应当将"全部用户"选择映射为 null 传递给父组件 | 选中 '__all__' 选项 | onChange(next) 中 next = null | `src/ui/viewer/components/UserSelector.tsx:29` |
| FR-USL-03 | 系统应当将特定用户选择直接传递 user_label 给父组件 | 选中具体用户 | onChange(next) 中 next = e.target.value | `src/ui/viewer/components/UserSelector.tsx:29` |
| FR-USL-04 | 系统应当使用国际化文案渲染选项文字和提示信息 | useLocale hook | "全部用户"通过 t('user.all') 获取；提示通过 t('user.selectorTip') 获取 | `src/ui/viewer/components/UserSelector.tsx:24,33` |

## 3. 业务规则与约束

| 编号 | 规则描述 | 证据 |
|------|---------|------|
| BR-USL-01 | value=null 表示"全部用户"，对应 select 的内部值 '__all__' | `src/ui/viewer/components/UserSelector.tsx:21-22` |
| BR-USL-02 | 组件仅在 Server 模式下渲染（由父组件 App.tsx 控制） | `src/ui/viewer/components/UserSelector.tsx:17-18` 注释 |

## 4. 对外暴露

### Props（UserSelectorProps）

| 属性 | 类型 | 必填 | 说明 |
|------|------|------|------|
| users | UserRow[] | 是 | 用户列表数据（来自 useUsers hook） |
| value | string \| null | 是 | 当前选中用户（null = 全部） |
| onChange | (next: string \| null) => void | 是 | 选择变更回调 |

## 5. 依赖关系

- **内部依赖**：`../hooks/useLocale`（t 翻译函数）、`../hooks/useUsers`（UserRow 类型）
- **外部依赖**：react
- **被依赖**：App 组件（Server 模式下条件渲染）

## 6. 数据结构

**UserRow**: `{ user_label: string, sessions: number, last_active: number | null }`（定义在 useUsers.ts 中）

## 7. 复杂逻辑图示

不适用（简单的 select 下拉组件）。

## 8. 逆向备注

- 组件注释中提及"App.tsx gates on /api/admin/role"，推断 Server 模式的判断逻辑在 App 组件中，而非本组件内部。
- "全部用户"选择对应 null 而非空字符串，推断后端 API 通过 absence of query param 使用未过滤的快速路径（如注释所述）。
- 组件使用 `<label>` 包裹 `<select>`，提供了良好的表单可访问性。
