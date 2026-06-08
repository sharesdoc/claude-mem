
import { SSEBroadcaster } from '../SSEBroadcaster.js';
import type { WorkerService } from '../../worker-service.js';
import { getOsUserName } from '../../../shared/os-user.js';
import { resolveUserLabel } from '../../../shared/user-label.js';

export class SessionEventBroadcaster {
  constructor(
    private sseBroadcaster: SSEBroadcaster,
    private workerService: WorkerService
  ) {}

  broadcastNewPrompt(prompt: {
    id: number;
    content_session_id: string;
    project: string;
    platform_source: string;
    prompt_number: number;
    prompt_text: string;
    created_at_epoch: number;
  }): void {
    // user_name is the OS user this worker is running as — same user the
    // prompt originated from, since claude-mem is a single-machine tool.
    this.sseBroadcaster.broadcast({
      type: 'new_prompt',
      prompt: { ...prompt, user_name: getOsUserName(), user_label: resolveUserLabel() }
    });

    // T-13: nudge SyncAgent so the new prompt reaches the upstream within
    // ~2s (debounced). No-op when sync is disabled / role=server.
    this.workerService.syncAgent?.scheduleSoon();
  }

  broadcastSessionStarted(sessionDbId: number, project: string): void {
    this.sseBroadcaster.broadcast({
      type: 'session_started',
      sessionDbId,
      project
    });
  }

  broadcastObservationQueued(sessionDbId: number): void {
    this.sseBroadcaster.broadcast({
      type: 'observation_queued',
      sessionDbId
    });
  }

  broadcastSessionCompleted(sessionDbId: number): void {
    this.sseBroadcaster.broadcast({
      type: 'session_completed',
      timestamp: Date.now(),
      sessionDbId
    });
  }

  broadcastSummarizeQueued(): void {
    this.workerService.broadcastProcessingStatus();
  }
}
