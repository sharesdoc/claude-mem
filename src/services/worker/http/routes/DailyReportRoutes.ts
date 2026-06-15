import express, { Request, Response } from 'express';
import { timingSafeEqual } from 'crypto';
import { logger } from '../../../../utils/logger.js';
import { BaseRouteHandler } from '../BaseRouteHandler.js';
import { DatabaseManager } from '../../DatabaseManager.js';
import { AdminSessionStore, extractBearerToken } from '../AdminSessionStore.js';
import { SettingsDefaultsManager } from '../../../../shared/SettingsDefaultsManager.js';
import { USER_SETTINGS_PATH } from '../../../../shared/paths.js';
import { DailyReportGenerator, upsertDailyReport, dayOf } from '../../reports/DailyReportGenerator.js';
import { mdToHtml } from '../../reports/mdToHtml.js';
import { loopbackBypassAllowed } from '../middleware/tokenAuth.js';

/**
 * DailyReportRoutes — 日报后端接口(对照周报 ReportRoutes,做简)。
 *
 *   GET  /api/daily-reports/overview   每个用户的日报状态(最近日期/今天·昨天是否已生成),供统计页「日报」表
 *   POST /api/daily-reports/generate   同步生成/重算某用户某天日报(UPSERT;供「生成/重新生成」)
 *   POST /api/daily-reports/delete     删除某用户某天日报
 *   GET  /api/daily-reports/download   下载原始 .md,文件名 日报-<date>-<名字>.md
 *   GET  /daily-report                 服务端渲染整页 HTML:左=昨天、右=今天;两天皆无 → 显示「生成」按钮
 *
 * 鉴权同周报:standalone 直通;server 模式校验 Authorization: Bearer 或 ?token=
 * (新标签页无法带 header,故 /daily-report 与 /download 额外接受查询参数 token)。
 */

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86400000;

interface DailyRow {
  user_label: string; report_date: string;
  markdown: string; stats: string | null; model: string | null; generated_at_epoch: number;
}

export class DailyReportRoutes extends BaseRouteHandler {
  constructor(
    private dbManager: DatabaseManager,
    private requireAuth: boolean,
    private serverAccessToken: string,
    private adminSessions?: AdminSessionStore,
  ) {
    super();
  }

  setupRoutes(app: express.Application): void {
    app.get('/api/daily-reports/overview', this.handleOverview.bind(this));
    app.post('/api/daily-reports/generate', this.handleGenerate.bind(this));
    app.post('/api/daily-reports/delete', this.handleDelete.bind(this));
    app.get('/api/daily-reports/download', this.handleDownload.bind(this));
    app.get('/daily-report', this.handleReportPage.bind(this));
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
    // X-005: loopback operator with local auto-login enabled needs no token —
    // mirrors the API gate and tokenAuth so the stats page's daily-report
    // table loads on 127.0.0.1 just like the analytics endpoint does.
    if (loopbackBypassAllowed(req)) return true;
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

  private getReport(user: string, date: string): DailyRow | undefined {
    return this.dbManager.getConnection().prepare(
      'SELECT * FROM daily_reports WHERE user_label = ? COLLATE NOCASE AND report_date = ?',
    ).get(user, date) as DailyRow | undefined;
  }

  // ── GET /api/daily-reports/overview ────────────────────────────────
  // 返回:今天/昨天的本地日期 + 每个用户的日报状态(最近日期、今天/昨天是否已生成)。
  private handleOverview = this.wrapHandler((req: Request, res: Response): void => {
    if (!this.authorized(req)) { this.unauthorized(res, 'invalid access token'); return; }
    const tzOffsetMs = this.tzOffsetMs(req);
    // Optional ?date=YYYY-MM-DD selects a specific past day so the stats page's
    // daily-report table can follow the chosen period; defaults to today.
    // NOTE: the response field is still called `today`/`has_today` for backward
    // compatibility, but when ?date is given it means "the SELECTED day" — the
    // frontend uses it as the generate/delete target, keeping the table's date
    // column, button state, and actions all aligned to the picked day.
    const reqDate = (req.query.date as string | undefined)?.trim();
    const today = (reqDate && DATE_RE.test(reqDate)) ? reqDate : dayOf(Date.now(), tzOffsetMs);
    // `yesterday` = the day before the (possibly past) target. Build it from the
    // target's calendar parts → its local-midnight UTC epoch → minus one day,
    // rather than from Date.now(), so it tracks the selected day, not the real today.
    const [ty, tm, td] = today.split('-').map(Number);
    const yesterday = dayOf(Date.UTC(ty, tm - 1, td) - tzOffsetMs - DAY_MS, tzOffsetMs);

    const rows = this.dbManager.getConnection().prepare(`
      SELECT user_label,
             MAX(report_date) AS latest_date,
             MAX(CASE WHEN report_date = ? THEN 1 ELSE 0 END) AS has_today,
             MAX(CASE WHEN report_date = ? THEN 1 ELSE 0 END) AS has_yesterday
      FROM daily_reports GROUP BY user_label
    `).all(today, yesterday) as Array<{ user_label: string; latest_date: string; has_today: number; has_yesterday: number }>;

    const users: Record<string, { latest_date: string; has_today: boolean; has_yesterday: boolean }> = {};
    for (const r of rows) {
      users[r.user_label] = { latest_date: r.latest_date, has_today: !!r.has_today, has_yesterday: !!r.has_yesterday };
    }
    res.json({ today, yesterday, users });
  });

  // ── POST /api/daily-reports/generate ───────────────────────────────
  private handleGenerate = this.wrapHandler(async (req: Request, res: Response): Promise<void> => {
    if (!this.authorized(req)) { this.unauthorized(res, 'invalid access token'); return; }
    const body = (req.body ?? {}) as { user?: string; date?: string; tz?: number };
    const user = (body.user ?? '').trim();
    const tzOffsetMs = body.tz != null && !Number.isNaN(Number(body.tz)) ? Number(body.tz) * 60000 : this.tzOffsetMs(req);
    const date = (body.date ?? '').trim() || dayOf(Date.now(), tzOffsetMs);
    if (!user) { this.badRequest(res, 'missing user'); return; }
    if (!DATE_RE.test(date)) { this.badRequest(res, 'invalid date (expect YYYY-MM-DD)'); return; }

    const report = await new DailyReportGenerator(this.dbManager.getConnection())
      .generate(user, date, tzOffsetMs, this.model());
    upsertDailyReport(this.dbManager.getConnection(), report);

    logger.info('WORKER', 'Daily report generated', { user: report.user_label, date, aiModel: report.model || '(none)' });
    res.json({ ok: true, report_date: report.report_date, generated_at_epoch: report.generated_at_epoch });
  });

  // ── POST /api/daily-reports/delete ─────────────────────────────────
  private handleDelete = this.wrapHandler((req: Request, res: Response): void => {
    if (!this.authorized(req)) { this.unauthorized(res, 'invalid access token'); return; }
    const body = (req.body ?? {}) as { user?: string; date?: string };
    const user = (body.user ?? '').trim();
    const date = (body.date ?? '').trim();
    if (!user || !date || !DATE_RE.test(date)) { this.badRequest(res, 'missing/invalid user or date'); return; }
    const info = this.dbManager.getConnection().prepare(
      'DELETE FROM daily_reports WHERE user_label = ? COLLATE NOCASE AND report_date = ?',
    ).run(user, date);
    logger.info('WORKER', 'Daily report deleted', { user, date, changes: info.changes });
    res.json({ ok: true, deleted: info.changes });
  });

  // ── GET /api/daily-reports/download ────────────────────────────────
  private handleDownload = this.wrapHandler((req: Request, res: Response): void => {
    if (!this.authorized(req)) { this.unauthorized(res, 'invalid access token'); return; }
    const user = (req.query.user as string | undefined)?.trim();
    const date = (req.query.date as string | undefined)?.trim();
    if (!user || !date || !DATE_RE.test(date)) { this.badRequest(res, 'missing/invalid user or date'); return; }
    const row = this.getReport(user, date);
    if (!row) { this.notFound(res, 'report not found'); return; }
    const filename = `日报-${date}-${user}.md`;
    res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="daily-${date}.md"; filename*=UTF-8''${encodeURIComponent(filename)}`);
    res.send(row.markdown);
  });

  // ── GET /daily-report (整页 HTML,左=昨天、右=今天) ─────────────────
  private handleReportPage = this.wrapHandler((req: Request, res: Response): void => {
    if (!this.authorized(req)) { res.status(401).set('Content-Type', 'text/html; charset=utf-8').send('<h1>401 未授权</h1><p>缺少有效的访问令牌。</p>'); return; }
    const user = (req.query.user as string | undefined)?.trim();
    if (!user) { res.status(400).set('Content-Type', 'text/html; charset=utf-8').send('<h1>400</h1><p>参数缺失:user。</p>'); return; }

    const tokenQ = typeof req.query.token === 'string' ? req.query.token : '';
    const tzOffsetMs = this.tzOffsetMs(req);
    const today = dayOf(Date.now(), tzOffsetMs);
    const yesterday = dayOf(Date.now() - DAY_MS, tzOffsetMs);
    const cur = this.getReport(user, today);
    const prev = this.getReport(user, yesterday);

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(this.renderPage(user, today, cur, yesterday, prev, tokenQ));
  });

  private renderPage(
    user: string, today: string, cur: DailyRow | undefined,
    yesterday: string, prev: DailyRow | undefined, token: string,
  ): string {
    const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));
    const dl = (date: string) => {
      const q = new URLSearchParams({ user, date });
      if (token) q.set('token', token);
      return `/api/daily-reports/download?${q.toString()}`;
    };
    // 当日无日报时:显示「生成今日日报」按钮(内联 JS POST → 成功后刷新本页)。
    const genButton = (date: string, label: string): string =>
      `<div class="empty"><p>${esc(label)}</p>` +
      `<button class="gen" onclick="genDaily('${esc(date)}')">⚡ 生成${esc(date === today ? '今日' : '')}日报</button>` +
      `<p class="hint" id="gen-hint"></p></div>`;
    const column = (tag: string, date: string, row: DailyRow | undefined, isToday: boolean): string => {
      const head = `<div class="col-head"><span class="col-tag">${esc(tag)}</span><span class="col-date">${esc(date)}</span>` +
        (row ? `<a class="dl" href="${dl(date)}">⬇ 下载 Markdown</a>` : '') + `</div>`;
      const body = row
        ? `<article class="md">${mdToHtml(row.markdown)}</article>`
        : genButton(date, isToday ? '今日暂无日报。' : '当日暂无日报。');
      return `<section class="col">${head}${body}</section>`;
    };
    // 没有昨天的则只显示今天;两天皆无时今天列里就是「生成」按钮。
    const single = !prev;
    return `<!doctype html><html lang="zh"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>日报 · ${esc(user)} · ${esc(today)}</title>
<script>
  /* 跟随 claude-mem 主题(system/light/dark);system 时跟随操作系统。 */
  (function(){try{var p=localStorage.getItem('claude-mem-theme')||'system';
    var dark=p==='dark'||(p!=='light'&&window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.setAttribute('data-theme',dark?'dark':'light');}catch(e){
    document.documentElement.setAttribute('data-theme','light');}})();
  var GEN_USER=${JSON.stringify(user)}, GEN_TOKEN=${JSON.stringify(token)};
  function genDaily(date){
    var hint=document.getElementById('gen-hint'); if(hint)hint.textContent='生成中,请稍候…';
    var url='/api/daily-reports/generate'+(GEN_TOKEN?('?token='+encodeURIComponent(GEN_TOKEN)):'');
    fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({user:GEN_USER,date:date,tz:-new Date().getTimezoneOffset()})})
      .then(function(r){if(!r.ok)throw new Error('HTTP '+r.status);return r.json();})
      .then(function(){location.reload();})
      .catch(function(e){if(hint)hint.textContent='生成失败:'+e.message;});
  }
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
  .grid { display:grid; grid-template-columns:${single ? '1fr' : '1fr 1fr'}; gap:18px; padding:18px; width:100%; }
  @media (max-width: 820px) { .grid { grid-template-columns:1fr; } }
  .col { background:var(--bg); border:1px solid var(--bd); border-radius:10px; overflow:hidden; align-self:start; }
  .col-head { display:flex; align-items:center; gap:10px; padding:11px 16px; background:var(--bg2); border-bottom:1px solid var(--bd); position:sticky; top:50px; z-index:1; }
  .col-tag { font-weight:600; color:var(--acc); } .col-date { color:var(--mut); font-size:12px; }
  .dl { margin-left:auto; font-size:12px; text-decoration:none; color:#fff; background:var(--acc); padding:5px 12px; border-radius:6px; }
  .empty { padding:40px 16px; color:var(--mut); text-align:center; }
  .empty .gen { margin-top:8px; font-size:13px; color:#fff; background:var(--acc); border:0; padding:8px 18px; border-radius:6px; cursor:pointer; }
  .empty .hint { margin-top:10px; font-size:12px; color:var(--mut); }
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
  <header class="top"><h1>📝 工作日报 · ${esc(user)}</h1><div class="sub">左:昨天(${esc(yesterday)}) · 右:今天(${esc(today)})${single ? ' · 昨天无记录,仅显示今天' : ''}</div></header>
  <div class="grid">
    ${single ? '' : column('昨天', yesterday, prev, false)}
    ${column('今天', today, cur, true)}
  </div>
</body></html>`;
  }
}
