# LocaleToggle.tsx 需求说明

> 源文件：src/ui/viewer/components/LocaleToggle.tsx ｜ 类型：源码（React 组件） ｜ 行数：32 ｜ 所属模块：ui/viewer ｜ 分析日期：2026-07-23

## 1. 文件定位总述

本文件实现语言切换组件，提供英文（EN）和中文两种语言的切换按钮。组件以 role="group" 的按钮组形式渲染，当前激活语言通过 CSS 类名 `is-active` 标识。它是 Viewer UI 国际化（i18n）功能的入口交互控件，通常放置在页面头部。

## 2. 功能需求

| 编号 | 需求描述（系统应当…） | 触发条件 / 输入 | 处理规则与输出 | 证据 |
|------|----------------------|----------------|---------------|------|
| FR-LT-01 | 系统应当渲染英文和中文两个切换按钮 | 组件渲染 | EN 按钮调用 onLocaleChange('en')；中文按钮调用 onLocaleChange('zh') | `src/ui/viewer/components/LocaleToggle.tsx:13-29` |
| FR-LT-02 | 系统应当通过 CSS 类名高亮当前激活的语言按钮 | locale prop 匹配 | 匹配时添加 `is-active` 类名（如 `locale-toggle-btn is-active`） | `src/ui/viewer/components/LocaleToggle.tsx:16,22` |
| FR-LT-03 | 系统应当支持自定义 aria-label 和按钮提示文字 | 通过 label prop | 默认 aria-label 为 'Language'，可通过 label prop 覆盖 | `src/ui/viewer/components/LocaleToggle.tsx:12` |

## 3. 业务规则与约束

无特殊约束。

## 4. 对外暴露

### Props（LocaleToggleProps）

| 属性 | 类型 | 必填 | 说明 |
|------|------|------|------|
| locale | Locale | 是 | 当前语言，值为 'en' 或 'zh' |
| onLocaleChange | (locale: Locale) => void | 是 | 语言切换回调 |
| label | string | 否 | 自定义 aria-label，默认 'Language' |

## 5. 依赖关系

- **内部依赖**：`../utils/i18n`（Locale 类型）
- **外部依赖**：react
- **被依赖**：App 组件或 Header 组件中使用

## 6. 数据结构

**Locale**: `'en' | 'zh'`（定义在 `../utils/i18n` 中）

## 7. 复杂逻辑图示

不适用（简单的双按钮切换组件）。

## 8. 逆向备注

- 组件使用受控模式（locale 由父组件管理），不维护内部状态。
- 当前仅支持两种语言（en/zh），Locale 类型定义在其他文件中，推断可扩展。
