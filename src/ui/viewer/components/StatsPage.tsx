import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { AnalyticsResponse } from '../types';
import { useLocale } from '../hooks/useLocale';
import { authFetch } from '../utils/api';

interface StatsPageProps {
  currentFilter: string;
}

// Color palette for user lines/bars — cycles if more users than colors.
const USER_COLORS = [
  '#0969da', '#1a7f37', '#cf222e', '#8250df', '#9a6700',
  '#0550ae', '#16c60c', '#e74856', '#8e7cbc', '#d4b888',
];

const DEFAULT_DAYS = 90;

function formatNumber(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'k';
  return String(n);
}

function dayBucketToDate(bucket: string): Date {
  return new Date(bucket + 'T00:00:00');
}

function formatDayLabel(day: string): string {
  const d = dayBucketToDate(day);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

export function StatsPage({ currentFilter }: StatsPageProps) {
  const { t } = useLocale();
  const [analytics, setAnalytics] = useState<AnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const lineChartRef = useRef<HTMLDivElement>(null);
  const [chartWidth, setChartWidth] = useState(600);

  const loadAnalytics = useCallback(async () => {
    setLoading(true);
    setError(null);
    const controller = new AbortController();
    try {
      const params = new URLSearchParams({ days: String(DEFAULT_DAYS) });
      if (currentFilter) params.set('project', currentFilter);
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
  }, [currentFilter]);

  useEffect(() => {
    const ctrl = loadAnalytics();
    return () => { ctrl.then(fn => fn?.()); };
  }, [loadAnalytics]);

  // Track chart container width for responsive SVG
  useEffect(() => {
    const el = lineChartRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      for (const e of entries) setChartWidth(e.contentRect.width);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // ── Build per-user daily series for the line chart ──────────────────
  const userSeries = useMemo(() => {
    if (!analytics) return [];
    const users = analytics.uniqueUsers;
    if (users.length === 0) return [];

    // Map day → { user_label → count }
    const byDay = new Map<string, Record<string, number>>();
    for (const pt of analytics.promptsByUserByDay) {
      let rec = byDay.get(pt.day);
      if (!rec) { rec = {}; byDay.set(pt.day, rec); }
      rec[pt.user_label] = pt.count;
    }

    const days = Array.from(byDay.keys()).sort();
    if (days.length === 0) return [];

    const minDay = days[0];
    const maxDay = days[days.length - 1];

    // Fill all days in range (even those with zero data) for a continuous axis
    const allDays: string[] = [];
    const cursor = new Date(minDay + 'T00:00:00');
    const end = new Date(maxDay + 'T00:00:00');
    while (cursor <= end) {
      const y = cursor.getFullYear();
      const m = String(cursor.getMonth() + 1).padStart(2, '0');
      const d = String(cursor.getDate()).padStart(2, '0');
      allDays.push(`${y}-${m}-${d}`);
      cursor.setDate(cursor.getDate() + 1);
    }

    return users.map((user, idx) => {
      const points = allDays.map(day => (byDay.get(day)?.[user]) ?? 0);
      const total = points.reduce((a, b) => a + b, 0);
      return {
        user_label: user,
        color: USER_COLORS[idx % USER_COLORS.length],
        points,
        total,
        maxVal: Math.max(...points, 1),
      };
    });
  }, [analytics]);

  // ── User summary table data ─────────────────────────────────────────
  const userSummary = useMemo(() => {
    if (!analytics) return [];
    const users = analytics.uniqueUsers;
    if (users.length === 0) return [];
    const map = new Map<string, { prompts: number; obs: number; summaries: number }>();
    for (const u of users) map.set(u, { prompts: 0, obs: 0, summaries: 0 });
    for (const pt of analytics.promptsByUserByDay) {
      const r = map.get(pt.user_label);
      if (r) r.prompts += pt.count;
    }
    for (const pt of analytics.observationsByUserByDay) {
      const r = map.get(pt.user_label);
      if (r) r.obs += pt.count;
    }
    for (const pt of analytics.summariesByUserByDay) {
      const r = map.get(pt.user_label);
      if (r) r.summaries += pt.count;
    }
    return Array.from(map.entries())
      .map(([user, counts]) => ({ user_label: user, ...counts }))
      .sort((a, b) => b.prompts - a.prompts);
  }, [analytics]);

  // ── SVG line chart dimensions ───────────────────────────────────────
  const svgPadding = { top: 16, right: 16, bottom: 40, left: 48 };
  const svgW = chartWidth;
  const svgH = 280;
  const plotW = svgW - svgPadding.left - svgPadding.right;
  const plotH = svgH - svgPadding.top - svgPadding.bottom;

  // ── Load state ──────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="feed">
        <div className="feed-content">
          <div className="stats-page-loading">
            <div className="spinner" />
            <span>{t('stats.loading')}</span>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="feed">
        <div className="feed-content">
          <div className="stats-page-error">
            <span>{t('stats.error')}: {error}</span>
            <button className="stats-page-retry-btn" onClick={() => loadAnalytics()}>{t('stats.retry')}</button>
          </div>
        </div>
      </div>
    );
  }

  if (!analytics || (analytics.totalObservations === 0 && analytics.totalSessions === 0)) {
    return (
      <div className="feed">
        <div className="feed-content">
          <div className="stats-page-loading">
            <span style={{ color: 'var(--color-text-muted)' }}>{t('stats.noData')}</span>
          </div>
        </div>
      </div>
    );
  }

  const isAllProjects = currentFilter === '';

  return (
    <div className="feed">
      <div className="feed-content">
        <div className="stats-page">

          {/* ── Summary cards ──────────────────────────────────────── */}
          <div className="stats-summary-grid">
            <div className="stats-summary-card">
              <div className="stats-summary-value">{formatNumber(analytics.totalObservations)}</div>
              <div className="stats-summary-label">{t('stats.totalObservations')}</div>
            </div>
            <div className="stats-summary-card">
              <div className="stats-summary-value">{formatNumber(analytics.totalSessions)}</div>
              <div className="stats-summary-label">{t('stats.totalSessions')}</div>
            </div>
            <div className="stats-summary-card">
              <div className="stats-summary-value">{formatNumber(
                userSummary.reduce((s, u) => s + u.prompts, 0)
              )}</div>
              <div className="stats-summary-label">{t('stats.totalPrompts')}</div>
            </div>
            <div className="stats-summary-card">
              <div className="stats-summary-value">{formatNumber(analytics.totalDiscoveryTokens)}</div>
              <div className="stats-summary-label">{t('stats.totalTokens')}</div>
            </div>
          </div>

          {/* ── All Projects: per-user daily line chart ────────────── */}
          {isAllProjects && userSeries.length > 0 && (
            <div className="stats-section">
              <div className="stats-section-title">{t('stats.dailyPromptsByUser')}</div>
              <div className="stats-line-chart" ref={lineChartRef}>
                <svg width={svgW} height={svgH} viewBox={`0 0 ${svgW} ${svgH}`}>
                  {/* Y-axis grid lines */}
                  {[0, 0.25, 0.5, 0.75, 1].map(fr => {
                    const y = svgPadding.top + plotH * (1 - fr);
                    return (
                      <g key={`grid-${fr}`}>
                        <line x1={svgPadding.left} y1={y} x2={svgW - svgPadding.right} y2={y}
                          stroke="var(--color-border-primary)" strokeWidth="0.5" />
                        <text x={svgPadding.left - 8} y={y + 4}
                          textAnchor="end" fill="var(--color-text-muted)" fontSize="10"
                          fontFamily="monospace">
                          {Math.round(userSeries.reduce((m, s) => Math.max(m, s.maxVal), 0) * fr)}
                        </text>
                      </g>
                    );
                  })}

                  {/* X-axis labels (show ~6 evenly spaced labels) */}
                  {userSeries[0] && (() => {
                    const totalDays = userSeries[0].points.length;
                    const step = Math.max(1, Math.floor(totalDays / 6));
                    // Build the full day range for the axis
                    const allDays: string[] = [];
                    const firstDay = analytics!.promptsByUserByDay[0]?.day;
                    const lastDay = analytics!.promptsByUserByDay[analytics!.promptsByUserByDay.length - 1]?.day;
                    if (firstDay && lastDay) {
                      const c = new Date(firstDay + 'T00:00:00');
                      const e = new Date(lastDay + 'T00:00:00');
                      while (c <= e) {
                        allDays.push(c.toISOString().slice(0, 10));
                        c.setDate(c.getDate() + 1);
                      }
                    }
                    return allDays.filter((_d, idx) => idx % step === 0).map((day) => {
                      const idx = allDays.indexOf(day);
                      const x = svgPadding.left + (idx / Math.max(totalDays - 1, 1)) * plotW;
                      return (
                        <text key={day} x={x} y={svgH - 10}
                          textAnchor="middle" fill="var(--color-text-muted)" fontSize="9"
                          fontFamily="monospace">
                          {formatDayLabel(day)}
                        </text>
                      );
                    });
                  })()}

                  {/* Lines */}
                  {userSeries.map(series => {
                    const maxVal = userSeries.reduce((m, s) => Math.max(m, s.maxVal), 1);
                    const pts = series.points;
                    const totalDays = pts.length;
                    const d = pts.map((val, i) => {
                      const x = svgPadding.left + (totalDays > 1 ? (i / (totalDays - 1)) * plotW : plotW / 2);
                      const y = svgPadding.top + plotH * (1 - val / maxVal);
                      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
                    }).join(' ');
                    return (
                      <path key={series.user_label} d={d}
                        fill="none" stroke={series.color} strokeWidth="1.5"
                        strokeLinejoin="round" strokeLinecap="round" />
                    );
                  })}
                </svg>

                {/* Legend */}
                <div className="stats-user-legend">
                  {userSeries.map(s => (
                    <span key={s.user_label} className="stats-user-legend-item">
                      <span className="stats-user-legend-swatch" style={{ background: s.color }} />
                      {s.user_label}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ── Single Project: per-user daily bar charts ──────────── */}
          {!isAllProjects && (
            <>
              {analytics.observationsByUserByDay.length > 0 && (
                <div className="stats-section">
                  <div className="stats-section-title">{t('stats.dailyObsByUser')}</div>
                  <UserDailyBarChart
                    data={analytics.observationsByUserByDay}
                    users={analytics.uniqueUsers}
                  />
                </div>
              )}
              {analytics.promptsByUserByDay.length > 0 && (
                <div className="stats-section">
                  <div className="stats-section-title">{t('stats.dailyPromptsByUser')}</div>
                  <UserDailyBarChart
                    data={analytics.promptsByUserByDay}
                    users={analytics.uniqueUsers}
                  />
                </div>
              )}
              {analytics.summariesByUserByDay.length > 0 && (
                <div className="stats-section">
                  <div className="stats-section-title">{t('stats.dailySummariesByUser')}</div>
                  <UserDailyBarChart
                    data={analytics.summariesByUserByDay}
                    users={analytics.uniqueUsers}
                  />
                </div>
              )}
            </>
          )}

          {/* ── User summary table ──────────────────────────────────── */}
          {userSummary.length > 0 && (
            <div className="stats-section">
              <div className="stats-section-title">{t('stats.userSummary')}</div>
              <div className="stats-user-table-wrap">
                <table className="stats-user-table">
                  <thead>
                    <tr>
                      <th>{t('stats.user')}</th>
                      <th className="stats-num-col">{t('stats.prompts')}</th>
                      <th className="stats-num-col">{t('stats.observations')}</th>
                      <th className="stats-num-col">{t('stats.summaries')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {userSummary.map(row => (
                      <tr key={row.user_label}>
                        <td>{row.user_label}</td>
                        <td className="stats-num-col">{formatNumber(row.prompts)}</td>
                        <td className="stats-num-col">{formatNumber(row.obs)}</td>
                        <td className="stats-num-col">{formatNumber(row.summaries)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}

/* ── UserDailyBarChart: horizontal bars showing daily counts per user ── */
interface BarChartProps {
  data: Array<{ day: string; user_label: string; count: number }>;
  users: string[];
}

function UserDailyBarChart({ data, users }: BarChartProps) {

  // Build day→{user→count}
  const byDay = new Map<string, Record<string, number>>();
  for (const pt of data) {
    let rec = byDay.get(pt.day);
    if (!rec) { rec = {}; byDay.set(pt.day, rec); }
    rec[pt.user_label] = pt.count;
  }

  const sortedDays = Array.from(byDay.keys()).sort();
  if (sortedDays.length === 0) return null;

  // Show last 30 days at most
  const displayDays = sortedDays.slice(-30);
  const maxCount = Math.max(1, ...displayDays.flatMap(d => Object.values(byDay.get(d) ?? {})));

  return (
    <div className="stats-bar-chart">
      {displayDays.map(day => {
        const rec = byDay.get(day) ?? {};
        return (
          <div key={day} className="stats-bar-row">
            <span className="stats-bar-day-label">{formatDayLabel(day)}</span>
            <div className="stats-bar-stack">
              {users.map(user => {
                const count = rec[user] ?? 0;
                if (count === 0) return null;
                const pct = Math.round((count / maxCount) * 100);
                return (
                  <div
                    key={user}
                    className="stats-bar-segment"
                    style={{
                      width: `${Math.max(pct, 1)}%`,
                    }}
                    title={`${user}: ${count}`}
                  />
                );
              })}
            </div>
            <span className="stats-bar-total">
              {Object.values(rec).reduce((a, b) => a + b, 0)}
            </span>
          </div>
        );
      })}
    </div>
  );
}
