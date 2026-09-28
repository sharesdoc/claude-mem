# hook-response.ts 需求说明

> 源文件：src/hooks/hook-response.ts ｜ 类型：源码 ｜ 行数：4 ｜ 所属模块：hooks ｜ 分析日期：2026-07-23

## 1. 文件定位总述

本文件导出一个预序列化的 JSON 常量 `STANDARD_HOOK_RESPONSE`，代表 Claude Code hook 的标准响应体。该常量被各 hook 脚本用于向 Claude Code 返回统一的"继续执行并抑制输出"指令，确保 hook 层对 Claude Code 的行为控制保持一致。这是一个极简的常量导出文件，处于 hook 层的公共工具位置。

## 2. 功能需求

| 编号 | 需求描述（系统应当…） | 触发条件 / 输入 | 处理规则与输出 | 证据 |
|------|----------------------|----------------|---------------|------|
| FR-HR-01 | 系统应当提供预序列化的标准 hook 响应常量，包含 `continue: true` 和 `suppressOutput: true` | 各 hook 脚本需要返回标准响应时 | 返回已 JSON.stringify 的字符串 `{ "continue": true, "suppressOutput": true }` | `hook-response.ts:1-4` |

## 3. 业务规则与约束

- 常量在模块加载时即完成序列化，使用方直接写入 stdout 无需额外 JSON 调用。`hook-response.ts:1`
- `continue: true` 表示 hook 执行成功，Claude Code 应继续后续流程。`hook-response.ts:2`
- `suppressOutput: true` 表示 hook 的 stdout 输出不应展示给用户。`hook-response.ts:3`

## 4. 对外暴露

| 导出名 | 类型 | 说明 |
|--------|------|------|
| `STANDARD_HOOK_RESPONSE` | `string`（JSON 序列化后的字符串） | 标准 hook 响应体 |

共 1 个公开导出。

## 5. 依赖关系

无外部或内部依赖。

## 6. 数据结构

```json
{
  "continue": true,
  "suppressOutput": true
}
```

序列化后的 JSON 字符串，直接用于 stdout 输出。

## 7. 复杂逻辑图示

不适用——单常量导出文件。

## 8. 逆向备注

无。
