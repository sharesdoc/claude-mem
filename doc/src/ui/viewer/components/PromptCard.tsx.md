# PromptCard.tsx 需求说明

> 源文件：src/ui/viewer/components/PromptCard.tsx ｜ 类型：源码 ｜ 行数：143 ｜ 所属模块：viewer/components ｜ 分析日期：2026-07-23

## 1. 文件定位总述

PromptCard 是 Feed 列表中展示用户输入提示词的卡片组件。它提供复制和删除两项操作，显示处理时间（processing_time_display）、平台来源和用户信息。复制使用 Clipboard API 并带有 2 秒的视觉反馈，删除通过 API 调用后通过回调通知父组件更新列表。

## 2. 功能需求

| 编号 | 需求描述（系统应当…） | 触发条件 / 输入 | 处理规则与输出 | 证据 |
|------|----------------------|----------------|---------------|------|
| FR-PC-01 | 系统应当显示提示词的完整文本 | 渲染卡片 | 在 card-content 区域显示 `prompt.prompt_text` | `src/ui/viewer/components/PromptCard.tsx:97-98` |
| FR-PC-02 | 系统应当提供一键复制提示词功能 | 用户点击复制按钮 | 优先使用 `navigator.clipboard.writeText`，降级为 textarea+execCommand 方案 | `src/ui/viewer/components/PromptCard.tsx:46-68` |
| FR-PC-03 | 系统应当在复制成功后显示 2 秒确认反馈 | 复制操作完成 | 设置 `copied = true`，2 秒后自动恢复 | `src/ui/viewer/components/PromptCard.tsx:67` |
| FR-PC-04 | 系统应当提供删除提示词功能 | 用户点击删除按钮 | 调用 `authFetch DELETE /api/prompt/{id}`，成功后调用 onDeleted 回调 | `src/ui/viewer/components/PromptCard.tsx:25-38` |
| FR-PC-05 | 系统应当显示处理时间（如 AI 时间和 human 思考时间） | prompt.processing_time_display 非空且非 'cancelled' | 显示 `⏱ {ptDisplay}` | `src/ui/viewer/components/PromptCard.tsx:102-108` |
| FR-PC-06 | 系统应当在被取消时显示特殊状态 | processing_time_display === 'cancelled' | 显示 "Task status unclear" 本地化文本 | `src/ui/viewer/components/PromptCard.tsx:106-107` |
| FR-PC-07 | 系统应当显示用户标签或用户名 | prompt.user_label 或 prompt.user_name | 优先显示 label（大写），无 label 时显示 name | `src/ui/viewer/components/PromptCard.tsx:109-114` |
| FR-PC-08 | 系统应当在删除过程中禁用删除按钮 | deleting === true | 删除按钮 disabled，防止重复操作 | `src/ui/viewer/components/PromptCard.tsx:26, 84` |

## 3. 业务规则与约束

- 复制冷却时间 `COPIED_DURATION_MS = 2000`。`src/ui/viewer/components/PromptCard.tsx:14`
- 删除失败时仅 console.warn，不显示错误 UI，但恢复 deleting 状态允许重试。`src/ui/viewer/components/PromptCard.tsx:35-37`
- SSE 负责清理所有客户端的实时状态，删除回调仅移除发起删除的客户端的分页缓冲区中的行。`src/ui/viewer/components/PromptCard.tsx:31-32`
- processing_time_display 使用 `(prompt as any)` 类型断言访问，说明该字段未在 UserPrompt 类型中定义。`src/ui/viewer/components/PromptCard.tsx:23`

## 4. 对外暴露

**Props 接口**：
| 属性 | 类型 | 说明 |
|------|------|------|
| `prompt` | `UserPrompt` | 提示词数据对象 |
| `onDeleted` | `(id: number) => void`（可选） | 删除成功回调 |

## 5. 依赖关系

- 上游：Feed 组件（渲染 prompt 类型的 FeedItem）
- 下游：`authFetch`、`formatDate`、`useLocale` Hook

## 8. 逆向备注

- `(prompt as any).processing_time_display` 的类型断言表明该字段的类型定义可能滞后于实际数据。在 `types.ts` 中 UserPrompt 接口确实已包含此字段（`processing_time_display?: string | null`），但组件仍使用 `any` 断言。`src/ui/viewer/components/PromptCard.tsx:23`
