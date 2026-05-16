# 部署样例：frpc + nginx（首版同步部署）

> 这是 claude-mem 双模式同步（S-doc §4.1）首版部署的**最小可跑通**配置。
> 适用场景：办公室内网放一台 claude-mem `role=server`，员工电脑都是 `role=client`，
> 通过 frpc 把内网 server 暴露到公网，再由 nginx 终结 HTTPS。
> 首版**不开启**鉴权（`auth_mode=none`），靠 nginx + IP 白名单 + 内网信任做防护。

---

## 拓扑

```
[ 员工 client A ]  ──┐                            ┌── server worker :37700 (loopback)
[ 员工 client B ]  ──┼──→  HTTPS  →  公网 nginx ──┤
[ 员工 client C ]  ──┘     (443)     (mem.acme.com)│
                                                  └── frpc 接到 frps（端口 17700）
```

办公室那台 server 不需要公网 IP，frpc 主动出去找公网 frps，nginx 反代到 frps 暴露的端口。

---

## 1. server 端 — claude-mem worker

`~/.claude-mem/settings.json`（写好后 `claude-mem start` 或重启 worker）：

```json
{
  "env": {
    "CLAUDE_MEM_NODE_ROLE": "server",
    "CLAUDE_MEM_SERVER_BIND_HOST": "127.0.0.1",
    "CLAUDE_MEM_SERVER_AUTH_MODE": "none",
    "CLAUDE_MEM_SERVER_TRUSTED_PROXIES": "127.0.0.1/32,::1/128",
    "CLAUDE_MEM_SERVER_ALLOWED_USERS": "ZhangSan,LiSi,WangWu",
    "CLAUDE_MEM_USER_LABEL": "Boss"
  }
}
```

- `BIND_HOST=127.0.0.1` 强制 server 只监听 loopback，外网只能通过 frpc/nginx 进入。
- `ALLOWED_USERS` 是应用层兜底白名单；空值=允许任何 `user_label`（仅适合 PoC）。
- 你自己的 `user_label` 设成 `Boss`（或任何非员工值），避免在 viewer 里跟员工数据混在一起。

---

## 2. server 端 — frpc

`/etc/frp/frpc.ini`：

```ini
[common]
server_addr = <公网入口 frps IP>
server_port = 7000
token       = <frps token>

[claude-mem-sync]
type        = tcp
local_ip    = 127.0.0.1
local_port  = 37700          ; claude-mem server 实际监听端口
remote_port = 17700          ; frps 上暴露的端口
```

注意：claude-mem 的默认 worker 端口是 `37700 + (uid % 100)`。如果你的 server 账户 uid 不是
00 结尾，先 `id -u` 算出实际端口，或在 settings 里固定 `CLAUDE_MEM_WORKER_PORT=37700`。

启动：`frpc -c /etc/frp/frpc.ini`。

---

## 3. 公网入口 — nginx

`/etc/nginx/sites-available/claude-mem`：

```nginx
upstream claude_mem_backend {
    server 127.0.0.1:17700;        # frps 暴露的端口
}

server {
    listen 443 ssl http2;
    server_name mem.acme.com;

    ssl_certificate     /etc/letsencrypt/live/mem.acme.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/mem.acme.com/privkey.pem;

    # 可选 IP allowlist（员工固定出口时）
    # allow  1.2.3.4;
    # deny   all;

    # /api/sync/* 不挂 Basic Auth：client SyncAgent 不会处理 401 challenge
    location /api/sync/ {
        proxy_pass         http://claude_mem_backend;
        proxy_set_header   Host              $host;
        proxy_set_header   X-Forwarded-For   $remote_addr;
        proxy_set_header   X-Forwarded-Proto $scheme;
        client_max_body_size 10m;
    }

    # viewer 给老板用，加 Basic Auth
    location / {
        auth_basic            "Memory viewer";
        auth_basic_user_file  /etc/nginx/.htpasswd;
        proxy_pass            http://claude_mem_backend;
        proxy_http_version    1.1;
        proxy_set_header      Upgrade $http_upgrade;
        proxy_set_header      Connection "upgrade";   # SSE 需要 keep-alive
    }
}
```

启用：

```bash
ln -s /etc/nginx/sites-available/claude-mem /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx
```

---

## 4. 员工电脑 — client

`~/.claude-mem/settings.json`：

```json
{
  "env": {
    "CLAUDE_MEM_NODE_ROLE": "client",
    "CLAUDE_MEM_SYNC_ENABLED": "true",
    "CLAUDE_MEM_SYNC_UPSTREAM_URL": "https://mem.acme.com",
    "CLAUDE_MEM_SYNC_AUTH_MODE": "none",
    "CLAUDE_MEM_USER_LABEL": "ZhangSan",
    "CLAUDE_MEM_SYNC_INTERVAL_MS": "30000",
    "CLAUDE_MEM_SYNC_REDACT_PATTERNS": "**/*.env,**/secrets/**"
  }
}
```

- `USER_LABEL` 必须出现在 server 的 `ALLOWED_USERS` 列表里。
- `REDACT_PATTERNS` 在 client 端剔除敏感路径，server 永远看不到这些文件名。
- 重启 worker：`claude-mem restart`（或退出 / 重开 Claude Code 触发 SessionStart）。

---

## 5. 验收

按 S-doc §14 Phase 1 验收项跑一次：

```bash
# server 端
curl http://127.0.0.1:37700/api/admin/role
# → {"role":"server","userLabel":"Boss"}

# client 端做一次有 observation 的对话，等 30s
# server 端
sqlite3 ~/.claude-mem/claude-mem.db "SELECT user_label, COUNT(*) FROM sdk_sessions GROUP BY user_label"
# → 应该看到 ZhangSan / LiSi 等条目
```

---

## 6. Troubleshooting

| 现象 | 诊断 | 解决 |
|---|---|---|
| `502 Bad Gateway` from `mem.acme.com` | frps ↔ frpc 链路断 | server 上 `journalctl -u frpc` 看握手；frps 上 `tail /var/log/frps.log` |
| 同步请求都 `403` | client 的 `USER_LABEL` 不在 server 的 `ALLOWED_USERS` 列表 | server 改 settings，重启 worker（schema 不需要迁移） |
| 同步请求 `401` | nginx 给 `/api/sync/` 也加了 `auth_basic` | 把 Basic Auth 限制到 `location /`，不要碰 `/api/sync/` |
| `connection refused` to `127.0.0.1:37700` from frpc | server 改了 `WORKER_PORT` 但 frpc.ini 没跟着改 | `cat ~/.claude-mem/worker.pid` 看 port，回填 frpc.ini |
| client viewer 看不到自己刚做的 observation | `SYNC_ENABLED=false` 或 worker 没重启 | `tail -n 200 ~/.claude-mem/logs/claude-mem-$(date +%F).log \| grep SYNC` |
| server viewer 看不到 client 的数据 | client 的 user_label 在 server `ALLOWED_USERS` 之外 → 静默 403 → SyncAgent 一直重试但不入库 | server `/api/sync/*` 处的 nginx access log 找 403 行 |

---

## 7. 切到云端 + ApiKey（未来 Phase 4）

首版 `auth_mode=none` 是 frpc 内网 + nginx IP 白名单的组合保护。要切到公网开放 + ApiKey
鉴权时，只需双端改 `auth_mode=apikey` + 配 key，业务代码零改动。runbook 见 S-doc §13bis 末尾。
