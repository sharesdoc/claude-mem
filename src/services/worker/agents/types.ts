
import type { ActiveSession } from '../../worker-types.js';
import type { ParsedObservation, ParsedSummary } from '../../../sdk/parser.js';

export interface WorkerRef {
  sseBroadcaster?: {
    broadcast(event: SSEEventPayload): void;
  };
  broadcastProcessingStatus?: () => void;
  /**
   * Optional SyncAgent (T-06). When present, callers fire scheduleSoon()
   * after persisting an observation/summary/prompt so push is debounced
   * to 2s and the local watermark stays close to real time. Optional
   * because client-only / disabled-sync installs run without an agent.
   */
  syncAgent?: {
    scheduleSoon(): void;
  };
}

export interface ObservationSSEPayload {
  id: number;
  memory_session_id: string | null;
  session_id: string;
  platform_source: string;
  type: string;
  title: string | null;
  subtitle: string | null;
  text: string | null;
  narrative: string | null;
  facts: string;
  concepts: string;
  files_read: string;
  files_modified: string;
  project: string;
  prompt_number: number;
  user_name?: string | null;
  /** Sync identity (sdk_sessions.user_label) — viewer uses this to update
   * its project→user map without waiting for a full refresh. */
  user_label?: string | null;
  created_at: string;
  created_at_epoch: number;
  /** Content hash for dedup across local + sync sources. */
  content_hash?: string | null;
}

export interface SummarySSEPayload {
  id: number;
  session_id: string;
  platform_source: string;
  request: string | null;
  investigated: string | null;
  learned: string | null;
  completed: string | null;
  next_steps: string | null;
  notes: string | null;
  project: string;
  prompt_number: number;
  user_name?: string | null;
  user_label?: string | null;
  created_at: string;
  created_at_epoch: number;
  content_hash?: string | null;
}

export type SSEEventPayload =
  | { type: 'new_observation'; observation: ObservationSSEPayload }
  | { type: 'new_summary'; summary: SummarySSEPayload };

export interface StorageResult {
  observationIds: number[];
  summaryId: number | null;
  createdAtEpoch: number;
}

export interface ResponseProcessingContext {
  session: ActiveSession;
  worker: WorkerRef | undefined;
  discoveryTokens: number;
  originalTimestamp: number | null;
}

export interface ParsedResponse {
  observations: ParsedObservation[];
  summary: ParsedSummary | null;
}

export interface BaseAgentConfig {
  dbManager: import('../DatabaseManager.js').DatabaseManager;
  sessionManager: import('../SessionManager.js').SessionManager;
}

export const FALLBACK_ERROR_PATTERNS = [
  '429',           // Rate limit
  '500',           // Internal server error
  '502',           // Bad gateway
  '503',           // Service unavailable
  'ECONNREFUSED',  // Connection refused
  'ETIMEDOUT',     // Timeout
  'fetch failed',  // Network failure
] as const;
