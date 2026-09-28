# ThemeToggle.tsx 需求说明

> 源文件：src/ui/viewer/components/ThemeToggle.tsx ｜ 类型：源码 ｜ 行数：75 ｜ 所属模块：viewer/components ｜ 分析日期：2026-07-23

## 1. 文件定位总述

ThemeToggle 是 Header 区域的主题切换按钮组件，以受控方式工作。它显示当前主题对应的图标（太阳/月亮/显示器），点击后按 system → light → dark 循环顺序切换到下一个主题。所有文本和提示通过 useLocale 国际化。

## 2. 功能需求

| 编号 | 需求描述（系统应当…） | 触发条件 / 输入 | 处理规则与输出 | 证据 |
|------|----------------------|----------------|---------------|------|
| FR-TT-01 | 系统应当按 system → light → dark 循环切换主题 | 用户点击按钮 | 计算当前偏好在循环数组中的下一个索引，调用 `onThemeChange` | `src/ui/viewer/components/ThemeToggle.tsx:12-17` |
| FR-TT-02 | 系统应当根据当前偏好显示对应图标 | preference 状态 | light→太阳图标，dark→月亮图标，system→显示器图标 | `src/ui/viewer/components/ThemeToggle.tsx:19-51` |
| FR-TT-03 | 系统应当显示当前主题的本地化提示文本 | 鼠标悬停按钮 | 调用 `t('theme.light/dark/system')` 返回对应翻译 | `src/ui/viewer/components/ThemeToggle.tsx:53-63` |

## 3. 业务规则与约束

- 循环顺序固定为 `['system', 'light', 'dark']`。`src/ui/viewer/components/ThemeToggle.tsx:13`
- 按钮通过 `aria-label` 和 `title` 提供无障碍支持。`src/ui/viewer/components/ThemeToggle.tsx:69-71`

## 4. 对外暴露

**Props 接口**：
| 属性 | 类型 | 说明 |
|------|------|------|
| `preference` | `ThemePreference` | 当前主题偏好（受控） |
| `onThemeChange` | `(theme: ThemePreference) => void` | 主题变更回调 |

## 5. 依赖关系

- 上游：useTheme Hook（提供 preference 和 setThemePreference）、useLocale Hook
- 下游：Header 组件

## 8. 逆向备注

- 所有 SVG 图标内联在组件中，未抽取为独立图标组件。`src/ui/viewer/components/ThemeToggle.tsx:22-50`
