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
