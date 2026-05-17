# TODO — 客户端/服务端双模式 + 自动同步 实施任务清单

> 基于：`S-服务器模式设计文档.md` v1.2
> 创建：2026-05-16
> 状态：方案已确认，等待 Phase 1 实施

---

## 0. 评分体系

每个任务三维评分，**综合分 = N × 2 + F − C**，分数越高越优先。

| 维度 | 含义 | 1 (差) | 3 (中) | 5 (优) |
|---|---|---|---|---|
| **N 必要性** | 不做这条会直接破坏的事 | 锦上添花 | Phase 应有 | 整条链路缺一不可 |
| **F 可行性** | 现有代码基础能直接复用程度 | 需引入新依赖/范式 | 需新增模块 | 一行配置即达成 |
| **C 复杂度** *(越低越好)* | 工时 + 出错风险 | 1 小时 | 半天-1 天 | 多天 + 跨模块改造 |

> 综合分理论范围 [-3, +14]。≥ 12 = 必做、≥ 10 = 强烈推荐、7-9 = 应做、< 7 = 视情况推迟。

---

## 1. 总进度表（按综合分降序）

| 优先 | ID | 任务 | Phase | N | F | C | 分 | 估时 | 依赖 | 状态 |
|---:|---|---|---|---:|---:|---:|---:|---|---|---|
| 1 | T-01 | 配置项扩展（16 个新 settings 键） | 1 | 5 | 5 | 1 | **14** | 1h | — | ☑ |
| 1 | T-02 | `src/shared/user-label.ts` — 身份解析 | 1 | 5 | 5 | 1 | **14** | 1h | T-01 | ☑ |
| 1 | T-03 | Migration v36 — `sdk_sessions.user_label` | 1 | 5 | 5 | 1 | **14** | 1h | — | ☑ |
| 1 | T-04 | `createSDKSession` 写入 user_label | 1 | 5 | 5 | 1 | **14** | 1h | T-02 T-03 | ☑ |
| 1 | T-12 | `enforceAllowList` 中间件 | 1 | 5 | 5 | 1 | **14** | 1h | T-01 | ☑ |
| 2 | T-05 | Migration v37 — `sync_inbox` (server only) | 1 | 5 | 5 | 2 | **13** | 1h | T-03 | ☑ |
| 2 | T-07 | `sync-state.json` 持久化（watermark） | 1 | 5 | 5 | 2 | **13** | 0.5d | T-01 | ☑ |
| 2 | T-10 | `SyncAuthStrategy` 抽象 + `NoopAuth` | 1 | 5 | 5 | 2 | **13** | 0.5d | T-01 | ☑ |
| 3 | T-08 | 增量采集 payload 序列化器 | 1 | 5 | 5 | 3 | **12** | 0.5d | T-03 T-07 | ☑ |
| 3 | T-13 | 触发点接入 `scheduleSoon()` | 1 | 4 | 5 | 1 | **12** | 1h | T-06 | ☑ |
| 3 | T-16 | frpc + nginx 部署样例文档 | 1 | 4 | 5 | 1 | **12** | 1h | — | ☑ |
| 3 | T-18 | `/api/admin/role` 端点 | 2 | 4 | 5 | 1 | **12** | 0.5h | T-01 | ☑ |
| 4 | T-14 | Worker 启动按 role 分支 | 1 | 5 | 4 | 3 | **11** | 0.5d | T-01 T-06 T-09 | ☑ |
| 4 | T-19 | `/api/users` 端点 | 2 | 4 | 5 | 2 | **11** | 1h | T-03 | ☑ |
| 4 | T-20 | Stats/list 端点加 `userLabel` 参数 | 2 | 4 | 5 | 2 | **11** | 2h | T-03 | ☑ |
| 5 | T-06 | `SyncAgent` 主体（采集+推送+重试） | 1 | 5 | 4 | 4 | **10** | 1.5d | T-07 T-08 T-09 | ☑ |
| 5 | T-09 | `POST /api/sync/ingest` 路由 + 事务 | 1 | 5 | 4 | 4 | **10** | 1.5d | T-05 T-10 T-11 T-12 | ☑ |
| 5 | T-11 | `trustProxyMiddleware`（IP CIDR） | 1 | 4 | 4 | 2 | **10** | 0.5d | T-01 | ☑ |
| 5 | T-17 | Phase 1 单元测试套件 | 1 | 4 | 5 | 3 | **10** | 0.5d | 全部 Phase 1 | ☑ |
| 5 | T-21 | viewer Header 员工下拉 | 2 | 4 | 4 | 2 | **10** | 0.5d | T-18 T-19 T-24 | ☑ |
| 5 | T-22 | viewer SSE 客户端按 user_label 过滤 | 2 | 3 | 5 | 1 | **10** | 1h | T-21 | ☑ |
| 5 | T-23 | 卡片 footer 改 user_label chip | 2 | 3 | 5 | 1 | **10** | 1h | T-20 | ☑ |
| 5 | T-24 | i18n keys（同步/员工选择器） | 2 | 3 | 5 | 1 | **10** | 0.5h | — | ☑ |
| 5 | T-28 | 同步错误日志文件 | 3 | 3 | 5 | 1 | **10** | 1h | T-06 | ☑ |
| 6 | T-26 | `install-claude-mem` 加 sync 参数 | 3 | 3 | 5 | 2 | **9** | 0.5d | T-01 | ☑ |
| 7 | T-15 | redact patterns 过滤 | 1 | 3 | 4 | 2 | **8** | 0.5d | T-08 | ☑ |
| 7 | T-25 | Header 同步状态徽章 | 3 | 3 | 4 | 2 | **8** | 0.5d | T-06 | ☑ |
| 7 | T-31 | HTTPS / Let's Encrypt 部署文档 | 4 | 2 | 5 | 1 | **8** | 0.5d | — | ☑ |
| 7 | T-32 | `install --api-key` 参数 | 4 | 2 | 5 | 1 | **8** | 1h | T-29 | ☑ |
| 7 | T-33 | 零停机切 ApiKey runbook | 4 | 2 | 5 | 1 | **8** | 1h | T-29 | ☑ |
| 8 | T-27 | `claude-mem server sync-audit` CLI | 3 | 2 | 4 | 2 | **6** | 1h | T-05 | ☑ |
| 8 | T-30 | `server sync-keys` CLI | 4 | 2 | 4 | 2 | **6** | 0.5d | T-29 | ☑ |
| 9 | T-29 | `ApiKeyAuth` 完整实现 | 4 | 2 | 4 | 3 | **5** | 1d | T-10 | ☑ |

**Phase 1 关键路径** (依赖图)：
```
T-01 ─┬─ T-02 ─┐
      ├─ T-03 ─┴─ T-04 ─┐
      ├─ T-07 ──────────┤
      ├─ T-10 ──────────┼─ T-09 ─┐
      ├─ T-11 ──────────┤        │
      ├─ T-12 ──────────┘        │
      └─ T-16                    │
T-03 ─── T-05 ──────────────────┤
T-08 ───────────────────────────┘
                                 │
                                T-14 ─── T-06 ─── T-13
                                 │
                                T-17 (verify)
```

**Phase 1 估时合计**：约 **8 个工作日**（单人，连续推进）。

---

# Phase 1 — 首版核心同步（无鉴权 + frpc 局域网）

## T-01 配置项扩展 [N5/F5/C1 = **14**]

### 需求
为客户端/服务端双模式新增 16 个 `CLAUDE_MEM_*` 配置项，落入 `SettingsDefaultsManager.DEFAULTS`，使 `settings.json` 能在首次启动时自动落地默认值。

### 设计
新增键（含默认值与类型）：

**通用**
| Key | Type | Default |
|---|---|---|
| `CLAUDE_MEM_NODE_ROLE` | `'client' \| 'server'` | `'client'` |
| `CLAUDE_MEM_USER_LABEL` | string | `''`（运行时若空则 fallback OS username 并回写） |

**client**
| Key | Type | Default |
|---|---|---|
| `CLAUDE_MEM_SYNC_ENABLED` | bool string | `'true'` |
| `CLAUDE_MEM_SYNC_UPSTREAM_URL` | URL string | `''` |
| `CLAUDE_MEM_SYNC_AUTH_MODE` | `'none'\|'apikey'\|'jwt'\|'mtls'` | `'none'` |
| `CLAUDE_MEM_SYNC_API_KEY` | string | `''` |
| `CLAUDE_MEM_SYNC_INTERVAL_MS` | int string | `'30000'` |
| `CLAUDE_MEM_SYNC_BATCH_SIZE` | int string | `'200'` |
| `CLAUDE_MEM_SYNC_RETRY_MAX` | int string | `'8'` |
| `CLAUDE_MEM_SYNC_REDACT_PATTERNS` | csv glob | `''` |

**server**
| Key | Type | Default |
|---|---|---|
| `CLAUDE_MEM_SERVER_BIND_HOST` | string | `'0.0.0.0'` *(server)* / `'127.0.0.1'` *(client)* |
| `CLAUDE_MEM_SERVER_AUTH_MODE` | enum | `'none'` |
| `CLAUDE_MEM_SERVER_TRUSTED_PROXIES` | csv CIDR | `'127.0.0.1/32'` |
| `CLAUDE_MEM_SERVER_ALLOWED_USERS` | csv | `''`（空=全允许，建议生产填白名单） |
| `CLAUDE_MEM_SERVER_INGEST_MAX_BATCH` | int | `'1000'` |
| `CLAUDE_MEM_SERVER_REQUIRE_TLS` | bool string | `'false'` |

### 规范
- 所有键加在 `SettingsDefaults` interface（`src/shared/SettingsDefaultsManager.ts`）
- 默认值跟 worker 启动行为兼容（不开启 sync 时端到端表现等同于旧版本）
- `CLAUDE_MEM_SERVER_BIND_HOST` 默认 `127.0.0.1`，server 模式启动时若仍是 127.0.0.1 → 输出 warn 提示改 0.0.0.0

### 限制
- 不要破坏现有 settings.json 的 `loadFromFile` 自动迁移逻辑
- 不要在 worker-service 启动顺序中提前依赖任何新键（用 `??` 兜默认）

### 验收
- 全新机器首启动后 `~/.claude-mem/settings.json` 自动包含全部 16 个新键
- 旧机器升级后旧键不丢、新键追加进文件

---

## T-02 `src/shared/user-label.ts` — 身份解析工具 [N5/F5/C1 = **14**]

### 需求
worker 启动时确定本节点的 `user_label`：优先取 settings 中已显式配置的值；否则取 `os.userInfo().username` 并**回写 settings 固化**（避免 OS 切账户后突然变身）。

### 设计
```ts
export interface UserLabelResolver {
  /** 返回当前进程的 user_label（保证非空）。第一次调用可能触发 settings 回写。 */
  resolve(): string;
}

export function resolveUserLabel(settingsPath: string): string {
  const s = SettingsDefaultsManager.loadFromFile(settingsPath);
  if (s.CLAUDE_MEM_USER_LABEL?.trim()) return s.CLAUDE_MEM_USER_LABEL.trim();
  const fallback = osUserOrFallback();
  persistUserLabel(settingsPath, fallback);   // 写回 settings.json
  return fallback;
}
```

### 规范
- OS 用户名读取走 `src/shared/os-user.ts` 现成函数
- 回写要走原子写（tmp + rename），别污染 settings 其它字段
- 单元测试：settings 已有 / 已空 / OS 读取失败三种路径

### 限制
- 不在每次写入时调用，仅 worker 启动时一次性 resolve 缓存到内存
- user_label 字符集建议 `[A-Za-z0-9._-]`，包含其他字符仍接受但加 warn

### 验收
- 全新机器：settings 中 `USER_LABEL` 空 → 启动后变成 OS username
- 用户改 settings：worker 重启后用新值，不再覆盖

---

## T-03 Migration v36 — `sdk_sessions.user_label` [N5/F5/C1 = **14**]

### 需求
给 `sdk_sessions` 表加 `user_label TEXT` 列 + 索引。

### 设计
```sql
ALTER TABLE sdk_sessions ADD COLUMN user_label TEXT;
CREATE INDEX idx_sdk_sessions_user ON sdk_sessions(user_label);
INSERT INTO schema_versions (version, applied_at) VALUES (36, datetime('now'));
```

代码位置：`src/services/sqlite/migrations/runner.ts` 新增 `addSessionUserLabelColumn()`，加入 `runAllMigrations()` 调用序列末尾。

### 规范
- 沿用 v35 (`addSessionUserNameColumn`) 的代码模板：先查 `schema_versions` 是否已 applied，列已存在则跳过 ALTER
- 不动 observations / session_summaries / user_prompts（通过 JOIN 拿）

### 限制
- 老库升级**不回填**历史数据的 user_label（旧数据 user_label=NULL，UI 显示空）
- 如需回填可走另外的 maintenance CLI（不进首版）

### 验收
- 全新库：表里有 user_label 列
- 老库升级：v36 marker 写入，user_label 列存在但旧行为 NULL

---

## T-04 `createSDKSession` 写入 user_label [N5/F5/C1 = **14**]

### 需求
新 session 创建时把 user_label 写到 `sdk_sessions` 行里。

### 设计
`src/services/sqlite/sessions/create.ts`：
```ts
import { resolveUserLabel } from '../../../shared/user-label.js';
const userLabel = resolveUserLabel();  // 进程内缓存

db.prepare(`
  INSERT INTO sdk_sessions
  (..., user_name, user_label)
  VALUES (..., ?, ?)
`).run(..., getOsUserName(), userLabel);
```

### 规范
- 与现有 `getOsUserName()` 共存：user_name 是 OS 用户名快照，user_label 是同步身份（可被员工显式覆盖）
- existing session 路径（已有 row）也需 backfill：检测 user_label 是否 NULL，是则 UPDATE 一次

### 限制
- session 创建是热点路径，user_label 必须缓存（不能每次重读 settings）

### 验收
- 新建一个 claude-code session 后查 db：`SELECT user_label FROM sdk_sessions ORDER BY id DESC LIMIT 1` 返回 OS username

---

## T-05 Migration v37 — `sync_inbox` (server only) [N5/F5/C2 = **13**]

### 需求
建 `sync_inbox` 表用于幂等去重 + 审计；仅 server 模式建表（client 不需要）。

### 设计
```sql
-- 仅 if (CLAUDE_MEM_NODE_ROLE === 'server') 时跑
CREATE TABLE IF NOT EXISTS sync_inbox (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  user_label        TEXT    NOT NULL,
  source_table      TEXT    NOT NULL
                    CHECK(source_table IN ('sdk_sessions','observations','session_summaries','user_prompts')),
  source_uid        TEXT    NOT NULL,
  applied_at_epoch  INTEGER NOT NULL,
  applied_row_id    INTEGER,
  UNIQUE(user_label, source_table, source_uid)
);
CREATE INDEX idx_sync_inbox_user_time ON sync_inbox(user_label, applied_at_epoch DESC);
```

### 规范
- migration 编号 v37
- runner.ts 在 v36 后立刻调用，但**只在 role=server 时执行**（避免污染 client 库）
- source_uid 选择：
  - `sdk_sessions` → `content_session_id`
  - `observations` → `${memory_session_id}:${content_hash}`
  - `session_summaries` → `${memory_session_id}:${prompt_number}` (无 prompt_number 时用 created_at_epoch)
  - `user_prompts` → `${content_session_id}:${prompt_number}`

### 限制
- 不为 client 建表，避免增加 client 的 schema 复杂度

### 验收
- server 模式启动后表存在
- client 模式启动后表不存在

---

## T-06 `SyncAgent` 主体 [N5/F4/C4 = **10**]

### 需求
后台同步代理：定时拉本地新数据 → 推到 upstream → 推进 watermark → 处理失败重试。

### 设计
`src/services/sync/SyncAgent.ts`：
```ts
export class SyncAgent {
  private timer: ReturnType<typeof setInterval> | null = null;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private pushing = false;

  constructor(
    private dbManager: DatabaseManager,
    private config: {
      upstreamUrl: string;
      userLabel: string;
      authMode: 'none' | 'apikey' | 'jwt' | 'mtls';
      apiKey?: string;
      intervalMs: number;
      batchSize: number;
      retryMax: number;
    }
  ) {}

  async start(): Promise<void> { await this.tick(); this.timer = setInterval(() => void this.tick(), this.config.intervalMs); this.timer.unref(); }
  scheduleSoon(delayMs = 2000): void { /* 防抖触发 tick */ }
  async tick(): Promise<void> { /* 见 §7.1 */ }
  async stop(): Promise<void> { /* clear timer + 最后冲一次 */ }
}
```

### 规范
- **依赖序**：推送时先 sdk_sessions（FK 父表）再 observations/summaries/prompts
- **批量上限**：单 tick 每张表最多取 `batchSize` 行；超出留下一次
- **重试**：HTTP 5xx/429/网络错误 → 指数退避（1s,2s,4s,…,5min cap），最多 `retryMax` 次；4xx 永久失败写日志
- **并发**：用 `pushing` 标志位防止 tick 重入

### 限制
- worker 启动时若 sync 配置不全（无 upstream_url）→ 不实例化，**不要**抛错
- worker 停止时 `await syncAgent.stop()`，最长等 5s

### 验收
- 单元测试：mock fetch，模拟 200/5xx/网络错误三种情况，watermark 推进正确
- 集成测试：worker A 写 10 条 obs，30s 内 server B 看到

---

## T-07 `sync-state.json` 持久化（watermark） [N5/F5/C2 = **13**]

### 需求
持久化 watermark（每张表最后已成功推送的 row id）与失败计数。

### 设计
`src/services/sync/sync-state.ts`：
```ts
export interface SyncState {
  upstream_url: string;
  last_sync_at: number;
  last_success_at: number;
  watermark: { observations: number; summaries: number; prompts: number; sessions: number };
  failures: { consecutive: number; last_error: string | null };
}

export function readState(path?: string): SyncState;
export function writeState(state: SyncState, path?: string): void;   // 原子写
```

文件位置：`~/.claude-mem/sync-state.json`

### 规范
- 写入用 tmp + rename 原子
- 损坏时返回零 state，不抛错
- 持久化频率：每次 tick 成功后立即写

### 限制
- 不进 SQLite（独立 JSON）：解耦 sync 出错时不影响主 DB

### 验收
- 模拟 worker crash：crash 前 watermark=100，重启后从 100 继续

---

## T-08 增量采集 payload 序列化器 [N5/F5/C3 = **12**]

### 需求
按 watermark 从 SQLite 提取新行，序列化成 ingest payload。

### 设计
`src/services/sync/payload.ts`：
```ts
export function collectIncremental(
  db: Database,
  watermark: SyncState['watermark'],
  batchSize: number,
  redactGlobs: string[],
): { batch: IngestBatch; nextLocalIds: { sessions: number; observations: number; summaries: number; prompts: number } };
```

四张表按 `WHERE id > :wm ORDER BY id ASC LIMIT :batchSize` 提取。

### 规范
- 字段裁剪：`files_read` / `files_modified` 命中 `redactGlobs` 的条目剔除；如全部命中则跳过该 observation
- JSON 字段保持原样字符串（不解析-再序列化）
- payload 序列化 with `JSON.stringify`，避免循环引用

### 限制
- 推荐单 tick payload < 2MB（200 行典型 < 1MB）
- batch 内必须按 id 升序，保证 server 端按依赖序处理

### 验收
- 单元测试：包含 5 个 obs、1 个 summary 的 db，watermark 起点不同 → 返回行数正确，next_local_ids 正确

---

## T-09 `POST /api/sync/ingest` 路由 [N5/F4/C4 = **10**]

### 需求
server 端接收 client 推送，事务化 upsert，幂等去重，返回 next_watermark。

### 设计
`src/services/worker/http/routes/SyncRoutes.ts`：
```ts
export class SyncRoutes extends BaseRouteHandler {
  setupRoutes(app: Application): void {
    app.post('/api/sync/ingest',
      trustProxyMiddleware(this.settings),
      requireTlsMiddleware(this.settings),
      authMiddleware(this.authChain),
      enforceAllowList(this.settings),
      validateBody(syncIngestSchema),
      this.handleIngest.bind(this));
  }
  // see §8.1 of S- doc
}
```

仅在 `CLAUDE_MEM_NODE_ROLE === 'server'` 时注册（worker-service.ts 中条件判断）。

### 规范
- 单一事务执行 batch（部分失败回滚）
- UPSERT 用 SQLite `INSERT … ON CONFLICT DO NOTHING` + 后续 SELECT 拿到 id；observations 已有 (memory_session_id, content_hash) UNIQUE
- 返回 `applied / next_watermark`；client 用 next_watermark 推进
- `sync_inbox` 每条 ingest 行写一笔（用于审计 + 防重投）

### 限制
- batch 上限由 `CLAUDE_MEM_SERVER_INGEST_MAX_BATCH` 控制，超出 413
- 单次 ingest 总执行时间应 < 5s（否则会触发 client 的 30s 间隔回流）

### 验收
- 重复 ingest 同一 payload → 第二次 `skipped_dup` 计数 ≥ 0，DB 行数不变
- payload 中含一个 invalid 行（type 不合法）→ 整 batch 回滚，返回 400

---

## T-10 `SyncAuthStrategy` 抽象 + `NoopAuth` [N5/F5/C2 = **13**]

### 需求
鉴权可插拔：首版 NoopAuth 直接放行，未来扩展 ApiKeyAuth / JwtAuth / MtlsAuth。

### 设计
`src/services/sync/auth/types.ts`：
```ts
export interface SyncAuthStrategy {
  readonly mode: 'none' | 'apikey' | 'jwt' | 'mtls';
  /** null = ok；string = 拒绝原因 */
  authenticate(req: Request): Promise<string | null>;
}
```

`src/services/sync/auth/NoopAuth.ts`：直接 return null。

`src/services/sync/auth/index.ts`：`buildAuthChain(settings)` 工厂按 `CLAUDE_MEM_SERVER_AUTH_MODE` 实例化。

### 规范
- 接口接收 Express `Request`，可向 `req.syncContext` 注入 `{ authenticatedUserLabel, …}`
- NoopAuth 也注入 `authenticatedUserLabel = req.body.user_label`（避免后续中间件 if 判断）
- 首版只实现 Noop + ApiKey 占位（throw NotImplementedError），其他 mode 留空类

### 限制
- 不要把鉴权逻辑写进 SyncRoutes.handleIngest，必须走中间件

### 验收
- 单元测试：`buildAuthChain({ auth_mode: 'none' })` → NoopAuth；`apikey` 模式 → ApiKey 占位

---

## T-11 `trustProxyMiddleware`（IP CIDR） [N4/F4/C2 = **10**]

### 需求
server 端只接受来自可信反代 IP 的同步请求（防止内网横向扫描）。

### 设计
读取 `CLAUDE_MEM_SERVER_TRUSTED_PROXIES`（csv CIDR），中间件用 `ipaddr.js` 或 Node 自带 `net.BlockList` 校验 `req.socket.remoteAddress`。

### 规范
- 空配置 = 不过滤（向后兼容）
- 命中 → next()；不命中 → 403 + 日志 warn
- IPv4 / IPv6 都支持

### 限制
- 当 nginx 反代时，`remoteAddress` 通常是 nginx 的 IP（127.0.0.1），所以默认就把 `127.0.0.1/32` 加白名单
- 不解析 `X-Forwarded-For`（用 socket 实际 IP，避免欺骗）

### 验收
- TRUSTED_PROXIES=`127.0.0.1/32`：本机 curl 通过；外网 IP 拒绝 403

---

## T-12 `enforceAllowList` 中间件 [N5/F5/C1 = **14**]

### 需求
即便没启用鉴权，也要校验 request body 中的 `user_label` 在白名单内。

### 设计
读 `CLAUDE_MEM_SERVER_ALLOWED_USERS`（csv），中间件 check `req.body.user_label`。空白名单 = 全允许。

### 规范
- 命中 → next()；不命中 → 403 `{ error: 'user_label not in allowlist' }`
- 大小写敏感（避免 zhangsan/ZhangSan 都算）

### 限制
- 中间件位于 validateBody 之后（因为需要拿 req.body.user_label）
- 不在 auth 之前（auth 注入了 authenticatedUserLabel 后才能交叉校验）

### 验收
- AllowedUsers=`zhangsan,boss`：user_label=lisi 的请求 403

---

## T-13 触发点接入 `scheduleSoon()` [N4/F5/C1 = **12**]

### 需求
新 observation/summary/prompt 写入后，立即（防抖 2s）触发一次 sync push。

### 设计
- `ResponseProcessor.syncAndBroadcastObservation/Summary` 末尾：`worker.syncAgent?.scheduleSoon()`
- `SessionEventBroadcaster.broadcastNewPrompt` 末尾同上

### 规范
- WorkerRef 接口加 `syncAgent?: { scheduleSoon(): void }`
- syncAgent 没有时调用应该是 no-op，不报错

### 限制
- 防抖 2s 是配置项内置默认，不需要新增 settings 键

### 验收
- 手动写 1 条 obs，2s 后日志显示 `[SYNC] tick triggered by scheduleSoon`

---

## T-14 Worker 启动按 role 分支 [N5/F4/C3 = **11**]

### 需求
worker-service.ts 启动时按 `CLAUDE_MEM_NODE_ROLE` 决定：
- bind host
- 是否实例化 SyncAgent
- 是否注册 SyncRoutes

### 设计
`src/services/worker-service.ts` `WorkerService.start()`：
```ts
const host = settings.CLAUDE_MEM_NODE_ROLE === 'server'
  ? settings.CLAUDE_MEM_SERVER_BIND_HOST
  : '127.0.0.1';

if (settings.CLAUDE_MEM_NODE_ROLE === 'client' && settings.CLAUDE_MEM_SYNC_ENABLED === 'true') {
  this.syncAgent = new SyncAgent(...);
  await this.syncAgent.start();
}

if (settings.CLAUDE_MEM_NODE_ROLE === 'server') {
  this.server.registerRoutes(new SyncRoutes(this.dbManager, this.authChain, this.settings));
}
```

### 规范
- role 变更需要 worker 重启（不支持热切换）
- server 模式 bind 0.0.0.0 时启动时 log info 提醒

### 限制
- 关停时按 syncAgent → SSE → DB → HTTP 顺序优雅停机

### 验收
- ROLE=client：`netstat` 只看到 127.0.0.1:37700；POST /api/sync/ingest 返回 404
- ROLE=server：`netstat` 看到 0.0.0.0:37700；POST /api/sync/ingest 工作

---

## T-15 redact patterns 过滤 [N3/F4/C2 = **8**]

### 需求
client push 前剔除 `files_read` / `files_modified` 命中 `CLAUDE_MEM_SYNC_REDACT_PATTERNS` 的条目。

### 设计
在 `collectIncremental`（T-08）中过滤。用 `minimatch` 或 `picomatch` 做 glob 匹配。

### 规范
- 空配置 = 不过滤
- 全部文件被剔后该 observation 被整条丢弃（不上传半残的）
- 仅过滤文件名字段，不剔 narrative/facts 内容（首版不做内容打码）

### 限制
- 不影响本地 DB 行（仅过滤 push 出去的副本）

### 验收
- REDACT=`**/*.env`：含 .env 路径的 obs 不在 server 端出现

---

## T-16 frpc + nginx 部署样例文档 [N4/F5/C1 = **12**]

### 需求
在 `docs/` 增加 `deploy-frpc-nginx.md`，包含可贴可用的 frpc.ini / nginx.conf 模板（已在 S- doc §13bis 提供）。

### 规范
- 模板必须能跑通最小 demo（一台 server + 一台 client）
- 加 troubleshooting 小节：常见 401/403/502 排查

### 验收
- 按文档配置后能从员工电脑 push 到 server

---

## T-17 Phase 1 单元 + 集成测试套件 [N4/F5/C3 = **10**]

### 需求
覆盖关键路径，防止后续改动破坏同步。

### 设计
- `tests/sync/user-label.test.ts`：T-02 解析/回写
- `tests/sync/payload.test.ts`：T-08 增量采集 + redact
- `tests/sync/state.test.ts`：T-07 原子写、损坏恢复
- `tests/sync/auth-chain.test.ts`：T-10 工厂、NoopAuth 行为
- `tests/sync/routes.test.ts`：T-09 ingest 幂等、batch 上限、4xx 边界
- `tests/sync/agent.test.ts`：T-06 mock fetch 200/429/5xx 退避

### 规范
- 用 `bun test`，与现有测试同套件结构

### 验收
- `bun test tests/sync/` 全绿
- 覆盖率：sync 模块 > 80%

---

# Phase 2 — viewer 多员工

## T-18 `/api/admin/role` 端点 [N4/F5/C1 = **12**]

### 需求
viewer 启动时拉一次，知道自己挂在 client 还是 server，决定是否渲染员工选择器。

### 设计
`GET /api/admin/role` → `{ "role": "client" | "server", "userLabel": "..." }`

### 验收
- ROLE=server：返回 server；前端渲染员工下拉
- ROLE=client：返回 client；前端隐藏员工下拉

---

## T-19 `/api/users` 端点 [N4/F5/C2 = **11**]

### 需求
server 端 viewer 拉取所有 user_label 列表 + 每人聚合 stats。

### 设计
```sql
SELECT user_label, COUNT(*) AS sessions, MAX(started_at_epoch) AS last_active
FROM sdk_sessions
WHERE user_label IS NOT NULL
GROUP BY user_label
ORDER BY last_active DESC
```
返回 `{ users: [{ user_label, sessions, last_active }] }`

### 规范
- 仅 server 模式注册路由（client 返回 404 即可）

### 验收
- server 上数据库 3 个员工 → 端点返回 3 行，按最近活跃排序

---

## T-20 Stats/list 端点加 `userLabel` 过滤参数 [N4/F5/C2 = **11**]

### 需求
`/api/observations`、`/api/summaries`、`/api/prompts`、`/api/projects/stats` 都支持 `?userLabel=` 过滤。

### 设计
PaginationHelper 三个方法加 `userLabel?: string` 参数，SQL 加 `AND s.user_label = ?`。

DataRoutes.parsePaginationParams 解析 query。

### 规范
- 空 userLabel = 不过滤（看全部）
- 与现有 project/platformSource/dateStart/dateEnd 过滤可叠加

### 验收
- `?userLabel=zhangsan`：仅返回 ZhangSan 的行
- `?userLabel=zhangsan&dateStart=...`：两者交集

---

## T-21 viewer Header 员工下拉 [N4/F4/C2 = **10**]

### 需求
server 模式 viewer 顶部显示员工下拉，选员工后所有视图按 user_label 过滤。

### 设计
- `src/ui/viewer/components/UserSelector.tsx` 新建
- `App.tsx` 加 `userLabelFilter: string | null` state
- Header 仅在 `role === 'server'` 时渲染（启动时拉 `/api/admin/role`）
- 下拉数据来自 `/api/users`

### 规范
- Default "All users"
- 选员工后 `usePagination` 重置 + 重新加载（带 `userLabel`）
- 切换时 currentFilter (project) 保留还是清空？默认清空，避免空白页

### 验收
- server 模式 Header 出现员工下拉；client 模式不出现
- 选员工后 feed 仅显示该员工数据

---

## T-22 viewer SSE 客户端按 user_label 过滤 [N3/F5/C1 = **10**]

### 需求
server 通过 `/stream` 推全量事件；viewer 收到后按当前 `userLabelFilter` 过滤。

### 设计
useSSE.ts 在 `new_observation` / `new_summary` / `new_prompt` 三个 case 里加：
```ts
if (currentUserLabelFilter && data.observation?.user_label !== currentUserLabelFilter) break;
```

`currentUserLabelFilter` 通过 useSSE 的入参或外部 ref 传入。

### 规范
- 不改 SSE 协议
- payload 已经有 user_label 字段（T-04 之后，写入路径就带了）

### 验收
- server 端两个 user 各推一条 → viewer 选 user A 时只看到 A 的卡片实时弹出

---

## T-23 卡片 footer 改 user_label chip [N3/F5/C1 = **10**]

### 需求
ObservationCard / SummaryCard / PromptCard 在 ID + 时间后展示 `user_label`（替代或增补现有 user_name）。

### 设计
- Option A: 替换现有 user_name chip
- Option B: 都显示（user_name 为 OS username，user_label 为同步身份；多数情况一样，可合并）

推荐 A：默认 user_label，user_name 隐藏（或者 hover 显示）。

### 验收
- 卡片显示 `#37 • 5/16/2026, 4:08 PM zhangsan`

---

## T-24 i18n keys（同步 / 员工选择器） [N3/F5/C1 = **10**]

### 需求
新增中英文 keys：
- `header.userFilter` / Today: `员工` / `User`
- `header.userFilterAll` / `全部员工` / `All users`
- `sync.statusActive` / `同步中` / `Syncing`
- `sync.statusOk` / `已同步` / `Synced`
- `sync.statusFail` / `同步失败` / `Sync failed`
- `sync.lastSync` / `最近同步` / `Last sync`

### 验收
- i18n 文件含新 key；切换 zh/en 都正常

---

# Phase 3 — 运维 + UX

## T-25 Header 同步状态徽章 [N3/F4/C2 = **8**]

### 需求
client 模式 Header 显示「同步中 / 已同步 / 失败 + 待推送条数 + 上次推送时间」。

### 设计
新增端点 `GET /api/sync/status` 返回 sync-state.json 内容 + 当前 watermark vs 本地 max id 差值（待推送条数）。前端每 30s 轮询。

### 规范
- 失败次数 ≥ 3 时徽章变红
- hover 显示详情（最后错误、上游 URL）

### 验收
- 启用 sync 后 Header 显示绿色「已同步」
- 模拟 server 宕机 → 一分钟内变红「失败」

---

## T-26 `install-claude-mem` 加 sync 参数 [N3/F5/C2 = **9**]

### 需求
扩展安装脚本支持：
```bash
./install-claude-mem -i client --upstream https://mem.acme.com --label zhangsan
./install-claude-mem -i server
```

### 设计
- 解析新 flag → 写入 settings.json
- client 模式：必填 `--upstream`，`--label` 默认 `whoami`
- server 模式：自动设置 `BIND_HOST=0.0.0.0`，提示用户配 frpc

### 验收
- 一行命令安装完，启动 worker 即自动开始同步

---

## T-27 `claude-mem server sync-audit` CLI [N2/F4/C2 = **6**]

### 需求
管理员查询同步审计记录：哪个员工、何时、推了多少条。

### 设计
```bash
claude-mem server sync-audit --user zhangsan --since 2026-05-15
```
查 `sync_inbox` 表，按 user_label + applied_at_epoch 过滤，输出表格。

### 验收
- 命令输出近 24h 各员工 ingest 次数

---

## T-28 同步错误日志文件 [N3/F5/C1 = **10**]

### 需求
`SyncAgent` push 失败时追加到 `~/.claude-mem/logs/sync-errors.log`，方便排错。

### 设计
单独文件，行格式：`<ISO ts> <HTTP status> <URL> <error msg>`

### 规范
- 永久失败（4xx）记 ERROR；瞬时失败（5xx/网络）记 WARN
- 滚动：当文件 > 10MB 时 rename .log.1

### 验收
- 模拟 401 → 日志多一行 ERROR

---

# Phase 4 — 云端鉴权（按需启用）

## T-29 `ApiKeyAuth` 完整实现 [N2/F4/C3 = **5**]

### 需求
实现 `SyncAuthStrategy` 的 ApiKey 分支：从 `Authorization: Bearer cmem_xxx` 解析、查 `api_keys` 表、校验 user_label 一致性。

### 设计
- 复用 `src/server/auth/api-key-service.ts` 的 `api_keys` 表（已存在）
- API Key 表加 `bound_user_label` 列（migration v38）
- authenticate 时：
  1. 取 Bearer token
  2. SHA256 → 查 api_keys
  3. 校验未过期、未撤销
  4. `bound_user_label === req.body.user_label` 否则 403

### 限制
- 不缓存 key（每次查 DB，确保 revoke 即时生效）

### 验收
- 正确 key 通过；过期 key 401；user_label 不匹配 403

---

## T-30 `server sync-keys` CLI [N2/F4/C2 = **6**]

### 需求
管理员发 / 撤 / 列 API key。

### 设计
```bash
claude-mem server sync-keys create --user zhangsan --label "Zhang San Mac"
# 输出 cmem_xxx... 一次性显示，强提示员工保存

claude-mem server sync-keys list
# 表格：id / user_label / 上次使用时间 / 创建时间

claude-mem server sync-keys revoke <id>
# 设 revoked_at_epoch
```

### 规范
- key 用 `crypto.randomBytes(32).toString('base64url')`，前缀 `cmem_`
- 表里只存 SHA256 hash，明文不持久化

### 验收
- create 后能用，revoke 后立刻 401

---

## T-31 HTTPS / Let's Encrypt 部署文档 [N2/F5/C1 = **8**]

### 需求
更新 `docs/deploy-frpc-nginx.md` 加 HTTPS 章节：certbot 自动化、HTTP→HTTPS 跳转、HSTS。

### 验收
- 按文档配置后能通过 HTTPS 访问，浏览器 lock 图标显示有效证书

---

## T-32 `install --api-key` 参数 [N2/F5/C1 = **8**]

### 需求
扩展安装脚本支持 `--api-key`，写入 settings + 自动设 `auth_mode=apikey`。

### 验收
- 安装命令带 `--api-key cmem_xxx` → settings.json 含 key + auth_mode

---

## T-33 零停机切 ApiKey runbook [N2/F5/C1 = **8**]

### 需求
文档化「双端从 `auth_mode=none` 切到 `apikey`」零停机流程（见 S- doc §13bis）。

### 验收
- 按 runbook 切完，未迁移员工被立即 401，已迁移员工正常工作


## 附 A: 验收 checklist（与 S- doc §14 对应）

Phase 1 完成判定：
- [ ] 员工电脑 `ROLE=client` + `auth_mode=none`，5min 操作后 server 端 30s 内看到数据
- [ ] 员工断网 10min 后恢复，所有断网期间数据自动追加，无重复无遗漏
- [ ] server 本机 hook 数据正常进入本地 viewer，不被错误标记为某员工
- [ ] server viewer 选 `userLabel=zhangsan` 只看到 ZhangSan 数据
- [ ] 攻击者直接 POST 内网 server :37700（来自非 127.0.0.1） → 403 `TRUSTED_PROXIES`
- [ ] `REDACT_PATTERNS=**/*.env` 后 .env 路径 obs 不出现在 server
- [ ] `ALLOWED_USERS=zhangsan,boss`，`user_label=hacker` push → 403（即使无鉴权）

Phase 4 完成判定：
- [ ] 双端切到 `apikey` 后无 key push 全部 401，有 key 正常
- [ ] 撤销 API Key 后后续 push 立即 401，本地继续正常工作
- [ ] 员工 A 用自己 key 改 body `user_label=B` 冒充 → 403

---

## 附 B: 模块/文件清单（与 S- doc §13 对应）

新建：
- `src/services/sync/SyncAgent.ts`
- `src/services/sync/sync-state.ts`
- `src/services/sync/payload.ts`
- `src/services/sync/auth/types.ts`
- `src/services/sync/auth/NoopAuth.ts`
- `src/services/sync/auth/index.ts`
- `src/services/sync/auth/ApiKeyAuth.ts` (T-29)
- `src/services/worker/http/routes/SyncRoutes.ts`
- `src/services/worker/http/middleware/trustProxy.ts`
- `src/services/worker/http/middleware/enforceAllowList.ts`
- `src/shared/user-label.ts`
- `src/ui/viewer/components/UserSelector.tsx`
- `docs/deploy-frpc-nginx.md`
- `tests/sync/*.test.ts`

修改：
- `src/shared/SettingsDefaultsManager.ts`
- `src/services/sqlite/migrations/runner.ts`
- `src/services/sqlite/sessions/create.ts`
- `src/services/worker-service.ts`
- `src/services/worker/PaginationHelper.ts`
- `src/services/worker/http/routes/DataRoutes.ts`
- `src/services/worker/agents/ResponseProcessor.ts`
- `src/services/worker/events/SessionEventBroadcaster.ts`
- `src/services/worker-types.ts`
- `src/ui/viewer/App.tsx`
- `src/ui/viewer/components/Header.tsx`
- `src/ui/viewer/components/ObservationCard.tsx`
- `src/ui/viewer/components/SummaryCard.tsx`
- `src/ui/viewer/components/PromptCard.tsx`
- `src/ui/viewer/hooks/useSSE.ts`
- `src/ui/viewer/hooks/usePagination.ts`
- `src/ui/viewer/utils/i18n.ts`
- `install-claude-mem`

---

**文档版本**：v1.0 · 2026-05-16
**关联文档**：`S-服务器模式设计文档.md` v1.2
**状态**：Phase 1 待开工

