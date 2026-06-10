#!/usr/bin/env bun
/**
 * statistics-user-info — 统计指定用户在 N 天内的任务用时信息
 *
 * 用法:
 *   bun run scripts/statistics-user-info.ts -h                    显示帮助
 *   bun run scripts/statistics-user-info.ts -n "Zhan San"         统计今天(默认1天)
 *   bun run scripts/statistics-user-info.ts -n "张三" -d 3        统计最近3天
 */

import { Database } from 'bun:sqlite';
import { join } from 'path';
import { homedir } from 'os';

const DB_PATH = process.env.CLAUDE_MEM_DATA_DIR
  ? join(process.env.CLAUDE_MEM_DATA_DIR, 'claude-mem.db')
  : join(homedir(), '.claude-mem', 'claude-mem.db');

// ── CLI ─────────────────────────────────────────────────────────────────
function parseArgs(): { name: string | null; days: number; help: boolean } {
  let name: string | null = null;
  let days = 1;
  let help = false;
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '-h' || args[i] === '--help') { help = true; }
    else if ((args[i] === '-n' || args[i] === '--name') && i + 1 < args.length) { name = args[++i]; }
    else if ((args[i] === '-d' || args[i] === '--days') && i + 1 < args.length) { const v = parseInt(args[++i], 10); if (v > 0) days = v; }
    else if (!args[i].startsWith('-')) {
      // positional: first non-flag = name, second = days
      if (!name) name = args[i];
      else { const v = parseInt(args[i], 10); if (v > 0) days = v; }
    }
  }
  return { name, days, help };
}

const { name, days, help } = parseArgs();

function pad(s: string, w: number): string { return s.length >= w ? s : s + ' '.repeat(w - s.length); }
function rpad(s: string, w: number): string { return s.length >= w ? s : ' '.repeat(w - s.length) + s; }

// ── 格式化 ─────────────────────────────────────────────────────────────
function fmtDur(ms: number): string {
  if (ms <= 0) return '0s';
  const h = Math.floor(ms / 3600000), m = Math.floor((ms % 3600000) / 60000), s = Math.round((ms % 60000) / 1000);
  if (h > 0) return `${h}h${m}m${s}s`;
  if (m > 0) return `${m}m${s}s`;
  return `${s}s`;
}

function fmtPct(part: number, total: number): string {
  if (total <= 0) return '   -';
  return String(Math.round((part / total) * 100)).padStart(3) + '%';
}

function nowLocal(): Date { return new Date(); }

// ── Help ────────────────────────────────────────────────────────────────
function showHelp(): void {
  console.log(`
statistics-user-info — 统计用户任务用时

用法:
  bun run scripts/statistics-user-info.ts [OPTIONS]

选项:
  -h, --help              显示此帮助
  -n, --name <username>   目标用户名(必填)
  -d, --days <N>          统计最近 N 天(默认 1 = 今天)

示例:
  bun run scripts/statistics-user-info.ts -n "Zhan San"          今天
  bun run scripts/statistics-user-info.ts -n "张三" -d 3         最近3天
  bun run scripts/statistics-user-info.ts -n "Wang Wu" -d 7     最近7天

输出:
  ① 概览:任务数/总AI/总H/项目数/日均
  ② 按项目:各项目任务数/AI/H/合计/占比/平均
  ③ 汇总行
`);
}

if (help || !name) {
  if (!name && !help) console.error('错误: 缺少 -n <用户名>\n');
  showHelp();
  process.exit(name ? 0 : 1);
}

// ── 计算时间窗口 ───────────────────────────────────────────────────────
const now = nowLocal();
const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
const since = todayStart.getTime() - (days - 1) * 86400000;
const until = now.getTime();

console.log(`\n数据库: ${DB_PATH}`);
console.log(`用户: ${name}    范围: 最近 ${days} 天 (${new Date(since).toLocaleDateString('zh-CN')} ~ ${new Date(until).toLocaleDateString('zh-CN')})\n`);

// ── 查询 ────────────────────────────────────────────────────────────────
const db = new Database(DB_PATH);

// 该用户此窗口内的 prompt
const rows = db.prepare(`
  SELECT s.project AS project, up.prompt_text,
         up.created_at_epoch,
         up.completed_at_epoch,
         COALESCE(up.think_time_ms, 0) AS think_ms
  FROM user_prompts up
  JOIN sdk_sessions s ON s.content_session_id = up.content_session_id
  WHERE up.created_at_epoch >= ? AND up.created_at_epoch <= ?
    AND COALESCE(NULLIF(s.user_label, ''), 'unknown') = ? COLLATE NOCASE
  ORDER BY up.created_at_epoch ASC
`).all(since, until, name) as Array<{
  project: string; prompt_text: string;
  created_at_epoch: number; completed_at_epoch: number | null; think_ms: number;
}>;

db.close();

const completed = rows.filter(r => r.completed_at_epoch != null);
const total = rows.length;
const totalAi = completed.reduce((s, r) => s + Math.max(0, r.completed_at_epoch! - r.created_at_epoch), 0);
const totalH = completed.reduce((s, r) => s + r.think_ms, 0);
const totalTime = totalAi + totalH;

// 按项目聚合
const byProject = new Map<string, { ai: number; h: number; count: number; completed: number }>();
for (const r of rows) {
  const p = r.project || '(unknown)';
  const b = byProject.get(p) ?? { ai: 0, h: 0, count: 0, completed: 0 };
  b.count++;
  if (r.completed_at_epoch != null) {
    b.completed++;
    b.ai += Math.max(0, r.completed_at_epoch - r.created_at_epoch);
    b.h += r.think_ms;
  }
  byProject.set(p, b);
}

const sorted = Array.from(byProject.entries()).sort((a, b) => (b[1].ai + b[1].h) - (a[1].ai + a[1].h));
const projectSet = new Set(rows.map(r => r.project).filter(Boolean));

// ── 输出 ────────────────────────────────────────────────────────────────
console.log('═══ 概览 ═══');
console.log(`  任务总数:   ${total}`);
console.log(`  已完成:     ${completed.length} (${total > 0 ? Math.round(completed.length / total * 100) : 0}%)`);
console.log(`  AI 耗时:    ${fmtDur(totalAi)}`);
console.log(`  人类思考:   ${fmtDur(totalH)}`);
console.log(`  总耗时:     ${fmtDur(totalTime)}`);
console.log(`  涉及项目:   ${projectSet.size}`);
console.log(`  日均任务:   ${(total / days).toFixed(1)}`);
console.log(`  日均耗时:   ${fmtDur(Math.round(totalTime / days))}`);
console.log('');

console.log('═══ 按项目 ═══');
if (sorted.length === 0) {
  console.log('  (无数据)');
} else {
  // 表头
  const projW = Math.min(60, Math.max(10, ...sorted.map(s => s[0].length)));
  const hdr =
    pad('项目'.padEnd(projW), projW + 2) +
    rpad('#任务', 6) + ' ' +
    rpad('完成', 5) + ' ' +
    rpad('AI耗时', 11) + ' ' +
    rpad('H耗时', 10) + ' ' +
    rpad('合计', 11) + ' ' +
    rpad('占比', 4) + ' ' +
    rpad('平均/任务', 11);
  console.log(hdr);
  console.log('─'.repeat(hdr.length));

  for (const [proj, d] of sorted) {
    const tt = d.ai + d.h;
    const avg = d.completed > 0 ? fmtDur(Math.round(tt / d.completed)) : '-';
    const pname = proj.length > projW ? proj.slice(0, projW - 2) + '..' : proj;
    const line =
      pad(pname, projW + 2) +
      rpad(String(d.count), 6) + ' ' +
      rpad(String(d.completed), 5) + ' ' +
      rpad(fmtDur(d.ai), 11) + ' ' +
      rpad(fmtDur(d.h), 10) + ' ' +
      rpad(fmtDur(tt), 11) + ' ' +
      rpad(fmtPct(tt, totalTime), 4) + ' ' +
      rpad(avg, 11);
    console.log(line);
  }
}

// ── 汇总 ──
console.log('─'.repeat(60));
console.log(`  汇总: ${total} 任务 / ${fmtDur(totalAi)} AI + ${fmtDur(totalH)} H = ${fmtDur(totalTime)}`);
console.log('');
