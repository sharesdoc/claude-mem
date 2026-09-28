# useSettings.ts 需求说明

> 源文件：src/ui/viewer/hooks/useSettings.ts ｜ 类型：源码 ｜ 行数：92 ｜ 所属模块：viewer/hooks ｜ 分析日期：2026-07-23

## 1. 文件定位总述

useSettings 是 Viewer 设置管理 Hook，负责从后端加载和保存 claude-mem 的运行配置。它在组件挂载时一次性拉取全部设置，每个字段以 `??` 运算符回退到默认值，确保后端新增字段不会导致前端崩溃。保存时以 POST 请求提交并反馈成功/失败状态。

## 2. 功能需求

| 编号 | 需求描述（系统应当…） | 触发条件 / 输入 | 处理规则与输出 | 证据 |
|------|----------------------|----------------|---------------|------|
| FR-US-01 | 系统应当在组件挂载时从后端加载设置 | 组件 mount | 请求 `GET /api/settings`，解析 JSON 后与默认值合并 | `src/ui/viewer/hooks/useSettings.ts:13-56` |
| FR-US-02 | 系统应当对每个设置字段使用默认值回退 | 后端响应中缺失某个字段 | 使用 `data.field ?? DEFAULT_SETTINGS.field` | `src/ui/viewer/hooks/useSettings.ts:23-51` |
| FR-US-03 | 系统应当支持保存设置到后端 | 调用 `saveSettings(newSettings)` | POST `/api/settings`，Content-Type: application/json | `src/ui/viewer/hooks/useSettings.ts:63-67` |
| FR-US-04 | 系统应当在保存成功后更新本地状态并显示成功提示 | POST 响应 ok 且 body.success === true | 更新 settings 状态为 newSettings，显示 "Saved"，`TIMING.SAVE_STATUS_DISPLAY_DURATION_MS` 后清除 | `src/ui/viewer/hooks/useSettings.ts:77-81` |
| FR-US-05 | 系统应当在保存失败时显示错误信息 | POST 响应非 ok 或 body.success === false | 显示 `Error: {statusText}` 或 `Error: {error}` | `src/ui/viewer/hooks/useSettings.ts:70, 82-86` |
| FR-US-06 | 系统应当在 401 时提示未授权 | POST 响应 401 | 显示 "Unauthorized" 错误信息 | `src/ui/viewer/hooks/useSettings.ts:70` |

## 3. 业务规则与约束

- 初始状态使用 `DEFAULT_SETTINGS` 常量，确保在请求完成前 UI 不报错。`src/ui/viewer/hooks/useSettings.ts:9`
- 请求失败时仅 console.error，不抛出异常，保持 settings 为默认值。`src/ui/viewer/hooks/useSettings.ts:53-55`
- 使用 `authFetch` 而非原生 fetch，确保请求携带认证令牌。

## 4. 对外暴露

| 导出名称 | 类型 | 说明 |
|---------|------|------|
| `useSettings` | `() => { settings, saveSettings, isSaving, saveStatus }` | Hook 函数 |

**返回值结构**：
- `settings: Settings` — 当前设置对象
- `saveSettings: (newSettings: Settings) => Promise<void>` — 保存函数
- `isSaving: boolean` — 保存中状态
- `saveStatus: string` — 状态提示文本

## 5. 依赖关系

- 上游：`authFetch`、`DEFAULT_SETTINGS`（`../constants/settings`）、`API_ENDPOINTS`（`../constants/api`）、`TIMING`（`../constants/timing`）
- 下游：Settings 面板组件

## 6. 数据结构

涵盖的设置字段（均以 string 类型存储）：
- **核心**：MODEL, CONTEXT_OBSERVATIONS, WORKER_PORT, WORKER_HOST
- **Gemini**：PROVIDER, GEMINI_API_KEY, GEMINI_MODEL, GEMINI_RATE_LIMITING_ENABLED
- **OpenRouter**：OPENROUTER_API_KEY, OPENROUTER_MODEL, OPENROUTER_SITE_URL, OPENROUTER_APP_NAME
- **显示**：CONTEXT_SHOW_READ_TOKENS, CONTEXT_SHOW_WORK_TOKENS, CONTEXT_SHOW_SAVINGS_AMOUNT/PERCENT, PROMPT_SHOW_PROCESSING_TIME
- **加载**：CONTEXT_FULL_COUNT, CONTEXT_FULL_FIELD, CONTEXT_SESSION_COUNT
- **上下文**：CONTEXT_SHOW_LAST_SUMMARY, CONTEXT_SHOW_LAST_MESSAGE

## 8. 逆向备注

- 设置字段数量较多（21 个），每个都手动 `??` 回退。如果后续字段继续增加，这种模式可能需要重构为循环合并。`src/ui/viewer/hooks/useSettings.ts:23-51`
