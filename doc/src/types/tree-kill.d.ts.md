# tree-kill.d.ts 需求说明

> 源文件：src/types/tree-kill.d.ts ｜ 类型：源码 ｜ 行数：8 ｜ 所属模块：types ｜ 分析日期：2026-07-23

## 1. 文件定位总述

本文件是第三方模块 `tree-kill` 的 TypeScript 类型声明文件。`tree-kill` 用于在 Windows 平台上按进程树终止进程（递归杀死子进程），本声明为其提供类型信息，使 TypeScript 项目能够无 `@types` 依赖地使用该模块。

## 2. 功能需求

| 编号 | 需求描述（系统应当…） | 触发条件 / 输入 | 处理规则与输出 | 证据 |
|------|----------------------|----------------|---------------|------|
| FR-TK-01 | 系统应当声明 tree-kill 模块的默认导出函数签名，支持 pid、可选 signal 和可选 callback 三个参数 | TypeScript 编译时 | 函数签名：treeKill(pid: number, signal?: string, callback?: (error?: Error \| null) => void) => void | `src/types/tree-kill.d.ts:2-6` |

## 3. 业务规则与约束

无特殊约束。

## 4. 对外暴露

| 导出项 | 类型 | 用途 |
|--------|------|------|
| tree-kill 模块默认导出 | function | 跨平台进程树终止，参数为 pid(number), signal(string, 可选), callback(function, 可选) |

## 5. 依赖关系

- **被依赖**：`src/supervisor/shutdown.ts`（动态 import('tree-kill') 并使用该类型）

## 6. 数据结构

不适用。

## 7. 复杂逻辑图示

不适用。

## 8. 逆向备注

- 本文件的存在说明项目未使用 `@types/tree-kill` 包，而是自行维护类型声明，推断是为了减少外部依赖或 tree-kill 缺少官方类型。
