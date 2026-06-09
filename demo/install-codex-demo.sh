#!/usr/bin/env bash
set -euo pipefail

PLUGIN_NAME="codex-task-timer"
MARKETPLACE_NAME="codex-task-timer-local"
PLUGIN_KEY="${PLUGIN_NAME}@${MARKETPLACE_NAME}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SOURCE_DIR="${SCRIPT_DIR}/${PLUGIN_NAME}"
CODEX_DIR="${CODEX_HOME:-${HOME}/.codex}"
MARKETPLACE_DIR="${CODEX_DIR}/plugins/marketplaces/${MARKETPLACE_NAME}"
MARKETPLACE_JSON="${MARKETPLACE_DIR}/.agents/plugins/marketplace.json"
PLUGIN_MIRROR_DIR="${MARKETPLACE_DIR}/plugins/${PLUGIN_NAME}"
PYTHON_BIN="${PYTHON_BIN:-${HOME}/ins/miniconda/bin/python}"

log() {
  printf '[install-codex-demo] %s\n' "$1"
}

fail() {
  printf '[install-codex-demo] ERROR: %s\n' "$1" >&2
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

run_codex() {
  CODEX_HOME="${CODEX_DIR}" codex "$@"
}

preflight() {
  need_file "${SOURCE_DIR}/.codex-plugin/plugin.json"
  need_file "${SOURCE_DIR}/hooks/codex-hooks.json"
  need_file "${SOURCE_DIR}/hooks/codex-turn-timer.py"

  if [[ ! -x "${PYTHON_BIN}" ]]; then
    fail "未找到 Conda base Python：${PYTHON_BIN}，请设置 PYTHON_BIN"
  fi

  need_command codex
  need_command rsync

  "${PYTHON_BIN}" -m json.tool "${SOURCE_DIR}/.codex-plugin/plugin.json" >/dev/null
  "${PYTHON_BIN}" -m json.tool "${SOURCE_DIR}/hooks/codex-hooks.json" >/dev/null
}

write_marketplace_json() {
  mkdir -p "$(dirname "${MARKETPLACE_JSON}")"
  export MARKETPLACE_JSON MARKETPLACE_NAME PLUGIN_NAME
  "${PYTHON_BIN}" <<'PY'
import json
import os
import pathlib

marketplace_json = pathlib.Path(os.environ["MARKETPLACE_JSON"])
data = {
    "name": os.environ["MARKETPLACE_NAME"],
    "interface": {
        "displayName": "Codex Task Timer Local"
    },
    "plugins": [
        {
            "name": os.environ["PLUGIN_NAME"],
            "source": {
                "source": "local",
                "path": f"./plugins/{os.environ['PLUGIN_NAME']}"
            },
            "policy": {
                "installation": "AVAILABLE",
                "authentication": "ON_INSTALL"
            },
            "category": "Productivity"
        }
    ]
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
  chmod +x "${PLUGIN_MIRROR_DIR}/hooks/codex-turn-timer.py"
}

register_marketplace() {
  run_codex plugin marketplace add "${MARKETPLACE_DIR}" >/dev/null
  log "已注册 marketplace：${MARKETPLACE_NAME}"
}

install_plugin() {
  run_codex plugin remove "${PLUGIN_KEY}" >/dev/null 2>&1 || true
  run_codex plugin add "${PLUGIN_KEY}" >/dev/null
  log "已启用插件：${PLUGIN_KEY}"
}

show_status() {
  log "Codex 目录：${CODEX_DIR}"
  log "Marketplace：${MARKETPLACE_DIR}"
  log "插件 key：${PLUGIN_KEY}"
  if command -v codex >/dev/null 2>&1; then
    run_codex plugin list | grep -F "${PLUGIN_KEY}" || true
  fi
}

install_demo() {
  preflight
  log "创建 marketplace 目录：${MARKETPLACE_DIR}"
  mkdir -p "${MARKETPLACE_DIR}"
  write_marketplace_json
  mirror_plugin
  register_marketplace
  install_plugin
  log "安装完成。请重启交互式 Codex 会话，让 Hook 在新会话中加载。"
  log "任务耗时日志：${CODEX_DIR}/task-time/codex-task-time.jsonl"
}

case "${1:-install}" in
  install|-i|--install)
    install_demo
    ;;
  status|-s|--status)
    show_status
    ;;
  -h|--help|help)
    cat <<EOF
用法：
  ./install-codex-demo.sh              安装并启用 Codex 计时插件
  ./install-codex-demo.sh status       查看安装状态
  ./install-codex-demo.sh -h           显示帮助

环境变量：
  CODEX_HOME                           覆盖默认 Codex 配置目录
  PYTHON_BIN                           覆盖默认 Python：$HOME/ins/miniconda/bin/python
EOF
    ;;
  *)
    cat <<EOF
用法：
  ./install-codex-demo.sh              安装并启用 Codex 计时插件
  ./install-codex-demo.sh status       查看安装状态
  ./install-codex-demo.sh -h           显示帮助
EOF
    exit 2
    ;;
esac
