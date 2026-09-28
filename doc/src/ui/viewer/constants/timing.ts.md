# timing.ts 需求说明

> 源文件：src/ui/viewer/constants/timing.ts ｜ 类型：源码（常量） ｜ 行数：8 ｜ 所属模块：ui/viewer ｜ 分析日期：2026-07-23

## 1. 文件定位总述

本文件定义 Viewer 前端的全局时间相关常量，涵盖 SSE 重连延迟、统计刷新间隔和保存状态显示时长三个配置项。所有常量以 `as const` 声明确保类型字面量收窄。文件作为 Viewer UI 的基础设施常量被各 Hook 和组件引用。

## 2. 功能需求

| 编号 | 需求描述（系统应当…） | 触发条件 / 输入 | 处理规则与输出 | 证据 |
|------|----------------------|----------------|---------------|------|
| FR-TIM-01 | 系统应当将 SSE 重连延迟定义为 3000 毫秒 | SSE 连接断开 | TIMING.SSE_RECONNECT_DELAY_MS = 3000 | `src/ui/viewer/constants/timing.ts:2` |
| FR-TIM-02 | 系统应当将统计信息自动刷新间隔定义为 10000 毫秒 | 统计面板展示 | TIMING.STATS_REFRESH_INTERVAL_MS = 10000 | `src/ui/viewer/constants/timing.ts:4` |
| FR-TIM-03 | 系统应当将保存成功状态的显示时长定义为 3000 毫秒 | 设置保存操作成功 | TIMING.SAVE_STATUS_DISPLAY_DURATION_MS = 3000 | `src/ui/viewer/constants/timing.ts:6` |

## 3. 业务规则与约束

无特殊约束。

## 4. 对外暴露

| 导出项 | 类型 | 用途 |
|--------|------|------|
| `TIMING` | const object | 包含三个时间常量的只读对象 |

### TIMING 常量详情

| 常量名 | 值 | 含义 |
|--------|------|------|
| SSE_RECONNECT_DELAY_MS | 3000 | SSE 连接断开后重连等待毫秒数 |
| STATS_REFRESH_INTERVAL_MS | 10000 | 统计面板自动刷新间隔毫秒数 |
| SAVE_STATUS_DISPLAY_DURATION_MS | 3000 | 保存成功提示显示持续时间毫秒数 |

## 5. 依赖关系

- **被依赖**：Viewer 前端各 Hook 和组件引用时间常量

## 6. 数据结构

不适用。

## 7. 复杂逻辑图示

不适用。

## 8. 逆向备注

- 所有值使用 `as const` 冭定，确保在使用时获得精确的字面量类型而非宽泛的 number。
