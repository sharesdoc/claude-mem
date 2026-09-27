import { Database } from 'bun:sqlite';

export type RawEventType = 'user_input' | 'observation' | 'summarize' | 'internal' | 'sub_agent';

export interface RawEventInput {
  contentSessionId: string;
  sessionDbId?: number;
  project?: string;
  platformSource?: string;
  eventType: RawEventType;
  toolUseId?: string;
  toolName?: string;
  toolInput?: unknown;
  toolResponse?: unknown;
  cwd?: string;
  lastAssistantMessage?: string;
  promptNumber?: number;
  agentId?: string;
  agentType?: string;
  parentAgentId?: string;
  parentEventId?: number;
  payload?: unknown;
  createdAtEpoch?: number;
}

/**
 * Append-only archive for hook payloads.
 *
 * This table is intentionally independent from pending_messages and has no
 * foreign key to sdk_sessions. The work queue may delete or retry a message,
 * and session cleanup must not delete the original event.
 */
export class RawEventStore {
  constructor(private readonly db: Database) {}

  append(event: RawEventInput): number {
    const result = this.db.prepare(`
      INSERT OR IGNORE INTO raw_events (
        content_session_id, session_db_id, project, platform_source,
        event_type, tool_use_id, tool_name, tool_input, tool_response,
        cwd, last_assistant_message, prompt_number, agent_id, agent_type,
        parent_agent_id, parent_event_id, payload,
        created_at_epoch
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      event.contentSessionId,
      event.sessionDbId ?? null,
      event.project ?? null,
      event.platformSource ?? null,
      event.eventType,
      event.toolUseId ?? null,
      event.toolName ?? null,
      serialize(event.toolInput),
      serialize(event.toolResponse),
      event.cwd ?? null,
      event.lastAssistantMessage ?? null,
      event.promptNumber ?? null,
      event.agentId ?? null,
      event.agentType ?? null,
      event.parentAgentId ?? null,
      event.parentEventId ?? null,
      serialize(event.payload),
      event.createdAtEpoch ?? Date.now(),
    );

    return result.changes > 0 ? Number(result.lastInsertRowid) : 0;
  }
}

function serialize(value: unknown): string | null {
  if (value === undefined) return null;
  return typeof value === 'string' ? value : JSON.stringify(value);
}
