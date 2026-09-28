# spawn.ts 需求说明

> 源文件：src/shared/spawn.ts ｜ 类型：源码 ｜ 行数：12 ｜ 所属模块：shared ｜ 分析日期：2026-07-23

## 1. 文件定位总述

本文件提供跨平台的子进程启动包装器，核心目的是在 Windows 上隐藏子进程窗口（控制台闪屏）。它是 worker 进程懒启动、Bun 运行时等需要 `spawn` 子进程场景的基础工具，被 `worker-utils.ts` 等上游模块调用。

## 2. 功能需求

| 编号 | 需求描述（系统应当…） | 触发条件 / 输入 | 处理规则与输出 | 证据 |
|------|----------------------|----------------|---------------|------|
| FR-spawn-01 | 系统应当启动子进程并在 Windows 上默认隐藏其窗口 | 调用 `spawnHidden(command, args?, options?)` | 使用 `node:child_process.spawn`，默认注入 `windowsHide: true`，其余 options 通过展开运算符合并 | `src/shared/spawn.ts:11` |
| FR-spawn-02 | 系统应当在未传入 args 时使用空数组 | `args` 为 `undefined` 或未传 | 默认使用 `[]` | `src/shared/spawn.ts:11` |

## 3. 业务规则与约束

- `windowsHide: true` 为默认行为，调用方通过 `options` 传入同名键可覆盖（但代码中 `...options` 在 `windowsHide: true` 之后，推断：调用方传入的 `windowsHide` 会覆盖默认值）。`src/shared/spawn.ts:11`

## 4. 对外暴露

| 导出名称 | 类型 | 说明 |
|---------|------|------|
| `spawnHidden` | `(command: string, args?: readonly string[], options?: SpawnOptions) => ChildProcess` | 跨平台子进程启动包装 |
| `SpawnHiddenOptions` | 类型别名 `SpawnOptions` | 选项类型导出 |

## 5. 依赖关系

- **Node.js 内置**：`node:child_process`（`spawn`、`SpawnOptions`、`ChildProcess`）

## 6. 数据结构

不适用。

## 7. 复杂逻辑图示

不适用（单行包装逻辑）。

## 8. 逆向备注

- 注释引用 `src/shared/spawn.ts.test.ts` 存在不变式测试。`src/shared/spawn.ts:1`
