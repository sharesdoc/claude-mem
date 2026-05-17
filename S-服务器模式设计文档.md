# claude-mem 客户端/服务端双模式 + 自动同步 设计文档

> 状态：方案，待评审
> 适用版本：v13.2.0+（基于当前 main，可在此 commit 基础上分支开发）

## 0. 首版约束（务必先读）

| 项 | 首版 | 未来（云端部署后） |
|---|---|---|
| **服务端位置** | 办公室局域网 Linux 机器（内网 IP，如 `10.0.0.50:37700`） | 云上 VPS / K8s |
| **公网暴露** | frpc 隧道 → 公司公网 IP → nginx 反代 → server | 直接 nginx + TLS 证书 |
| **传输** | HTTP（frpc 隧道内即可视为受控网络） | HTTPS（Let's Encrypt / 内部 CA） |
| **鉴权** | **无鉴权**（信任 frpc 隧道边界 + nginx IP allowlist 兜底） | API Key Bearer，可叠加 mTLS |
| **身份标识** | `user_label = OS 登录用户名`（员工 / 老板同一规则），客户端在 payload 里声明，server 端**信任不校验** | `Authorization: Bearer <key>`，key 绑定 user_label |
| **完整性** | 仅依赖 ingest 协议自身的幂等去重 | 同上 + 鉴权层 |

**核心要求：所有"鉴权"逻辑设计成可插拔中间件，首版加载 noop，未来一行配置切换到 ApiKey/JWT/mTLS，业务代码零改动。**

---

## 1. 目标与边界

### 1.1 业务目标
- 每个员工在本地电脑部署 claude-mem，**正常使用本地功能**（hook 抓取 → AI 压缩 → 本地 SQLite → 本地 viewer）；
- 员工电脑通过**异步增量同步**把数据推送到老板服务器，断网不丢、不影响本地体验；
- 老板服务器上同样跑 claude-mem，**自己也正常 hook claude/codex**，同时通过 web viewer 查看**所有员工 + 自己**的数据；
- **同一套代码，由配置切换角色**：`CLAUDE_MEM_NODE_ROLE=client | server`。

### 1.2 非目标（首版不做）
- 双向同步（老板看员工 + 员工看老板/同事）
- 服务端→客户端的 push 通道
- 浏览器多用户登录 / RBAC（首版用 nginx Basic Auth 或 VPN 把 server viewer 私有化即可）
- 数据加密存储（首版传输 HTTPS + 静态文件权限 0600 即可）
- 离线工作的客户端**搜索**远程数据（首版客户端只看自己本地）

### 1.3 设计原则
1. **角色叠加而非互斥**：server 模式 ≡ client 模式 + 接收同步 + 0.0.0.0 bind + 多员工 viewer。本地工作能力两侧完全一致。
2. **客户端 source-of-truth**：本地 SQLite 永远是某员工的权威数据，server 是「副本聚合」。
3. **Append-only 同步**：客户端只推不拉，仅向前增量。删除走专门的 `delete intent` 协议（首版不做）。
4. **离线优先**：断网期间所有 hook 正常落盘，恢复网络后 SyncAgent 自动 catch up。
5. **最小 schema 改动**：现有表加 2 列即可，所有跨表关联仍走现成的 UUID 字符串字段。
6. **复用现有基建**：worker / SSE / Express / SQLite migration / better-auth 全部保留，避免另起炉灶。

---

## 2. 现状盘点

### 2.1 现行单机数据流
```
IDE (claude/codex/cursor/…)
   │ hook (stdin JSON)
   ▼
plugin/scripts/worker-service.cjs hook <platform> <event>
   │ HTTP
   ▼  127.0.0.1:<uid-port>
Worker (Express)
   ├─ /api/sessions/init        → SQLite sdk_sessions
   ├─ /api/sessions/observations → SQLite pending_messages → SDK Provider 压缩 → observations
   ├─ /api/sessions/summarize   → SQLite pending_messages → Summary
   └─ /api/context/inject       → 读 SQLite + Chroma 生成上下文
   ▼
~/.claude-mem/
   ├─ claude-mem.db   (SQLite, 全量真相)
   ├─ chroma/         (向量库, 可选)
   └─ settings.json   (CLAUDE_MEM_* 配置)

Viewer (React SPA)
   ├─ GET  /api/observations|summaries|prompts (分页 + dateStart/dateEnd)
   ├─ GET  /api/projects/stats
   ├─ POST /api/projects/delete
   └─ GET  /stream  (SSE)
```

### 2.2 既有「云端化半成品」：`server-beta` runtime
- `src/server/` 已有完整 REST V1：`/v1/sessions/start|end`、`/v1/events`、`/v1/memories`、`/v1/search`、`/v1/context`、`/v1/jobs/:id`
- Postgres 持久化、Redis (BullMQ) 队列、better-auth API Key
- hooks 通过 `CLAUDE_MEM_RUNTIME=server-beta` 跳过本地 worker，直连远端
- **缺**：viewer 用的 `/api/*` 与 `/stream`；混合模式（本地 worker + 异步上传）

### 2.3 与本方案的关系
本方案**不复用 server-beta 协议**（直连模式不符合"离线优先"），但**复用其基建**：
- better-auth 的 API Key 表（`api_keys`）→ 用作同步 token
- Express 中间件 / 鉴权链
- Postgres 适配层（可选未来切换；首版用 SQLite）

server-beta 的 `/v1/*` 端点保留共存，给已经在用的客户继续用。新方案的 `/api/sync/*` 端点是独立的。

---

## 3. 总体架构

### 3.1 角色定义

| 维度 | client（默认） | server |
|---|---|---|
| 本地 hook → worker → SQLite | ✓ | ✓ |
| 本地 viewer | ✓ | ✓ |
| SyncAgent 推送数据 | ✓（指向上游） | ✓ 可选（指向更高层级） |
| `/api/sync/ingest` 接收端点 | ✗ | ✓ |
| viewer 多员工视图 | ✗（只看自己） | ✓ |
| HTTP bind | `127.0.0.1` | `0.0.0.0` |
| 鉴权 | 无（loopback） | Bearer API Key 强制 |

> **核心**：server **不是** client 的替代品，而是 client + 额外能力。同一份 `worker-service.cjs` 启动后读 `CLAUDE_MEM_NODE_ROLE` 决定是否加载 sync 接收路由、是否绑 0.0.0.0、是否打开多员工 viewer。

### 3.2 部署拓扑（首版 — frpc 隧道）

```
┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│ 员工 A 笔记本│  │ 员工 B 笔记本│  │ 员工 C 笔记本│
│ ROLE=client  │  │ ROLE=client  │  │ ROLE=client  │
│ 本地 :377xx  │  │ 本地 :377xx  │  │ 本地 :377xx  │
│   SQLite     │  │   SQLite     │  │   SQLite     │
└──────┬───────┘  └──────┬───────┘  └──────┬───────┘
       │                  │                  │
       │ HTTP POST /api/sync/ingest          │
       │ Body: { user_label, batch, … }      │  ← 无鉴权头
       └─────────────────┬────────────────────┘
                         │
                         ▼ 公网入口
           ┌───────────────────────────┐
           │  公网域名: mem.acme.com    │
           │  (公司公网 IP + DNS)        │
           │                           │
           │  Nginx                    │
           │   - reverse_proxy → frps  │
           │   - 可选 IP allowlist     │
           │   - 可选 Basic Auth (临时)│
           └────────────┬──────────────┘
                        │ frp 持久 TCP 隧道
                        ▼
              ┌─────────────────────┐
              │ 办公室公网/家用网关  │
              │   frpc client       │
              │   连接 frps 维持隧道│
              └────────────┬────────┘
                           │ LAN
                           ▼
           ┌─────────────────────────────┐
           │  办公室 Linux 服务器         │
           │  10.0.0.50:37700            │
           │                             │
           │  claude-mem                 │
           │  ROLE=server                │
           │  bind 0.0.0.0:37700         │
           │  + 本机 hook (老板自己用)   │
           │                             │
           │  SQLite  (本机 + 所有员工)  │
           │  viewer  (员工选择器)        │
           └─────────────────────────────┘
```

**通信路径**：员工 client → `mem.acme.com:443/api/sync/ingest`（HTTP/纯文本可，nginx 终结） → frps 公网入口 → frpc 隧道 → 办公室 server `:37700`。

**安全边界**：frpc 隧道两端是信任的（员工电脑通过 VPN 或公司网络访问 `mem.acme.com`；frpc 客户端运行在办公室受控机器）。攻击面是 nginx → frps 这一段，建议：
- nginx 加 **IP allowlist**（员工公网出口固定时）或 **Basic Auth**（粗粒度）
- frps 自身的 token 认证（frpc 连不上 frps 即可隔断）

### 3.3 演进拓扑（未来 — 云端 HTTPS API）

```
client → https://mem.acme.com/api/sync/ingest
              ├─ Authorization: Bearer cmem_xxx
              └─ (可选) Client Cert (mTLS)
   ▼
Nginx (Let's Encrypt) → claude-mem (云上 VPS)
                          ROLE=server
                          + ApiKeyAuthMiddleware (启用)
```

**仅 3 处变更**即可切换：
1. `CLAUDE_MEM_SERVER_AUTH_MODE=apikey`（默认 `none`）
2. client `CLAUDE_MEM_SYNC_API_KEY=cmem_xxx`
3. nginx 上 TLS 证书

业务代码不动，鉴权策略由中间件链热插拔（见 §9）。

---

## 4. 配置项设计

新增 `CLAUDE_MEM_*` settings（写入 `~/.claude-mem/settings.json`，env 可覆盖）：

### 4.1 通用（client / server 都有）

| Key | 类型 | 默认 | 说明 |
|---|---|---|---|
| `CLAUDE_MEM_NODE_ROLE` | `client \| server` | `client` | 角色 |
| `CLAUDE_MEM_USER_LABEL` | string | `os.userInfo().username` | **身份标识**（client 与 server 同一规则，默认即 OS 登录用户名）。换电脑/重装系统，只要 OS 用户名一致，server 端继续视为同一员工。若公司有 OS 用户名重复，由该员工自行在 settings 改一个唯一名（例如 `johnson-zhang`） |

### 4.2 client 模式

| Key | 类型 | 默认 | 说明 |
|---|---|---|---|
| `CLAUDE_MEM_SYNC_ENABLED` | bool | `true` | 是否启用 SyncAgent |
| `CLAUDE_MEM_SYNC_UPSTREAM_URL` | URL | — | server 公网 URL；首版 `http://mem.acme.com`，云端切 `https://...` |
| `CLAUDE_MEM_SYNC_AUTH_MODE` | `none\|apikey\|jwt\|mtls` | `none` | 鉴权策略；与 server 端 `CLAUDE_MEM_SERVER_AUTH_MODE` 必须一致 |
| `CLAUDE_MEM_SYNC_API_KEY` | string | `""` | 仅 `auth_mode=apikey` 时使用 |
| `CLAUDE_MEM_SYNC_INTERVAL_MS` | int | `30000` | 推送间隔；批写后立即触发一次 |
| `CLAUDE_MEM_SYNC_BATCH_SIZE` | int | `200` | 单次最多多少行 |
| `CLAUDE_MEM_SYNC_RETRY_MAX` | int | `8` | 失败重试上限（指数退避） |
| `CLAUDE_MEM_SYNC_REDACT_PATTERNS` | string (csv glob) | `""` | 同步前过滤敏感 file path（如 `**/*.env`） |

### 4.3 server 模式

| Key | 类型 | 默认 | 说明 |
|---|---|---|---|
| `CLAUDE_MEM_SERVER_BIND_HOST` | string | `""`（继承 `WORKER_HOST`，即 `127.0.0.1`） | bind 地址。空值时沿用 WORKER_HOST；填 `0.0.0.0` 让 frpc 能转发。非 loopback 启动时日志会显式提醒配防火墙 |
| `CLAUDE_MEM_SERVER_AUTH_MODE` | `none\|apikey\|jwt\|mtls` | `none` | 同步端点的鉴权策略；首版 `none` |
| `CLAUDE_MEM_SERVER_TRUSTED_PROXIES` | csv CIDR | `127.0.0.1/32,::1/128` | 信任的反代源 IP；默认只允许 loopback（frpc/nginx 都终结在本机）。非空时 server 只接受来自这些 IP 的同步请求，用 socket 层 IP 而非 X-Forwarded-For 避免欺骗 |
| `CLAUDE_MEM_SERVER_ALLOWED_USERS` | csv string | `""`（空=全部允许） | user_label 白名单 |
| `CLAUDE_MEM_SERVER_INGEST_MAX_BATCH` | int | `1000` | 单 batch 上限（防止超大 payload） |
| `CLAUDE_MEM_SERVER_REQUIRE_TLS` | bool | `false` | 若为 true，拒绝非 https 请求（需配合 nginx 设 `X-Forwarded-Proto`） |

> 首版部署 `auth_mode=none` 即可工作；切云端时**只需双端改 `auth_mode=apikey` + 双端配 key**，业务代码零改动。

### 4.4 配置文件示例

**员工端 `~/.claude-mem/settings.json`**（首版，无鉴权）:
```json
{
  "CLAUDE_MEM_NODE_ROLE": "client",
  "CLAUDE_MEM_USER_LABEL": "zhangsan",
  "CLAUDE_MEM_SYNC_ENABLED": "true",
  "CLAUDE_MEM_SYNC_UPSTREAM_URL": "http://mem.acme.com",
  "CLAUDE_MEM_SYNC_AUTH_MODE": "none",
  "CLAUDE_MEM_SYNC_INTERVAL_MS": "30000"
}
```
> `user_label` 留空时 worker 启动会自动用 `os.userInfo().username` 写回 settings；之后不再改变（避免 OS 切换账户后混乱）。

**员工端**（云端阶段，启用鉴权）:
```json
{
  "...": "...",
  "CLAUDE_MEM_SYNC_UPSTREAM_URL": "https://mem.acme.com",
  "CLAUDE_MEM_SYNC_AUTH_MODE": "apikey",
  "CLAUDE_MEM_SYNC_API_KEY": "cmem_AbCd1234..."
}
```
文件权限：`chmod 600`（即便首版无 token，也避免 user_label 等被改）。

**服务端 `~/.claude-mem/settings.json`**（首版）:
```json
{
  "CLAUDE_MEM_NODE_ROLE": "server",
  "CLAUDE_MEM_USER_LABEL": "boss",
  "CLAUDE_MEM_SERVER_BIND_HOST": "0.0.0.0",
  "CLAUDE_MEM_SERVER_AUTH_MODE": "none",
  "CLAUDE_MEM_SERVER_TRUSTED_PROXIES": "127.0.0.1/32",
  "CLAUDE_MEM_SERVER_ALLOWED_USERS": "zhangsan,lisi,wangwu,boss"
}
```
> 注意：server 自己的 user_label 也是 OS 登录用户名（这里写 `boss` 是举例，实际用 `whoami` 的输出）。server 的本机 hook 数据走完全相同的写入路径，自动带上自己的 user_label，跟员工数据天然区分。
`TRUSTED_PROXIES=127.0.0.1/32` 表示只接受来自本机 frpc/nginx 的同步请求——攻击者即便扫到内网 server IP 也无法直接 POST 数据进来。

---

## 5. 数据模型（schema migration v36）

### 5.1 改动概述
- `sdk_sessions` 加 **一列 `user_label TEXT`**（已有 `user_name` 是 OS username 的快照，但是 client 写入时的真名；`user_label` 是同步身份维度，可由员工显式配置覆盖）
- 不动 `observations` / `session_summaries` / `user_prompts`：它们通过 `memory_session_id` JOIN sdk_sessions 拿 user_label
- 新建 `sync_inbox`（仅 server 用，client 无）：用作幂等去重 + 审计

### 5.2 SQL DDL

```sql
-- migration v36 (sessions/create.ts + runner.ts)
ALTER TABLE sdk_sessions ADD COLUMN user_label TEXT;
CREATE INDEX idx_sdk_sessions_user ON sdk_sessions(user_label);

-- migration v37 (server only — guarded by `if (role === 'server')`)
CREATE TABLE IF NOT EXISTS sync_inbox (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  user_label        TEXT    NOT NULL,
  source_table      TEXT    NOT NULL CHECK(source_table IN ('sdk_sessions','observations','session_summaries','user_prompts')),
  source_uid        TEXT    NOT NULL,   -- e.g. observations.content_hash, sdk_sessions.content_session_id
  applied_at_epoch  INTEGER NOT NULL,
  applied_row_id    INTEGER,            -- the local row id after upsert
  UNIQUE(user_label, source_table, source_uid)
);
```

> **user_label 冲突边界**：两个员工 OS username 相同（都叫 `johnson`）→ server 会把他们的数据合并到同一员工名下。解决方法：发现冲突的员工在自己 settings 里把 `CLAUDE_MEM_USER_LABEL` 改成 `johnson-zhang` 之类的唯一名。后续 push 自动带新 label。历史已合并的数据不动（首版不做迁移工具）。

### 5.3 跨节点稳定 ID

| 表 | 跨节点稳定 key | 备注 |
|---|---|---|
| `sdk_sessions` | `content_session_id` (UUID) | 已存在；server 端用作 UPSERT key |
| `observations` | `(memory_session_id, content_hash)` | 已有 UNIQUE 约束，天然幂等 |
| `session_summaries` | `(memory_session_id, prompt_number)` 或 `id` 重映射 | 后者依赖 sync_inbox |
| `user_prompts` | `(content_session_id, prompt_number)` | 已有 UNIQUE 约束 |

所有 FK 都用字符串 UUID（`memory_session_id` / `content_session_id`），跨设备零冲突。

### 5.4 user_label 填充

`createSDKSession()`（`sessions/create.ts`）写入新 session 时同时写 user_label：
```ts
INSERT INTO sdk_sessions (..., user_name, user_label)
VALUES (..., ?, ?)
```
- `user_name`：当前 `os.userInfo().username`（已有）
- `user_label`：worker 启动时从 settings 读取，缺则填 OS username 并 **回写 settings.json 固化**（避免下次 OS 切账户后突然变身）

---

## 6. 同步协议

### 6.1 客户端推送

**端点**：`POST {UPSTREAM_URL}/api/sync/ingest`
**头**：
```
Content-Type: application/json
X-Sync-User:    <user_label>          ← 身份（OS 登录用户名或显式覆盖）
X-Sync-Version: 13.2.0
Authorization:  Bearer <key>          ← 仅 auth_mode != none 时
```
> 首版（`auth_mode=none`）**不带** `Authorization`；server 完全跳过鉴权中间件，依赖 frpc 隧道边界保证可信。  
> 切到云端时同时改双端 `auth_mode=apikey` 并下发 key，无需协议改版。
**Body**（参考 schema，按类型分组以便 server 端分支处理）：
```json
{
  "user_label": "zhangsan",
  "client_version": "13.2.0",
  "protocol_version": 1,
  "high_watermark": {
    "observations":     12345,
    "summaries":        678,
    "prompts":          90,
    "sessions":         5
  },
  "batch": {
    "sdk_sessions": [
      { "content_session_id": "...", "memory_session_id": "...", "project": "...",
        "platform_source": "claude", "user_prompt": "...", "user_name": "johnson",
        "user_label": "zhangsan",
        "started_at_epoch": 1778..., "status": "active", "custom_title": null }
    ],
    "user_prompts": [
      { "content_session_id": "...", "prompt_number": 14,
        "prompt_text": "...", "created_at_epoch": 1778... }
    ],
    "observations": [
      { "memory_session_id": "...", "project": "...", "merged_into_project": null,
        "type": "discovery", "title": "...", "subtitle": "...",
        "narrative": "...", "facts": "[]", "concepts": "[]",
        "files_read": "[]", "files_modified": "[]",
        "prompt_number": 14, "discovery_tokens": 0,
        "content_hash": "abc12345", "agent_type": null, "agent_id": null,
        "created_at_epoch": 1778... }
    ],
    "session_summaries": [
      { "memory_session_id": "...", "project": "...", "request": "...",
        "investigated": "...", "learned": "...", "completed": "...",
        "next_steps": "...", "prompt_number": 14, "discovery_tokens": 0,
        "created_at_epoch": 1778... }
    ]
  }
}
```

**响应**：
```json
{
  "applied": {
    "sdk_sessions":      { "inserted": 1, "skipped_dup": 0 },
    "user_prompts":      { "inserted": 4, "skipped_dup": 0 },
    "observations":      { "inserted": 20, "skipped_dup": 3 },
    "session_summaries": { "inserted": 5, "skipped_dup": 0 }
  },
  "next_watermark": {
    "observations": 12368,
    "summaries":    683,
    "prompts":      94,
    "sessions":     6
  }
}
```

### 6.2 客户端 watermark 状态

存于 `~/.claude-mem/sync-state.json`：
```json
{
  "upstream_url": "https://mem.acme.com",
  "last_sync_at": 1778...,
  "last_success_at": 1778...,
  "watermark": {
    "observations": 12345,
    "summaries":    678,
    "prompts":      90,
    "sessions":     5
  },
  "failures": {
    "consecutive": 0,
    "last_error": null
  }
}
```

### 6.3 失败处理

- HTTP 4xx（除 429）：永久失败，不重试，写日志 `~/.claude-mem/logs/sync-errors.log`，等待人工
- HTTP 5xx / 429 / 网络错误：指数退避（1s, 2s, 4s, …, 最多 5min），最多 `CLAUDE_MEM_SYNC_RETRY_MAX` 次后放弃本批，下一个 tick 重试
- 部分成功：server 返回 `applied` 详细计数；client 用 `next_watermark` 推进游标，跳过 server 已接收的

### 6.4 触发策略

| 触发点 | 行为 |
|---|---|
| Worker 启动 + sync 启用 | 立即 tick 一次（catch up） |
| 定时器 `intervalMs` | 周期 tick |
| `processAgentResponse` 写完 observation/summary | `sync.scheduleSoon()`（防抖 2s） |
| `SessionEventBroadcaster.broadcastNewPrompt` 写完 prompt | 同上 |
| 收到 `SIGTERM` 关停前 | 最后 flush 一次（best effort，超时 5s） |

防抖：连续写入合并为一次推送，避免 1 秒 10 次 fetch。

---

## 7. 客户端实现

### 7.1 SyncAgent 组件

`src/services/sync/SyncAgent.ts`（新建）

```ts
export class SyncAgent {
  constructor(
    private dbManager: DatabaseManager,
    private config: {
      upstreamUrl: string;
      userLabel: string;          // 同步身份，OS 用户名兜底
      authMode: 'none' | 'apikey' | 'jwt' | 'mtls';
      apiKey?: string;             // 仅 authMode='apikey' 时使用
      intervalMs: number;
      batchSize: number;
      retryMax: number;
    }
  ) {}

  async start(): Promise<void> {
    await this.tick();           // 立即追一次
    this.timer = setInterval(() => void this.tick(), this.config.intervalMs);
    this.timer.unref();
  }

  /** 触发式快速 push（防抖 2s） */
  scheduleSoon(): void { ... }

  async tick(): Promise<void> {
    const state = readState();
    const batch = collectIncremental(this.dbManager, state.watermark, this.config.batchSize);
    if (isEmpty(batch)) return;

    try {
      const resp = await this.post('/api/sync/ingest', batch);
      writeState({ ...state, watermark: resp.next_watermark, failures: { consecutive: 0 } });
    } catch (err) {
      state.failures.consecutive += 1;
      writeState(state);
      if (isPermanentError(err)) appendSyncLog(err);
    }
  }

  async stop(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    await this.tick();           // 最后冲一次
  }
}
```

### 7.2 worker-service 入口接入

```ts
// services/worker-service.ts initializeBackground()
if (settings.CLAUDE_MEM_NODE_ROLE === 'client' &&
    settings.CLAUDE_MEM_SYNC_ENABLED === 'true' &&
    settings.CLAUDE_MEM_SYNC_UPSTREAM_URL &&
    settings.CLAUDE_MEM_SYNC_API_KEY) {
  this.syncAgent = new SyncAgent(this.dbManager, {...});
  await this.syncAgent.start();
  // 在 ResponseProcessor / SessionEventBroadcaster 中接入 scheduleSoon()
}
```

### 7.3 增量采集 SQL

```sql
-- collectIncremental(watermark)
SELECT * FROM sdk_sessions      WHERE id > :sessions_wm      ORDER BY id ASC LIMIT :batch_size;
SELECT * FROM observations      WHERE id > :observations_wm  ORDER BY id ASC LIMIT :batch_size;
SELECT * FROM session_summaries WHERE id > :summaries_wm     ORDER BY id ASC LIMIT :batch_size;
SELECT * FROM user_prompts      WHERE id > :prompts_wm       ORDER BY id ASC LIMIT :batch_size;
```

> 注：必须**先推 sdk_sessions，再推依赖它的子表**（server 端有 FK 约束）。SyncAgent 在客户端按依赖序串行 push 即可，或在单个 ingest payload 内 server 端按序处理。

---

## 8. 服务端实现

### 8.1 路由 `POST /api/sync/ingest`

`src/services/worker/http/routes/SyncRoutes.ts`（新建，仅 server 模式注册）

```ts
export class SyncRoutes extends BaseRouteHandler {
  setupRoutes(app: Application): void {
    // 中间件链按"边界 → 内容"顺序，每一层都可由设置项启用/禁用：
    //   trustProxy: 限制源 IP (CLAUDE_MEM_SERVER_TRUSTED_PROXIES)
    //   requireTls: 拒绝非 HTTPS    (CLAUDE_MEM_SERVER_REQUIRE_TLS)
    //   auth:       策略可插拔      (CLAUDE_MEM_SERVER_AUTH_MODE)
    //   allowList:  user_label 白名单
    //   validate:   zod schema
    app.post('/api/sync/ingest',
      trustProxyMiddleware(this.settings),
      requireTlsMiddleware(this.settings),
      authMiddleware(this.authChain),       // ← noop / apikey / jwt / mtls
      enforceAllowList(this.settings),
      validateBody(syncIngestSchema),
      this.handleIngest.bind(this));
  }

  private handleIngest = this.wrapHandler(async (req, res) => {
    const { user_label, batch } = req.body;
    const counts = await this.applyBatch(user_label, batch);
    const nextWatermark = await this.computeWatermark(user_label);
    res.json({ applied: counts, next_watermark: nextWatermark });
  });

  private async applyBatch(user_label, batch) {
    return this.db.transaction(() => {
      const counts = blank();
      // 1. sdk_sessions 先（依赖序：子表 FK 到 sdk_sessions）
      for (const s of batch.sdk_sessions ?? []) {
        const r = upsertSession(this.db, { ...s, user_label });
        record(this.db, user_label, 'sdk_sessions', s.content_session_id, r.id);
        counts.sdk_sessions[r.inserted ? 'inserted' : 'skipped_dup']++;
      }
      // 2. user_prompts
      for (const p of batch.user_prompts ?? []) {
        const r = upsertPrompt(this.db, p);
        record(this.db, user_label, 'user_prompts',
               `${p.content_session_id}#${p.prompt_number}`, r.id);
        counts.user_prompts[r.inserted ? 'inserted' : 'skipped_dup']++;
      }
      // 3. observations + session_summaries 同模式
      // ...
      return counts;
    })();
  }
}
```

> **同一员工多电脑**：员工 A 在公司电脑和家里电脑都装了 claude-mem，两边 `user_label=zhangsan`。两台机器的 sdk_sessions 用各自的 `content_session_id` UUID（永不重复），observations 也按 `(memory_session_id, content_hash)` 天然唯一。server 端拿到两路推送会统一写到 `user_label=zhangsan` 名下——这正是设计目的，**老板视角看到的是一个员工，而不是「员工×设备」笛卡尔积**。

### 8.2 鉴权（可插拔策略链）

**核心抽象**：所有鉴权策略实现同一接口，运行时由 `CLAUDE_MEM_SERVER_AUTH_MODE` 装配：

```ts
// src/services/sync/auth/types.ts
export interface SyncAuthStrategy {
  readonly mode: 'none' | 'apikey' | 'jwt' | 'mtls';
  /**
   * 返回 null = 通过；返回 string = 拒绝原因（401/403 错误文案）。
   * 副作用：可向 req 注入 req.syncContext { authenticatedUserLabel, deviceTrust, ... }
   */
  authenticate(req: Request): Promise<string | null>;
}
```

**首版加载**：
```ts
// src/services/sync/auth/index.ts
export function buildAuthChain(settings: Settings): SyncAuthStrategy {
  switch (settings.CLAUDE_MEM_SERVER_AUTH_MODE) {
    case 'none':   return new NoopAuth();             // ← 首版默认
    case 'apikey': return new ApiKeyAuth(settings);   // 复用 server-beta 的 api_keys 表
    case 'jwt':    return new JwtAuth(settings);      // 占位，未来扩展
    case 'mtls':   return new MtlsAuth(settings);     // 占位，未来扩展
    default:       throw new Error(`Unknown auth mode: ${...}`);
  }
}
```

**NoopAuth 实现**：直接 return null（通过），但仍执行 `enforceAllowList(user_label)` 防止任意员工名乱写。

**ApiKeyAuth 实现**（云端阶段）：
- 复用 `src/server/auth/api-key-service.ts` 的 `api_keys` 表
- 校验 `Authorization: Bearer cmem_xxx`
- API Key 绑定 `user_label`，request body 的 `user_label` 必须与 key 一致（防止员工 A 用自己 key 冒充 B）
- 提供 CLI：
  ```bash
  claude-mem server sync-keys create --user ZhangSan --label "Zhang San Mac"
  claude-mem server sync-keys list
  claude-mem server sync-keys revoke <key-id>
  ```

**为什么首版也要保留 allowList**：即使 `auth_mode=none`，server 仍会拒绝非白名单 user_label，避免 frpc 隧道意外泄漏时被人乱投数据。allowList 是「廉价但有效」的内建第二道防线。

### 8.3 server 端 viewer 多员工视图

#### 8.3.1 后端
- `/api/projects/stats?userLabel=ZhangSan&dateStart=...` 已支持 dateStart，新加 `userLabel` 参数（在 SQL 加 `AND s.user_label = ?`）
- `/api/observations?userLabel=...&dateStart=...` 同上
- 新增 `/api/users` 返回所有 user_label + 各自计数

#### 8.3.2 前端 viewer
- Header 加 "员工" 下拉（仅 server 模式渲染，client 模式隐藏）
- 选择员工后所有请求自动带 `userLabel=`
- 项目侧栏的 stats 也按 user_label 过滤
- "All users" 选项 = 不带过滤，看全部

#### 8.3.3 模式开关来源
viewer 启动时 fetch `/api/admin/role`，server 返回 `{ "role": "server" }`，前端据此渲染员工选择器。

---

## 9. 隐私与安全（分层防御 · 首版 vs 云端）

### 9.0 威胁模型
- **首版**：信任 frpc 隧道边界。攻击者要打 server 必须先穿透 nginx 公网入口（可选 IP allowlist / Basic Auth）+ frps token + frpc 隧道。我们不假设员工电脑被植入。
- **云端**：公网直接暴露 HTTPS。每个请求独立鉴权。

### 9.1 传输

| 层 | 首版 | 云端 |
|---|---|---|
| 公网入口 → nginx | HTTPS 推荐（即便后端是 HTTP），证书可用 Let's Encrypt 或自签 | HTTPS 强制 |
| nginx → frps → frpc → server | LAN 内 HTTP（隧道内部） | N/A，server 直接公网 |
| `CLAUDE_MEM_SERVER_REQUIRE_TLS` | `false` | `true`（配合 nginx 设 `X-Forwarded-Proto: https`） |

### 9.2 鉴权（见 §8.2 可插拔策略链）

| 模式 | 首版 | 云端 |
|---|---|---|
| `none` | 默认，依赖网络层边界 | ✗ |
| `apikey` | 可选启用 | 默认 |
| `jwt` / `mtls` | 占位 | 高安全场景 |

### 9.3 网络层兜底（即便 auth=none 也要做）

1. **frps token**：frpc 配 `token = ...` 与 frps 一致，否则隧道建立不了，是第一道门。
2. **nginx allowlist**：`allow 1.2.3.4; deny all;` 锁员工出口公网 IP（如果员工固定办公室/家里）。VPN 场景则锁 VPN 出口。
3. **server TRUSTED_PROXIES**：只接受来自 `127.0.0.1`（本机 nginx/frpc）的 ingest 请求。即便有人扫到内网 IP 直接 POST，被拒。
4. **basic auth**（可选）：nginx 加一行 `auth_basic`，10 秒部署，给 frps 入口加密码。

### 9.4 应用层防御（与鉴权独立）

- **allowList**：`CLAUDE_MEM_SERVER_ALLOWED_USERS` 即使 `auth=none` 也强制生效，未列名的 user_label 直接拒绝。
- **payload 大小限制**：`CLAUDE_MEM_SERVER_INGEST_MAX_BATCH=1000`，超大请求 413。
- **rate limit**：基于 IP（首版）/ user_label（云端）的简单令牌桶，防客户端 bug 把 server 打挂。
- **schema 校验**：zod 拒绝任何不符合 ingest schema 的字段，未知字段被忽略而非 500。

### 9.5 静态数据
- `~/.claude-mem/settings.json` 强制 `0600`
- API Key 不写入日志
- 同步失败日志只记 HTTP status + endpoint，不记 body
- DB 文件依赖文件系统权限；如需更强可后续接 SQLCipher

### 9.6 内容过滤
- `<private>…</private>` 标签在 hook 层已剥离 → 永远不会进 DB → 不会被同步
- `CLAUDE_MEM_SYNC_REDACT_PATTERNS` 客户端 push 前过滤 `files_read` / `files_modified` 含特定 glob 的条目（如 `**/.env`、`**/secrets/**`）
- 员工可随时 `CLAUDE_MEM_SYNC_ENABLED=false` 中止同步

### 9.7 审计
- server 端每次成功 ingest 写入 `sync_inbox`，包含 user_label + applied_at_epoch + 源表行数
- 管理 CLI：`claude-mem server sync-audit --user ZhangSan --since 2026-05-15`
- 首版 audit 表用 SQLite，云端阶段可外接 syslog/elk

---

## 9bis. 扩展点契约（首版 ↔ 云端演进必读）

> 这一节是本设计文档的"宪法"——每个可演进维度都有显式扩展点，未来 PR 只动扩展点，业务代码冻结。

### 9bis.1 鉴权策略（auth strategy）

| 维度 | 契约 |
|---|---|
| 接口 | `SyncAuthStrategy { mode, authenticate(req): Promise<string\|null> }` (见 §8.2) |
| 装配点 | `buildAuthChain(settings)` 工厂函数，按 `CLAUDE_MEM_SERVER_AUTH_MODE` 实例化 |
| 首版 | `NoopAuth` |
| 已留扩展位 | `apikey`（复用 `api_keys` 表）/ `jwt` / `mtls` |
| 不变量 | `authenticate` 之后 req.syncContext 必有 `userLabel`（首版来自 body，未来来自 token claims） |

### 9bis.2 传输安全（transport guard）

| 维度 | 契约 |
|---|---|
| 接口 | Express middleware `(req, res, next) => void` |
| 装配 | 在 SyncRoutes 中间件链中按设置项条件挂载 |
| 首版 | `trustProxyMiddleware`（默认 127.0.0.1）+ `requireTlsMiddleware`（默认禁用） |
| 已留扩展位 | rate-limit、IP geo、user-agent 校验 |

### 9bis.3 存储后端（storage backend）

| 维度 | 契约 |
|---|---|
| 接口 | `SessionStore` / `Observations` / `Summaries` / `Prompts` 已是抽象类，方法签名稳定 |
| 首版 | `bun:sqlite` 直连 `~/.claude-mem/claude-mem.db` |
| 已留扩展位 | Postgres 适配（`src/storage/postgres/*` 已存在），切换需新增 `BackendKind` 配置项 |
| 触发切换的指标 | server 端每天新增行数 > 100k 或表大小 > 5GB |

### 9bis.4 同步触发器（sync trigger）

| 维度 | 契约 |
|---|---|
| 接口 | `SyncAgent.scheduleSoon()` + `tick()` 两个入口，新触发器只需在事件处接入 |
| 首版 | interval（30s）+ post-write debounce（2s）+ start/stop |
| 已留扩展位 | WebSocket 实时（替代轮询）、对等同步（peer-to-peer，公司多 server 间） |

### 9bis.5 客户端身份（client identity）

| 维度 | 契约 |
|---|---|
| 字段 | **`user_label` 单列**，存于 sdk_sessions |
| 首版 | `user_label` = `os.userInfo().username`，缺时回写 settings 固化 |
| 设计意图 | **员工的身份是"人"不是"机器"**：一个人多台电脑应聚合显示，不刻意区分机器来源 |
| 已留扩展位 | 公司目录服务集成（LDAP/SSO）→ user_label 由 IdP 注入；若未来需要按机器审计，单独新增可选 `client_instance` 字段，不破坏既有 user_label 主轴 |

### 9bis.6 数据流向（sync direction）

| 维度 | 契约 |
|---|---|
| 首版 | append-only 单向 client → server |
| 协议位 | request body 已有 `direction` 字段（首版固定 `up`） |
| 已留扩展位 | 反向拉取（`GET /api/sync/pull?user_label=...&since=...`）、双向 reconcile |

### 9bis.7 viewer 多租户视图

| 维度 | 契约 |
|---|---|
| 接口 | `userLabel?` 作为所有 list/stats 端点的可选过滤参数 |
| 首版 | server 模式 viewer 加员工下拉（client 模式隐藏） |
| 已留扩展位 | 浏览器登录态 + per-user JWT 限制可见员工子集；按部门/项目分组 |

### 9bis.8 协议版本

| 维度 | 契约 |
|---|---|
| 协议字段 | request body 顶层 `protocol_version: 1`；server 拒绝大于自己支持的版本 |
| 兼容策略 | server 接受 ≤ 自己的版本；忽略未知字段（forward-compatible） |
| 已留扩展位 | v2 加入压缩、分片、断点续传等高阶能力时只需 bump 版本号 |

---

## 10. UI 改动一览

### 10.1 viewer 内
- Header：增加员工选择器（server 模式）；增加同步状态徽章（client 模式：上次推送时间 / 待推送数）
- 卡片 footer：除现有的 OS user 外，**server 端**还显示 user_label（更易区分），可点击直接过滤
- 设置面板：新增"同步"分组（client）/ "服务端"分组（server）

### 10.2 安装脚本
`./install-claude-mem` 增加：
- `-i client --upstream <URL> --api-key <KEY> --label <NAME>`：一键安装客户端模式
- `-i server`：服务端模式
- 交互模式问 IDE 后追问角色，client 时问上游 URL 和 key

---

## 11. 失败模式与边界

| 场景 | 行为 |
|---|---|
| 员工电脑断网一周 | hook 正常落本地；SyncAgent 每个 tick 失败但游标不进；联网后从断点继续推 |
| Server 宕机 | client 推送 5xx → 失败计数 +1 → 退避；client viewer 不受影响 |
| 员工同时在两台电脑用同一 user_label | **预期行为**：两路推送都落到 server 端同一员工名下；sdk_sessions 通过 `content_session_id` UUID 天然不冲突 |
| 员工换电脑/重装系统 | 只要 OS 用户名一致 → user_label 一致 → server 端继续视为同一员工，无缝接续 |
| 同名 user_label 不同人 | server 端配置 `CLAUDE_MEM_SERVER_ALLOWED_USERS` 白名单 + 唯一约束 |
| 员工本地 DB 损坏 | 重装时 `-d` 清空本地数据；server 端**保留**之前同步过的副本（这是 server 价值之一） |
| Server 上某员工 DB 表暴增 | 表是统一的，按 user_label / dateRange 过滤；定期归档可后续做 |
| Schema 不一致（client 新版 push 给老 server） | request body 加 `client_version`；server 拒绝 unknown 字段或忽略未识别字段（设计 forward-compatible） |
| 客户端 SDK 生成 observation 之前网络掉 | 没事，observation 还没写本地 DB；SDK 失败有 retry-guard，最终丢弃 |

---

## 12. 开发路线图

### Phase 1：首版核心同步（~1 周，无鉴权 + frpc 内网）
- [ ] settings 新键 + role 切换（`CLAUDE_MEM_NODE_ROLE / USER_LABEL`）
- [ ] migration v36 (user_label) + v37 server-only (sync_inbox)
- [ ] `src/shared/user-label.ts`（解析 settings / fallback 到 OS 用户名 / 首次写回 settings 固化）
- [ ] SyncAgent + 增量采集 + watermark 持久化
- [ ] `POST /api/sync/ingest`（SQLite 直插 + sync_inbox 幂等）
- [ ] **鉴权中间件抽象 + `NoopAuth` 默认实现**（API Key 实现先占位，留到 Phase 4 实现）
- [ ] `trustProxyMiddleware` + `enforceAllowList` 中间件
- [ ] frpc + nginx 部署文档 + sample `frpc.ini` / `nginx.conf`
- [ ] 单元测试：watermark 推进、重复 ingest 幂等、断网恢复、TRUSTED_PROXIES 拒绝外网 IP

### Phase 2：viewer 多员工（~3 天）
- [ ] `/api/admin/role` + `/api/users`
- [ ] viewer Header 加员工下拉（仅 server 模式渲染）
- [ ] stats / observations / summaries / prompts 端点加 `userLabel` 过滤
- [ ] 卡片 footer 加 user_label chip

### Phase 3：运维 + UX（~3 天）
- [ ] Header 同步状态徽章（上次推送时间 / 待推送数 / 失败计数）
- [ ] `install-claude-mem -i client --upstream <URL> --label <NAME>` 一键安装（无 key 选项）
- [ ] 同步审计日志 + 管理 CLI（`claude-mem server sync-audit`）

### Phase 4：云端演进 — 启用 API Key 鉴权（~3 天，必要时再做）
- [ ] `ApiKeyAuth` 策略实现（复用 `api_keys` 表）
- [ ] `claude-mem server sync-keys create|list|revoke` CLI
- [ ] HTTPS 部署文档 + Let's Encrypt 自动化
- [ ] `install-claude-mem` 增加 `--api-key` 参数
- [ ] 切换 runbook：「双端 `auth_mode=none` → `apikey`」零停机迁移指引

### Phase 5（可选）：高级
- [ ] 双向同步（员工互看选定项目）
- [ ] team-level mem-search MCP（跨员工语义搜索）
- [ ] Postgres 替代 SQLite（大数据量场景，每天 > 100k 行）
- [ ] WebSocket 实时推送（替代轮询）
- [ ] JWT / mTLS 策略（高安全场景）

---

## 13. 代码改动文件清单（Phase 1）

新建：
- `src/services/sync/SyncAgent.ts` — 客户端同步代理
- `src/services/sync/sync-state.ts` — watermark 持久化
- `src/services/sync/payload.ts` — 增量采集 + 序列化
- `src/services/worker/http/routes/SyncRoutes.ts` — server 接收端点
- `src/services/worker/http/middleware/requireBearerToken.ts`
- `src/shared/user-label.ts` — user_label 解析（settings 优先 / OS 用户名 fallback / 首次回写）
- `src/shared/role.ts` — role 解析与守卫

修改：
- `src/shared/SettingsDefaultsManager.ts` — 新键
- `src/services/sqlite/migrations/runner.ts` — v36 / v37
- `src/services/sqlite/sessions/create.ts` — 写入 user_label（OS 用户名 fallback + settings 持久化）
- `src/services/worker-service.ts` — role 分支：bind host、SyncAgent 启动、SyncRoutes 注册
- `src/services/worker/PaginationHelper.ts` — SELECT 多带 user_label，支持 `userLabel` 过滤参数
- `src/services/worker/http/routes/DataRoutes.ts` — stats / observations / summaries / prompts 加 `userLabel` 参数
- `src/services/worker/agents/ResponseProcessor.ts` — 写完触发 `syncAgent.scheduleSoon()`
- `src/services/worker/events/SessionEventBroadcaster.ts` — 同上
- `src/ui/viewer/App.tsx` — userLabel state + 传递
- `src/ui/viewer/components/Header.tsx` — 员工选择器（仅 server）
- `src/ui/viewer/utils/i18n.ts` — 新增 key
- `install-claude-mem` — `-i client/server` 与新参数

---

## 13bis. 部署样例（首版 frpc + nginx）

### 办公室 server 端 `frpc.ini`
```ini
[common]
server_addr = <公网入口 frps IP>
server_port = 7000
token       = <frps token>

[claude-mem-sync]
type        = tcp
local_ip    = 127.0.0.1
local_port  = 37700      ; claude-mem server bind
remote_port = 17700      ; frps 暴露端口
```

### 公网入口 `nginx.conf`
```nginx
upstream claude_mem_backend {
    server 127.0.0.1:17700;   # frps 暴露的端口
}

server {
    listen 443 ssl http2;
    server_name mem.acme.com;

    ssl_certificate     /etc/letsencrypt/live/mem.acme.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/mem.acme.com/privkey.pem;

    # 可选 IP allowlist（员工固定出口时）
    # allow  1.2.3.4;
    # deny   all;

    # 可选 Basic Auth（粗粒度，首版没鉴权时的临时门禁）
    # auth_basic            "Memory";
    # auth_basic_user_file  /etc/nginx/.htpasswd;

    location /api/sync/ {
        proxy_pass         http://claude_mem_backend;
        proxy_set_header   Host $host;
        proxy_set_header   X-Forwarded-For   $remote_addr;
        proxy_set_header   X-Forwarded-Proto $scheme;
        client_max_body_size 10m;
    }

    location / {
        # viewer 通过 Basic Auth 给老板用
        auth_basic            "Memory viewer";
        auth_basic_user_file  /etc/nginx/.htpasswd;
        proxy_pass            http://claude_mem_backend;
        proxy_http_version    1.1;
        proxy_set_header      Upgrade $http_upgrade;
        proxy_set_header      Connection "upgrade";   # SSE
    }
}
```

### 切换到云端 + ApiKey 的 runbook（零停机）

1. server 上发 key：`claude-mem server sync-keys create --user ZhangSan` → 输出 `cmem_xxx`
2. 把 key 安全送达员工（公司 IM 私聊）
3. 员工改本地 settings：`CLAUDE_MEM_SYNC_AUTH_MODE=apikey` + `CLAUDE_MEM_SYNC_API_KEY=cmem_xxx`，重启 worker
4. **逐人切换**期间 server 仍是 `auth_mode=none`，新 key 直接通过 NoopAuth（key 被忽略但不报错）
5. 全员切完后 server 改 `CLAUDE_MEM_SERVER_AUTH_MODE=apikey`，重启
6. 未切换的客户端立即 401，运维收到告警 → 手动给他们补 key

---

## 14. 验收标准

Phase 1 完成的判定（首版 frpc + 无鉴权场景）：
1. 员工电脑 `CLAUDE_MEM_NODE_ROLE=client` 且 `CLAUDE_MEM_SYNC_AUTH_MODE=none`，做 5 分钟 claude code 操作，server 端 30s 内能在 viewer 看到这些 observations。
2. 员工断网 10 分钟后恢复，所有断网期间的 observations / prompts 自动追加到 server，无重复无遗漏。
3. server 端自己跑 claude code，本地数据正常进入本地 viewer，**不会**被错误标记为某员工的。
4. server 端 viewer 选择员工 = "ZhangSan"，只看到 ZhangSan 的项目和数据；选 "All users" 看全部（含 server 自己）。
5. 模拟攻击者绕过 nginx 直接 POST 内网 server `:37700`（来自非 127.0.0.1 IP），被 `TRUSTED_PROXIES` 中间件拒绝 403。
6. 客户端 push 过滤：`CLAUDE_MEM_SYNC_REDACT_PATTERNS=**/*.env` 后，含 `.env` 路径的 observation 不出现在 server。
7. 配置 `CLAUDE_MEM_SERVER_ALLOWED_USERS=ZhangSan,LiSi,Boss`，用 `user_label=Hacker` push 被拒 403（即使无鉴权）。

Phase 4 完成的判定（云端 + ApiKey）：
8. 双端切到 `auth_mode=apikey` 后，无 key 的 push 全部 401，有 key 的正常工作。
9. 撤销某员工 API Key 后，该员工后续 push 全部 401，本地继续正常工作，server 端不再接收。
10. 员工 A 用自己的 key 把 body 改成 `user_label=B` 尝试冒充，被 server 拒绝（key 绑定的 user_label 与 body 不一致）。

---

## 15. 与现有 server-beta 的关系（说明）

| 维度 | 现有 server-beta | 本方案 |
|---|---|---|
| 客户端本地 worker | 关闭，hook 直连远端 | 保留，全功能 |
| 离线工作 | 不可用 | 完全可用 |
| 远端存储 | Postgres + Redis | SQLite（首版），可后续切 Postgres |
| API 协议 | `/v1/*` | `/api/sync/*` 独立命名空间，不冲突 |
| 适用场景 | 全云端、企业级、有专门运维 | 中小团队、个人老板视图、低运维 |

**两者可并存**：现有 server-beta 代码不动，本方案是新增能力。settings 互斥（`CLAUDE_MEM_RUNTIME=server-beta` 与 `CLAUDE_MEM_SYNC_ENABLED=true` 同时打开时 SyncAgent 自动停用并 warn）。

---

## 16. 设计决策（已确定）

| # | 议题 | 决策 | 理由 |
|---|---|---|---|
| 1 | **设备标识** | **不引入 device_id；身份只用 `user_label`，默认 = OS 登录用户名** | 设计意图：同一员工换电脑 / 重装系统 / 多机并用，server 端应聚合为「一个人的视图」，不区分机器来源。多电脑各推各的数据天然不冲突（content_session_id 是 UUID） |
| 2 | **删除同步** | **client 删除项目时 server 不联动删除**。同步严格单向、append-only、仅增量 | server 是审计副本；员工本地误删/重装不应连带丢失 server 上的历史。后续若需"统一清理"由老板在 server viewer 上手工删（已有的 `POST /api/projects/delete`） |
| 3 | **历史回填** | **不做回填**，仅同步启用之后新增的数据 | 简化首版；员工启用同步前的本地历史只在本地可见，符合"server 是渐进聚合"的预期 |
| 4 | **server 自身身份** | **服务端的 user_label 也用 OS 登录用户名**（与员工同一规则，无特殊化） | 一致性；server 自己 hook 的数据进入混合视图时，老板能直接按 `user_label=<server OS user>` 筛选 |
| 5 | **viewer 切换员工与 SSE** | server 通过 `/stream` 推全量事件；**viewer 端客户端按当前选中的 `user_label` 过滤显示**。无需协议改动 | SSE = Server-Sent Events（浏览器订阅服务器单向推送的实时事件通道，避免轮询）。在 server 模式下所有员工事件混在同一 stream，浏览器收到后一行 `if (event.user_label !== currentFilter) skip` 即可 |

### 16.1 决策对实现的影响

- **schema**：`sdk_sessions` 只加 `user_label` 一列（v36）；不再加 `device_id`
- **协议**：ingest body 不含 `device_id`；watermark 以 `(user_label, table)` 维度存储
- **CLI**：不需要 `sync backfill` 命令
- **viewer**：SSE handler 一处 `if` 过滤即可，无需修改 worker 端 SSE 协议
- **运维**：server 通过 `CLAUDE_MEM_SERVER_ALLOWED_USERS` 白名单 + 单一 `user_label` 维度做权限/审计

### 16.2 留待 Phase 5+ 评估的进阶问题（暂不实现）

- 反向同步 / 拉取（员工互看选定项目，team-level mem-search）
- 同一 user_label 多人冲突的自动检测与提示（首版让员工自己改 settings）
- 若未来需要按机器维度审计，引入可选 `client_instance` 字段，**不破坏 user_label 主轴**

---

**文档版本**：v1.2 · 2026-05-16（v1.2 固化 5 项设计决策：去除 device_id、单向不删、不回填、server 同规则身份、viewer 客户端过滤 SSE）
**作者**：claude-mem 维护方
**状态**：方案，决策已确认，可启动 Phase 1 实施
