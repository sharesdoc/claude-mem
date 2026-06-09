#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Claude Code hook that records wall-clock duration for each user task."""

from __future__ import annotations

import datetime
import fcntl
import hashlib
import json
import os
import pathlib
import re
import shlex
import sys
import time
import traceback
import uuid


BASE_DIR = pathlib.Path.home() / ".claude" / "task-time"
ACTIVE_DIR = BASE_DIR / "active"
LOG_FILE = BASE_DIR / "claude-task-time.jsonl"
ERROR_LOG_FILE = BASE_DIR / "claude-task-time-error.log"
LOCK_FILE = BASE_DIR / ".lock"

ORPHAN_AFTER_SECONDS = 24 * 60 * 60
START_EVENT = "UserPromptSubmit"

OBSERVE_EVENTS = {
    "Notification",
    "PermissionRequest",
    "PreToolUse",
    "PostToolUse",
    "PostToolUseFailure",
    "PostToolBatch",
    "SubagentStart",
    "SubagentStop",
    "TaskCreated",
    "TaskCompleted",
    "Elicitation",
    "ElicitationResult",
    "PreCompact",
    "PostCompact",
    "CwdChanged",
    "ConfigChange",
}


def now_ms() -> int:
    """Return the current Unix time in milliseconds."""
    return int(time.time() * 1000)


def iso_time(ms: int | None = None) -> str:
    """Convert a millisecond timestamp to local ISO time."""
    if ms is None:
        ms = now_ms()
    return datetime.datetime.fromtimestamp(ms / 1000).isoformat(timespec="seconds")


def format_duration(ms: int | None) -> str:
    """Format milliseconds as a compact duration such as 1m 26s."""
    if ms is None:
        return "unknown"

    total_seconds = max(0, round(ms / 1000))
    hours = total_seconds // 3600
    minutes = (total_seconds % 3600) // 60
    seconds = total_seconds % 60

    if hours > 0:
        return f"{hours}h {minutes:02d}m {seconds:02d}s"
    if minutes > 0:
        return f"{minutes}m {seconds:02d}s"
    return f"{seconds}s"


def ensure_dirs() -> None:
    """Create runtime directories used by the hook."""
    BASE_DIR.mkdir(parents=True, exist_ok=True)
    ACTIVE_DIR.mkdir(parents=True, exist_ok=True)


def session_key(session_id: str) -> str:
    """Return a filesystem-safe key for a Claude Code session id."""
    raw = session_id or "unknown-session"
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()[:32]


def active_file_for(session_id: str) -> pathlib.Path:
    """Return the active state file path for a session."""
    return ACTIVE_DIR / f"{session_key(session_id)}.json"


def read_stdin_json() -> dict:
    """Read the JSON payload passed by Claude Code on stdin."""
    try:
        return json.load(sys.stdin)
    except Exception:
        return {}


def atomic_write_json(path: pathlib.Path, data: dict) -> None:
    """Atomically write JSON so concurrent hook events never read partial data."""
    tmp_path = path.with_suffix(path.suffix + f".tmp.{os.getpid()}")
    tmp_path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    os.replace(tmp_path, path)


def read_json_file(path: pathlib.Path) -> dict | None:
    """Read a JSON file, returning None on missing or invalid content."""
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return None


def append_jsonl(path: pathlib.Path, record: dict) -> None:
    """Append one JSON object to a JSON Lines file."""
    with path.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(record, ensure_ascii=False) + "\n")


def append_error(message: str) -> None:
    """Persist hook errors without failing the Claude Code task."""
    try:
        ensure_dirs()
        with ERROR_LOG_FILE.open("a", encoding="utf-8") as handle:
            handle.write(f"{iso_time()}\n{message}\n\n")
    except Exception:
        pass


def shorten_text(value: object, limit: int = 300) -> str:
    """Keep log records bounded while preserving useful prompt context."""
    text = str(value or "").replace("\n", " ").strip()
    if len(text) > limit:
        return text[:limit] + "..."
    return text


def parse_redo_loop_max_iterations(prompt: object) -> int | None:
    """Return redo loop max iterations from a /redo:loop prompt, if present."""
    text = str(prompt or "").strip()
    if not text.startswith("/redo:loop"):
        return None

    try:
        parts = shlex.split(text)
    except ValueError:
        parts = text.split()

    for index, part in enumerate(parts):
        if part in {"-m", "--max", "--max-iterations"} and index + 1 < len(parts):
            if parts[index + 1].isdigit():
                return max(1, int(parts[index + 1]))

        match = re.fullmatch(r"(?:-m|--max|--max-iterations)=(\d+)", part)
        if match:
            return max(1, int(match.group(1)))

    return None


def build_base_record(state: dict, payload: dict, end_ms: int, status: str, precision: str) -> dict:
    """Build the JSONL record for a closed task."""
    start_ms = int(state.get("start_ms", end_ms))
    elapsed_ms = max(0, end_ms - start_ms)
    event_name = payload.get("hook_event_name", "")

    record = {
        "record_type": "claude_turn",
        "status": status,
        "elapsed_precision": precision,
        "turn_id": state.get("turn_id"),
        "session_id": state.get("session_id") or payload.get("session_id"),
        "cwd_start": state.get("cwd"),
        "cwd_end": payload.get("cwd", ""),
        "start_ms": start_ms,
        "start_time": iso_time(start_ms),
        "end_ms": end_ms,
        "end_time": iso_time(end_ms),
        "elapsed_ms": elapsed_ms,
        "elapsed_text": format_duration(elapsed_ms),
        "start_event": state.get("start_event", START_EVENT),
        "end_event": event_name,
        "last_seen_ms": state.get("last_seen_ms"),
        "last_seen_time": iso_time(int(state["last_seen_ms"])) if state.get("last_seen_ms") else None,
        "last_seen_event": state.get("last_seen_event"),
        "permission_prompt_count": int(state.get("permission_prompt_count", 0)),
        "notification_count": int(state.get("notification_count", 0)),
        "tool_event_count": int(state.get("tool_event_count", 0)),
        "transcript_path": state.get("transcript_path") or payload.get("transcript_path", ""),
        "prompt": shorten_text(state.get("prompt", "")),
    }

    if event_name == "StopFailure":
        record["error"] = payload.get("error", "")
        record["error_details"] = shorten_text(payload.get("error_details", ""), 500)
        record["last_assistant_message"] = shorten_text(payload.get("last_assistant_message", ""), 500)

    if event_name == "SessionEnd":
        record["session_end_reason"] = payload.get("reason", "")

    if event_name == "Stop":
        record["background_tasks_count"] = len(payload.get("background_tasks") or [])
        record["session_crons_count"] = len(payload.get("session_crons") or [])
        record["last_assistant_message"] = shorten_text(payload.get("last_assistant_message", ""), 500)

    if state.get("redo_loop"):
        record["redo_loop"] = True
        record["redo_stop_count"] = int(state.get("redo_stop_count", 0))
        record["redo_max_iterations"] = int(state.get("redo_max_iterations", 0))

    return record


def close_active_task(
    active_file: pathlib.Path,
    payload: dict,
    status: str,
    precision: str,
    end_ms: int | None = None,
) -> dict | None:
    """Close one active task and append its duration record."""
    state = read_json_file(active_file)
    if not state:
        return None

    if end_ms is None:
        end_ms = now_ms()

    record = build_base_record(state, payload, end_ms, status, precision)
    append_jsonl(LOG_FILE, record)

    try:
        active_file.unlink()
    except FileNotFoundError:
        pass

    return record


def recover_stale_active_if_needed(active_file: pathlib.Path, payload: dict, current_ms: int) -> None:
    """Recover a prior task that never produced an end event."""
    state = read_json_file(active_file)
    if not state:
        return

    start_ms = int(state.get("start_ms", current_ms))
    age_seconds = max(0, (current_ms - start_ms) // 1000)
    event_name = payload.get("hook_event_name", "")
    should_recover = event_name == START_EVENT or age_seconds >= ORPHAN_AFTER_SECONDS

    if not should_recover:
        return

    last_seen_ms = int(state.get("last_seen_ms") or start_ms)
    lower_bound_ms = max(0, last_seen_ms - start_ms)
    upper_bound_ms = max(0, current_ms - start_ms)

    record = {
        "record_type": "claude_turn",
        "status": "orphan_without_end_event",
        "elapsed_precision": "lower_bound",
        "turn_id": state.get("turn_id"),
        "session_id": state.get("session_id") or payload.get("session_id"),
        "cwd_start": state.get("cwd"),
        "cwd_end": payload.get("cwd", ""),
        "start_ms": start_ms,
        "start_time": iso_time(start_ms),
        "end_ms": last_seen_ms,
        "end_time": iso_time(last_seen_ms),
        "elapsed_ms": lower_bound_ms,
        "elapsed_text": format_duration(lower_bound_ms),
        "elapsed_lower_bound_ms": lower_bound_ms,
        "elapsed_lower_bound_text": format_duration(lower_bound_ms),
        "elapsed_upper_bound_ms": upper_bound_ms,
        "elapsed_upper_bound_text": format_duration(upper_bound_ms),
        "recovered_at_ms": current_ms,
        "recovered_at_time": iso_time(current_ms),
        "recover_reason": "new_prompt_arrived" if event_name == START_EVENT else "orphan_timeout",
        "start_event": state.get("start_event", START_EVENT),
        "end_event": None,
        "last_seen_ms": state.get("last_seen_ms"),
        "last_seen_time": iso_time(int(state["last_seen_ms"])) if state.get("last_seen_ms") else None,
        "last_seen_event": state.get("last_seen_event"),
        "permission_prompt_count": int(state.get("permission_prompt_count", 0)),
        "notification_count": int(state.get("notification_count", 0)),
        "tool_event_count": int(state.get("tool_event_count", 0)),
        "transcript_path": state.get("transcript_path", ""),
        "prompt": shorten_text(state.get("prompt", "")),
    }

    append_jsonl(LOG_FILE, record)

    try:
        active_file.unlink()
    except FileNotFoundError:
        pass


def start_task(active_file: pathlib.Path, payload: dict, current_ms: int) -> None:
    """Record the beginning of a new user task."""
    redo_max_iterations = parse_redo_loop_max_iterations(payload.get("prompt", ""))
    state = {
        "turn_id": str(uuid.uuid4()),
        "session_id": payload.get("session_id", "unknown"),
        "transcript_path": payload.get("transcript_path", ""),
        "cwd": payload.get("cwd", ""),
        "permission_mode": payload.get("permission_mode", ""),
        "prompt": payload.get("prompt", ""),
        "start_event": START_EVENT,
        "start_ms": current_ms,
        "start_time": iso_time(current_ms),
        "last_seen_ms": current_ms,
        "last_seen_time": iso_time(current_ms),
        "last_seen_event": START_EVENT,
        "permission_prompt_count": 0,
        "notification_count": 0,
        "tool_event_count": 0,
    }

    if redo_max_iterations is not None:
        state["redo_loop"] = True
        state["redo_max_iterations"] = redo_max_iterations
        state["redo_stop_count"] = 0

    atomic_write_json(active_file, state)


def observe_task(active_file: pathlib.Path, payload: dict, current_ms: int) -> None:
    """Update last_seen metadata for an active task."""
    state = read_json_file(active_file)
    if not state:
        return

    event_name = payload.get("hook_event_name", "")
    state["last_seen_ms"] = current_ms
    state["last_seen_time"] = iso_time(current_ms)
    state["last_seen_event"] = event_name

    if event_name == "Notification":
        state["notification_count"] = int(state.get("notification_count", 0)) + 1
        if payload.get("notification_type") == "permission_prompt":
            state["permission_prompt_count"] = int(state.get("permission_prompt_count", 0)) + 1

    if event_name in {"PreToolUse", "PostToolUse", "PostToolUseFailure", "PostToolBatch"}:
        state["tool_event_count"] = int(state.get("tool_event_count", 0)) + 1

    atomic_write_json(active_file, state)


def handle_stop_event(active_file: pathlib.Path, payload: dict, current_ms: int) -> dict | None:
    """Close normal tasks, but keep redo loop tasks open until the last iteration."""
    state = read_json_file(active_file)
    if not state:
        return None

    if state.get("redo_loop"):
        stop_count = int(state.get("redo_stop_count", 0)) + 1
        max_iterations = int(state.get("redo_max_iterations", 1))
        state["redo_stop_count"] = stop_count
        state["last_seen_ms"] = current_ms
        state["last_seen_time"] = iso_time(current_ms)
        state["last_seen_event"] = "Stop"
        state["last_assistant_message"] = shorten_text(payload.get("last_assistant_message", ""), 500)

        if stop_count < max_iterations:
            atomic_write_json(active_file, state)
            return None

        atomic_write_json(active_file, state)

    return close_active_task(active_file, payload, "completed", "exact", current_ms)


def handle_payload(payload: dict) -> dict | None:
    """Handle one Claude Code hook event."""
    ensure_dirs()

    event_name = payload.get("hook_event_name", "")
    session_id = payload.get("session_id", "unknown")
    current_ms = now_ms()
    active_file = active_file_for(session_id)

    recover_stale_active_if_needed(active_file, payload, current_ms)

    if event_name == START_EVENT:
        start_task(active_file, payload, current_ms)
        return None

    if event_name == "Stop":
        return handle_stop_event(active_file, payload, current_ms)

    if event_name == "StopFailure":
        return close_active_task(active_file, payload, "failed_api", "exact", current_ms)

    if event_name == "SessionEnd":
        return close_active_task(active_file, payload, "session_end_without_stop", "session_end", current_ms)

    if event_name in OBSERVE_EVENTS:
        observe_task(active_file, payload, current_ms)
        return None

    return None


def main() -> int:
    """Hook entrypoint. Always exits 0 so timing never blocks Claude Code."""
    payload = read_stdin_json()
    event_name = payload.get("hook_event_name", "")

    try:
        ensure_dirs()
        with LOCK_FILE.open("a+", encoding="utf-8") as lock:
            fcntl.flock(lock.fileno(), fcntl.LOCK_EX)
            record = handle_payload(payload)
            fcntl.flock(lock.fileno(), fcntl.LOCK_UN)

        if record and event_name == "Stop":
            print(
                json.dumps(
                    {
                        "systemMessage": f"Claude task time: {record.get('elapsed_text', 'unknown')}",
                        "suppressOutput": False,
                    },
                    ensure_ascii=False,
                )
            )

        return 0
    except Exception:
        append_error(traceback.format_exc())
        return 0


if __name__ == "__main__":
    raise SystemExit(main())
