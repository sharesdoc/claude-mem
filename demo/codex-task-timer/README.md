# Codex Task Timer

`codex-task-timer` records wall-clock duration for each interactive Codex task.

It listens to Codex lifecycle hooks:

- `UserPromptSubmit`: start a task.
- `PostToolUse`: update activity metadata.
- `Stop`: close the task and append one JSONL record.

Records are written to:

```text
$CODEX_HOME/task-time/codex-task-time.jsonl
```

If `CODEX_HOME` is not set, the plugin uses:

```text
~/.codex/task-time/codex-task-time.jsonl
```

Each line is a JSON object with fields such as `start_ms`, `end_ms`, `elapsed_ms`, `elapsed_text`, `prompt`, `tool_event_count`, and `last_agent_message`.
