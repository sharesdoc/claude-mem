# allowed-constants.ts 需求说明

> 源文件：src/services/server/allowed-constants.ts ｜ 类型：源码（常量定义） ｜ 行数：15 ｜ 所属模块：server ｜ 分析日期：2026-07-23

## 1. 文件定位总述

本文件定义了 Worker HTTP API 允许的操作类型和话题类型的白名单常量。这些常量用于对请求参数进行校验，确保只有预定义的合法值能通过验证。

## 2. 功能需求

| 编号 | 需求描述（系统应当…） | 触发条件 / 输入 | 处理规则与输出 | 证据 |
|------|----------------------|----------------|---------------|------|
| FR-Allowed-01 | 系统应当定义允许的操作类型白名单：search、context、summarize、import、export | 常量初始化 | `ALLOWED_OPERATIONS` 数组包含 5 个操作字符串 | `src/services/server/allowed-constants.ts:1-7` |
| FR-Allowed-02 | 系统应当定义允许的话题类型白名单：workflow、search_params、examples、all | 常量初始化 | `ALLOWED_TOPICS` 数组包含 4 个话题字符串 | `src/services/server/allowed-constants.ts:9-14` |

## 3. 业务规则与约束

- **操作类型约束**：仅允许 `search`、`context`、`summarize`、`import`、`export` 五种操作，超出此范围的操作将被拒绝（`src/services/server/allowed-constants.ts:1-7`）
- **话题类型约束**：仅允许 `workflow`、`search_params`、`examples`、`all` 四种话题（`src/services/server/allowed-constants.ts:9-14`）
- **推断**：`search_params` 话题暗示系统支持搜索参数的配置化，可能与搜索端点相关

## 4. 对外暴露

| 类别 | 名称 | 类型 | 说明 |
|------|------|------|------|
| 常量 | ALLOWED_OPERATIONS | `string[]` | 允许的操作类型列表 |
| 常量 | ALLOWED_TOPICS | `string[]` | 允许的话题类型列表 |

## 5. 依赖关系

- **上游**：无
- **下游**：Worker HTTP 中间件或路由处理逻辑，用于参数校验

## 6. 数据结构

```typescript
export const ALLOWED_OPERATIONS: string[] = ['search', 'context', 'summarize', 'import', 'export'];
export const ALLOWED_TOPICS: string[] = ['workflow', 'search_params', 'examples', 'all'];
```

## 7. 复杂逻辑图示

不适用。

## 8. 逆向备注

白名单策略表明系统采用显式允许而非黑名单过滤的安全模式，符合最小权限原则。
