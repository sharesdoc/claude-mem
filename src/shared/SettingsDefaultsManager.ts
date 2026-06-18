
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { homedir } from 'os';

export interface SettingsDefaults {
  CLAUDE_MEM_MODEL: string;
  CLAUDE_MEM_CONTEXT_OBSERVATIONS: string;
  CLAUDE_MEM_WORKER_PORT: string;
  CLAUDE_MEM_WORKER_HOST: string;
  CLAUDE_MEM_SKIP_TOOLS: string;
  CLAUDE_MEM_PROVIDER: string;  
  CLAUDE_MEM_CLAUDE_AUTH_METHOD: string;  
  CLAUDE_MEM_GEMINI_API_KEY: string;
  CLAUDE_MEM_GEMINI_MODEL: string;  
  CLAUDE_MEM_GEMINI_RATE_LIMITING_ENABLED: string;  
  CLAUDE_MEM_GEMINI_MAX_CONTEXT_MESSAGES: string;  
  CLAUDE_MEM_GEMINI_MAX_TOKENS: string;  
  CLAUDE_MEM_OPENROUTER_API_KEY: string;
  CLAUDE_MEM_OPENROUTER_MODEL: string;
  CLAUDE_MEM_OPENROUTER_SITE_URL: string;
  CLAUDE_MEM_OPENROUTER_APP_NAME: string;
  CLAUDE_MEM_OPENROUTER_MAX_CONTEXT_MESSAGES: string;
  CLAUDE_MEM_OPENROUTER_MAX_TOKENS: string;
  CLAUDE_MEM_DATA_DIR: string;
  CLAUDE_MEM_LOG_LEVEL: string;
  CLAUDE_MEM_PYTHON_VERSION: string;
  CLAUDE_CODE_PATH: string;
  CLAUDE_MEM_MODE: string;
  CLAUDE_MEM_CONTEXT_SHOW_READ_TOKENS: string;
  CLAUDE_MEM_CONTEXT_SHOW_WORK_TOKENS: string;
  CLAUDE_MEM_CONTEXT_SHOW_SAVINGS_AMOUNT: string;
  CLAUDE_MEM_CONTEXT_SHOW_SAVINGS_PERCENT: string;
  CLAUDE_MEM_CONTEXT_FULL_COUNT: string;
  CLAUDE_MEM_CONTEXT_FULL_FIELD: string;
  CLAUDE_MEM_CONTEXT_SESSION_COUNT: string;
  CLAUDE_MEM_CONTEXT_SHOW_LAST_SUMMARY: string;
  CLAUDE_MEM_CONTEXT_SHOW_LAST_MESSAGE: string;
  CLAUDE_MEM_CONTEXT_SHOW_TERMINAL_OUTPUT: string;
  CLAUDE_MEM_WELCOME_HINT_ENABLED: string;
  CLAUDE_MEM_FOLDER_CLAUDEMD_ENABLED: string;
  CLAUDE_MEM_FOLDER_USE_LOCAL_MD: string;  
  CLAUDE_MEM_TRANSCRIPTS_ENABLED: string;  
  CLAUDE_MEM_TRANSCRIPTS_CONFIG_PATH: string;
  CLAUDE_MEM_CODEX_TRANSCRIPT_INGESTION: string;
  CLAUDE_MEM_MAX_CONCURRENT_AGENTS: string;
  /** Max concurrent report (daily/weekly) generations in a batch run. */
  CLAUDE_MEM_REPORT_BATCH_CONCURRENCY: string;
  CLAUDE_MEM_HOOK_FAIL_LOUD_THRESHOLD: string;
  CLAUDE_MEM_EXCLUDED_PROJECTS: string;  
  CLAUDE_MEM_FOLDER_MD_EXCLUDE: string;  
  CLAUDE_MEM_SEMANTIC_INJECT: string;        
  CLAUDE_MEM_SEMANTIC_INJECT_LIMIT: string;  
  CLAUDE_MEM_TIER_ROUTING_ENABLED: string;   
  CLAUDE_MEM_TIER_SIMPLE_MODEL: string;      
  CLAUDE_MEM_TIER_SUMMARY_MODEL: string;     
  CLAUDE_MEM_CHROMA_ENABLED: string;
  /** Show AI processing completion time + duration on prompt cards in viewer. */
  CLAUDE_MEM_PROMPT_SHOW_PROCESSING_TIME: string; // 0=off, 1=AI time only, 2=AI+human
  /** Max think-time minutes to include in AI processing time (0=disabled). */
  CLAUDE_MEM_THINK_TIME_CAP_MINUTES: string; // Max think time (minutes). 0 = disabled
  CLAUDE_MEM_CHROMA_MODE: string;      
  CLAUDE_MEM_CHROMA_HOST: string;
  CLAUDE_MEM_CHROMA_PORT: string;
  CLAUDE_MEM_CHROMA_SSL: string;
  CLAUDE_MEM_CHROMA_API_KEY: string;
  CLAUDE_MEM_CHROMA_TENANT: string;
  CLAUDE_MEM_CHROMA_DATABASE: string;
  CLAUDE_MEM_TELEGRAM_ENABLED: string;
  CLAUDE_MEM_TELEGRAM_BOT_TOKEN: string;
  CLAUDE_MEM_TELEGRAM_CHAT_ID: string;
  CLAUDE_MEM_TELEGRAM_TRIGGER_TYPES: string;
  CLAUDE_MEM_TELEGRAM_TRIGGER_CONCEPTS: string;
  CLAUDE_MEM_QUEUE_ENGINE: string;
  CLAUDE_MEM_REDIS_URL: string;
  CLAUDE_MEM_REDIS_HOST: string;
  CLAUDE_MEM_REDIS_PORT: string;
  CLAUDE_MEM_REDIS_MODE: string;
  CLAUDE_MEM_QUEUE_REDIS_PREFIX: string;
  CLAUDE_MEM_AUTH_MODE: string;
  CLAUDE_MEM_RUNTIME: string;
  CLAUDE_MEM_SERVER_BETA_URL: string;
  CLAUDE_MEM_SERVER_BETA_API_KEY: string;
  CLAUDE_MEM_SERVER_BETA_PROJECT_ID: string;

  // ── Client / Server dual-mode (S-doc + TODO T-01) ────────────────────
  // Role selector: 'client' (default) syncs to upstream; 'server' accepts ingest.
  CLAUDE_MEM_NODE_ROLE: string;
  // Synchronization identity (Mac/Windows OS username fallback if empty at runtime).
  CLAUDE_MEM_USER_LABEL: string;

  // ── Client sync settings ────────────────────────────────────────────
  CLAUDE_MEM_SYNC_ENABLED: string;
  CLAUDE_MEM_SYNC_UPSTREAM_URL: string;
  CLAUDE_MEM_SYNC_AUTH_MODE: string;          // 'none' | 'apikey' | 'jwt' | 'mtls'
  CLAUDE_MEM_SYNC_API_KEY: string;
  CLAUDE_MEM_SYNC_INTERVAL_MS: string;
  CLAUDE_MEM_SYNC_BATCH_SIZE: string;
  CLAUDE_MEM_SYNC_RETRY_MAX: string;
  CLAUDE_MEM_SYNC_REDACT_PATTERNS: string;    // csv globs e.g. '**/*.env,**/secrets/**'

  // ── Server sync settings ────────────────────────────────────────────
  CLAUDE_MEM_SERVER_BIND_HOST: string;        // '0.0.0.0' for server, default '' = inherit WORKER_HOST
  CLAUDE_MEM_SERVER_AUTH_MODE: string;        // 'none' | 'apikey' | 'jwt' | 'mtls'
  CLAUDE_MEM_SERVER_ALLOWED_USERS: string;    // csv user_labels; empty = allow all
  CLAUDE_MEM_SERVER_ACCESS_TOKEN: string;      // shared secret for LAN deployments (Bearer token)
  CLAUDE_MEM_SERVER_LOCAL_AUTO_LOGIN: string;  // 'true' = loopback requests auto-login in server mode (X-005)
  CLAUDE_MEM_SERVER_INGEST_MAX_BATCH: string;
  CLAUDE_MEM_SERVER_REQUIRE_TLS: string;
  CLAUDE_MEM_SYNC_ACCESS_TOKEN: string;        // client-side copy of the shared secret

  // ── Weekly work report ──────────────────────────────────────────────
  CLAUDE_MEM_WEEKLY_REPORT_ENABLED: string;    // 'true' | 'false' — daily auto-generation switch
  CLAUDE_MEM_WEEKLY_REPORT_TIME: string;        // local 'HH:MM' to refresh this week's report (default 13:00)
  CLAUDE_MEM_WEEKLY_REPORT_MODEL: string;       // Qwen model for the AI "highlights" section
  /** Aliyun DashScope API key for Qwen weekly-report synthesis. The env var
   *  DASHSCOPE_API_KEY (if set) always takes precedence over this file value. */
  DASHSCOPE_API_KEY: string;
  /** Qwen model id for the observation/summary provider (DashScope). Empty falls
   *  back to QwenProvider's DEFAULT_MODEL. */
  CLAUDE_MEM_QWEN_MODEL: string;
}

export class SettingsDefaultsManager {
  private static readonly DEFAULTS: SettingsDefaults = {
    CLAUDE_MEM_MODEL: 'claude-haiku-4-5-20251001',
    CLAUDE_MEM_CONTEXT_OBSERVATIONS: '50',
    CLAUDE_MEM_WORKER_PORT: String(37700 + ((process.getuid?.() ?? 77) % 100)),
    CLAUDE_MEM_WORKER_HOST: '127.0.0.1',
    CLAUDE_MEM_SKIP_TOOLS: 'ListMcpResourcesTool,SlashCommand,Skill,TodoWrite,AskUserQuestion',
    CLAUDE_MEM_PROVIDER: 'claude',  // Default to Claude
    CLAUDE_MEM_CLAUDE_AUTH_METHOD: 'subscription',  // Default to logged-in Claude SDK auth (not API key)
    CLAUDE_MEM_GEMINI_API_KEY: '',  // Empty by default, can be set via UI or env
    CLAUDE_MEM_GEMINI_MODEL: 'gemini-2.5-flash-lite',  // Default Gemini model (highest free tier RPM)
    CLAUDE_MEM_GEMINI_RATE_LIMITING_ENABLED: 'true',  // Rate limiting ON by default for free tier users
    CLAUDE_MEM_GEMINI_MAX_CONTEXT_MESSAGES: '20',  // Max messages in Gemini context window
    CLAUDE_MEM_GEMINI_MAX_TOKENS: '100000',  // Max estimated tokens (~100k safety limit)
    CLAUDE_MEM_OPENROUTER_API_KEY: '',  // Empty by default, can be set via UI or env
    CLAUDE_MEM_OPENROUTER_MODEL: 'xiaomi/mimo-v2-flash:free',  // Default OpenRouter model (free tier)
    CLAUDE_MEM_OPENROUTER_SITE_URL: '',  // Optional: for OpenRouter analytics
    CLAUDE_MEM_OPENROUTER_APP_NAME: 'claude-mem',  // App name for OpenRouter analytics
    CLAUDE_MEM_OPENROUTER_MAX_CONTEXT_MESSAGES: '20',  // Max messages in context window
    CLAUDE_MEM_OPENROUTER_MAX_TOKENS: '100000',  // Max estimated tokens (~100k safety limit)
    CLAUDE_MEM_DATA_DIR: join(homedir(), '.claude-mem'),
    CLAUDE_MEM_LOG_LEVEL: 'INFO',
    CLAUDE_MEM_PYTHON_VERSION: '3.13',
    CLAUDE_CODE_PATH: '', // Empty means auto-detect via 'which claude'
    CLAUDE_MEM_MODE: 'code', // Default mode profile
    CLAUDE_MEM_CONTEXT_SHOW_READ_TOKENS: 'false',
    CLAUDE_MEM_CONTEXT_SHOW_WORK_TOKENS: 'false',
    CLAUDE_MEM_CONTEXT_SHOW_SAVINGS_AMOUNT: 'false',
    CLAUDE_MEM_CONTEXT_SHOW_SAVINGS_PERCENT: 'true',
    CLAUDE_MEM_CONTEXT_FULL_COUNT: '0',
    CLAUDE_MEM_CONTEXT_FULL_FIELD: 'narrative',
    CLAUDE_MEM_CONTEXT_SESSION_COUNT: '10',
    CLAUDE_MEM_CONTEXT_SHOW_LAST_SUMMARY: 'true',
    CLAUDE_MEM_CONTEXT_SHOW_LAST_MESSAGE: 'false',
    CLAUDE_MEM_CONTEXT_SHOW_TERMINAL_OUTPUT: 'true',
    CLAUDE_MEM_WELCOME_HINT_ENABLED: 'true',
    CLAUDE_MEM_FOLDER_CLAUDEMD_ENABLED: 'false',
    CLAUDE_MEM_FOLDER_USE_LOCAL_MD: 'false',  // When true, writes to CLAUDE.local.md instead of CLAUDE.md
    CLAUDE_MEM_TRANSCRIPTS_ENABLED: 'true',
    CLAUDE_MEM_TRANSCRIPTS_CONFIG_PATH: join(homedir(), '.claude-mem', 'transcript-watch.json'),
    CLAUDE_MEM_CODEX_TRANSCRIPT_INGESTION: 'false',
    CLAUDE_MEM_MAX_CONCURRENT_AGENTS: '2',  // Max concurrent Claude SDK agent subprocesses
    CLAUDE_MEM_REPORT_BATCH_CONCURRENCY: '6',  // Max concurrent daily/weekly report generations per batch run
    CLAUDE_MEM_HOOK_FAIL_LOUD_THRESHOLD: '3',  // Plan 05 Phase 8 — escalate to exit code 2 after N consecutive worker-unreachable hook invocations
    CLAUDE_MEM_EXCLUDED_PROJECTS: '',  // Comma-separated glob patterns for excluded project paths
    CLAUDE_MEM_FOLDER_MD_EXCLUDE: '[]',  // JSON array of folder paths to exclude from CLAUDE.md generation
    CLAUDE_MEM_SEMANTIC_INJECT: 'false',             // Inject relevant past observations on every UserPromptSubmit (experimental, disabled by default)
    CLAUDE_MEM_SEMANTIC_INJECT_LIMIT: '5',           // Top-N most relevant observations to inject per prompt
    CLAUDE_MEM_TIER_ROUTING_ENABLED: 'true',         // Route observations to models by complexity
    CLAUDE_MEM_TIER_SIMPLE_MODEL: 'haiku', // Portable tier alias — works across Direct API, Bedrock, Vertex, Azure (see #1463)
    CLAUDE_MEM_TIER_SUMMARY_MODEL: '',                // Empty = use default model for summaries
    CLAUDE_MEM_CHROMA_ENABLED: 'true',         // Set to 'false' to disable Chroma and use SQLite-only search
    CLAUDE_MEM_PROMPT_SHOW_PROCESSING_TIME: '1', // 0=off, 1=AI time only, 2=AI+human think time
    CLAUDE_MEM_THINK_TIME_CAP_MINUTES: '0',           // Max think time (minutes). 0 = disabled (think_time_ms always 0)
    CLAUDE_MEM_CHROMA_MODE: 'local',           // 'local' uses persistent chroma-mcp via uvx, 'remote' connects to existing server
    CLAUDE_MEM_CHROMA_HOST: '127.0.0.1',
    CLAUDE_MEM_CHROMA_PORT: '8000',
    CLAUDE_MEM_CHROMA_SSL: 'false',
    CLAUDE_MEM_CHROMA_API_KEY: '',
    CLAUDE_MEM_CHROMA_TENANT: 'default_tenant',
    CLAUDE_MEM_CHROMA_DATABASE: 'default_database',
    CLAUDE_MEM_TELEGRAM_ENABLED: 'true',
    CLAUDE_MEM_TELEGRAM_BOT_TOKEN: '',
    CLAUDE_MEM_TELEGRAM_CHAT_ID: '',
    CLAUDE_MEM_TELEGRAM_TRIGGER_TYPES: 'security_alert',
    CLAUDE_MEM_TELEGRAM_TRIGGER_CONCEPTS: '',
    CLAUDE_MEM_QUEUE_ENGINE: 'sqlite',
    CLAUDE_MEM_REDIS_URL: '',
    CLAUDE_MEM_REDIS_HOST: '127.0.0.1',
    CLAUDE_MEM_REDIS_PORT: '6379',
    CLAUDE_MEM_REDIS_MODE: 'external',
    CLAUDE_MEM_QUEUE_REDIS_PREFIX: `claude_mem_${process.env.CLAUDE_MEM_WORKER_PORT ?? String(37700 + ((process.getuid?.() ?? 77) % 100))}`,
    CLAUDE_MEM_AUTH_MODE: 'api-key',
    CLAUDE_MEM_RUNTIME: 'worker',
    CLAUDE_MEM_SERVER_BETA_URL: `http://127.0.0.1:${process.env.CLAUDE_MEM_SERVER_PORT ?? String(37877 + ((process.getuid?.() ?? 77) % 100))}`,  // Default server-beta runtime URL — UID-derived for multi-account isolation
    CLAUDE_MEM_SERVER_BETA_API_KEY: '',                     // Local hook API key, populated by installer when runtime=server-beta
    CLAUDE_MEM_SERVER_BETA_PROJECT_ID: '',                  // Default Postgres project_id used by hooks when runtime=server-beta

    // ── Client / Server dual-mode (S-doc §4 + TODO T-01) ─────────────
    CLAUDE_MEM_NODE_ROLE: 'client',                          // 'client' | 'server'
    CLAUDE_MEM_USER_LABEL: '',                               // empty = resolve to OS username at runtime (T-02)

    CLAUDE_MEM_SYNC_ENABLED: 'true',
    CLAUDE_MEM_SYNC_UPSTREAM_URL: '',                        // e.g. 'http://mem.acme.com'
    CLAUDE_MEM_SYNC_AUTH_MODE: 'none',                       // 'none' for v1 frpc tunnel; 'apikey' for cloud
    CLAUDE_MEM_SYNC_API_KEY: '',                             // only used when auth_mode=apikey
    CLAUDE_MEM_SYNC_INTERVAL_MS: '5000',
    CLAUDE_MEM_SYNC_BATCH_SIZE: '200',
    CLAUDE_MEM_SYNC_RETRY_MAX: '8',
    CLAUDE_MEM_SYNC_REDACT_PATTERNS: '',                     // csv globs

    CLAUDE_MEM_SERVER_BIND_HOST: '',                         // empty = inherit WORKER_HOST (127.0.0.1); set '0.0.0.0' for server
    CLAUDE_MEM_SERVER_AUTH_MODE: 'none',
    CLAUDE_MEM_SERVER_ALLOWED_USERS: '',                     // empty = allow any user_label
    CLAUDE_MEM_SERVER_ACCESS_TOKEN: '',                      // shared secret for LAN; empty = no token check
    CLAUDE_MEM_SERVER_LOCAL_AUTO_LOGIN: 'true',              // loopback auto-login in server mode; 'false' = always require credentials
    CLAUDE_MEM_SERVER_INGEST_MAX_BATCH: '1000',
    CLAUDE_MEM_SERVER_REQUIRE_TLS: 'false',
    CLAUDE_MEM_SYNC_ACCESS_TOKEN: '',                        // client copy of the same shared secret

    CLAUDE_MEM_WEEKLY_REPORT_ENABLED: 'true',               // daily auto-generation of weekly work reports
    CLAUDE_MEM_WEEKLY_REPORT_TIME: '13:00',                 // local HH:MM to refresh this week's report
    CLAUDE_MEM_WEEKLY_REPORT_MODEL: 'qwen3-max',           // Qwen model for the AI report synthesis
    DASHSCOPE_API_KEY: '',                                  // Aliyun DashScope key; env DASHSCOPE_API_KEY overrides this. Empty = AI synthesis disabled.
    CLAUDE_MEM_QWEN_MODEL: '',                              // Qwen provider model id; empty falls back to QwenProvider DEFAULT_MODEL.
  };

  static getAllDefaults(): SettingsDefaults {
    return { ...this.DEFAULTS };
  }

  static get(key: keyof SettingsDefaults): string {
    return process.env[key] ?? this.DEFAULTS[key];
  }

  static getInt(key: keyof SettingsDefaults): number {
    const value = this.get(key);
    return parseInt(value, 10);
  }

  static getBool(key: keyof SettingsDefaults): boolean {
    const value: unknown = this.get(key);
    return value === 'true' || value === true;
  }

  private static applyEnvOverrides(settings: SettingsDefaults): SettingsDefaults {
    const result = { ...settings };
    for (const key of Object.keys(this.DEFAULTS) as Array<keyof SettingsDefaults>) {
      if (process.env[key] !== undefined) {
        result[key] = process.env[key]!;
      }
    }
    return result;
  }

  static loadFromFile(settingsPath: string): SettingsDefaults {
    try {
      if (!existsSync(settingsPath)) {
        const defaults = this.getAllDefaults();
        try {
          const dir = dirname(settingsPath);
          if (!existsSync(dir)) {
            mkdirSync(dir, { recursive: true });
          }
          writeFileSync(settingsPath, JSON.stringify(defaults, null, 2), 'utf-8');
          console.log('[SETTINGS] Created settings file with defaults:', settingsPath);
        } catch (error: unknown) {
          console.warn('[SETTINGS] Failed to create settings file, using in-memory defaults:', settingsPath, error instanceof Error ? error.message : String(error));
        }
        return this.applyEnvOverrides(defaults);
      }

      const settingsData = readFileSync(settingsPath, 'utf-8');
      // Strip UTF-8 BOM if present — Windows tools (editors, formatters, CLI
      // hooks) may prepend U+FEFF which Bun's JSON.parse rejects silently,
      // causing a full fallback to defaults and breaking server-beta routing.
      const settings = JSON.parse(settingsData.replace(/^\uFEFF/, ''));

      let flatSettings = settings;
      if (settings.env && typeof settings.env === 'object') {
        // Merge top-level keys with the nested env block instead of
        // discarding the top level. A previous version replaced the whole
        // file with ONLY settings.env, which silently wiped any flat-format
        // keys (e.g. server role / token / admin password) that coexisted
        // with an env block — a hybrid file produced when a nested writer
        // ran against a flat settings.json. env wins on key conflicts.
        const { env, ...topLevel } = settings;
        flatSettings = { ...topLevel, ...env };

        try {
          writeFileSync(settingsPath, JSON.stringify(flatSettings, null, 2), 'utf-8');
          console.log('[SETTINGS] Migrated settings file from nested to flat schema:', settingsPath);
        } catch (error: unknown) {
          console.warn('[SETTINGS] Failed to auto-migrate settings file:', settingsPath, error instanceof Error ? error.message : String(error));
          // Continue with in-memory migration even if write fails
        }
      }

      const result: SettingsDefaults = { ...this.DEFAULTS };
      for (const key of Object.keys(this.DEFAULTS) as Array<keyof SettingsDefaults>) {
        if (flatSettings[key] !== undefined) {
          result[key] = flatSettings[key];
        }
      }

      return this.applyEnvOverrides(result);
    } catch (error: unknown) {
      console.warn('[SETTINGS] Failed to load settings, using defaults:', settingsPath, error instanceof Error ? error.message : String(error));
      return this.applyEnvOverrides(this.getAllDefaults());
    }
  }
}
