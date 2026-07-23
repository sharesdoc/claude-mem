# errors.ts 需求说明

> 源文件：src/cli/adapters/errors.ts ｜ 类型：源码 ｜ 行数：11 ｜ 所属模块：cli/adapters ｜ 分析日期：2026-07-23

## 1. 文件定位总述

本文件定义了平台适配器层的共享错误类型和校验工具函数。`AdapterRejectedInput` 是适配器在发现输入数据不合规时抛出的专用异常类，用于在 hook 处理管线中触发优雅降级而非阻断。`isValidCwd` 是一个类型守卫函数，用于验证 cwd（当前工作目录）是否为合法的非空字符串，被所有平台适配器共用。

## 2. 功能需求

| 编号 | 需求描述（系统应当…） | 触发条件 / 输入 | 处理规则与输出 | 证据 |
|------|----------------------|----------------|---------------|------|
| FR-ERR-01 | 系统应当提供 AdapterRejectedInput 异常类用于标识输入被适配器拒绝 | 适配器在 normalizeInput 中检测到非法输入时 | 抛出该异常，携带 reason 字段描述拒绝原因，message 格式为 `adapter rejected input: {reason}` | `src/cli/adapters/errors.ts:3-7` |
| FR-ERR-02 | 系统应当校验 cwd 是否为有效的工作目录字符串 | 适配器调用 isValidCwd 时 | 当 cwd 为 string 类型且长度 > 0 时返回 true（类型守卫收窄为 string），否则返回 false | `src/cli/adapters/errors.ts:9-11` |

## 3. 业务规则与约束

- `AdapterRejectedInput` 的 name 属性固定为 `'AdapterRejectedInput'`，便于上层通过 name 或 instanceof 识别异常类型 `src/cli/adapters/errors.ts:5`
- reason 字段使用 `public readonly` 修饰，异常创建后不可修改 `src/cli/adapters/errors.ts:3`

## 4. 对外暴露

| 导出名 | 类型 | 用途 |
|--------|------|------|
| `AdapterRejectedInput` | `class extends Error` | 适配器输入拒绝异常，携带 reason 字段 |
| `isValidCwd` | `(cwd: unknown) => cwd is string` | cwd 合法性类型守卫 |

## 5. 依赖关系

**无外部依赖**。本文件是适配器层最底层的工具模块。

## 6. 数据结构

不适用。

## 7. 复杂逻辑图示

不适用——本文件仅包含一个简单的错误类和一个单条件校验函数。

## 8. 逆向备注

- `isValidCwd` 不校验路径是否实际存在于文件系统中，仅校验字符串非空。推断路径存在性检查在业务逻辑层而非适配器层处理 `src/cli/adapters/errors.ts:9-11`
