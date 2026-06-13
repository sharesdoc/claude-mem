import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { AnalyticsResponse, WeeklyReportItem, DailyReportOverview, WeeklyReportOverview } from '../types';
import { useLocale } from '../hooks/useLocale';
import { authFetch } from '../utils/api';

interface StatsPageProps {
  currentFilter: string;
  userLabelFilter?: string | null;
}

type Scope = '24h' | 'day' | 'week' | 'month' | 'quarter' | 'history';
const SCOPE_KEY = 'claude-mem.statsScope';
const SCOPES: Scope[] = ['24h', 'day', 'week', 'month', 'quarter', 'history'];

const USER_COLORS = [
  '#0969da', '#1a7f37', '#cf222e', '#8250df', '#9a6700',
  '#0550ae', '#16c60c', '#e74856', '#8e7cbc', '#d4b888',
];

/** Map a data point bucket label to its chart bucket key given granularity. */
function bucketKeyOf(day: string, granularity: 'hour' | 'day' | 'week'): string {
  if (granularity === 'hour') return day; // "YYYY-MM-DD HH:00" → as-is
  if (granularity === 'day') return day;
  const [y, m, d] = day.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  const wd = dt.getDay();
  dt.setDate(dt.getDate() - (wd === 0 ? 6 : wd - 1)); // Monday of that week
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

// Current month (backend default), or explicit days

function formatNumber(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'k';
  return String(n);
}

function formatDayLabel(bucket: string): string {
  // Hourly 24h bucket key keeps its date for correct grouping/coloring, while
  // the axis label only shows the integer hour. Today vs previous day is color-coded.
  const hourMatch = bucket.match(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}:00)$/);
  if (hourMatch) return String(Number(hourMatch[4].slice(0, 2)));
  const d = new Date(bucket + 'T00:00:00');
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function localDateKey(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function dayLabelColor(bucket: string): string {
  const hourMatch = bucket.match(/^(\d{4}-\d{2}-\d{2}) \d{2}:00$/);
  if (!hourMatch) return 'var(--color-text-muted)';
  return hourMatch[1] === localDateKey()
    ? 'var(--stats-hour-label-current, var(--color-text-primary))'
    : 'var(--stats-hour-label-previous, var(--color-text-muted))';
}

function isHourlyBucket(bucket: string): boolean {
  return /^\d{4}-\d{2}-\d{2} \d{2}:00$/.test(bucket);
}

function formatProcessingTime(ms: number): string {
  if (ms <= 0) return '-';
  const mins = ms / 60000;
  if (mins < 60) return `${Math.round(mins)}m`;
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  if (m === 0) return `${h}h`;
  return `${h}h${m}m`;
}

function formatDailyAvg(ms: number, days: number): string {
  if (ms <= 0 || days <= 0) return '-';
  const avgMin = ms / days / 60000;
  if (avgMin < 60) return `${Math.round(avgMin)}m/d`;
  const h = Math.floor(avgMin / 60);
  const m = Math.round(avgMin % 60);
  if (m === 0) return `${h}h/d`;
  return `${h}h${m}m/d`;
}

/* ── LineChart: reusable SVG line chart ───────────────────────────── */
interface LineSeries {
  user_label: string;
  color: string;
  points: number[];
  maxVal: number;
}

interface LineChartProps {
  title: string;
  series: LineSeries[];
  svgW: number; svgH: number;
  svgPadding: { top: number; right: number; bottom: number; left: number };
  plotW: number; plotH: number;
  lineChartRef?: React.RefObject<HTMLDivElement | null>;
  formatY: (val: number) => string;
  allDays: string[];
  formatDayLabel: (day: string) => string;
  hiddenUsers: Set<string>;
  onToggleUser: (user: string) => void;
  showLegend: boolean;
}

function LineChart({ title, series, svgW, svgH, svgPadding, plotW, plotH, lineChartRef, formatY, allDays, formatDayLabel: fmtDay, hiddenUsers, onToggleUser, showLegend }: LineChartProps) {
  if (series.length === 0) return null;
  const visible = series.filter(s => !hiddenUsers.has(s.user_label));
  const globalMax = visible.reduce((m, s) => Math.max(m, s.maxVal), 1);
  const totalDays = series[0].points.length;
  const showEveryLabel = allDays.length > 0 && allDays.every(isHourlyBucket);
  const step = showEveryLabel ? 1 : Math.max(1, Math.floor(allDays.length / 9));
  // Bar chart: each user group gets a bar per day, side by side
  const barGroupWidth = plotW / Math.max(totalDays, 1);
  const barWidth = Math.max(2, (barGroupWidth * 0.5) / Math.max(visible.length, 1));
  const barGap = 1;

  return (
    <div className="stats-chart">
      <div className="stats-chart-title">{title}</div>
      <div className="stats-line-chart" ref={lineChartRef}>
        <svg width={svgW} height={svgH} viewBox={`0 0 ${svgW} ${svgH}`} preserveAspectRatio="xMidYMid meet">
          {[0, 0.25, 0.5, 0.75, 1].map(fr => {
            const y = svgPadding.top + plotH * (1 - fr);
            return (
              <g key={`g-${fr}`}>
                <line x1={svgPadding.left} y1={y} x2={svgW - svgPadding.right} y2={y}
                  stroke="var(--color-border-primary)" strokeWidth="0.5" />
                <text x={svgPadding.left - 6} y={y + 4} textAnchor="end"
                  fill="var(--color-text-muted)" fontSize="9" fontFamily="monospace">
                  {formatY(Math.round(globalMax * fr))}
                </text>
              </g>
            );
          })}
          {allDays.filter((_d, idx) => idx % step === 0).map(day => {
            const idx = allDays.indexOf(day);
            // Band-center: each day occupies a slot, label/bar centered in it
            const x = svgPadding.left + (idx + 0.5) * (plotW / Math.max(totalDays, 1));
            return (
              <text key={day} x={x} y={svgH - 6} textAnchor="middle"
                fill={dayLabelColor(day)} fontSize="8" fontFamily="monospace">
                {fmtDay(day)}
              </text>
            );
          })}
          {visible.map((s, ui) => {
            const pts = s.points;
            return pts.map((val, di) => {
              if (val === 0) return null;
              // Band-center: bar group sits in the middle of its day slot,
              // so the first bar is inset from the Y-axis (not at x=0).
              const groupX = svgPadding.left + (di + 0.5) * (plotW / Math.max(totalDays, 1));
              const bx = groupX - (visible.length * (barWidth + barGap)) / 2 + ui * (barWidth + barGap);
              const bh = Math.max(1, (val / globalMax) * plotH);
              const by = svgPadding.top + plotH - bh;
              return (
                <g key={`${s.user_label}-${di}`}>
                  <rect x={bx} y={by} width={barWidth} height={bh} fill={s.color} rx="1" />
                  <text x={bx + barWidth / 2} y={by - 3} textAnchor="middle"
                    fill="var(--color-text-secondary)" fontSize="8" fontFamily="monospace">
                    {formatY(val)}
                  </text>
                </g>
              );
            });
          })}
        </svg>
        {showLegend && (
          <div className="stats-user-legend">
            {series.map(s => (
              <label key={s.user_label} className="stats-user-legend-item">
                <input type="checkbox" className="stats-legend-checkbox" checked={!hiddenUsers.has(s.user_label)}
                  onChange={() => onToggleUser(s.user_label)} />
                <span style={{ color: s.color, fontWeight: 500 }}>{s.user_label}</span>
              </label>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── TrendBars: single-series SVG bar chart with axes + gridlines.
   Mirrors the LineChart look (Y-axis labels, horizontal gridlines, X labels). ── */
interface TrendPoint { label: string; value: number; }
function TrendBars({ title, color, points, formatVal }: {
  title: string; color: string; points: TrendPoint[]; formatVal: (v: number) => string;
}) {
  if (points.length === 0) return null;
  const max = Math.max(...points.map(p => p.value), 1);
  const svgW = 600, svgH = 220;
  const pad = { top: 16, right: 8, bottom: 32, left: 46 };
  const plotW = svgW - pad.left - pad.right;
  const plotH = svgH - pad.top - pad.bottom;
  const n = points.length;
  const band = plotW / Math.max(n, 1);
  const barW = Math.max(2, Math.min(28, band * 0.5));
  const step = Math.max(1, Math.ceil(n / 12)); // subsample x labels when crowded

  return (
    <div className="stats-chart">
      <div className="stats-chart-title">{title}</div>
      <div className="stats-line-chart">
        <svg width={svgW} height={svgH} viewBox={`0 0 ${svgW} ${svgH}`} preserveAspectRatio="xMidYMid meet">
          {/* Y-axis gridlines + labels */}
          {[0, 0.25, 0.5, 0.75, 1].map(fr => {
            const y = pad.top + plotH * (1 - fr);
            return (
              <g key={`g-${fr}`}>
                <line x1={pad.left} y1={y} x2={svgW - pad.right} y2={y}
                  stroke="var(--color-border-primary)" strokeWidth="0.5" />
                <text x={pad.left - 6} y={y + 4} textAnchor="end"
                  fill="var(--color-text-muted)" fontSize="9" fontFamily="monospace">
                  {fr === 0 ? '0' : formatVal(Math.round(max * fr))}
                </text>
              </g>
            );
          })}
          {/* Bars + value labels + X-axis labels */}
          {points.map((p, i) => {
            const cx = pad.left + (i + 0.5) * band;
            const bh = p.value > 0 ? Math.max(1, (p.value / max) * plotH) : 0;
            const by = pad.top + plotH - bh;
            return (
              <g key={p.label}>
                {p.value > 0 && (
                  <rect x={cx - barW / 2} y={by} width={barW} height={bh} fill={color} rx="1" />
                )}
                {p.value > 0 && (
                  <text x={cx} y={by - 3} textAnchor="middle"
                    fill="var(--color-text-secondary)" fontSize="8" fontFamily="monospace">
                    {formatVal(p.value)}
                  </text>
                )}
                {i % step === 0 && (
                  <text x={cx} y={svgH - 6} textAnchor="middle"
                    fill="var(--color-text-muted)" fontSize="8" fontFamily="monospace">
                    {p.label}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}

export function StatsPage({ currentFilter, userLabelFilter }: StatsPageProps) {
  const { t } = useLocale();

  // ── Data fetching state ──────────────────────────────────────────
  const [analytics, setAnalytics] = useState<AnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ── Chart layout ─────────────────────────────────────────────────
  const lineChartRef = useRef<HTMLDivElement>(null);
  const [chartWidth, setChartWidth] = useState(600);

  // ── Shared checkbox state: both charts toggle the same users ─────
  const [hiddenUsers, setHiddenUsers] = useState<Set<string>>(new Set());
  const toggleHiddenUser = useCallback((user: string) => {
    setHiddenUsers(prev => { const n = new Set(prev); if (n.has(user)) n.delete(user); else n.add(user); return n; });
  }, []);

  // ── Tab state ────────────────────────────────────────────────────
  // projectTab: switches the project-ranking section (prompts vs AI time)
  const [projectTab, setProjectTab] = useState<'prompts' | 'time'>('time');

  // historyUser: which person's tab is selected in the History view.
  // null → fall back to the first (most-active) user.
  const [historyUser, setHistoryUser] = useState<string | null>(null);

  // ── Weekly reports (History view) ────────────────────────────────
  const [historyReports, setHistoryReports] = useState<WeeklyReportItem[]>([]);
  const [reportsBusy, setReportsBusy] = useState(false);

  // ── Daily reports (日报 table on the All-Projects stats page) ─────
  // Per-user status (latest date + whether today/yesterday exist). Users with
  // no daily report yet are simply absent from `users`.
  const [dailyOverview, setDailyOverview] = useState<DailyReportOverview | null>(null);
  // user_labels currently generating/deleting → disables those rows' buttons.
  // A Set (not a single value) so multiple users can run concurrently — e.g.
  // click 张三 生成 then immediately 李四 生成; each request is independent.
  const [dailyBusyUsers, setDailyBusyUsers] = useState<Set<string>>(new Set());

  // ── Weekly reports (周报 table on the Week stats page) ────────────
  // Same shape/UX as the daily table, but for the current week per user.
  const [weeklyOverview, setWeeklyOverview] = useState<WeeklyReportOverview | null>(null);
  const [weeklyBusyUsers, setWeeklyBusyUsers] = useState<Set<string>>(new Set());

  // scope: GLOBAL time range — drives EVERY section on the page. Persisted.
  const [scope, setScope] = useState<Scope>(() => {
    try {
      const s = localStorage.getItem(SCOPE_KEY) as Scope | null;
      if (s === '24h' || s === 'day' || s === 'week' || s === 'month' || s === 'quarter') return s;
    } catch {}
    return 'week';
  });
  const changeScope = useCallback((s: Scope) => {
    setScope(s);
    try { localStorage.setItem(SCOPE_KEY, s); } catch {}
  }, []);

  /**
   * Fetch analytics from the backend. Aborts in-flight requests when
   * currentFilter / userLabelFilter / scope changes to avoid stale data races.
   */
  const loadAnalytics = useCallback(async () => {
    setLoading(true);
    setError(null);
    const controller = new AbortController();
    try {
      const params = new URLSearchParams();
      params.set('scope', scope); // global scope for the whole page
      // Send the viewer's TZ so day/week/month boundaries follow the user's
      // computer even when the worker (server mode) runs in another timezone.
      params.set('tz', String(-new Date().getTimezoneOffset()));
      if (currentFilter) params.set('project', currentFilter);
      if (userLabelFilter) params.set('userLabel', userLabelFilter);
      const resp = await authFetch(`/api/stats/analytics?${params}`, { signal: controller.signal });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json() as AnalyticsResponse;
      setAnalytics(data);
    } catch (err: unknown) {
      if ((err as Error).name === 'AbortError') return;
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
    return () => controller.abort();
  }, [currentFilter, userLabelFilter, scope]);

  useEffect(() => {
    const ctrl = loadAnalytics();
    return () => { ctrl.then(fn => fn?.()); };
  }, [loadAnalytics]);

  useEffect(() => {
    const el = lineChartRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      for (const e of entries) setChartWidth(e.contentRect.width);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Build per-user chart series by aggregating daily points into the backend's
  // chartBuckets (day or week granularity). Shared by both charts.
  const buildSeries = useCallback((
    points: Array<{ day: string; user_label: string }> & Array<Record<string, number>> | undefined,
    valueKey: 'count' | 'totalMs',
  ) => {
    if (!analytics) return [];
    const users = analytics.uniqueUsers;
    const buckets = analytics.chartBuckets ?? [];
    if (users.length === 0 || buckets.length === 0) return [];
    const gran = (analytics.granularity ?? 'day') as 'hour' | 'day' | 'week';
    // bucketed: bucketKey -> user -> summed value
    const bucketed = new Map<string, Record<string, number>>();
    for (const pt of (points ?? [])) {
      const key = bucketKeyOf((pt as { day: string }).day, gran);
      let rec = bucketed.get(key);
      if (!rec) { rec = {}; bucketed.set(key, rec); }
      const u = (pt as { user_label: string }).user_label;
      rec[u] = (rec[u] ?? 0) + ((pt as Record<string, number>)[valueKey] ?? 0);
    }
    return users.map((user, idx) => {
      const pts = buckets.map(b => bucketed.get(b)?.[user] ?? 0);
      return { user_label: user, color: USER_COLORS[idx % USER_COLORS.length], points: pts, total: pts.reduce((a, b) => a + b, 0), maxVal: Math.max(...pts, 1) };
    });
  }, [analytics]);

  const userSeries = useMemo(
    () => buildSeries(analytics?.promptsByUserByDay as never, 'count'),
    [analytics, buildSeries]);
  const userTimeSeries = useMemo(
    () => buildSeries(analytics?.dailyProcessingTimeByUser as never, 'totalMs'),
    [analytics, buildSeries]);

  // User Summary table: all counts come from backend, scoped by the active
  // time tab (userSummaryCounts/userProcessingTime/userProjectMeta) — NOT from
  // the monthly chart arrays. Sorted by AI processing time descending.
  const userSummary = useMemo(() => {
    if (!analytics) return [];
    const users = analytics.uniqueUsers;
    if (users.length === 0) return [];
    const ptData = analytics.userProcessingTime ?? {};
    const meta = analytics.userProjectMeta ?? {};
    const counts = analytics.userSummaryCounts ?? {};
    return users.map(u => {
      const t = ptData[u]; const m = meta[u]; const c = counts[u];
      return {
        user_label: u,
        prompts: c?.prompts ?? 0,
        obs: c?.obs ?? 0,
        summaries: c?.summaries ?? 0,
        processingMs: t?.totalMs ?? 0,
        sessionCount: t?.sessionCount ?? 0,
        projectCount: m?.projectCount ?? 0,
        activeDays: m?.activeDays ?? 0,
      };
    })
    // Drop users with zero activity in the selected window
    .filter(r => r.prompts > 0 || r.obs > 0 || r.summaries > 0 || r.processingMs > 0)
    .sort((a, b) => b.processingMs - a.processingMs);
  }, [analytics]);

  const projectPrompts = useMemo(() => {
    const rows = analytics?.promptsByProject ?? [];
    return [...rows].sort((a, b) => b.count - a.count);
  }, [analytics]);
  const maxProjectPrompts = projectPrompts.length > 0 ? projectPrompts[0].count : 1;

  const projectTimes = useMemo(() => {
    return (analytics?.projectProcessingTime ?? []);
  }, [analytics]);
  const maxProjectTime = projectTimes.length > 0 ? projectTimes[0].totalMs : 1;

  /**
   * Business days in the data range (Mon–Fri only).
   * Used as the denominator for Avg/Day and Prompts/Day columns so
   * weekends don't dilute the daily average.
   */
  // Business days for the User Summary scope — provided by the backend so it
  // matches the active Today/Week/Month tab (not the monthly chart range).
  const bizDays = Math.max(analytics?.summaryBusinessDays ?? 1, 1);

  // History view: active user (mirrors the history-branch derivation) drives the
  // weekly-report list fetch. Sorted by total AI time desc, zero-activity dropped.
  const historyUsers = useMemo(() => {
    if (!analytics) return [] as string[];
    const act = (r: { prompts: number; obs: number; summaries: number; sessions: number }) =>
      !(r.prompts === 0 && r.obs === 0 && r.summaries === 0 && r.sessions === 0);
    const ms = new Map<string, number>();
    const set = new Set<string>();
    for (const m of (analytics.historyMonths ?? [])) if (act(m)) { set.add(m.user_label); ms.set(m.user_label, (ms.get(m.user_label) ?? 0) + m.processingMs); }
    for (const w of (analytics.historyWeeks ?? [])) if (act(w)) { set.add(w.user_label); if (!ms.has(w.user_label)) ms.set(w.user_label, w.processingMs); }
    return Array.from(set).sort((a, b) => (ms.get(b) ?? 0) - (ms.get(a) ?? 0));
  }, [analytics]);
  const historyActiveUser = (historyUser && historyUsers.includes(historyUser)) ? historyUser : historyUsers[0];

  const loadReports = useCallback(async (user: string | undefined) => {
    if (!user) { setHistoryReports([]); return; }
    try {
      const resp = await authFetch('/api/reports/list?user=' + encodeURIComponent(user));
      if (resp.ok) { const d = await resp.json() as { reports: WeeklyReportItem[] }; setHistoryReports(d.reports ?? []); }
      else setHistoryReports([]);
    } catch { setHistoryReports([]); }
  }, []);

  useEffect(() => {
    if (scope !== 'history') return;
    void loadReports(historyActiveUser);
  }, [scope, historyActiveUser, loadReports]);

  const refreshThisWeek = useCallback(async (user: string) => {
    setReportsBusy(true);
    try {
      const tz = -new Date().getTimezoneOffset();
      // 显式传入本周周一,只生成当前周的周报(不依赖后端默认值)
      const now = new Date(); const wd = now.getDay() || 7;
      const mon = new Date(now); mon.setDate(now.getDate() - wd + 1);
      const week = `${mon.getFullYear()}-${String(mon.getMonth()+1).padStart(2,'0')}-${String(mon.getDate()).padStart(2,'0')}`;
      await authFetch('/api/reports/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user, week, tz }),
      });
      await loadReports(user);
    } catch { /* surfaced via empty/unchanged list */ }
    finally { setReportsBusy(false); }
  }, [loadReports]);

  // ── 日报:状态总览 + 生成/删除(供 All-Projects 页「日报」表) ──────
  const loadDailyOverview = useCallback(async () => {
    try {
      const tz = -new Date().getTimezoneOffset();
      const resp = await authFetch('/api/daily-reports/overview?tz=' + tz);
      if (resp.ok) setDailyOverview(await resp.json() as DailyReportOverview);
    } catch { /* 保持旧值;失败不阻塞页面 */ }
  }, []);

  // 标记/解除某用户的忙碌态(用函数式更新,避免并发点击时相互覆盖 Set)。
  const markBusy = useCallback((user: string, busy: boolean) => {
    setDailyBusyUsers(prev => {
      const next = new Set(prev);
      if (busy) next.add(user); else next.delete(user);
      return next;
    });
  }, []);

  const generateDaily = useCallback(async (user: string, date: string) => {
    markBusy(user, true);
    try {
      const tz = -new Date().getTimezoneOffset();
      await authFetch('/api/daily-reports/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user, date, tz }),
      });
      await loadDailyOverview();
    } catch { /* surfaced via unchanged status */ }
    finally { markBusy(user, false); }
  }, [loadDailyOverview, markBusy]);

  const deleteDaily = useCallback(async (user: string, date: string) => {
    markBusy(user, true);
    try {
      await authFetch('/api/daily-reports/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user, date }),
      });
      await loadDailyOverview();
    } catch { /* surfaced via unchanged status */ }
    finally { markBusy(user, false); }
  }, [loadDailyOverview, markBusy]);

  // 日报表只在「当日(Today)」scope 展示;进入该 scope 时拉取一次状态总览。
  useEffect(() => {
    if (scope !== 'day') return;
    void loadDailyOverview();
  }, [scope, loadDailyOverview]);

  // ── 周报:状态总览 + 生成/删除(供 Week scope「周报」表) ─────────
  const loadWeeklyOverview = useCallback(async () => {
    try {
      const tz = -new Date().getTimezoneOffset();
      const resp = await authFetch('/api/reports/overview?tz=' + tz);
      if (resp.ok) setWeeklyOverview(await resp.json() as WeeklyReportOverview);
    } catch { /* 保持旧值;失败不阻塞页面 */ }
  }, []);

  const markWeeklyBusy = useCallback((user: string, busy: boolean) => {
    setWeeklyBusyUsers(prev => {
      const next = new Set(prev);
      if (busy) next.add(user); else next.delete(user);
      return next;
    });
  }, []);

  const generateWeekly = useCallback(async (user: string, week: string) => {
    markWeeklyBusy(user, true);
    try {
      const tz = -new Date().getTimezoneOffset();
      await authFetch('/api/reports/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user, week, tz }),
      });
      await loadWeeklyOverview();
    } catch { /* surfaced via unchanged status */ }
    finally { markWeeklyBusy(user, false); }
  }, [loadWeeklyOverview, markWeeklyBusy]);

  const deleteWeekly = useCallback(async (user: string, week: string) => {
    markWeeklyBusy(user, true);
    try {
      await authFetch('/api/reports/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user, week }),
      });
      await loadWeeklyOverview();
    } catch { /* surfaced via unchanged status */ }
    finally { markWeeklyBusy(user, false); }
  }, [loadWeeklyOverview, markWeeklyBusy]);

  // 周报表只在「本周(Week)」scope 展示;进入该 scope 时拉取一次状态总览。
  useEffect(() => {
    if (scope !== 'week') return;
    void loadWeeklyOverview();
  }, [scope, loadWeeklyOverview]);

  const svgPadding = { top: 16, right: 8, bottom: 32, left: 42 };
  const svgW = chartWidth;
  const svgH = 220;
  const plotW = svgW - svgPadding.left - svgPadding.right;
  const plotH = svgH - svgPadding.top - svgPadding.bottom;

  if (loading) {
    return (<div className="feed"><div className="feed-content"><div className="stats-page-loading"><div className="spinner" /><span>{t('stats.loading')}</span></div></div></div>);
  }
  if (error) {
    return (<div className="feed"><div className="feed-content"><div className="stats-page-error"><span>{t('stats.error')}: {error}</span><button className="stats-page-retry-btn" onClick={() => loadAnalytics()}>{t('stats.retry')}</button></div></div></div>);
  }
  // Always show the page with scope buttons so the user can switch views.
  // Show "no data" banner below the scope bar when truly empty.
  // Safety: never crash even if analytics is null (shouldn't happen after loading resolves)
  const a = analytics ?? {} as AnalyticsResponse;
  const isEmpty = (a.totalObservations ?? 0) === 0 && (a.totalSessions ?? 0) === 0;
  const isAllProjects = currentFilter === '';

  // ── History view (scope=history): per-user tabs → week + month tables ──
  if (scope === 'history') {
    const allMonths = analytics!.historyMonths ?? [];
    const allWeeks = analytics!.historyWeeks ?? [];

    const hasActivity = (r: { prompts: number; obs: number; summaries: number; sessions: number }) =>
      !(r.prompts === 0 && r.obs === 0 && r.summaries === 0 && r.sessions === 0);

    // Group rows by user_label, dropping zero-activity periods.
    function groupByUser<T extends { user_label: string; prompts: number; obs: number; summaries: number; sessions: number }>(rows: T[]) {
      const g = new Map<string, T[]>();
      for (const r of rows) {
        if (!hasActivity(r)) continue;
        const arr = g.get(r.user_label);
        if (arr) arr.push(r); else g.set(r.user_label, [r]);
      }
      return g;
    }

    const monthsByUser = groupByUser(allMonths);
    const weeksByUser = groupByUser(allWeeks);

    // Union of users with any activity, sorted by total AI time (desc).
    // Lifted to component scope (historyUsers/historyActiveUser) so the weekly
    // report list fetch stays in lockstep with the selected tab.
    const users = historyUsers;
    const activeUser = historyActiveUser;
    const activeIdx = Math.max(0, users.indexOf(activeUser));
    const activeMonths = (monthsByUser.get(activeUser) ?? []).slice().sort((a, b) => b.month.localeCompare(a.month));
    const activeWeeks = (weeksByUser.get(activeUser) ?? []).slice().sort((a, b) => b.week.localeCompare(a.week));
    const activeColor = USER_COLORS[activeIdx % USER_COLORS.length];
    // Chart points in chronological (oldest → newest) order; bars = AI time.
    const weekTrend = activeWeeks.slice().reverse().map(w => ({ label: w.week.slice(5), value: w.processingMs }));
    const monthTrend = activeMonths.slice().reverse().map(m => ({ label: m.month.slice(2), value: m.processingMs }));

    type HistRow = {
      prompts: number; avgPromptsPerDay: number; processingMs: number;
      obs: number; summaries: number; sessions: number; projects: number; bizDays: number;
    };
    // Shared table renderer for both the week and the month sections.
    function renderTable<T extends HistRow>(title: string, periodHeader: string, rows: T[], periodOf: (r: T) => string) {
      if (rows.length === 0) return null;
      const totalMs = rows.reduce((s, r) => s + r.processingMs, 0);
      return (
        <div className="stats-section">
          <div className="stats-section-title">{title}</div>
          <div className="stats-user-table-wrap">
            <table className="stats-user-table" style={{ fontSize: '12px' }}>
              <thead><tr>
                <th>{periodHeader}</th>
                <th className="stats-num-col">{t('stats.prompts')}</th>
                <th className="stats-num-col">{t('stats.dailyAvgPrompts')}</th>
                <th className="stats-num-col">{t('stats.totalTime')}</th>
                <th className="stats-num-col">{t('stats.dailyAvgTime')}</th>
                <th className="stats-num-col">{t('stats.observations')}</th>
                <th className="stats-num-col">{t('stats.summaries')}</th>
                <th className="stats-num-col">{t('stats.historySessions')}</th>
                <th className="stats-num-col">{t('stats.projects')}</th>
              </tr></thead>
              <tbody>
                {rows.map(r => (
                  <tr key={periodOf(r)}>
                    <td>{periodOf(r)}</td>
                    <td className="stats-num-col">{formatNumber(r.prompts)}</td>
                    <td className="stats-num-col">{formatNumber(r.avgPromptsPerDay)}</td>
                    <td className="stats-num-col">{formatProcessingTime(r.processingMs)}</td>
                    <td className="stats-num-col">{formatDailyAvg(r.processingMs, r.bizDays)}</td>
                    <td className="stats-num-col">{formatNumber(r.obs)}</td>
                    <td className="stats-num-col">{formatNumber(r.summaries)}</td>
                    <td className="stats-num-col">{formatNumber(r.sessions)}</td>
                    <td className="stats-num-col">{formatNumber(r.projects)}</td>
                  </tr>
                ))}
                {/* Per-user total row */}
                <tr style={{ borderTop: '2px solid var(--color-border-primary)' }}>
                  <td style={{ fontWeight: 600 }}>{t('stats.userSummary')}</td>
                  <td className="stats-num-col" style={{ fontWeight: 600 }}>{formatNumber(rows.reduce((s, r) => s + r.prompts, 0))}</td>
                  <td className="stats-num-col">-</td>
                  <td className="stats-num-col" style={{ fontWeight: 600 }}>{formatProcessingTime(totalMs)}</td>
                  <td className="stats-num-col">-</td>
                  <td className="stats-num-col" style={{ fontWeight: 600 }}>{formatNumber(rows.reduce((s, r) => s + r.obs, 0))}</td>
                  <td className="stats-num-col" style={{ fontWeight: 600 }}>{formatNumber(rows.reduce((s, r) => s + r.summaries, 0))}</td>
                  <td className="stats-num-col" style={{ fontWeight: 600 }}>{formatNumber(rows.reduce((s, r) => s + r.sessions, 0))}</td>
                  <td className="stats-num-col" style={{ fontWeight: 600 }}>{formatNumber(Math.max(...rows.map(r => r.projects), 0))}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      );
    }

    return (
    <div className="feed">
      <div className="feed-content">
        <div className="stats-page">

          <div className="stats-scope-bar">
            <span className="stats-tabs">
              {SCOPES.map(s => (
                <button key={s} type="button"
                  className={`stats-tab${scope === s ? ' is-active' : ''}`}
                  onClick={() => changeScope(s)}>
                  {t(`stats.scope_${s}`)}
                </button>
              ))}
            </span>
            <span className="stats-scope-title">
              {t('stats.scope_history')}
              {!isAllProjects && `: ${currentFilter}`}
            </span>
          </div>

          {users.length === 0 && (
            <div className="stats-no-data-banner">{t('stats.noData')}</div>
          )}

          {users.length > 0 && (
            <>
              {/* Per-user tabs — one tab per person, under the scope bar */}
              <div className="stats-section">
                <span className="stats-tabs">
                  {users.map((u, idx) => (
                    <button key={u} type="button"
                      className={`stats-tab${u === activeUser ? ' is-active' : ''}`}
                      onClick={() => setHistoryUser(u)}
                      style={u === activeUser ? undefined : { color: USER_COLORS[idx % USER_COLORS.length] }}>
                      {u}
                    </button>
                  ))}
                </span>
              </div>

              {/* Two bar charts under the name: weekly & monthly AI-time trends */}
              {(weekTrend.length > 0 || monthTrend.length > 0) && (
                <div className="stats-section">
                  <div className="stats-charts-grid">
                    <TrendBars title={t('stats.weekTrend')} color={activeColor} points={weekTrend} formatVal={formatProcessingTime} />
                    <TrendBars title={t('stats.monthTrend')} color={activeColor} points={monthTrend} formatVal={formatProcessingTime} />
                  </div>
                </div>
              )}

              {/* Week History (top) then Monthly History (bottom) for the selected user */}
              {renderTable(t('stats.weekHistory'), t('stats.historyWeek'), activeWeeks, r => r.week)}
              {renderTable(t('stats.historyTitle'), t('stats.historyMonth'), activeMonths, r => r.month)}

              {/* Weekly reports — click to open a full report page in a new tab */}
              <div className="stats-section">
                <div className="stats-section-title">
                  {t('stats.weeklyReports')}
                  <button type="button" className="stats-tab" style={{ marginLeft: 12 }}
                    disabled={reportsBusy}
                    onClick={() => activeUser && void refreshThisWeek(activeUser)}>
                    {reportsBusy ? '…' : t('stats.refreshThisWeek')}
                  </button>
                </div>
                {historyReports.length === 0 ? (
                  <div className="stats-no-data-banner">{t('stats.noReports')}</div>
                ) : (
                  <div className="stats-user-table-wrap">
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {historyReports.map(r => {
                        const tokenQ = (() => { try { return localStorage.getItem('claude-mem-admin-token'); } catch { return null; } })();
                        const urlOf = (path: string) => {
                          const q = new URLSearchParams({ user: activeUser, week: r.week_start });
                          if (tokenQ) q.set('token', tokenQ);
                          return `${path}?${q.toString()}`;
                        };
                        return (
                          <div key={r.week_start} style={{
                            display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px',
                            border: '1px solid var(--color-border-primary)', borderRadius: 6,
                          }}>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontWeight: 600 }}>{r.week_start} ~ {r.week_end}</div>
                              <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
                                {t('stats.reportGenerated')}: {new Date(r.generated_at_epoch).toLocaleString()}
                                {r.stats && ` · ${formatProcessingTime(r.stats.totalMs)} · ${r.stats.projects} ${t('stats.projects')}`}
                              </div>
                            </div>
                            <button type="button" className="stats-tab is-active"
                              onClick={() => window.open(urlOf('/report'), '_blank')}>
                              {t('stats.openReport')}
                            </button>
                            <button type="button" className="stats-tab"
                              onClick={() => window.open(urlOf('/api/reports/download'), '_blank')}>
                              {t('stats.downloadReport')}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </>
          )}

        </div>
      </div>
    </div>
    );
  }

  return (
    <div className="feed">
      <div className="feed-content">
        <div className="stats-page">

          <div className="stats-scope-bar">
            <span className="stats-tabs">
              {SCOPES.map(s => (
                <button key={s} type="button"
                  className={`stats-tab${scope === s ? ' is-active' : ''}`}
                  onClick={() => changeScope(s)}>
                  {t(`stats.scope_${s}`)}
                </button>
              ))}
            </span>
            <span className="stats-scope-title">
              {isAllProjects ? t('stats.allProjects') : `${t('stats.singleProject')}: ${currentFilter}`}
            </span>
          </div>

          {isEmpty && (
            <div className="stats-no-data-banner">{t('stats.noData')}</div>
          )}

          <div className="stats-summary-grid">
            <div className="stats-summary-card"><div className="stats-summary-value">{formatNumber(a.totalObservations || 0)}</div><div className="stats-summary-label">{t('stats.totalObservations')}</div></div>
            <div className="stats-summary-card"><div className="stats-summary-value">{formatNumber(a.totalSessions)}</div><div className="stats-summary-label">{t('stats.totalSessions')}</div></div>
            <div className="stats-summary-card is-highlight"><div className="stats-summary-value">{formatNumber(userSummary.reduce((s, u) => s + u.prompts, 0))}</div><div className="stats-summary-label">{t('stats.totalPrompts')}</div></div>
            <div className="stats-summary-card is-highlight-green"><div className="stats-summary-value">{formatNumber(Math.round(userSummary.reduce((s, u) => s + u.prompts, 0) / Math.max(userSummary.length, 1)))}</div><div className="stats-summary-label">{t('stats.avgPromptsPerUser')}</div></div>
            <div className="stats-summary-card is-highlight"><div className="stats-summary-value">{formatProcessingTime(userSummary.reduce((s, u) => s + u.processingMs, 0))}</div><div className="stats-summary-label">{t('stats.totalProcessingTime')}</div></div>
            <div className="stats-summary-card is-highlight-green"><div className="stats-summary-value">{formatProcessingTime(Math.round(userSummary.reduce((s, u) => s + u.processingMs, 0) / Math.max(userSummary.length, 1)))}</div><div className="stats-summary-label">{t('stats.avgTimePerUser')}</div></div>
            <div className="stats-summary-card"><div className="stats-summary-value">{formatNumber(a.totalDiscoveryTokens)}</div><div className="stats-summary-label">{t('stats.totalTokens')}</div></div>
          </div>

          {/* Daily per-user line charts — works for both All Projects and single project (backend scopes by ?project=) */}
          {userSeries.length > 0 && (
            <div className="stats-section">
              <div className="stats-charts-grid">
                <LineChart title={t('stats.dailyProcessingTime')} series={userTimeSeries}
                  svgW={svgW} svgH={svgH} svgPadding={svgPadding} plotW={plotW} plotH={plotH}
                  lineChartRef={lineChartRef}
                  formatY={v => { if (v < 60000) return `${Math.round(v/1000)}s`; if (v < 3600000) return `${Math.round(v/60000)}m`; return `${(v/3600000).toFixed(1)}h`; }}
                  allDays={a.chartBuckets ?? []}
                  formatDayLabel={formatDayLabel}
                  hiddenUsers={hiddenUsers} onToggleUser={toggleHiddenUser} showLegend={true} />
                <LineChart title={t('stats.dailyPromptsByUser')} series={userSeries}
                  svgW={svgW} svgH={svgH} svgPadding={svgPadding} plotW={plotW} plotH={plotH}
                  formatY={v => String(v)}
                  allDays={a.chartBuckets ?? []}
                  formatDayLabel={formatDayLabel}
                  hiddenUsers={hiddenUsers} onToggleUser={toggleHiddenUser} showLegend={false} />
              </div>
            </div>
          )}


          {userSummary.length > 0 && (
            <div className="stats-section">
              <div className="stats-section-title">{t('stats.userSummary')}</div>
              <div className="stats-user-table-wrap">
                <table className="stats-user-table">
                  <thead><tr>
                    <th>{t('stats.user')}</th>
                    <th className="stats-num-col">{t('stats.projects')}</th>
                    <th className="stats-num-col">{t('stats.prompts')}</th>
                    <th className="stats-num-col">{t('stats.dailyAvgPrompts')}</th>
                    <th className="stats-num-col">{t('stats.observations')}</th>
                    <th className="stats-num-col">{t('stats.summaries')}</th>
                    <th className="stats-num-col">{t('stats.dailyAvgTime')}</th>
                    <th className="stats-num-col">{t('stats.totalTime')}</th>
                  </tr></thead>
                  <tbody>
                    {userSummary.map(row => (
                      <tr key={row.user_label}>
                        <td>{row.user_label}</td>
                        <td className="stats-num-col">{row.projectCount}</td>
                        <td className="stats-num-col">{formatNumber(row.prompts)}</td>
                        <td className="stats-num-col">{formatNumber(Math.round(row.prompts / Math.max(bizDays, 1)))}</td>
                        <td className="stats-num-col">{formatNumber(row.obs)}</td>
                        <td className="stats-num-col">{formatNumber(row.summaries)}</td>
                        <td className="stats-num-col">{formatDailyAvg(row.processingMs, bizDays)}</td>
                        <td className="stats-num-col">{formatProcessingTime(row.processingMs)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 日报 — 仅在「当日(Today)」scope 显示;每个用户一行;操作=生成/重新生成/删除/下载;链接→新页显示最近两天日报 */}
          {scope === 'day' && isAllProjects && userSummary.length > 0 && (
            <div className="stats-section">
              <div className="stats-section-title">{t('stats.dailyReports')}</div>
              <div className="stats-user-table-wrap">
                <table className="stats-user-table">
                  <thead><tr>
                    <th>{t('stats.dailyDate')}</th>
                    <th>{t('stats.user')}</th>
                    <th>{t('stats.dailyActions')}</th>
                    <th>{t('stats.dailyLink')}</th>
                  </tr></thead>
                  <tbody>
                    {userSummary.map(row => {
                      const u = row.user_label;
                      const today = dailyOverview?.today ?? '';
                      const st = dailyOverview?.users?.[u];
                      const hasToday = !!st?.has_today;
                      // View 高亮的前提:该页(最近两天)确有可看的日报。
                      const viewable = !!(st?.has_today || st?.has_yesterday);
                      const busy = dailyBusyUsers.has(u);
                      const tokenQ = (() => { try { return localStorage.getItem('claude-mem-admin-token'); } catch { return null; } })();
                      const tz = -new Date().getTimezoneOffset();
                      const urlOf = (path: string, extra?: Record<string, string>) => {
                        const q = new URLSearchParams({ user: u, tz: String(tz), ...(extra ?? {}) });
                        if (tokenQ) q.set('token', tokenQ);
                        return `${path}?${q.toString()}`;
                      };
                      return (
                        <tr key={u}>
                          <td>{st?.latest_date ?? today}</td>
                          <td>{u}</td>
                          <td>
                            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                              <button type="button" className="stats-tab is-active" disabled={busy}
                                onClick={() => void generateDaily(u, today)}>
                                {hasToday ? t('stats.dailyRegenerate') : t('stats.dailyGenerate')}
                              </button>
                              {hasToday && (
                                <button type="button" className="stats-tab" disabled={busy}
                                  onClick={() => { if (window.confirm(t('stats.dailyConfirmDelete'))) void deleteDaily(u, today); }}>
                                  {t('stats.dailyDelete')}
                                </button>
                              )}
                              {hasToday && (
                                <button type="button" className="stats-tab" disabled={busy}
                                  onClick={() => window.open(urlOf('/api/daily-reports/download', { date: today }), '_blank')}>
                                  {t('stats.downloadReport')}
                                </button>
                              )}
                            </div>
                          </td>
                          <td>
                            <button type="button"
                              className={viewable ? 'stats-tab is-active' : 'stats-tab'}
                              disabled={busy}
                              onClick={() => window.open(urlOf('/daily-report'), '_blank')}>
                              {t('stats.dailyView')}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 周报 — 仅在「本周(Week)」scope 显示;每用户一行(仅当前周);格式同日报表 */}
          {scope === 'week' && isAllProjects && userSummary.length > 0 && (
            <div className="stats-section">
              <div className="stats-section-title">{t('stats.weeklyReports')}</div>
              <div className="stats-user-table-wrap">
                <table className="stats-user-table">
                  <thead><tr>
                    <th>{t('stats.dailyDate')}</th>
                    <th>{t('stats.user')}</th>
                    <th>{t('stats.dailyActions')}</th>
                    <th>{t('stats.dailyLink')}</th>
                  </tr></thead>
                  <tbody>
                    {userSummary.map(row => {
                      const u = row.user_label;
                      const week = weeklyOverview?.week ?? '';
                      const weekEnd = weeklyOverview?.week_end ?? '';
                      const st = weeklyOverview?.users?.[u];
                      const hasCurrent = !!st?.has_current;
                      // View 高亮的前提:该用户有可看的周报(本周或更早一周)。
                      const viewable = !!st;
                      const busy = weeklyBusyUsers.has(u);
                      const tokenQ = (() => { try { return localStorage.getItem('claude-mem-admin-token'); } catch { return null; } })();
                      const urlOf = (path: string) => {
                        const q = new URLSearchParams({ user: u, week });
                        if (tokenQ) q.set('token', tokenQ);
                        return `${path}?${q.toString()}`;
                      };
                      return (
                        <tr key={u}>
                          <td>{week ? `${week} ~ ${weekEnd}` : ''}</td>
                          <td>{u}</td>
                          <td>
                            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                              <button type="button" className="stats-tab is-active" disabled={busy}
                                onClick={() => void generateWeekly(u, week)}>
                                {hasCurrent ? t('stats.dailyRegenerate') : t('stats.dailyGenerate')}
                              </button>
                              {hasCurrent && (
                                <button type="button" className="stats-tab" disabled={busy}
                                  onClick={() => { if (window.confirm(t('stats.weeklyConfirmDelete'))) void deleteWeekly(u, week); }}>
                                  {t('stats.dailyDelete')}
                                </button>
                              )}
                              {hasCurrent && (
                                <button type="button" className="stats-tab" disabled={busy}
                                  onClick={() => window.open(urlOf('/api/reports/download'), '_blank')}>
                                  {t('stats.downloadReport')}
                                </button>
                              )}
                            </div>
                          </td>
                          <td>
                            <button type="button"
                              className={viewable ? 'stats-tab is-active' : 'stats-tab'}
                              disabled={busy}
                              onClick={() => window.open(urlOf('/report'), '_blank')}>
                              {t('stats.dailyView')}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {isAllProjects && (projectPrompts.length > 0 || projectTimes.length > 0) && (
            <div className="stats-section">
              <div className="stats-section-title">
                <button type="button" className={`stats-tab${projectTab === 'time' ? ' is-active' : ''}`}
                  onClick={() => setProjectTab('time')}>{t('stats.timeByProject')}</button>
                <button type="button" className={`stats-tab${projectTab === 'prompts' ? ' is-active' : ''}`}
                  onClick={() => setProjectTab('prompts')}>{t('stats.promptsByProject')}</button>
              </div>
              {projectTab === 'prompts' ? (
                <div className="stats-project-bars">
                  {projectPrompts.map(row => {
                    const pct = Math.round((row.count / maxProjectPrompts) * 100);
                    const editor = analytics!.projectEditor?.[row.project];
                    return (
                      <div key={row.project} className="stats-project-row">
                        {editor && <span className="stats-project-editor">{editor}</span>}
                        <span className="stats-project-label" title={row.project}>{row.project}</span>
                        <div className="stats-project-track"><div className="stats-project-fill" style={{ width: `${Math.max(pct, 1)}%` }} /></div>
                        <span className="stats-project-count">{formatNumber(row.count)}</span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="stats-project-bars">
                  {projectTimes.map(row => {
                    const pct = Math.round((row.totalMs / maxProjectTime) * 100);
                    const editor = analytics!.projectEditor?.[row.project];
                    return (
                      <div key={row.project} className="stats-project-row">
                        {editor && <span className="stats-project-editor">{editor}</span>}
                        <span className="stats-project-label" title={row.project}>{row.project}</span>
                        <div className="stats-project-track"><div className="stats-project-fill" style={{ width: `${Math.max(pct, 1)}%` }} /></div>
                        <span className="stats-project-count">{formatProcessingTime(row.totalMs)}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
