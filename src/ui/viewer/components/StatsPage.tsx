import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { AnalyticsResponse } from '../types';
import { useLocale } from '../hooks/useLocale';
import { authFetch } from '../utils/api';

interface StatsPageProps {
  currentFilter: string;
  userLabelFilter?: string | null;
}

const USER_COLORS = [
  '#0969da', '#1a7f37', '#cf222e', '#8250df', '#9a6700',
  '#0550ae', '#16c60c', '#e74856', '#8e7cbc', '#d4b888',
];

// Current month (backend default), or explicit days
const DEFAULT_DAYS = 0; // 0 → backend uses month start

/** Count business days (Mon-Fri) between two date strings (inclusive). */
function countBusinessDays(startDay: string, endDay: string): number {
  if (!startDay || !endDay) return 0;
  const s = new Date(startDay + 'T00:00:00');
  const e = new Date(endDay + 'T00:00:00');
  let count = 0;
  const c = new Date(s);
  while (c <= e) {
    const dow = c.getDay();
    if (dow !== 0 && dow !== 6) count++;
    c.setDate(c.getDate() + 1);
  }
  return count;
}

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

function buildDayRange(firstDay: string | undefined, lastDay: string | undefined): string[] {
  if (!firstDay) return [];
  // Extend end to today so the chart always shows up to current date
  const today = new Date().toISOString().slice(0, 10);
  const endDay = lastDay && lastDay < today ? today : (lastDay || today);
  const result: string[] = [];
  const c = new Date(firstDay + 'T00:00:00');
  const e = new Date(endDay + 'T00:00:00');
  while (c <= e) {
    result.push(c.toISOString().slice(0, 10));
    c.setDate(c.getDate() + 1);
  }
  return result;
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

  return (
    <div className="stats-chart">
      <div className="stats-chart-title">{title}</div>
      <div className="stats-line-chart" ref={title.includes('Prompts') ? lineChartRef : undefined}>
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
            const x = svgPadding.left + (totalDays > 1 ? (idx / (totalDays - 1)) * plotW : plotW / 2);
            return (
              <text key={day} x={x} y={svgH - 6} textAnchor="middle"
                fill="var(--color-text-muted)" fontSize="8" fontFamily="monospace">
                {fmtDay(day)}
              </text>
            );
          })}
          {visible.map(s => {
            const pts = s.points;
            const d = pts.map((val, i) => {
              const x = svgPadding.left + (totalDays > 1 ? (i / (totalDays - 1)) * plotW : plotW / 2);
              const y = svgPadding.top + plotH * (1 - val / globalMax);
              return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
            }).join(' ');
            return <path key={s.user_label} d={d} fill="none" stroke={s.color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />;
          })}
        </svg>
        {showLegend && (
          <div className="stats-user-legend">
            {series.map(s => (
              <label key={s.user_label} className="stats-user-legend-item">
                <input type="checkbox" className="stats-legend-checkbox" checked={!hiddenUsers.has(s.user_label)}
                  onChange={() => onToggleUser(s.user_label)} />
                {s.user_label}
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
  const [analytics, setAnalytics] = useState<AnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const lineChartRef = useRef<HTMLDivElement>(null);
  const [chartWidth, setChartWidth] = useState(600);
  const [hiddenUsers, setHiddenUsers] = useState<Set<string>>(new Set());
  const toggleHiddenUser = useCallback((user: string) => {
    setHiddenUsers(prev => { const n = new Set(prev); if (n.has(user)) n.delete(user); else n.add(user); return n; });
  }, []);

  const loadAnalytics = useCallback(async () => {
    setLoading(true);
    setError(null);
    const controller = new AbortController();
    try {
      const params = new URLSearchParams();
      if (DEFAULT_DAYS > 0) params.set('days', String(DEFAULT_DAYS));
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
  }, [currentFilter, userLabelFilter]);

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

  const userSeries = useMemo(() => {
    if (!analytics) return [];
    const users = analytics.uniqueUsers;
    if (users.length === 0) return [];
    const byDay = new Map<string, Record<string, number>>();
    for (const pt of analytics.promptsByUserByDay) {
      let rec = byDay.get(pt.day);
      if (!rec) { rec = {}; byDay.set(pt.day, rec); }
      rec[pt.user_label] = pt.count;
    }
    const days = Array.from(byDay.keys()).sort();
    if (days.length === 0) return [];
    const allDays = buildDayRange(days[0], days[days.length - 1]);
    return users.map((user, idx) => {
      const points = allDays.map(day => (byDay.get(day)?.[user]) ?? 0);
      return { user_label: user, color: USER_COLORS[idx % USER_COLORS.length], points, total: points.reduce((a,b)=>a+b,0), maxVal: Math.max(...points, 1) };
    });
  }, [analytics]);

  const userTimeSeries = useMemo(() => {
    if (!analytics) return [];
    const users = analytics.uniqueUsers;
    if (users.length === 0) return [];
    const byDay = new Map<string, Record<string, number>>();
    for (const pt of (analytics.dailyProcessingTimeByUser ?? [])) {
      let rec = byDay.get(pt.day);
      if (!rec) { rec = {}; byDay.set(pt.day, rec); }
      rec[pt.user_label] = pt.totalMs;
    }
    const days = Array.from(byDay.keys()).sort();
    if (days.length === 0) return [];
    const allDays = buildDayRange(days[0], days[days.length - 1]);
    return users.map((user, idx) => {
      const points = allDays.map(day => (byDay.get(day)?.[user]) ?? 0);
      return { user_label: user, color: USER_COLORS[idx % USER_COLORS.length], points, total: points.reduce((a,b)=>a+b,0), maxVal: Math.max(...points, 1) };
    });
  }, [analytics]);

  const userSummary = useMemo(() => {
    if (!analytics) return [];
    const users = analytics.uniqueUsers;
    if (users.length === 0) return [];
    const ptData = analytics.userProcessingTime ?? {};
    const meta = analytics.userProjectMeta ?? {};
    const map = new Map<string, { prompts: number; obs: number; summaries: number; processingMs: number; sessionCount: number; projectCount: number; activeDays: number }>();
    for (const u of users) {
      const t = ptData[u]; const m = meta[u];
      map.set(u, { prompts: 0, obs: 0, summaries: 0, processingMs: t?.totalMs??0, sessionCount: t?.sessionCount??0, projectCount: m?.projectCount??0, activeDays: m?.activeDays??0 });
    }
    for (const pt of analytics.promptsByUserByDay) { const r = map.get(pt.user_label); if (r) r.prompts += pt.count; }
    for (const pt of analytics.observationsByUserByDay) { const r = map.get(pt.user_label); if (r) r.obs += pt.count; }
    for (const pt of analytics.summariesByUserByDay) { const r = map.get(pt.user_label); if (r) r.summaries += pt.count; }
    return Array.from(map.entries()).map(([user, counts]) => ({ user_label: user, ...counts })).sort((a, b) => b.processingMs - a.processingMs);
  }, [analytics]);

  const projectPrompts = useMemo(() => {
    const rows = analytics?.promptsByProject ?? [];
    return [...rows].sort((a, b) => b.count - a.count);
  }, [analytics]);
  const maxProjectPrompts = projectPrompts.length > 0 ? projectPrompts[0].count : 1;

  // Business days in the data range (excludes weekends for daily avg calcs)
  const bizDays = useMemo(() => {
    const allPts = analytics?.promptsByUserByDay ?? [];
    if (allPts.length === 0) return 1;
    return Math.max(countBusinessDays(allPts[0]?.day, allPts[allPts.length - 1]?.day), 1);
  }, [analytics]);

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
  if (!analytics || (analytics.totalObservations === 0 && analytics.totalSessions === 0)) {
    return (<div className="feed"><div className="feed-content"><div className="stats-page-loading"><span style={{ color: 'var(--color-text-muted)' }}>{t('stats.noData')}</span></div></div></div>);
  }

  const isAllProjects = currentFilter === '';

  return (
    <div className="feed">
      <div className="feed-content">
        <div className="stats-page">

          <div className="stats-project-name">
            {isAllProjects ? t('stats.allProjects') : `${t('stats.singleProject')}: ${currentFilter}`}
          </div>

          <div className="stats-summary-grid">
            <div className="stats-summary-card"><div className="stats-summary-value">{formatNumber(analytics.totalObservations)}</div><div className="stats-summary-label">{t('stats.totalObservations')}</div></div>
            <div className="stats-summary-card"><div className="stats-summary-value">{formatNumber(analytics.totalSessions)}</div><div className="stats-summary-label">{t('stats.totalSessions')}</div></div>
            <div className="stats-summary-card"><div className="stats-summary-value">{formatNumber(userSummary.reduce((s, u) => s + u.prompts, 0))}</div><div className="stats-summary-label">{t('stats.totalPrompts')}</div></div>
            <div className="stats-summary-card"><div className="stats-summary-value">{formatNumber(analytics.totalDiscoveryTokens)}</div><div className="stats-summary-label">{t('stats.totalTokens')}</div></div>
          </div>

          {/* Daily per-user line charts — works for both All Projects and single project (backend scopes by ?project=) */}
          {userSeries.length > 0 && (
            <div className="stats-section">
              <div className="stats-charts-grid">
                <LineChart title={t('stats.dailyPromptsByUser')} series={userSeries}
                  svgW={svgW} svgH={svgH} svgPadding={svgPadding} plotW={plotW} plotH={plotH}
                  lineChartRef={lineChartRef} formatY={v => String(v)}
                  allDays={buildDayRange(analytics!.promptsByUserByDay[0]?.day, analytics!.promptsByUserByDay[analytics!.promptsByUserByDay.length - 1]?.day)}
                  formatDayLabel={formatDayLabel}
                  hiddenUsers={hiddenUsers} onToggleUser={toggleHiddenUser} showLegend={true} />
                <LineChart title={t('stats.dailyProcessingTime')} series={userTimeSeries}
                  svgW={svgW} svgH={svgH} svgPadding={svgPadding} plotW={plotW} plotH={plotH}
                  formatY={v => { if (v < 60000) return `${Math.round(v/1000)}s`; if (v < 3600000) return `${Math.round(v/60000)}m`; return `${(v/3600000).toFixed(1)}h`; }}
                  allDays={userTimeSeries.length > 0 ? buildDayRange(analytics!.dailyProcessingTimeByUser?.[0]?.day, analytics!.dailyProcessingTimeByUser?.[analytics!.dailyProcessingTimeByUser.length - 1]?.day) : []}
                  formatDayLabel={formatDayLabel}
                  hiddenUsers={hiddenUsers} onToggleUser={toggleHiddenUser} showLegend={false} />
              </div>
            </div>
          )}

          {/* 单项目：汇总每日柱状图（不分用户） */}
          {!isAllProjects && (
            <>
              {analytics.observationsByUserByDay.length > 0 && (<div className="stats-section"><div className="stats-section-title">{t('stats.dailyObs')}</div><UserDailyBarChart data={analytics.observationsByUserByDay} aggregate /></div>)}
              {analytics.promptsByUserByDay.length > 0 && (<div className="stats-section"><div className="stats-section-title">{t('stats.dailyPrompts')}</div><UserDailyBarChart data={analytics.promptsByUserByDay} aggregate /></div>)}
              {analytics.summariesByUserByDay.length > 0 && (<div className="stats-section"><div className="stats-section-title">{t('stats.dailySummaries')}</div><UserDailyBarChart data={analytics.summariesByUserByDay} aggregate /></div>)}
            </>
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

          {isAllProjects && projectPrompts.length > 0 && (
            <div className="stats-section">
              <div className="stats-section-title">{t('stats.promptsByProject')}</div>
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
            </div>
          )}

        </div>
      </div>
    </div>
  );
}

/* ── UserDailyBarChart ─────────────────────────────────────────────── */
interface BarChartProps {
  data: Array<{ day: string; user_label: string; count: number }>;
  users?: string[];
  aggregate?: boolean;
}

function UserDailyBarChart({ data, users = [], aggregate = false }: BarChartProps) {
  const byDay = new Map<string, Record<string, number>>();
  for (const pt of data) {
    let rec = byDay.get(pt.day);
    if (!rec) { rec = {}; byDay.set(pt.day, rec); }
    rec[pt.user_label] = pt.count;
  }
  const sortedDays = Array.from(byDay.keys()).sort();
  if (sortedDays.length === 0) return null;
  const displayDays = sortedDays.slice(-30);
  const dayTotal = (day: string) => Object.values(byDay.get(day) ?? {}).reduce((a, b) => a + b, 0);
  const maxCount = aggregate ? Math.max(1, ...displayDays.map(dayTotal)) : Math.max(1, ...displayDays.flatMap(d => Object.values(byDay.get(d) ?? {})));

  return (
    <div className="stats-bar-chart">
      {displayDays.map(day => {
        const rec = byDay.get(day) ?? {};
        const total = dayTotal(day);
        return (
          <div key={day} className="stats-bar-row">
            <span className="stats-bar-day-label">{formatDayLabel(day)}</span>
            <div className="stats-bar-stack">
              {aggregate ? (total > 0 && <div className="stats-bar-segment" style={{ width: `${Math.max(Math.round((total/maxCount)*100), 1)}%` }} title={`${total}`} />)
                : users.map(user => { const count = rec[user]??0; if (count===0) return null; return <div key={user} className="stats-bar-segment" style={{ width: `${Math.max(Math.round((count/maxCount)*100), 1)}%` }} title={`${user}: ${count}`} />; })}
            </div>
            <span className="stats-bar-total">{total}</span>
          </div>
        );
      })}
    </div>
  );
}
