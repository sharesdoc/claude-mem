# Install Claude-Mem

交互式安装和配置 claude-mem 的客户端/服务端双模式同步。

## 前置条件

- 用户电脑上有 `/Users/johnson/wks/ai/plugins/claude-mem` 全套代码（已构建）
- Bun、Node.js 已安装
- 两台机器在同一局域网可互通（服务端 + 客户端）

## 流程

### 阶段 0：确认安装模式

向用户提问（一次问一个）：

> 你要把这台机器配置成**服务端**还是**客户端**？
>
> - **服务端**：这台机器接收其他员工推送的数据，老板在这台机器的 viewer 上看全团队数据
> - **客户端**：员工电脑，安装后自动把本地 AI 对话数据推到服务端

收集用户的回答，存入变量 `ROLE`（值为 `client` 或 `server`）。

---

### 阶段 1：收集配置信息

根据 `ROLE` 不同，逐项询问：

#### 1.1 通用项（两种模式都需要）

**User Label**（用户标识）：
> 你的标识名是什么？（英文，如 `zhangsan`、`boss`）
> 这是服务端 viewer 里区分不同员工的标签。默认为你当前的 OS 用户名 `$(whoami)`。

如果用户不填，默认用 `whoami` 的输出。

#### 1.2 客户端专属

依次询问：

**Server URL**：
> 服务端的地址是什么？（格式：`http://<IP>:<端口>`）
> 例如 `http://192.168.1.100:37701`。端口在服务端的 `~/.claude-mem/worker.pid` 文件里可以看到。

**Access Token**（如果服务端配了 token）：
> 服务端的 Access Token 是什么？（如果没有设置 token，直接回车跳过）
> 这是服务端管理员告诉你的共享密钥。

#### 1.3 服务端专属

**Access Token**（可选但强烈推荐）：
> 设置一个 Access Token（共享密钥），客户端连上来时必须带上这个 token。直接回车我会随机生成一个 32 字符的 token。
>
> Token 只用于 LAN 内网鉴权——比 CSV 白名单简单，比 API Key 体系轻量。

如果用户不填，用 `node -e "console.log(require('crypto').randomBytes(16).toString('base64url'))"` 生成一个。

---

### 阶段 2：构建并安装

所有信息收集完毕后，执行安装：

#### 2.1 构建

首先确认代码已构建：

```bash
cd /Users/johnson/wks/ai/plugins/claude-mem
node scripts/build-hooks.js
```

如果构建失败，向用户报告错误并停止。

#### 2.2 运行安装脚本

**服务端**：
```bash
./install-claude-mem -i claude --role server --label "<USER_LABEL>" --token "<ACCESS_TOKEN>"
```

**客户端**（无 token）：
```bash
./install-claude-mem -i claude --role client --upstream "<SERVER_URL>" --label "<USER_LABEL>"
```

**客户端**（有 token）：
```bash
./install-claude-mem -i claude --role client --upstream "<SERVER_URL>" --label "<USER_LABEL>" --token "<ACCESS_TOKEN>"
```

> 上面命令中的 `<PLACEHOLDER>` 替换为阶段 1 收集的实际值。

安装脚本会自动：
- 同步插件文件到 `~/.claude/plugins/marketplaces/thedotmack/`
- 写入 `~/.claude-mem/settings.json`（合并而非覆盖已有配置）
- 启动 worker

#### 2.3 验证安装

等待安装完成后，执行以下验证：

```bash
# 确认 worker 正在运行
PORT=$(node -e "const u=require('os').userInfo();console.log(37700 + (u.uid % 100))")
curl -s -m 3 "http://127.0.0.1:$PORT/api/admin/role"
```

检查输出：
- 服务端：`{"role":"server","userLabel":"..."}`
- 客户端：`{"role":"client","userLabel":"..."}`

**客户端额外验证**（确认能连通服务端）：
```bash
curl -s -m 5 -H "Authorization: Bearer <ACCESS_TOKEN>" "http://<SERVER_URL>/api/sync/status"
```

如果返回 401/403，说明 token 不匹配，让用户检查服务端和客户端的 token 是否一致。如果返回 JSON，说明连接成功。

---

### 阶段 3：安装完成提示

根据 `ROLE` 输出不同的完成信息：

**服务端**：
```
✅ 服务端安装完成！

- Viewer 地址：http://<本机IP>:<端口>/
- 员工接入信息（告诉每个员工）：
  - Server URL: http://<本机IP>:37701
  - Access Token: <TOKEN>
- 下一步：在另一台机器上用 claude-mem AI 助手执行客户端安装
```

**客户端**：
```
✅ 客户端安装完成！

- 本机数据将自动推送到：<SERVER_URL>
- 同步间隔：30 秒
- 本地 viewer 地址：http://127.0.0.1:<端口>/
- 下一步：重启 Claude Code 或执行 claude-mem restart 使配置生效
```

---

### 阶段 4：提醒用户

安装完成提醒时：
> 如果你是老板，打开浏览器访问 `http://<SERVER_IP>:<PORT>/` 即可看到全团队的 AI 工作记录。
> 所有员工的 observation/summary/prompt 都会同步到服务端。
> 服务端 viewer 里可以按员工筛选数据。

---

## 故障排查

| 现象 | 可能原因 | 排查命令 |
|---|---|---|
| worker 启动失败 | 端口冲突 / bun 未安装 | `cat ~/.claude-mem/logs/claude-mem-$(date +%F).log \| tail -50` |
| 客户端 401 | token 不一致 | 对比两台机器的 `grep ACCESS_TOKEN ~/.claude-mem/settings.json` |
| 客户端连接超时 | 服务端防火墙 / IP 不可达 | 客户端 `curl -m 5 http://<SERVER_IP>:<PORT>/api/admin/role` |
| 服务端不接收数据 | TRUSTED_PROXIES 拒绝了客户端 IP | 服务端 `tail -100 ~/.claude-mem/logs/claude-mem-$(date +%F).log \| grep trustProxies` |
| 数据推了但在 viewer 看不到 | user_label 不一致 | 对比两台机器的 `grep USER_LABEL ~/.claude-mem/settings.json` |

## 设计决策

- **Access Token 替代 AllowList**：不再用 `CLAUDE_MEM_SERVER_ALLOWED_USERS` CSV 白名单。改用共享 Access Token——服务端设一个，所有客户端用同一个。比白名单简单，比 API Key 体系轻量，适合 LAN 场景。
- **tokenAuth 中间件顺序**：在 `trustProxies` 之后、`requireTls` 之前执行。IP 过滤在第一层，token 在第二层。
- **常量时间比较**：token 校验使用 `crypto.timingSafeEqual`，防止时序侧信道泄露 token 信息。
