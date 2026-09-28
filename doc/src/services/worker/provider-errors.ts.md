# provider-errors.ts 需求说明

> 源文件：src/services/worker/provider-errors.ts ｜ 类型：源码 ｜ 行数：33 ｜ 所属模块：worker ｜ 分析日期：2026-07-23

## 1. 文件定位总述

本文件是 Worker 服务对 AI 提供商调用错误的统一分类模型。它定义了一个开放联合类型 `ProviderErrorClass`，涵盖瞬时故障、不可恢复错误、速率限制、配额耗尽、认证失效等已知类别，同时允许提供商扩展自定义类别。`ClassifiedProviderError` 类封装了错误分类、可选的 `retryAfterMs` 重试延迟和原始原因，供上游调用方据此做出重试/降级决策。`isClassified` 类型守卫函数为调用方提供安全的类型判断能力。

## 2. 功能需求

| 编号 | 需求描述（系统应当…） | 触发条件 / 输入 | 处理规则与输出 | 证据 |
|------|----------------------|----------------|---------------|------|
| FR-PE-01 | 系统应当提供一组预定义的错误分类枚举，覆盖瞬时/不可恢复/速率限制/配额耗尽/认证失效五类 | 编译期常量定义 | 导出类型 `ProviderErrorClass` 为开放联合类型（`string & {}` 允许扩展） | `src/services/worker/provider-errors.ts:2-8` |
| FR-PE-02 | 系统应当提供一个可实例化的分类错误类，携带错误分类标签、原始原因及可选重试延迟 | 调用方构造 `new ClassifiedProviderError(message, opts)` | 设置 `name='ClassifiedProviderError'`，将 `kind`、`cause`、`retryAfterMs`（可选）挂载到实例 | `src/services/worker/provider-errors.ts:10-28` |
| FR-PE-03 | 系统应当提供类型守卫函数，安全判断任意值是否为已分类错误 | 调用 `isClassified(err)` | 通过 `instanceof` 判断返回布尔值，TypeScript 编译器将收窄类型至 `ClassifiedProviderError` | `src/services/worker/provider-errors.ts:30-32` |

## 3. 业务规则与约束

| 编号 | 规则描述 | 证据 |
|------|---------|------|
| BR-PE-01 | `ProviderErrorClass` 是开放联合类型（末尾 `(string & {})`），不阻止外部代码传入自定义字符串值 | `src/services/worker/provider-errors.ts:8` |
| BR-PE-02 | `retryAfterMs` 仅在显式传入非 `undefined` 时才设置，否则该字段保持未定义 | `src/services/worker/provider-errors.ts:24-26` |
| BR-PE-03 | `cause` 字段类型为 `unknown`，可承载任意原始错误对象 | `src/services/worker/provider-errors.ts:13` |

## 4. 对外暴露

| 导出项 | 类型 | 用途 |
|--------|------|------|
| `ProviderErrorClass` | 类型别名（联合类型） | 错误分类枚举，用于标注错误严重度 |
| `ClassifiedProviderError` | 类（extends Error） | 可抛出的分类错误对象 |
| `isClassified` | 函数 | 类型守卫，判断错误是否已分类 |

## 5. 依赖关系

- **无上游依赖**：本文件为纯类型/类定义，不引入任何外部模块
- **下游消费者**：推断被 Worker 的 AI 提供商调用层引用，用于构造和判断分类错误

## 6. 数据结构

```typescript
type ProviderErrorClass = 'transient' | 'unrecoverable' | 'rate_limit' | 'quota_exhausted' | 'auth_invalid' | (string & {});

class ClassifiedProviderError extends Error {
  readonly kind: ProviderErrorClass;
  readonly retryAfterMs?: number;
  readonly cause: unknown;
}
```

## 7. 复杂逻辑图示

不适用（文件仅含类型定义和简单构造函数）。

## 8. 逆向备注

- `ProviderErrorClass` 的开放联合设计允许未来新增错误类别而不破坏已有代码，但缺少运行时校验，调用方可传入任意字符串作为 `kind`。
- `ClassifiedProviderError` 未重写 `toString()` 方法，输出格式依赖 `Error` 原生实现。
