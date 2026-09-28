# formatNumber.ts 需求说明

> 源文件：src/ui/viewer/utils/formatNumber.ts ｜ 类型：源码（工具函数） ｜ 行数：14 ｜ 所属模块：ui/viewer ｜ 分析日期：2026-07-23

## 1. 文件定位总述

本文件提供 GitHub Star 数的格式化工具函数，将数字转换为人类友好的缩写形式（如 1.2k、3.5M）。该函数专门用于 Viewer UI 中展示项目的 GitHub 星标数，避免大数字占据过多界面空间。

## 2. 功能需求

| 编号 | 需求描述（系统应当…） | 触发条件 / 输入 | 处理规则与输出 | 证据 |
|------|----------------------|----------------|---------------|------|
| FR-FN-01 | 系统应当将小于 1000 的数字直接转为字符串 | count < 1000 | 返回 count.toString() | `src/ui/viewer/utils/formatNumber.ts:2-3` |
| FR-FN-02 | 系统应当将 1000-999999 的数字格式化为 "X.Xk" | 1000 <= count < 1000000 | count / 1000 保留一位小数 + 'k' | `src/ui/viewer/utils/formatNumber.ts:5-8` |
| FR-FN-03 | 系统应当将 1000000 及以上的数字格式化为 "X.XM" | count >= 1000000 | count / 1000000 保留一位小数 + 'M' | `src/ui/viewer/utils/formatNumber.ts:10-13` |

## 3. 业务规则与约束

| 编号 | 规则描述 | 证据 |
|------|---------|------|
| BR-FN-01 | 缩写单位使用小写 k 和大写 M | `src/ui/viewer/utils/formatNumber.ts:8,12` |
| BR-FN-02 | 小数部分统一保留一位（toFixed(1)） | `src/ui/viewer/utils/formatNumber.ts:7,11` |

## 4. 对外暴露

| 导出项 | 类型 | 用途 |
|--------|------|------|
| `formatStarCount` | function | 将 GitHub star 数格式化为缩写字符串 |

## 5. 依赖关系

- **被依赖**：Viewer UI 组件（如 Header 中展示 GitHub star 数）

## 6. 数据结构

不适用。

## 7. 复杂逻辑图示

不适用（简单的阶梯判断逻辑）。

## 8. 逆向备注

- 函数名 formatStarCount 暗示其专用场景（GitHub stars），而非通用数字格式化。若需要通用格式化（如显示字节数），应使用 formatters.ts 中的 formatBytes。
- 未处理负数场景，推断输入始终为非负整数。
