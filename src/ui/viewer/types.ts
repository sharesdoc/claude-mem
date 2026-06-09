export interface Observation {
  id: number;
  memory_session_id: string;
  project: string;
  merged_into_project?: string | null;
  platform_source: string;
  type: string;
  title: string | null;
  subtitle: string | null;
  narrative: string | null;
  text: string | null;
  facts: string | null;
  concepts: string | null;
  files_read: string | null;
  files_modified: string | null;
  prompt_number: number | null;
  /** OS user (Mac/Windows username) that produced this row, null if unknown. */
  user_name?: string | null;
  /** Sync identity (T-20). Populated when the row originated from a client push. */
  user_label?: string | null;
  created_at: string;
  created_at_epoch: number;
  /** Content hash for dedup across local + sync sources. */
  content_hash?: string | null;
}

export interface Summary {
  id: number;
  session_id: string;
  project: string;
  platform_source: string;
  request?: string;
  investigated?: string;
  learned?: string;
  completed?: string;
  next_steps?: string;
  user_name?: string | null;
  user_label?: string | null;
  created_at_epoch: number;
  content_hash?: string | null;
}

export interface UserPrompt {
  id: number;
  content_session_id: string;
  project: string;
  platform_source: string;
  prompt_number: number;
  prompt_text: string;
  user_name?: string | null;
  user_label?: string | null;
  created_at_epoch: number;
  completed_at_epoch?: number | null;
  think_time_ms?: number;
  content_hash?: string | null;
}

export type FeedItem =
  | (Observation & { itemType: 'observation' })
  | (Summary & { itemType: 'summary' })
  | (UserPrompt & { itemType: 'prompt' });

export interface StreamEvent {
  type:
    | 'initial_load'
    | 'new_observation'
    | 'new_summary'
    | 'new_prompt'
    | 'processing_status'
    | 'projects_deleted'
    | 'prompt_deleted';
  observations?: Observation[];
  summaries?: Summary[];
  prompts?: UserPrompt[];
  projects?: string[];
  observation?: Observation;
  summary?: Summary;
  prompt?: UserPrompt;
  /** prompt_deleted: row id of the removed user prompt. */
  id?: number;
  isProcessing?: boolean;
  queueDepth?: number;
}

export interface ProjectCatalog {
  projects: string[];
  sources: string[];
  projectsBySource: Record<string, string[]>;
}

export interface Settings {
  CLAUDE_MEM_MODEL: string;
  CLAUDE_MEM_CONTEXT_OBSERVATIONS: string;
  CLAUDE_MEM_WORKER_PORT: string;
  CLAUDE_MEM_WORKER_HOST: string;

  CLAUDE_MEM_PROVIDER?: string;  
  CLAUDE_MEM_GEMINI_API_KEY?: string;
  CLAUDE_MEM_GEMINI_MODEL?: string;  
  CLAUDE_MEM_GEMINI_RATE_LIMITING_ENABLED?: string;  
  CLAUDE_MEM_OPENROUTER_API_KEY?: string;
  CLAUDE_MEM_OPENROUTER_MODEL?: string;
  CLAUDE_MEM_OPENROUTER_SITE_URL?: string;
  CLAUDE_MEM_OPENROUTER_APP_NAME?: string;

  CLAUDE_MEM_CONTEXT_SHOW_READ_TOKENS?: string;
  CLAUDE_MEM_CONTEXT_SHOW_WORK_TOKENS?: string;
  CLAUDE_MEM_CONTEXT_SHOW_SAVINGS_AMOUNT?: string;
  CLAUDE_MEM_CONTEXT_SHOW_SAVINGS_PERCENT?: string;

  CLAUDE_MEM_CONTEXT_FULL_COUNT?: string;
  CLAUDE_MEM_CONTEXT_FULL_FIELD?: string;
  CLAUDE_MEM_CONTEXT_SESSION_COUNT?: string;

  CLAUDE_MEM_CONTEXT_SHOW_LAST_SUMMARY?: string;
  CLAUDE_MEM_CONTEXT_SHOW_LAST_MESSAGE?: string;
  CLAUDE_MEM_PROMPT_SHOW_PROCESSING_TIME?: string;
}

export interface WorkerStats {
  version?: string;
  uptime?: number;
  activeSessions?: number;
  sseClients?: number;
}

export interface DatabaseStats {
  size?: number;
  observations?: number;
  sessions?: number;
  summaries?: number;
  firstObservationAt?: string | null;
}

export interface Stats {
  worker?: WorkerStats;
  database?: DatabaseStats;
}

export interface AnalyticsPoint {
  day: string;
  user_label: string;
  count: number;
}

export interface ProjectPromptCount {
  project: string;
  count: number;
}

export interface AnalyticsResponse {
  promptsByUserByDay: AnalyticsPoint[];
  observationsByUserByDay: AnalyticsPoint[];
  summariesByUserByDay: AnalyticsPoint[];
  /** 各项目用户输入提示词总数，按 count 降序（所有项目视图用）。 */
  promptsByProject: ProjectPromptCount[];
  totalDiscoveryTokens: number;
  totalObservations: number;
  totalSessions: number;
  uniqueUsers: string[];
  /** 每用户 AI 处理请求的总时间（ms）与会话数。key = user_label */
  userProcessingTime: Record<string, { totalMs: number; sessionCount: number }>;
  /** 每用户的项目数和活跃天数。key = user_label */
  userProjectMeta: Record<string, { projectCount: number; activeDays: number }>;
  /** 各项目的 AI 处理时间排名（已排序，仅全局视图有效）。 */
  projectProcessingTime: Array<{ project: string; totalMs: number; sessionCount: number }>;
  /** 每日每用户 AI 处理时间（ms），用于折线图。 */
  dailyProcessingTimeByUser: Array<{ day: string; user_label: string; totalMs: number }>;
  /** 各项目的最新编辑用户，key = project, value = user_label。 */
  projectEditor: Record<string, string>;
  /** User Summary 表格的范围内计数（按 Today/Week/Month tab 限定）。 */
  userSummaryCounts: Record<string, { prompts: number; obs: number; summaries: number }>;
  /** User Summary 范围内的工作日数（用于日均计算）。 */
  summaryBusinessDays: number;
  /** 图表 X 轴粒度：day（当日/本周/本月）或 week（季度按周聚合）。 */
  granularity: 'hour' | 'day' | 'week';
  /** 图表 X 轴的有序桶（YYYY-MM-DD，本地时间，已补齐空缺）。 */
  chartBuckets: string[];
  /** 月度历史记录 — 按人分组（scope=history 时返回，每人每月一条，最多36个月）。 */
  historyMonths: Array<{
    month: string; user_label: string;
    prompts: number; avgPromptsPerDay: number;
    processingMs: number; avgTimePerDay: number;
    obs: number; summaries: number;
    projects: number; sessions: number; bizDays: number;
  }>;
  /** 周度历史记录 — 按人分组(scope=history 时返回,每人每周一条,最近26周)。 */
  historyWeeks: Array<{
    week: string; user_label: string;
    prompts: number; avgPromptsPerDay: number;
    processingMs: number; avgTimePerDay: number;
    obs: number; summaries: number;
    projects: number; sessions: number; bizDays: number;
  }>;
}

/** 周报列表项(GET /api/reports/list 返回)。 */
export interface WeeklyReportItem {
  week_start: string;
  week_end: string;
  generated_at_epoch: number;
  stats: {
    totalMs: number; projects: number; prompts: number;
    obs: number; summaries: number; sessions: number;
  } | null;
}
