# store.ts 需求说明

> 源文件：src/services/sqlite/prompts/store.ts ｜ 类型：源码（数据存储） ｜ 行数：23 ｜ 所属模块：sqlite/prompts ｜ 分析日期：2026-07-23

## 1. 文件定位总述

本文件负责将用户提示词持久化到 SQLite 的 `user_prompts` 表中。它接收会话 ID、提示序号和提示文本，写入数据库并返回自增行 ID。这是观察捕获流程中的关键写入环节，为后续的隐私检查和上下文生成提供原始用户输入数据。

## 2. 功能需求

| 编号 | 需求描述（系统应当…） | 触发条件 / 输入 | 处理规则与输出 | 证据 |
|------|----------------------|----------------|---------------|------|
| FR-PromptStore-01 | 系统应当将用户提示词插入 user_prompts 表并返回自增行 ID | saveUserPrompt 被调用，传入 db、contentSessionId、promptNumber、promptText | INSERT INTO user_prompts，写入 content_session_id、prompt_number、prompt_text、created_at（ISO）、created_at_epoch（毫秒时间戳），返回 lastInsertRowid | `src/services/sqlite/prompts/store.ts:5-22` |
| FR-PromptStore-02 | 系统应当在写入时同时记录 ISO 格式时间和 Unix 毫秒时间戳 | INSERT 执行 | created_at 为 `now.toISOString()`，created_at_epoch 为 `now.getTime()` | `src/services/sqlite/prompts/store.ts:11-13,20` |

## 3. 业务规则与约束

- **双时间戳策略**：同时存储 ISO 可读时间和 Unix epoch 毫秒时间戳，前者便于展示，后者便于排序和计算（`src/services/sqlite/prompts/store.ts:11-13,20`）
- **使用 Bun SQLite**：Database 类型来自 `bun:sqlite`，表明数据层使用 Bun 运行时的 SQLite 实现（`src/services/sqlite/prompts/store.ts:2`）

## 4. 对外暴露

| 类别 | 名称 | 类型 | 说明 |
|------|------|------|------|
| 函数 | saveUserPrompt | `(db: Database, contentSessionId: string, promptNumber: number, promptText: string) => number` | 保存用户提示词并返回行 ID |

## 5. 依赖关系

- **上游**：`bun:sqlite`（Database 类型）、`../../../utils/logger.js`
- **下游**：Worker hook 处理器（在 UserPromptSubmit 阶段调用）

## 6. 数据结构

```typescript
// user_prompts 表字段（推断自 INSERT 语句）
interface UserPromptsRow {
  id: number;                    // 自增主键
  content_session_id: string;   // 关联会话 ID
  prompt_number: number;         // 提示序号
  prompt_text: string;           // 提示文本
  created_at: string;            // ISO 格式时间
  created_at_epoch: number;      // Unix 毫秒时间戳
}
```

## 7. 复杂逻辑图示

不适用。

## 8. 逆向备注

- 推断：`prompt_number` 用于维护同一会话内提示词的顺序，与 `contentSessionId` 组合可唯一标识一个提示。
- logger 已导入但本文件中未使用，推断在其他操作函数或未来扩展中使用。
