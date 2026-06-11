# X-系统任务清单

本清单是 claude-mem 项目的迭代级任务库，承载代码审查、测试与用户反馈产生的待办工作项。当前批次含 4 条缺陷类任务：X-001~X-003 来自 2026-06-12 对提交 `262f8111`（clean-database 重构）的代码审查（rev 报告 R-001/R-002/R-003），主题集中在运维脚本 `clean-database` 的删除原子性与 worker 生命周期管理，已全部修复关闭（回归测试 `tests/clean-database.test.sh` 12 项全过）；X-004 为修复过程中新发现的 chroma-mcp 进程泄漏问题，待处理。项目无 A-F/M 文档体系，所属计划项均为"无（独立 fix）"。

## 任务条目

以下任务按登记顺序排列：X-001 对应删除操作缺事务包裹（数据一致性），X-002 对应进程强杀全局误伤（多实例安全），X-003 对应 worker 端口判定来源单一（探活漏检）——三者共同构成"清理操作在故障/边缘场景下的安全性"整改并已闭环；X-004 为新登记的进程泄漏缺陷。

### X-001 clean-database 多表删除未包事务，中途失败留下部分删除

- 编号：X-001
- 任务类型：缺陷
- 严重程度：P1
- 状态：已验证-关闭
- 来源：rev-委托（审查报告 R-001）
- 所属计划项：无（独立 fix）
- 任务描述：现象——`cmd_clean_user`/`cmd_clean_all` 的多条 DELETE 语句由 sqlite3 CLI 逐条自动提交，且未设 busy_timeout（默认 0）；若删除中途遭遇 `database is locked` 或 I/O 错误，前几张表已删、后几张未删，数据库处于跨表不一致状态，需人工从备份还原。影响范围——清理操作的原子性与故障时数据一致性。
- 涉及文件与行号：`clean-database:408-419`（cmd_clean_user 删除块）、`clean-database:478-487`（cmd_clean_all 删除块）
- 关联需求：N/A
- 根因分析（5-Why）：
  - Why-1 清理中途失败会留下部分删除 → `clean-database:408-419` 七条 DELETE 顺序执行
  - Why-2 每条 DELETE 独立提交，无整体回滚能力 → sqlite3 CLI 多语句默认逐条 autocommit，块内无 `BEGIN`/`COMMIT`
  - Why-3 锁竞争下首条/中途语句即可失败 → 未设 `busy_timeout`，默认 0 毫秒即报 `database is locked`
  - Why-4 实现时未考虑该场景 → 初版以"worker 已停止"为充分前提，忽略了端口漏检（X-003）、外部进程持锁等旁路
  - 根因：删除块缺少显式事务包裹（`BEGIN IMMEDIATE`...`COMMIT`）与 `busy_timeout` 重试窗口
- 实现/解决方案：两处删除块改为 `PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON; BEGIN IMMEDIATE; <DELETEs>; COMMIT;`——锁冲突时先等待重试，事务开启失败或中途失败则整体回滚，库保持原状。
- 验收/测试方法：(1) 沙箱库后台连接 `BEGIN IMMEDIATE` 持锁 2 秒后释放；(2) 同时执行 `clean-database -n <user> -y`；(3) 预期：修复前清理立即报 locked 失败（RED），修复后等待锁释放并原子完成（GREEN）；(4) 边界：锁持有超过 5 秒时清理整体失败且全表行数与清理前一致。
- git commit ID：118af92a
- 验证方法与结果：回归测试 tests/clean-database.test.sh x001：瞬时锁(2s)下清理等待后原子完成、用户数据全清；边界：锁持有 8s 时清理整体失败(rc=5)且全表行数 8197 与清理前一致——3 项断言全过
- 关闭时间：2026-06-12 02:48

### X-002 clean-database pkill 全局匹配，多 profile 部署误杀其他实例

- 编号：X-002
- 任务类型：缺陷
- 严重程度：P1
- 状态：已验证-关闭
- 来源：rev-委托（审查报告 R-002）
- 所属计划项：无（独立 fix）
- 任务描述：现象——worker 强杀用 `pkill -f "worker-service.cjs"`、Chroma 启停用 `pkill -f "chroma-mcp"`，均按命令行子串全机匹配。影响范围——CLAUDE.md「Multi-account」支持的同机多 profile 部署中，清理 profile A 会击落 profile B 的 worker/Chroma 进程。
- 涉及文件与行号：`clean-database:161`（worker 强杀）、`clean-database:188,194,202`（chroma_running/stop_chroma 匹配）
- 关联需求：N/A
- 根因分析（5-Why）：
  - Why-1 强杀会误伤其他实例 → `clean-database:161` pkill 按 "worker-service.cjs" 子串全机匹配
  - Why-2 未定点到本实例进程 → 未读取 `$DATA_DIR/worker.pid`（JSON，含 `pid` 与 `port` 字段，`src/shared/paths.ts:112` 定义）
  - Why-3 Chroma 同样按裸 "chroma-mcp" 匹配 → 实际进程命令行带 `--data-dir $DATA_DIR/chroma` 可作实例定界，未利用
  - 根因：进程生命周期操作未利用实例级标识（pid 文件、--data-dir 参数），退化为全局名称匹配
- 实现/解决方案：worker 强杀改为读 `$DATA_DIR/worker.pid` 的 `pid` 定点 `kill -9`，pid 不可用时退化为 `lsof -ti tcp:$WORKER_PORT -sTCP:LISTEN` 按本实例端口杀监听进程；Chroma 匹配模式改为 `chroma-mcp.*$DATA_DIR/chroma`。
- 验收/测试方法：(1) 静态断言：脚本中不再存在不带作用域的 `pkill -f "worker-service.cjs"` / `pkill -f "chroma-mcp"`；(2) 沙箱：伪造 worker.pid 指向一个 sleep 进程，触发强杀路径，确认仅该 pid 被杀；(3) 边界：worker.pid 缺失/进程已死时走 lsof 端口兜底，无监听者时不杀任何进程。
- git commit ID：711d9345
- 验证方法与结果：回归测试 x002：5 项静态断言全过(无全局 pkill、pid 定点、lsof 兜底、chroma 模式定界)；实测本 profile 模式命中全部本实例 chroma 进程、异 profile 模式 0 命中；pid 提取对真实 worker.pid 输出 94218 正确
- 关闭时间：2026-06-12 02:48

### X-003 clean-database worker 探活仅按推算端口，实际端口在 worker.pid/settings.json 时漏检

- 编号：X-003
- 任务类型：缺陷
- 严重程度：P1
- 状态：已验证-关闭
- 来源：rev-委托（审查报告 R-003）
- 所属计划项：无（独立 fix）
- 任务描述：现象——脚本端口仅取 `CLAUDE_MEM_WORKER_PORT` 环境变量，缺省按 `37700+(uid%100)` 推算；worker 实际端口可由 `$DATA_DIR/worker.pid`（运行实录）或 settings.json 决定。端口不一致时探活误判"未运行"，跳过停机，删除与活 worker 并发竞争（叠加 X-001 放大为部分删除）。影响范围——非默认端口部署的清理安全性。
- 涉及文件与行号：`clean-database:23`（端口推算）、`clean-database:141-143`（worker_is_running 探活）
- 关联需求：N/A
- 根因分析（5-Why）：
  - Why-1 探活可能打错端口 → `clean-database:23` 端口仅有 env/uid 两级来源
  - Why-2 实际运行端口被忽略 → `$DATA_DIR/worker.pid` JSON 的 `port` 字段记录真实监听端口，脚本未读
  - Why-3 配置端口被忽略 → settings.json 可配 `CLAUDE_MEM_WORKER_PORT`（SettingsDefaultsManager 为准），脚本未读
  - 根因：端口解析未覆盖运行实录与配置文件两级来源，与 worker 自身的端口决议逻辑脱节
- 实现/解决方案：新增 `resolve_worker_port()`，按 env > worker.pid `port` 字段 > settings.json `CLAUDE_MEM_WORKER_PORT` > uid 默认值四级解析。
- 验收/测试方法：(1) 沙箱 DATA_DIR 放置 `worker.pid`（port=39998）且不设 env，运行 `-s` 预期显示 port 39998（修复前显示 uid 推算值即 RED）；(2) 仅 settings.json 配端口时同理；(3) 边界：env 设置时优先于一切；两文件均无时回落 uid 默认。
- git commit ID：09a11357
- 验证方法与结果：回归测试 x003：worker.pid(39998)/settings.json(39997)/env(39996)/uid 默认(37701) 四级优先级 4 项断言全过；真实环境 -s 经 worker.pid 解析端口 37701 并正确判定运行中
- 关闭时间：2026-06-12 02:48

### X-004 chroma-mcp 进程持续泄漏，同机累积数百个残留进程

- 编号：X-004
- 任务类型：缺陷
- 严重程度：P2
- 状态：新建
- 来源：fix（X-002 验证过程中发现）
- 所属计划项：无（独立 fix）
- 任务描述：现象——`pgrep -f "chroma-mcp.*~/.claude-mem/chroma"` 命中约 310 个进程（uvx 包装进程 + python chroma-mcp 成对累积，最早 pid 1046 起），说明 worker 历次重启未回收旧 Chroma MCP 子进程。影响范围——内存/进程表资源持续占用；与本批次修复无关，按"一问题一提交"纪律单独登记不顺手修。
- 涉及文件与行号：疑似 `src/services/worker/ChromaMcpManager`（worker 停止时未终止子进程），待根因调查确认
- 关联需求：N/A
- 验收/测试方法：(1) 重启 worker 数次后 `pgrep -fc chroma-mcp` 不随重启次数增长；(2) worker stop 后本 profile 无残留 chroma-mcp 进程
