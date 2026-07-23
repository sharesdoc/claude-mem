# types.ts (search) 需求说明

> 源文件：src/services/worker/search/types.ts | 类型：源码 | 行数：72 | 所属模块：worker/search | 分析日期：2026-07-23

## 1. 文件定位总述

本文件是搜索子系统的类型定义中心，统一定义了搜索相关的所有数据结构、常量和类型别名。它从 `sqlite/types.ts` 重新导出基础搜索类型，并在此之上扩展了 Chroma 向量搜索结果类型、组合搜索结果类型、搜索策略提示、扩展搜索选项等高层抽象。这些类型贯穿搜索管线，被 DateFilter、SearchService、路由处理器等模块共同引用。

## 2. 功能需求

作为纯类型文件，不承载功能需求。核心能力是为搜索子系统提供类型安全的统一契约。

## 3. 业务规则与约束

- **搜索常量**：`RECENCY_WINDOW_DAYS` 为 90 天（对应的毫秒数 `RECENCY_WINDOW_MS`），`DEFAULT_LIMIT` 为 20 条，`CHROMA_BATCH_SIZE` 为 100。所有常量通过 `as const` 声明为只读。`src/services/worker/search/types.ts:6-11`

## 4. 对外暴露

| 名称 | 类型 | 说明 |
|------|------|------|
| `SEARCH_CONSTANTS` | 常量对象 | 搜索相关常量（时间窗口、默认限制、Chroma 批量大小） |
| `ChromaDocType` | 类型别名 | Chroma 文档类型（'observation'/'session_summary'/'user_prompt'） |
| `ChromaQueryResult` | 接口 | Chroma 向量查询结果（ids + distances + metadatas） |
| `ChromaMetadata` | 接口 | Chroma 文档元数据结构 |
| `SearchResult` | 类型别名 | 三种搜索结果的联合类型 |
| `SearchResults` | 接口 | 分类搜索结果集合 |
| `ExtendedSearchOptions` | 接口 | 扩展搜索选项（含类型/概念/文件过滤、输出格式） |
| `SearchStrategyHint` | 类型别名 | 搜索策略提示（'chroma'/'sqlite'/'hybrid'/'auto'） |
| `StrategySearchOptions` | 接口 | 策略搜索选项（扩展选项 + 查询文本 + 策略提示） |
| `StrategySearchResult` | 接口 | 策略搜索结果（含实际使用的策略和是否使用了 Chroma） |
| `CombinedResult` | 接口 | 统一搜索结果包装（含类型标签、数据和时间戳） |

## 5. 依赖关系

- **sqlite/types.ts**：提供 ObservationSearchResult、SessionSummarySearchResult、UserPromptSearchResult、SearchOptions、DateRange 基础类型

## 6. 数据结构

**ChromaMetadata**（核心结构）：
```typescript
{
  sqlite_id: number;
  doc_type: ChromaDocType;
  memory_session_id: string;
  project: string;
  created_at_epoch: number;
  type?: string;           // 观察类型
  title?: string;
  subtitle?: string;
  concepts?: string;
  files_read?: string;
  files_modified?: string;
  field_type?: string;     // 摘要字段类型
  prompt_number?: number;
}
```

**CombinedResult**（统一结果）：
```typescript
{
  type: 'observation' | 'session' | 'prompt';
  data: SearchResult;
  epoch: number;
  created_at: string;
}
```

## 7. 复杂逻辑图示

不适用（纯类型定义文件）。

## 8. 逆向备注

- 无逆向备注。
