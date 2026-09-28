# Install Claude-Mem

交互式安装和配置 claude-mem。此 skill 必须作为仓库根目录 `./install-claude-mem` 的薄封装使用，不要重新实现安装、卸载、重装、worker 启停或配置写入逻辑。

## 核心原则

- 始终在 claude-mem 仓库根目录执行根脚本：`./install-claude-mem ...`。
- Windows 用户需要在 Git Bash/MSYS/Cygwin 这类 bash 环境里运行；如果当前在 PowerShell，使用 `bash ./install-claude-mem ...`。
- `-i` 安装、`-r` 重装、`-u` 卸载都保留 `~/.claude-mem` 数据；只有 `-d` 会删除数据，并需要用户明确确认。
- 不要手工编辑 Claude marketplace、installed plugins、worker pid、settings、cache 目录来模拟安装结果。
- 不要用 `node scripts/build-hooks.js` 替代安装脚本。根脚本会检查构建状态，并在需要时走自己的 build/sync/start 流程。

## 阶段 0：确认目标

一次只问一个问题，先确认：

> 你要把这台机器配置成服务端还是客户端？

- 服务端：接收其他用户推送的数据，在这台机器的 viewer 上看团队数据。
- 客户端：用户电脑，安装后自动把本地 AI 对话数据推到服务端。

记录 `ROLE`，值只能是 `server` 或 `client`。

## 阶段 1：收集配置

### 通用

询问 user label：

> 你的标识名是什么？默认为当前 OS 用户名。

如果用户不填，用 `whoami`。

### 客户端

依次询问：

- Server URL：例如 `http://192.168.1.100:37701`
- Access Token：如果服务端没有 token，允许为空

### 服务端

询问 Access Token：

> 设置一个 Access Token。直接回车则让安装脚本自动生成并复用/写入。

如果用户不填，不要自己生成 token；直接省略 `--token`，让根脚本按自身逻辑生成或复用。

## 阶段 2：运行安装

先进入仓库根目录。如果不确定当前位置，使用当前 workspace 的 claude-mem 根目录，而不是硬编码某个用户路径。

服务端：

```bash
./install-claude-mem -i claude --role server --label "<USER_LABEL>"
```

服务端指定 token：

```bash
./install-claude-mem -i claude --role server --label "<USER_LABEL>" --token "<ACCESS_TOKEN>"
```

客户端无 token：

```bash
./install-claude-mem -i claude --role client --upstream "<SERVER_URL>" --label "<USER_LABEL>"
```

客户端有 token：

```bash
./install-claude-mem -i claude --role client --upstream "<SERVER_URL>" --label "<USER_LABEL>" --token "<ACCESS_TOKEN>"
```

重装时使用同一参数形态，把 `-i` 换成 `-r`。如果是保留现有配置重装，可只执行：

```bash
./install-claude-mem -r claude
```

Windows PowerShell 中执行同样命令时使用：

```powershell
bash ./install-claude-mem -i claude --role client --upstream "<SERVER_URL>" --label "<USER_LABEL>" --token "<ACCESS_TOKEN>"
```

## 阶段 3：验证

安装完成后从 `~/.claude-mem/worker.pid` 读取端口，读不到再使用脚本默认端口算法。不要只假设 37777。

```bash
PORT=$(grep -o '"port":[[:space:]]*[0-9]*' ~/.claude-mem/worker.pid 2>/dev/null | grep -o '[0-9]*$' || true)
if [ -z "$PORT" ]; then PORT=$((37700 + $(id -u) % 100)); fi
curl -sf --connect-timeout 2 --max-time 5 "http://127.0.0.1:$PORT/api/health"
curl -sf --connect-timeout 2 --max-time 5 "http://127.0.0.1:$PORT/api/admin/role"
```

Windows PowerShell 验证：

```powershell
$pidJson = Get-Content "$env:USERPROFILE\.claude-mem\worker.pid" -Raw | ConvertFrom-Json
$port = $pidJson.port
Invoke-RestMethod -TimeoutSec 5 "http://127.0.0.1:$port/api/health"
Invoke-RestMethod -TimeoutSec 5 "http://127.0.0.1:$port/api/admin/role"
```

期望：

- 服务端：role 为 `server`
- 客户端：role 为 `client`

客户端额外验证服务端连通性：

```bash
curl -sf --connect-timeout 2 --max-time 5 -H "Authorization: Bearer <ACCESS_TOKEN>" "<SERVER_URL>/api/sync/status"
```

返回 401/403 通常是 token 不匹配；返回 JSON 表示连接成功。

## 阶段 4：完成提示

服务端安装完成后，优先读取根脚本生成的 `SERVER-INFO.md`：

```bash
cat SERVER-INFO.md
```

如果文件不存在，再从配置读取：

```bash
PORT=$(grep -o '"port":[[:space:]]*[0-9]*' ~/.claude-mem/worker.pid | grep -o '[0-9]*$')
TOKEN=$(node -e "const s=require(process.env.HOME+'/.claude-mem/settings.json');const e=s.env||s;console.log(e.CLAUDE_MEM_SERVER_ACCESS_TOKEN||'')")
```

输出给用户：

```text
服务端安装完成。
Viewer: http://<SERVER_IP>:<PORT>/
Server API URL: http://<SERVER_IP>:<PORT>
Access Token: <TOKEN>

客户端接入命令：
./install-claude-mem -i claude --role client --upstream http://<SERVER_IP>:<PORT> --label <用户名> --token <TOKEN>
```

客户端安装完成后输出：

```text
客户端安装完成。
本机数据将自动推送到：<SERVER_URL>
本地 viewer 地址：http://127.0.0.1:<PORT>/
请重启 Claude Code 以加载插件。
```

## 故障排查

| 现象 | 处理 |
|---|---|
| 卡在 Stopping worker | 重新运行最新版 `./install-claude-mem -r claude`；根脚本的 health check 有总超时，Windows 会用 `netstat -ano` + `taskkill` 清理卡住的 worker |
| worker 启动失败 | 查看 `~/.claude-mem/logs/claude-mem-$(date +%F).log` |
| 客户端 401/403 | 对比服务端和客户端 token |
| 客户端连接超时 | 检查服务端 IP、端口、防火墙和 `CLAUDE_MEM_SERVER_BIND_HOST` |
| viewer 看不到数据 | 检查客户端 role、upstream、user label 和 sync status |

## 行为一致性要求

当根目录 `install-claude-mem` 的参数、默认值、验证端点、数据保留语义或 Windows 行为变化时，同步更新本 skill。skill 只能描述和调用根脚本已经支持的行为。
