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
 *   p[最后].completed_at_epoch = session.completed_at_epoch
 * 这是旧逻辑的 AI 处理时间(不含人类思考段,think_time_ms 保持 0)。
 * 仅回填 completed_at_epoch IS NULL 的行;会话 completed_at_epoch 为 NULL 则跳过。
 */

import { Database } from 'bun:sqlite';
import { join } from 'path';
import { homedir } from 'os';

const DB_PATH = process.env.CLAUDE_MEM_DATA_DIR
  ? join(process.env.CLAUDE_MEM_DATA_DIR, 'claude-mem.db')
  : join(homedir(), '.claude-mem', 'claude-mem.db');

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
let skippedSessions = 0;

for (const { sid, sess_completed } of sessions) {
  if (sess_completed == null) {
    console.log(`  跳过会话 ${sid}: 会话本身 completed_at_epoch 为空(可能未正常结束)`);
    skippedSessions++;
    continue;
  }

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
    const newCompleted = nextCreated.get(p.prompt_number) ?? sess_completed;
    updatePrompt.run(newCompleted, sid, p.prompt_number);
    fixed++;
  }

  console.log(`  ${sid.slice(0, 8)}…: ${prompts.length} 个 NULL prompt,已回填 ${fixed} 条`);
  totalFixed += fixed;
}

db.close();

console.log(`\n===== 完成 =====`);
console.log(`修复: ${totalFixed} 条 prompt`);
if (skippedSessions > 0) console.log(`跳过: ${skippedSessions} 个会话(会话未正常结束)`);
