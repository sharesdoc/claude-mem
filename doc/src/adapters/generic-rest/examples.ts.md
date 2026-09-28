# examples.ts 需求说明

> 源文件：src/adapters/generic-rest/examples.ts ｜ 类型：源码 ｜ 行数：42 ｜ 所属模块：adapters/generic-rest ｜ 分析日期：2026-07-23

## 1. 文件定位总述

本文件是 Generic REST 适配器的示例数据集，为外部系统通过 REST API 向 claude-mem 提交事件提供可参考的 JSON payload 模板。它以 `as const` 不可变对象的形式导出三组示例——codex 观测、opencode 观测和手动记忆——覆盖了不同平台来源和不同事件类型的典型数据结构。本文件不包含任何业务逻辑，仅作为类型契约的文档化展示。

## 2. 功能需求

| 编号 | 需求描述（系统应当…） | 触发条件 / 输入 | 处理规则与输出 | 证据 |
|------|----------------------|----------------|---------------|------|
| FR-EXAMPLE-01 | 系统应当导出一组 Codex 平台的观测事件示例数据 | 模块导入时 | 返回包含 projectId、sourceType 为 `api`、eventType 为 `observation.created`、payload 含 tool_name/tool_input/tool_response/platformSource/agentId 等字段的对象 | `src/adapters/generic-rest/examples.ts:3-20` |
| FR-EXAMPLE-02 | 系统应当导出一组 OpenCode 平台的观测事件示例数据 | 模块导入时 | 返回与 Codex 示例结构一致但 platformSource 为 `opencode`、tool_name 为 `edit` 的对象 | `src/adapters/generic-rest/examples.ts:21-33` |
| FR-EXAMPLE-03 | 系统应当导出一组手动记忆（manual/note）类型的事件示例数据 | 模块导入时 | 返回 kind 为 `manual`、type 为 `note`、含 title/narrative/facts 字段的对象，无 sourceType 和 eventType | `src/adapters/generic-rest/examples.ts:34-42` |

## 3. 业务规则与约束

- 所有示例对象使用 `as const` 声明，确保导出后为只读类型，不允许运行时修改 `src/adapters/generic-rest/examples.ts:42`
- Codex 和 OpenCode 示例共享相同的顶层结构（projectId, sourceType, eventType, contentSessionId, payload, occurredAtEpoch），区别在于 payload 内容 `src/adapters/generic-rest/examples.ts:4-33`
- 手动记忆示例的顶层字段（projectId, kind, type, title, narrative, facts）与观测事件结构不同，属于独立的事件类型契约 `src/adapters/generic-rest/examples.ts:34-42`

## 4. 对外暴露

| 导出名 | 类型 | 用途 |
|--------|------|------|
| `genericRestEventExamples` | `as const` 对象（含 codexObservation, opencodeObservation, customMemory 三个属性） | 为 Generic REST 适配器提供 JSON payload 模板参考 |

## 5. 依赖关系

**无依赖**：本文件不导入任何外部模块。

## 6. 数据结构

```typescript
genericRestEventExamples = {
  codexObservation: {
    projectId, sourceType: 'api', eventType: 'observation.created',
    contentSessionId, payload: { platformSource, tool_name, cwd, agentId, agentType, toolUseId, tool_input, tool_response },
    occurredAtEpoch
  },
  opencodeObservation: {
    projectId, sourceType: 'api', eventType: 'observation.created',
    contentSessionId, payload: { platformSource: 'opencode', tool_name: 'edit', cwd, toolUseId },
    occurredAtEpoch
  },
  customMemory: {
    projectId, kind: 'manual', type: 'note', title, narrative, facts[]
  }
}
```

## 7. 复杂逻辑图示

不适用——本文件为纯数据定义，无逻辑分支。

## 8. 逆向备注

- `occurredAtEpoch` 使用固定值 `1760000000000` 作为占位时间戳，实际使用时应替换为真实毫秒级 epoch `src/adapters/generic-rest/examples.ts:19,32`
- 手动记忆示例缺少 `contentSessionId` 和 `occurredAtEpoch`，推断该类型事件可能通过不同路由注入 `src/adapters/generic-rest/examples.ts:34-42`
