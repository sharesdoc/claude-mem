# settings.ts 需求说明

> 源文件：src/ui/viewer/constants/settings.ts ｜ 类型：源码（常量） ｜ 行数：33 ｜ 所属模块：ui/viewer ｜ 分析日期：2026-07-23

## 1. 文件定位总述

本文件定义 Viewer 前端设置面板的全部默认值常量。这些默认值涵盖 AI 模型选择、Worker 连接配置、上下文注入参数、UI 显示偏好和项目排除规则等 5 大类共 30 个配置项。作为设置面板的初始状态和数据校验基准，它与后端的 settings.json 配置保持一致的键名和值格式。

## 2. 功能需求

本文件以常量总述代替功能表格。系统应当通过 `DEFAULT_SETTINGS` 常量对象集中管理全部 30 个设置项的默认值，使用 `as const` 确保字面量类型收窄。配置项分为以下功能域：

1. **核心配置**：模型名称（claude-sonnet-4-6）、上下文观察数（50）、Worker 端口和主机
2. **多提供商配置**：Claude/Gemini/OpenRouter 三种 AI 提供商的 API Key、模型名和站点 URL
3. **上下文显示控制**：token 用量显示、节省金额/百分比显示的开关
4. **上下文注入参数**：全量注入计数/字段、会话注入计数、摘要和最后消息显示
5. **排除与格式**：排除项目列表、文件夹 MD 排除规则、处理时间显示

## 3. 业务规则与约束

| 编号 | 规则描述 | 证据 |
|------|---------|------|
| BR-ST-01 | 默认模型为 `claude-sonnet-4-6` | `src/ui/viewer/constants/settings.ts:2` |
| BR-ST-02 | 默认 Worker 端口为 37777，主机为 127.0.0.1（仅监听本地） | `src/ui/viewer/constants/settings.ts:4-5` |
| BR-ST-03 | 默认上下文观察数为 50 条 | `src/ui/viewer/constants/settings.ts:3` |
| BR-ST-04 | Gemini 速率限制默认启用（'true'），OpenRouter 默认免费模型（xiaomi/mimo-v2-flash:free） | `src/ui/viewer/constants/settings.ts:14,11` |
| BR-ST-05 | 所有布尔设置值使用字符串 'true'/'false' 而非布尔字面量 | `src/ui/viewer/constants/settings.ts:14-19,25-26,31` |
| BR-ST-06 | 排除项目和文件夹规则使用字符串/JSON 字符串格式 | `src/ui/viewer/constants/settings.ts:28-29` |

## 4. 对外暴露

| 导出项 | 类型 | 用途 |
|--------|------|------|
| `DEFAULT_SETTINGS` | const object | 全部设置项的默认值只读对象 |

### DEFAULT_SETTINGS 完整配置项

| 配置键 | 默认值 | 域 |
|--------|--------|------|
| CLAUDE_MEM_MODEL | 'claude-sonnet-4-6' | 核心 |
| CLAUDE_MEM_CONTEXT_OBSERVATIONS | '50' | 核心 |
| CLAUDE_MEM_WORKER_PORT | '37777' | 核心 |
| CLAUDE_MEM_WORKER_HOST | '127.0.0.1' | 核心 |
| CLAUDE_MEM_PROVIDER | 'claude' | 提供商 |
| CLAUDE_MEM_GEMINI_API_KEY | '' | 提供商 |
| CLAUDE_MEM_GEMINI_MODEL | 'gemini-2.5-flash-lite' | 提供商 |
| CLAUDE_MEM_OPENROUTER_API_KEY | '' | 提供商 |
| CLAUDE_MEM_OPENROUTER_MODEL | 'xiaomi/mimo-v2-flash:free' | 提供商 |
| CLAUDE_MEM_OPENROUTER_SITE_URL | '' | 提供商 |
| CLAUDE_MEM_OPENROUTER_APP_NAME | 'claude-mem' | 提供商 |
| CLAUDE_MEM_GEMINI_RATE_LIMITING_ENABLED | 'true' | 提供商 |
| CLAUDE_MEM_CONTEXT_SHOW_READ_TOKENS | 'false' | 显示控制 |
| CLAUDE_MEM_CONTEXT_SHOW_WORK_TOKENS | 'false' | 显示控制 |
| CLAUDE_MEM_CONTEXT_SHOW_SAVINGS_AMOUNT | 'false' | 显示控制 |
| CLAUDE_MEM_CONTEXT_SHOW_SAVINGS_PERCENT | 'true' | 显示控制 |
| CLAUDE_MEM_CONTEXT_FULL_COUNT | '0' | 注入参数 |
| CLAUDE_MEM_CONTEXT_FULL_FIELD | 'narrative' | 注入参数 |
| CLAUDE_MEM_CONTEXT_SESSION_COUNT | '10' | 注入参数 |
| CLAUDE_MEM_CONTEXT_SHOW_LAST_SUMMARY | 'true' | 注入参数 |
| CLAUDE_MEM_CONTEXT_SHOW_LAST_MESSAGE | 'false' | 注入参数 |
| CLAUDE_MEM_EXCLUDED_PROJECTS | '' | 排除 |
| CLAUDE_MEM_FOLDER_MD_EXCLUDE | '[]' | 排除 |
| CLAUDE_MEM_PROMPT_SHOW_PROCESSING_TIME | '1' | UI |

## 5. 依赖关系

- **被依赖**：Settings 面板组件、设置加载/保存逻辑

## 6. 数据结构

不适用（纯常量对象）。

## 7. 复杂逻辑图示

不适用。

## 8. 逆向备注

- 所有值均为字符串类型（包括数字和布尔），推断与后端 settings.json 的序列化格式一致（JSON 中一切皆为字符串键值对）。
- CLAUDE_MEM_CONTEXT_FULL_COUNT 默认为 '0'，推断 0 表示不启用全量注入。
- CLAUDE_MEM_FOLDER_MD_EXCLUDE 默认为 '[]'（JSON 数组的字符串表示），推断使用 JSON.parse 转换。
