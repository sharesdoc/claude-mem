# Claude-Mem 项目介绍

## 这是什么

Claude-Mem 是专为 [Claude Code](https://claude.com/claude-code) 打造的**持久化记忆压缩系统**。它通过自动捕获 AI 助手的工具调用过程、压缩为语义观察记录，并在后续会话中注入相关上下文，让 Claude 能够在不同会话之间保持对项目的连续认知——即使会话结束或重新连接，记忆也不会丢失。

- **官方仓库**：https://github.com/thedotmack/claude-mem
- **本地路径**：`/Users/johnson/wks/ai/plugins/claude-mem`
- **当前分支**：`main`
- **最新标签**：v13.4.0（截至 2026‑06‑18）
- **总提交数**：2269 次
- **近 3 个月活跃度**：774 次提交，持续高活跃开发
- **作者**：Alex Newman（[@thedotmack](https://github.com/thedotmack)）
- **官网**：https://docs.claude-mem.ai

---

## 解决什么问题

Claude Code 默认情况下每次启动都是"全新"会话，Al 助手无法自动回忆起之前做过什么、发现了什么问题、做出了什么决策。开发者因此不得不：

- 手动在对话中粘贴历史上下文
- 反复解释已讨论过的背景
- 在长会话中丢失关键信息

Claude-Mem 通过一套**自动化生命周期钩子**，在后台静默运行，将每次工具调用的上下文自动归档、压缩和检索，让 Claude 像"有记忆"一样工作。

---

## 核心功能与特点

### 持久化记忆（Persistent Memory）
Hook 系统在 PostToolUse 阶段自动捕获工具调用，经 Claude Agent SDK 压缩为语义化观察记录存入 SQLite 数据库，后续会话的 SessionStart 阶段自动注入最相关上下文。

### 渐进式披露（Progressive Disclosure）
不是一股脑把所有记忆塞入上下文，而是按相关性分层注入，并在 Web UI 中显示每次注入的 token 消耗，让你对 AI 的"记忆成本"心中有数。

### MCP 搜索引擎
提供 4 个 MCP 工具实现三层检索工作流：`search`（索引搜索，~50‑100 tokens）→ `timeline`（时间线上下文）→ `get_observations`（按 ID 获取详情，~500‑1,000 tokens），相比直接拉取完整记录可节省约 **10 倍 tokens**。

### Web 查看器
运行在 `http://localhost:37777` 的实时记忆流 UI（React 构建），可查看所有观察记录、搜索历史、管理设置。

### 私有标签保护
使用 `<private>内容</private>` 标记敏感信息，Hook 层在数据到达 Worker/数据库之前就剥离标签，确保隐私内容不被持久化。

### 多工作模式与多语言
支持 `code`（默认英文）、`code--zh`（简体中文）、`code--ja`（日语）等模式，只需在 `~/.claude-mem/settings.json` 中设置 `CLAUDE_MEM_MODE` 即可切换。

### Server/Client 架构
支持 `--role server` 安装为服务端，其他机器通过 `--role client` 接入共享记忆（需配置 Access Token）。

---

## 什么时候用

- **长期项目开发**：跨天/跨周的任务，AI 需要记住之前的进度和决策
- **团队协作**：多台机器的 Claude Code 共享一套记忆数据库
- **复杂 bug 追踪**：从发现问题、根因分析到修复验证的全链路记忆回溯
- **代码审查与重构**：让 AI 记得之前的架构决策和代码约定
- **需要频繁重启会话的场景**：如 Windows 终端关闭后标签页丢失，记忆依然保留

---

## 怎么用

### 自动生效（安装即用）
Claude-Mem 安装后完全自动运行，无需手动操作。它的 5 个生命周期钩子（SessionStart → UserPromptSubmit → PostToolUse → Stop → SessionEnd）在后台自主工作。

### 安装方式
```bash
# 一键安装（推荐）
npx claude-mem install

# 或者从 Claude Code 插件市场安装
/plugin marketplace add thedotmack/claude-mem
/plugin install claude-mem

# 安装后重启 Claude Code 即可生效
```

### 手动搜索
自然语言搜索历史记忆（在 Claude Code 中输入类似问题会自动触发）：
- 问"上次讨论的 XXX 问题是什么？"
- 问"我之前的项目里关于 XXX 的决策记录"
- 访问 Web UI `http://localhost:37777` 浏览全部记录

### 安装为 Server（多机共享）
```bash
# 服务端（本机）
./install-claude-mem --role server

# 客户端（其它机器）
./install-claude-mem --role client --upstream http://192.168.1.100:37701 --token <TOKEN>
```

---

## 技术栈 / 核心架构

| 层次 | 技术 |
|------|------|
| 运行时 | **TypeScript 6 + Node >=20 + Bun** |
| 数据库 | **SQLite3**（`~/.claude-mem/claude-mem.db`，含 FTS5 全文搜索） |
| 向量引擎 | **ChromaDB**（`~/.claude-mem/chroma/`，语义搜索） |
| AI 引擎 | **Claude Agent SDK**（观测压缩与摘要生成） |
| Hook 系统 | 6 个生命周期事件，由 `bun-runner.js` 桥接 Node → Bun |
| Worker 服务 | Express 5 API，用户级端口（默认 `37700 + uid % 100`），Bun 管理 |
| MCP 服务 | 内嵌 MCP Server 提供搜索工具 |
| Web UI | React 19，自带 Viewer UI |
| 队列系统 | BullMQ（可选，Redis 后端） |
| 包管理 | npm + bun |

### 数据流
```
用户输入 → UserPromptSubmit Hook → 注入上下文（语义检索）
  ↓
工具调用 → PostToolUse Hook → 捕获记录 → Worker 队列
  ↓
Claude Agent SDK → 压缩为观测摘要
  ↓
存入 SQLite + 同步 ChromaDB（向量化）→ SSE 广播到 Web UI
  ↓
会话结束 → Summarize Hook → 生成会话摘要 → 最终写入
```

### 核心文件
- `/Users/johnson/wks/ai/plugins/claude-mem/src/services/worker-service.ts` — Worker 服务入口
- `/Users/johnson/wks/ai/plugins/claude-mem/src/services/sqlite/` — 数据库层
- `/Users/johnson/wks/ai/plugins/claude-mem/src/servers/mcp-server.ts` — MCP 服务器
- `/Users/johnson/wks/ai/plugins/claude-mem/plugin/hooks/hooks.json` — Hook 编排配置
- `/Users/johnson/wks/ai/plugins/claude-mem/src/ui/viewer/` — Web Viewer UI

### 编译与部署
```bash
npm run build-and-sync    # 编译 + 同步到市场 + 重启 Worker
npm run build:binaries     # 编译 Worker 二进制
npm run test               # 运行测试套件
```

---

## 隐私与数据安全

基于代码和文档扫描，Claude-Mem 在隐私方面有如下设计：

- **所有数据本地存储**：数据库、向量索引、日志、配置文件全部位于 `~/.claude-mem/`，不自身上传任何数据
- **隐私标签系统**：`<private>...</private>` 标签在 Hook 层被剥离，避免敏感内容进入数据库
- **Worker 绑定 127.0.0.1**：默认仅监听本地回环地址，不暴露网络
- **无遥测收集**：不向第三方发送使用数据
- **但需注意**：观测压缩依赖 Claude Agent SDK（调用 Anthropic API），若使用 Gemini/OpenRouter 替代提供者则发送到对应 API；向量嵌入若配置了远程 Chroma 服务也会发送数据
- **历史安全事件**：2025‑12‑16 修复了 3 个命令注入漏洞（Issue #354），涉及分支名验证、shell 执行移除等，均已修复并新增安全测试套件
- **最新版本始终受安全支持**：仅 `latest` 版本接收安全更新

---

## 开源许可

- **主项目**：Apache License 2.0（详见 `LICENSE` 文件）
- **ragtime/** 目录：同样基于 Apache 2.0
- **NOTICE 文件**：Copyright 2026 Alex Newman
- 选择 Apache-2.0 的理由：让持久化的 Agent 记忆能够轻松嵌入开发者工具、本地 Agent、MCP 服务器、企业系统、机器人堆栈和生成式 AI 框架中

---

## 维护状态

- **活跃维护**：近 3 个月 774 次提交，最新版本 v13.4.0
- **发布周期**：频繁版本迭代（v13.1.0 → v13.2.0 → v13.4.0 间隔数天）
- **社区支持**：GitHub Issues、Discord 社区、官方 X 账户（@Claude_Memory）
- **自动更新**：Setup Hook 启动时检查版本一致性，不匹配时提示运行 `npx claude-mem repair`
- **Bug 报告**：内置自动化 bug 报告生成器（`npm run bug-report`）
- **被收录于**：[Awesome Claude Code](https://github.com/thedotmack/awesome-claude-code) 精选列表

---

## 成熟度与竞品对比

Claude-Mem 是目前 Claude Code 生态中最成熟的持久化记忆方案：

- **版本号**：v13.x（13 个大版本的迭代），2269 次提交
- **功能覆盖**：自动 Hook 捕获 + SQLite 持久化 + Chroma 向量搜索 + MCP 检索工具 + Web UI 可视化管理
- **竞品对比**：
  - **Claude Code 内置记忆**：仅支持上下文窗口内的短期记忆，跨会话不保存
  - **MCP 文件系统记忆**：手动读写文件，无自动捕获和检索能力
  - **手动 Prompt 工程**：依赖用户手动粘贴上下文，无法规模化
- **独特优势**：渐进式披露、Server/Client 多机共享记忆、隐私标签保护、多语言支持

---

## 了解更多

- **官方文档**：https://docs.claude-mem.ai
- **GitHub 仓库**：https://github.com/thedotmack/claude-mem
- **本地路径**：`/Users/johnson/wks/ai/plugins/claude-mem`
- **Issues**：https://github.com/thedotmack/claude-mem/issues
- **Discord 社区**：https://discord.com/invite/J4wttp9vDu
- **X 官方账号**：https://x.com/Claude_Memory
- **作者**：Alex Newman（[GitHub @thedotmack](https://github.com/thedotmack)）

---

*本文档基于 2026‑06‑20 项目状态编写。claude-mem 是 Claude Code 生态系统的核心插件之一，代表了 AI Agent 持久化记忆领域的前沿实践。*
