/**
 * computePerTurnActivity — 基于 liveness 的逐 turn 活跃/挂起时长计算。
 *
 * 覆盖专家审查 #4 指出的盲区:多轮次切分、单事件 turn 不清零回退、
 * tool_result 间隔计入活跃、侧链(sidechain)过滤、空闲阈值分割、以及
 * 不可解析输入(Gemini / 缺失文件)安全回落 null。
 */
import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { writeFileSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { computePerTurnActivity } from '../../src/shared/transcript-parser.js';

// 15min 挂起阈值(与生产推荐值一致)。
const IDLE_THRESHOLD_MS = 900_000;

// 基准时间戳取 2023-11(远早于 now),避开 collectTimedTranscriptEvents 的
// future-skew 过滤(> now + 60s 的行会被丢弃)。后续 ts 均以"相对秒"给出。
const BASE_MS = 1700000000000;
const ms = (sec: number) => BASE_MS + sec * 1000;
const iso = (sec: number) => new Date(ms(sec)).toISOString();

let tmpDir: string;
let transcriptPath: string;

beforeEach(() => {
  tmpDir = join(tmpdir(), `per-turn-activity-${process.pid}-${Date.now()}`);
  mkdirSync(tmpDir, { recursive: true });
  transcriptPath = join(tmpDir, 'transcript.jsonl');
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

// 行构造器:每行一个 JSON 对象,与 Claude Code transcript 同构。
function userText(sec: number, text: string): string {
  return JSON.stringify({ type: 'user', timestamp: iso(sec), message: { content: [{ type: 'text', text }] } });
}
function userToolResult(sec: number): string {
  // user 行带 tool_result → 归类为 'ai'(工具回传,属 AI 工作流连续活动)。
  return JSON.stringify({
    type: 'user',
    timestamp: iso(sec),
    message: { content: [{ type: 'tool_result', content: 'ok' }] },
  });
}
function assistant(sec: number, isSidechain = false, text = 'a'): string {
  return JSON.stringify({
    type: 'assistant',
    timestamp: iso(sec),
    isSidechain,
    message: { content: [{ type: 'text', text }] },
  });
}
function write(lines: string[]): void {
  writeFileSync(transcriptPath, lines.join('\n'));
}

describe('computePerTurnActivity — null 回落', () => {
  it('returns null when the transcript file does not exist', () => {
    expect(computePerTurnActivity(join(tmpDir, 'nope.jsonl'), IDLE_THRESHOLD_MS)).toBeNull();
  });

  it('returns null for Gemini single-JSON format (no per-line timestamps)', () => {
    writeFileSync(transcriptPath, JSON.stringify({ messages: [{ type: 'gemini', content: 'x' }] }));
    expect(computePerTurnActivity(transcriptPath, IDLE_THRESHOLD_MS)).toBeNull();
  });

  it('returns null when no timed main-chain events exist', () => {
    // 全是 sidechain 或无时间戳 → 收不到任何事件。
    write([
      JSON.stringify({ type: 'assistant', timestamp: iso(10), isSidechain: true, message: { content: 'x' } }),
      JSON.stringify({ type: 'assistant', message: { content: 'no ts here' } }),
    ]);
    expect(computePerTurnActivity(transcriptPath, IDLE_THRESHOLD_MS)).toBeNull();
  });
});

describe('computePerTurnActivity — 单事件 turn 不清零', () => {
  it('falls back to promptedAt→lastAi span for a single-event turn so activeMs is non-zero', () => {
    // 1 个 split + 1 个 assistant:span=0 会被清零,回退为 promptedAt→ai 全跨度。
    write([userText(0, 'q'), assistant(50)]);
    const turns = computePerTurnActivity(transcriptPath, IDLE_THRESHOLD_MS)!;
    expect(turns).toHaveLength(1);
    expect(turns[0].eventCount).toBe(1);
    expect(turns[0].activeMs).toBe(50_000); // (50-0)*1000,而非 0
    expect(turns[0].idleMs).toBe(0);
  });
});

describe('computePerTurnActivity — 多轮次切分与空闲阈值分割', () => {
  it('splits turns at user input and subtracts in-turn idle gaps', () => {
    // turn1: ai@10 → ai@100 (gap 90s 正常) → ai@3100 (gap 3000s=50min 挂起)
    //        span=3090s, idle=3000s → active=90s;think time(3100→4000)不在任何 turn 内
    // turn2: 单事件 ai@4010,promptedAt=4000 → active=10s
    write([
      userText(0, 'q1'),
      assistant(10),
      assistant(100),
      assistant(3100),
      userText(4000, 'q2'),
      assistant(4010),
    ]);
    const turns = computePerTurnActivity(transcriptPath, IDLE_THRESHOLD_MS)!;
    expect(turns.map(t => t.promptIndex)).toEqual([1, 2]);

    const [t1, t2] = turns;
    expect(t1.startedAt).toBe(ms(10));
    expect(t1.endedAt).toBe(ms(3100));
    expect(t1.idleMs).toBe(3_000_000); // 一个 3000s 挂起间隔
    expect(t1.activeMs).toBe(90_000); // 3090s - 3000s
    expect(t1.eventCount).toBe(3);

    expect(t2.eventCount).toBe(1);
    expect(t2.activeMs).toBe(10_000); // 单事件回退 4010-4000
    expect(t2.idleMs).toBe(0);
  });
});

describe('computePerTurnActivity — tool_result 间隔计入活跃', () => {
  it('treats a user tool_result as AI activity (no idle between tool_use→result→answer)', () => {
    // assistant(tool_use)@10 → user(tool_result)@20 → assistant(text)@30:
    // 三者归类全为 'ai',相邻间隔均 < 阈值 → idle=0,active=全跨度。
    write([userText(0, 'q'), assistant(10), userToolResult(20), assistant(30)]);
    const turns = computePerTurnActivity(transcriptPath, IDLE_THRESHOLD_MS)!;
    expect(turns).toHaveLength(1);
    expect(turns[0].eventCount).toBe(3); // 含 tool_result
    expect(turns[0].idleMs).toBe(0);
    expect(turns[0].activeMs).toBe(20_000); // 30-10
  });
});

describe('computePerTurnActivity — 侧链过滤', () => {
  it('ignores sidechain assistant events when computing host-turn activity', () => {
    // 主链 ai@10、侧链 ai@20、主链 ai@30:侧链被丢弃,count=2,lastAi=30(非 20)。
    write([userText(0, 'q'), assistant(10), assistant(20, true), assistant(30)]);
    const turns = computePerTurnActivity(transcriptPath, IDLE_THRESHOLD_MS)!;
    expect(turns).toHaveLength(1);
    expect(turns[0].eventCount).toBe(2);
    expect(turns[0].startedAt).toBe(ms(10));
    expect(turns[0].endedAt).toBe(ms(30)); // 侧链 20 未污染 lastAi
  });
});

// ── AskUserQuestion 等待时间扣除 ────────────────────────────────────

/** 构造 assistant 行,content 为 tool_use(name=AskUserQuestion) */
function assistantAskQuestion(sec: number, toolUseId: string): string {
  return JSON.stringify({
    type: 'assistant',
    timestamp: iso(sec),
    message: {
      content: [{ type: 'tool_use', name: 'AskUserQuestion', id: toolUseId, input: {} }],
    },
  });
}

/** 构造 user 行,content 为 tool_result 匹配指定 tool_use_id */
function userAskAnswer(sec: number, toolUseId: string): string {
  return JSON.stringify({
    type: 'user',
    timestamp: iso(sec),
    message: {
      content: [{ type: 'tool_result', tool_use_id: toolUseId, content: 'answer' }],
    },
  });
}

describe('computePerTurnActivity — AskUserQuestion 等待扣除', () => {
  it('短等待(<15min)被强制纳入 idle,从 active 扣除', () => {
    // ai@10 → Ask@20 → answer@290(4.5min 等待,<15min 阈值)
    // 标准 liveness: gap=270s < 900s → 不计 idle → active=280s
    // AskUserQuestion 扣除: duration=270s ≤ 900s → extraIdle=270s → active=280-270=10s
    write([
      userText(0, 'q'),
      assistant(10),
      assistantAskQuestion(20, 'call_1'),
      userAskAnswer(290, 'call_1'),
    ]);
    const turns = computePerTurnActivity(transcriptPath, IDLE_THRESHOLD_MS)!;
    expect(turns).toHaveLength(1);
    // 3 个 AI 事件: assistant@10, AskUserQuestion@20, answer@290
    expect(turns[0].askQuestionWaitMs).toBe(270_000);
    expect(turns[0].activeMs).toBe(10_000); // 仅 10s(10→20)为真活跃
    expect(turns[0].idleMs).toBe(270_000);  // AskUserQuestion 等待已注入
  });

  it('长等待(>15min)不重复计入,标准 liveness 已捕获', () => {
    // ai@10 → Ask@20 → answer@2000(33min 等待,>15min 阈值)
    // 标准 liveness: gap=1980s > 900s → idle=1980s
    // AskUserQuestion: duration=1980s > 900s → 不补 extraIdle → 不重复
    write([
      userText(0, 'q'),
      assistant(10),
      assistantAskQuestion(20, 'call_1'),
      userAskAnswer(2000, 'call_1'),
    ]);
    const turns = computePerTurnActivity(transcriptPath, IDLE_THRESHOLD_MS)!;
    expect(turns).toHaveLength(1);
    expect(turns[0].askQuestionWaitMs).toBe(1_980_000); // 追踪但不重复加
    expect(turns[0].idleMs).toBe(1_980_000);           // 标准 liveness 已计入
    expect(turns[0].activeMs).toBe(10_000);             // 仅 10s 真活跃
  });

  it('同一 turn 内多次 AskUserQuestion 等待分别扣除', () => {
    // ai@10 → Ask1@20 → answer1@200(3min) → Ask2@210 → answer2@400(~3min)
    write([
      userText(0, 'q'),
      assistant(10),
      assistantAskQuestion(20, 'call_1'),
      userAskAnswer(200, 'call_1'),
      assistantAskQuestion(210, 'call_2'),
      userAskAnswer(400, 'call_2'),
    ]);
    const turns = computePerTurnActivity(transcriptPath, IDLE_THRESHOLD_MS)!;
    expect(turns).toHaveLength(1);
    // askQuestionWaitMs = (200-20) + (400-210) = 180+190 = 370s
    expect(turns[0].askQuestionWaitMs).toBe(370_000);
    // extraIdle 只补 ≤15min 的部分: 180s + 190s = 370s
    expect(turns[0].idleMs).toBe(370_000);
    // 真活跃: (10→20=10s) + (200→210=10s) = 20s
    // span = 400-10=390s, active = 390-370=20s
    expect(turns[0].activeMs).toBe(20_000);
  });

  it('无匹配 tool_result 的 AskUserQuestion 不计 gap', () => {
    // AskUserQuestion 发出但用户从未回答(如 session 中断)
    write([
      userText(0, 'q'),
      assistant(10),
      assistantAskQuestion(20, 'call_unanswered'),
    ]);
    const turns = computePerTurnActivity(transcriptPath, IDLE_THRESHOLD_MS)!;
    expect(turns).toHaveLength(1);
    expect(turns[0].askQuestionWaitMs).toBe(0);
    expect(turns[0].idleMs).toBe(0);
  });

  it('跨 turn 的 AskUserQuestion 按 askedAt 归属对应 turn', () => {
    // turn1: q1 → assistant → Ask@50 → answer@890(14min,<15min)
    // turn2: q2(回答后才发起的第二个 prompt)
    write([
      userText(0, 'q1'),
      assistant(10),
      assistantAskQuestion(50, 'call_1'),
      userAskAnswer(890, 'call_1'),
      userText(900, 'q2'),
      assistant(910),
    ]);
    const turns = computePerTurnActivity(transcriptPath, IDLE_THRESHOLD_MS)!;
    // turn1: AI 范围 10→890,含 Ask@50→answer@890=840s<900s → 补 idle
    // turn2: AI 范围 910→910(单事件)
    expect(turns.map(t => t.promptIndex)).toEqual([1, 2]);
    expect(turns[0].askQuestionWaitMs).toBe(840_000);
    expect(turns[0].idleMs).toBe(840_000);
    expect(turns[0].activeMs).toBe(40_000);  // 10→50 = 40s 真活跃
    expect(turns[1].askQuestionWaitMs).toBe(0); // turn2 无 Ask
  });
});
