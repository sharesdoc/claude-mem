import { Database } from 'bun:sqlite';
import type { PendingMessage } from '../worker-types.js';
import { logger } from '../../utils/logger.js';

export interface RecoveryPreparationResult {
  eligibleCount: number;
  discardedCount: number;
  skippedBecauseOverLimit: boolean;
}

export interface PersistentPendingMessage {
  id: number;
  session_db_id: number;
  content_session_id: string;
  message_type: 'observation' | 'summarize';
  tool_name: string | null;
  tool_input: string | null;
  tool_response: string | null;
  cwd: string | null;
  last_assistant_message: string | null;
  prompt_number: number | null;
  status: 'pending' | 'processing';
  created_at_epoch: number;
  agent_type: string | null;
  agent_id: string | null;
  round_slice_key: string | null;
  round_slice_number: number | null;
  round_slice_start_raw_event_id: number | null;
  round_slice_end_raw_event_id: number | null;
}

export class PendingMessageStore {
  private db: Database;

  constructor(
    db: Database,
    private onMutate?: () => void
  ) {
    this.db = db;
  }

  enqueue(sessionDbId: number, contentSessionId: string, message: PendingMessage): number {
    const now = Date.now();
    const stmt = this.db.prepare(`
      INSERT OR IGNORE INTO pending_messages (
        session_db_id, content_session_id, tool_use_id, message_type,
        tool_name, tool_input, tool_response, cwd,
        last_assistant_message,
        prompt_number, status, created_at_epoch,
        agent_type, agent_id, round_slice_key, round_slice_number,
        round_slice_start_raw_event_id, round_slice_end_raw_event_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, NULL, NULL, NULL, NULL)
    `);

    const result = stmt.run(
      sessionDbId,
      contentSessionId,
      message.toolUseId ?? null,
      message.type,
      message.tool_name || null,
      message.tool_input ? JSON.stringify(message.tool_input) : null,
      message.tool_response ? JSON.stringify(message.tool_response) : null,
      message.cwd || null,
      message.last_assistant_message || null,
      message.prompt_number || null,
      now,
      message.agentType ?? null,
      message.agentId ?? null
    );

    if (result.changes > 0) {
      this.onMutate?.();
      return result.lastInsertRowid as number;
    }
    return 0;
  }

  enqueueRoundSlice(
    sessionDbId: number,
    contentSessionId: string,
    message: PendingMessage,
  ): number {
    const slice = message.roundSlice;
    if (!slice) throw new Error('Round slice metadata is required for slice queue tasks');
    const result = this.db.prepare(`
      INSERT OR IGNORE INTO pending_messages (
        session_db_id, content_session_id, tool_use_id, message_type,
        tool_name, tool_input, tool_response, cwd, last_assistant_message,
        prompt_number, status, created_at_epoch, agent_type, agent_id,
        round_slice_key, round_slice_number, round_slice_start_raw_event_id,
        round_slice_end_raw_event_id
      ) VALUES (?, ?, NULL, 'observation', ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?)
    `).run(
      sessionDbId,
      contentSessionId,
      message.tool_name ?? null,
      message.tool_input === undefined ? null : JSON.stringify(message.tool_input),
      message.tool_response === undefined ? null : JSON.stringify(message.tool_response),
      message.cwd ?? null,
      message.last_assistant_message ?? null,
      slice.promptNumber,
      Date.now(),
      message.agentType ?? null,
      message.agentId ?? null,
      slice.idempotencyKey,
      slice.sliceNumber,
      slice.startRawEventId,
      slice.endRawEventId,
    );
    if (result.changes > 0) {
      this.onMutate?.();
      return Number(result.lastInsertRowid);
    }
    return 0;
  }

  claimNextMessage(sessionDbId: number, roundSlicesOnly = false): PersistentPendingMessage | null {
    const sql = `
      UPDATE pending_messages
         SET status = 'processing'
       WHERE id = (
         SELECT id FROM pending_messages
          WHERE session_db_id = ? AND status = 'pending'
            AND (? = 0 OR round_slice_key IS NOT NULL)
            AND (round_slice_key IS NULL OR EXISTS (
              SELECT 1 FROM round_slices rs
              WHERE rs.content_session_id = pending_messages.content_session_id
                AND rs.prompt_number = pending_messages.prompt_number
                AND rs.slice_number = pending_messages.round_slice_number
                AND rs.idempotency_key = pending_messages.round_slice_key
                AND rs.status IN ('pending', 'processing', 'failed')
                AND EXISTS (
                  SELECT 1 FROM input_rounds ir
                  WHERE ir.content_session_id = rs.content_session_id
                    AND ir.prompt_number = rs.prompt_number
                    AND ir.status != 'open'
                )
            ))
            AND (prompt_number IS NULL OR NOT EXISTS (
              SELECT 1 FROM input_rounds ir
              WHERE ir.content_session_id = pending_messages.content_session_id
                AND ir.prompt_number = pending_messages.prompt_number
                AND ir.status = 'open'
            ) OR EXISTS (
              SELECT 1 FROM round_slices rs
              WHERE rs.content_session_id = pending_messages.content_session_id
                AND rs.prompt_number = pending_messages.prompt_number
                AND rs.status IN ('pending', 'processing', 'failed')
            ))
          ORDER BY CASE WHEN round_slice_key IS NULL THEN 0 ELSE 1 END,
                   prompt_number ASC, round_slice_number ASC, id ASC
          LIMIT 1
       )
       RETURNING *
    `;
    const claimed = this.db.prepare(sql).get(sessionDbId, roundSlicesOnly ? 1 : 0) as PersistentPendingMessage | null;
    if (claimed) {
      logger.info('QUEUE', `CLAIMED | sessionDbId=${sessionDbId} | messageId=${claimed.id} | type=${claimed.message_type}`, {
        sessionId: sessionDbId
      });
    }
    if (claimed) {
      this.onMutate?.();
    }
    return claimed;
  }

  clearPendingForSession(sessionDbId: number): number {
    const stmt = this.db.prepare(`
      DELETE FROM pending_messages WHERE session_db_id = ?
    `);
    const changes = stmt.run(sessionDbId).changes;
    if (changes > 0) {
      logger.info('QUEUE', `CLEARED | sessionDbId=${sessionDbId} | rowsDeleted=${changes}`, {
        sessionId: sessionDbId
      });
      this.onMutate?.();
    }
    return changes;
  }

  resetProcessingToPending(sessionDbId: number): number {
    const stmt = this.db.prepare(`
      UPDATE pending_messages
         SET status = 'pending'
       WHERE session_db_id = ? AND status = 'processing'
    `);
    const changes = stmt.run(sessionDbId).changes;
    if (changes > 0) {
      logger.info('QUEUE', `RESET_PROCESSING | sessionDbId=${sessionDbId} | rowsReset=${changes}`, {
        sessionId: sessionDbId
      });
      this.onMutate?.();
    }
    return changes;
  }

  getPendingCount(sessionDbId: number): number {
    const stmt = this.db.prepare(`
      SELECT COUNT(*) as count FROM pending_messages
      WHERE session_db_id = ? AND status IN ('pending', 'processing')
    `);
    const result = stmt.get(sessionDbId) as { count: number };
    return result.count;
  }

  getTotalQueueDepth(): number {
    const stmt = this.db.prepare(`
      SELECT COUNT(*) as count FROM pending_messages
      WHERE status IN ('pending', 'processing')
    `);
    const result = stmt.get() as { count: number };
    return result.count;
  }

  /**
   * Applies the bounded recovery policy to one still-active session.
   * Original payloads are stored separately in raw_events, so deleting queue
   * rows here intentionally does not delete the source event.
   */
  prepareRecovery(sessionDbId: number, cutoffEpoch: number, maxMessages: number): RecoveryPreparationResult {
    // Backfill the archive before dropping any legacy queue rows. This protects
    // events queued before raw_events was introduced, and also makes queue
    // cleanup safe if a prior raw write was interrupted.
    this.db.prepare(`
      INSERT OR IGNORE INTO raw_events (
        content_session_id, session_db_id, event_type, tool_use_id,
        tool_name, tool_input, tool_response, cwd, last_assistant_message,
        prompt_number, agent_id, agent_type, created_at_epoch
      )
      SELECT content_session_id, session_db_id, message_type, tool_use_id,
             tool_name, tool_input, tool_response, cwd, last_assistant_message,
             prompt_number, agent_id, agent_type, created_at_epoch
      FROM pending_messages
      WHERE session_db_id = ? AND status IN ('pending', 'processing')
    `).run(sessionDbId);

    const eligible = this.db.prepare(`
      SELECT COUNT(*) AS count
      FROM pending_messages
      WHERE session_db_id = ? AND status IN ('pending', 'processing') AND created_at_epoch >= ?
    `).get(sessionDbId, cutoffEpoch) as { count: number };

    if (eligible.count > maxMessages) {
      const discarded = this.db.prepare(`
        DELETE FROM pending_messages
        WHERE session_db_id = ? AND status IN ('pending', 'processing')
      `).run(sessionDbId).changes;
      return {
        eligibleCount: eligible.count,
        discardedCount: discarded,
        skippedBecauseOverLimit: true,
      };
    }

    const discarded = this.db.prepare(`
      DELETE FROM pending_messages
      WHERE session_db_id = ? AND status IN ('pending', 'processing') AND created_at_epoch < ?
    `).run(sessionDbId, cutoffEpoch).changes;
    return {
      eligibleCount: eligible.count,
      discardedCount: discarded,
      skippedBecauseOverLimit: false,
    };
  }

  hasAnyPendingWork(): boolean {
    return this.getTotalQueueDepth() > 0;
  }

  getSessionsWithPendingMessages(): number[] {
    const stmt = this.db.prepare(`
      SELECT DISTINCT session_db_id FROM pending_messages
      WHERE status IN ('pending', 'processing')
      ORDER BY session_db_id ASC
    `);
    return (stmt.all() as Array<{ session_db_id: number }>).map(row => row.session_db_id);
  }

  confirmProcessed(messageId: number): number {
    const stmt = this.db.prepare(`
      DELETE FROM pending_messages
      WHERE id = ? AND status = 'processing'
    `);
    const changes = stmt.run(messageId).changes;
    if (changes > 0) {
      this.onMutate?.();
    }
    return changes;
  }

  peekPendingTypes(sessionDbId: number): Array<{ message_type: string; tool_name: string | null }> {
    const stmt = this.db.prepare(`
      SELECT message_type, tool_name FROM pending_messages
      WHERE session_db_id = ? AND status IN ('pending', 'processing')
      ORDER BY id ASC
    `);
    return stmt.all(sessionDbId) as Array<{ message_type: string; tool_name: string | null }>;
  }

  peekPendingTypesForPrompt(sessionDbId: number, promptNumber: number): Array<{ message_type: string; tool_name: string | null }> {
    return this.db.prepare(`
      SELECT message_type, tool_name FROM pending_messages
      WHERE session_db_id = ? AND prompt_number = ? AND status IN ('pending', 'processing')
      ORDER BY id ASC
    `).all(sessionDbId, promptNumber) as Array<{ message_type: string; tool_name: string | null }>;
  }

  peekPendingTypesForRound(sessionDbId: number, promptNumber: number): Array<{ message_type: string; tool_name: string | null }> {
    return this.db.prepare(`
      SELECT message_type, tool_name FROM pending_messages
      WHERE session_db_id = ? AND prompt_number = ?
        AND round_slice_key IS NOT NULL
        AND status IN ('pending', 'processing')
      ORDER BY round_slice_number ASC
    `).all(sessionDbId, promptNumber) as Array<{ message_type: string; tool_name: string | null }>;
  }

  toPendingMessage(persistent: PersistentPendingMessage): PendingMessage {
    return {
      type: persistent.message_type,
      tool_name: persistent.tool_name || undefined,
      tool_input: persistent.tool_input ? JSON.parse(persistent.tool_input) : undefined,
      tool_response: persistent.tool_response ? JSON.parse(persistent.tool_response) : undefined,
      prompt_number: persistent.prompt_number || undefined,
      cwd: persistent.cwd || undefined,
      last_assistant_message: persistent.last_assistant_message || undefined,
      agentId: persistent.agent_id ?? undefined,
      agentType: persistent.agent_type ?? undefined
      ,roundSlice: persistent.round_slice_key ? {
        promptNumber: persistent.prompt_number!,
        sliceNumber: persistent.round_slice_number!,
        startRawEventId: persistent.round_slice_start_raw_event_id!,
        endRawEventId: persistent.round_slice_end_raw_event_id!,
        idempotencyKey: persistent.round_slice_key,
      } : undefined
    };
  }
}
