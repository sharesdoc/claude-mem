import { Database } from 'bun:sqlite';

export type InputRoundStatus = 'open' | 'closed' | 'processing' | 'completed' | 'failed';

export interface InputRound {
  content_session_id: string;
  prompt_number: number;
  status: InputRoundStatus;
  closed_at_epoch: number | null;
}

export interface RoundSlice {
  content_session_id: string;
  prompt_number: number;
  slice_number: number;
  start_raw_event_id: number;
  end_raw_event_id: number;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  idempotency_key: string;
  result_text?: string | null;
}

export interface RawRoundEvent {
  id: number;
  event_type: 'user_input' | 'observation' | 'summarize' | 'internal' | 'sub_agent';
  tool_use_id: string | null;
  tool_name: string | null;
  tool_input: string | null;
  tool_response: string | null;
  cwd: string | null;
  last_assistant_message: string | null;
  prompt_number: number | null;
  agent_id: string | null;
  agent_type: string | null;
  payload: string | null;
}

const DEFAULT_MAX_SLICE_BYTES = 128 * 1024;

export class InputRoundStore {
  constructor(
    private readonly db: Database,
    private readonly options: { maxSliceBytes?: number } = {},
  ) {}

  openRound(contentSessionId: string, promptNumber: number): void {
    this.closeOpenRound(contentSessionId);
    this.db.prepare(`
      INSERT INTO input_rounds (content_session_id, prompt_number, status, opened_at_epoch)
      VALUES (?, ?, 'open', ?)
      ON CONFLICT(content_session_id, prompt_number) DO NOTHING
    `).run(contentSessionId, promptNumber, Date.now());
  }

  appendEvent(contentSessionId: string, promptNumber: number, payload: string, eventType: 'internal' | 'observation' | 'summarize' | 'sub_agent' = 'internal'): number {
    const result = this.db.prepare(`
      INSERT INTO raw_events (content_session_id, event_type, prompt_number, payload, created_at_epoch)
      VALUES (?, ?, ?, ?, ?)
    `).run(contentSessionId, eventType, promptNumber, payload, Date.now());
    return Number(result.lastInsertRowid);
  }

  closeOpenRound(contentSessionId: string): number {
    const row = this.db.prepare(`
      SELECT prompt_number FROM input_rounds
      WHERE content_session_id = ? AND status = 'open'
      ORDER BY prompt_number DESC LIMIT 1
    `).get(contentSessionId) as { prompt_number: number } | null;
    if (!row) return 0;
    const changed = this.db.prepare(`
      UPDATE input_rounds SET status = 'closed', closed_at_epoch = ?
      WHERE content_session_id = ? AND prompt_number = ? AND status = 'open'
    `).run(Date.now(), contentSessionId, row.prompt_number).changes;
    if (changed > 0) this.createSlices(contentSessionId, row.prompt_number);
    return changed;
  }

  closeRound(contentSessionId: string, promptNumber: number): number {
    const changed = this.db.prepare(`
      UPDATE input_rounds SET status = 'closed', closed_at_epoch = ?
      WHERE content_session_id = ? AND prompt_number = ? AND status = 'open'
    `).run(Date.now(), contentSessionId, promptNumber).changes;
    if (changed > 0) this.createSlices(contentSessionId, promptNumber);
    return changed;
  }

  createSlices(contentSessionId: string, promptNumber: number): number {
    const round = this.getRound(contentSessionId, promptNumber);
    if (!round || round.status === 'open') return 0;
    const existing = this.db.prepare(`SELECT COUNT(*) AS count FROM round_slices WHERE content_session_id = ? AND prompt_number = ?`).get(contentSessionId, promptNumber) as { count: number };
    if (existing.count > 0) return 0;
    const events = this.db.prepare(`
      SELECT id,
             LENGTH(
               COALESCE(tool_input, '') || COALESCE(tool_response, '') ||
               COALESCE(payload, '') || COALESCE(last_assistant_message, '') ||
               COALESCE(tool_name, '') || COALESCE(cwd, '')
             ) AS size
      FROM raw_events
      WHERE content_session_id = ? AND prompt_number = ? ORDER BY id ASC
    `).all(contentSessionId, promptNumber) as Array<{ id: number; size: number }>;
    if (events.length === 0) return 0;
    const maxBytes = this.options.maxSliceBytes ?? DEFAULT_MAX_SLICE_BYTES;
    let sliceNumber = 1;
    let start = events[0].id;
    let end = start;
    let bytes = 0;
    const insert = this.db.prepare(`
      INSERT INTO round_slices (content_session_id, prompt_number, slice_number, start_raw_event_id, end_raw_event_id, status, idempotency_key)
      VALUES (?, ?, ?, ?, ?, 'pending', ?)
    `);
    for (const event of events) {
      if (bytes > 0 && bytes + event.size > maxBytes) {
        insert.run(contentSessionId, promptNumber, sliceNumber, start, end, `${contentSessionId}:${promptNumber}:${sliceNumber}`);
        sliceNumber++;
        start = event.id;
        bytes = 0;
      }
      end = event.id;
      bytes += event.size;
    }
    insert.run(contentSessionId, promptNumber, sliceNumber, start, end, `${contentSessionId}:${promptNumber}:${sliceNumber}`);
    return sliceNumber;
  }

  getRound(contentSessionId: string, promptNumber: number): InputRound | null {
    return (this.db.prepare(`SELECT content_session_id, prompt_number, status, closed_at_epoch FROM input_rounds WHERE content_session_id = ? AND prompt_number = ?`).get(contentSessionId, promptNumber) as InputRound | null) ?? null;
  }

  getOpenRound(contentSessionId: string): InputRound | null {
    return this.db.prepare(`
      SELECT content_session_id, prompt_number, status, closed_at_epoch
      FROM input_rounds WHERE content_session_id = ? AND status = 'open'
      ORDER BY prompt_number DESC LIMIT 1
    `).get(contentSessionId) as InputRound | null;
  }

  hasRounds(contentSessionId: string): boolean {
    const row = this.db.prepare(`
      SELECT 1 AS present FROM input_rounds WHERE content_session_id = ? LIMIT 1
    `).get(contentSessionId) as { present: number } | null;
    return row?.present === 1;
  }

  getSlices(contentSessionId: string, promptNumber: number): RoundSlice[] {
    return this.db.prepare(`SELECT * FROM round_slices WHERE content_session_id = ? AND prompt_number = ? ORDER BY slice_number ASC`).all(contentSessionId, promptNumber) as RoundSlice[];
  }

  getClosedSlices(contentSessionId: string, promptNumber: number): RoundSlice[] {
    return this.db.prepare(`SELECT * FROM round_slices WHERE content_session_id = ? AND prompt_number = ? AND status IN ('pending', 'processing', 'failed') ORDER BY slice_number ASC`).all(contentSessionId, promptNumber) as RoundSlice[];
  }

  recordSliceResult(contentSessionId: string, promptNumber: number, sliceNumber: number, result: string): void {
    this.db.prepare(`
      UPDATE round_slices SET result_text = ?, status = 'completed'
      WHERE content_session_id = ? AND prompt_number = ? AND slice_number = ?
        AND status != 'completed'
    `).run(result, contentSessionId, promptNumber, sliceNumber);
    const incomplete = this.db.prepare(`
      SELECT COUNT(*) AS count FROM round_slices
      WHERE content_session_id = ? AND prompt_number = ? AND status != 'completed'
    `).get(contentSessionId, promptNumber) as { count: number };
    if (incomplete.count === 0) {
      this.db.prepare(`UPDATE input_rounds SET status = 'completed' WHERE content_session_id = ? AND prompt_number = ? AND status IN ('closed', 'processing')`).run(contentSessionId, promptNumber);
    }
  }

  getRoundResult(contentSessionId: string, promptNumber: number): string | null {
    const total = this.db.prepare(`
      SELECT COUNT(*) AS count FROM round_slices
      WHERE content_session_id = ? AND prompt_number = ?
    `).get(contentSessionId, promptNumber) as { count: number };
    const rows = this.db.prepare(`
      SELECT result_text FROM round_slices
      WHERE content_session_id = ? AND prompt_number = ? AND status = 'completed'
      ORDER BY slice_number ASC
    `).all(contentSessionId, promptNumber) as Array<{ result_text: string | null }>;
    if (total.count === 0 || rows.length !== total.count || rows.some(row => row.result_text == null)) return null;
    return rows.map(row => row.result_text as string).join('\n');
  }

  isOpen(contentSessionId: string, promptNumber: number): boolean {
    return this.getRound(contentSessionId, promptNumber)?.status === 'open';
  }

  getRawEvents(contentSessionId: string, promptNumber: number): RawRoundEvent[] {
    return this.db.prepare(`
      SELECT id, event_type, tool_use_id, tool_name, tool_input, tool_response, cwd,
             last_assistant_message, prompt_number, agent_id, agent_type, payload, tool_use_id
      FROM raw_events WHERE content_session_id = ? AND prompt_number = ? ORDER BY id ASC
    `).all(contentSessionId, promptNumber) as RawRoundEvent[];
  }

  getSliceEvents(contentSessionId: string, slice: RoundSlice): RawRoundEvent[] {
    return this.db.prepare(`
      SELECT id, event_type, tool_use_id, tool_name, tool_input, tool_response, cwd,
             last_assistant_message, prompt_number, agent_id, agent_type, payload, tool_use_id
      FROM raw_events
      WHERE content_session_id = ? AND prompt_number = ?
        AND id BETWEEN ? AND ?
      ORDER BY id ASC
    `).all(contentSessionId, slice.prompt_number, slice.start_raw_event_id, slice.end_raw_event_id) as RawRoundEvent[];
  }

  markSessionEnded(contentSessionId: string): number {
    return this.closeOpenRound(contentSessionId);
  }
}
