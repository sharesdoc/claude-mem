#!/usr/bin/env bun
/**
 * adjust-old-client-data.ts — 旧客户端数据修复工具
 *
 * 服务端升级后(migration 40/41),未升级客户端 sync 时不上报
 * user_prompts.completed_at_epoch,落库为 NULL 导致 stats 查询
 * (WHERE completed_at_epoch IS NOT NULL) 将该用户所有任务排除 → 统计为 0。
 *
 * 用法: bun run scripts/adjust-old-client-data.ts -n "用户名"
 *
 * 算法:对指定用户的每个会话,将其 prompt 按 prompt_number 升序排列:
 *   p[i].completed_at_epoch = p[i+1].created_at_epoch  (AI 在用户发下一条时已完成)
 *   p[最后] = session.completed_at_epoch(有则用) / created_at_epoch + 5min(兜底)
 * 这是旧逻辑的 AI 处理时间(不含人类思考段,think_time_ms 保持 0)。
 * 仅回填 completed_at_epoch IS NULL 的行。
 */

import { Database } from 'bun:sqlite';
import { join } from 'path';
import { homedir } from 'os';

const DB_PATH = process.env.CLAUDE_MEM_DATA_DIR
  ? join(process.env.CLAUDE_MEM_DATA_DIR, 'claude-mem.db')
  : join(homedir(), '.claude-mem', 'claude-mem.db');

/** 最后一条 prompt 无后续时,兜底按 5 分钟估算(与 v40 migration Step D 一致)。 */
const LAST_PROMPT_FALLBACK_MS = 5 * 60 * 1000;

/** Parse CLI: -n <name> */
function parseArgs(): string | null {
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '-n' && i + 1 < args.length) return args[i + 1];
  }
  return null;
}

const target = parseArgs();
if (!target) {
  console.error('用法: bun run scripts/adjust-old-client-data.ts -n "用户名"');
  process.exit(1);
}

console.log(`数据库: ${DB_PATH}`);
console.log(`目标用户: ${target}\n`);

const db = new Database(DB_PATH);

// ── 找到该用户所有有 NULL prompt 的会话 ──
const sessions = db.prepare(`
  SELECT DISTINCT up.content_session_id AS sid,
         s.completed_at_epoch AS sess_completed
  FROM user_prompts up
  JOIN sdk_sessions s ON s.content_session_id = up.content_session_id
  WHERE up.completed_at_epoch IS NULL
    AND COALESCE(NULLIF(s.user_label, ''), 'unknown') = ? COLLATE NOCASE
`).all(target) as Array<{ sid: string; sess_completed: number | null }>;

if (sessions.length === 0) {
  console.log('该用户没有需要修复的 NULL completed_at_epoch 记录。');
  db.close();
  process.exit(0);
}

console.log(`找到 ${sessions.length} 个含 NULL prompt 的会话`);

const updatePrompt = db.prepare(
  'UPDATE user_prompts SET completed_at_epoch = ? WHERE content_session_id = ? AND prompt_number = ?',
);

let totalFixed = 0;
let fallbackLast = 0;  // 用 5min 兜底补的最后一条数

for (const { sid, sess_completed } of sessions) {
  const prompts = db.prepare(`
    SELECT prompt_number, created_at_epoch, completed_at_epoch
    FROM user_prompts
    WHERE content_session_id = ? AND completed_at_epoch IS NULL
    ORDER BY prompt_number ASC
  `).all(sid) as Array<{ prompt_number: number; created_at_epoch: number; completed_at_epoch: number | null }>;

  if (prompts.length === 0) continue;

  const allPns = db.prepare(`
    SELECT prompt_number, created_at_epoch
    FROM user_prompts
    WHERE content_session_id = ?
    ORDER BY prompt_number ASC
  `).all(sid) as Array<{ prompt_number: number; created_at_epoch: number }>;

  const nextCreated = new Map<number, number>();
  for (let i = 0; i < allPns.length - 1; i++) {
    nextCreated.set(allPns[i].prompt_number, allPns[i + 1].created_at_epoch);
  }

  let fixed = 0;
  for (const p of prompts) {
    // 非最后一条 → 取下一条 created; 最后一条 → session 已完成用其实时,否则 5min 兜底
    const nextVal = nextCreated.get(p.prompt_number);
    const newCompleted = nextVal
      ?? (sess_completed != null ? sess_completed : p.created_at_epoch + LAST_PROMPT_FALLBACK_MS);
    if (!nextVal && sess_completed == null) fallbackLast++;
    // 兜底:会话被重复使用(新 prompt 创建时间晚于 session completed_at_epoch)时,
    // completed 不应早于 created,取 MAX 避免负数耗时。
    updatePrompt.run(Math.max(newCompleted, p.created_at_epoch), sid, p.prompt_number);
    fixed++;
  }

  const tag = sess_completed == null ? '(5min兜底)' : '';
  console.log(`  ${sid.slice(0, 8)}…: ${prompts.length} 个 NULL prompt,已回填 ${fixed} 条 ${tag}`);
  totalFixed += fixed;
}

db.close();

console.log(`\n===== 完成 =====`);
console.log(`修复: ${totalFixed} 条 prompt`);
if (fallbackLast > 0) console.log(`其中 ${fallbackLast} 条为最后一条(5min 兜底,因会话 completed_at_epoch 为空)`);
