import { readFileSync, existsSync } from 'fs';
import { logger } from '../utils/logger.js';
import { SYSTEM_REMINDER_REGEX } from '../utils/tag-stripping.js';

function isGeminiTranscriptFormat(content: string): { isGemini: true; messages: any[] } | { isGemini: false } {
  try {
    const parsed = JSON.parse(content);
    if (parsed && Array.isArray(parsed.messages)) {
      return { isGemini: true, messages: parsed.messages };
    }
  } catch {
    // Not a valid single JSON object — assume JSONL
  }
  return { isGemini: false };
}

export function extractLastMessage(
  transcriptPath: string,
  role: 'user' | 'assistant',
  stripSystemReminders: boolean = false
): string {
  if (!transcriptPath || !existsSync(transcriptPath)) {
    logger.warn('PARSER', `Transcript path missing or file does not exist: ${transcriptPath}`);
    return '';
  }

  const content = readFileSync(transcriptPath, 'utf-8').trim();
  if (!content) {
    logger.warn('PARSER', `Transcript file exists but is empty: ${transcriptPath}`);
    return '';
  }

  const geminiCheck = isGeminiTranscriptFormat(content);
  if (geminiCheck.isGemini) {
    return extractLastMessageFromGeminiTranscript(geminiCheck.messages, role, stripSystemReminders);
  }

  return extractLastMessageFromJsonl(content, role, stripSystemReminders);
}

function extractLastMessageFromGeminiTranscript(
  messages: any[],
  role: 'user' | 'assistant',
  stripSystemReminders: boolean
): string {
  const geminiRole = role === 'assistant' ? 'gemini' : 'user';

  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg?.type === geminiRole && typeof msg.content === 'string') {
      let text = msg.content;
      if (stripSystemReminders) {
        text = text.replace(SYSTEM_REMINDER_REGEX, '');
        text = text.replace(/\n{3,}/g, '\n\n').trim();
      }
      return text;
    }
  }

  return '';
}

/**
 * Extract last message from a JSONL transcript.
 *
 * Supports two field conventions for the per-line role marker:
 * - Claude Code:  `{"type":"assistant",...}`
 * - Cursor:       `{"role":"assistant",...}`
 *
 * The most recent assistant turn is often a pure tool_use block with no text
 * content (especially in Cursor, where the agent's last action before the
 * user replies is a tool call). We therefore keep scanning backwards until
 * we find a turn with non-empty text content, instead of returning early on
 * the first matching role.
 */
export function extractLastMessageFromJsonl(
  content: string,
  role: 'user' | 'assistant',
  stripSystemReminders: boolean
): string {
  const lines = content.split('\n');
  let foundMatchingRole = false;
  let lastEmptyText: string | null = null;

  for (let i = lines.length - 1; i >= 0; i--) {
    const rawLine = lines[i];
    if (!rawLine) continue;
    // Tolerate truncated/malformed JSONL lines (crash mid-write, partial flush).
    // A bad line shouldn't crash the summarization pipeline — skip and move on.
    let line: any;
    try {
      line = JSON.parse(rawLine);
    } catch {
      continue;
    }
    const lineRole = line.type ?? line.role;
    if (lineRole !== role) continue;
    foundMatchingRole = true;

    if (!line.message?.content) continue;

    let text = '';
    const msgContent = line.message.content;
    if (typeof msgContent === 'string') {
      text = msgContent;
    } else if (Array.isArray(msgContent)) {
      text = msgContent
        .filter(
          (c: any): c is { type: 'text'; text: string } =>
            !!c && typeof c === 'object' && c.type === 'text' && typeof c.text === 'string'
        )
        .map((c) => c.text)
        .join('\n');
    } else {
      // Unknown content shape (null, number, plain object, etc.) — skip rather
      // than throw. A single weird line should not crash the entire summary
      // pipeline; we already tolerate malformed JSONL via the parse-catch
      // above, and this is the same class of defensive forward compat
      // (CodeRabbit / Greptile review on PR #2282).
      continue;
    }

    if (stripSystemReminders) {
      text = text.replace(SYSTEM_REMINDER_REGEX, '');
      text = text.replace(/\n{3,}/g, '\n\n').trim();
    }

    if (text && text.trim()) {
      return text;
    }
    // Remember the first (most recent) empty-text turn as a fallback so the
    // caller can still distinguish "no matching role" from "matching role but
    // tool-only turns" if every later turn is empty.
    if (lastEmptyText === null) {
      lastEmptyText = text;
    }
  }

  if (!foundMatchingRole) {
    return '';
  }
  return lastEmptyText ?? '';
}

// ── transcript timestamp extraction ─────────────────────────────────────

export interface AssistantEntry {
  text: string;
  timestampEpoch: number;
}

/**
 * 提取 transcript 中最后一条主链 assistant 消息的文本和墙钟时间。
 *
 * 与 extractLastMessage 同源同一解析循环,但额外返回 line.timestamp,
 * 并过滤子代理(sidechain)消息。Gemini transcript(单 JSON messages 数组,
 * 无逐行 timestamp)→ 直接返回 null。
 *
 * 返回 null 意味着没有可用的主链 assistant 时间戳,应回落其他来源。
 */
export function extractLastAssistantEntry(transcriptPath: string): AssistantEntry | null {
  if (!transcriptPath || !existsSync(transcriptPath)) {
    return null;
  }

  let content: string;
  try {
    content = readFileSync(transcriptPath, 'utf-8').trim();
  } catch {
    return null;
  }
  if (!content) return null;

  // Gemini 格式无逐行 timestamp,直接返回 null 让调用方回落
  const geminiCheck = isGeminiTranscriptFormat(content);
  if (geminiCheck.isGemini) return null;

  return extractLastAssistantEntryFromJsonl(content);
}

function extractLastAssistantEntryFromJsonl(content: string): AssistantEntry | null {
  const lines = content.split('\n');
  // 当前时间 + 60s 容差,用于过滤未来时间戳(时钟偏差/损坏)
  const nowEpoch = Date.now();
  const FUTURE_SKEW_MS = 60_000;

  for (let i = lines.length - 1; i >= 0; i--) {
    const rawLine = lines[i];
    if (!rawLine) continue;

    let line: any;
    try {
      line = JSON.parse(rawLine);
    } catch {
      continue;
    }

    // 只取主链(非 sidechain) assistant 消息
    if (line.type !== 'assistant' && line.role !== 'assistant') continue;
    if (line.isSidechain) continue;

    // 必须有文本内容
    if (!line.message?.content) continue;

    let text = '';
    const msgContent = line.message.content;
    if (typeof msgContent === 'string') {
      text = msgContent;
    } else if (Array.isArray(msgContent)) {
      text = msgContent
        .filter((c: any): c is { type: 'text'; text: string } =>
          !!c && typeof c === 'object' && c.type === 'text' && typeof c.text === 'string')
        .map(c => c.text)
        .join('\n');
    }

    if (!text || !text.trim()) continue;

    // ── 时间戳 sanity clamp ──────────────────────────────────────────
    // 坏行跳过继续扫描,不 return null 放弃整次提取
    const rawTs = line.timestamp;
    if (!rawTs || typeof rawTs !== 'string') continue;

    const parsed = Date.parse(rawTs);
    if (Number.isNaN(parsed)) continue;
    if (parsed <= 0) continue;
    if (parsed > nowEpoch + FUTURE_SKEW_MS) continue;

    return { text, timestampEpoch: parsed };
  }

  return null;
}

// ── per-turn activity (liveness-based idle detection) ───────────────────

export interface TurnActivity {
  /** turn 序号(1-based,大致对齐 prompt_number,但应以 promptedAt↔created_at 配对为准) */
  promptIndex: number;
  /** 触发本 turn 的用户输入(split)时间戳 epoch ms,用于与 prompt.created_at 稳健配对 */
  promptedAt: number | null;
  /** 该 turn 首个 AI 事件 epoch ms(turn 起算点,不含前置 think time) */
  startedAt: number;
  /** 该 turn 末个 AI 事件 epoch ms */
  endedAt: number;
  /** 真实活跃时长(ms) = turn 跨度 − idleMs */
  activeMs: number;
  /** 挂起时长(ms):turn 内相邻 AI 事件间隔超过阈值的总和 */
  idleMs: number;
  /** turn 内 AI 事件数 */
  eventCount: number;
}

interface TimedTranscriptEvent {
  ts: number;
  kind: 'ai' | 'split';
}

/** 未来时间戳容差:过滤时钟偏差/损坏行(与 extractLastAssistantEntryFromJsonl 同源) */
const TRANSCRIPT_FUTURE_SKEW_MS = 60_000;

/**
 * 判定一行 transcript 属于"AI 活动"还是"用户分隔点"。
 *
 * - ai:    assistant 行(含 thinking/text/tool_use),或 user 行但 content 含
 *          tool_result(工具回传,属 AI 工作流的一部分)
 * - split: user 行且 content 不含 tool_result(真用户输入:字符串或含 text),
 *          它开启新 turn,从而把"用户思考间隔(think time)"排除在执行时长之外
 */
function classifyTranscriptLine(line: any): 'ai' | 'split' | null {
  const t = line?.type ?? line?.role;
  if (t === 'assistant') return 'ai';
  if (t === 'user') {
    const msg = line?.message;
    if (!msg || typeof msg !== 'object') return null;
    const c = msg.content;
    if (typeof c === 'string') return 'split';
    if (Array.isArray(c)) {
      const hasToolResult = c.some(
        (x: any) => !!x && typeof x === 'object' && x.type === 'tool_result'
      );
      return hasToolResult ? 'ai' : 'split';
    }
  }
  return null;
}

/**
 * 收集 transcript 内所有主链(非 sidechain)带时间戳的事件,按时间升序返回。
 * 跳过无 timestamp / 损坏 / 未来时间戳的行。
 */
function collectTimedTranscriptEvents(content: string): TimedTranscriptEvent[] {
  const lines = content.split('\n');
  const nowEpoch = Date.now();
  const evts: TimedTranscriptEvent[] = [];
  for (const rawLine of lines) {
    if (!rawLine) continue;
    let line: any;
    try {
      line = JSON.parse(rawLine);
    } catch {
      continue;
    }
    // 仅主链:子代理(sidechain)事件不计入宿主任务的活动度
    if (line.isSidechain) continue;
    const kind = classifyTranscriptLine(line);
    if (!kind) continue;
    const rawTs = line.timestamp;
    if (!rawTs || typeof rawTs !== 'string') continue;
    const ts = Date.parse(rawTs);
    if (!Number.isFinite(ts) || ts <= 0) continue;
    if (ts > nowEpoch + TRANSCRIPT_FUTURE_SKEW_MS) continue;
    evts.push({ ts, kind });
  }
  evts.sort((a, b) => a.ts - b.ts);
  return evts;
}

/**
 * 按"真用户输入"(split 点)把 transcript 切成若干 turn(对应各次 prompt),
 * 对每个 turn 用 liveness 检测计算真实活跃时长(activeMs)与挂起时长(idleMs)。
 *
 * 核心思想(替代绝对时长 cap,避免误杀合法长任务):
 * - AI 正常工作时必然持续输出事件,两次相邻 AI 事件间隔很短;
 * - 若相邻间隔超过 idleThresholdMs,判定该段为"挂起"(睡眠/进程残留/卡死);
 * - activeMs = turn 跨度(末个 AI 事件 − 首个 AI 事件) − idleMs。
 *
 * 阈值标定(历史 143,262 个间隔样本):P99=47.8s、P99.9=3.2min;正常工作(48s 内)
 * 与挂起(小时级)之间存在数量级断层。推荐 idleThresholdMs = 15min(900_000)。
 *
 * 边界:tool_use → tool_result 的工具执行间隔也会被计入;绝大多数 <1min,但单次
 * 超长工具(如跑测试套件)可能被误标为挂起,第一版可接受。
 *
 * transcript 缺失 / Gemini 单 JSON 格式(无逐行 timestamp)/ 无任何带时间戳事件
 * → 返回 null,调用方应回落到 completed_at_epoch − created_at_epoch 墙钟。
 */
export function computePerTurnActivity(
  transcriptPath: string,
  idleThresholdMs: number
): TurnActivity[] | null {
  if (!transcriptPath || !existsSync(transcriptPath)) return null;

  let content: string;
  try {
    content = readFileSync(transcriptPath, 'utf-8').trim();
  } catch {
    return null;
  }
  if (!content) return null;

  // Gemini 格式无逐行 timestamp → 无法做 liveness 检测,回落
  if (isGeminiTranscriptFormat(content).isGemini) return null;

  const evts = collectTimedTranscriptEvents(content);
  if (evts.length === 0) return null;

  // 用 split 切 turn:遇到 split 即收尾当前 turn 并开启下一个。
  // promptIndex 对齐 prompt_number:首个 split 之前的 AI 事件极少(transcript
  // 通常以 user 输入开头),若有则落入 promptIndex=0,由调用方按 ≥1 过滤。
  interface TurnState {
    /** 进入本 turn 的用户输入(split)时间戳 */
    promptedAt: number | null;
    firstAi: number | null;
    lastAi: number | null;
    idle: number;
    count: number;
  }

  const turns: TurnActivity[] = [];
  let turnIdx = 0;
  let cur: TurnState = { promptedAt: null, firstAi: null, lastAi: null, idle: 0, count: 0 };

  const flush = () => {
    if (cur.firstAi === null) return; // 空 turn(无 AI 事件),不计入
    const span = (cur.lastAi ?? cur.firstAi) - cur.firstAi;
    turns.push({
      promptIndex: turnIdx,
      promptedAt: cur.promptedAt,
      startedAt: cur.firstAi,
      endedAt: cur.lastAi ?? cur.firstAi,
      activeMs: Math.max(0, span - cur.idle),
      idleMs: cur.idle,
      eventCount: cur.count,
    });
  };

  for (const { ts, kind } of evts) {
    if (kind === 'split') {
      flush();
      turnIdx++;
      // 该 split 是即将开始的 turn 的用户输入时间戳,用于与 prompt.created_at 配对
      cur = { promptedAt: ts, firstAi: null, lastAi: null, idle: 0, count: 0 };
    } else {
      // ai
      if (cur.lastAi !== null) {
        const gap = ts - cur.lastAi;
        if (gap > idleThresholdMs) cur.idle += gap;
      } else {
        cur.firstAi = ts;
      }
      cur.lastAi = ts;
      cur.count++;
    }
  }
  flush(); // 末尾 turn(最后一个 prompt 通常无后续 split 收尾)
  return turns;
}
