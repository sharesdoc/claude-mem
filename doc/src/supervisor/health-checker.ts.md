# health-checker.ts 需求说明

> 源文件：src/supervisor/health-checker.ts ｜ 类型：源码 ｜ 行数：35 ｜ 所属模块：supervisor ｜ 分析日期：2026-07-23

## 1. 文件定位总述

本文件提供 Supervisor 的定期健康检查能力。它以 30 秒为间隔定时调用 ProcessRegistry 的 pruneDeadEntries 方法，清除已死亡进程的注册记录。通过 setInterval + unref 的组合确保健康检查不会阻止进程退出。本文件是 Supervisor 生命周期的一部分，由 index.ts 中的 Supervisor.start()/stop() 驱动。

## 2. 功能需求

| 编号 | 需求描述（系统应当…） | 触发条件 / 输入 | 处理规则与输出 | 证据 |
|------|----------------------|----------------|---------------|------|
| FR-HC-01 | 系统应当在 Supervisor 启动时开启定时健康检查 | 调用 `startHealthChecker()` | 创建 setInterval 定时器（30秒），调用 unref 防止阻塞退出；幂等——重复调用不会创建多个定时器 | `src/supervisor/health-checker.ts:18-25` |
| FR-HC-02 | 系统应当在每次健康检查时清理已死亡的进程注册记录 | 定时触发 runHealthCheck() | 调用 registry.pruneDeadEntries()，若清理数量 > 0 则记录日志 | `src/supervisor/health-checker.ts:9-16` |
| FR-HC-03 | 系统应当支持停止健康检查 | 调用 `stopHealthChecker()` | clearInterval 清除定时器并置空引用；幂等——未启动时调用无操作 | `src/supervisor/health-checker.ts:27-33` |

## 3. 业务规则与约束

| 编号 | 规则描述 | 证据 |
|------|---------|------|
| BR-HC-01 | 健康检查间隔为固定 30,000 毫秒 | `src/supervisor/health-checker.ts:5` |

## 4. 对外暴露

| 导出项 | 类型 | 用途 |
|--------|------|------|
| `startHealthChecker` | function | 启动健康检查定时器 |
| `stopHealthChecker` | function | 停止健康检查定时器 |

## 5. 依赖关系

- **内部依赖**：`../utils/logger.js`、`./process-registry.js`（getProcessRegistry）
- **被依赖**：`./index.ts`（Supervisor 类在 start/stop 中调用）

## 6. 数据结构

不适用。

## 7. 复杂逻辑图示

不适用（逻辑简单：start/stop 两个函数各维护一个 setInterval）。

## 8. 逆向备注

- 定时器使用 `.unref()` 确保不会阻止 Node.js 事件循环退出，是进程管理场景的标准做法。
- 模块级变量 healthCheckInterval 保存定时器引用，start/stop 均通过检查此引用实现幂等。
