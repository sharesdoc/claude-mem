import express, { Request, Response } from 'express';
import { logger } from '../../../../utils/logger.js';
import { BaseRouteHandler } from '../BaseRouteHandler.js';
import { DatabaseManager } from '../../DatabaseManager.js';
import { AdminSessionStore, extractBearerToken } from '../AdminSessionStore.js';
import { ReportGenerator, upsertWeeklyReport, weekMondayOf } from '../../reports/ReportGenerator.js';
import { mdToHtml } from '../../reports/mdToHtml.js';
import { loopbackBypassAllowed, verifyAccessTokenAgainst, loadAccessAuth } from '../middleware/tokenAuth.js';
import {
  runPool, batchConcurrency, createBatchJob, recordOutcome, finishBatchJob, getBatchJob,
  weekEndEpoch, isPeriodComplete, rosterAllUsers, activeUsersInRange, userHasActivity, type BatchOutcome,
} from '../../reports/batch.js';

/**
 * ReportRoutes — 周报后端接口 (B-周报设计文档 §4)。
 *
 *   GET  /api/reports/list      列出某用户最近周报(供 History 视图列表)
 *   POST /api/reports/generate  同步生成/重算某用户某周周报(UPSERT;供"刷新本周"与调度)
 *   GET  /report                服务端渲染整页 HTML:左=上周、右=本周,带下载按钮(新标签打开)
 *   GET  /api/reports/download  下载原始 .md,文件名 周报-<week_start>-<名字>.md
 *
 * 鉴权:standalone(无 token / 非 server 模式)直通;server 模式校验
 * Authorization: Bearer 或 ?token=(新标签页无法带 header,故 /report 与
 * /download 额外接受查询参数 token)。
 */

const WEEK_RE = /^\d{4}-\d{2}-\d{2}$/;
const LIST_LIMIT = 12;
const DAY_MS = 86400000;
const HISTORY_WEEKS = 26;   // how far back the History page enumerates weeks

interface ReportRow {
  user_label: string; week_start: string; week_end: string;
  markdown: string; stats: string | null; model: string | null; generated_at_epoch: number;
}

export class ReportRoutes extends BaseRouteHandler {
  // X-037: 构造期缓存鉴权配置, 鉴权热路径不再每请求读盘。
  private readonly accessAuth = loadAccessAuth();

  constructor(
    private dbManager: DatabaseManager,
    private requireAuth: boolean,
    /** @deprecated X-037: 仅为兼容调用方保留, 鉴权值以 loadAccessAuth() 为准。 */
    private serverAccessToken: string,
    private adminSessions?: AdminSessionStore,
  ) {
    super();
    void this.serverAccessToken;
  }

  setupRoutes(app: express.Application): void {
    app.get('/api/reports/list', this.handleList.bind(this));
    app.get('/api/reports/history-weeks', this.handleHistoryWeeks.bind(this));
    app.get('/api/reports/overview', this.handleOverview.bind(this));
    app.post('/api/reports/generate', this.handleGenerate.bind(this));
    app.post('/api/reports/batch', this.handleBatch.bind(this));
    app.get('/api/reports/batch/:jobId', this.handleBatchStatus.bind(this));
    app.post('/api/reports/delete', this.handleDelete.bind(this));
    app.get('/api/reports/download', this.handleDownload.bind(this));
    app.get('/report', this.handleReportPage.bind(this));
  }

  // ── 鉴权:bearer 或 ?token(新标签页用);standalone 直通 ───────────
  private authorized(req: Request): boolean {
    if (!this.requireAuth) return true;
    const presented = extractBearerToken(req) ?? (typeof req.query.token === 'string' ? req.query.token : '');
    // X-036/X-037: 明文/哈希双轨校验统一走缓存配置的 verifyAccessTokenAgainst。
    if (presented && verifyAccessTokenAgainst(this.accessAuth, req, presented)) return true;
    if (this.adminSessions && presented && this.adminSessions.verify(presented)) return true;
    // X-005: loopback operator with local auto-login enabled needs no token —
    // mirrors the API gate and tokenAuth so the stats page's weekly-report
    // table loads on 127.0.0.1 just like the analytics endpoint does.
    if (loopbackBypassAllowed(req)) return true;
    return false;
  }

  private tzOffsetMs(req: Request): number {
    const tz = req.query.tz;
    const n = tz != null && tz !== '' && !Number.isNaN(Number(tz)) ? Number(tz) : -new Date().getTimezoneOffset();
    return n * 60000;
  }

  private getReport(user: string, week: string): ReportRow | undefined {
    return this.dbManager.getConnection().prepare(
      'SELECT * FROM weekly_reports WHERE user_label = ? COLLATE NOCASE AND week_start = ?',
    ).get(user, week) as ReportRow | undefined;
  }

  // ── GET /api/reports/list ──────────────────────────────────────────
  private handleList = this.wrapHandler((req: Request, res: Response): void => {
    if (!this.authorized(req)) { this.unauthorized(res, 'invalid access token'); return; }
    const user = (req.query.user as string | undefined)?.trim();
    if (!user) { this.badRequest(res, 'missing user'); return; }
    const tzOffsetMs = this.tzOffsetMs(req);
    const rows = this.dbManager.getConnection().prepare(`
      SELECT week_start, week_end, generated_at_epoch, stats
      FROM weekly_reports WHERE user_label = ? COLLATE NOCASE
      ORDER BY week_start DESC LIMIT ?
    `).all(user, LIST_LIMIT) as Array<{ week_start: string; week_end: string; generated_at_epoch: number; stats: string | null }>;
    res.json({
      reports: rows.map(r => ({
        week_start: r.week_start,
        week_end: r.week_end,
        generated_at_epoch: r.generated_at_epoch,
        // complete = generated after the week fully elapsed → locked vs refreshable.
        complete: isPeriodComplete(r.generated_at_epoch, weekEndEpoch(r.week_start, tzOffsetMs)),
        stats: r.stats ? JSON.parse(r.stats) : null,
      })),
    });
  });

  // ── GET /api/reports/overview ──────────────────────────────────────
  // 每个用户的周报状态(最近周 + 本周是否已生成),供统计页「周报」表。
  private handleOverview = this.wrapHandler((req: Request, res: Response): void => {
    if (!this.authorized(req)) { this.unauthorized(res, 'invalid access token'); return; }
    const tzOffsetMs = this.tzOffsetMs(req);
    // Optional ?week=YYYY-MM-DD (Monday) selects a specific past week so the
    // stats page's weekly-report table can follow the chosen period; defaults
    // to the current week.
    const reqWeek = (req.query.week as string | undefined)?.trim();
    const week = (reqWeek && WEEK_RE.test(reqWeek)) ? reqWeek : weekMondayOf(Date.now(), tzOffsetMs);
    const weekEnd = this.fmtYMD(new Date(`${week}T00:00:00Z`).getTime() + 6 * 86400000);

    // has_current = whether a report exists for the SELECTED week (`week`), not
    // literally "the current week" — the name is kept for backward compatibility.
    // latest_week is the user's most recent report overall (drives `viewable`).
    // cur_gen = that week's report generated_at_epoch (0 if none) → derives `complete`.
    const rows = this.dbManager.getConnection().prepare(`
      SELECT user_label,
             MAX(week_start) AS latest_week,
             MAX(CASE WHEN week_start = ? THEN 1 ELSE 0 END) AS has_current,
             MAX(CASE WHEN week_start = ? THEN generated_at_epoch ELSE 0 END) AS cur_gen
      FROM weekly_reports GROUP BY user_label
    `).all(week, week) as Array<{ user_label: string; latest_week: string; has_current: number; cur_gen: number }>;
    const reportByUser = new Map(rows.map(r => [r.user_label, r]));

    // The week's [start,end) and which users actually did anything in it; roster
    // lists everyone so the table can grey out users with no content that week.
    const db = this.dbManager.getConnection();
    const weekEndE = weekEndEpoch(week, tzOffsetMs);
    const active = activeUsersInRange(db, weekEndE - 7 * DAY_MS, weekEndE);
    const roster = new Set<string>([...rosterAllUsers(db), ...rows.map(r => r.user_label)]);

    const users: Record<string, { latest_week: string; has_current: boolean; hasContent: boolean; complete: boolean }> = {};
    for (const u of roster) {
      const r = reportByUser.get(u);
      users[u] = {
        latest_week: r?.latest_week ?? '',
        has_current: !!r?.has_current,
        hasContent: active.has(u),
        complete: !!r?.has_current && isPeriodComplete(r?.cur_gen, weekEndE),
      };
    }
    res.json({ week, week_end: weekEnd, users });
  });

  /** YYYY-MM-DD (UTC) from an epoch — used to derive week_end deterministically. */
  private fmtYMD(epochMs: number): string {
    const d = new Date(epochMs);
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
  }

  // ── POST /api/reports/delete ───────────────────────────────────────
  private handleDelete = this.wrapHandler((req: Request, res: Response): void => {
    if (!this.authorized(req)) { this.unauthorized(res, 'invalid access token'); return; }
    const body = (req.body ?? {}) as { user?: string; week?: string };
    const user = (body.user ?? '').trim();
    const week = (body.week ?? '').trim();
    if (!user || !week || !WEEK_RE.test(week)) { this.badRequest(res, 'missing/invalid user or week'); return; }
    const info = this.dbManager.getConnection().prepare(
      'DELETE FROM weekly_reports WHERE user_label = ? COLLATE NOCASE AND week_start = ?',
    ).run(user, week);
    logger.info('WORKER', 'Weekly report deleted', { user, week, changes: info.changes });
    res.json({ ok: true, deleted: info.changes });
  });

  /**
   * Generate (or refresh) one user's weekly report, with the shared skip rule:
   * unless `force`, a report that already covers the full week (complete) is left
   * untouched. Returns the batch outcome so single + batch share one code path.
   */
  private async generateOne(user: string, week: string, tzOffsetMs: number, force: boolean): Promise<BatchOutcome> {
    if (!force) {
      const existing = this.getReport(user, week);
      if (existing && isPeriodComplete(existing.generated_at_epoch, weekEndEpoch(week, tzOffsetMs))) return 'skipped';
    }
    const report = await new ReportGenerator(this.dbManager.getConnection())
      .generate(user, week, tzOffsetMs);
    upsertWeeklyReport(this.dbManager.getConnection(), report);
    return 'generated';
  }

  /**
   * Build the History page's week grid for one user: the last HISTORY_WEEKS ISO
   * weeks (Mondays), each annotated with whether the period had content, whether
   * a report exists, and whether it's complete (locked). Empty-content weeks are
   * greyed/disabled in the UI and excluded from batch generation.
   */
  private historyWeekRows(user: string, tzOffsetMs: number): Array<{
    week_start: string; week_end: string; hasContent: boolean; complete: boolean;
    has_report: boolean; generated_at_epoch: number | null; stats: unknown;
  }> {
    const db = this.dbManager.getConnection();
    const thisMonday = weekMondayOf(Date.now(), tzOffsetMs);
    const [my, mm, md] = thisMonday.split('-').map(Number);
    const thisMondayWall = Date.UTC(my, mm - 1, md);
    const repRows = db.prepare(
      'SELECT week_start, week_end, generated_at_epoch, stats FROM weekly_reports WHERE user_label = ? COLLATE NOCASE',
    ).all(user) as Array<{ week_start: string; week_end: string; generated_at_epoch: number; stats: string | null }>;
    const repByWeek = new Map(repRows.map(r => [r.week_start, r]));
    const out = [];
    for (let i = 0; i < HISTORY_WEEKS; i++) {
      const wall = thisMondayWall - i * 7 * DAY_MS;
      const week_start = this.fmtYMD(wall);
      const week_end = this.fmtYMD(wall + 6 * DAY_MS);
      const wkEnd = weekEndEpoch(week_start, tzOffsetMs);
      const rep = repByWeek.get(week_start);
      out.push({
        week_start, week_end,
        hasContent: userHasActivity(db, user, wkEnd - 7 * DAY_MS, wkEnd),
        has_report: !!rep,
        complete: !!rep && isPeriodComplete(rep.generated_at_epoch, wkEnd),
        generated_at_epoch: rep?.generated_at_epoch ?? null,
        stats: rep?.stats ? JSON.parse(rep.stats) : null,
      });
    }
    return out;
  }

  // ── GET /api/reports/history-weeks?user=&tz= ───────────────────────
  // The History page's full 26-week grid for one user (content/report/complete
  // flags per week); empty-content weeks render greyed + disabled.
  private handleHistoryWeeks = this.wrapHandler((req: Request, res: Response): void => {
    if (!this.authorized(req)) { this.unauthorized(res, 'invalid access token'); return; }
    const user = (req.query.user as string | undefined)?.trim();
    if (!user) { this.badRequest(res, 'missing user'); return; }
    res.json({ weeks: this.historyWeekRows(user, this.tzOffsetMs(req)) });
  });

  // ── POST /api/reports/generate ─────────────────────────────────────
  private handleGenerate = this.wrapHandler(async (req: Request, res: Response): Promise<void> => {
    if (!this.authorized(req)) { this.unauthorized(res, 'invalid access token'); return; }
    const body = (req.body ?? {}) as { user?: string; week?: string; tz?: number; force?: boolean };
    const user = (body.user ?? '').trim();
    const tzOffsetMs = body.tz != null && !Number.isNaN(Number(body.tz)) ? Number(body.tz) * 60000 : this.tzOffsetMs(req);
    const week = (body.week ?? '').trim() || weekMondayOf(Date.now(), tzOffsetMs);
    if (!user) { this.badRequest(res, 'missing user'); return; }
    if (!WEEK_RE.test(week)) { this.badRequest(res, 'invalid week (expect YYYY-MM-DD Monday)'); return; }

    const outcome = await this.generateOne(user, week, tzOffsetMs, body.force === true);
    logger.info('WORKER', 'Weekly report generate', { user, week, outcome });
    res.json({ ok: true, outcome, skipped: outcome === 'skipped', week_start: week });
  });

  // ── POST /api/reports/batch ────────────────────────────────────────
  // mode 'week'    → all content-bearing users for the given `week`.
  // mode 'history' → all content-bearing past weeks of one `user`.
  // Returns a jobId the client polls; empty periods are never queued; complete
  // reports tally as 'skipped'.
  private handleBatch = this.wrapHandler((req: Request, res: Response): void => {
    if (!this.authorized(req)) { this.unauthorized(res, 'invalid access token'); return; }
    const body = (req.body ?? {}) as { mode?: string; week?: string; user?: string; tz?: number; force?: boolean };
    const tzOffsetMs = body.tz != null && !Number.isNaN(Number(body.tz)) ? Number(body.tz) * 60000 : this.tzOffsetMs(req);
    const force = body.force === true;
    const db = this.dbManager.getConnection();

    // Build the (user, week) task list for the requested mode.
    let tasks: Array<{ user: string; week: string }> = [];
    if (body.mode === 'history') {
      const user = (body.user ?? '').trim();
      if (!user) { this.badRequest(res, 'missing user'); return; }
      tasks = this.historyWeekRows(user, tzOffsetMs)
        .filter(w => w.hasContent && !w.complete)
        .map(w => ({ user, week: w.week_start }));
    } else {
      const week = (body.week ?? '').trim() || weekMondayOf(Date.now(), tzOffsetMs);
      if (!WEEK_RE.test(week)) { this.badRequest(res, 'invalid week (expect YYYY-MM-DD Monday)'); return; }
      const weekEndE = weekEndEpoch(week, tzOffsetMs);
      tasks = [...activeUsersInRange(db, weekEndE - 7 * DAY_MS, weekEndE)].map(user => ({ user, week }));
    }

    const job = createBatchJob(tasks.length);
    res.json({ jobId: job.id, total: job.total });

    void runPool(tasks, batchConcurrency(),
      (t) => this.generateOne(t.user, t.week, tzOffsetMs, force),
      (outcome) => recordOutcome(job.id, outcome),
    ).then(() => { finishBatchJob(job.id); logger.info('WORKER', 'Weekly batch done', { mode: body.mode ?? 'week', ...getBatchJob(job.id) }); });
  });

  // ── GET /api/reports/batch/:jobId ──────────────────────────────────
  private handleBatchStatus = this.wrapHandler((req: Request, res: Response): void => {
    if (!this.authorized(req)) { this.unauthorized(res, 'invalid access token'); return; }
    const job = getBatchJob(String(req.params.jobId));
    if (!job) { this.notFound(res, 'job not found'); return; }
    res.json(job);
  });

  // ── GET /api/reports/download ──────────────────────────────────────
  private handleDownload = this.wrapHandler((req: Request, res: Response): void => {
    if (!this.authorized(req)) { this.unauthorized(res, 'invalid access token'); return; }
    const user = (req.query.user as string | undefined)?.trim();
    const week = (req.query.week as string | undefined)?.trim();
    if (!user || !week || !WEEK_RE.test(week)) { this.badRequest(res, 'missing/invalid user or week'); return; }
    const row = this.getReport(user, week);
    if (!row) { this.notFound(res, 'report not found'); return; }
    const filename = `周报-${week}-${user}.md`;
    res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="report-${week}.md"; filename*=UTF-8''${encodeURIComponent(filename)}`);
    res.send(row.markdown);
  });

  // ── GET /report (整页 HTML,双栏) ──────────────────────────────────
  private handleReportPage = this.wrapHandler((req: Request, res: Response): void => {
    if (!this.authorized(req)) { res.status(401).set('Content-Type', 'text/html; charset=utf-8').send('<h1>401 未授权</h1><p>缺少有效的访问令牌。</p>'); return; }
    const user = (req.query.user as string | undefined)?.trim();
    const week = (req.query.week as string | undefined)?.trim();
    if (!user || !week || !WEEK_RE.test(week)) { res.status(400).set('Content-Type', 'text/html; charset=utf-8').send('<h1>400</h1><p>参数缺失或非法。</p>'); return; }

    const tokenQ = typeof req.query.token === 'string' ? req.query.token : '';
    const cur = this.getReport(user, week);
    const prevWeek = weekMondayOf(new Date(`${week}T00:00:00Z`).getTime() - 86400000, 0);
    const prev = this.getReport(user, prevWeek);

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(this.renderPage(user, week, cur, prevWeek, prev, tokenQ));
  });

  private renderPage(
    user: string, week: string, cur: ReportRow | undefined,
    prevWeek: string, prev: ReportRow | undefined, token: string,
  ): string {
    const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));
    const dl = (w: string) => {
      const q = new URLSearchParams({ user, week: w });
      if (token) q.set('token', token);
      return `/api/reports/download?${q.toString()}`;
    };
    const column = (label: string, w: string, row: ReportRow | undefined): string => {
      const head = `<div class="col-head"><span class="col-tag">${esc(label)}</span><span class="col-week">${esc(w)}</span>` +
        (row ? `<a class="dl" href="${dl(w)}">⬇ 下载 Markdown</a>` : '') + `</div>`;
      const body = row
        ? `<article class="md">${mdToHtml(row.markdown)}</article>`
        : `<div class="empty">该周暂无周报。可在统计页点击「刷新本周」生成。</div>`;
      return `<section class="col">${head}${body}</section>`;
    };
    // 始终左右两列:左=上一周(无报表则显示空内容),右=所选周。
    const single = false;
    return `<!doctype html><html lang="zh"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>周报 · ${esc(user)} · ${esc(week)}</title>
<script>
  /* 跟随 claude-mem 主题(system/light/dark);system 时跟随操作系统。 */
  (function(){try{var p=localStorage.getItem('claude-mem-theme')||'system';
    var dark=p==='dark'||(p!=='light'&&window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.setAttribute('data-theme',dark?'dark':'light');}catch(e){
    document.documentElement.setAttribute('data-theme','light');}})();
</script>
<style>
  :root, :root[data-theme="light"] { --bg:#ffffff; --bg2:#f6f8fa; --bd:#d0d7de; --tx:#1f2328; --mut:#57606a; --acc:#0969da; --code:#eaeef2; }
  :root[data-theme="dark"] { --bg:#161b22; --bg2:#0d1117; --bd:#30363d; --tx:#e6edf3; --mut:#8b949e; --acc:#2f81f7; --code:#262c36; }
  @media (prefers-color-scheme: dark) { :root:not([data-theme]) { --bg:#161b22; --bg2:#0d1117; --bd:#30363d; --tx:#e6edf3; --mut:#8b949e; --acc:#2f81f7; --code:#262c36; } }
  * { box-sizing: border-box; }
  html, body { height:100%; }
  body { margin:0; min-height:100vh; font:14px/1.7 -apple-system,Segoe UI,Roboto,"PingFang SC","Microsoft YaHei",sans-serif; color:var(--tx); background:var(--bg2); }
  header.top { padding:14px 22px; background:var(--bg); border-bottom:1px solid var(--bd); position:sticky; top:0; z-index:2; }
  header.top h1 { margin:0; font-size:16px; color:var(--tx); } header.top .sub { color:var(--mut); font-size:12px; margin-top:3px; }
  /* 占满浏览器窗口、四周留白、随窗口自适应 */
  .grid { display:grid; grid-template-columns:${single ? '1fr' : '1fr 1fr'}; gap:18px; padding:18px; width:100%; }
  @media (max-width: 820px) { .grid { grid-template-columns:1fr; } }
  .col { background:var(--bg); border:1px solid var(--bd); border-radius:10px; overflow:hidden; align-self:start; }
  .col-head { display:flex; align-items:center; gap:10px; padding:11px 16px; background:var(--bg2); border-bottom:1px solid var(--bd); position:sticky; top:50px; z-index:1; }
  .col-tag { font-weight:600; color:var(--acc); } .col-week { color:var(--mut); font-size:12px; }
  .dl { margin-left:auto; font-size:12px; text-decoration:none; color:#fff; background:var(--acc); padding:5px 12px; border-radius:6px; }
  .empty { padding:40px 16px; color:var(--mut); text-align:center; }
  article.md { padding:6px 20px 26px; }
  .md h1 { font-size:20px; border-bottom:1px solid var(--bd); padding-bottom:8px; }
  .md h2 { font-size:16px; margin-top:26px; border-bottom:1px solid var(--bd); padding-bottom:5px; }
  .md h3 { font-size:14px; margin-top:18px; color:var(--acc); }
  .md table { border-collapse:collapse; width:100%; } .md th,.md td { border:1px solid var(--bd); padding:6px 10px; text-align:left; }
  .md th { background:var(--bg2); }
  .md code { background:var(--code); padding:1px 5px; border-radius:4px; font-size:12px; }
  .md blockquote { margin:8px 0; padding:2px 12px; color:var(--mut); border-left:3px solid var(--bd); }
  .md ul { padding-left:20px; } .md li { margin:3px 0; }
  .md a { color:var(--acc); }
</style></head>
<body>
  <header class="top"><h1>📋 工作周报 · ${esc(user)}</h1><div class="sub">左:上一周(${esc(prevWeek)}) · 右:当周(${esc(week)})${single ? ' · 上一周无记录,仅显示当周' : ''}</div></header>
  <div class="grid">
    ${single ? '' : column('上一周', prevWeek, prev)}
    ${column('当周', week, cur)}
  </div>
</body></html>`;
  }
}
