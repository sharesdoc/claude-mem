# formatters.ts 需求说明

> 源文件：src/ui/viewer/utils/formatters.ts ｜ 类型：源码（工具函数） ｜ 行数：21 ｜ 所属模块：ui/viewer ｜ 分析日期：2026-07-23

## 1. 文件定位总述

本文件提供 Viewer 前端的通用数据格式化工具函数，涵盖日期时间、运行时长和字节大小三种格式化场景。所有函数都以 epoch 毫秒或秒数为输入，输出人类可读的字符串，用于在 UI 组件中展示时间戳、运行时间和数据库大小等信息。

## 2. 功能需求

| 编号 | 需求描述（系统应当…） | 触发条件 / 输入 | 处理规则与输出 | 证据 |
|------|----------------------|----------------|---------------|------|
| FR-FMT-01 | 系统应当将 epoch 时间戳格式化为 "YYYY-MM-DD HH:mm:ss" 字符串 | 调用 formatDate(epoch) | 输入为毫秒级 epoch，输出固定格式的日期时间字符串 | `src/ui/viewer/utils/formatters.ts:2-6` |
| FR-FMT-02 | 系统应当将秒数格式化为 "Xh Ym" 格式的运行时长 | 调用 formatUptime(seconds) | 输入 0/undefined/null 返回 '-'；小时取整，分钟取整 | `src/ui/viewer/utils/formatters.ts:8-13` |
| FR-FMT-03 | 系统应当将字节数格式化为 "B/KB/MB" 人类可读大小 | 调用 formatBytes(bytes) | < 1024 → 原始值 + B；< 1MB → KB 保留一位小数；>= 1MB → MB 保留一位小数；0/undefined/null 返回 '-' | `src/ui/viewer/utils/formatters.ts:15-20` |

## 3. 业务规则与约束

| 编号 | 规则描述 | 证据 |
|------|---------|------|
| BR-FMT-01 | formatUptime 和 formatBytes 的 falsy 输入统一返回 '-' | `src/ui/viewer/utils/formatters.ts:9,15` |
| BR-FMT-02 | formatUptime 不显示天数，超过 24 小时的小时数会超过 24 | 推断（代码中仅计算 hours = floor(seconds / 3600)，未做天/小时分离） |

## 4. 对外暴露

| 导出项 | 类型 | 用途 |
|--------|------|------|
| `formatDate` | function | epoch → "YYYY-MM-DD HH:mm:ss" |
| `formatUptime` | function | seconds → "Xh Ym" |
| `formatBytes` | function | bytes → "B/KB/MB" |

## 5. 依赖关系

- **被依赖**：Viewer UI 各组件（统计面板、列表项等）展示时间与大小信息

## 6. 数据结构

不适用。

## 7. 复杂逻辑图示

不适用（三个独立的纯函数）。

## 8. 逆向备注

- formatDate 输入为毫秒级 epoch（通过 `new Date(epoch)` 验证），与 SQLite 层的 created_at_epoch（秒级）不同，推断调用方在传入前可能已做转换，或前端 epoch 确为毫秒级。
- formatUptime 不处理秒级显示（只显示小时和分钟），对于短时长场景可能精度不足。
- formatBytes 的 KB/MB 保留一位小数，与 formatStarCount 的风格一致。
