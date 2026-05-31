import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Header } from './components/Header';
import { Feed } from './components/Feed';
import { ContextSettingsModal } from './components/ContextSettingsModal';
import { LogsDrawer } from './components/LogsModal';
import { ProjectSidebar } from './components/ProjectSidebar';
import { ViewMode } from './components/ViewModeToggle';
import { WelcomeCard, getStoredWelcomeDismissed, setStoredWelcomeDismissed } from './components/WelcomeCard';
import { useSSE, ProjectStat } from './hooks/useSSE';
import { useSettings } from './hooks/useSettings';
import { useStats } from './hooks/useStats';
import { usePagination } from './hooks/usePagination';
import { useTheme } from './hooks/useTheme';
import { useLocale } from './hooks/useLocale';
import { useRole } from './hooks/useRole';
import { useUsers } from './hooks/useUsers';
import { useSyncStatus } from './hooks/useSyncStatus';
import { useAuth } from './hooks/useAuth';
import { LoginPage } from './components/LoginPage';
import { Observation, Summary, UserPrompt } from './types';
import { mergeAndDeduplicateByProject } from './utils/data';

const VIEW_MODE_KEY = 'claude-mem.viewMode';

function readInitialViewMode(): ViewMode {
  try {
    const stored = window.localStorage.getItem(VIEW_MODE_KEY);
    if (stored === 'prompts') return 'prompts';
  } catch {
    /* localStorage unavailable */
  }
  return 'all';
}

export function App() {
  const [currentFilter, setCurrentFilter] = useState('');
  const [contextPreviewOpen, setContextPreviewOpen] = useState(false);
  const [logsModalOpen, setLogsModalOpen] = useState(false);
  const [welcomeDismissed, setWelcomeDismissed] = useState<boolean>(getStoredWelcomeDismissed);
  const [viewMode, setViewModeState] = useState<ViewMode>(readInitialViewMode);
  const [paginatedObservations, setPaginatedObservations] = useState<Observation[]>([]);
  const [paginatedSummaries, setPaginatedSummaries] = useState<Summary[]>([]);
  const [paginatedPrompts, setPaginatedPrompts] = useState<UserPrompt[]>([]);
  // Day filter — local-timezone YYYY-MM-DD when active, null = "all history".
  // The home view stays unfiltered by default; only an explicit user pick
  // narrows the feed and the sidebar stats to a single day.
  const [dateFilter, setDateFilter] = useState<string | null>(null);
  const [dayStats, setDayStats] = useState<Record<string, ProjectStat> | null>(null);
  /**
   * T-21 — server-mode user filter. null = no scoping (all users).
   * Hidden entirely in client mode via the Header gate.
   */
  const [userLabelFilter, setUserLabelFilter] = useState<string | null>(null);

  const setViewMode = useCallback((next: ViewMode) => {
    setViewModeState(next);
    try {
      window.localStorage.setItem(VIEW_MODE_KEY, next);
    } catch {
      /* ignore */
    }
  }, []);

  const { observations, summaries, prompts, projects, projectUsers, projectStats, isProcessing, queueDepth, isConnected, pruneByProjects } = useSSE();
  const { settings, saveSettings, isSaving, saveStatus } = useSettings();
  const { refreshStats } = useStats();
  const { preference, setThemePreference } = useTheme();
  const { t } = useLocale();
  const role = useRole();
  const auth = useAuth();
  const { users } = useUsers(role.role === 'server' && role.ready);
  // Always include the current user in the picker — even before any sync
  // data arrives, the server operator needs to be able to filter their
  // own rows.
  const pickerUsers = useMemo(() => {
    if (!role.userLabel) return users;
    const has = users.some(u => u.user_label === role.userLabel);
    if (has) return users;
    return [{ user_label: role.userLabel, sessions: 0, last_active: null }, ...users];
  }, [users, role.userLabel]);
  const { status: syncStatus, ready: syncStatusReady } = useSyncStatus();

  // Convert YYYY-MM-DD (local) → half-open [start, end) ms epoch. Local
  // timezone matters: a user picking "May 16" in Asia/Shanghai should not
  // see rows that were timestamped late on May 15 UTC.
  const dayBounds = useMemo(() => {
    if (!dateFilter) return null;
    const parts = dateFilter.split('-').map(Number);
    if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) return null;
    const [y, m, d] = parts;
    const start = new Date(y, m - 1, d).getTime();
    const end = new Date(y, m - 1, d + 1).getTime();
    return { start, end };
  }, [dateFilter]);

  const pagination = usePagination(currentFilter, dayBounds, userLabelFilter);

  const matchesSelection = useCallback(
    (item: { project: string; created_at_epoch: number; user_label?: string | null }) => {
      if (currentFilter && item.project !== currentFilter) return false;
      if (dayBounds && (item.created_at_epoch < dayBounds.start || item.created_at_epoch >= dayBounds.end)) return false;
      // T-22: paginated API data is already server-filtered and does not
      // carry user_label in the response. Only filter SSE data which
      // broadcasts globally and explicitly includes user_label.
      if (userLabelFilter && item.user_label != null && item.user_label !== userLabelFilter) return false;
      return true;
    },
    [currentFilter, dayBounds, userLabelFilter]
  );

  // Fetch day-scoped project stats when a day filter is active. Cleared
  // back to null when the user clears the date so the sidebar falls back to
  // the all-time stats from useSSE.
  useEffect(() => {
    if (!dayBounds) {
      setDayStats(null);
      return;
    }
    const controller = new AbortController();
    const params = new URLSearchParams({
      dateStart: String(dayBounds.start),
      dateEnd: String(dayBounds.end),
    });
    if (userLabelFilter) params.append('userLabel', userLabelFilter);
    const url = `/api/projects/stats?${params}`;
    fetch(url, { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((body: { projects?: Record<string, ProjectStat> }) => {
        setDayStats(body.projects ?? {});
      })
      .catch((err) => {
        if ((err as Error).name === 'AbortError') return;
        console.warn('[App] day stats fetch failed:', err);
        // Fall back to an empty object so the sidebar shows real "0 for this
        // day" rather than the all-time stats, which would be misleading.
        setDayStats({});
      });
    return () => controller.abort();
  }, [dayBounds?.start, dayBounds?.end, userLabelFilter]);

  // Effective values fed into the sidebar:
  //   - day-filter active → use day-scoped stats and restrict the project
  //     list to projects that actually have rows in that day
  //   - no day filter    → fall back to the all-time stats from useSSE
  const effectiveProjectStats = dayBounds ? (dayStats ?? {}) : projectStats;
  const effectiveProjects = useMemo(() => {
    if (!dayBounds) return projects;
    return projects.filter((p) => (effectiveProjectStats[p]?.total ?? 0) > 0);
  }, [projects, dayBounds, effectiveProjectStats]);

  useEffect(() => {
    if (currentFilter && !effectiveProjects.includes(currentFilter)) {
      // Either the project was deleted or it has no rows in the picked day.
      // Reset to "All projects" instead of leaving an empty feed under a
      // ghost filter.
      setCurrentFilter('');
    }
  }, [effectiveProjects, currentFilter]);

  const allObservations = useMemo(() => {
    if (viewMode === 'prompts') return [];
    const live = observations.filter(matchesSelection);
    const paginated = paginatedObservations.filter(matchesSelection);
    return mergeAndDeduplicateByProject(live, paginated);
  }, [observations, paginatedObservations, matchesSelection, viewMode]);

  const allSummaries = useMemo(() => {
    if (viewMode === 'prompts') return [];
    const live = summaries.filter(matchesSelection);
    const paginated = paginatedSummaries.filter(matchesSelection);
    return mergeAndDeduplicateByProject(live, paginated);
  }, [summaries, paginatedSummaries, matchesSelection, viewMode]);

  const allPrompts = useMemo(() => {
    const live = prompts.filter(matchesSelection);
    const paginated = paginatedPrompts.filter(matchesSelection);
    return mergeAndDeduplicateByProject(live, paginated);
  }, [prompts, paginatedPrompts, matchesSelection]);

  const toggleContextPreview = useCallback(() => {
    setContextPreviewOpen(prev => !prev);
  }, []);

  const toggleLogsModal = useCallback(() => {
    setLogsModalOpen(prev => !prev);
  }, []);

  const handleLoadMore = useCallback(async () => {
    try {
      const [newObservations, newSummaries, newPrompts] = await Promise.all([
        pagination.observations.loadMore(),
        pagination.summaries.loadMore(),
        pagination.prompts.loadMore()
      ]);

      if (newObservations.length > 0) {
        setPaginatedObservations(prev => [...prev, ...newObservations]);
      }
      if (newSummaries.length > 0) {
        setPaginatedSummaries(prev => [...prev, ...newSummaries]);
      }
      if (newPrompts.length > 0) {
        setPaginatedPrompts(prev => [...prev, ...newPrompts]);
      }
    } catch (error) {
      console.error('Failed to load more data:', error);
    }
  }, [pagination.observations, pagination.summaries, pagination.prompts]);

  useEffect(() => {
    setPaginatedObservations([]);
    setPaginatedSummaries([]);
    setPaginatedPrompts([]);
    handleLoadMore();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentFilter, dayBounds?.start, dayBounds?.end, userLabelFilter]);

  /**
   * Sidebar's project-delete flow: drop matching rows from BOTH the SSE-
   * managed live state and the locally paginated buffer. Without the second
   * pass, already-paginated rows of a deleted project would linger until the
   * user changes the project filter.
   *
   * Also clear the active filter if it points at a now-deleted project, so
   * the feed snaps back to "All Projects" instead of showing "no items".
   */
  const handleProjectsDeleted = useCallback((deleted: string[]) => {
    if (deleted.length === 0) return;
    const removed = new Set(deleted);
    pruneByProjects(deleted);
    setPaginatedObservations((prev) => prev.filter((o) => !removed.has(o.project)));
    setPaginatedSummaries((prev) => prev.filter((s) => !removed.has(s.project)));
    setPaginatedPrompts((prev) => prev.filter((p) => !removed.has(p.project)));
    if (currentFilter && removed.has(currentFilter)) {
      setCurrentFilter('');
    }
  }, [pruneByProjects, currentFilter]);

  /**
   * Single-prompt delete (PromptCard delete button). The live SSE state is
   * pruned by the `prompt_deleted` broadcast in useSSE; here we only need to
   * drop the row from the locally paginated buffer so it disappears
   * immediately on the originating client without waiting for a refetch.
   */
  const handlePromptDeleted = useCallback((id: number) => {
    setPaginatedPrompts((prev) => prev.filter((p) => p.id !== id));
  }, []);

  useEffect(() => {
    refreshStats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [observations.length]);

  // Server-mode auth gate
  const isServer = role.role === 'server' && role.ready;
  if (isServer && auth.isLoading) {
    return <div className="login-page"><div className="login-card" style={{ textAlign: 'center' }}><p style={{ color: 'var(--fg-muted, #8b949e)' }}>Loading...</p></div></div>;
  }
  if (isServer && !auth.isAuthenticated) {
    return (
      <LoginPage
        onLogin={auth.login}
        isLoading={auth.isLoading}
        error={auth.error}
        attemptsRemaining={auth.attemptsRemaining}
        retryAfterSec={auth.retryAfterSec}
      />
    );
  }

  return (
    <>
      <div className="app-shell">
        <ProjectSidebar
          projects={effectiveProjects}
          currentFilter={currentFilter}
          onFilterChange={setCurrentFilter}
          observations={observations}
          summaries={summaries}
          prompts={prompts}
          projectStats={effectiveProjectStats}
          projectUsers={projectUsers}
          onProjectsDeleted={handleProjectsDeleted}
        />
        <div className="app-main">
          <Header
            isConnected={isConnected}
            projects={effectiveProjects}
            currentFilter={currentFilter}
            onFilterChange={setCurrentFilter}
            isProcessing={isProcessing}
            queueDepth={queueDepth}
            themePreference={preference}
            onThemeChange={setThemePreference}
            onContextPreviewToggle={toggleContextPreview}
            viewMode={viewMode}
            onViewModeChange={setViewMode}
            dateFilter={dateFilter}
            onDateFilterChange={setDateFilter}
            showUserSelector={role.role === 'server'}
            deployment={role.deployment}
            users={pickerUsers}
            userLabelFilter={userLabelFilter}
            onUserLabelFilterChange={setUserLabelFilter}
            syncStatus={syncStatus}
            syncStatusReady={syncStatusReady}
            onShowHelp={() => {
              setStoredWelcomeDismissed(false);
              setWelcomeDismissed(false);
            }}
            onLogout={isServer ? auth.logout : undefined}
          />
          <Feed
            observations={allObservations}
            summaries={allSummaries}
            prompts={allPrompts}
            onLoadMore={handleLoadMore}
            onPromptDeleted={handlePromptDeleted}
            isLoading={pagination.observations.isLoading || pagination.summaries.isLoading || pagination.prompts.isLoading}
            hasMore={pagination.observations.hasMore || pagination.summaries.hasMore || pagination.prompts.hasMore}
          />
        </div>
      </div>

      {!welcomeDismissed && (
        <WelcomeCard onDismiss={() => setWelcomeDismissed(true)} />
      )}

      <ContextSettingsModal
        isOpen={contextPreviewOpen}
        onClose={toggleContextPreview}
        settings={settings}
        onSave={saveSettings}
        isSaving={isSaving}
        saveStatus={saveStatus}
      />

      <button
        className="console-toggle-btn"
        onClick={toggleLogsModal}
        title={t('console.toggle')}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="4 17 10 11 4 5"></polyline>
          <line x1="12" y1="19" x2="20" y2="19"></line>
        </svg>
      </button>

      <LogsDrawer
        isOpen={logsModalOpen}
        onClose={toggleLogsModal}
      />
    </>
  );
}
