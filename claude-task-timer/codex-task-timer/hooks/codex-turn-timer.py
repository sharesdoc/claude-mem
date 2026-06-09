#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Codex hook that records wall-clock duration for each interactive task."""

from __future__ import annotations

import datetime
import fcntl
import hashlib
import json
import os
import pathlib
import sys
import time
import traceback
import uuid


CODEX_HOME = pathlib.Path(os.environ.get("CODEX_HOME", str(pathlib.Path.home() / ".codex"))).expanduser()
BASE_DIR = CODEX_HOME / "task-time"
ACTIVE_DIR = BASE_DIR / "active"
LOG_FILE = BASE_DIR / "codex-task-time.jsonl"
ERROR_LOG_FILE = BASE_DIR / "codex-task-time-error.log"
LOCK_FILE = BASE_DIR / ".lock"

START_EVENT = "UserPromptSubmit"
OBSERVE_EVENTS = {"PostToolUse"}
ORPHAN_AFTER_SECONDS = 24 * 60 * 60


def now_ms() -> int:
    return int(time.time() * 1000)


def iso_time(ms: int | None = None) -> str:
    if ms is None:
        ms = now_ms()
    return datetime.datetime.fromtimestamp(ms / 1000).isoformat(timespec="seconds")


def format_duration(ms: int | None) -> str:
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
    BASE_DIR.mkdir(parents=True, exist_ok=True)
    ACTIVE_DIR.mkdir(parents=True, exist_ok=True)


def read_stdin_json() -> dict:
    try:
        return json.load(sys.stdin)
    except Exception:
        return {}


def append_jsonl(path: pathlib.Path, record: dict) -> None:
    with path.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(record, ensure_ascii=False) + "\n")


def append_error(message: str) -> None:
    try:
        ensure_dirs()
        with ERROR_LOG_FILE.open("a", encoding="utf-8") as handle:
            handle.write(f"{iso_time()}\n{message}\n\n")
    except Exception:
        pass


def atomic_write_json(path: pathlib.Path, data: dict) -> None:
    tmp_path = path.with_suffix(path.suffix + f".tmp.{os.getpid()}")
    tmp_path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    os.replace(tmp_path, path)


def read_json_file(path: pathlib.Path) -> dict | None:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return None


def shorten_text(value: object, limit: int = 500) -> str:
    text = str(value or "").replace("\n", " ").strip()
    if len(text) > limit:
        return text[:limit] + "..."
    return text


def pick_first(payload: dict, keys: tuple[str, ...], default: object = "") -> object:
    for key in keys:
        value = payload.get(key)
        if value not in (None, ""):
            return value
    return default


def event_name(payload: dict) -> str:
    return str(pick_first(payload, ("hook_event_name", "event_name", "event", "type"), ""))


def session_id_from(payload: dict) -> str:
    return str(
        pick_first(
            payload,
            ("session_id", "conversation_id", "sessionId", "conversationId", "codex_session_id"),
            "unknown-session",
        )
    )


def turn_id_from(payload: dict) -> str:
    return str(pick_first(payload, ("turn_id", "turnId", "task_id", "taskId"), "")) or str(uuid.uuid4())


def prompt_from(payload: dict) -> str:
    prompt = pick_first(payload, ("prompt", "message", "user_message", "userMessage", "user_prompt", "userPrompt"), "")
    if isinstance(prompt, dict):
        prompt = prompt.get("text") or prompt.get("content") or json.dumps(prompt, ensure_ascii=False)
    return shorten_text(prompt, 1000)


def transcript_path_from(payload: dict) -> str:
    return str(pick_first(payload, ("transcript_path", "transcriptPath", "session_path", "sessionPath"), ""))


def active_file_for(payload: dict) -> pathlib.Path:
    session_id = session_id_from(payload)
    raw = session_id
    if session_id == "unknown-session":
        raw = transcript_path_from(payload) or str(pick_first(payload, ("cwd",), "")) or raw
    key = hashlib.sha256(raw.encode("utf-8")).hexdigest()[:32]
    return ACTIVE_DIR / f"{key}.json"


def active_file_for_event(payload: dict) -> pathlib.Path:
    """Pick the active file for this hook event, with a single-task fallback."""
    active_file = active_file_for(payload)
    if active_file.exists() or event_name(payload) == START_EVENT:
        return active_file

    if session_id_from(payload) != "unknown-session" or transcript_path_from(payload):
        return active_file

    active_files = sorted(ACTIVE_DIR.glob("*.json"), key=lambda item: item.stat().st_mtime, reverse=True)
    if len(active_files) == 1:
        return active_files[0]

    return active_file


def recover_stale_active_if_needed(active_file: pathlib.Path, payload: dict, current_ms: int) -> None:
    state = read_json_file(active_file)
    if not state:
        return

    start_ms = int(state.get("start_ms", current_ms))
    age_seconds = max(0, (current_ms - start_ms) // 1000)
    should_recover = event_name(payload) == START_EVENT or age_seconds >= ORPHAN_AFTER_SECONDS
    if not should_recover:
        return

    last_seen_ms = int(state.get("last_seen_ms") or start_ms)
    lower_bound_ms = max(0, last_seen_ms - start_ms)
    upper_bound_ms = max(0, current_ms - start_ms)
    record = {
        "record_type": "codex_turn",
        "status": "orphan_without_stop",
        "elapsed_precision": "lower_bound",
        "turn_id": state.get("turn_id"),
        "session_id": state.get("session_id"),
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
        "recover_reason": "new_prompt_arrived" if event_name(payload) == START_EVENT else "orphan_timeout",
        "start_event": state.get("start_event", START_EVENT),
        "end_event": None,
        "last_seen_ms": state.get("last_seen_ms"),
        "last_seen_time": iso_time(int(state["last_seen_ms"])) if state.get("last_seen_ms") else None,
        "last_seen_event": state.get("last_seen_event"),
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
    state = {
        "turn_id": turn_id_from(payload),
        "session_id": session_id_from(payload),
        "transcript_path": transcript_path_from(payload),
        "cwd": payload.get("cwd", ""),
        "prompt": prompt_from(payload),
        "start_event": START_EVENT,
        "start_ms": current_ms,
        "start_time": iso_time(current_ms),
        "last_seen_ms": current_ms,
        "last_seen_time": iso_time(current_ms),
        "last_seen_event": START_EVENT,
        "tool_event_count": 0,
    }
    atomic_write_json(active_file, state)


def observe_task(active_file: pathlib.Path, payload: dict, current_ms: int) -> None:
    state = read_json_file(active_file)
    if not state:
        return
    state["last_seen_ms"] = current_ms
    state["last_seen_time"] = iso_time(current_ms)
    state["last_seen_event"] = event_name(payload)
    state["tool_event_count"] = int(state.get("tool_event_count", 0)) + 1
    atomic_write_json(active_file, state)


def close_task(active_file: pathlib.Path, payload: dict, current_ms: int) -> dict | None:
    state = read_json_file(active_file)
    if not state:
        return None

    start_ms = int(state.get("start_ms", current_ms))
    elapsed_ms = max(0, current_ms - start_ms)
    codex_duration_ms = payload.get("duration_ms")
    try:
        codex_duration_ms = int(codex_duration_ms) if codex_duration_ms is not None else None
    except (TypeError, ValueError):
        codex_duration_ms = None

    record = {
        "record_type": "codex_turn",
        "status": "completed",
        "elapsed_precision": "exact",
        "turn_id": state.get("turn_id"),
        "session_id": state.get("session_id") or session_id_from(payload),
        "cwd_start": state.get("cwd"),
        "cwd_end": payload.get("cwd", ""),
        "start_ms": start_ms,
        "start_time": iso_time(start_ms),
        "end_ms": current_ms,
        "end_time": iso_time(current_ms),
        "elapsed_ms": elapsed_ms,
        "elapsed_text": format_duration(elapsed_ms),
        "codex_duration_ms": codex_duration_ms,
        "codex_duration_text": format_duration(codex_duration_ms),
        "start_event": state.get("start_event", START_EVENT),
        "end_event": event_name(payload) or "Stop",
        "last_seen_ms": current_ms,
        "last_seen_time": iso_time(current_ms),
        "last_seen_event": event_name(payload) or "Stop",
        "tool_event_count": int(state.get("tool_event_count", 0)),
        "transcript_path": state.get("transcript_path") or transcript_path_from(payload),
        "prompt": shorten_text(state.get("prompt", "")),
        "last_agent_message": shorten_text(
            pick_first(payload, ("last_agent_message", "last_assistant_message", "message"), ""), 1000
        ),
    }
    append_jsonl(LOG_FILE, record)
    try:
        active_file.unlink()
    except FileNotFoundError:
        pass
    return record


def handle_payload(payload: dict) -> dict | None:
    ensure_dirs()
    current_ms = now_ms()
    active_file = active_file_for_event(payload)
    name = event_name(payload)

    recover_stale_active_if_needed(active_file, payload, current_ms)

    if name == START_EVENT:
        start_task(active_file, payload, current_ms)
        return None
    if name == "Stop":
        return close_task(active_file, payload, current_ms)
    if name in OBSERVE_EVENTS:
        observe_task(active_file, payload, current_ms)
        return None
    return None


def main() -> int:
    payload = read_stdin_json()
    try:
        ensure_dirs()
        with LOCK_FILE.open("a+", encoding="utf-8") as lock:
            fcntl.flock(lock.fileno(), fcntl.LOCK_EX)
            handle_payload(payload)
            fcntl.flock(lock.fileno(), fcntl.LOCK_UN)
        return 0
    except Exception:
        append_error(traceback.format_exc())
        return 0


if __name__ == "__main__":
    raise SystemExit(main())
