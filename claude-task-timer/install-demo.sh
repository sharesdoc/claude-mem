#!/usr/bin/env bash
set -euo pipefail

PLUGIN_NAME="claude-task-timer"
MARKETPLACE_NAME="claude-task-timer-local"
PLUGIN_KEY="${PLUGIN_NAME}@${MARKETPLACE_NAME}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SOURCE_DIR="${SCRIPT_DIR}/${PLUGIN_NAME}"
CLAUDE_DIR="${CLAUDE_CONFIG_DIR:-${CLAUDE_HOME:-${HOME}/.claude}}"
MARKETPLACE_DIR="${CLAUDE_DIR}/plugins/marketplaces/${MARKETPLACE_NAME}"
MARKETPLACE_JSON="${MARKETPLACE_DIR}/.claude-plugin/marketplace.json"
PLUGIN_MIRROR_DIR="${MARKETPLACE_DIR}/plugin"
LEGACY_INSTALL_DIR="${CLAUDE_DIR}/plugins/${PLUGIN_NAME}"
SETTINGS_FILE="${CLAUDE_DIR}/settings.json"
PYTHON_BIN="${PYTHON_BIN:-${HOME}/ins/miniconda/bin/python}"

log() {
  printf '[install-demo] %s\n' "$1"
}

fail() {
  printf '[install-demo] ERROR: %s\n' "$1" >&2
  exit 1
}

need_file() {
  if [[ ! -e "$1" ]]; then
    fail "缺少必要文件：$1"
  fi
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

preflight() {
  need_file "${SOURCE_DIR}/.claude-plugin/plugin.json"
  need_file "${SOURCE_DIR}/hooks/hooks.json"
  need_file "${SOURCE_DIR}/hooks/claude-turn-timer.py"

  if [[ ! -x "${PYTHON_BIN}" ]]; then
    fail "未找到 Conda base Python：${PYTHON_BIN}，请设置 PYTHON_BIN"
  fi

  need_command claude
  need_command rsync

  "${PYTHON_BIN}" -m json.tool "${SOURCE_DIR}/.claude-plugin/plugin.json" >/dev/null
  "${PYTHON_BIN}" -m json.tool "${SOURCE_DIR}/hooks/hooks.json" >/dev/null
}

write_marketplace_json() {
  mkdir -p "$(dirname "${MARKETPLACE_JSON}")"
  export MARKETPLACE_JSON MARKETPLACE_NAME PLUGIN_NAME SOURCE_DIR
  "${PYTHON_BIN}" <<'PY'
import json
import os
import pathlib

marketplace_json = pathlib.Path(os.environ["MARKETPLACE_JSON"])
data = {
    "name": os.environ["MARKETPLACE_NAME"],
    "owner": {"name": "Johnson"},
    "metadata": {
        "description": "Local marketplace for claude-task-timer demo plugin",
        "homepage": os.environ["SOURCE_DIR"],
    },
    "plugins": [
        {
            "name": os.environ["PLUGIN_NAME"],
            "version": "0.1.0",
            "source": "./plugin",
            "description": "Record wall-clock processing time for each Claude Code user task.",
        }
    ],
}
marketplace_json.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
PY
}

mirror_plugin() {
  rm -rf "${PLUGIN_MIRROR_DIR}"
  mkdir -p "${PLUGIN_MIRROR_DIR}"
  rsync -a --delete \
    --exclude='.git' \
    --exclude='node_modules' \
    --exclude='__pycache__' \
    --exclude='*.pyc' \
    --exclude='.DS_Store' \
    "${SOURCE_DIR}/" "${PLUGIN_MIRROR_DIR}/"
  chmod +x "${PLUGIN_MIRROR_DIR}/hooks/claude-turn-timer.py"
}

remove_legacy_settings_hooks() {
  if [[ ! -f "${SETTINGS_FILE}" ]]; then
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
print(f"[install-demo] 已清理旧版手动 Hook，并备份 settings.json：{backup}")
PY
}

register_marketplace() {
  run_claude plugin marketplace add "${MARKETPLACE_DIR}" >/dev/null
  log "已注册 marketplace：${MARKETPLACE_NAME}"
}

install_plugin() {
  run_claude plugin uninstall "${PLUGIN_KEY}" >/dev/null 2>&1 || true
  run_claude plugin install "${PLUGIN_KEY}" >/dev/null
  log "已启用插件：${PLUGIN_KEY}"
}

validate_with_claude() {
  run_claude plugin validate "${PLUGIN_MIRROR_DIR}" >/dev/null
  run_claude plugin validate "${MARKETPLACE_DIR}" >/dev/null
  log "Claude Code 插件校验通过"
}

cleanup_legacy_dir() {
  if [[ -d "${LEGACY_INSTALL_DIR}" ]]; then
    rm -rf "${LEGACY_INSTALL_DIR}"
    log "已删除旧版直接安装目录：${LEGACY_INSTALL_DIR}"
  fi
}

show_status() {
  log "Claude 目录：${CLAUDE_DIR}"
  log "Marketplace：${MARKETPLACE_DIR}"
  log "插件 key：${PLUGIN_KEY}"
  if [[ -f "${MARKETPLACE_JSON}" ]]; then
    log "marketplace.json：存在"
  else
    log "marketplace.json：缺失"
  fi
  if command -v claude >/dev/null 2>&1; then
    run_claude plugin list | grep -F "${PLUGIN_KEY}" || true
  fi
}

install_demo() {
  preflight
  log "创建 marketplace 目录：${MARKETPLACE_DIR}"
  mkdir -p "${MARKETPLACE_DIR}"
  write_marketplace_json
  mirror_plugin
  cleanup_legacy_dir
  remove_legacy_settings_hooks
  validate_with_claude
  register_marketplace
  install_plugin
  log "安装完成。请执行 /reload-plugins 或完全重启 Claude Code。"
  log "任务耗时日志：${CLAUDE_DIR}/task-time/claude-task-time.jsonl"
}

case "${1:-install}" in
  install|-i|--install)
    install_demo
    ;;
  status|-s|--status)
    show_status
    ;;
  *)
    cat <<EOF
用法：
  ./install-demo.sh              安装并启用插件
  ./install-demo.sh status       查看安装状态

环境变量：
  CLAUDE_CONFIG_DIR              覆盖默认 Claude Code 配置目录
  PYTHON_BIN                     覆盖默认 Python：$HOME/ins/miniconda/bin/python
EOF
    ;;
esac
