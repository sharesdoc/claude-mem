# Claude Task Timer

Claude Task Timer records wall-clock processing time for each Claude Code user task.

It starts timing on `UserPromptSubmit`, closes a task on `Stop`, `StopFailure`, or `SessionEnd`, and updates `last_seen` on observe events so interrupted tasks can be recovered later as lower-bound records.

## Output

Records are written as JSON Lines:

```text
~/.claude/task-time/claude-task-time.jsonl
```

Hook runtime errors are written here and never block Claude Code:

```text
~/.claude/task-time/claude-task-time-error.log
```

Active task state is stored under:

```text
~/.claude/task-time/active/
```

## Accuracy

Normal `Stop` and `StopFailure` records use exact hook boundaries. Permission waits and confirmation waits are included because they happen between `UserPromptSubmit` and the ending event.

If Claude Code exits without `Stop`, `SessionEnd` closes the task. If the process is killed or crashes before any ending hook runs, the next hook invocation recovers the active task as `orphan_without_end_event` with `elapsed_precision=lower_bound`.

## Install

From this repository root:

```bash
./install-demo.sh
```

Restart Claude Code after installation so plugin and hook configuration are loaded.
