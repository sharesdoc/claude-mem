# types.ts 需求说明

> 源文件：src/cli/types.ts ｜ 类型：源码 ｜ 行数：46 ｜ 所属模块：cli ｜ 分析日期：2026-07-23

## 1. 文件定位总述

本文件定义了 CLI hook 处理管线的核心类型契约，是整个 `src/cli/` 模块的类型基石。它包含三个核心接口：`NormalizedHookInput` 定义了所有平台适配器输出的统一输入格式，`HookResult` 定义了事件处理器返回的统一输出格式，`PlatformAdapter` 定义了适配器必须实现的两个方法。此外 `EventHandler` 接口约束了事件处理器的执行签名。这些类型确保了不同平台来源的 hook 数据能被统一处理。

## 2. 功能需求

本文件为纯类型定义文件，功能需求以数据结构约束的形式体现，详见 §6。

## 3. 业务规则与约束

- `NormalizedHookInput` 中大部分字段为可选，仅 `sessionId` 和 `cwd` 为必需字段 `src/cli/types.ts:1-2`
- `HookResult` 的所有字段均为可选，推断允许处理器返回空对象 `{}` 作为"无操作"结果 `src/cli/types.ts:23-37`
- `hookSpecificOutput.hookEventName` 为字符串类型而非枚举，说明事件名由各处理器动态决定而非编译时固定 `src/cli/types.ts:28`
- `permissionDecision` 仅允许 `'allow'` 或 `'deny'` 两个值，用于 PreToolUse hook 的权限决策 `src/cli/types.ts:29`
- `decision` 字段取 `'block'` 或 `'approve'`，用于 Codex 平台的阻断决策（与 permissionDecision 是不同层级的概念） `src/cli/types.ts:34`

## 4. 对外暴露

| 导出名 | 类型 | 用途 |
|--------|------|------|
| `NormalizedHookInput` | `interface` | 适配器标准化后的 hook 输入格式 |
| `HookResult` | `interface` | 事件处理器返回的 hook 结果格式 |
| `PlatformAdapter` | `interface` | 平台适配器契约（normalizeInput + formatOutput） |
| `EventHandler` | `interface` | 事件处理器契约（execute） |

## 5. 依赖关系

**无外部依赖**。本文件是 CLI 模块最底层的类型定义。

## 6. 数据结构

```typescript
interface NormalizedHookInput {
  sessionId: string;          // 必需 - 会话标识
  cwd: string;                // 必需 - 工作目录
  platform?: string;          // 平台标识（由 hook-command 注入）
  prompt?: string;            // 用户提示词
  toolName?: string;          // 工具名称
  toolInput?: unknown;         // 工具输入
  toolResponse?: unknown;     // 工具响应
  transcriptPath?: string;     // transcript 文件路径
  lastAssistantMessage?: string; // 最后一条助手消息
  turnId?: string;             // 对话轮次 ID
  stopHookActive?: boolean;    // Stop hook 是否激活
  permissionMode?: string;     // 权限模式
  model?: string;              // 模型名称
  sessionSource?: 'startup' | 'resume' | 'clear'; // 会话来源
  filePath?: string;           // 文件路径（Codex）
  edits?: unknown[];            // 编辑内容（Codex）
  metadata?: Record<string, unknown>; // 扩展元数据
  agentId?: string;            // 代理 ID
  agentType?: string;          // 代理类型
}

interface HookResult {
  continue?: boolean;          // 是否继续执行
  suppressOutput?: boolean;   // 是否抑制输出
  hookSpecificOutput?: {       // 平台特定输出
    hookEventName: string;
    additionalContext: string;
    permissionDecision?: 'allow' | 'deny';
    permissionDecisionReason?: string;
    updatedInput?: Record<string, unknown>;
  };
  systemMessage?: string;      // 系统消息
  decision?: 'block' | 'approve'; // 阻断决策
  reason?: string;             // 决策原因
  exitCode?: number;           // 退出码
}

interface PlatformAdapter {
  normalizeInput(raw: unknown): NormalizedHookInput;
  formatOutput(result: HookResult): unknown;
}

interface EventHandler {
  execute(input: NormalizedHookInput): Promise<HookResult>;
}
```

## 7. 复杂逻辑图示

不适用——本文件为纯类型定义。

## 8. 逆向备注

- `NormalizedHookInput.platform` 不由适配器设置（从 rawAdapter 等的 normalizeInput 方法可确认），而是在 `hook-command.ts:82` 中由 `input.platform = platform` 注入 `src/cli/types.ts:4`
- `HookResult` 同时包含 `decision`（block/approve）和 `hookSpecificOutput.permissionDecision`（allow/deny），两者语义相似但用于不同平台：前者为 Codex 的阻断决策，后者为 Claude Code 的 PreToolUse 权限决策 `src/cli/types.ts:29,34`
- `edits` 字段类型为 `unknown[]` 而非更精确的类型，推断编辑内容格式因平台而异，无法统一约束 `src/cli/types.ts:18`
