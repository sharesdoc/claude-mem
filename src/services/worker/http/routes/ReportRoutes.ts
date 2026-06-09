import express, { Request, Response } from 'express';
import { marked } from 'marked';
import { timingSafeEqual } from 'crypto';
import { logger } from '../../../../utils/logger.js';
import { BaseRouteHandler } from '../BaseRouteHandler.js';
import { DatabaseManager } from '../../DatabaseManager.js';
import { AdminSessionStore, extractBearerToken } from '../AdminSessionStore.js';
import { SettingsDefaultsManager } from '../../../../shared/SettingsDefaultsManager.js';
import { USER_SETTINGS_PATH } from '../../../../shared/paths.js';
import { ReportGenerator, upsertWeeklyReport, weekMondayOf } from '../../reports/ReportGenerator.js';

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

interface ReportRow {
  user_label: string; week_start: string; week_end: string;
  markdown: string; stats: string | null; model: string | null; generated_at_epoch: number;
}

export class ReportRoutes extends BaseRouteHandler {
  constructor(
    private dbManager: DatabaseManager,
    private requireAuth: boolean,
    private serverAccessToken: string,
    private adminSessions?: AdminSessionStore,
  ) {
    super();
  }

  setupRoutes(app: express.Application): void {
    app.get('/api/reports/list', this.handleList.bind(this));
    app.post('/api/reports/generate', this.handleGenerate.bind(this));
    app.get('/api/reports/download', this.handleDownload.bind(this));
    app.get('/report', this.handleReportPage.bind(this));
  }

  // ── 鉴权:bearer 或 ?token(新标签页用);standalone 直通 ───────────
  private authorized(req: Request): boolean {
    if (!this.requireAuth) return true;
    const presented = extractBearerToken(req) ?? (typeof req.query.token === 'string' ? req.query.token : '');
    const expected = (this.serverAccessToken ?? '').trim();
    if (expected && presented && presented.length <= 256) {
      const a = Buffer.alloc(256, 0); Buffer.from(presented, 'ascii').copy(a);
      const b = Buffer.alloc(256, 0); Buffer.from(expected, 'ascii').copy(b);
      if (timingSafeEqual(a, b)) return true;
    }
    if (this.adminSessions && presented && this.adminSessions.verify(presented)) return true;
    return false;
  }

  private tzOffsetMs(req: Request): number {
    const tz = req.query.tz;
    const n = tz != null && tz !== '' && !Number.isNaN(Number(tz)) ? Number(tz) : -new Date().getTimezoneOffset();
    return n * 60000;
  }

  private model(): string {
    try {
      return SettingsDefaultsManager.loadFromFile(USER_SETTINGS_PATH).CLAUDE_MEM_WEEKLY_REPORT_MODEL || 'qwen-plus';
    } catch { return 'qwen-plus'; }
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
        stats: r.stats ? JSON.parse(r.stats) : null,
      })),
    });
  });

  // ── POST /api/reports/generate ─────────────────────────────────────
  private handleGenerate = this.wrapHandler(async (req: Request, res: Response): Promise<void> => {
    if (!this.authorized(req)) { this.unauthorized(res, 'invalid access token'); return; }
    const body = (req.body ?? {}) as { user?: string; week?: string; tz?: number };
    const user = (body.user ?? '').trim();
    const tzOffsetMs = body.tz != null && !Number.isNaN(Number(body.tz)) ? Number(body.tz) * 60000 : this.tzOffsetMs(req);
    const week = (body.week ?? '').trim() || weekMondayOf(Date.now(), tzOffsetMs);
    if (!user) { this.badRequest(res, 'missing user'); return; }
    if (!WEEK_RE.test(week)) { this.badRequest(res, 'invalid week (expect YYYY-MM-DD Monday)'); return; }

    const report = await new ReportGenerator(this.dbManager.getConnection())
      .generate(user, week, tzOffsetMs, this.model());
    upsertWeeklyReport(this.dbManager.getConnection(), report);

    logger.info('WORKER', 'Weekly report generated', { user: report.user_label, week, aiModel: report.model || '(none)' });
    res.json({ ok: true, week_start: report.week_start, generated_at_epoch: report.generated_at_epoch });
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
        ? `<article class="md">${marked.parse(row.markdown) as string}</article>`
        : `<div class="empty">该周暂无周报。可在统计页点击「刷新本周」生成。</div>`;
      return `<section class="col">${head}${body}</section>`;
    };
    const single = !prev;
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
  <header class="top"><h1>📋 工作周报 · ${esc(user)}</h1><div class="sub">左:上周(${esc(prevWeek)}) · 右:本周(${esc(week)})${single ? ' · 上周无记录,仅显示本周' : ''}</div></header>
  <div class="grid">
    ${single ? '' : column('上周', prevWeek, prev)}
    ${column('本周', week, cur)}
  </div>
</body></html>`;
  }
}
