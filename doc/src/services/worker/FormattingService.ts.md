# FormattingService.ts 需求说明

> 源文件：src/services/worker/FormattingService.ts ｜ 类型：源码 ｜ 行数：125 ｜ 所属模块：worker ｜ 分析日期：2026-07-23

## 1. 文件定位总述

FormattingService 是搜索结果的文本格式化服务，负责将 observations、sessions、user prompts 三类搜索结果数据渲染为 Markdown 表格行和辅助信息（如表头、搜索提示）。它支持两种格式化模式：索引模式（紧凑摘要）和搜索结果模式（含时间去重显示），并提供搜索策略提示文本。该服务是搜索 API 响应格式化的唯一出口，确保搜索结果在 Claude 对话中以一致的表格形式呈现。

## 2. 功能需求

| 编号 | 需求描述（系统应当…） | 触发条件 / 输入 | 处理规则与输出 | 证据 |
|------|----------------------|----------------|---------------|------|
| FR-TIPS-01 | 系统应当生成搜索策略提示文本 | 调用 `formatSearchTips()` | 返回包含搜索策略说明和过滤参数示例的多行 Markdown 文本 | `FormattingService.ts:9-19` |
| FR-OBSIDX-01 | 系统应当将观察记录格式化为索引表格行 | 调用 `formatObservationIndex(obs, index)` | 渲染为 `| #ID | 时间 | 类型图标 | 标题 | ~token估算 | 工作量显示 |` 格式 | `FormattingService.ts:38-49` |
| FR-SESIDX-01 | 系统将会话格式化为索引表格行 | 调用 `formatSessionIndex(session, index)` | 渲染为 `| #SID | 时间 | 目标图标 | 请求/ID | - | - |` 格式 | `FormattingService.ts:51-58` |
| FR-PMTIDX-01 | 系统应当将用户提示格式化为索引表格行 | 调用 `formatUserPromptIndex(prompt, index)` | 渲染为 `| #PID | 时间 | 对话图标 | 截断文本 | - | - |` 格式；文本超 60 字符截断 | `FormattingService.ts:60-69` |
| FR-TBLHDR-01 | 系统应当提供两种表头格式 | 调用 `formatTableHeader()` 或 `formatSearchTableHeader()` | 6 列版本和 5 列版本（不含 Work 列） | `FormattingService.ts:71-79` |
| FR-OBSSEARCH-01 | 系统应当将观察记录格式化为搜索结果行 | 调用 `formatObservationSearchRow(obs, lastTime)` | 与前一条时间相同时显示 `″` 代替时间，返回 row 和更新后的 time | `FormattingService.ts:81-94` |
| FR-SESSEARCH-01 | 系统应当将会话格式化为搜索结果行 | 调用 `formatSessionSearchRow(session, lastTime)` | 同上时间压缩逻辑 | `FormattingService.ts:96-108` |
| FR-PMTSEARCH-01 | 系统应当将用户提示格式化为搜索结果行 | 调用 `formatUserPromptSearchRow(prompt, lastTime)` | 同上时间压缩逻辑 | `FormattingService.ts:110-124` |

## 3. 业务规则与约束

- **token 估算规则**：按 `(title.length + subtitle.length + narrative.length + facts.length) / 4` 估算读取 token 数 (`FormattingService.ts:31-36`)
- **时间压缩**：搜索结果模式中，当时间与上一条相同时显示 `″` 代替完整时间，节省 token 消耗 (`FormattingService.ts:88,97,119`)
- **文本截断**：用户提示文本超过 60 字符时截断为 57 字符加 `...` (`FormattingService.ts:64-66`)
- **时间格式**：使用 `en-US` locale 的数字小时 + 两位分钟 + AM/PM 格式 (`FormattingService.ts:23-28`)
- **索引 ID 前缀**：观察记录 `#ID`，会话 `#SID`，提示 `#PID` (`FormattingService.ts:40,53,62`)
- **工作量显示**：使用 ModeManager 获取类型对应的 emoji 和 discovery_tokens 值；无工作量时显示 `-` (`FormattingService.ts:44-46`)

## 4. 对外暴露

| 公开方法 | 签名 | 说明 |
|---------|------|------|
| `formatSearchTips` | `(): string` | 搜索策略提示文本 |
| `formatObservationIndex` | `(obs, index): string` | 观察记录索引行 |
| `formatSessionIndex` | `(session, index): string` | 会话索引行 |
| `formatUserPromptIndex` | `(prompt, index): string` | 用户提示索引行 |
| `formatTableHeader` | `(): string` | 6 列表头 |
| `formatSearchTableHeader` | `(): string` | 5 列表头 |
| `formatObservationSearchRow` | `(obs, lastTime): {row, time}` | 观察搜索结果行 |
| `formatSessionSearchRow` | `(session, lastTime): {row, time}` | 会话搜索结果行 |
| `formatUserPromptSearchRow` | `(prompt, lastTime): {row, time}` | 提示搜索结果行 |

## 5. 依赖关系

- **核心依赖**：`ModeManager`（获取类型图标和 emoji）
- **类型依赖**：`ObservationSearchResult`、`SessionSummarySearchResult`、`UserPromptSearchResult`
- **上游调用**：搜索 API 处理器

## 6. 数据结构

无自定义数据结构，消费搜索结果类型。

## 7. 复杂逻辑图示

该文件为纯格式化工具类，逻辑线性无复杂分支，不需要流程图。

## 8. 逆向备注

- `formatObservationIndex` 和 `formatObservationSearchRow` 的区别在于：索引模式固定显示完整时间和工作量列，搜索模式支持时间压缩但不含工作量列。
- `_index` 参数在所有 format 方法中未被使用（以下划线前缀标记），但保留在签名中可能是为了未来扩展（如行号标注）。
- 每字符 4 token 的估算规则与 CorpusRenderer 中的 `estimateTokens` 一致，但这里的估算范围仅包含 title/subtitle/narrative/facts，不含 concepts 和 files。
