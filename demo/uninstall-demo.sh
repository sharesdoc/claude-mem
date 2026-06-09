#!/usr/bin/env bash
set -euo pipefail

PLUGIN_NAME="claude-task-timer"
MARKETPLACE_NAME="claude-task-timer-local"
PLUGIN_KEY="${PLUGIN_NAME}@${MARKETPLACE_NAME}"

CLAUDE_DIR="${CLAUDE_CONFIG_DIR:-${CLAUDE_HOME:-${HOME}/.claude}}"
MARKETPLACE_DIR="${CLAUDE_DIR}/plugins/marketplaces/${MARKETPLACE_NAME}"
LEGACY_INSTALL_DIR="${CLAUDE_DIR}/plugins/${PLUGIN_NAME}"
SETTINGS_FILE="${CLAUDE_DIR}/settings.json"
TASK_TIME_DIR="${CLAUDE_DIR}/task-time"
PYTHON_BIN="${PYTHON_BIN:-${HOME}/ins/miniconda/bin/python}"

log() {
  printf '[uninstall-demo] %s\n' "$1"
}

warn() {
  printf '[uninstall-demo] WARN: %s\n' "$1" >&2
}

fail() {
  printf '[uninstall-demo] ERROR: %s\n' "$1" >&2
  exit 1
}

need_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    fail "未找到命令：$1"
  fi
}

run_claude() {
  if [[ -n "${CLAUDE_CONFIG_DIR:-}" ]]; then
    CLAUDE_CONFIG_DIR="${CLAUDE_DIR}" claude "$@"
  else
    claude "$@"
  fi
}

safe_rm_dir() {
  local target="$1"
  if [[ -z "${target}" || "${target}" == "/" || "${target}" == "${HOME}" ]]; then
    fail "拒绝删除危险目录：${target}"
  fi
  if [[ -d "${target}" ]]; then
    rm -rf "${target}"
    log "已删除目录：${target}"
  fi
}

remove_legacy_settings_hooks() {
  if [[ ! -f "${SETTINGS_FILE}" ]]; then
    return 0
  fi

  if [[ ! -x "${PYTHON_BIN}" ]]; then
    warn "未找到 Python：${PYTHON_BIN}，跳过 settings.json 旧 Hook 清理"
    return 0
  fi

  export SETTINGS_FILE
  "${PYTHON_BIN}" <<'PY'
import datetime
import json
import os
import pathlib
import shutil

settings_file = pathlib.Path(os.environ["SETTINGS_FILE"])
raw = settings_file.read_text(encoding="utf-8").strip()
if not raw:
    raise SystemExit(0)

settings = json.loads(raw)
hooks = settings.get("hooks")
if not isinstance(hooks, dict):
    raise SystemExit(0)

changed = False
for event, groups in list(hooks.items()):
    if not isinstance(groups, list):
        continue
    for group in groups:
        if not isinstance(group, dict):
            continue
        items = group.get("hooks")
        if not isinstance(items, list):
            continue
        kept = [
            item
            for item in items
            if "claude-task-timer/hooks/claude-turn-timer.py" not in str(item.get("command", ""))
        ]
        if len(kept) != len(items):
            group["hooks"] = kept
            changed = True
    hooks[event] = [
        group
        for group in groups
        if not isinstance(group, dict) or group.get("hooks") or group.get("matcher")
    ]
    if not hooks[event]:
        del hooks[event]

if not changed:
    raise SystemExit(0)

backup = settings_file.with_suffix(
    settings_file.suffix + "." + datetime.datetime.now().strftime("%Y%m%d%H%M%S") + ".bak"
)
shutil.copy2(settings_file, backup)
settings_file.write_text(json.dumps(settings, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(f"[uninstall-demo] 已清理旧版手动 Hook，并备份 settings.json：{backup}")
PY
}

uninstall_plugin() {
  need_command claude

  log "卸载插件：${PLUGIN_KEY}"
  run_claude plugin uninstall "${PLUGIN_KEY}" >/dev/null 2>&1 || true

  log "移除 marketplace：${MARKETPLACE_NAME}"
  run_claude plugin marketplace remove "${MARKETPLACE_NAME}" >/dev/null 2>&1 || true

  safe_rm_dir "${MARKETPLACE_DIR}"
  safe_rm_dir "${LEGACY_INSTALL_DIR}"
  remove_legacy_settings_hooks

  log "卸载完成。请执行 /reload-plugins 或完全重启 Claude Code。"
  log "已保留耗时日志：${TASK_TIME_DIR}"
}

purge_logs() {
  safe_rm_dir "${TASK_TIME_DIR}"
}

show_status() {
  log "Claude 目录：${CLAUDE_DIR}"
  log "插件 key：${PLUGIN_KEY}"
  if command -v claude >/dev/null 2>&1; then
    run_claude plugin list | grep -F "${PLUGIN_KEY}" || true
    run_claude plugin marketplace list | grep -F "${MARKETPLACE_NAME}" || true
  else
    warn "claude CLI 不在 PATH"
  fi
  [[ -d "${MARKETPLACE_DIR}" ]] && log "marketplace 目录存在：${MARKETPLACE_DIR}"
  [[ -d "${LEGACY_INSTALL_DIR}" ]] && log "旧版直接安装目录存在：${LEGACY_INSTALL_DIR}"
  [[ -d "${TASK_TIME_DIR}" ]] && log "日志目录存在：${TASK_TIME_DIR}"
}

show_help() {
  cat <<EOF
用法：
  ./uninstall-demo.sh                 卸载 claude-task-timer，保留耗时日志
  ./uninstall-demo.sh --purge-logs    卸载并删除 ${TASK_TIME_DIR}
  ./uninstall-demo.sh status          查看安装状态
  ./uninstall-demo.sh -h|--help       显示帮助

环境变量：
  CLAUDE_CONFIG_DIR                   覆盖默认 Claude Code 配置目录
  PYTHON_BIN                          覆盖默认 Python：$HOME/ins/miniconda/bin/python
EOF
}

case "${1:-uninstall}" in
  uninstall|-u|--uninstall)
    uninstall_plugin
    ;;
  --purge-logs)
    uninstall_plugin
    purge_logs
    ;;
  status|-s|--status)
    show_status
    ;;
  -h|--help|help)
    show_help
    ;;
  *)
    show_help
    exit 2
    ;;
esac
