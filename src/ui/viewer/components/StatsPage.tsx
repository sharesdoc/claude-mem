import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { AnalyticsResponse, DailyReportOverview, WeeklyReportOverview, HistoryWeekRow } from '../types';
import { useLocale } from '../hooks/useLocale';
import { authFetch } from '../utils/api';
import { ScopePicker, ScopeMode } from './ScopePicker';

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

/* ── Current-period anchors (defaults for the ScopePickers) ───────────────────
 * Each returns the anchor string for the CURRENT period in the exact per-scope
 * format the backend's ?anchor= expects (see DataRoutes handleGetAnalytics):
 *   day → YYYY-MM-DD   week → YYYY-MM-DD (this week's Monday)
 *   month → YYYY-MM    quarter → YYYY-Q (Q=1..4)
 * Used to seed anchorByScope on mount so every picker button opens showing the
 * present day/week/month/quarter rather than a blank.
 * ──────────────────────────────────────────────────────────────────────────── */
function curDayAnchor(): string { return localDateKey(); }            // today, local
function curWeekAnchor(): string {
  const d = new Date(); d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));                    // step back to this week's Monday
  return localDateKey(d);
}
function curMonthAnchor(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;   // YYYY-MM
}
function curQuarterAnchor(): string {
  const d = new Date();
  return `${d.getFullYear()}-${Math.floor(d.getMonth() / 3) + 1}`;            // YYYY-Q (Q=1..4)
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
  // The active user's full 26-week grid (content/report/complete per week).
  const [historyWeeks, setHistoryWeeks] = useState<HistoryWeekRow[]>([]);
  // Per-week busy set: generating/deleting one week only disables THAT week's
  // buttons, never the other weeks (each task limits its own period only).
  const [historyBusyWeeks, setHistoryBusyWeeks] = useState<Set<string>>(new Set());
  const markHistoryBusy = useCallback((week: string, busy: boolean) => {
    setHistoryBusyWeeks(prev => { const n = new Set(prev); if (busy) n.add(week); else n.delete(week); return n; });
  }, []);

  // ── Batch generation (async job + polling) ───────────────────────
  // One batch at a time; tracks live progress for the inline progress bar.
  // startedAt drives the elapsed-time display so a single slow task (one report
  // can take 1–3 min of multi-step AI) never *looks* frozen.
  const [batchJob, setBatchJob] = useState<
    { section: 'daily' | 'weekly' | 'history'; total: number; generated: number; skipped: number; failed: number; running: boolean; startedAt: number } | null
  >(null);
  // Ticks once per second while a batch runs so the elapsed timer advances even
  // between status polls (and even while a single task is still in flight).
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!batchJob?.running) return;
    const id = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(id);
  }, [batchJob?.running]);
  const BATCH_LS_KEY = 'claude-mem.activeBatch';

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

  // Per-mode selected period (anchor). Defaults to the CURRENT period on each
  // mount (so the buttons open on today/this-week), and the ScopePickers update
  // it as the user picks a past day/week/month/quarter. Not persisted — a fresh
  // load always starts from "now", matching the requested default behavior.
  const [anchorByScope, setAnchorByScope] = useState<Record<ScopeMode, string>>(() => ({
    day: curDayAnchor(), week: curWeekAnchor(), month: curMonthAnchor(), quarter: curQuarterAnchor(),
  }));
  const setAnchor = useCallback((m: ScopeMode, v: string) => {
    setAnchorByScope(prev => ({ ...prev, [m]: v }));
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
      // Dated scopes carry the selected period so the backend computes
      // [since, until) for that exact day/week/month/quarter.
      if (scope === 'day' || scope === 'week' || scope === 'month' || scope === 'quarter') {
        params.set('anchor', anchorByScope[scope]);
      }
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
  }, [currentFilter, userLabelFilter, scope, anchorByScope]);

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

  // History view: load the active user's full 26-week grid (content/report/
  // complete per week) — replaces the old "existing reports only" list so empty
  // weeks can render greyed/disabled.
  const loadHistoryWeeks = useCallback(async (user: string | undefined) => {
    if (!user) { setHistoryWeeks([]); return; }
    try {
      const tz = -new Date().getTimezoneOffset();
      const resp = await authFetch(`/api/reports/history-weeks?user=${encodeURIComponent(user)}&tz=${tz}`);
      if (resp.ok) { const d = await resp.json() as { weeks: HistoryWeekRow[] }; setHistoryWeeks(d.weeks ?? []); }
      else setHistoryWeeks([]);
    } catch { setHistoryWeeks([]); }
  }, []);

  useEffect(() => {
    if (scope !== 'history') return;
    void loadHistoryWeeks(historyActiveUser);
  }, [scope, historyActiveUser, loadHistoryWeeks]);

  // Generate/refresh one specific week for the active user (per-row button), then
  // refresh the grid. Respects the skip-if-complete rule unless `force`.
  const generateHistoryWeek = useCallback(async (user: string, week: string, force = false) => {
    markHistoryBusy(week, true);
    try {
      const tz = -new Date().getTimezoneOffset();
      await authFetch('/api/reports/generate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user, week, tz, force }),
      });
      await loadHistoryWeeks(user);
    } catch { /* surfaced via unchanged grid */ }
    finally { markHistoryBusy(week, false); }
  }, [loadHistoryWeeks, markHistoryBusy]);

  const deleteHistoryWeek = useCallback(async (user: string, week: string) => {
    markHistoryBusy(week, true);
    try {
      await authFetch('/api/reports/delete', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user, week }),
      });
      await loadHistoryWeeks(user);
    } catch { /* surfaced via unchanged grid */ }
    finally { markHistoryBusy(week, false); }
  }, [loadHistoryWeeks, markHistoryBusy]);

  // ── Async batch generation driver (shared by all 3 batch buttons) ──
  // POST to start → get {jobId,total} → poll GET .../:jobId every ~1s, updating
  // the inline progress bar, until done (or 404 if the worker restarted). Then
  // refresh the relevant data source. One batch at a time (button disabled while
  // batchJob.running). tz is injected here so callers pass only date/week/user.
  // Poll an already-started job to completion, updating the progress bar. Shared
  // by startBatch (fresh) and the resume-on-mount effect (after a page refresh).
  const pollBatch = useCallback((
    section: 'daily' | 'weekly' | 'history',
    postUrl: string, jobId: string, startedAt: number,
    reload: () => Promise<void>,
  ) => {
    try { localStorage.setItem(BATCH_LS_KEY, JSON.stringify({ section, postUrl, jobId, startedAt })); } catch { /* ignore */ }
    setBatchJob(j => ({ section, total: j?.total ?? 1, generated: 0, skipped: 0, failed: 0, running: true, startedAt }));
    const finish = async () => {
      try { localStorage.removeItem(BATCH_LS_KEY); } catch { /* ignore */ }
      setBatchJob(j => j ? { ...j, running: false } : j);
      await reload();
      setTimeout(() => setBatchJob(null), 2500);
    };
    const poll = async () => {
      try {
        const r = await authFetch(`${postUrl}/${jobId}`);
        if (r.status === 404) { await finish(); return; } // job expired / worker restarted
        const job = await r.json() as { total: number; generated: number; skipped: number; failed: number; done: boolean };
        setBatchJob(j => j ? { ...j, total: job.total, generated: job.generated, skipped: job.skipped, failed: job.failed } : j);
        if (job.done) { await finish(); } else { setTimeout(poll, 1000); }
      } catch { await finish(); }
    };
    setTimeout(poll, 700);
  }, []);

  const startBatch = useCallback(async (
    section: 'daily' | 'weekly' | 'history',
    postUrl: string,
    body: Record<string, unknown>,
    reload: () => Promise<void>,
  ) => {
    const startedAt = Date.now();
    setBatchJob({ section, total: 0, generated: 0, skipped: 0, failed: 0, running: true, startedAt });
    try {
      const tz = -new Date().getTimezoneOffset();
      const resp = await authFetch(postUrl, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...body, tz }),
      });
      const { jobId, total } = await resp.json() as { jobId: string; total: number };
      setBatchJob(j => j ? { ...j, total } : j);
      if (!total) {
        // Nothing to do (all complete / no content) — show "done" briefly.
        setBatchJob(j => j ? { ...j, running: false } : j);
        await reload();
        setTimeout(() => setBatchJob(null), 2000);
        return;
      }
      pollBatch(section, postUrl, jobId, startedAt, reload);
    } catch { setBatchJob(j => j ? { ...j, running: false } : j); }
  }, [pollBatch]);

  // ── 日报:状态总览 + 生成/删除(供 All-Projects 页「日报」表) ──────
  const loadDailyOverview = useCallback(async () => {
    try {
      const tz = -new Date().getTimezoneOffset();
      // date=<selected day> so the daily-report table follows the chosen period.
      const resp = await authFetch(`/api/daily-reports/overview?tz=${tz}&date=${anchorByScope.day}`);
      if (resp.ok) setDailyOverview(await resp.json() as DailyReportOverview);
    } catch { /* 保持旧值;失败不阻塞页面 */ }
  }, [anchorByScope.day]);

  // 标记/解除某「用户+日期」的忙碌态(key=`user|date`,用函数式更新避免并发覆盖)。
  // 必须带日期:否则生成 06-03 时切到 06-04,同一用户行会被误判为忙碌。
  const markBusy = useCallback((key: string, busy: boolean) => {
    setDailyBusyUsers(prev => {
      const next = new Set(prev);
      if (busy) next.add(key); else next.delete(key);
      return next;
    });
  }, []);

  const generateDaily = useCallback(async (user: string, date: string) => {
    const key = `${user}|${date}`;
    markBusy(key, true);
    try {
      const tz = -new Date().getTimezoneOffset();
      await authFetch('/api/daily-reports/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user, date, tz }),
      });
      await loadDailyOverview();
    } catch { /* surfaced via unchanged status */ }
    finally { markBusy(key, false); }
  }, [loadDailyOverview, markBusy]);

  const deleteDaily = useCallback(async (user: string, date: string) => {
    const key = `${user}|${date}`;
    markBusy(key, true);
    try {
      await authFetch('/api/daily-reports/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user, date }),
      });
      await loadDailyOverview();
    } catch { /* surfaced via unchanged status */ }
    finally { markBusy(key, false); }
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
      // week=<selected Monday> so the weekly-report table follows the chosen week.
      const resp = await authFetch(`/api/reports/overview?tz=${tz}&week=${anchorByScope.week}`);
      if (resp.ok) setWeeklyOverview(await resp.json() as WeeklyReportOverview);
    } catch { /* 保持旧值;失败不阻塞页面 */ }
  }, [anchorByScope.week]);

  // key=`user|week`(带周一日期):生成某周时切到另一周,同一用户行不被误禁。
  const markWeeklyBusy = useCallback((key: string, busy: boolean) => {
    setWeeklyBusyUsers(prev => {
      const next = new Set(prev);
      if (busy) next.add(key); else next.delete(key);
      return next;
    });
  }, []);

  const generateWeekly = useCallback(async (user: string, week: string) => {
    const key = `${user}|${week}`;
    markWeeklyBusy(key, true);
    try {
      const tz = -new Date().getTimezoneOffset();
      await authFetch('/api/reports/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user, week, tz }),
      });
      await loadWeeklyOverview();
    } catch { /* surfaced via unchanged status */ }
    finally { markWeeklyBusy(key, false); }
  }, [loadWeeklyOverview, markWeeklyBusy]);

  const deleteWeekly = useCallback(async (user: string, week: string) => {
    const key = `${user}|${week}`;
    markWeeklyBusy(key, true);
    try {
      await authFetch('/api/reports/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user, week }),
      });
      await loadWeeklyOverview();
    } catch { /* surfaced via unchanged status */ }
    finally { markWeeklyBusy(key, false); }
  }, [loadWeeklyOverview, markWeeklyBusy]);

  // 周报表只在「本周(Week)」scope 展示;进入该 scope 时拉取一次状态总览。
  useEffect(() => {
    if (scope !== 'week') return;
    void loadWeeklyOverview();
  }, [scope, loadWeeklyOverview]);

  // Resume a batch that was still running when the page was refreshed: re-attach
  // the progress bar to the persisted jobId instead of silently abandoning it.
  // Runs once on mount; the backend job keeps going across reloads.
  useEffect(() => {
    let saved: { section: 'daily' | 'weekly' | 'history'; postUrl: string; jobId: string; startedAt: number } | null = null;
    try { const raw = localStorage.getItem(BATCH_LS_KEY); if (raw) saved = JSON.parse(raw); } catch { saved = null; }
    if (!saved) return;
    const reload = saved.section === 'daily' ? () => loadDailyOverview()
      : saved.section === 'weekly' ? () => loadWeeklyOverview()
      : () => loadHistoryWeeks(historyActiveUser);
    pollBatch(saved.section, saved.postUrl, saved.jobId, saved.startedAt, reload);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const svgPadding = { top: 16, right: 8, bottom: 32, left: 42 };
  const svgW = chartWidth;
  const svgH = 220;
  const plotW = svgW - svgPadding.left - svgPadding.right;
  const plotH = svgH - svgPadding.top - svgPadding.bottom;

  // Inline batch-progress indicator for a section's title bar. Shows
  // "12/26 (✓8 skip3 ✗1) · 0:45" + a progress bar. A single report can take
  // 1–3 min of multi-step AI, so while a task is in flight the bar is
  // INDETERMINATE (animated) and an elapsed timer ticks — it must never look
  // frozen even when stuck at 0/1 for a while.
  const batchBar = (section: 'daily' | 'weekly' | 'history') => {
    if (!batchJob || batchJob.section !== section) return null;
    const finished = batchJob.generated + batchJob.skipped + batchJob.failed;
    const pct = batchJob.total > 0 ? Math.round((finished / batchJob.total) * 100) : 100;
    // Indeterminate while running AND no task has finished yet (e.g. single slow
    // task at 0/1) — a determinate 0% bar reads as "stuck".
    const indeterminate = batchJob.running && finished === 0 && batchJob.total > 0;
    const elapsedS = Math.max(0, Math.floor((Date.now() - batchJob.startedAt) / 1000));
    const mm = Math.floor(elapsedS / 60), ss = elapsedS % 60;
    const elapsed = `${mm}:${String(ss).padStart(2, '0')}`;
    return (
      <span style={{ marginLeft: 12, display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 12, fontWeight: 400, color: 'var(--color-text-muted)' }}>
        <span>{batchJob.running ? t('stats.batchRunning') : t('stats.batchDone')} {finished}/{batchJob.total}
          {' '}(✓{batchJob.generated} {t('stats.batchSkipped')}{batchJob.skipped}{batchJob.failed ? ` ✗${batchJob.failed}` : ''})
          {batchJob.running && <span style={{ marginLeft: 6, fontVariantNumeric: 'tabular-nums' }}>· {elapsed}</span>}</span>
        <span style={{ width: 80, height: 4, background: 'var(--color-border-primary)', borderRadius: 2, overflow: 'hidden' }}>
          {indeterminate
            ? <span className="batch-bar-indeterminate" style={{ display: 'block', height: '100%', width: '40%', background: 'var(--color-accent-primary)', borderRadius: 2 }} />
            : <span style={{ display: 'block', height: '100%', width: `${pct}%`, background: 'var(--color-accent-primary)', transition: 'width 0.3s' }} />}
        </span>
      </span>
    );
  };

  // Scope bar: 24h/history stay plain tabs; the four dated scopes become
  // ScopePickers whose label is the selected period. Shared by both the
  // history view and the main view so they never drift.
  const renderScopeTabs = () => (
    <span className="stats-tabs">
      {SCOPES.map(s => (
        (s === 'day' || s === 'week' || s === 'month' || s === 'quarter') ? (
          // onActivate: clicking the button makes this the page scope.
          // onChange: picking a value stores the new anchor AND ensures this
          // scope is active; both setAnchor and changeScope feed the
          // loadAnalytics effect deps so the page refetches for the new period.
          <ScopePicker key={s} mode={s as ScopeMode} value={anchorByScope[s as ScopeMode]}
            active={scope === s}
            onActivate={() => changeScope(s)}
            onChange={(a) => { setAnchor(s as ScopeMode, a); changeScope(s); }} />
        ) : (
          <button key={s} type="button"
            className={`stats-tab${scope === s ? ' is-active' : ''}`}
            onClick={() => changeScope(s)}>
            {t(`stats.scope_${s}`)}
          </button>
        )
      ))}
    </span>
  );

  // Only take over the whole page on the FIRST load (no data yet). On later
  // reloads (scope/anchor change) keep the last page rendered so the scope bar
  // — and any open ScopePicker popover — survive instead of unmounting; the
  // numbers just refresh in place when the new payload arrives.
  if (loading && !analytics) {
    return (<div className="feed"><div className="feed-content"><div className="stats-page-loading"><div className="spinner" /><span>{t('stats.loading')}</span></div></div></div>);
  }
  if (error && !analytics) {
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
            {renderScopeTabs()}
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

              {/* Weekly reports — the active user's full 26-week grid. Weeks with
                  no content are greyed/disabled; complete weeks are locked (no
                  regenerate, delete to unlock). "刷新全部历史周" batch-fills the rest. */}
              <div className="stats-section">
                <div className="stats-section-title">
                  {t('stats.weeklyReports')}
                  <button type="button" className="stats-tab" style={{ marginLeft: 12 }}
                    disabled={batchJob?.running || !activeUser}
                    onClick={() => activeUser && void startBatch('history', '/api/reports/batch',
                      { mode: 'history', user: activeUser }, () => loadHistoryWeeks(activeUser))}>
                    {t('stats.batchRefreshAllWeeks')}
                  </button>
                  {batchBar('history')}
                </div>
                {historyWeeks.length === 0 ? (
                  <div className="stats-no-data-banner">{t('stats.noReports')}</div>
                ) : (
                  <div className="stats-user-table-wrap">
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {historyWeeks.map(w => {
                        const tokenQ = (() => { try { return localStorage.getItem('claude-mem-admin-token'); } catch { return null; } })();
                        const urlOf = (path: string) => {
                          const q = new URLSearchParams({ user: activeUser, week: w.week_start });
                          if (tokenQ) q.set('token', tokenQ);
                          return `${path}?${q.toString()}`;
                        };
                        const muted = !w.hasContent;
                        return (
                          <div key={w.week_start} style={{
                            display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px',
                            border: '1px solid var(--color-border-primary)', borderRadius: 6,
                            opacity: muted ? 0.55 : 1,
                          }}>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontWeight: 600, color: muted ? 'var(--color-text-muted)' : 'var(--color-text-primary)' }}>
                                {w.week_start} ~ {w.week_end}
                                {w.complete && <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--color-text-muted)' }}>· {t('stats.reportComplete')}</span>}
                              </div>
                              <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
                                {!w.hasContent ? t('stats.noContent')
                                  : w.has_report ? `${t('stats.reportGenerated')}: ${new Date(w.generated_at_epoch!).toLocaleString()}${w.stats ? ` · ${formatProcessingTime(w.stats.totalMs)} · ${w.stats.projects} ${t('stats.projects')}` : ''}`
                                  : t('stats.notGenerated')}
                              </div>
                            </div>
                            {/* 生成/重新生成 — hidden when no content or already complete (locked). */}
                            {w.hasContent && !w.complete && (
                              <button type="button" className="stats-tab is-active" disabled={historyBusyWeeks.has(w.week_start)}
                                onClick={() => void generateHistoryWeek(activeUser, w.week_start)}>
                                {w.has_report ? t('stats.dailyRegenerate') : t('stats.dailyGenerate')}
                              </button>
                            )}
                            {w.has_report && (
                              <button type="button" className="stats-tab is-active"
                                onClick={() => window.open(urlOf('/report'), '_blank')}>
                                {t('stats.openReport')}
                              </button>
                            )}
                            {w.has_report && (
                              <button type="button" className="stats-tab"
                                onClick={() => window.open(urlOf('/api/reports/download'), '_blank')}>
                                {t('stats.downloadReport')}
                              </button>
                            )}
                            {w.has_report && (
                              <button type="button" className="stats-tab" disabled={historyBusyWeeks.has(w.week_start)}
                                onClick={() => { if (window.confirm(t('stats.weeklyConfirmDelete'))) void deleteHistoryWeek(activeUser, w.week_start); }}>
                                {t('stats.dailyDelete')}
                              </button>
                            )}
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
            {renderScopeTabs()}
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
          {scope === 'day' && isAllProjects && dailyOverview && Object.keys(dailyOverview.users).length > 0 && (
            <div className="stats-section">
              <div className="stats-section-title">
                {t('stats.dailyReports')}
                <button type="button" className="stats-tab" style={{ marginLeft: 12 }}
                  disabled={batchJob?.running}
                  onClick={() => void startBatch('daily', '/api/daily-reports/batch',
                    { date: dailyOverview.today }, () => loadDailyOverview())}>
                  {t('stats.batchGenerate')}
                </button>
                {batchBar('daily')}
              </div>
              <div className="stats-user-table-wrap">
                <table className="stats-user-table">
                  <thead><tr>
                    <th>{t('stats.dailyDate')}</th>
                    <th>{t('stats.user')}</th>
                    <th>{t('stats.dailyActions')}</th>
                    <th>{t('stats.dailyLink')}</th>
                  </tr></thead>
                  <tbody>
                    {/* All users (active first), so users with no content for the
                        selected day still show — greyed + disabled. */}
                    {Object.keys(dailyOverview.users)
                      .sort((a, b) => Number(!!dailyOverview.users[b].hasContent) - Number(!!dailyOverview.users[a].hasContent) || a.localeCompare(b))
                      .map(u => {
                      const today = dailyOverview.today ?? '';
                      const st = dailyOverview.users[u];
                      const hasToday = !!st?.has_today;
                      const hasContent = !!st?.hasContent;
                      const complete = !!st?.complete;
                      const viewable = !!(st?.has_today || st?.has_yesterday);
                      // Only this user's own generate FOR THIS DATE disables this
                      // row — switching the date (or another user) stays enabled.
                      const busy = dailyBusyUsers.has(`${u}|${today}`);
                      const tokenQ = (() => { try { return localStorage.getItem('claude-mem-admin-token'); } catch { return null; } })();
                      const tz = -new Date().getTimezoneOffset();
                      const urlOf = (path: string, extra?: Record<string, string>) => {
                        const q = new URLSearchParams({ user: u, tz: String(tz), ...(extra ?? {}) });
                        if (tokenQ) q.set('token', tokenQ);
                        return `${path}?${q.toString()}`;
                      };
                      return (
                        <tr key={u} style={{ opacity: hasContent ? 1 : 0.5 }}>
                          {/* Selected day (what actions operate on); greyed when no content. */}
                          <td style={{ color: hasContent ? undefined : 'var(--color-text-muted)' }}>{today}</td>
                          <td style={{ color: hasContent ? undefined : 'var(--color-text-muted)' }}>{u}</td>
                          <td>
                            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                              {/* No content → no generate; complete → locked badge; else generate/regenerate. */}
                              {!hasContent ? (
                                <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{t('stats.noContent')}</span>
                              ) : complete ? (
                                <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{t('stats.reportComplete')}</span>
                              ) : (
                                <button type="button" className="stats-tab is-active" disabled={busy}
                                  onClick={() => void generateDaily(u, today)}>
                                  {hasToday ? t('stats.dailyRegenerate') : t('stats.dailyGenerate')}
                                </button>
                              )}
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
                              disabled={busy || !viewable}
                              onClick={() => window.open(urlOf('/daily-report', { date: today }), '_blank')}>
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

          {/* 周报 — 仅在「本周(Week)」scope 显示;枚举全部用户(无内容置灰),格式同日报表 */}
          {scope === 'week' && isAllProjects && weeklyOverview && Object.keys(weeklyOverview.users).length > 0 && (
            <div className="stats-section">
              <div className="stats-section-title">
                {t('stats.weeklyReports')}
                <button type="button" className="stats-tab" style={{ marginLeft: 12 }}
                  disabled={batchJob?.running}
                  onClick={() => void startBatch('weekly', '/api/reports/batch',
                    { mode: 'week', week: weeklyOverview.week }, () => loadWeeklyOverview())}>
                  {t('stats.batchGenerate')}
                </button>
                {batchBar('weekly')}
              </div>
              <div className="stats-user-table-wrap">
                <table className="stats-user-table">
                  <thead><tr>
                    <th>{t('stats.dailyDate')}</th>
                    <th>{t('stats.user')}</th>
                    <th>{t('stats.dailyActions')}</th>
                    <th>{t('stats.dailyLink')}</th>
                  </tr></thead>
                  <tbody>
                    {Object.keys(weeklyOverview.users)
                      .sort((a, b) => Number(!!weeklyOverview.users[b].hasContent) - Number(!!weeklyOverview.users[a].hasContent) || a.localeCompare(b))
                      .map(u => {
                      const week = weeklyOverview.week ?? '';
                      const weekEnd = weeklyOverview.week_end ?? '';
                      const st = weeklyOverview.users[u];
                      const hasCurrent = !!st?.has_current;
                      const hasContent = !!st?.hasContent;
                      const complete = !!st?.complete;
                      const viewable = !!st && (hasCurrent || !!st.latest_week);
                      // Only this user's own generate FOR THIS WEEK disables this
                      // row — switching the week (or another user) stays enabled.
                      const busy = weeklyBusyUsers.has(`${u}|${week}`);
                      const tokenQ = (() => { try { return localStorage.getItem('claude-mem-admin-token'); } catch { return null; } })();
                      const urlOf = (path: string) => {
                        const q = new URLSearchParams({ user: u, week });
                        if (tokenQ) q.set('token', tokenQ);
                        return `${path}?${q.toString()}`;
                      };
                      return (
                        <tr key={u} style={{ opacity: hasContent ? 1 : 0.5 }}>
                          <td style={{ color: hasContent ? undefined : 'var(--color-text-muted)' }}>{week ? `${week} ~ ${weekEnd}` : ''}</td>
                          <td style={{ color: hasContent ? undefined : 'var(--color-text-muted)' }}>{u}</td>
                          <td>
                            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                              {!hasContent ? (
                                <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{t('stats.noContent')}</span>
                              ) : complete ? (
                                <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{t('stats.reportComplete')}</span>
                              ) : (
                                <button type="button" className="stats-tab is-active" disabled={busy}
                                  onClick={() => void generateWeekly(u, week)}>
                                  {hasCurrent ? t('stats.dailyRegenerate') : t('stats.dailyGenerate')}
                                </button>
                              )}
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
                              disabled={busy || !viewable}
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
