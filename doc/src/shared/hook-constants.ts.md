# hook-constants.ts 需求说明

> 源文件：src/shared/hook-constants.ts ｜ 类型：源码 ｜ 行数：26 ｜ 所属模块：shared ｜ 分析日期：2026-07-23

## 1. 文件定位总述

本文件是 hook 系统的核心常量定义模块，统一管理所有 hook 相关的超时时间阈值和退出码。它是 `worker-utils.ts`、hook 脚本等模块引用超时和退出码的单一来源，确保整个系统中超时策略和错误处理语义一致。

## 2. 功能需求

| 编号 | 需求描述（系统应当…） | 触发条件 / 输入 | 处理规则与输出 | 证据 |
|------|----------------------|----------------|---------------|------|
| FR-hookconst-01 | 系统应当提供 Windows 平台超时自适应函数 | 调用 `getTimeout(baseTimeout)` | Windows 平台乘以 1.5 倍系数并四舍五入，其他平台原样返回 | `src/shared/hook-constants.ts:22-26` |

## 3. 业务规则与约束

- `HOOK_TIMEOUTS` 为只读对象（`as const`），包含 12 个预定义超时常量，单位为毫秒。`src/shared/hook-constants.ts:1-13`
- `HOOK_EXIT_CODES` 为只读对象，定义 4 种退出码语义：0=成功、1=非阻断失败、2=阻断错误、3=仅用户消息。`src/shared/hook-constants.ts:15-20`
- Windows 超时乘数为 1.5，用于补偿 Windows 上较慢的进程启动和 I/O 性能。`src/shared/hook-constants.ts:12`

### 超时常量清单

| 常量名 | 值(ms) | 用途 |
|--------|--------|------|
| `DEFAULT` | 300,000 | 标准 HTTP 超时（5 分钟） |
| `HEALTH_CHECK` | 3,000 | Worker 健康检查 |
| `API_REQUEST` | 30,000 | Hook API 调用 |
| `HOOK_READINESS_WAIT` | 10,000 | 单 hook 等待 worker 就绪 |
| `POST_SPAWN_WAIT` | 15,000 | daemon 启动后等待 |
| `READINESS_WAIT` | 30,000 | DB+搜索初始化等待 |
| `PORT_IN_USE_WAIT` | 3,000 | 端口被占用时等待 |
| `WORKER_STARTUP_WAIT` | 1,000 | Worker 启动等待 |
| `PRE_RESTART_SETTLE_DELAY` | 2,000 | 重启前文件同步延迟 |
| `POWERSHELL_COMMAND` | 10,000 | PowerShell 进程枚举 |
| `WINDOWS_MULTIPLIER` | 1.5 | Windows 超时乘数 |

## 4. 对外暴露

| 导出名称 | 类型 | 说明 |
|---------|------|------|
| `HOOK_TIMEOUTS` | `const` 对象 | 所有超时常量 |
| `HOOK_EXIT_CODES` | `const` 对象 | 退出码常量 |
| `getTimeout` | `(baseTimeout: number) => number` | Windows 自适应超时计算 |

## 5. 依赖关系

- **Node.js 内置**：`process.platform`

## 6. 数据结构

- `HOOK_TIMEOUTS`: 包含 12 个数值键的只读对象。
- `HOOK_EXIT_CODES`: 包含 4 个数值键的只读对象（SUCCESS=0, FAILURE=1, BLOCKING_ERROR=2, USER_MESSAGE_ONLY=3）。

## 7. 复杂逻辑图示

不适用（常量定义+简单条件函数）。

## 8. 逆向备注

- 退出码 3（`USER_MESSAGE_ONLY`）定义在常量中但未在此文件中描述用途，推断用于仅需向用户输出消息而不阻断的 hook 场景。`src/shared/hook-constants.ts:19`
