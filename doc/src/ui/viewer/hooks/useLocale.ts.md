# useLocale.ts 需求说明

> 源文件：src/ui/viewer/hooks/useLocale.ts ｜ 类型：源码 ｜ 行数：46 ｜ 所属模块：viewer/hooks ｜ 分析日期：2026-07-23

## 1. 文件定位总述

useLocale 是 Viewer 的国际化核心 Hook，管理当前语言 locale 状态并提供翻译函数 `t`。它从 localStorage 读取用户偏好，通过 `window` 自定义事件实现跨组件 locale 联动，并同步更新 `<html>` 元素的 `lang` 属性。几乎所有需要显示文本的组件都依赖此 Hook。

## 2. 功能需求

| 编号 | 需求描述（系统应当…） | 触发条件 / 输入 | 处理规则与输出 | 证据 |
|------|----------------------|----------------|---------------|------|
| FR-UL-01 | 系统应当从 localStorage 初始化当前 locale | 组件首次挂载 | 调用 `getStoredLocale()` 获取已存 locale（默认 'en'） | `src/ui/viewer/hooks/useLocale.ts:13` |
| FR-UL-02 | 系统应当在 locale 变更时同步 `<html>` 的 lang 属性 | locale 状态更新 | zh 时设为 `zh-CN`，其他设为 `en` | `src/ui/viewer/hooks/useLocale.ts:28` |
| FR-UL-03 | 系统应当通过自定义事件实现跨组件 locale 同步 | 任意组件调用 `setLocale` | 派发 `claude-mem.locale-changed` 事件，其他组件的监听器更新自身状态 | `src/ui/viewer/hooks/useLocale.ts:36` |
| FR-UL-04 | 系统应当提供翻译函数 t，支持 `{var}` 占位符替换 | 调用 `t(key, vars)` | 读取当前 locale 的翻译表，回退到英文，再回退到原始 key；替换 `{name}` 为 `String(vars.name)` | `src/ui/viewer/hooks/useLocale.ts:40-43` |
| FR-UL-05 | 系统应当在切换 locale 时持久化到 localStorage | 调用 `setLocale(next)` | 调用 `setStoredLocale(next)` 写入 localStorage | `src/ui/viewer/hooks/useLocale.ts:33` |

## 3. 业务规则与约束

- 事件名常量 `LOCALE_EVENT = 'claude-mem.locale-changed'`，全局唯一。`src/ui/viewer/hooks/useLocale.ts:4`
- locale 类型限定为 `'en' | 'zh'`，从 `../utils/i18n` 导入。`src/ui/viewer/hooks/useLocale.ts:2`
- 组件卸载时自动移除事件监听器，防止内存泄漏。`src/ui/viewer/hooks/useLocale.ts:23`

## 4. 对外暴露

| 导出名称 | 类型 | 说明 |
|---------|------|------|
| `UseLocaleResult` | interface | 返回类型定义 |
| `useLocale` | `() => UseLocaleResult` | Hook 函数 |

**UseLocaleResult 结构**：
- `locale: Locale` — 当前语言
- `setLocale: (locale: Locale) => void` — 切换语言
- `t: (key: string, vars?) => string` — 翻译函数

## 5. 依赖关系

- 上游：`../utils/i18n`（Locale 类型、getStoredLocale、setStoredLocale、translate）
- 下游：几乎所有 Viewer 组件（SyncStatusBadge、Feed、ObservationCard、SummaryCard、PromptCard、WelcomeCard、DateFilterButton、ThemeToggle 等）

## 8. 逆向备注

- 选择 `window` 自定义事件而非 React Context 进行跨组件通信，注释说明原因是 locale 状态本身存在 localStorage 中，因此用窗口级事件保持一致。`src/ui/viewer/hooks/useLocale.ts:15-16`
