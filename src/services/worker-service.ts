
import path from 'path';
import { existsSync, watchFile, unwatchFile } from 'fs';
import { spawn } from 'child_process';
import { Database } from 'bun:sqlite';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { getWorkerPort, getWorkerHost } from '../shared/worker-utils.js';
import { DATA_DIR, DB_PATH, USER_SETTINGS_PATH, ensureDir } from '../shared/paths.js';
import { HOOK_TIMEOUTS } from '../shared/hook-constants.js';
import { SettingsDefaultsManager } from '../shared/SettingsDefaultsManager.js';
import { getAuthMethodDescription } from '../shared/EnvManager.js';
import { logger } from '../utils/logger.js';
import { ChromaMcpManager } from './sync/ChromaMcpManager.js';
import { ChromaSync } from './sync/ChromaSync.js';
import { configureSupervisorSignalHandlers, getSupervisor, startSupervisor } from '../supervisor/index.js';
import { sanitizeEnv } from '../supervisor/env-sanitizer.js';

import { ensureWorkerStarted as ensureWorkerStartedShared, type WorkerStartResult } from './worker-spawner.js';
import { handleGeneratorExit } from './worker/session/GeneratorExitHandler.js';

export { isPluginDisabledInClaudeSettings } from '../shared/plugin-state.js';
import { isPluginDisabledInClaudeSettings } from '../shared/plugin-state.js';

declare const __DEFAULT_PACKAGE_VERSION__: string;
const packageVersion = typeof __DEFAULT_PACKAGE_VERSION__ !== 'undefined' ? __DEFAULT_PACKAGE_VERSION__ : '0.0.0-dev';

import {
  writePidFile,
  readPidFile,
  removePidFile,
  getPlatformTimeout,
  runOneTimeChromaMigration,
  runOneTimeCwdRemap,
  cleanStalePidFile,
  verifyPidFileOwnership,
  spawnDaemon,
  touchPidFile
} from './infrastructure/ProcessManager.js';
import { runOneTimeV12_4_3Cleanup } from './infrastructure/CleanupV12_4_3.js';
import {
  isPortInUse,
  waitForHealth,
  waitForReadiness,
  waitForPortFree,
  httpShutdown
} from './infrastructure/HealthMonitor.js';
import { performGracefulShutdown } from './infrastructure/GracefulShutdown.js';
import { adoptMergedWorktrees, adoptMergedWorktreesForAllKnownRepos } from './infrastructure/WorktreeAdoption.js';

import { Server } from './server/Server.js';
import { BetterAuthRoutes } from '../server/auth/BetterAuthRoutes.js';
import {
  createServerApiKey,
  listServerApiKeys,
  revokeServerApiKey,
} from '../server/auth/api-key-service.js';
import { ServerV1Routes } from '../server/routes/v1/ServerV1Routes.js';

import {
  updateCursorContextForProject,
  handleCursorCommand
} from './integrations/CursorHooksInstaller.js';
import {
  handleGeminiCliCommand
} from './integrations/GeminiCliHooksInstaller.js';

import { DatabaseManager } from './worker/DatabaseManager.js';
import { SessionManager } from './worker/SessionManager.js';
import { SSEBroadcaster } from './worker/SSEBroadcaster.js';
import { ClaudeProvider, classifyClaudeError } from './worker/ClaudeProvider.js';
import type { WorkerRef } from './worker/agents/types.js';
import { GeminiProvider, classifyGeminiError, isGeminiSelected, isGeminiAvailable } from './worker/GeminiProvider.js';
import { OpenRouterProvider, classifyOpenRouterError, isOpenRouterSelected, isOpenRouterAvailable } from './worker/OpenRouterProvider.js';
import { ClassifiedProviderError, isClassified, type ProviderErrorClass } from './worker/provider-errors.js';
import { PaginationHelper } from './worker/PaginationHelper.js';
import { SettingsManager } from './worker/SettingsManager.js';
import { SearchManager } from './worker/SearchManager.js';
import { FormattingService } from './worker/FormattingService.js';
import { TimelineService } from './worker/TimelineService.js';
import { SessionEventBroadcaster } from './worker/events/SessionEventBroadcaster.js';
import { SessionCompletionHandler } from './worker/session/SessionCompletionHandler.js';
import { setIngestContext, attachIngestGeneratorStarter } from './worker/http/shared.js';
import { DEFAULT_CONFIG_PATH, DEFAULT_STATE_PATH, expandHomePath, filterNativeHookBackedCodexWatches, loadTranscriptWatchConfig } from './transcripts/config.js';
import { TranscriptWatcher } from './transcripts/watcher.js';

import { ViewerRoutes } from './worker/http/routes/ViewerRoutes.js';
import { SessionRoutes } from './worker/http/routes/SessionRoutes.js';
import { DataRoutes } from './worker/http/routes/DataRoutes.js';
import { SearchRoutes } from './worker/http/routes/SearchRoutes.js';
import { SettingsRoutes } from './worker/http/routes/SettingsRoutes.js';
import { LogsRoutes } from './worker/http/routes/LogsRoutes.js';
import { MemoryRoutes } from './worker/http/routes/MemoryRoutes.js';
import { ReportRoutes } from './worker/http/routes/ReportRoutes.js';
import { ReportScheduler } from './worker/reports/ReportScheduler.js';
import { UsersRoutes } from './worker/http/routes/UsersRoutes.js';
import { SyncRoutes } from './worker/http/routes/SyncRoutes.js';
import { SyncStatusRoutes } from './worker/http/routes/SyncStatusRoutes.js';
import { SyncAgent } from './sync/SyncAgent.js';
import { resolveUserLabel } from '../shared/user-label.js';
import { CorpusRoutes } from './worker/http/routes/CorpusRoutes.js';
import { ChromaRoutes } from './worker/http/routes/ChromaRoutes.js';
import { AdminRoutes } from './worker/http/routes/AdminRoutes.js';
import { AuthRoutes } from './worker/http/routes/AuthRoutes.js';
import { serverApiGate } from './worker/http/middleware/serverApiGate.js';
import { AdminSessionStore } from './worker/http/AdminSessionStore.js';

import { CorpusStore } from './worker/knowledge/CorpusStore.js';
import { CorpusBuilder } from './worker/knowledge/CorpusBuilder.js';
import { KnowledgeAgent } from './worker/knowledge/KnowledgeAgent.js';

export interface StatusOutput {
  continue: true;
  suppressOutput: true;
  status: 'ready' | 'error';
  message?: string;
}

export function buildStatusOutput(status: 'ready' | 'error', message?: string): StatusOutput {
  return {
    continue: true,
    suppressOutput: true,
    status,
    ...(message && { message })
  };
}

/**
 * T-14 — pick the bind address from settings + role.
 *
 * Client mode (default) always binds the WORKER_HOST default (127.0.0.1)
 * so client installs can't accidentally expose the ingest endpoint to the
 * LAN. Server mode honours CLAUDE_MEM_SERVER_BIND_HOST when set, falling
 * back to WORKER_HOST when blank. Returning a small struct keeps start()
 * declarative and makes the non-loopback warning easy to test.
 */
function resolveBindAddress(): { host: string; role: 'client' | 'server'; advertised: boolean } {
  const workerHost = getWorkerHost();
  const settings = SettingsDefaultsManager.loadFromFile(USER_SETTINGS_PATH);
  const rawRole = (settings.CLAUDE_MEM_NODE_ROLE ?? 'client').trim().toLowerCase();
  const role: 'client' | 'server' = rawRole === 'server' ? 'server' : 'client';

  let host = workerHost;
  if (role === 'server') {
    const serverHost = (settings.CLAUDE_MEM_SERVER_BIND_HOST ?? '').trim();
    if (serverHost) host = serverHost;
  }

  const advertised = !LOOPBACK_HOSTS.has(host);
  return { host, role, advertised };
}

const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1']);

export class WorkerService implements WorkerRef {
  private server: Server;
  private startTime: number = Date.now();
  private mcpClient: Client;

  private mcpReady: boolean = false;
  private initializationCompleteFlag: boolean = false;
  private isShuttingDown: boolean = false;

  private dbManager: DatabaseManager;
  private sessionManager: SessionManager;
  public sseBroadcaster: SSEBroadcaster;
  private sdkAgent: ClaudeProvider;
  private geminiAgent: GeminiProvider;
  private openRouterAgent: OpenRouterProvider;
  private paginationHelper: PaginationHelper;
  private settingsManager: SettingsManager;
  private sessionEventBroadcaster: SessionEventBroadcaster;
  private completionHandler: SessionCompletionHandler;
  private corpusStore: CorpusStore;

  private searchRoutes: SearchRoutes | null = null;

  private chromaMcpManager: ChromaMcpManager | null = null;
  private transcriptWatcher: TranscriptWatcher | null = null;
  private reportScheduler: ReportScheduler | null = null;

  // T-13 / T-06: Lazily-assigned SyncAgent. Stays undefined when sync is
  // disabled or role=server; callers MUST use `?.scheduleSoon()` so the
  // hook degrades to a no-op.
  public syncAgent?: { scheduleSoon(): void };
  private syncSettingsWatcherActive = false;
  private initializationComplete: Promise<void>;
  private resolveInitialization!: () => void;

  private lastAiInteraction: {
    timestamp: number;
    success: boolean;
    provider: string;
    error?: string;
  } | null = null;

  constructor() {
    this.initializationComplete = new Promise((resolve) => {
      this.resolveInitialization = resolve;
    });

    this.dbManager = new DatabaseManager();
    this.sessionManager = new SessionManager(this.dbManager);
    this.sseBroadcaster = new SSEBroadcaster();
    this.sdkAgent = new ClaudeProvider(this.dbManager, this.sessionManager);
    this.geminiAgent = new GeminiProvider(this.dbManager, this.sessionManager);
    this.openRouterAgent = new OpenRouterProvider(this.dbManager, this.sessionManager);

    this.paginationHelper = new PaginationHelper(this.dbManager);
    this.settingsManager = new SettingsManager(this.dbManager);
    this.sessionEventBroadcaster = new SessionEventBroadcaster(this.sseBroadcaster, this);
    this.completionHandler = new SessionCompletionHandler(
      this.sessionManager,
      this.sessionEventBroadcaster,
      this.dbManager,
    );
    this.corpusStore = new CorpusStore();

    setIngestContext({
      sessionManager: this.sessionManager,
      dbManager: this.dbManager,
      eventBroadcaster: this.sessionEventBroadcaster,
    });

    this.sessionManager.setOnPendingMutate(() => this.broadcastProcessingStatus());

    this.mcpClient = new Client({
      name: 'worker-search-proxy',
      version: packageVersion
    }, { capabilities: {} });

    this.server = new Server({
      getInitializationComplete: () => this.initializationCompleteFlag,
      getMcpReady: () => this.mcpReady,
      onShutdown: () => this.shutdown(),
      onRestart: () => this.shutdown(),
      workerPath: __filename,
      role: resolveBindAddress().role,
      allowedOrigins: (SettingsDefaultsManager.loadFromFile(USER_SETTINGS_PATH).CLAUDE_MEM_SERVER_ALLOWED_ORIGINS ?? '')
        .split(',').map(s => s.trim()).filter(Boolean),
      getAiStatus: () => {
        let provider = 'claude';
        if (isOpenRouterSelected() && isOpenRouterAvailable()) provider = 'openrouter';
        else if (isGeminiSelected() && isGeminiAvailable()) provider = 'gemini';
        return {
          provider,
          authMethod: getAuthMethodDescription(),
          lastInteraction: this.lastAiInteraction
            ? {
                timestamp: this.lastAiInteraction.timestamp,
                success: this.lastAiInteraction.success,
                ...(this.lastAiInteraction.error && { error: this.lastAiInteraction.error }),
              }
            : null,
        };
      },
      getQueueHealth: () => this.sessionManager.isBullMqQueueEnabled()
        ? this.sessionManager.getQueueHealth()
        : null,
      preBodyParserRoutes: [
        new BetterAuthRoutes(() => this.dbManager.getConnection()),
      ],
    });

    this.registerRoutes();

    this.registerSignalHandlers();
  }

  private registerSignalHandlers(): void {
    configureSupervisorSignalHandlers(async () => {
      this.isShuttingDown = true;
      await this.shutdown();
    });
  }

  private registerRoutes(): void {
    // Single admin-session registry shared by the API gate, AuthRoutes
    // (mints sessions on login) and DataRoutes (verifies before writes).
    const isServerMode = resolveBindAddress().role === 'server';
    const adminSessions = new AdminSessionStore();
    const statsSettings = SettingsDefaultsManager.loadFromFile(USER_SETTINGS_PATH);
    const serverAccessToken = (statsSettings.CLAUDE_MEM_SERVER_ACCESS_TOKEN ?? '').trim();

    // X-006: server mode is default-deny — mounted before every route below
    // so no endpoint is reachable without loopback origin, the shared access
    // token, or an admin session (public login shell excepted).
    if (isServerMode) {
      this.server.app.use(serverApiGate(adminSessions, serverAccessToken));
    }

    this.server.registerRoutes(new ChromaRoutes());
    this.server.registerRoutes(new AdminRoutes());
    // T-25: /api/sync/status — always-on so the viewer Header badge
    // can render in both client and server modes. Returns role +
    // syncEnabled so the viewer can hide the badge when irrelevant.
    this.server.registerRoutes(new SyncStatusRoutes(this.dbManager, () => this.syncAgent));

    this.server.app.get('/api/context/inject', async (req, res, next) => {
      if (!this.initializationCompleteFlag || !this.searchRoutes) {
        logger.warn('SYSTEM', 'Context requested before initialization complete, returning empty');
        res.status(200).json({ content: [{ type: 'text', text: '' }] });
        return;
      }

      next(); 
    });

    this.server.app.use(['/api', '/v1'], async (req, res, next) => {
      if (req.path === '/chroma/status' || req.path === '/health' || req.path === '/readiness' || req.path === '/version') {
        next();
        return;
      }

      if (this.initializationCompleteFlag) {
        next();
        return;
      }

      logger.debug('WORKER', `Request to ${req.method} ${req.path} rejected — DB not initialized`);
      res.status(503).json({
        error: 'Service initializing',
        message: 'Database is still initializing, please retry'
      });
      return;
    });

    this.server.registerRoutes(new ViewerRoutes(this.sseBroadcaster, this.dbManager, this.sessionManager));
    const sessionRoutes = new SessionRoutes(this.sessionManager, this.dbManager, this.sdkAgent, this.geminiAgent, this.openRouterAgent, this.sessionEventBroadcaster, this, this.completionHandler);
    this.server.registerRoutes(sessionRoutes);
    attachIngestGeneratorStarter((sessionDbId, source) =>
      sessionRoutes.ensureGeneratorRunning(sessionDbId, source),
    );
    // In server mode, destructive DataRoutes endpoints require a valid admin
    // token; in client/standalone mode there is no login so the flag is false
    // and those endpoints stay open (loopback-only by CORS anyway).
    this.server.registerRoutes(new DataRoutes(this.paginationHelper, this.dbManager, this.sessionManager, this.sseBroadcaster, this, this.startTime, adminSessions, isServerMode, serverAccessToken));
    this.server.registerRoutes(new ReportRoutes(this.dbManager, isServerMode, serverAccessToken, isServerMode ? adminSessions : undefined));
    this.server.registerRoutes(new SettingsRoutes(this.settingsManager));
    this.server.registerRoutes(new LogsRoutes());
    this.server.registerRoutes(new MemoryRoutes(this.dbManager, 'claude-mem'));
    this.server.registerRoutes(new ServerV1Routes({
      getDatabase: () => this.dbManager.getConnection(),
    }));

    // T-19: /api/users is server-only — surfaces user_label aggregates the
    // viewer uses to render the employee selector. Skipping registration in
    // client mode means an accidentally-pointed viewer 404s loudly instead
    // of returning a misleading single-user list.
    if (isServerMode) {
      this.server.registerRoutes(new UsersRoutes(this.dbManager));
      // T-41: Auth routes for server-mode viewer login
      this.server.registerRoutes(new AuthRoutes(this.dbManager, adminSessions));
      // T-09: /api/sync/ingest — server-only ingest endpoint.
      const settings = SettingsDefaultsManager.loadFromFile(USER_SETTINGS_PATH);
      this.server.registerRoutes(new SyncRoutes(this.dbManager, {
        CLAUDE_MEM_SERVER_TRUSTED_PROXIES: settings.CLAUDE_MEM_SERVER_TRUSTED_PROXIES ?? '',
        CLAUDE_MEM_SERVER_REQUIRE_TLS: settings.CLAUDE_MEM_SERVER_REQUIRE_TLS ?? 'false',
        CLAUDE_MEM_SERVER_AUTH_MODE: settings.CLAUDE_MEM_SERVER_AUTH_MODE ?? 'none',
        CLAUDE_MEM_SERVER_ALLOWED_USERS: settings.CLAUDE_MEM_SERVER_ALLOWED_USERS ?? '',
        CLAUDE_MEM_SERVER_ACCESS_TOKEN: settings.CLAUDE_MEM_SERVER_ACCESS_TOKEN ?? '',
        CLAUDE_MEM_SERVER_INGEST_MAX_BATCH: settings.CLAUDE_MEM_SERVER_INGEST_MAX_BATCH ?? '1000',
      }, this.sseBroadcaster));
    }
  }

  async start(): Promise<void> {
    const port = getWorkerPort();
    const { host, role, advertised } = resolveBindAddress();

    await startSupervisor();
    await this.sessionManager.initializeQueueEngine();

    await this.server.listen(port, host);

    writePidFile({
      pid: process.pid,
      port,
      startedAt: new Date().toISOString()
    });

    getSupervisor().registerProcess('worker', {
      pid: process.pid,
      type: 'worker',
      startedAt: new Date().toISOString()
    });

    logger.info('SYSTEM', 'Worker started', { host, port, pid: process.pid, role });

    if (advertised) {
      // Bind != loopback is an operator opt-in for server mode reachable via
      // frpc / nginx (S-doc §4). Surface it loudly so a misconfiguration on
      // a client install can't accidentally expose ingest to the LAN.
      logger.info('SYSTEM', `Worker is listening on a non-loopback interface (${host}); ensure CLAUDE_MEM_SERVER_TRUSTED_PROXIES + ALLOWED_USERS are configured.`);
    }

    this.initializeBackground().catch((error) => {
      logger.error('SYSTEM', 'Background initialization failed', {}, error as Error);
    });
  }

  private async initializeBackground(): Promise<void> {
    try {
      logger.info('WORKER', 'Background initialization starting...');

      const { ModeManager } = await import('./domain/ModeManager.js');
      const { SettingsDefaultsManager } = await import('../shared/SettingsDefaultsManager.js');
      const { USER_SETTINGS_PATH } = await import('../shared/paths.js');

      const settings = SettingsDefaultsManager.loadFromFile(USER_SETTINGS_PATH);

      const modeId = settings.CLAUDE_MEM_MODE;
      ModeManager.getInstance().loadMode(modeId);
      logger.info('SYSTEM', `Mode loaded: ${modeId}`);

      if (settings.CLAUDE_MEM_MODE === 'local' || !settings.CLAUDE_MEM_MODE) {
        logger.info('WORKER', 'Checking for one-time Chroma migration...');
        runOneTimeChromaMigration();
      }

      logger.info('WORKER', 'Checking for one-time CWD remap...');
      runOneTimeCwdRemap();

      // Weekly work report scheduler (daily, default 13:00) — never blocks exit.
      try {
        this.reportScheduler = new ReportScheduler(this.dbManager);
        this.reportScheduler.start();
      } catch (error) {
        logger.error('WORKER', 'ReportScheduler bootstrap failed', {}, error as Error);
      }

      // Defer worktree adoption until core init (migrations, pragma setup,
      // DatabaseManager handle) is fully finished. Firing in parallel here
      // races the main DB connection and produced spurious CANTOPEN errors
      // on startup. .then() runs after this init function returns and
      // resolveInitialization() is called from the caller.
      this.initializationComplete
        .then(() => {
          logger.info('WORKER', 'Adopting merged worktrees (background)...');
          return adoptMergedWorktreesForAllKnownRepos({});
        })
        .then(adoptions => {
          if (adoptions) {
            for (const adoption of adoptions) {
              if (adoption.adoptedObservations > 0 || adoption.adoptedSummaries > 0 || adoption.chromaUpdates > 0) {
                logger.info('SYSTEM', 'Merged worktrees adopted in background', adoption);
              }
              if (adoption.errors.length > 0) {
                logger.warn('SYSTEM', 'Worktree adoption had per-branch errors', {
                  repoPath: adoption.repoPath,
                  errors: adoption.errors
                });
              }
            }
          }
        })
        .catch(err => {
          logger.error('WORKER', 'Worktree adoption failed (background)', {}, err instanceof Error ? err : new Error(String(err)));
        });

      const chromaEnabled = settings.CLAUDE_MEM_CHROMA_ENABLED !== 'false';
      if (chromaEnabled) {
        this.chromaMcpManager = ChromaMcpManager.getInstance();
        logger.info('SYSTEM', 'ChromaMcpManager initialized (lazy - connects on first use)');
      } else {
        logger.info('SYSTEM', 'Chroma disabled via CLAUDE_MEM_CHROMA_ENABLED=false, skipping ChromaMcpManager');
      }

      logger.info('WORKER', 'Initializing database manager...');
      await this.dbManager.initialize();

      const sweepResult = this.dbManager.getSessionStore().db.prepare(`
        UPDATE pending_messages
           SET status = 'pending'
         WHERE status = 'processing'
      `).run();

      if (sweepResult.changes > 0) {
        logger.info('SYSTEM', `Startup orphan sweep reclaimed ${sweepResult.changes} processing rows`);
      }

      // T-06 + T-14: launch SyncAgent only in client mode with sync turned
      // on and a non-empty upstream URL. Anything missing → no agent now,
      // but a watcher on settings.json will retry once the install/restart
      // script writes the sync config (race seen in practice when worker
      // boots before install script finishes writing settings.json).
      // MUST run AFTER dbManager.initialize() above — the agent's initial
      // tick reads the DB, so starting it earlier threw "Database not
      // initialized" on every boot.
      try {
        if (!this.tryStartSyncAgent()) {
          this.watchSyncSettings();
        }
      } catch (error) {
        logger.error('SYNC', 'SyncAgent bootstrap failed', {}, error as Error);
      }

      runOneTimeV12_4_3Cleanup();

      logger.info('WORKER', 'Initializing search services...');
      const formattingService = new FormattingService();
      const timelineService = new TimelineService();
      const searchManager = new SearchManager(
        this.dbManager.getSessionSearch(),
        this.dbManager.getSessionStore(),
        this.dbManager.getChromaSync(),
        formattingService,
        timelineService
      );
      this.searchRoutes = new SearchRoutes(searchManager);
      this.server.registerRoutes(this.searchRoutes);
      logger.info('WORKER', 'SearchManager initialized and search routes registered');

      const { SearchOrchestrator } = await import('./worker/search/SearchOrchestrator.js');
      const corpusSearchOrchestrator = new SearchOrchestrator(
        this.dbManager.getSessionSearch(),
        this.dbManager.getSessionStore(),
        this.dbManager.getChromaSync()
      );
      const corpusBuilder = new CorpusBuilder(
        this.dbManager.getSessionStore(),
        corpusSearchOrchestrator,
        this.corpusStore
      );
      const knowledgeAgent = new KnowledgeAgent(this.corpusStore);
      this.server.registerRoutes(new CorpusRoutes(this.corpusStore, corpusBuilder, knowledgeAgent));
      logger.info('WORKER', 'CorpusRoutes registered');

      this.initializationCompleteFlag = true;
      this.resolveInitialization();
      logger.info('SYSTEM', 'Core initialization complete (DB + search ready)');

      await this.startTranscriptWatcher(settings);

      if (this.chromaMcpManager) {
        ChromaSync.backfillAllProjects(this.dbManager.getSessionStore()).then(() => {
          logger.info('CHROMA_SYNC', 'Backfill check complete for all projects');
        }).catch(error => {
          logger.error('CHROMA_SYNC', 'Backfill failed (non-blocking)', {}, error as Error);
        });
      }

      const mcpServerPath = path.join(__dirname, 'mcp-server.cjs');
      this.mcpReady = existsSync(mcpServerPath);

      this.runMcpSelfCheck(mcpServerPath).catch(err => {
        logger.debug('WORKER', 'MCP self-check failed (non-fatal)', { error: err.message });
      });

      return;
    } catch (error) {
      logger.error('SYSTEM', 'Background initialization failed', {}, error instanceof Error ? error : undefined);
    }
  }

  private async runMcpSelfCheck(mcpServerPath: string): Promise<void> {
    try {
      getSupervisor().assertCanSpawn('mcp server');
      const transport = new StdioClientTransport({
        command: process.execPath,
        args: [mcpServerPath],
        env: Object.fromEntries(
          Object.entries(sanitizeEnv(process.env)).filter(([, value]) => value !== undefined)
        ) as Record<string, string>
      });

      const MCP_INIT_TIMEOUT_MS = 60000;
      const mcpConnectionPromise = this.mcpClient.connect(transport);

      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(
          () => reject(new Error('MCP connection timeout')),
          MCP_INIT_TIMEOUT_MS
        );
      });

      await Promise.race([mcpConnectionPromise, timeoutPromise]);
      logger.info('WORKER', 'MCP loopback self-check connected successfully');

      await transport.close();
    } catch (error) {
      logger.warn('WORKER', 'MCP loopback self-check failed', { 
        error: error instanceof Error ? error.message : String(error) 
      });
    }
  }

  private async startTranscriptWatcher(settings: ReturnType<typeof SettingsDefaultsManager.loadFromFile>): Promise<void> {
    const transcriptsEnabled = settings.CLAUDE_MEM_TRANSCRIPTS_ENABLED !== 'false';
    if (!transcriptsEnabled) {
      logger.info('TRANSCRIPT', 'Transcript watcher disabled via CLAUDE_MEM_TRANSCRIPTS_ENABLED=false');
      return;
    }

    const configPath = settings.CLAUDE_MEM_TRANSCRIPTS_CONFIG_PATH || DEFAULT_CONFIG_PATH;
    const resolvedConfigPath = expandHomePath(configPath);

    if (!existsSync(resolvedConfigPath)) {
      logger.info('TRANSCRIPT', 'Transcript watcher config not found; skipping automatic transcript capture', {
        configPath: resolvedConfigPath
      });
      return;
    }

    const allowCodexTranscriptIngestion = settings.CLAUDE_MEM_CODEX_TRANSCRIPT_INGESTION === 'true';
    const { config: transcriptConfig, removed } = filterNativeHookBackedCodexWatches(
      loadTranscriptWatchConfig(configPath),
      allowCodexTranscriptIngestion
    );
    const statePath = expandHomePath(transcriptConfig.stateFile ?? DEFAULT_STATE_PATH);

    if (removed > 0) {
      logger.warn('TRANSCRIPT', 'Skipped Codex transcript watch because native Codex hooks are authoritative', {
        removed,
        optInSetting: 'CLAUDE_MEM_CODEX_TRANSCRIPT_INGESTION=true',
      });
    }

    if (transcriptConfig.watches.length === 0) {
      logger.info('TRANSCRIPT', 'Transcript watcher config has no active watches; skipping automatic transcript capture', {
        configPath: resolvedConfigPath,
      });
      return;
    }

    try {
      this.transcriptWatcher = new TranscriptWatcher(transcriptConfig, statePath);
      await this.transcriptWatcher.start();
    } catch (error) {
      this.transcriptWatcher?.stop();
      this.transcriptWatcher = null;
      if (error instanceof Error) {
        logger.error('WORKER', 'Failed to start transcript watcher (continuing without transcript ingestion)', {
          configPath: resolvedConfigPath
        }, error);
      } else {
        logger.error('WORKER', 'Failed to start transcript watcher with non-Error (continuing without transcript ingestion)', {
          configPath: resolvedConfigPath
        }, new Error(String(error)));
      }
      return;
    }
    logger.info('TRANSCRIPT', 'Transcript watcher started', {
      configPath: resolvedConfigPath,
      statePath,
      watches: transcriptConfig.watches.length
    });
  }

  private getActiveAgent(): ClaudeProvider | GeminiProvider | OpenRouterProvider {
    if (isOpenRouterSelected() && isOpenRouterAvailable()) {
      return this.openRouterAgent;
    }
    if (isGeminiSelected() && isGeminiAvailable()) {
      return this.geminiAgent;
    }
    return this.sdkAgent;
  }

  /**
   * Re-classify a raw error at the worker-service dispatch site using the
   * active provider's classifier. Returns null when the provider classifier
   * doesn't recognize the shape (caller falls back to default behavior).
   *
   * Most provider errors should already be classified at the provider
   * boundary — this is a safety net for errors from inside the SDK that
   * never round-tripped through fetch (e.g. Anthropic SDK exceptions).
   */
  private reclassifyAtDispatch(
    error: unknown,
    agent: ClaudeProvider | GeminiProvider | OpenRouterProvider
  ): ClassifiedProviderError | null {
    try {
      if (agent instanceof ClaudeProvider) {
        return classifyClaudeError(error);
      }
      if (agent instanceof GeminiProvider) {
        // Without a status code we still want network/spawn detection.
        return classifyGeminiError({ cause: error });
      }
      if (agent instanceof OpenRouterProvider) {
        return classifyOpenRouterError({ cause: error });
      }
    } catch {
      // If the classifier itself throws, fall back to unclassified.
    }
    return null;
  }

  private startSessionProcessor(
    session: ReturnType<typeof this.sessionManager.getSession>,
    source: string
  ): void {
    if (!session) return;

    const sid = session.sessionDbId;
    const agent = this.getActiveAgent();
    const providerName = agent.constructor.name;

    if (session.abortController.signal.aborted) {
      logger.debug('SYSTEM', 'Replacing aborted AbortController before starting generator', {
        sessionId: session.sessionDbId
      });
      session.abortController = new AbortController();
    }

    let hadUnrecoverableError = false;
    let sessionFailed = false;

    logger.info('SYSTEM', `Starting generator (${source}) using ${providerName}`, { sessionId: sid });

    session.lastGeneratorActivity = Date.now();

    session.generatorPromise = agent.startSession(session, this)
      .catch(async (error: unknown) => {
        const errorMessage = (error as Error)?.message || '';

        // Dispatch on F4 ClassifiedProviderError.kind. Replaces the old
        // string-matching allowlist (#2244). Already-classified errors
        // propagate kind from the provider boundary; raw errors get
        // re-classified here using provider-specific helpers based on the
        // active agent.
        const classified: ClassifiedProviderError | null = isClassified(error)
          ? error
          : this.reclassifyAtDispatch(error, agent);

        // FOREIGN KEY constraint failures from SQLite are unrecoverable but
        // not provider-specific; check before deferring to the classifier so
        // FK failures don't get misclassified as transient and retry forever
        // (per-provider classifiers don't recognize FK errors).
        const isFkConstraintFailure = errorMessage.includes('FOREIGN KEY constraint failed');

        const dispatchKind: ProviderErrorClass | null = isFkConstraintFailure
          ? 'unrecoverable'
          : (classified ? classified.kind : null);

        if (dispatchKind === 'unrecoverable' || dispatchKind === 'auth_invalid' || dispatchKind === 'quota_exhausted') {
          hadUnrecoverableError = true;
          this.lastAiInteraction = {
            timestamp: Date.now(),
            success: false,
            provider: providerName,
            error: errorMessage,
          };
          const logLabel =
            dispatchKind === 'auth_invalid' ? 'auth invalid' :
            dispatchKind === 'quota_exhausted' ? 'quota exhausted' : 'unrecoverable';
          logger.error('SDK', `Unrecoverable generator error (${logLabel}) - will NOT restart`, {
            sessionId: session.sessionDbId,
            project: session.project,
            errorKind: dispatchKind,
            errorMessage
          });
          return;
        }

        if (this.isSessionTerminatedError(error)) {
          logger.warn('SDK', 'SDK resume failed, falling back to standalone processing', {
            sessionId: session.sessionDbId,
            project: session.project,
            reason: error instanceof Error ? error.message : String(error)
          });
          return this.runFallbackForTerminatedSession(session, error);
        }

        const staleResumePatterns = ['aborted by user', 'No conversation found'];
        if (staleResumePatterns.some(p => errorMessage.includes(p))
            && session.memorySessionId) {
          logger.warn('SDK', 'Detected stale resume failure, clearing memorySessionId for fresh start', {
            sessionId: session.sessionDbId,
            memorySessionId: session.memorySessionId,
            errorMessage
          });
          this.dbManager.getSessionStore().updateMemorySessionId(session.sessionDbId, null);
          session.memorySessionId = null;
          session.forceInit = true;
        }
        logger.error('SDK', 'Session generator failed', {
          sessionId: session.sessionDbId,
          project: session.project,
          provider: providerName
        }, error as Error);
        sessionFailed = true;
        this.lastAiInteraction = {
          timestamp: Date.now(),
          success: false,
          provider: providerName,
          error: errorMessage,
        };
        throw error;
      })
      .finally(async () => {
        if (!sessionFailed && !hadUnrecoverableError) {
          this.lastAiInteraction = {
            timestamp: Date.now(),
            success: true,
            provider: providerName,
          };
        }

        // Translate worker-service-specific error flags into the canonical reason enum.
        let reason = session.abortReason ?? null;
        session.abortReason = null;
        if (hadUnrecoverableError) reason = 'restart-guard';
        if (session.idleTimedOut) {
          session.idleTimedOut = false;
          reason = reason ?? 'idle';
        }

        await handleGeneratorExit(session, reason, {
          sessionManager: this.sessionManager,
          completionHandler: this.completionHandler,
          restartGenerator: (s, source) => this.startSessionProcessor(s, source),
        });
      });
  }

  private static readonly SESSION_TERMINATED_PATTERNS = [
    'process aborted by user',
    'processtransport',
    'not ready for writing',
    'session generator failed',
    'claude code process',
  ] as const;

  private isSessionTerminatedError(error: unknown): boolean {
    const msg = error instanceof Error ? error.message : String(error);
    const normalized = msg.toLowerCase();
    return WorkerService.SESSION_TERMINATED_PATTERNS.some(
      pattern => normalized.includes(pattern)
    );
  }

  private async runFallbackForTerminatedSession(
    session: ReturnType<typeof this.sessionManager.getSession>,
    _originalError: unknown
  ): Promise<void> {
    if (!session) return;

    const sessionDbId = session.sessionDbId;

    if (!session.memorySessionId) {
      const syntheticId = `fallback-${sessionDbId}-${Date.now()}`;
      session.memorySessionId = syntheticId;
      this.dbManager.getSessionStore().updateMemorySessionId(sessionDbId, syntheticId);
    }

    if (isGeminiAvailable()) {
      try {
        await this.geminiAgent.startSession(session, this);
        return;
      } catch (e) {
        if (e instanceof Error) {
          logger.warn('WORKER', 'Fallback Gemini failed, trying OpenRouter', {
            sessionId: sessionDbId,
          });
          logger.error('WORKER', 'Gemini fallback error detail', { sessionId: sessionDbId }, e);
        } else {
          logger.error('WORKER', 'Gemini fallback failed with non-Error', { sessionId: sessionDbId }, new Error(String(e)));
        }
      }
    }

    if (isOpenRouterAvailable()) {
      try {
        await this.openRouterAgent.startSession(session, this);
        return;
      } catch (e) {
        if (e instanceof Error) {
          logger.error('WORKER', 'Fallback OpenRouter failed, will abandon messages', { sessionId: sessionDbId }, e);
        } else {
          logger.error('WORKER', 'Fallback OpenRouter failed with non-Error, will abandon messages', { sessionId: sessionDbId }, new Error(String(e)));
        }
      }
    }

    await this.completionHandler.finalizeSession(sessionDbId);
    this.sessionManager.removeSessionImmediate(sessionDbId);
  }

  private async terminateSession(sessionDbId: number, reason: string): Promise<void> {
    logger.info('SYSTEM', 'Session terminated', { sessionId: sessionDbId, reason });

    await this.completionHandler.finalizeSession(sessionDbId);

    this.sessionManager.removeSessionImmediate(sessionDbId);
  }

  /**
   * Read settings.json fresh and start SyncAgent if config is complete.
   * Idempotent — returns true if an agent is already running. Returns
   * false (and logs the reason) when prerequisites aren't met yet so the
   * caller can install a file watcher and retry.
   */
  private tryStartSyncAgent(): boolean {
    if (this.syncAgent) return true;
    const settings = SettingsDefaultsManager.loadFromFile(USER_SETTINGS_PATH);
    const role = (settings.CLAUDE_MEM_NODE_ROLE ?? 'client').trim().toLowerCase();
    const syncEnabled = (settings.CLAUDE_MEM_SYNC_ENABLED ?? 'true').trim().toLowerCase() === 'true';
    const upstream = (settings.CLAUDE_MEM_SYNC_UPSTREAM_URL ?? '').trim();
    if (!(role === 'client' && syncEnabled && upstream)) {
      const reasons: string[] = [];
      if (role !== 'client') reasons.push(`role=${role}`);
      if (!syncEnabled) reasons.push('sync disabled');
      if (!upstream) reasons.push('no upstream URL');
      logger.warn('SYNC', `SyncAgent skipped: ${reasons.join(', ')}`);
      return false;
    }
    const redactPatterns = (settings.CLAUDE_MEM_SYNC_REDACT_PATTERNS ?? '')
      .split(',').map(s => s.trim()).filter(Boolean);
    const intervalMs = Math.max(5000, Number.parseInt(settings.CLAUDE_MEM_SYNC_INTERVAL_MS ?? '5000', 10) || 5000);
    const batchSize = Math.max(1, Number.parseInt(settings.CLAUDE_MEM_SYNC_BATCH_SIZE ?? '200', 10) || 200);
    const retryMax = Math.max(0, Number.parseInt(settings.CLAUDE_MEM_SYNC_RETRY_MAX ?? '8', 10) || 8);
    const authModeRaw = (settings.CLAUDE_MEM_SYNC_AUTH_MODE ?? 'none').trim().toLowerCase();
    const authMode = (['none', 'apikey', 'jwt', 'mtls'] as const).includes(authModeRaw as 'none' | 'apikey' | 'jwt' | 'mtls')
      ? (authModeRaw as 'none' | 'apikey' | 'jwt' | 'mtls')
      : 'none';
    const accessToken = (settings.CLAUDE_MEM_SYNC_ACCESS_TOKEN ?? '').trim();
    const agent = new SyncAgent(this.dbManager, {
      upstreamUrl: upstream,
      userLabel: resolveUserLabel(USER_SETTINGS_PATH),
      authMode,
      apiKey: settings.CLAUDE_MEM_SYNC_API_KEY || undefined,
      accessToken: accessToken || undefined,
      intervalMs,
      batchSize,
      retryMax,
      redactPatterns,
    });
    this.syncAgent = agent;
    agent.start().catch(error => {
      logger.error('SYNC', 'SyncAgent failed to start (continuing without sync)', {}, error as Error);
    });
    logger.info('SYNC', 'SyncAgent attached', { upstream, intervalMs, batchSize, authMode });
    return true;
  }

  /**
   * Poll settings.json for changes and retry SyncAgent bootstrap when it
   * appears. Stops itself once the agent comes up. Covers the worker-
   * starts-before-install-writes-settings race that otherwise leaves the
   * client permanently silent.
   */
  private watchSyncSettings(): void {
    if (this.syncSettingsWatcherActive) return;
    this.syncSettingsWatcherActive = true;
    let debounce: ReturnType<typeof setTimeout> | null = null;
    watchFile(USER_SETTINGS_PATH, { interval: 1000 }, (curr) => {
      if (curr.size === 0) return;
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(() => {
        debounce = null;
        try {
          if (this.tryStartSyncAgent()) {
            unwatchFile(USER_SETTINGS_PATH);
            this.syncSettingsWatcherActive = false;
            logger.info('SYNC', 'SyncAgent late-started after settings.json updated');
          }
        } catch (error) {
          logger.error('SYNC', 'SyncAgent late-start failed', {}, error as Error);
        }
      }, 200);
      debounce.unref?.();
    });
    logger.info('SYNC', 'Watching settings.json for sync config', { path: USER_SETTINGS_PATH });
  }

  async shutdown(): Promise<void> {
    if (this.syncSettingsWatcherActive) {
      unwatchFile(USER_SETTINGS_PATH);
      this.syncSettingsWatcherActive = false;
    }
    if (this.transcriptWatcher) {
      this.transcriptWatcher.stop();
      this.transcriptWatcher = null;
      logger.info('TRANSCRIPT', 'Transcript watcher stopped');
    }
    if (this.reportScheduler) {
      this.reportScheduler.stop();
      this.reportScheduler = null;
    }

    await performGracefulShutdown({
      server: this.server.getHttpServer(),
      sessionManager: this.sessionManager,
      mcpClient: this.mcpClient,
      dbManager: this.dbManager,
      chromaMcpManager: this.chromaMcpManager || undefined
    });
  }

  broadcastProcessingStatus(): void {
    void (async () => {
      const queueDepth = await this.sessionManager.getTotalActiveWork();
      const isProcessing = queueDepth > 0;
      const activeSessions = this.sessionManager.getActiveSessionCount();

      logger.info('WORKER', 'Broadcasting processing status', {
        isProcessing,
        queueDepth,
        activeSessions
      });

      this.sseBroadcaster.broadcast({
        type: 'processing_status',
        isProcessing,
        queueDepth
      });
    })();
  }
}

export async function ensureWorkerStarted(port: number): Promise<WorkerStartResult> {
  return ensureWorkerStartedShared(port, __filename);
}

type ParsedWorkerCommand = {
  command: string | undefined;
  args: string[];
};

function parseWorkerServiceCommand(argv: string[]): ParsedWorkerCommand {
  const [rawCommand, maybeSubCommand, ...rest] = argv;

  if (rawCommand === 'server') {
    const lifecycleCommands = new Set(['start', 'stop', 'restart', 'status']);
    if (maybeSubCommand && lifecycleCommands.has(maybeSubCommand)) {
      return { command: `server-${maybeSubCommand}`, args: rest };
    }
    const serverCommands = new Set(['logs', 'doctor', 'migrate', 'export', 'import', 'api-key', 'sync-keys', 'sync-audit']);
    return {
      command: maybeSubCommand && serverCommands.has(maybeSubCommand) ? `server-${maybeSubCommand}` : 'server-help',
      args: rest,
    };
  }

  if (rawCommand === 'worker') {
    const workerAliases = new Set(['start', 'stop', 'restart', 'status']);
    return {
      command: maybeSubCommand && workerAliases.has(maybeSubCommand) ? maybeSubCommand : 'worker-help',
      args: rest,
    };
  }

  return {
    command: rawCommand,
    args: maybeSubCommand === undefined ? [] : [maybeSubCommand, ...rest],
  };
}

function printServerCommandUnsupported(command: string): never {
  console.error(`Server command not implemented yet: ${command}`);
  console.error('This worker bundle accepts the CLI route, but no backend API exists for it yet.');
  process.exit(1);
}

function printServerCommandHelp(): never {
  console.error('Usage: worker-service server <command>');
  console.error('Commands: start, stop, restart, status, logs, doctor, migrate, export, import');
  console.error('  api-key create|list|revoke');
  console.error('  sync-keys create|list|revoke    (T-30: sync API key management)');
  console.error('  sync-audit --user <LABEL>      (T-27: sync ingest audit)');
  process.exit(1);
}

function printWorkerAliasHelp(): never {
  console.error('Usage: worker-service worker start|stop|restart|status');
  process.exit(1);
}

function runServerBetaServiceCli(command: string): void {
  const serverBetaScript = path.join(__dirname, 'server-beta-service.cjs');
  if (!existsSync(serverBetaScript)) {
    console.error(`Server beta script not found at: ${serverBetaScript}`);
    console.error('Rebuild or reinstall claude-mem so server-beta-service.cjs is available.');
    process.exit(1);
  }

  const child = spawn(process.execPath, [serverBetaScript, command], {
    stdio: 'inherit',
    env: process.env,
  });
  child.on('error', (error) => {
    console.error(`Failed to start server beta command: ${error.message}`);
    process.exit(1);
  });
  child.on('close', (exitCode) => {
    process.exit(exitCode ?? 0);
  });
}

function parseServerApiKeyOptions(args: string[]): Record<string, string> {
  const options: Record<string, string> = {};
  for (let i = 0; i < args.length; i++) {
    const item = args[i];
    if (!item.startsWith('--')) {
      continue;
    }
    const key = item.slice(2);
    const next = args[i + 1];
    if (!next || next.startsWith('--')) {
      options[key] = 'true';
      continue;
    }
    options[key] = next;
    i++;
  }
  return options;
}

function openServerCommandDatabase(): Database {
  ensureDir(DATA_DIR);
  return new Database(DB_PATH, { create: true, readwrite: true });
}

function runServerApiKeyCli(args: string[]): never {
  const subCommand = args[0];
  const options = parseServerApiKeyOptions(args.slice(1));
  const db = openServerCommandDatabase();

  try {
    if (subCommand === 'create') {
      const scopes = (options.scope ?? options.scopes ?? 'memories:read')
        .split(',')
        .map(scope => scope.trim())
        .filter(Boolean);
      const created = createServerApiKey(db, {
        name: options.name ?? 'server-api-key',
        teamId: options.team ?? null,
        projectId: options.project ?? null,
        scopes,
      });
      console.log(JSON.stringify({
        id: created.record.id,
        key: created.rawKey,
        name: created.record.name,
        teamId: created.record.teamId,
        projectId: created.record.projectId,
        scopes: created.record.scopes,
      }, null, 2));
      process.exit(0);
    }

    if (subCommand === 'list') {
      console.log(JSON.stringify(listServerApiKeys(db).map(key => ({
        id: key.id,
        name: key.name,
        prefix: key.prefix,
        teamId: key.teamId,
        projectId: key.projectId,
        scopes: key.scopes,
        status: key.status,
        lastUsedAtEpoch: key.lastUsedAtEpoch,
        expiresAtEpoch: key.expiresAtEpoch,
        createdAtEpoch: key.createdAtEpoch,
      })), null, 2));
      process.exit(0);
    }

    if (subCommand === 'revoke') {
      const id = args[1];
      if (!id) {
        console.error('Usage: worker-service server api-key revoke <id>');
        process.exit(1);
      }
      const revoked = revokeServerApiKey(db, id);
      if (!revoked) {
        console.error(`API key not found: ${id}`);
        process.exit(1);
      }
      console.log(JSON.stringify({ id: revoked.id, status: revoked.status }, null, 2));
      process.exit(0);
    }

    console.error(`Unknown server api-key subcommand: ${subCommand ?? '(none)'}`);
    console.error('Usage: worker-service server api-key create|list|revoke');
    process.exit(1);
  } finally {
    db.close();
  }
}

function runServerSyncKeysCli(args: string[]): never {
  const subCommand = args[0];
  const options = parseServerApiKeyOptions(args.slice(1));
  const db = openServerCommandDatabase();

  try {
    if (subCommand === 'create') {
      const user = options.user;
      if (!user) {
        console.error('Usage: worker-service server sync-keys create --user <LABEL> [--label <NAME>]');
        process.exit(1);
      }
      const created = createServerApiKey(db, {
        name: options.label ?? `sync key for ${user}`,
        scopes: ['sync:push'],
        boundUserLabel: user,
      });
      console.log(JSON.stringify({
        id: created.record.id,
        key: created.rawKey,
        userLabel: user,
        name: created.record.name,
        note: 'Save this key securely — it will not be shown again.',
      }, null, 2));
      process.exit(0);
    }

    if (subCommand === 'list') {
      const keys = listServerApiKeys(db).map(k => {
        // T-29: include bound_user_label from the row (safe because the
        // migration v38 column was added before this CLI ships).
        const row = db.prepare('SELECT bound_user_label FROM api_keys WHERE id = ?')
          .get(k.id) as { bound_user_label: string | null } | undefined;
        return {
          id: k.id,
          name: k.name,
          prefix: k.prefix,
          userLabel: row?.bound_user_label ?? null,
          status: k.status,
          lastUsedAtEpoch: k.lastUsedAtEpoch,
          expiresAtEpoch: k.expiresAtEpoch,
          createdAtEpoch: k.createdAtEpoch,
        };
      });
      console.log(JSON.stringify(keys, null, 2));
      process.exit(0);
    }

    if (subCommand === 'revoke') {
      const id = args[1];
      if (!id) {
        console.error('Usage: worker-service server sync-keys revoke <id>');
        process.exit(1);
      }
      const revoked = revokeServerApiKey(db, id);
      if (!revoked) {
        console.error(`API key not found: ${id}`);
        process.exit(1);
      }
      console.log(JSON.stringify({ id: revoked.id, status: revoked.status }, null, 2));
      process.exit(0);
    }

    console.error(`Unknown server sync-keys subcommand: ${subCommand ?? '(none)'}`);
    console.error('Usage: worker-service server sync-keys create|list|revoke');
    process.exit(1);
  } finally {
    db.close();
  }
}

function runServerSyncAuditCli(args: string[]): never {
  const options = parseServerApiKeyOptions(args);
  const db = openServerCommandDatabase();

  try {
    // T-05: sync_inbox is server-only. If it doesn't exist, we're on a client.
    const hasInbox = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='sync_inbox'"
    ).get() as { name: string } | undefined;
    if (!hasInbox) {
      console.error('sync_inbox table not found — this node is not a sync server (or it has no v37 migration).');
      process.exit(1);
    }

    const conditions: string[] = [];
    const params: (string | number)[] = [];

    if (options.user) {
      conditions.push('user_label = ?');
      params.push(options.user);
    }
    if (options.since) {
      const sinceMs = new Date(options.since).getTime();
      if (!Number.isFinite(sinceMs)) {
        console.error(`Invalid --since date: ${options.since}`);
        process.exit(1);
      }
      conditions.push('applied_at_epoch >= ?');
      params.push(sinceMs);
    }
    if (options.until) {
      const untilMs = new Date(options.until).getTime();
      if (!Number.isFinite(untilMs)) {
        console.error(`Invalid --until date: ${options.until}`);
        process.exit(1);
      }
      conditions.push('applied_at_epoch < ?');
      params.push(untilMs);
    }

    const where = conditions.length > 0 ? ` WHERE ${conditions.join(' AND ')}` : '';

    const summary = db.prepare(`
      SELECT user_label,
             source_table,
             COUNT(*) AS rows_pushed,
             MAX(applied_at_epoch) AS last_push
      FROM sync_inbox${where}
      GROUP BY user_label, source_table
      ORDER BY user_label, last_push DESC
    `).all(...params) as Array<{
      user_label: string; source_table: string; rows_pushed: number; last_push: number;
    }>;

    if (summary.length === 0) {
      console.log('No sync audit records found.');
      process.exit(0);
    }

    // Group by user_label for human-readable output.
    const grouped: Record<string, Array<{ table: string; rows: number; last: string }>> = {};
    for (const r of summary) {
      if (!grouped[r.user_label]) grouped[r.user_label] = [];
      grouped[r.user_label].push({
        table: r.source_table,
        rows: r.rows_pushed,
        last: new Date(r.last_push).toISOString(),
      });
    }

    for (const [user, entries] of Object.entries(grouped)) {
      const total = entries.reduce((s, e) => s + e.rows, 0);
      console.log(`${user}  (${total} total rows)`);
      for (const e of entries) {
        console.log(`  ${e.table.padEnd(20)} ${String(e.rows).padStart(6)} rows  last ${e.last}`);
      }
    }

    process.exit(0);
  } finally {
    db.close();
  }
}

async function main() {
  const { command, args: commandArgs } = parseWorkerServiceCommand(process.argv.slice(2));

  const hookInitiatedCommands = ['start', 'hook', 'restart', '--daemon'];
  if ((command === undefined || hookInitiatedCommands.includes(command)) && isPluginDisabledInClaudeSettings()) {
    process.exit(0);
  }

  const port = getWorkerPort();

  function exitWithStatus(status: 'ready' | 'error', message?: string): never {
    const output = buildStatusOutput(status, message);
    console.log(JSON.stringify(output));
    process.exit(0);
  }

  switch (command) {
    case 'start': {
      const result = await ensureWorkerStarted(port);
      if (result === 'dead') {
        exitWithStatus('error', 'Failed to start worker');
      } else {
        exitWithStatus('ready', result === 'warming' ? 'Worker started; still warming up' : undefined);
      }
      break;
    }

    case 'stop': {
      await httpShutdown(port);
      const freed = await waitForPortFree(port, getPlatformTimeout(15000));
      if (!freed) {
        logger.warn('SYSTEM', 'Port did not free up after shutdown', { port });
      }
      removePidFile();
      logger.info('SYSTEM', 'Worker stopped successfully');
      process.exit(0);
      break;
    }

    case 'restart': {
      logger.info('SYSTEM', 'Restarting worker');
      await httpShutdown(port);
      const restartFreed = await waitForPortFree(port, 5000);
      if (!restartFreed) {
        console.error('Port still bound after shutdown. Resolve manually.');
        process.exit(1);
      }
      removePidFile();
      const restartPid = spawnDaemon(__filename, port);
      if (restartPid === undefined) {
        console.error('Failed to spawn worker daemon during restart.');
        process.exit(1);
      }
      logger.info('SYSTEM', 'Worker restart spawned', { pid: restartPid });
      process.exit(0);
      break;
    }

    case 'status': {
      const portInUse = await isPortInUse(port);
      const pidInfo = readPidFile();
      if (portInUse && pidInfo) {
        console.log('Worker is running');
        console.log(`  PID: ${pidInfo.pid}`);
        console.log(`  Port: ${pidInfo.port}`);
        console.log(`  Started: ${pidInfo.startedAt}`);
        await printQueueStatusIfBullMq(port);
      } else {
        console.log('Worker is not running');
      }
      process.exit(0);
      break;
    }

    case 'server-start':
    case 'server-stop':
    case 'server-restart':
    case 'server-status': {
      runServerBetaServiceCli(command.slice('server-'.length));
      break;
    }

    case 'server-logs':
    case 'server-doctor':
    case 'server-migrate':
    case 'server-export':
    case 'server-import': {
      printServerCommandUnsupported(command.replace('-', ' '));
      break;
    }

    case 'server-api-key': {
      const apiKeyCommand = commandArgs[0];
      if (apiKeyCommand === 'create' || apiKeyCommand === 'list' || apiKeyCommand === 'revoke') {
        runServerApiKeyCli(commandArgs);
      }
      console.error(`Unknown server api-key subcommand: ${apiKeyCommand ?? '(none)'}`);
      console.error('Usage: worker-service server api-key create|list|revoke');
      process.exit(1);
      break;
    }

    case 'server-sync-keys': {
      const syncKeyCommand = commandArgs[0];
      if (syncKeyCommand === 'create' || syncKeyCommand === 'list' || syncKeyCommand === 'revoke') {
        runServerSyncKeysCli(commandArgs);
      }
      console.error(`Unknown server sync-keys subcommand: ${syncKeyCommand ?? '(none)'}`);
      console.error('Usage: worker-service server sync-keys create|list|revoke');
      process.exit(1);
      break;
    }

    case 'server-sync-audit': {
      runServerSyncAuditCli(commandArgs);
      break;
    }

    case 'server-help': {
      printServerCommandHelp();
      break;
    }

    case 'worker-help': {
      printWorkerAliasHelp();
      break;
    }

    case 'cursor': {
      const subcommand = process.argv[3];
      const cursorResult = await handleCursorCommand(subcommand, process.argv.slice(4));
      process.exit(cursorResult);
      break;
    }

    case 'gemini-cli': {
      const geminiSubcommand = process.argv[3];
      const geminiResult = await handleGeminiCliCommand(geminiSubcommand, process.argv.slice(4));
      process.exit(geminiResult);
      break;
    }

    case 'hook': {
      const platform = process.argv[3];
      const event = process.argv[4];
      if (!platform || !event) {
        console.error('Usage: claude-mem hook <platform> <event>');
        console.error('Platforms: claude-code, codex, cursor, gemini-cli, raw');
        console.error('Events: context, session-init, observation, summarize, user-message');
        process.exit(1);
      }

      const workerStartResult = await ensureWorkerStarted(port);
      if (workerStartResult === 'dead') {
        logger.warn('SYSTEM', 'Worker failed to start before hook, handler will proceed gracefully');
      }

      const { hookCommand } = await import('../cli/hook-command.js');
      await hookCommand(platform, event);
      break;
    }

    case 'generate': {
      const dryRun = process.argv.includes('--dry-run');
      const { generateClaudeMd } = await import('../cli/claude-md-commands.js');
      const result = await generateClaudeMd(dryRun);
      process.exit(result);
      break;
    }

    case 'clean': {
      const dryRun = process.argv.includes('--dry-run');
      const { cleanClaudeMd } = await import('../cli/claude-md-commands.js');
      const result = await cleanClaudeMd(dryRun);
      process.exit(result);
      break;
    }

    case 'adopt': {
      const dryRun = process.argv.includes('--dry-run');
      const branchIndex = process.argv.indexOf('--branch');
      const branchValue = branchIndex !== -1 ? process.argv[branchIndex + 1] : undefined;
      if (branchIndex !== -1 && (!branchValue || branchValue.startsWith('--'))) {
        console.error('Usage: adopt [--dry-run] [--branch <branch>] [--cwd <path>]');
        process.exit(1);
      }
      const onlyBranch = branchValue;
      const cwdIndex = process.argv.indexOf('--cwd');
      const cwdValue = cwdIndex !== -1 ? process.argv[cwdIndex + 1] : undefined;
      if (cwdIndex !== -1 && (!cwdValue || cwdValue.startsWith('--'))) {
        console.error('Usage: adopt [--dry-run] [--branch <branch>] [--cwd <path>]');
        process.exit(1);
      }
      const repoPath = cwdValue ?? process.cwd();

      const result = await adoptMergedWorktrees({ repoPath, dryRun, onlyBranch });

      const tag = result.dryRun ? '(dry-run)' : '(applied)';
      console.log(`\nWorktree adoption ${tag}`);
      console.log(`  Parent project:       ${result.parentProject || '(unknown)'}`);
      console.log(`  Repo:                 ${result.repoPath}`);
      console.log(`  Worktrees scanned:    ${result.scannedWorktrees}`);
      console.log(`  Merged branches:      ${result.mergedBranches.join(', ') || '(none)'}`);
      console.log(`  Observations adopted: ${result.adoptedObservations}`);
      console.log(`  Summaries adopted:    ${result.adoptedSummaries}`);
      console.log(`  Chroma docs updated:  ${result.chromaUpdates}`);
      if (result.chromaFailed > 0) {
        console.log(`  Chroma sync failures: ${result.chromaFailed} (will retry on next run)`);
      }
      for (const err of result.errors) {
        console.log(`  ! ${err.worktree}: ${err.error}`);
      }
      process.exit(0);
    }

    case 'cleanup': {
      const dryRun = process.argv.includes('--dry-run');
      const counts = runOneTimeV12_4_3Cleanup(undefined, { dryRun });
      const tag = dryRun ? '(dry-run, no changes made)' : '(applied)';
      console.log(`\nv12.4.3 cleanup ${tag}`);
      if (counts) {
        console.log(`  Observer sessions:        ${counts.observerSessions}`);
        console.log(`  Observer cascade rows:    ${counts.observerCascadeRows}`);
        console.log(`  Stuck pending_messages:   ${counts.stuckPendingMessages}`);
      } else if (dryRun) {
        console.log('  Scan failed — see worker log for details.');
      } else {
        console.log('  Already applied (marker present) or skipped.');
      }
      process.exit(0);
    }

    case '--daemon':
    default: {
      const existingPidInfo = readPidFile();
      if (verifyPidFileOwnership(existingPidInfo)) {
        logger.info('SYSTEM', 'Worker already running (PID alive), refusing to start duplicate', {
          existingPid: existingPidInfo.pid,
          existingPort: existingPidInfo.port,
          startedAt: existingPidInfo.startedAt
        });
        process.exit(0);
      }

      if (await isPortInUse(port)) {
        logger.info('SYSTEM', 'Port already in use, refusing to start duplicate', { port });
        process.exit(0);
      }

      process.on('unhandledRejection', (reason) => {
        logger.error('SYSTEM', 'Unhandled rejection in daemon', {
          reason: reason instanceof Error ? reason.message : String(reason)
        });
      });
      process.on('uncaughtException', (error) => {
        logger.error('SYSTEM', 'Uncaught exception in daemon', {}, error as Error);
        // Don't exit — keep the HTTP server running
      });

      const worker = new WorkerService();
      worker.start().catch(async (error) => {
        const isPortConflict = error instanceof Error && (
          (error as NodeJS.ErrnoException).code === 'EADDRINUSE' ||
          /port.*in use|address.*in use/i.test(error.message)
        );
        if (isPortConflict && await waitForHealth(port, 3000)) {
          logger.info('SYSTEM', 'Duplicate daemon exiting — another worker already claimed port', { port });
          process.exit(0);
        }
        logger.failure('SYSTEM', 'Worker failed to start', {}, error as Error);
        removePidFile();
        process.exit(0);
      });
    }
  }
}

async function printQueueStatusIfBullMq(port: number): Promise<void> {
  if (SettingsDefaultsManager.get('CLAUDE_MEM_QUEUE_ENGINE').trim().toLowerCase() !== 'bullmq') {
    return;
  }
  try {
    const response = await fetch(`http://${getWorkerHost()}:${port}/api/health`);
    if (!response.ok) {
      console.log(`  Queue: BullMQ health unavailable (HTTP ${response.status})`);
      return;
    }
    const body = await response.json() as {
      queue?: {
        redis?: {
          status?: string;
          host?: string;
          port?: number;
          mode?: string;
          prefix?: string;
          error?: string;
        };
      };
    };
    const redis = body.queue?.redis;
    if (!redis) {
      return;
    }
    const target = `${redis.host ?? 'unknown'}:${redis.port ?? 'unknown'}`;
    const suffix = redis.status === 'ok' ? '' : ` (${redis.error ?? 'unhealthy'})`;
    console.log(`  Queue: BullMQ Redis ${redis.status ?? 'unknown'} at ${target} [${redis.mode ?? 'external'}, prefix=${redis.prefix ?? 'claude_mem'}]${suffix}`);
  } catch (error) {
    console.log(`  Queue: BullMQ health unavailable (${error instanceof Error ? error.message : String(error)})`);
  }
}

const isMainModule = typeof require !== 'undefined' && typeof module !== 'undefined'
  ? require.main === module || !module.parent || process.env.CLAUDE_MEM_MANAGED === 'true'
  : import.meta.url === `file://${process.argv[1]}`
    || process.argv[1]?.endsWith('worker-service')
    || process.argv[1]?.endsWith('worker-service.cjs')
    || process.argv[1]?.replaceAll('\\', '/') === __filename?.replaceAll('\\', '/');

if (isMainModule) {
  main().catch((error) => {
    logger.error('SYSTEM', 'Fatal error in main', {}, error instanceof Error ? error : undefined);
    process.exit(0);  
  });
}
