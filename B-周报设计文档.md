---
version: "1.0"
date: 2026-06-09
feature: 用户工作周报
last_batch: Y-001
---

# B-周报设计文档

本文件给出 claude-mem「用户工作周报」功能的系统设计,是 `A-周报需求文档.md` 的实现侧映射。设计目标是在不改动现有采集链路与源表的前提下,新增一条"聚合 → 生成 → 存储 → 展示 → 下载"的独立支线:后台调度器每天定时、或前端手动触发,经统一的周报生成器从既有四张表(`observations`/`session_summaries`/`user_prompts`/`sdk_sessions`)按 `user_label + 周范围` 聚合,确定性拼装中文 Markdown 并可选叠加 AI 综合分析,落入新表 `weekly_reports`;worker 通过新增的 `ReportRoutes` 暴露列表/生成/详情页/下载四类端点,前端在 History 视图增量挂载一个周报列表区,详情页则由 worker 服务端用 `marked` 渲染为独立 HTML、双栏对照展示。整体复用 claude-mem 既有的 Express 路由框架、Bun SQLite 连接与设置管理机制;AI 综合分析段改用 **Qwen(阿里云 DashScope,OpenAI 兼容接口)**,凭证直接读环境变量 `DASHSCOPE_API_KEY`,新增面最小、与主链路解耦。

下文依次给出:总体架构与模块、技术选型、数据模型与表设计、接口设计、关键业务流程、前端交互设计、错误与降级策略,以及对现有代码的接入点。

---

## 1. 总体架构

周报支线在 worker 进程内自成闭环,横向并列于现有的同步代理(SyncAgent)与数据接口(DataRoutes),纵向贯穿"触发层 → 生成层 → 存储层 → 展示层"。触发有两条来源(后台 `ReportScheduler` 定时、前端经 HTTP 手动),二者汇入同一个 `ReportGenerator`;生成结果统一落入 `weekly_reports`,再由 `ReportRoutes` 面向前端列表、服务端渲染详情页与文件下载分别提供出口。前端仅在既有 React 统计页 `StatsPage` 的 History 分支增量挂载列表区,详情页不进单页应用、由后端整页输出,从而避免 SPA 路由改造。

```
                ┌───────────────────────────── worker 进程 ─────────────────────────────┐
 每天13:00 ───▶ │ ReportScheduler(setInterval 60s, 仿 SyncAgent)                         │
 前端"刷新" ──▶ │ ReportRoutes  POST /api/reports/generate ─┐                              │
                │                                           ▼                              │
                │                                   ReportGenerator                        │
                │      ┌────────────── 读取(只读) ─────────────┐   │                       │
                │      │ observations / session_summaries /     │   │ 确定性拼装 Markdown  │
                │      │ user_prompts / sdk_sessions            │   │ + 可选 Qwen 综合段 │
                │      └────────────────────────────────────────┘   ▼                       │
                │                                          UPSERT  weekly_reports(新表)      │
                │                                                   │                        │
                │ ReportRoutes:                                     ▼                        │
                │   GET /api/reports/list   ──── JSON ───▶ 前端 StatsPage 周报列表区          │
                │   GET /report             ──── HTML(marked 渲染, 双栏) ─▶ 新标签页          │
                │   GET /api/reports/download ── text/markdown ─▶ 浏览器另存为                │
                └───────────────────────────────────────────────────────────────────────────┘
```

### 1.1 模块清单

<!-- 来源:产品经理 | 状态:待实现 | 变更类型:新增 | 变更批次:Y-001 -->

| 模块 | 文件(新增/修改) | 职责 |
|------|------|------|
| ReportGenerator | 新增 `src/services/worker/reports/ReportGenerator.ts` | 按用户+周聚合数据,拼装中文 Markdown,可选 AI 综合段,返回 `{markdown, stats}` |
| ReportScheduler | 新增 `src/services/worker/reports/ReportScheduler.ts` | 每日定时为活跃用户生成本周周报,仿 `SyncAgent` 的 setInterval/unref 模式 |
| ReportRoutes | 新增 `src/services/worker/http/routes/ReportRoutes.ts` | 4 个端点:list / generate / report(HTML) / download |
| 表迁移 | 修改 `src/services/sqlite/migrations.ts` | 新增迁移建 `weekly_reports` 表 |
| 服务装配 | 修改 `src/services/worker-service.ts` | 注册 ReportRoutes、启动/停止 ReportScheduler |
| 设置项 | 修改 `src/shared/SettingsDefaultsManager.ts` | 新增开关与时间两项默认设置 |
| 前端列表 | 修改 `src/ui/viewer/components/StatsPage.tsx` | History 分支挂载周报列表区 + 拉取状态 |
| 文案 | 修改 `src/ui/viewer/utils/i18n.ts` | 周报相关中英文案键 |
| 依赖 | 修改 `package.json` | 新增 `marked`(Markdown→HTML) |

---

## 2. 技术选型

本节说明关键技术决策及其依据,优先复用 claude-mem 既有能力,仅在确有缺口处引入轻量新依赖。

<!-- 来源:产品经理 | 状态:待实现 | 变更类型:新增 | 变更批次:Y-001 -->

| 关注点 | 选型 | 理由 |
|------|------|------|
| 模型调用(AI 综合段) | **Qwen / 阿里云 DashScope**(OpenAI 兼容接口),`fetch` 直连,无新依赖 | 默认模型 `qwen-plus`;API Key 直接读环境变量 `DASHSCOPE_API_KEY`(不入 settings、不落库);端点 `https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions`;一次性 `chat/completions` 调用、`stream:false`、带超时;Key 缺失即跳过 AI 段 |
| Markdown→HTML | 新增 `marked` | 现有 `unified`/`remark-parse` 缺 HTML 输出链路;`marked` 零配置、体积小、服务端渲染稳定 |
| 详情页形态 | worker 服务端渲染独立 HTML(`GET /report`) | 新标签打开、双栏对照、自带样式与下载按钮;避免改造无路由库的 SPA |
| 定时调度 | `setInterval(60s)` 轮询比对 `HH:MM` + 当日去重 | 仿 `SyncAgent`,零新依赖;比固定 interval 更贴合"每天某点"语义 |
| 存储 | 新增独立表 `weekly_reports` | 与源表解耦;UPSERT 支持重算;`stats` 以 JSON 列承载列表摘要,避免列表二次聚合 |
| 时间口径 | `completed_at_epoch - created_at_epoch + think_time_ms` 求和 | 与 History 周/月表完全一致,跨视图数值可对账 |
| 时区/周边界 | 周一为周起点,本地时区按 `tzOffsetMs` 平移 | 复用 `DataRoutes.ts` 既有 `historyWeeks` 的周切分逻辑 |

---

## 3. 数据模型与表设计

周报功能在数据层只**新增一个聚合产物实体**——周报(WeeklyReport),它是对既有"会话/观察/总结/提示"四类原子数据按 `user_label + 周` 做的派生快照,自身不参与采集、不被源数据外键引用(claude-mem 约定禁用物理外键,依赖应用层 `user_label`/`week_start` 逻辑关联)。下文给出实体定义与对应表结构;源表字段不在此重述,仅标注被读取的来源列。

### 3.1 实体:WeeklyReport(对应 E-数据模型)

<!-- 来源:产品经理 | 状态:待实现 | 变更类型:新增 | 变更批次:Y-001 -->

| 属性 | 含义 | 来源/计算 |
|------|------|------|
| user_label | 周报主体用户 | 既有各表 `user_label` |
| week_start | 周一本地日期 `YYYY-MM-DD`(主标识之一) | 周切分 |
| week_end | 周日本地日期(展示用) | week_start + 6 天 |
| markdown | 周报正文(中文 Markdown,所见即所得之源) | ReportGenerator 拼装 |
| stats | 列表摘要 JSON:`{totalMs, projects, prompts, obs, summaries, sessions}` | 聚合 |
| model | 生成 AI 段所用模型;纯拼装时为空 | 运行时 |
| generated_at_epoch | 最近一次生成时间戳(毫秒) | 运行时 |

唯一性:`(user_label, week_start)` 唯一,重算即覆盖。

### 3.2 表:`weekly_reports`(对应 F-数据库表设计)

<!-- 来源:产品经理 | 状态:待实现 | 变更类型:新增 | 变更批次:Y-001 -->

迁移追加于 `src/services/sqlite/migrations.ts`(在当前最高迁移号之后顺延新增一版)。

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | INTEGER | PK AUTOINCREMENT | 主键 |
| user_label | TEXT | NOT NULL | 周报用户;空标签归一为 `unknown` |
| week_start | TEXT | NOT NULL | 周一日期 `YYYY-MM-DD` |
| week_end | TEXT | NOT NULL | 周日日期 `YYYY-MM-DD` |
| markdown | TEXT | NOT NULL | 周报正文 Markdown |
| stats | TEXT | NULL | 列表摘要 JSON |
| model | TEXT | NULL | AI 段模型标识;纯拼装为空 |
| generated_at_epoch | INTEGER | NOT NULL | 生成时间戳(ms) |

索引:
- `UNIQUE idx_weekly_reports_user_week (user_label, week_start)` — UPSERT 依据。
- `idx_weekly_reports_user_week_desc (user_label, week_start DESC)` — 列表倒序拉取。

> 不设物理外键;`user_label`/`week_start` 与源数据为应用层逻辑关联(符合项目数据库设计约束)。

### 3.3 被读取的源表与计算口径

<!-- 来源:逆向分析 | 代码事实 -->
以下为现有表的真实字段(节选),周报生成只读不改:

- `observations`:`type`(枚举 `bugfix|feature|refactor|discovery|decision|change`)、`title`/`subtitle`/`narrative`/`facts`/`concepts`/`files_modified`、`created_at_epoch`、`user_label`、`project`、`merged_into_project`、`discovery_tokens`。
- `session_summaries`:`request`/`investigated`/`learned`/`completed`/`next_steps`/`notes`、`created_at_epoch`、`user_label`、`project`、`merged_into_project`。
- `user_prompts`:`prompt_text`、`created_at_epoch`、`completed_at_epoch`、`think_time_ms`、`content_session_id`。
- `sdk_sessions`:`project`、`user_label`、`started_at_epoch`、`content_session_id`。

<!-- 来源:产品经理 | 状态:待实现 | 变更类型:新增 | 变更批次:Y-001 -->
计算口径:某用户某周某项目耗时 = 该范围内 `Σ(completed_at_epoch - created_at_epoch + think_time_ms)`(仅 `completed_at_epoch IS NOT NULL` 的 prompt);项目集合经 `COALESCE(NULLIF(merged_into_project,''), project)` 归并;用户匹配 `user_label COLLATE NOCASE`。周边界与 `DataRoutes.ts` 的 `historyWeeks` 一致(周一起、`tzOffsetMs` 平移)。

---

## 4. 接口设计

`ReportRoutes` 继承 `BaseRouteHandler`,在 `worker-service.ts` 的 `registerRoutes()` 中注册(与 `DataRoutes` 并列)。四个端点划分清晰:前两个为 JSON API 供前端调用,`/report` 为整页 HTML 供新标签直接打开,`/api/reports/download` 为文件流。鉴权沿用既有策略:server 模式经 token 校验,standalone 直通。

<!-- 来源:产品经理 | 状态:待实现 | 变更类型:新增 | 变更批次:Y-001 -->

| 方法 & 路径 | 入参 | 出参 | 说明 |
|------|------|------|------|
| `GET /api/reports/list` | `user`(必填), `project`(可选) | `{reports:[{week_start, week_end, generated_at_epoch, stats}]}` | 该用户最近 ~12 条周报,倒序;供列表渲染 |
| `POST /api/reports/generate` | body `{user, week}` | `{ok, week_start, generated_at_epoch}` | 同步生成/重算并 UPSERT;供"刷新本周"与调度复用;入参非法返回 400 |
| `GET /report` | `user`, `week`, `token`(server 模式) | `text/html` 整页 | 取 `week`(右)与 `week-1`(左)的 markdown,`marked` 渲染,套内置样式双栏模板,每栏带下载按钮;无目标周显示提示 |
| `GET /api/reports/download` | `user`, `week` | `text/markdown` | 原始 .md;`Content-Disposition: attachment; filename*=UTF-8''周报-<week_start>-<名字>.md`;无记录 404 |

错误约定:统一经 `BaseRouteHandler` 的 `badRequest/notFound/unauthorized/handleError`;路径与现有 `ViewerRoutes`(`/`、`express.static('ui')`)、`DataRoutes`(`/api/stats/*`)均不冲突。

---

## 5. 关键业务流程(对应 D-核心业务流程)

本节描述三条端到端流程:自动生成、手动刷新、查看详情。三者在"生成"环节收敛到同一 `ReportGenerator`,保证内容一致性。

<!-- 来源:产品经理 | 状态:待实现 | 变更类型:新增 | 变更批次:Y-001 -->

### 5.1 每日自动生成(R-3.1)
1. `ReportScheduler` 每 60 秒 tick 一次;读取本地 `HH:MM`。
2. 若 `CLAUDE_MEM_WEEKLY_REPORT_ENABLED` 为真,且 `HH:MM == CLAUDE_MEM_WEEKLY_REPORT_TIME`,且当天未执行 → 进入生成。
3. 计算本周 `week_start/week_end`;查询本周活跃 `user_label` 列表。
4. 逐用户调用 `ReportGenerator.generate(user, week)`;成功则 UPSERT `weekly_reports`,失败记日志并继续下一个。
5. 标记当天已执行,清理状态等待次日。

### 5.2 手动刷新本周(R-1.2 / R-3.2)
1. 前端列表"刷新本周"→ `POST /api/reports/generate {user, week:本周一}`。
2. 路由校验入参 → 调 `ReportGenerator` → UPSERT → 返回生成时间。
3. 前端成功回调后重拉 `/api/reports/list`,本周条目"生成时间"刷新。

### 5.3 查看详情(R-2.1)
1. 前端"查看"→ `window.open('/report?user=&week='[+'&token='])` 新标签。
2. worker 取 `week`(右)、`week-1`(左)的 markdown;各经 `marked` → HTML。
3. 套双栏模板返回整页;浏览器渲染;点栏内"下载"→ `/api/reports/download`。

### 5.4 内部生成流程(混合生成,R-3.3)
1. 聚合:按 `user+周` 取项目集、各表内容文本与耗时(只读查询,口径见 §3.3)。
2. 拼装:生成中文 Markdown 骨架——`# 标题` → `## 概览` → `## 本周综合分析`(占位) → `## 按项目`(逐项目:工作内容/成果/耗时/关键观察) → `## 学习与发现` → `## 下一步`。
3. AI 综合段(可选):读 `process.env.DASHSCOPE_API_KEY`,缺失则直接跳过;否则将聚合摘要拼为单条 prompt,`fetch` 调用 DashScope OpenAI 兼容 `chat/completions`(模型 `CLAUDE_MEM_WEEKLY_REPORT_MODEL`,默认 `qwen-plus`,`stream:false`),取 `choices[0].message.content` 填入"本周综合分析";`try/catch` + `AbortController` 超时保护,任何失败/超时均删除该段占位并清空 `model`。
4. 返回 `{markdown, stats}` 交调用方落库。

---

## 6. 前端交互设计(对应 C-前端交互设计)

周报在前端只新增一个"列表区",不改动 History 视图既有结构(用户 Tab、TrendBars、Weekly/Monthly History 表)。详情页因是后端整页,不进 React。

<!-- 来源:产品经理 | 状态:待实现 | 变更类型:新增 | 变更批次:Y-001 -->

**布局**:在 `StatsPage` history 分支、Monthly History 表 `renderTable(...)` 之后,新增 `.stats-section`:
- 标题:`t('stats.weeklyReports')`;右侧"刷新本周"按钮 `t('stats.refreshThisWeek')`。
- 列表:复用 `.stats-user-table-wrap` 容器,行式卡片;每行左侧周期+生成时间+耗时/项目摘要,右侧"查看"`t('stats.openReport')`/"下载"`t('stats.downloadReport')`。
- 空态:`t('stats.noReports')`。

**状态与数据**:在组件顶层 hooks 区新增 `historyReports` 状态与一个 `useEffect`——当 `scope==='history'` 且 `activeUser` 变化时 `authFetch('/api/reports/list?user='+encodeURIComponent(activeUser))` 拉取(避免在分支内调用 hook)。

**跳转与鉴权**:"查看"用 `window.open` 同源拼 `/report?user=&week=`;server 模式从 `localStorage['claude-mem-admin-token']` 读取 token 附加为 `&token=`。"下载"直接 `window.open('/api/reports/download?user=&week=')`。

**文案(i18n,中英各加)**:`stats.weeklyReports`/`stats.openReport`/`stats.downloadReport`/`stats.refreshThisWeek`/`stats.reportGenerated`/`stats.noReports`。详情页文案在后端 HTML 模板内直接写中文,不走前端 i18n。

---

## 7. 配置项(对应设置管理)

<!-- 来源:产品经理 | 状态:待实现 | 变更类型:新增 | 变更批次:Y-001 -->

在 `src/shared/SettingsDefaultsManager.ts` 的 `SettingsDefaults` 接口与 `DEFAULTS` 同步新增:

| Key | 默认值 | 说明 |
|------|------|------|
| `CLAUDE_MEM_WEEKLY_REPORT_ENABLED` | `'true'` | 周报定时生成总开关 |
| `CLAUDE_MEM_WEEKLY_REPORT_TIME` | `'13:00'` | 每日生成时间(本地 `HH:MM`) |
| `CLAUDE_MEM_WEEKLY_REPORT_MODEL` | `'qwen-plus'` | AI 综合段所用 Qwen 模型名(可改 `qwen-max`/`qwen-turbo` 等) |

安装期既有的"缺失 key 自动 backfill"机制会为旧用户补回这三项。

> **凭证不入 settings**:`DASHSCOPE_API_KEY` **只**从进程环境变量读取,不写入 `settings.json`、不落库、不出现在任何接口返回中。未设置该环境变量时,周报功能正常运行,仅省略 AI 综合段。

---

## 8. 错误处理与降级策略

遵循 claude-mem 退出码哲学(worker/hook 层错误不致命),周报支线的所有失败都"安静降级",绝不影响主链路与进程稳定。

<!-- 来源:产品经理 | 状态:待实现 | 变更类型:新增 | 变更批次:Y-001 -->

| 失败场景 | 处理 |
|------|------|
| `DASHSCOPE_API_KEY` 未配置 | 直接跳过 AI 调用,输出纯拼装周报;`model` 置空(纯本地、零外发) |
| Qwen/DashScope 不可用/超时/非 2xx/解析失败 | 捕获后删除"综合分析"段,输出纯拼装周报;`model` 置空 |
| 单用户生成异常(定时批量中) | 记 ERROR 日志,跳过该用户,继续其余,不中断调度 |
| 详情页目标周无记录 | 返回友好提示页,而非 500/空白 |
| 下载目标无记录 | 404,不产出空文件 |
| server 模式 token 缺失/非法 | 401,不泄露内容 |
| 调度器异常 | `try/catch` 包裹 tick,记日志;`timer.unref()`,worker 退出不被阻塞 |

---

## 9. 对现有代码的接入点(实现指引)

<!-- 来源:逆向分析 | 代码事实 -->
- 路由注册:`src/services/worker-service.ts` 的 `registerRoutes()`(现注册 `DataRoutes`/`SettingsRoutes` 等)。
- 后台任务启动:`src/services/worker-service.ts` 的 `initializeBackground()`(现启动 `SyncAgent`)。
- 定时器范式:`src/services/sync/SyncAgent.ts`(`setInterval` + `unref` + `start/stop`)。
- 模型调用:**新增** Qwen/DashScope 客户端(`fetch` OpenAI 兼容 `chat/completions`),Key 取 `process.env.DASHSCOPE_API_KEY`、模型取 `CLAUDE_MEM_WEEKLY_REPORT_MODEL`;不再走 Agent SDK `query()`。建议封装为 `ReportGenerator` 内的小函数 `synthesizeHighlights(summaryInput): Promise<string|null>`,无 Key 或失败返回 `null`。
- 周聚合范式:`src/services/worker/http/routes/DataRoutes.ts` 的 `aggregateRange`/`countBizDays`/`historyWeeks`。
- HTML 服务范式:`src/services/worker/http/routes/ViewerRoutes.ts`(`express.static` + 自定义 `GET`)。
- DB 连接:`src/services/worker/DatabaseManager.ts`(`getConnection()`/`getSessionStore()`)。
- 前端挂载点:`src/ui/viewer/components/StatsPage.tsx` history 分支 Monthly History 之后;请求工具 `src/ui/viewer/utils/api.ts` 的 `authFetch`;文案 `src/ui/viewer/utils/i18n.ts`。

---

## 10. 验证要点

1. `npm install marked` → `npm run build` 编译通过(worker + viewer)。
2. `POST /api/reports/generate` 生成本周周报并落库;`weekly_reports` 出现行、`markdown` 含概览/按项目/(综合分析)。
3. `GET /api/reports/list?user=...` 返回倒序条目。
4. 浏览器打开 `/report?user=...&week=...`:双栏(有上周则左上周右本周)、Markdown 正常渲染、下载按钮可用;下载文件名 `周报-<week_start>-<名字>.md` 且中文不乱码。
5. History 视图选中用户 → Monthly History 下出现周报列表;查看/下载/刷新本周均生效;0 控制台错误。
6. 临时将 `CLAUDE_MEM_WEEKLY_REPORT_TIME` 设为近 1–2 分钟后,重启 worker 验证到点自动为活跃用户生成,随后改回 `13:00`。

---

## 11. 关联

- 需求来源:`A-周报需求文档.md`(R-1.x ~ R-4.x、非功能需求)。
- 变更溯源:`Y-需求变更记录.md`(批次 Y-001)。
- 实现交付:本文件标"待实现"条目交 /dev;实现后由 /ree 回刷为代码事实(`file:line`)。
