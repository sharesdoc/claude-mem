# paths.ts 需求说明

> 源文件：src/shared/paths.ts ｜ 类型：源码 ｜ 行数：133 ｜ 所属模块：shared ｜ 分析日期：2026-07-23

## 1. 文件定位总述

本文件是系统路径解析的中央注册模块，负责推导和缓存所有关键目录与文件路径。它从环境变量、settings.json 和系统约定三个层级解析数据目录，进而派生出数据库、日志、向量库、配置文件等全部路径。几乎所有模块的文件操作都依赖此文件获取路径，是系统"地图"的核心。

## 2. 功能需求

| 编号 | 需求描述（系统应当…） | 触发条件 / 输入 | 处理规则与输出 | 证据 |
|------|----------------------|----------------|---------------|------|
| FR-paths-01 | 系统应当优先从环境变量获取数据目录 | `CLAUDE_MEM_DATA_DIR` 环境变量已设置 | 直接使用该值 | `src/shared/paths.ts:18-19` |
| FR-paths-02 | 系统应当在环境变量未设置时从 settings.json 读取数据目录 | 环境变量为空，settings.json 存在 | 读取 `settings.json` 的 `env.CLAUDE_MEM_DATA_DIR` 或顶层 `CLAUDE_MEM_DATA_DIR` | `src/shared/paths.ts:23-34` |
| FR-paths-03 | 系统应当使用 `~/.claude-mem` 作为默认数据目录 | 环境变量和 settings 均未配置 | 返回 `join(homedir(), '.claude-mem')` | `src/shared/paths.ts:22` |
| FR-paths-04 | 系统应当支持从环境变量获取 Claude 配置目录 | `CLAUDE_CONFIG_DIR` 已设置 | 使用该值，否则使用 `~/.claude` | `src/shared/paths.ts:40` |
| FR-paths-05 | 系统应当创建所有必要的数据子目录 | 调用 `ensureAllDataDirs()` | 递归创建 DATA_DIR 及其子目录：archives、logs、trash、backups、modes | `src/shared/paths.ts:73-79` |
| FR-paths-06 | 系统应当为文件创建带时间戳的备份文件名 | 传入原始文件路径 | 生成 `<原路径>.backup.<YYYY-MM-DD_HH-MM-SS>` 格式文件名 | `src/shared/paths.ts:100-108` |
| FR-paths-07 | 系统应当提供项目归档目录路径 | 传入项目名 | 返回 `$ARCHIVES_DIR/<projectName>` | `src/shared/paths.ts:61-63` |
| FR-paths-08 | 系统应当提供 worker Unix socket 路径 | 传入 session ID | 返回 `$DATA_DIR/worker-<sessionId>.sock` | `src/shared/paths.ts:65-67` |

## 3. 业务规则与约束

- 数据目录在模块加载时一次性解析并缓存为 `DATA_DIR` 常量，运行时不可变。`src/shared/paths.ts:39`
- settings.json 支持两种 schema：嵌套形式（`env` 键下）和扁平形式（顶层），优先检查嵌套形式。`src/shared/paths.ts:27`
- `paths` 对象以函数形式导出所有路径，延迟求值但结果不变（因为 `DATA_DIR` 已缓存）。`src/shared/paths.ts:110-133`

## 4. 对外暴露

| 导出名称 | 类型 | 说明 |
|---------|------|------|
| `DATA_DIR` | `string`（常量） | 核心数据目录 |
| `CLAUDE_CONFIG_DIR` | `string`（常量） | Claude 配置目录 |
| `MARKETPLACE_ROOT` | `string`（常量） | Marketplace 安装根目录 |
| `ARCHIVES_DIR` | `string`（常量） | 归档目录 |
| `LOGS_DIR` | `string`（常量） | 日志目录 |
| `TRASH_DIR` | `string`（常量） | 回收站目录 |
| `BACKUPS_DIR` | `string`（常量） | 备份目录 |
| `MODES_DIR` | `string`（常量） | 模式配置目录 |
| `USER_SETTINGS_PATH` | `string`（常量） | 用户 settings.json 路径 |
| `DB_PATH` | `string`（常量） | SQLite 数据库路径 |
| `VECTOR_DB_DIR` | `string`（常量） | 向量数据库目录 |
| `OBSERVER_SESSIONS_DIR` | `string`（常量） | 观察者会话目录 |
| `OBSERVER_SESSIONS_PROJECT` | `string`（常量） | 观察者会话项目标识 |
| `CLAUDE_SETTINGS_PATH` | `string`（常量） | Claude settings.json 路径 |
| `CLAUDE_COMMANDS_DIR` | `string`（常量） | Claude commands 目录 |
| `CLAUDE_MD_PATH` | `string`（常量） | Claude CLAUDE.md 路径 |
| `resolveDataDir` | `() => string` | 重新解析数据目录 |
| `getProjectArchiveDir` | `(name: string) => string` | 获取项目归档目录 |
| `getWorkerSocketPath` | `(sessionId: number) => string` | 获取 worker socket 路径 |
| `ensureDir` | `(dir: string) => void` | 确保目录存在 |
| `ensureAllDataDirs` | `() => void` | 确保所有数据子目录 |
| `ensureModesDir` | `() => void` | 确保 modes 目录 |
| `ensureAllClaudeDirs` | `() => void` | 确保 Claude 相关目录 |
| `getPackageRoot` | `() => string` | 获取包根目录 |
| `getPackageCommandsDir` | `() => string` | 获取包 commands 目录 |
| `createBackupFilename` | `(originalPath: string) => string` | 生成备份文件名 |
| `paths` | `const` 对象 | 路径函数集合（含 18 个路径方法） |

## 5. 依赖关系

- **Node.js 内置**：`path`、`os`、`fs`、`url`
- **内部依赖**：`./SettingsDefaultsManager.js`（仅用于类型导入，实际未调用）、`../utils/logger.js`

## 6. 数据结构

- `paths` 对象：包含 18 个返回字符串路径的函数，以 `as const` 标记为只读。涵盖：dataDir、workerPid、serverBeta 系列、settings、database、chroma、combinedCerts、transcripts 系列、syncState、corpora、supervisorRegistry、envFile、logsDir、archives、trash、backups、modes、vectorDb、observerSessions。`src/shared/paths.ts:110-133`

## 7. 复杂逻辑图示

```mermaid
flowchart TB
    A["resolveDataDir()"] --> B{"CLAUDE_MEM_DATA_DIR<br/>环境变量?"}
    B -->|已设置| C["返回环境变量值"]
    B -->|未设置| D["默认 ~/.claude-mem"]
    D --> E{"settings.json 存在?"}
    E -->|否| F["返回默认值"]
    E -->|是| G{"settings.env 或顶层<br/>有 CLAUDE_MEM_DATA_DIR?"}
    G -->|有| H["返回 settings 中的值"]
    G -->|无| F
```

## 8. 逆向备注

- `resolveDataDir` 中导入了 `SettingsDefaultsManager` 但实际未使用，推断是残留的冗余引用。`src/shared/paths.ts:5`
- `getDirname()` 函数处理 ESM 和 CommonJS 两种模块格式的 `__dirname` 获取。`src/shared/paths.ts:8-13`
