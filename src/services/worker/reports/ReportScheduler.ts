import { Database } from 'bun:sqlite';
import { logger } from '../../../utils/logger.js';
import { SettingsDefaultsManager } from '../../../shared/SettingsDefaultsManager.js';
import { USER_SETTINGS_PATH } from '../../../shared/paths.js';
import { DatabaseManager } from '../DatabaseManager.js';
import { ReportGenerator, upsertWeeklyReport, weekMondayOf } from './ReportGenerator.js';

/**
 * ReportScheduler — 每日定时生成周报 (B-周报设计文档 §5.1)。
 *
 * 仿 SyncAgent:每 60 秒 tick 一次,当本地 HH:MM 命中
 * CLAUDE_MEM_WEEKLY_REPORT_TIME(默认 13:00)且当天未跑过时,为本周有活动的
 * 所有 user_label 各生成/刷新一份本周周报(UPSERT)。单用户失败不影响其余。
 * timer.unref() 不阻塞进程退出;受 CLAUDE_MEM_WEEKLY_REPORT_ENABLED 开关控制。
 */
const TICK_MS = 60000;
const DAY_MS = 86400000;

export class ReportScheduler {
  private timer: ReturnType<typeof setInterval> | null = null;
  private lastRunDate: string | null = null; // 'YYYY-MM-DD'(本地),当日去重
  private running = false;

  constructor(private dbManager: DatabaseManager) {}

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => void this.tick(), TICK_MS);
    this.timer.unref?.();
    logger.info('WORKER', 'ReportScheduler started');
  }

  stop(): void {
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
  }

  private pad(n: number): string { return String(n).padStart(2, '0'); }

  private async tick(): Promise<void> {
    if (this.running) return;
    try {
      const s = SettingsDefaultsManager.loadFromFile(USER_SETTINGS_PATH);
      if (s.CLAUDE_MEM_WEEKLY_REPORT_ENABLED !== 'true') return;
      const target = (s.CLAUDE_MEM_WEEKLY_REPORT_TIME || '13:00').trim();
      const now = new Date();
      const hhmm = `${this.pad(now.getHours())}:${this.pad(now.getMinutes())}`;
      const today = `${now.getFullYear()}-${this.pad(now.getMonth() + 1)}-${this.pad(now.getDate())}`;
      if (hhmm !== target || this.lastRunDate === today) return;

      this.lastRunDate = today;
      this.running = true;
      await this.runForAllActiveUsers(s.CLAUDE_MEM_WEEKLY_REPORT_MODEL || 'qwen-plus');
    } catch (error) {
      logger.error('WORKER', 'ReportScheduler tick failed', {}, error as Error);
    } finally {
      this.running = false;
    }
  }

  /** 立即为本周所有活跃用户生成周报(供定时触发与手动测试)。 */
  async runForAllActiveUsers(model: string): Promise<void> {
    const db: Database = this.dbManager.getConnection();
    const tzOffsetMs = -new Date().getTimezoneOffset() * 60000;
    const week = weekMondayOf(Date.now(), tzOffsetMs);
    const [y, m, d] = week.split('-').map(Number);
    const start = Date.UTC(y, m - 1, d) - tzOffsetMs;
    const end = start + 7 * DAY_MS;

    const users = db.prepare(`
      SELECT DISTINCT COALESCE(NULLIF(s.user_label, ''), 'unknown') AS u
      FROM sdk_sessions s
      WHERE s.started_at_epoch >= ? AND s.started_at_epoch < ?
    `).all(start, end) as Array<{ u: string }>;

    if (users.length === 0) {
      logger.info('WORKER', 'ReportScheduler: no active users this week', { week });
      return;
    }

    const generator = new ReportGenerator(db);
    let ok = 0;
    for (const { u } of users) {
      try {
        const report = await generator.generate(u, week, tzOffsetMs, model);
        upsertWeeklyReport(db, report);
        ok++;
      } catch (error) {
        logger.error('WORKER', 'ReportScheduler: per-user generation failed', { user: u, week }, error as Error);
      }
    }
    logger.info('WORKER', 'ReportScheduler finished', { week, generated: ok, total: users.length });
  }
}
