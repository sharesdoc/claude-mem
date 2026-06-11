#!/usr/bin/env bash
# clean-database 回归测试（X-001/X-002/X-003）
# 用法: tests/clean-database.test.sh [x001|x002|x003]   无参=全部
set -uo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SCRIPT="$ROOT/clean-database"
REAL_DB="${CLAUDE_MEM_DATA_DIR:-$HOME/.claude-mem}/claude-mem.db"
TMP_BASE="$(mktemp -d /tmp/clean-db-test.XXXXXX)"
trap 'rm -rf "$TMP_BASE"' EXIT

PASS=0; FAIL=0

assert() { # assert <desc> <cmd...>
  local desc="$1"; shift
  if "$@" >/dev/null 2>&1; then
    echo "  ✓ $desc"; PASS=$((PASS+1))
  else
    echo "  ✗ $desc"; FAIL=$((FAIL+1))
  fi
}

# 沙箱：复制真实库到独立 DATA_DIR（不触碰真实数据/真实 worker）
make_sandbox() {
  local dir="$TMP_BASE/$1"
  mkdir -p "$dir"
  sqlite3 "$REAL_DB" ".backup '$dir/claude-mem.db'"
  printf "%s" "$dir"
}

total_rows() {
  sqlite3 "$1" "SELECT (SELECT COUNT(*) FROM sdk_sessions)+(SELECT COUNT(*) FROM user_prompts)
    +(SELECT COUNT(*) FROM observations)+(SELECT COUNT(*) FROM session_summaries)
    +(SELECT COUNT(*) FROM weekly_reports)+(SELECT COUNT(*) FROM sync_inbox);"
}

# ── X-001 删除原子性：瞬时锁下清理应等待并原子完成 ──────────────
test_x001() {
  echo "X-001 transactional delete under transient lock"
  local dir db user
  dir="$(make_sandbox x001)"; db="$dir/claude-mem.db"
  user=$(sqlite3 "$db" "SELECT user_label FROM sdk_sessions LIMIT 1;")
  [[ -n "$user" ]] || { echo "  ✗ sandbox has no user"; FAIL=$((FAIL+1)); return; }

  # 后台持写锁 2 秒后释放（模拟残余写入方的瞬时锁）
  { echo "BEGIN IMMEDIATE;"; sleep 2; echo "COMMIT;"; } | sqlite3 "$db" &
  local locker=$!
  sleep 0.3

  env -u CLAUDE_MEM_WORKER_PORT CLAUDE_MEM_DATA_DIR="$dir" CLAUDE_MEM_WORKER_PORT=39990 \
    "$SCRIPT" -n "$user" -y >/dev/null 2>&1
  local rc=$?
  wait "$locker" 2>/dev/null

  assert "clean succeeds despite 2s transient lock (busy retry)" test "$rc" -eq 0
  local remain
  remain=$(sqlite3 "$db" "SELECT COUNT(*) FROM sdk_sessions WHERE user_label = '${user//\'/\'\'}';")
  assert "user fully removed after clean" test "$remain" -eq 0
  assert "delete block is wrapped in a transaction" grep -q "BEGIN IMMEDIATE" "$SCRIPT"
}

# ── X-002 进程操作实例定界：不得全局 pkill 误杀其他 profile ─────
in_script()     { grep -qF -- "$1" "$SCRIPT"; }
not_in_script() { ! grep -qF -- "$1" "$SCRIPT"; }

test_x002() {
  echo "X-002 instance-scoped process kill (no global pkill)"
  assert "no global pkill on worker-service.cjs" not_in_script 'pkill -f "worker-service.cjs"'
  assert "no global pkill on bare chroma-mcp"    not_in_script '-f "chroma-mcp"'
  assert "worker force-kill targets pid from worker.pid" in_script 'worker.pid'
  assert "port-scoped lsof fallback exists"      in_script 'lsof -ti tcp'
  assert "chroma kill pattern scoped to this DATA_DIR" in_script 'chroma-mcp.*'
}

# ── X-003 端口解析：env > worker.pid > settings.json > uid 默认 ──
shown_port() { # shown_port <DATA_DIR> [env_port]  → -s 输出中的 worker 端口
  local dir="$1" envp="${2:-}"
  if [[ -n "$envp" ]]; then
    CLAUDE_MEM_DATA_DIR="$dir" CLAUDE_MEM_WORKER_PORT="$envp" "$SCRIPT" -s 2>/dev/null
  else
    env -u CLAUDE_MEM_WORKER_PORT CLAUDE_MEM_DATA_DIR="$dir" "$SCRIPT" -s 2>/dev/null
  fi | sed -n 's/.*port \([0-9][0-9]*\).*/\1/p' | head -1
}

test_x003() {
  echo "X-003 worker port resolution sources"
  local dir
  dir="$(make_sandbox x003)"

  printf '{\n  "pid": 99999,\n  "port": 39998\n}\n' > "$dir/worker.pid"
  assert "worker.pid port honored (39998)" test "$(shown_port "$dir")" = "39998"

  rm -f "$dir/worker.pid"
  printf '{ "CLAUDE_MEM_WORKER_PORT": "39997" }\n' > "$dir/settings.json"
  assert "settings.json port honored (39997)" test "$(shown_port "$dir")" = "39997"

  printf '{\n  "pid": 99999,\n  "port": 39998\n}\n' > "$dir/worker.pid"
  assert "env beats pid file and settings (39996)" test "$(shown_port "$dir" 39996)" = "39996"

  rm -f "$dir/worker.pid" "$dir/settings.json"
  assert "uid default when no source ($((37700 + $(id -u) % 100)))" \
    test "$(shown_port "$dir")" = "$((37700 + $(id -u) % 100))"
}

# ── 运行器 ──────────────────────────────────────────────────────
run_all=true
for t in "$@"; do run_all=false; "test_$t"; done
if $run_all; then
  test_x001
  test_x002
  test_x003
fi

echo ""
echo "Result: $PASS passed, $FAIL failed"
exit "$((FAIL > 0 ? 1 : 0))"
