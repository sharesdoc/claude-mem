[ChatGPT](https://chatgpt.com/)





发送提示词/任务给claude code，claude code接受任务后，进行处理，处理完毕后，一般会打印类似这么一句话：✻ Brewed for 1m 26s 有没有技术方法可以获得 claude code处理任务的这个时间



可以获得。比较稳的做法不是依赖那句文案本身，而是在外层包一层脚本计时；如果必须拿 Claude Code 自己打印的 `Brewed for ...`，再从终端输出中解析。

核心分两类：自动化调用用 `claude -p` 外层计时；交互式会话用 Hook 或 status line 读取 Claude Code 暴露的时长字段。官方文档里 status line 已提供 `cost.total_duration_ms` 和 `cost.total_api_duration_ms`。

Thought for 57s

可以。**最稳的技术方案是：不要抓 `✻ Brewed for ...` 这句文案，而是自己计时。**

Claude Code 官方支持 `claude -p` 非交互模式，并支持 `--output-format`；交互式会话里，Hook 的 `UserPromptSubmit` 会在用户提交任务、Claude 处理前触发，`Stop` 会在主 Agent 完成响应后触发；status line 也直接暴露了 `cost.total_duration_ms` 和 `cost.total_api_duration_ms`。  

## 方案一：自动化任务，外层包一层计时

适合这种用法：

```
claude -p "帮我修复这个项目里的登录问题"
```

可以写一个 `claude-time` 脚本：

```
#!/usr/bin/env bash
set -euo pipefail

# 用法：
#   claude-time "你的任务"
#   claude-time --model sonnet "你的任务"

CLAUDE_BIN="${CLAUDE_BIN:-claude}"

if [ "$#" -lt 1 ]; then
  echo "用法: claude-time [claude参数...] \"任务内容\"" >&2
  exit 1
fi

start_ms="$(python3 -c 'import time; print(int(time.time() * 1000))')"

set +e
"$CLAUDE_BIN" -p "$@"
exit_code="$?"
set -e

end_ms="$(python3 -c 'import time; print(int(time.time() * 1000))')"
elapsed_ms=$((end_ms - start_ms))
elapsed_sec=$((elapsed_ms / 1000))
mins=$((elapsed_sec / 60))
secs=$((elapsed_sec % 60))

echo
printf '✻ Measured for %dm %02ds\n' "$mins" "$secs"

exit "$exit_code"
```

这测的是**从启动 Claude Code 到任务结束的端到端耗时**，通常比解析 `Brewed for` 更可靠。

## 方案二：交互式 Claude Code，每次任务自动记录耗时

适合你在 Claude Code 里连续发任务，希望每一轮都记录耗时。

保存为：

```
~/.claude/hooks/claude-turn-timer.py
```

完整代码：

```
#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import datetime
import hashlib
import json
import os
import pathlib
import sys
import time


def format_seconds(seconds: float) -> str:
    """格式化耗时，例如 86 秒 -> 1m 26s"""
    total = int(round(seconds))
    mins = total // 60
    secs = total % 60
    return f"{mins}m {secs:02d}s"


def safe_key(session_id: str) -> str:
    """根据 session_id 生成安全文件名"""
    raw = session_id or "unknown-session"
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()[:32]


def main() -> int:
    try:
        payload = json.load(sys.stdin)
    except Exception as exc:
        print(f"[claude-turn-timer] 读取 Hook JSON 失败: {exc}", file=sys.stderr)
        return 0

    event = payload.get("hook_event_name", "")
    session_id = payload.get("session_id", "unknown")
    cwd = payload.get("cwd", "")
    transcript_path = payload.get("transcript_path", "")
    prompt = payload.get("prompt", "")

    base_dir = pathlib.Path.home() / ".claude" / "task-time"
    base_dir.mkdir(parents=True, exist_ok=True)

    state_file = base_dir / f"{safe_key(session_id)}.json"
    log_file = base_dir / "claude-task-time.log"

    now = time.time()

    if event == "UserPromptSubmit":
        state = {
            "session_id": session_id,
            "cwd": cwd,
            "transcript_path": transcript_path,
            "prompt": prompt,
            "start_ts": now,
            "start_time": datetime.datetime.now().isoformat(timespec="seconds"),
        }
        state_file.write_text(
            json.dumps(state, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        return 0

    if event in ("Stop", "StopFailure"):
        if not state_file.exists():
            return 0

        try:
            state = json.loads(state_file.read_text(encoding="utf-8"))
        except Exception:
            return 0

        elapsed = now - float(state.get("start_ts", now))
        elapsed_text = format_seconds(elapsed)

        prompt_text = state.get("prompt", "").replace("\n", " ").strip()
        if len(prompt_text) > 120:
            prompt_text = prompt_text[:120] + "..."

        line = (
            f"{datetime.datetime.now().isoformat(timespec='seconds')}\t"
            f"event={event}\t"
            f"elapsed={elapsed_text}\t"
            f"seconds={elapsed:.3f}\t"
            f"session_id={session_id}\t"
            f"cwd={cwd}\t"
            f"prompt={prompt_text}\n"
        )

        with log_file.open("a", encoding="utf-8") as f:
            f.write(line)

        try:
            state_file.unlink()
        except Exception:
            pass

        print(f"✻ Claude task time: {elapsed_text}", file=sys.stderr)
        return 0

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
```

然后在 `~/.claude/settings.json` 里加入 Hook 配置：

```
{
  "hooks": {
    "UserPromptSubmit": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "python3 ~/.claude/hooks/claude-turn-timer.py"
          }
        ]
      }
    ],
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "python3 ~/.claude/hooks/claude-turn-timer.py"
          }
        ]
      }
    ],
    "StopFailure": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "python3 ~/.claude/hooks/claude-turn-timer.py"
          }
        ]
      }
    ]
  }
}
```

记录文件位置：

```
~/.claude/task-time/claude-task-time.log
```

## 方案三：只想实时看当前会话累计耗时

可以用 Claude Code 的 status line。它的输入 JSON 里已经有：

```
cost.total_duration_ms
cost.total_api_duration_ms
```

其中：

```
cost.total_duration_ms      当前会话总耗时
cost.total_api_duration_ms  等待 API 响应的耗时
```

这个适合显示**当前 session 累计时间**，不适合精确统计“每一条任务”的耗时。

结论：
你要的是“每次发送任务到 Claude Code，Claude 处理完成用了多久”，优先用 **方案二 Hook**。如果你是脚本自动调用 `claude -p`，用 **方案一外层计时** 最简单。



我想得到每个任务执行的时间，你确定 ~/.claude/hooks/claude-turn-timer.py 的逻辑是可行的？



Thought for 29s

确定：**用 `UserPromptSubmit` 记录开始时间，用 `Stop` / `StopFailure` 记录结束时间，这个逻辑是可行的**。但要说明两点：

1. 它统计的是**每次用户提交 prompt 到 Claude 主 Agent 停止响应的墙钟时间**。
2. 它不一定等于 `✻ Brewed for 1m 26s` 的内部口径；如果中途有权限确认、等待你输入、后台任务、子 Agent，它会把这些等待时间也算进去。

Claude Code 官方文档明确说明：`UserPromptSubmit` 在用户提交 prompt 后、Claude 处理前触发；`Stop` 在主 Agent 完成响应后触发；Hook 会通过 stdin 收到 JSON，其中包含 `session_id`、`transcript_path`、`cwd`、`hook_event_name` 等字段。

我上一次给你的脚本**思路可行，但实现不够严谨**，主要问题是：不要依赖 `stderr` 显示结果；Claude Code 官方建议通过 JSON 输出里的 `systemMessage` 给用户显示信息，Hook 进程也不能直接控制终端。

下面是更稳的版本。

## `~/.claude/hooks/claude-turn-timer.py`

```
#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import datetime
import hashlib
import json
import pathlib
import sys
import time


def now_ms() -> int:
    """返回当前毫秒时间戳"""
    return int(time.time() * 1000)


def format_duration(ms: int) -> str:
    """把毫秒格式化为 1m 26s 这种形式"""
    total_seconds = max(0, round(ms / 1000))
    minutes = total_seconds // 60
    seconds = total_seconds % 60

    if minutes > 0:
        return f"{minutes}m {seconds:02d}s"

    return f"{seconds}s"


def make_key(session_id: str) -> str:
    """根据 session_id 生成安全文件名"""
    value = session_id or "unknown-session"
    return hashlib.sha256(value.encode("utf-8")).hexdigest()[:32]


def read_stdin_json() -> dict:
    """读取 Claude Code 传入的 Hook JSON"""
    try:
        return json.load(sys.stdin)
    except Exception:
        return {}


def append_log(log_file: pathlib.Path, record: dict) -> None:
    """追加 JSONL 日志"""
    with log_file.open("a", encoding="utf-8") as f:
        f.write(json.dumps(record, ensure_ascii=False) + "\n")


def main() -> int:
    payload = read_stdin_json()

    event_name = payload.get("hook_event_name", "")
    session_id = payload.get("session_id", "unknown")
    cwd = payload.get("cwd", "")
    transcript_path = payload.get("transcript_path", "")
    prompt = payload.get("prompt", "")
    current_ms = now_ms()

    base_dir = pathlib.Path.home() / ".claude" / "task-time"
    base_dir.mkdir(parents=True, exist_ok=True)

    state_file = base_dir / f"{make_key(session_id)}.json"
    log_file = base_dir / "claude-task-time.jsonl"

    # 任务开始：用户提交 prompt 后，Claude 处理前触发
    if event_name == "UserPromptSubmit":
        state = {
            "session_id": session_id,
            "cwd": cwd,
            "transcript_path": transcript_path,
            "prompt": prompt,
            "start_ms": current_ms,
            "start_time": datetime.datetime.now().isoformat(timespec="seconds"),
        }

        state_file.write_text(
            json.dumps(state, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )

        # 不输出任何内容，避免把无关内容注入 Claude 上下文
        return 0

    # 任务结束：主 Agent 正常完成
    # 任务异常：API 错误等 StopFailure
    if event_name in ("Stop", "StopFailure"):
        if not state_file.exists():
            return 0

        try:
            state = json.loads(state_file.read_text(encoding="utf-8"))
        except Exception:
            return 0

        start_ms = int(state.get("start_ms", current_ms))
        elapsed_ms = current_ms - start_ms
        elapsed_text = format_duration(elapsed_ms)

        prompt_text = str(state.get("prompt", "")).replace("\n", " ").strip()
        if len(prompt_text) > 200:
            prompt_text = prompt_text[:200] + "..."

        record = {
            "end_time": datetime.datetime.now().isoformat(timespec="seconds"),
            "event": event_name,
            "elapsed_ms": elapsed_ms,
            "elapsed_text": elapsed_text,
            "session_id": session_id,
            "cwd": cwd,
            "transcript_path": transcript_path,
            "prompt": prompt_text,
        }

        append_log(log_file, record)

        try:
            state_file.unlink()
        except Exception:
            pass

        # 用官方支持的 systemMessage 显示给用户
        # 不写 stderr，不直接控制终端
        print(json.dumps({
            "systemMessage": f"✻ Claude task time: {elapsed_text}",
            "suppressOutput": False
        }, ensure_ascii=False))

        return 0

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
```

## `~/.claude/settings.json` 中加入

如果你已有 `settings.json`，只需要把 `hooks` 部分合并进去：

```
{
  "hooks": {
    "UserPromptSubmit": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "python3 ~/.claude/hooks/claude-turn-timer.py",
            "timeout": 5
          }
        ]
      }
    ],
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "python3 ~/.claude/hooks/claude-turn-timer.py",
            "timeout": 5
          }
        ]
      }
    ],
    "StopFailure": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "python3 ~/.claude/hooks/claude-turn-timer.py",
            "timeout": 5
          }
        ]
      }
    ]
  }
}
```

日志文件会写到：

```
~/.claude/task-time/claude-task-time.jsonl
```

结论：**可行，但它统计的是“每轮用户任务耗时”，不是 Claude Code 内部 `Brewed for` 的原始字段。**
如果你的目标是“每次我发给 Claude Code 一个任务，它处理完成实际用了多久”，这个方案可以用。



你再审查一下你的代码，确保可以准确获得每个任务的执行时间（可以包含等待用户确认/授权的时间），同时考虑异常情况，没后获得结束时间点时如何处理。



我会按“真实可落地”的口径重新审查：先确认 Claude Code Hook 事件边界，再把脚本改成可恢复、可补偿、可处理异常退出的版本。

我确认了一个关键边界：`Stop` 不会在用户中断时触发，API 错误会走 `StopFailure`。所以脚本必须有“正常结束、异常结束、无结束事件补偿”三套逻辑。

Thought for 51s

结论：**上一版核心思路可行，但不够严谨**。要准确记录“每个任务”的执行时间，应改成下面这种结构：

- `UserPromptSubmit`：记录任务开始点。
- `Stop`：记录正常结束点。
- `StopFailure`：记录 API 错误结束点。
- `SessionEnd`：兜底处理 Claude Code 退出但没有触发 `Stop` 的情况。
- `Notification` / `PreToolUse` / `PostToolUse` 等：只更新 `last_seen`，用于异常情况下做补偿判断。

Claude Code 官方文档说明：`UserPromptSubmit` 在用户提交 prompt 后、Claude 处理前触发；`Stop` 在主 Agent 完成响应后触发，但用户中断时不会触发；API 错误会触发 `StopFailure`；`SessionEnd` 会在会话终止时触发。

下面是我重新审查后建议使用的版本。

## 关键判断

这个方案能做到：

| 场景                                 |                               是否能准确记录 |
| ------------------------------------ | -------------------------------------------: |
| 正常完成任务                         |                                         准确 |
| 中途等待用户授权 / 确认              |                             准确，计入总耗时 |
| API 报错结束                         |                                         准确 |
| Claude Code 正常退出但没有 Stop      |                          可记录到 SessionEnd |
| 终端崩溃 / 进程被 kill -9 / 机器关机 | 无法获得真实结束点，只能记录为异常未闭合任务 |

原因很简单：如果进程被强杀，任何 Hook 都没有机会执行，所以不存在 100% 准确获得结束时间的技术方法。此时只能记录：

```
elapsed_precision = lower_bound
```

也就是“至少执行了多久”。

------

## `~/.claude/hooks/claude-turn-timer.py`

```
#!/usr/bin/env python3
# -*- coding: utf-8 -*-

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


BASE_DIR = pathlib.Path.home() / ".claude" / "task-time"
ACTIVE_DIR = BASE_DIR / "active"
LOG_FILE = BASE_DIR / "claude-task-time.jsonl"
ERROR_LOG_FILE = BASE_DIR / "claude-task-time-error.log"
LOCK_FILE = BASE_DIR / ".lock"

# 超过这个时间仍未闭合的 active 任务，在下一次 hook 触发时会被标记为 orphan。
# 这里只是兜底，不影响正常 Stop / StopFailure 记录。
ORPHAN_AFTER_SECONDS = 24 * 60 * 60


START_EVENT = "UserPromptSubmit"
END_EVENTS = {"Stop", "StopFailure"}
FALLBACK_END_EVENTS = {"SessionEnd"}

# 这些事件不负责结束任务，只用于更新 last_seen，方便异常情况下判断任务至少运行到哪个时间点。
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
    """返回当前毫秒时间戳"""
    return int(time.time() * 1000)


def iso_time(ms: int | None = None) -> str:
    """毫秒时间戳转本地 ISO 时间"""
    if ms is None:
        ms = now_ms()
    return datetime.datetime.fromtimestamp(ms / 1000).isoformat(timespec="seconds")


def format_duration(ms: int | None) -> str:
    """把毫秒格式化为 Claude Code 常见的 Xm YYs 形式"""
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
    """创建必要目录"""
    BASE_DIR.mkdir(parents=True, exist_ok=True)
    ACTIVE_DIR.mkdir(parents=True, exist_ok=True)


def session_key(session_id: str) -> str:
    """把 session_id 转为安全文件名"""
    raw = session_id or "unknown-session"
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()[:32]


def active_file_for(session_id: str) -> pathlib.Path:
    """返回当前 session 的 active 状态文件"""
    return ACTIVE_DIR / f"{session_key(session_id)}.json"


def read_stdin_json() -> dict:
    """读取 Claude Code 传入的 hook JSON"""
    try:
        return json.load(sys.stdin)
    except Exception:
        return {}


def atomic_write_json(path: pathlib.Path, data: dict) -> None:
    """原子写入 JSON，避免写到一半被并发 hook 读到"""
    tmp_path = path.with_suffix(path.suffix + f".tmp.{os.getpid()}")
    tmp_path.write_text(
        json.dumps(data, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    os.replace(tmp_path, path)


def read_json_file(path: pathlib.Path) -> dict | None:
    """读取 JSON 文件，失败则返回 None"""
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return None


def append_jsonl(path: pathlib.Path, record: dict) -> None:
    """追加 JSONL 日志"""
    with path.open("a", encoding="utf-8") as f:
        f.write(json.dumps(record, ensure_ascii=False) + "\n")


def append_error(message: str) -> None:
    """写入错误日志，但不影响 Claude Code 主流程"""
    try:
        ensure_dirs()
        with ERROR_LOG_FILE.open("a", encoding="utf-8") as f:
            f.write(f"{iso_time()}\n{message}\n\n")
    except Exception:
        pass


def shorten_text(value: object, limit: int = 300) -> str:
    """压缩长文本，避免日志过大"""
    text = str(value or "").replace("\n", " ").strip()
    if len(text) > limit:
        return text[:limit] + "..."
    return text


def build_base_record(state: dict, payload: dict, end_ms: int, status: str, precision: str) -> dict:
    """构造任务结束日志"""
    start_ms = int(state.get("start_ms", end_ms))
    elapsed_ms = max(0, end_ms - start_ms)

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
        "end_event": payload.get("hook_event_name", ""),
        "last_seen_ms": state.get("last_seen_ms"),
        "last_seen_time": iso_time(int(state["last_seen_ms"])) if state.get("last_seen_ms") else None,
        "last_seen_event": state.get("last_seen_event"),

        "permission_prompt_count": int(state.get("permission_prompt_count", 0)),
        "notification_count": int(state.get("notification_count", 0)),
        "tool_event_count": int(state.get("tool_event_count", 0)),

        "transcript_path": state.get("transcript_path") or payload.get("transcript_path", ""),
        "prompt": shorten_text(state.get("prompt", "")),
    }

    if payload.get("hook_event_name") == "StopFailure":
        record["error"] = payload.get("error", "")
        record["error_details"] = shorten_text(payload.get("error_details", ""), 500)
        record["last_assistant_message"] = shorten_text(payload.get("last_assistant_message", ""), 500)

    if payload.get("hook_event_name") == "SessionEnd":
        record["session_end_reason"] = payload.get("reason", "")

    if payload.get("hook_event_name") == "Stop":
        record["background_tasks_count"] = len(payload.get("background_tasks") or [])
        record["session_crons_count"] = len(payload.get("session_crons") or [])
        record["last_assistant_message"] = shorten_text(payload.get("last_assistant_message", ""), 500)

    return record


def close_active_task(
    active_file: pathlib.Path,
    payload: dict,
    status: str,
    precision: str,
    end_ms: int | None = None,
) -> dict | None:
    """关闭 active 任务并写入日志"""
    state = read_json_file(active_file)
    if not state:
        return None

    if end_ms is None:
        end_ms = now_ms()

    record = build_base_record(
        state=state,
        payload=payload,
        end_ms=end_ms,
        status=status,
        precision=precision,
    )

    append_jsonl(LOG_FILE, record)

    try:
        active_file.unlink()
    except FileNotFoundError:
        pass

    return record


def recover_stale_active_if_needed(active_file: pathlib.Path, payload: dict, current_ms: int) -> None:
    """处理没有 Stop / StopFailure / SessionEnd 的遗留任务"""
    state = read_json_file(active_file)
    if not state:
        return

    start_ms = int(state.get("start_ms", current_ms))
    age_seconds = max(0, (current_ms - start_ms) // 1000)

    # 新 prompt 到来时，说明上一个 active 任务已经不可能再正常闭合。
    # 此时不能伪造准确结束点，只能用 last_seen 作为下界。
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

        # 注意：这里不是准确 end，只是最后一次观察到该任务仍在活动的时间。
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
    """记录新任务开始"""
    prompt = payload.get("prompt", "")

    state = {
        "turn_id": str(uuid.uuid4()),
        "session_id": payload.get("session_id", "unknown"),
        "transcript_path": payload.get("transcript_path", ""),
        "cwd": payload.get("cwd", ""),
        "permission_mode": payload.get("permission_mode", ""),

        "prompt": prompt,
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

    atomic_write_json(active_file, state)


def observe_task(active_file: pathlib.Path, payload: dict, current_ms: int) -> None:
    """更新 active 任务的最后观察时间"""
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

    if event_name in {
        "PreToolUse",
        "PostToolUse",
        "PostToolUseFailure",
        "PostToolBatch",
    }:
        state["tool_event_count"] = int(state.get("tool_event_count", 0)) + 1

    atomic_write_json(active_file, state)


def handle_payload(payload: dict) -> dict | None:
    """处理 Claude Code hook 事件"""
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
        return close_active_task(
            active_file=active_file,
            payload=payload,
            status="completed",
            precision="exact",
            end_ms=current_ms,
        )

    if event_name == "StopFailure":
        return close_active_task(
            active_file=active_file,
            payload=payload,
            status="failed_api",
            precision="exact",
            end_ms=current_ms,
        )

    if event_name == "SessionEnd":
        return close_active_task(
            active_file=active_file,
            payload=payload,
            status="session_end_without_stop",
            precision="session_end",
            end_ms=current_ms,
        )

    if event_name in OBSERVE_EVENTS:
        observe_task(active_file, payload, current_ms)
        return None

    return None


def main() -> int:
    payload = read_stdin_json()
    event_name = payload.get("hook_event_name", "")

    ensure_dirs()

    try:
        with LOCK_FILE.open("a+", encoding="utf-8") as lock:
            fcntl.flock(lock.fileno(), fcntl.LOCK_EX)
            record = handle_payload(payload)
            fcntl.flock(lock.fileno(), fcntl.LOCK_UN)

        # UserPromptSubmit 的 stdout 会被加入 Claude 上下文，所以不能输出。
        # StopFailure 的输出和退出码会被 Claude Code 忽略，所以也不输出。
        # 只在 Stop 正常结束时显示一条系统提示。
        if record and event_name == "Stop":
            print(json.dumps({
                "systemMessage": f"✻ Claude task time: {record.get('elapsed_text', 'unknown')}",
                "suppressOutput": False
            }, ensure_ascii=False))

        return 0

    except Exception:
        append_error(traceback.format_exc())
        return 0


if __name__ == "__main__":
    raise SystemExit(main())
```

------

## `~/.claude/settings.json` 的 hooks 配置

已有 `settings.json` 时，只合并 `hooks` 这一段，不要覆盖其他配置。

```
{
  "hooks": {
    "UserPromptSubmit": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "python3 ~/.claude/hooks/claude-turn-timer.py",
            "timeout": 3
          }
        ]
      }
    ],
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "python3 ~/.claude/hooks/claude-turn-timer.py",
            "timeout": 3
          }
        ]
      }
    ],
    "StopFailure": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "python3 ~/.claude/hooks/claude-turn-timer.py",
            "timeout": 3
          }
        ]
      }
    ],
    "SessionEnd": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "python3 ~/.claude/hooks/claude-turn-timer.py",
            "timeout": 3
          }
        ]
      }
    ],
    "Notification": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "python3 ~/.claude/hooks/claude-turn-timer.py",
            "timeout": 3
          }
        ]
      }
    ],
    "PermissionRequest": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "python3 ~/.claude/hooks/claude-turn-timer.py",
            "timeout": 3
          }
        ]
      }
    ],
    "PreToolUse": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "python3 ~/.claude/hooks/claude-turn-timer.py",
            "timeout": 3
          }
        ]
      }
    ],
    "PostToolUse": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "python3 ~/.claude/hooks/claude-turn-timer.py",
            "timeout": 3
          }
        ]
      }
    ],
    "PostToolUseFailure": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "python3 ~/.claude/hooks/claude-turn-timer.py",
            "timeout": 3
          }
        ]
      }
    ],
    "PostToolBatch": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "python3 ~/.claude/hooks/claude-turn-timer.py",
            "timeout": 3
          }
        ]
      }
    ],
    "SubagentStart": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "python3 ~/.claude/hooks/claude-turn-timer.py",
            "timeout": 3
          }
        ]
      }
    ],
    "SubagentStop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "python3 ~/.claude/hooks/claude-turn-timer.py",
            "timeout": 3
          }
        ]
      }
    ]
  }
}
```

------

## 日志位置

```
~/.claude/task-time/claude-task-time.jsonl
```

异常日志：

```
~/.claude/task-time/claude-task-time-error.log
```

未闭合状态文件：

```
~/.claude/task-time/active/
```

------

## 这版相比上一版修正了什么

1. **不再只依赖 `Stop`**
   增加 `StopFailure` 和 `SessionEnd`，避免 API 错误、会话退出时丢失结束记录。
2. **不伪造异常结束时间**
   如果没有收到结束事件，只记录 `lower_bound` 和 `upper_bound`，不会把估算值冒充准确值。
3. **支持用户授权等待时间**
   开始点是 `UserPromptSubmit`，结束点是 `Stop` / `StopFailure`，中间的权限确认等待天然计入总耗时。`Notification` 事件还能记录是否出现过 `permission_prompt`。Claude Code 文档说明 `Notification` 可在需要用户授权时触发，类型包括 `permission_prompt`。
4. **避免并发 Hook 写坏文件**
   使用 `fcntl.flock` 加锁，并使用原子写入 active 状态文件。
5. **避免污染 Claude 上下文**
   `UserPromptSubmit` 的 stdout 可能进入 Claude 上下文，所以脚本在开始事件不输出任何内容；Hook 要向用户显示消息，应使用 JSON 的 `systemMessage`。

最终判断：**这版可以用于统计每个 Claude Code 任务的墙钟执行时间；正常完成和 API 错误场景是准确的；强杀/崩溃场景只能做未闭合补偿，不能保证准确结束点。**