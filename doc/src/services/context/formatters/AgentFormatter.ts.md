# AgentFormatter.ts 需求说明

> 源文件：src/services/context/formatters/AgentFormatter.ts ｜ 类型：源码 ｜ 行数：173 ｜ 所属模块：context/formatters ｜ 分析日期：2026-07-23

## 1. 文件定位总述

AgentFormatter 是面向 AI（Agent/LLM）的上下文格式化器，负责生成 Claude 会话注入上下文中的各个段落。它是 ContextBuilder 渲染管道中的核心格式化组件，输出包括：项目头部（含日期时间）、类型图例说明、token 经济统计、日期标题、观察记录表格行/展开详情、会话摘要项、先前对话段落、页脚访问提示和空状态消息。所有输出均为纯文本 Markdown 行数组，专为 LLM token 效率优化。

## 2. 功能需求

| 编号 | 需求描述（系统应当…） | 触发条件 / 输入 | 处理规则与输出 | 证据 |
|------|----------------------|----------------|---------------|------|
| FR-HEADER-01 | 系统应当生成项目上下文头部 | 调用 `renderAgentHeader(project)` | 输出 `# [project] recent context, YYYY-MM-DD h:mmPM TZ` 格式标题 | `AgentFormatter.ts:24-29` |
| FR-LEGEND-01 | 系统应当生成类型图例说明 | 调用 `renderAgentLegend()` | 输出包含 session 目标图标和所有 observation 类型的 emoji+id 对照说明，以及格式说明和操作指引 | `AgentFormatter.ts:31-41` |
| FR-ECONOMICS-01 | 系统应当生成 token 经济统计 | 调用 `renderAgentContextEconomics(economics, config)` | 输出 `Stats: N obs (Kt read) | Kt work | X% savings` 格式；savings 显示受 config.showSavingsPercent/showSavingsAmount 控制 | `AgentFormatter.ts:51-74` |
| FR-DAYHDR-01 | 系统应当生成日期分组标题 | 调用 `renderAgentDayHeader(day)` | 输出 `### YYYY-MM-DD` 格式 | `AgentFormatter.ts:76-80` |
| FR-TBLROW-01 | 系统应当将观察记录渲染为紧凑表格行 | 调用 `renderAgentTableRow(obs, timeDisplay, config)` | 输出 `ID TIME ICON TITLE` 格式；时间为空时显示 `"`；标题为空时显示 Untitled | `AgentFormatter.ts:90-100` |
| FR-FULLOBS-01 | 系统应当将观察记录展开为详情块 | 调用 `renderAgentFullObservation(obs, time, detail, config)` | 输出粗体 ID+时间+图标+标题、详情文本（narrative/facts）、可选 token 信息行 | `AgentFormatter.ts:102-132` |
| FR-SUMMARY-01 | 系统应当渲染会话摘要项 | 调用 `renderAgentSummaryItem(summary, time)` | 输出 `S{id} request (time)` 格式 | `AgentFormatter.ts:134-141` |
| FR-SUMFLD-01 | 系统应当渲染摘要字段 | 调用 `renderAgentSummaryField(label, value)` | 值为空时返回空数组；非空时输出 `**label**: value` 格式 | `AgentFormatter.ts:143-146` |
| FR-PREVIOUS-01 | 系统应当渲染先前对话段落 | 调用 `renderAgentPreviouslySection(prior)` | assistantMessage 为空时返回空数组；非空时输出分隔线+**Previously**+助手回复 | `AgentFormatter.ts:148-160` |
| FR-FOOTER-01 | 系统应当生成页脚访问提示 | 调用 `renderAgentFooter(totalDiscovery, totalRead)` | 输出 `Access Nk tokens of past work via get_observations or mem-search skill` 格式 | `AgentFormatter.ts:162-168` |
| FR-EMPTY-01 | 系统应当生成空状态消息 | 调用 `renderAgentEmptyState(project)` | 输出 `# [project] recent context, datetime\n\nNo previous sessions found.` | `AgentFormatter.ts:170-172` |

## 3. 业务规则与约束

- **时间格式**：使用 `en-US` locale 的小时+两位分钟+AM/PM，AM/PM 无空格且小写（如 `3:30pm`）(`AgentFormatter.ts:86-88`)
- **日期时间格式**：`en-CA` locale 日期 + 时间 + 时区缩写（如 `2025-01-15 3:30pm EST`）(`AgentFormatter.ts:12-21`)
- **token 统计显示控制**：showReadTokens 和 showWorkTokens 分别控制对应列的显示 (`AgentFormatter.ts:120-127`)
- **savings 优先级**：showSavingsPercent 优先于 showSavingsAmount，二者不会同时显示 (`AgentFormatter.ts:63-66`)
- **空值处理**：时间显示为空时用 `"` 代替（视觉占位），标题为空时用 `Untitled` (`AgentFormatter.ts:97,95`)

## 4. 对外暴露

| 导出函数 | 签名 | 说明 |
|---------|------|------|
| `renderAgentHeader` | `(project): string[]` | 项目头部 |
| `renderAgentLegend` | `(): string[]` | 类型图例 |
| `renderAgentColumnKey` | `(): string[]` | 列说明（当前返回空数组） |
| `renderAgentContextIndex` | `(): string[]` | 上下文索引（当前返回空数组） |
| `renderAgentContextEconomics` | `(economics, config): string[]` | token 经济统计 |
| `renderAgentDayHeader` | `(day): string[]` | 日期标题 |
| `renderAgentFileHeader` | `(file): string[]` | 文件头（当前返回空数组） |
| `renderAgentTableRow` | `(obs, time, config): string` | 紧凑表格行 |
| `renderAgentFullObservation` | `(obs, time, detail, config): string[]` | 展开详情 |
| `renderAgentSummaryItem` | `(summary, time): string[]` | 摘要项 |
| `renderAgentSummaryField` | `(label, value): string[]` | 摘要字段 |
| `renderAgentPreviouslySection` | `(prior): string[]` | 先前对话 |
| `renderAgentFooter` | `(discovery, read): string[]` | 页脚 |
| `renderAgentEmptyState` | `(project): string` | 空状态 |

## 5. 依赖关系

- **核心依赖**：`ModeManager`（获取类型图标和 emoji）
- **工具依赖**：`formatObservationTokenDisplay`（token 显示格式化）
- **上游调用**：TimelineRenderer、ContextBuilder
- **类型依赖**：`Observation`、`ContextConfig`、`TokenEconomics`、`PriorMessages`

## 6. 数据结构

无自定义数据结构，消费 ContextBuilder 类型系统中的接口。

## 7. 复杂逻辑图示

不适用（该文件为一系列独立的格式化函数，每个函数逻辑线性无复杂分支）。

## 8. 逆向备注

- `renderAgentColumnKey` 和 `renderAgentContextIndex` 返回空数组，是预留但未实现的格式化方法 (`AgentFormatter.ts:43-49`)。
- `renderAgentFileHeader` 同样返回空数组——Agent 模式不按文件分组（与 Human 模式不同），文件信息仅在展开详情中可能涉及 (`AgentFormatter.ts:82-84`)。
- `renderAgentFooter` 中的 token 数量以千为单位展示（`Math.round(totalDiscoveryTokens / 1000)`），使用 `k` 后缀 (`AgentFormatter.ts:163`)。
- `renderAgentPreviouslySection` 使用 `---` 分隔线将先前对话与当前上下文视觉分离 (`AgentFormatter.ts:153`)。
