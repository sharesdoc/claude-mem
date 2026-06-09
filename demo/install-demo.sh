#!/usr/bin/env bash
set -euo pipefail

PLUGIN_NAME="claude-task-timer"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SOURCE_DIR="${SCRIPT_DIR}/${PLUGIN_NAME}"
CLAUDE_HOME="${CLAUDE_HOME:-${HOME}/.claude}"
INSTALL_DIR="${CLAUDE_HOME}/plugins/${PLUGIN_NAME}"
SETTINGS_FILE="${CLAUDE_HOME}/settings.json"
PYTHON_BIN="${PYTHON_BIN:-${HOME}/ins/miniconda/bin/python}"

log() {
  printf '[install-demo] %s\n' "$1"
}

fail() {
  printf '[install-demo] ERROR: %s\n' "$1" >&2
  exit 1
}

if [[ ! -d "${SOURCE_DIR}" ]]; then
  fail "插件源码目录不存在：${SOURCE_DIR}"
fi

if [[ ! -x "${PYTHON_BIN}" ]]; then
  fail "未找到 Conda base Python：${PYTHON_BIN}，请设置 PYTHON_BIN"
fi

log "创建 Claude Code 目录：${CLAUDE_HOME}"
mkdir -p "${CLAUDE_HOME}/plugins" "${CLAUDE_HOME}/task-time"

log "安装插件到：${INSTALL_DIR}"
rm -rf "${INSTALL_DIR}"
mkdir -p "${INSTALL_DIR}"
cp -R "${SOURCE_DIR}/." "${INSTALL_DIR}/"
chmod +x "${INSTALL_DIR}/hooks/claude-turn-timer.py"

log "校验插件 JSON 文件"
"${PYTHON_BIN}" -m json.tool "${INSTALL_DIR}/.claude-plugin/plugin.json" >/dev/null
"${PYTHON_BIN}" -m json.tool "${INSTALL_DIR}/hooks/hooks.json" >/dev/null

log "合并 Hook 配置到：${SETTINGS_FILE}"
export SETTINGS_FILE INSTALL_DIR PYTHON_BIN
"${PYTHON_BIN}" <<'PY'
import datetime
import json
import os
import pathlib
import shlex
import shutil

settings_file = pathlib.Path(os.environ["SETTINGS_FILE"])
install_dir = pathlib.Path(os.environ["INSTALL_DIR"])
python_bin = os.environ["PYTHON_BIN"]
hook_script = install_dir / "hooks" / "claude-turn-timer.py"

events = [
    "UserPromptSubmit",
    "Stop",
    "StopFailure",
    "SessionEnd",
    "Notification",
    "PermissionRequest",
    "PreToolUse",
    "PostToolUse",
    "PostToolUseFailure",
    "PostToolBatch",
    "SubagentStart",
    "SubagentStop",
]

command = f"{shlex.quote(python_bin)} {shlex.quote(str(hook_script))}"
entry = {"type": "command", "command": command, "timeout": 3}

settings_file.parent.mkdir(parents=True, exist_ok=True)
if settings_file.exists():
    with settings_file.open("r", encoding="utf-8") as handle:
        raw = handle.read().strip()
    settings = json.loads(raw) if raw else {}
    backup = settings_file.with_suffix(
        settings_file.suffix + "." + datetime.datetime.now().strftime("%Y%m%d%H%M%S") + ".bak"
    )
    shutil.copy2(settings_file, backup)
    print(f"[install-demo] 已备份现有 settings.json：{backup}")
else:
    settings = {}

hooks = settings.setdefault("hooks", {})
for event in events:
    groups = hooks.setdefault(event, [])
    if not groups:
        groups.append({"hooks": []})

    found = False
    for group in groups:
        hook_items = group.setdefault("hooks", [])
        for item in hook_items:
            if item.get("command", "").endswith("claude-task-timer/hooks/claude-turn-timer.py"):
                item.update(entry)
                found = True
                break
        if found:
            break

    if not found:
        groups[0].setdefault("hooks", []).append(dict(entry))

with settings_file.open("w", encoding="utf-8") as handle:
    json.dump(settings, handle, ensure_ascii=False, indent=2)
    handle.write("\n")
PY

log "安装完成。请完全重启 Claude Code，让 Hook 在新会话中加载。"
log "任务耗时日志：${CLAUDE_HOME}/task-time/claude-task-time.jsonl"
