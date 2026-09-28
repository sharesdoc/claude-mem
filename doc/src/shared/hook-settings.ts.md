# hook-settings.ts 需求说明

> 源文件：src/shared/hook-settings.ts ｜ 类型：源码 ｜ 行数：14 ｜ 所属模块：shared ｜ 分析日期：2026-07-23

## 1. 文件定位总述

本文件是 settings 加载的惰性缓存层，负责读取用户 settings.json 文件并返回 `SettingsDefaults` 对象。它在 worker 进程生命周期内仅加载一次，后续调用直接返回缓存结果，避免重复磁盘 I/O。该模块是多个 hook 脚本获取配置的入口，包括项目排除、语义注入等功能的配置读取。

## 2. 功能需求

| 编号 | 需求描述（系统应当…） | 触发条件 / 输入 | 处理规则与输出 | 证据 |
|------|----------------------|----------------|---------------|------|
| FR-hooksettings-01 | 系统应当在首次调用时从磁盘加载 settings 并缓存 | 首次调用 `loadFromFileOnce()` | 从 `USER_SETTINGS_PATH` 调用 `SettingsDefaultsManager.loadFromFile()` 加载，结果存入模块级变量 | `src/shared/hook-settings.ts:10-13` |
| FR-hooksettings-02 | 系统应当在后续调用中直接返回缓存结果 | 缓存非 null 时调用 | 返回 `cachedSettings`，不再读取磁盘 | `src/shared/hook-settings.ts:11` |

## 3. 业务规则与约束

- 缓存为进程级全局，一旦加载不会被刷新。推断：重启 worker 后缓存清空，重新读取最新 settings。`src/shared/hook-settings.ts:8`

## 4. 对外暴露

| 导出名称 | 类型 | 说明 |
|---------|------|------|
| `loadFromFileOnce` | `() => SettingsDefaults` | 惰性加载并缓存 settings |

## 5. 依赖关系

- **内部依赖**：`./SettingsDefaultsManager.js`（加载逻辑）、`./paths.js`（`USER_SETTINGS_PATH` 常量）

## 6. 数据结构

- `cachedSettings`: `SettingsDefaults | null`，模块级缓存变量。`src/shared/hook-settings.ts:8`

## 7. 复杂逻辑图示

不适用（单次加载+缓存逻辑）。

## 8. 逆向备注

- 缓存不可手动清除（无公开的 reset 方法），推断：仅在进程重启后生效。
