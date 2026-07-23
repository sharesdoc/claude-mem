# errors.ts 需求说明

> 源文件：src/services/worker/search/errors.ts ｜ 类型：源码（错误类型） ｜ 行数：10 ｜ 所属模块：worker/search ｜ 分析日期：2026-07-23

## 1. 文件定位总述

本文件定义了搜索子模块的专用错误类 `ChromaUnavailableError`，当 Chroma 向量数据库不可用时抛出。它继承自项目统一的 `AppError` 基类，携带 HTTP 503 状态码和 `CHROMA_UNAVAILABLE` 错误码。

## 2. 功能需求

| 编号 | 需求描述（系统应当…） | 触发条件 / 输入 | 处理规则与输出 | 证据 |
|------|----------------------|----------------|---------------|------|
| FR-SearchErr-01 | 系统应当定义 ChromaUnavailableError 错误类，携带 503 状态码和 CHROMA_UNAVAILABLE 错误码 | 代码初始化 | 继承 AppError，固定 statusCode=503, code='CHROMA_UNAVAILABLE' | `src/services/worker/search/errors.ts:4-9` |
| FR-SearchErr-02 | 系统应当在 ChromaUnavailableError 中可选保留原始错误信息 | 构造时传入 cause | 将 cause.message 存入 details 的 cause 字段 | `src/services/worker/search/errors.ts:6` |

## 3. 业务规则与约束

- **HTTP 503 语义**：Chroma 不可用被视为服务暂时不可用，而非客户端错误（`src/services/worker/search/errors.ts:6`）
- **错误码标识**：使用 `CHROMA_UNAVAILABLE` 作为程序化错误识别码，便于上层分类处理（`src/services/worker/search/errors.ts:6`）

## 4. 对外暴露

| 类别 | 名称 | 类型 | 说明 |
|------|------|------|------|
| 错误类 | ChromaUnavailableError | class | Chroma 服务不可用错误，statusCode=503 |

## 5. 依赖关系

- **上游**：`../../server/ErrorHandler.js`（AppError 基类）
- **下游**：搜索策略实现（ChromaSearchStrategy、HybridSearchStrategy）中检测 Chroma 连接失败时抛出

## 6. 数据结构

```typescript
class ChromaUnavailableError extends AppError {
  statusCode: 503;
  code: 'CHROMA_UNAVAILABLE';
  details?: { cause: string };  // 可选，来自原始错误
}
```

## 7. 复杂逻辑图示

不适用。

## 8. 逆向备注

推断：此错误类在 HybridSearchStrategy 中尤为关键——当 Chroma 不可用时，搜索策略可以优雅降级到纯 SQLite 搜索，而非直接失败。
