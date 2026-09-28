# types.ts (context) 需求说明

> 源文件：src/services/context/types.ts | 类型：源码 | 行数：101 | 所属模块：context | 分析日期：2026-07-23

## 1. 文件定位总述

本文件是上下文注入子系统的核心类型定义模块，统一定义了上下文输入结构、配置接口、观察记录（Observation）、会话摘要（SessionSummary）、时间线项、Token 经济学指标以及终端颜色常量等。这些类型被 ContextService、SummaryRenderer、TokenCalculator 等上下文层模块广泛引用，是整个"记忆注入"功能的数据契约。

## 2. 功能需求

作为纯类型定义文件，不承载功能需求。核心能力是为上下文子系统提供类型安全的统一数据契约。

## 3. 业务规则与约束

- **Token 估算常量**：`CHARS_PER_TOKEN_ESTIMATE = 4`（每 token 约 4 个字符），被 TokenCalculator 用于估算观察记录的 token 消耗。`src/services/context/types.ts:99`
- **摘要前瞻窗口**：`SUMMARY_LOOKAHEAD = 1`，固定为 1，控制摘要时间线的显示范围。`src/services/context/types.ts:100`
- **ContextInput 的索引签名**：`[key: string]: any` 允许扩展字段，hook 传入的额外参数不会导致类型错误。`src/services/context/types.ts:10`
- **PriorMessages 结构**：固定包含 userMessage 和 assistantMessage 两个字段，用于在上下文中展示最近的对话对。`src/services/context/types.ts:81-84`

## 4. 对外暴露

| 名称 | 类型 | 说明 |
|------|------|------|
| `ContextInput` | 接口 | 上下文注入输入参数 |
| `ContextConfig` | 接口 | 上下文配置（计数、展示开关、过滤条件） |
| `Observation` | 接口 | 观察记录数据结构 |
| `SessionSummary` | 接口 | 会话摘要数据结构 |
| `SummaryTimelineItem` | 接口 | 摘要时间线展示项（扩展 SessionSummary） |
| `TimelineItem` | 联合类型 | 时间线条目（observation 或 summary） |
| `TokenEconomics` | 接口 | Token 经济学统计指标 |
| `PriorMessages` | 接口 | 最近对话对 |
| `colors` | 常量对象 | ANSI 终端颜色转义序列 |
| `CHARS_PER_TOKEN_ESTIMATE` | 常量 | 每 token 估算字符数（4） |
| `SUMMARY_LOOKAHEAD` | 常量 | 摘要前瞻窗口（1） |

## 5. 依赖关系

无外部依赖（纯类型定义文件，不导入其他模块）。

## 6. 数据结构

**ContextConfig**（核心配置结构）：
```typescript
{
  totalObservationCount: number;
  fullObservationCount: number;
  sessionCount: number;
  showReadTokens: boolean;
  showWorkTokens: boolean;
  showSavingsAmount: boolean;
  showSavingsPercent: boolean;
  observationTypes: Set<string>;
  observationConcepts: Set<string>;
  fullObservationField: 'narrative' | 'facts';
  showLastSummary: boolean;
  showLastMessage: boolean;
}
```

**Observation**（核心实体）：
```typescript
{
  id: number;
  memory_session_id: string;
  platform_source?: string;
  type: string;
  title: string | null;
  subtitle: string | null;
  narrative: string | null;
  facts: string | null;
  concepts: string | null;
  files_read: string | null;
  files_modified: string | null;
  discovery_tokens: number | null;
  created_at: string;
  created_at_epoch: number;
  project?: string;
}
```

**SessionSummary**（核心实体）：
```typescript
{
  id: number;
  memory_session_id: string;
  platform_source?: string;
  request: string | null;
  investigated: string | null;
  learned: string | null;
  completed: string | null;
  next_steps: string | null;
  created_at: string;
  created_at_epoch: number;
  project?: string;
}
```

## 7. 复杂逻辑图示

不适用（纯类型定义文件）。

## 8. 逆向备注

- 无逆向备注。
