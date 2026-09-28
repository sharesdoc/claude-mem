# shell-quote.d.ts 需求说明

> 源文件：src/types/shell-quote.d.ts ｜ 类型：源码 ｜ 行数：5 ｜ 所属模块：types ｜ 分析日期：2026-07-23

## 1. 文件定位总述

本文件是第三方模块 `shell-quote` 的 TypeScript 类型声明文件。`shell-quote` 用于安全解析 shell 命令字符串为 token 数组，本声明为其提供 parse 函数和 ParsedToken 类型的类型信息。

## 2. 功能需求

| 编号 | 需求描述（系统应当…） | 触发条件 / 输入 | 处理规则与输出 | 证据 |
|------|----------------------|----------------|---------------|------|
| FR-SQ-01 | 系统应当声明 ParsedToken 类型为 string 或 { op: string } 或 Record 的联合类型 | TypeScript 编译时 | ParsedToken = string \| { op: string } \| Record\<string, unknown\> | `src/types/shell-quote.d.ts:2` |
| FR-SQ-02 | 系统应当声明 parse 函数签名为接收 command 字符串，返回 ParsedToken 数组 | TypeScript 编译时 | parse(command: string): ParsedToken[] | `src/types/shell-quote.d.ts:3` |

## 3. 业务规则与约束

无特殊约束。

## 4. 对外暴露

| 导出项 | 类型 | 用途 |
|--------|------|------|
| `ParsedToken` | type | shell-quote 解析结果的 token 类型 |
| `parse` | function | 将 shell 命令字符串解析为 token 数组 |

## 5. 依赖关系

- **被依赖**：未在当前批次文件中找到直接引用，推断被其他模块间接使用

## 6. 数据结构

**ParsedToken**: `string | { op: string } | Record<string, unknown>` — 支持普通字符串 token、操作符 token 和其他结构化 token。

## 7. 复杂逻辑图示

不适用。

## 8. 逆向备注

- 与 tree-kill.d.ts 类似，本文件自行维护类型声明而非使用 @types 包。
- ParsedToken 的第三种类型 `Record<string, unknown>` 过于宽泛，推断是为了兼容 shell-quote 可能输出的其他结构化 token（如 glob 模式等）。
