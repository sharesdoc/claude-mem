# json-utils.ts 需求说明

> 源文件：src/utils/json-utils.ts ｜ 类型：源码 ｜ 行数：13 ｜ 所属模块：Utils ｜ 分析日期：2026-07-23

## 1. 文件定位总述

json-utils.ts 是一个极简的 JSON 安全读取工具模块，提供单一的 `readJsonSafe` 函数。它在文件不存在时返回调用者指定的默认值，在 JSON 解析失败时抛出携带明确错误信息的异常而非静默返回。该工具被其他工具模块（如 agents-md-utils、cursor-utils 等）间接引用，用于读取配置类 JSON 文件。

## 2. 功能需求

| 编号 | 需求描述（系统应当…） | 触发条件 / 输入 | 处理规则与输出 | 证据 |
|------|----------------------|----------------|---------------|------|
| FR-ReadJson-01 | 系统应当在指定文件不存在时返回调用者提供的默认值，而非抛异常 | filePath 指向的文件在文件系统中不存在 | `existsSync` 返回 false → 直接返回 `defaultValue` | `src/utils/json-utils.ts:6` |
| FR-ReadJson-02 | 系统应当在文件存在且内容为合法 JSON 时解析并返回其内容 | filePath 存在且包含合法 JSON | `JSON.parse(readFileSync(filePath, 'utf-8'))` 返回解析结果 | `src/utils/json-utils.ts:7-8` |
| FR-ReadJson-03 | 系统应当在 JSON 解析失败时抛出携带文件路径和错误详情的异常，而非静默覆盖文件 | filePath 存在但内容为损坏/非法 JSON | 抛出 `Error("Corrupt JSON file, refusing to overwrite: <path>: <error message>")"` | `src/utils/json-utils.ts:9-11` |

## 3. 业务规则与约束

- **拒绝覆盖损坏文件**：错误消息中明确包含 "refusing to overwrite"，表明设计意图是宁可抛异常也不使用默认值覆盖损坏的 JSON 文件——这是一个安全防护策略，防止因解析失败导致配置静默丢失 `src/utils/json-utils.ts:10`
- **泛型类型安全**：函数签名为 `readJsonSafe<T>`，默认值类型与返回值类型一致，由 TypeScript 编译器保证类型安全 `src/utils/json-utils.ts:5`

## 4. 对外暴露

| 公开方法 | 签名 | 说明 |
|---------|------|------|
| `readJsonSafe` | `<T>(filePath: string, defaultValue: T): T` | 安全读取 JSON 文件，文件不存在返回默认值，解析失败抛异常 |

## 5. 依赖关系

### 上游依赖

| 来源 | 用途 |
|------|------|
| `fs.existsSync` | 检查文件是否存在 |
| `fs.readFileSync` | 同步读取文件内容 |
| `logger`（`./logger.js`） | 推断：（已导入但本文件未直接调用，可能用于未来扩展或被 tree-shaking） |

> 注：`logger` 在第 3 行导入，但函数体中未使用。推断：（为保持模块间的统一日志风格而导入，或历史遗留）。

### 下游消费者

未在代码中直接证实，推断：被需要安全读取 JSON 配置文件的模块使用（如 settings 读取等）。

## 6. 数据结构

不适用。

## 7. 复杂逻辑图示

不适用（逻辑简单，无需图示）。

## 8. 逆向备注

- **未使用的导入**：`logger` 被导入但未在函数体中调用。以代码为准，该文件当前不使用日志功能 `src/utils/json-utils.ts:3`
- **安全设计意图**：错误消息 "Corrupt JSON file, refusing to overwrite" 表明这是一个有意识的安全决策——在 JSON 损坏时不回退到默认值，而是让调用者知道文件出了问题。推断：（避免配置文件被静默重置，造成更严重的问题）`src/utils/json-utils.ts:10`
