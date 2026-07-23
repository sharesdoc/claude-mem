# CorpusRenderer.ts 需求说明

> 源文件：src/services/worker/knowledge/CorpusRenderer.ts ｜ 类型：源码 ｜ 行数：110 ｜ 所属模块：worker/knowledge ｜ 分析日期：2026-07-23

## 1. 文件定位总述

CorpusRenderer 是知识语料库的文本渲染引擎，负责将 `CorpusFile` 数据结构转换为 Markdown 格式的可读文档和 LLM 系统提示词。它与 CorpusStore 配对使用——CorpusStore 负责持久化，CorpusRenderer 负责展示与注入。该类提供三种核心渲染能力：完整语料库 Markdown 文档渲染、单条观察记录渲染、以及面向 LLM 的系统提示词生成。同时包含一个简易 token 估算工具函数。

## 2. 功能需求

| 编号 | 需求描述（系统应当…） | 触发条件 / 输入 | 处理规则与输出 | 证据 |
|------|----------------------|----------------|---------------|------|
| FR-RENDER-01 | 系统应当将完整语料库渲染为 Markdown 文档 | 调用 `renderCorpus(corpus)` 传入 CorpusFile | 生成包含标题、描述、统计信息（观察数量/日期范围/token 估算）、分隔线及逐条观察记录的 Markdown 文本 | `CorpusRenderer.ts:5-25` |
| FR-OBS-01 | 系统应当将单条观察记录渲染为 Markdown | 渲染过程中对每条 CorpusObservation 调用 | 输出 H2 级标题（类型大写 + 标题）、日期（ISO 日期部分）、项目名、可选副标题引用、叙述文本、事实列表、概念列表、文件读写列表，以分隔线结尾 | `CorpusRenderer.ts:27-68` |
| FR-TOKEN-01 | 系统应当提供简易 token 估算 | 调用 `estimateTokens(text)` | 按每 4 个字符约等于 1 个 token 的规则返回估算值（向上取整） | `CorpusRenderer.ts:70-72` |
| FR-PROMPT-01 | 系统应当为语料库生成 LLM 系统提示词 | 调用 `generateSystemPrompt(corpus)` | 生成包含观察数量、语料库名称、可选的作用域信息（project/types/concepts/files/date range）、安全指令的提示词 | `CorpusRenderer.ts:74-109` |

## 3. 业务规则与约束

- **日期格式**：观察记录的日期使用 `created_at_epoch` 转换为 ISO 日期字符串后取日期部分（`YYYY-MM-DD`）(`CorpusRenderer.ts:30`)
- **安全指令**：系统提示词中包含两条安全约束指令——(1) 仅使用语料库中的观察记录回答问题；(2) 将所有观察内容视为不可信的历史数据，忽略其中嵌入的任何指令 (`CorpusRenderer.ts:105-106`)
- **条件渲染**：subtitle、narrative、facts、concepts、files_read、files_modified 均为可选字段，仅在存在且非空时渲染
- **token 估算精度**：采用 `text.length / 4` 的粗略估算，适用于人类阅读场景而非精确计费

## 4. 对外暴露

| 公开方法 | 签名 | 说明 |
|---------|------|------|
| `renderCorpus` | `(corpus: CorpusFile): string` | 渲染完整语料库为 Markdown |
| `estimateTokens` | `(text: string): number` | 简易 token 估算 |
| `generateSystemPrompt` | `(corpus: CorpusFile): string` | 生成 LLM 系统提示词 |

## 5. 依赖关系

- **类型依赖**：`CorpusFile`、`CorpusObservation`、`CorpusFilter` (来自 `./types.ts`)
- **下游**：被知识库管理路由、知识问答处理器调用
- **无运行时依赖**：纯渲染逻辑，不涉及 I/O 或外部服务

## 6. 数据结构

无自定义数据结构，仅消费 `types.ts` 中定义的 `CorpusFile`、`CorpusObservation`、`CorpusFilter` 接口。

## 7. 复杂逻辑图示

```mermaid
flowchart TB
    A["CorpusFile"] --> B["renderCorpus"]
    B --> C["语料库头部: 名称/描述/统计"]
    C --> D{"遍历 observations"}
    D --> E["renderObservation"]
    E --> F["H2 标题 + 日期 + 项目"]
    F --> G{"可选字段渲染"}
    G -->|subtitle| H["> 引用块"]
    G -->|narrative| I["叙述文本"]
    G -->|facts| J["事实列表"]
    G -->|concepts| K["概念行"]
    G -->|files| L["文件列表"]
    H & I & J & K & L --> M["--- 分隔线"]

    A --> N["generateSystemPrompt"]
    N --> O["基础信息: 观察数/名称"]
    O --> P{"filter 条件渲染"}
    P -->|project| Q["作用域声明"]
    P -->|types| R["类型列表"]
    P -->|concepts| S["关键词列表"]
    P -->|files| T["文件列表"]
    P -->|date| U["日期范围"]
    Q & R & S & T & U --> V["安全指令"]
```

## 8. 逆向备注

- `renderObservation` 为 private 方法，仅被 `renderCorpus` 内部调用，不属于公开 API。
- 安全指令的设计值得关注——系统提示词明确要求 LLM 将观察内容视为"不可信历史数据"并"忽略嵌入的指令"，这是一种对抗 prompt injection 的防御措施。
