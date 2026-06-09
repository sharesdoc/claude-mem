#!/usr/bin/env bash
set -euo pipefail

PLUGIN_NAME="codex-task-timer"
MARKETPLACE_NAME="codex-task-timer-local"
PLUGIN_KEY="${PLUGIN_NAME}@${MARKETPLACE_NAME}"

CODEX_DIR="${CODEX_HOME:-${HOME}/.codex}"
MARKETPLACE_DIR="${CODEX_DIR}/plugins/marketplaces/${MARKETPLACE_NAME}"
TASK_TIME_DIR="${CODEX_DIR}/task-time"

log() {
  printf '[uninstall-codex-demo] %s\n' "$1"
}

warn() {
  printf '[uninstall-codex-demo] WARN: %s\n' "$1" >&2
}

fail() {
  printf '[uninstall-codex-demo] ERROR: %s\n' "$1" >&2
  exit 1
}

need_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    fail "未找到命令：$1"
  fi
}

run_codex() {
  CODEX_HOME="${CODEX_DIR}" codex "$@"
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

uninstall_plugin() {
  need_command codex
  log "卸载插件：${PLUGIN_KEY}"
  run_codex plugin remove "${PLUGIN_KEY}" >/dev/null 2>&1 || true
  log "移除 marketplace：${MARKETPLACE_NAME}"
  run_codex plugin marketplace remove "${MARKETPLACE_NAME}" >/dev/null 2>&1 || true
  safe_rm_dir "${MARKETPLACE_DIR}"
  log "卸载完成。请重启交互式 Codex 会话。"
  log "已保留耗时日志：${TASK_TIME_DIR}"
}

show_status() {
  log "Codex 目录：${CODEX_DIR}"
  log "插件 key：${PLUGIN_KEY}"
  if command -v codex >/dev/null 2>&1; then
    run_codex plugin list | grep -F "${PLUGIN_KEY}" || true
    run_codex plugin marketplace list | grep -F "${MARKETPLACE_NAME}" || true
  else
    warn "codex CLI 不在 PATH"
  fi
  [[ -d "${MARKETPLACE_DIR}" ]] && log "marketplace 目录存在：${MARKETPLACE_DIR}"
  [[ -d "${TASK_TIME_DIR}" ]] && log "日志目录存在：${TASK_TIME_DIR}"
}

show_help() {
  cat <<EOF
用法：
  ./uninstall-codex-demo.sh                 显示帮助
  ./uninstall-codex-demo.sh -u              卸载 codex-task-timer，保留耗时日志
  ./uninstall-codex-demo.sh --purge-logs    卸载并删除 ${TASK_TIME_DIR}
  ./uninstall-codex-demo.sh status          查看安装状态
  ./uninstall-codex-demo.sh -h|--help       显示帮助

环境变量：
  CODEX_HOME                                覆盖默认 Codex 配置目录
EOF
}

case "${1:-help}" in
  uninstall|-u|--uninstall)
    uninstall_plugin
    ;;
  --purge-logs)
    uninstall_plugin
    safe_rm_dir "${TASK_TIME_DIR}"
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
