import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { AnalyticsResponse } from '../types';
import { useLocale } from '../hooks/useLocale';
import { authFetch } from '../utils/api';

interface StatsPageProps {
  currentFilter: string;
  userLabelFilter?: string | null;
}

type Scope = 'day' | 'week' | 'month' | 'quarter' | 'history';
const SCOPE_KEY = 'claude-mem.statsScope';
const SCOPES: Scope[] = ['day', 'week', 'month', 'quarter', 'history'];

const USER_COLORS = [
  '#0969da', '#1a7f37', '#cf222e', '#8250df', '#9a6700',
  '#0550ae', '#16c60c', '#e74856', '#8e7cbc', '#d4b888',
];

/** Map a local YYYY-MM-DD day to its chart bucket key given granularity. */
function bucketKeyOf(day: string, granularity: 'day' | 'week'): string {
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

function formatDayLabel(day: string): string {
  const d = new Date(day + 'T00:00:00');
  return `${d.getMonth() + 1}/${d.getDate()}`;
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
  return `${Math.round(avgMin)}m/d`;
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
  const step = Math.max(1, Math.floor(allDays.length / 9));
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
                fill="var(--color-text-muted)" fontSize="8" fontFamily="monospace">
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

  // scope: GLOBAL time range — drives EVERY section on the page. Persisted.
  const [scope, setScope] = useState<Scope>(() => {
    try {
      const s = localStorage.getItem(SCOPE_KEY) as Scope | null;
      if (s === 'day' || s === 'week' || s === 'month' || s === 'quarter') return s;
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
    const gran = analytics.granularity ?? 'day';
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
  if (!analytics || (analytics.totalObservations === 0 && analytics.totalSessions === 0 && scope !== 'history')) {
    return (<div className="feed"><div className="feed-content"><div className="stats-page-loading"><span style={{ color: 'var(--color-text-muted)' }}>{t('stats.noData')}</span></div></div></div>);
  }

  const isAllProjects = currentFilter === '';

  // ── History view (scope=history): monthly table ──────────────────
  if (scope === 'history') {
    const months = analytics!.historyMonths ?? [];
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
              {t('stats.historyTitle')}
              {!isAllProjects && `: ${currentFilter}`}
            </span>
          </div>

          <div className="stats-section">
            <div className="stats-user-table-wrap">
              <table className="stats-user-table" style={{ fontSize: '12px' }}>
                <thead><tr>
                  <th>{t('stats.historyMonth')}</th>
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
                  {months.filter(m => m.sessions > 0 || m.prompts > 0).map(m => (
                    <tr key={m.month}>
                      <td>{m.month}</td>
                      <td className="stats-num-col">{formatNumber(m.prompts)}</td>
                      <td className="stats-num-col">{formatNumber(m.avgPromptsPerDay)}</td>
                      <td className="stats-num-col">{formatProcessingTime(m.processingMs)}</td>
                      <td className="stats-num-col">{formatDailyAvg(m.processingMs, m.bizDays)}</td>
                      <td className="stats-num-col">{formatNumber(m.obs)}</td>
                      <td className="stats-num-col">{formatNumber(m.summaries)}</td>
                      <td className="stats-num-col">{formatNumber(m.sessions)}</td>
                      <td className="stats-num-col">{formatNumber(m.projects)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

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

          <div className="stats-summary-grid">
            <div className="stats-summary-card"><div className="stats-summary-value">{formatNumber(analytics.totalObservations)}</div><div className="stats-summary-label">{t('stats.totalObservations')}</div></div>
            <div className="stats-summary-card"><div className="stats-summary-value">{formatNumber(analytics.totalSessions)}</div><div className="stats-summary-label">{t('stats.totalSessions')}</div></div>
            <div className="stats-summary-card is-highlight"><div className="stats-summary-value">{formatNumber(userSummary.reduce((s, u) => s + u.prompts, 0))}</div><div className="stats-summary-label">{t('stats.totalPrompts')}</div></div>
            <div className="stats-summary-card is-highlight"><div className="stats-summary-value">{formatProcessingTime(userSummary.reduce((s, u) => s + u.processingMs, 0))}</div><div className="stats-summary-label">{t('stats.totalProcessingTime')}</div></div>
            <div className="stats-summary-card"><div className="stats-summary-value">{formatNumber(analytics.totalDiscoveryTokens)}</div><div className="stats-summary-label">{t('stats.totalTokens')}</div></div>
          </div>

          {/* Daily per-user line charts — works for both All Projects and single project (backend scopes by ?project=) */}
          {userSeries.length > 0 && (
            <div className="stats-section">
              <div className="stats-charts-grid">
                <LineChart title={t('stats.dailyProcessingTime')} series={userTimeSeries}
                  svgW={svgW} svgH={svgH} svgPadding={svgPadding} plotW={plotW} plotH={plotH}
                  lineChartRef={lineChartRef}
                  formatY={v => { if (v < 60000) return `${Math.round(v/1000)}s`; if (v < 3600000) return `${Math.round(v/60000)}m`; return `${(v/3600000).toFixed(1)}h`; }}
                  allDays={analytics.chartBuckets ?? []}
                  formatDayLabel={formatDayLabel}
                  hiddenUsers={hiddenUsers} onToggleUser={toggleHiddenUser} showLegend={true} />
                <LineChart title={t('stats.dailyPromptsByUser')} series={userSeries}
                  svgW={svgW} svgH={svgH} svgPadding={svgPadding} plotW={plotW} plotH={plotH}
                  formatY={v => String(v)}
                  allDays={analytics.chartBuckets ?? []}
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

