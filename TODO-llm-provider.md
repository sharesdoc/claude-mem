# TODO — 大模型配置统一化 实施方案

> 基于：2026-08-14 对话设计定稿（摘要/报表/server-beta 三处 provider 配置入口统一）
> 目标：消灭「Qwen 有 key 就自动抢跑」「周报写死 Qwen」「server-beta 独立 provider」三个特例
> 状态：方案已确认，待实施

---

## 0. 设计定稿摘要

### 0.1 目标配置架构

```
摘要生成（经典 worker + server-beta 合并）
└── CLAUDE_MEM_PROVIDER ∈ { claude | qwen | gemini | openrouter | deepseek }
    ├── 未配置 → 默认 claude（SDK subscription，复用 Claude Code 登录）
    └── 各厂商组自带 _API_KEY / _MODEL / _URL

报表（日报/周报，服务器端功能）
└── CLAUDE_MEM_REPORT_PROVIDER ∈ 同 5 取值
    ├── 空 → AI 段禁用（退化为纯数据汇总）
    ├── 模型复用各厂商组 _MODEL（不新增 REPORT_MODEL）
    └── key 复用各厂商组 _API_KEY
```

### 0.2 厂商配置组定义

| 厂商 | 变量组 | 默认模型 | 默认 URL | 协议 |
|---|---|---|---|---|
| claude | 沿用现状（`CLAUDE_MEM_MODEL`、认证链） | `claude-haiku-4-5-20251001` | — | Anthropic / SDK |
| qwen | `CLAUDE_MEM_QWEN_MODEL` / `_API_KEY` / `_URL` | `qwen3-max` | `https://dashscope.aliyuncs.com/compatible-mode/v1` | **仅 OpenAI 兼容** |
| gemini | `CLAUDE_MEM_GEMINI_MODEL` / `_API_KEY` | `gemini-2.5-flash-lite` | — | 现状 |
| openrouter | `CLAUDE_MEM_OPENROUTER_MODEL` / `_API_KEY` | `xiaomi/mimo-v2-flash:free` | — | 现状 |
| deepseek | `CLAUDE_MEM_DEEPSEEK_MODEL` / `_API_KEY` / `_URL` | `deepseek-v4-flash` | `https://api.deepseek.com` | OpenAI 兼容 |

> ⚠️ `deepseek-chat` / `deepseek-reasoner` 别名已于 2026-07-24 官方停用，默认必须用 `deepseek-v4-flash`。

### 0.3 关键语义决策（已定稿）

1. **QWEN_URL 只处理 OpenAI 兼容**：QwenProvider 彻底重写为 OpenAI 兼容客户端，不再保留原生 DashScope 协议。URL 空 → 默认 DashScope 兼容端点；非空 → 用户自担责保证端点 OpenAI 兼容。
2. **摘要/报表共用型号**：已接受的代价——失去"摘要用便宜模型、报表用强模型"的分级能力。
3. **报表范围**：仅日报 + 周报。**月报不实现**。
4. **claude 认证链（经典 worker）全保留**：`api-key → gateway → Claude Code OAuth/keychain` 四级回退不变（`CLAUDE_MEM_CLAUDE_AUTH_METHOD`）。
5. **server-beta 的 claude 分支只认 API key**：不碰个人 OAuth 登录态（多租户防烧订阅）。有 `ANTHROPIC_API_KEY`/`CLAUDE_MEM_ANTHROPIC_API_KEY` → 启用；无 → 生成禁用 + WARN。
6. **不做旧版兼容**：以下废弃键直接删除，settings.json 旧值变为死配置，无迁移逻辑：
   - `CLAUDE_MEM_WEEKLY_REPORT_MODEL`
   - `CLAUDE_MEM_REPORT_QWEN_API_KEY`
   - `CLAUDE_MEM_SERVER_PROVIDER`
   - `CLAUDE_MEM_SERVER_MODEL`

---

## 1. 评分体系

每个任务三维评分，**综合分 = N × 2 + F − C**，分数越高越优先。

| 维度 | 含义 | 1 (差) | 3 (中) | 5 (优) |
|---|---|---|---|---|
| **N 必要性** | 不做这条会直接破坏的事 | 锦上添花 | Phase 应有 | 整条链路缺一不可 |
| **F 可行性** | 现有代码基础能直接复用程度 | 需引入新依赖/范式 | 需新增模块 | 一行配置即达成 |
| **C 复杂度** *(越低越好)* | 工时 + 出错风险 | 1 小时 | 半天-1 天 | 多天 + 跨模块改造 |

> 综合分理论范围 [-3, +14]。≥ 12 = 必做、≥ 10 = 强烈推荐、7-9 = 应做、< 7 = 视情况推迟。

---

## 2. 总进度表（按综合分降序）

| 优先 | ID | 任务 | Phase | N | F | C | 分 | 估时 | 依赖 | 状态 |
|---:|---|---|---|---:|---:|---:|---:|---|---|---|
| 1 | T-01 | `SettingsDefaultsManager` 配置键增删 | 1 | 5 | 5 | 1 | **14** | 1h | — | ☐ |
| 1 | T-02 | `QwenProvider` 重写为 OpenAI 兼容客户端 | 1 | 5 | 3 | 4 | **9** | 1d | T-01 | ☐ |
| 2 | T-03 | 新增 `DeepSeekProvider` | 1 | 4 | 5 | 2 | **11** | 3h | T-01 T-02 | ☐ |
| 1 | T-04 | `SessionRoutes` 删除 Qwen 自动兜底，严格按 `CLAUDE_MEM_PROVIDER` 选择 | 1 | 5 | 5 | 2 | **13** | 3h | T-02 T-03 | ☐ |
| 2 | T-05 | 报表 provider 工厂化（`ReportGenerator`/`DailyReportGenerator`） | 2 | 5 | 3 | 3 | **10** | 5h | T-03 | ☐ |
| 2 | T-06 | server-beta 合并：`buildServerGenerationProviderFromEnv` 改读 `CLAUDE_MEM_PROVIDER` | 2 | 4 | 4 | 2 | **10** | 3h | T-01 | ☐ |
| 3 | T-07 | `SettingsRoutes` 校验更新（合法 provider 加 qwen/deepseek，报表 provider 校验） | 1 | 4 | 5 | 1 | **12** | 1h | T-01 | ☐ |
| 3 | T-08 | `install.ts` 交互安装流程加 qwen/deepseek | 2 | 3 | 4 | 2 | **8** | 2h | T-01 | ☐ |
| 3 | T-09 | Viewer UI 设置面板字段更新 | 2 | 3 | 3 | 2 | **7** | 2h | T-01 | ☐ |
| 3 | T-10 | 文档同步（CLAUDE.md / README / docs 配置说明） | 3 | 4 | 5 | 1 | **12** | 1h | 全部 | ☐ |
| 3 | T-11 | 构建 + 全量测试 + 验证 worker 启动 | 3 | 5 | 5 | 2 | **13** | 2h | 全部 | ☐ |

---

## 3. 任务详情

### T-01 SettingsDefaultsManager 配置键增删

**文件**：`src/shared/SettingsDefaultsManager.ts`

- 新增键（Defaults 表 + 接口）：
  - `CLAUDE_MEM_QWEN_API_KEY`（空）
  - `CLAUDE_MEM_QWEN_URL`（空 = DashScope 兼容端点）
  - `CLAUDE_MEM_DEEPSEEK_API_KEY`（空）
  - `CLAUDE_MEM_DEEPSEEK_MODEL`（`deepseek-v4-flash`）
  - `CLAUDE_MEM_DEEPSEEK_URL`（`https://api.deepseek.com`）
  - `CLAUDE_MEM_REPORT_PROVIDER`（空 = AI 段禁用）
  - `CLAUDE_MEM_QWEN_MODEL` 已有，默认保持 `''`（空 = QwenProvider 内置 DEFAULT_MODEL `qwen3-max`）
- 删除键（接口 + DEFAULTS 同步删除）：
  - `CLAUDE_MEM_WEEKLY_REPORT_MODEL`
  - `CLAUDE_MEM_REPORT_QWEN_API_KEY`
  - `CLAUDE_MEM_SERVER_PROVIDER`
  - `CLAUDE_MEM_SERVER_MODEL`
- 验收：TS 编译通过；引用被删键的代码全部清零（grep 验证）

### T-02 QwenProvider 重写为 OpenAI 兼容客户端

**文件**：`src/services/worker/QwenProvider.ts`（+ 对应测试）

- 协议：从原生 DashScope 改为 OpenAI 兼容（ChatCompletions）
  - 端点：`CLAUDE_MEM_QWEN_URL` 非空用之；空 → `https://dashscope.aliyuncs.com/compatible-mode/v1`
  - 认证：`Authorization: Bearer <CLAUDE_MEM_QWEN_API_KEY>`
  - 流式解析：`output.choices[0].message.content` 数组 → OpenAI `choices[0].message.content` 字符串
- 保留：`isQwenSelected()`（`CLAUDE_MEM_PROVIDER === 'qwen'`）、`isQwenAvailable()`（key 存在判定）、模型白名单回退、错误分类逻辑
- 注意：`isQwenAvailable` 的 key 来源改为 `CLAUDE_MEM_QWEN_API_KEY`（env > settings.json > getCredential），废弃 `CLAUDE_MEM_REPORT_QWEN_API_KEY`
- 验收：Qwen provider 单测全绿

### T-03 新增 DeepSeekProvider

**文件**：`src/services/worker/DeepSeekProvider.ts`（新）+ 单测

- 参照：OpenRouterProvider（OpenAI 兼容 HTTP）结构
- 端点：`CLAUDE_MEM_DEEPSEEK_URL`，默认 `https://api.deepseek.com`（OpenAI 兼容）
- 认证：`Authorization: Bearer <CLAUDE_MEM_DEEPSEEK_API_KEY>`
- 模型：`CLAUDE_MEM_DEEPSEEK_MODEL`，默认 `deepseek-v4-flash`
- 暴露：`isDeepSeekSelected()` / `isDeepSeekAvailable()`，模式与 Gemini/OpenRouter 一致
- 验收：单测覆盖请求格式 + 流式解析

### T-04 SessionRoutes 统一 provider 选择

**文件**：`src/services/worker/http/routes/SessionRoutes.ts`

- **删除** `getActiveAgent()` 中"Qwen 有 key 就自动选"兜底分支（原注释：`Qwen 有 key 就自动选,无需显式配置`），以及 `getSelectedProvider()` 中对应的兜底
- 选择顺序改为严格按 `CLAUDE_MEM_PROVIDER`：`qwen → deepseek → openrouter → gemini → claude(默认)`
- 显式配置了 provider 但 key 缺失 → 保持现状抛错（明确报错优于静默回退）
- 验收：删兜底后现有 SessionRoutes 测试全绿（必要时改断言）

### T-05 报表 provider 工厂化

**文件**：`src/services/worker/reports/ReportGenerator.ts`、`src/services/worker/reports/DailyReportGenerator.ts`

- 读 `CLAUDE_MEM_REPORT_PROVIDER`（`claude/qwen/gemini/openrouter/deepseek`），**空 → AI 段禁用**（沿用现状"没 key 退化纯数据汇总"）
- 模型：复用各厂商组 `_MODEL`（qwen 用 `CLAUDE_MEM_QWEN_MODEL` 等；claude 用 `CLAUDE_MEM_MODEL`）
- key：复用各厂商组 `_API_KEY`（判定 key 缺失 → AI 段禁用 + INFO 日志）
- 删除对 `CLAUDE_MEM_WEEKLY_REPORT_MODEL` / `CLAUDE_MEM_REPORT_QWEN_API_KEY` 的全部引用
- 新增 DeepSeek 分支（走 DeepSeekProvider 或共享的 OpenAI 兼容客户端）
- 验收：日报/周报生成单测覆盖 provider 矩阵

### T-06 server-beta 合并

**文件**：`src/server/runtime/create-server-beta-service.ts`

- `buildServerGenerationProviderFromEnv()` 改读 `CLAUDE_MEM_PROVIDER`（默认 `claude`），删除 `CLAUDE_MEM_SERVER_PROVIDER` / `CLAUDE_MEM_SERVER_MODEL` 引用
- 新增 `qwen` / `deepseek` 分支（复用新 provider 的 HTTP 客户端层）
- **claude 分支只认 API key**：`ANTHROPIC_API_KEY` / `CLAUDE_MEM_ANTHROPIC_API_KEY` 均无 → 返回 null（生成禁用 + WARN），不走 OAuth
- 验收：server-beta 相关测试全绿

### T-07 SettingsRoutes 校验更新

**文件**：`src/services/worker/http/routes/SettingsRoutes.ts`

- `validProviders` 加 `qwen`、`deepseek`
- 新增 `CLAUDE_MEM_REPORT_PROVIDER` 校验（同 5 取值，允许空）
- 移除已删键的白名单/校验引用
- 验收：校验单测全绿

### T-08 install.ts 交互安装流程

**文件**：`src/npx-cli/commands/install.ts`

- provider 交互选项加 `qwen`、`deepseek`
- 按所选 provider 提示对应 `_API_KEY` / `_URL`（可选）
- 新增 `CLAUDE_MEM_REPORT_PROVIDER` 询问项（默认空 = 禁用）
- 验收：install 测试全绿

### T-09 Viewer UI 设置面板

**文件**：`src/ui/viewer/`（types / constants / 设置表单组件）

- 新增字段：Qwen/DeepSeek 组（API_KEY 掩码显示 + MODEL + URL）、`CLAUDE_MEM_REPORT_PROVIDER`
- 移除已废弃字段的渲染
- 验收：`npm run build` 后 Viewer 可正常读写新字段

### T-10 文档同步

**文件**：`CLAUDE.md`、`README.md`、`docs/public/` 配置章节

- 更新「Configuration」段：统一 provider 架构、5 厂商组、报表 provider 语义（空 = 禁用）
- 明确边界：server-beta 的 claude 只认 key；多租户部署必须用 API key 不烧个人订阅
- 删除对 4 个废弃键的文档引用
- 验收：grep 文档无废弃键残留

### T-11 构建 + 全量测试 + 启动验证

- `npm run build-and-sync`
- 全量测试（bun test）通过，重点：Qwen/DeepSeek provider、SessionRoutes、报表生成、server-beta
- 验证 worker 启动 + settings.json 自动补齐新键
- 验收：无回归；`git status` 确认产物正确重建

---

## 4. 旧键 → 新键 对照表

| 旧键 | 新语义 | 处置 |
|---|---|---|
| `CLAUDE_MEM_REPORT_QWEN_API_KEY` | `CLAUDE_MEM_QWEN_API_KEY` | 删除，摘要/报表共用新键 |
| `CLAUDE_MEM_WEEKLY_REPORT_MODEL` | `CLAUDE_MEM_QWEN_MODEL`（按报表 provider 复用对应组） | 删除 |
| `CLAUDE_MEM_SERVER_PROVIDER` | `CLAUDE_MEM_PROVIDER` | 删除，server-beta 合并 |
| `CLAUDE_MEM_SERVER_MODEL` | 各厂商组 `_MODEL` | 删除 |

---

## 5. 验收清单

- [ ] 摘要生成：`CLAUDE_MEM_PROVIDER` 五选一严格生效，无任何隐式抢跑兜底
- [ ] 未配置 provider → 默认 claude（SDK subscription）行为不变
- [ ] Qwen：URL 空走 DashScope 兼容端点；自定义 URL 走 OpenAI 兼容
- [ ] DeepSeek：默认 `deepseek-v4-flash` 可用
- [ ] 报表：`CLAUDE_MEM_REPORT_PROVIDER` 空 → AI 段禁用；非空 → 用对应厂商组 key/model
- [ ] server-beta：读 `CLAUDE_MEM_PROVIDER`；claude 无 key → 生成禁用 + WARN
- [ ] 4 个废弃键在代码/文档/UI 中零残留
- [ ] 全量测试 + build-and-sync 通过
