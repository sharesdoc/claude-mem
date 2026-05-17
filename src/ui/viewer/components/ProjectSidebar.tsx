import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Observation, Summary, UserPrompt } from '../types';
import { useLocale } from '../hooks/useLocale';
import { API_ENDPOINTS } from '../constants/api';
import { getProjectAlias, parseProjectId } from '../utils/projectAlias';

interface ProjectSidebarProps {
  projects: string[];
  currentFilter: string;
  onFilterChange: (project: string) => void;
  observations: Observation[];
  summaries: Summary[];
  prompts: UserPrompt[];
  /**
   * Authoritative per-project counts from /api/projects/stats, kept fresh by
   * useSSE. When a project key is present here, the sidebar trusts these
   * numbers and ignores the local observations[]/summaries[]/prompts[]
   * tallies for that project — the local arrays only carry rows pushed in
   * the current SSE session, which is wrong after every worker restart.
   *
   * Optional: pre-fetch may not have completed on first paint, in which
   * case we transparently fall back to the local-array tally so nothing
   * shows as "0 / 0 / 0" for those first few hundred ms.
   */
  projectStats?: Record<string, ProjectStat>;
  /**
   * Called after successful project deletion with the list of project IDs the
   * server confirmed gone. Parent must drop matching rows from any local
   * caches so the UI doesn't show ghost entries.
   */
  onProjectsDeleted: (projects: string[]) => void;
}

interface ProjectStat {
  observations: number;
  summaries: number;
  prompts: number;
  total: number;
  latest: number;
}

interface ToastState {
  kind: 'success' | 'warn' | 'error';
  msg: string;
  // Stamp lets duplicate messages re-trigger the auto-dismiss timer.
  ts: number;
}

interface TooltipState {
  project: string;
  rect: DOMRect;
}

interface DeleteResponse {
  deleted: string[];
  skipped: Array<{ project: string; reason: string; detail?: string }>;
  errors: Array<{ project: string; error: string }>;
  chromaResidue: string[];
}

// Width is stored as a *ratio of the viewport* (not absolute pixels) so the
// sidebar tracks the browser when the user resizes the window. Key renamed
// from the old pixel-store key so stale pixel values aren't misread as a
// ratio. Old entries are abandoned (next drag overwrites the new key).
const STORAGE_KEY = 'claude-mem.sidebarRatio';
const MIN_WIDTH = 160;
const MAX_RATIO = 0.50;
const DEFAULT_RATIO = 0.20;

const HOVER_DELAY_MS = 200;
const TOAST_DURATION_MS = 5000;
const TOOLTIP_WIDTH = 560;
const TOOLTIP_GAP = 8;

function getViewportWidth(): number {
  return typeof window === 'undefined' ? 1280 : window.innerWidth;
}

function ratioToWidth(ratio: number, viewportWidth: number): number {
  const px = Math.round(viewportWidth * ratio);
  return Math.max(MIN_WIDTH, Math.min(Math.round(viewportWidth * MAX_RATIO), px));
}

function clampRatio(r: number): number {
  if (!Number.isFinite(r) || r <= 0) return DEFAULT_RATIO;
  return Math.min(MAX_RATIO, r);
}

function readInitialRatio(): number {
  if (typeof window === 'undefined') return DEFAULT_RATIO;
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const r = parseFloat(stored);
      if (Number.isFinite(r) && r > 0) return clampRatio(r);
    }
  } catch {
    /* localStorage may be disabled — fall through to default */
  }
  return DEFAULT_RATIO;
}

function formatLastActive(epoch: number): string {
  if (!epoch) return '';
  return new Date(epoch).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: false,
  });
}

interface TooltipProps {
  project: string;
  rect: DOMRect;
  stats?: ProjectStat;
  t: (key: string, vars?: Record<string, string | number>) => string;
}

/**
 * Floating tooltip rendered as `position: fixed`, ~2× the width of the native
 * browser tooltip so the full project ID has room to sit on one line. Anchored
 * to the right of the source row; flips to the left when it would overflow
 * the viewport.
 *
 * `pointer-events: none` keeps the tooltip purely passive — moving the mouse
 * onto it doesn't fire `mouseleave` on the source row, so the hover state
 * stays consistent.
 */
function ProjectTooltip({ project, rect, stats, t }: TooltipProps) {
  const alias = getProjectAlias(project);
  const vw = typeof window === 'undefined' ? 1280 : window.innerWidth;
  const vh = typeof window === 'undefined' ? 800 : window.innerHeight;

  // Try right side first; flip to the left when the right side would clip.
  let left = rect.right + TOOLTIP_GAP;
  if (left + TOOLTIP_WIDTH > vw - TOOLTIP_GAP) {
    left = rect.left - TOOLTIP_WIDTH - TOOLTIP_GAP;
    if (left < TOOLTIP_GAP) {
      left = Math.max(TOOLTIP_GAP, vw - TOOLTIP_WIDTH - TOOLTIP_GAP);
    }
  }

  // Vertical anchoring: top-align with the source row, clamp to viewport
  // with a generous 200px height budget (we don't know the actual rendered
  // height until after paint, and 200px is a safe upper bound for 4 lines).
  let top = rect.top;
  if (top + 200 > vh - TOOLTIP_GAP) {
    top = Math.max(TOOLTIP_GAP, vh - 200 - TOOLTIP_GAP);
  }

  const obs = stats?.observations ?? 0;
  const sum = stats?.summaries ?? 0;
  const pro = stats?.prompts ?? 0;

  return (
    <div
      className="project-sidebar-tooltip"
      style={{ left, top, width: TOOLTIP_WIDTH }}
      role="tooltip"
    >
      <div className="project-tooltip-row">
        <span className="project-tooltip-label">{t('sidebar.alias')}</span>
        <span className="project-tooltip-value is-mono">{alias}</span>
      </div>
      <div className="project-tooltip-row">
        <span className="project-tooltip-label">{t('sidebar.fullId')}</span>
        <span className="project-tooltip-value is-mono is-full-id">{project}</span>
      </div>
      <div className="project-tooltip-row">
        <span className="project-tooltip-label">
          {t('sidebar.observations')} / {t('sidebar.summaries')} / {t('sidebar.prompts')}
        </span>
        <span className="project-tooltip-value">{obs} / {sum} / {pro}</span>
      </div>
      <div className="project-tooltip-row">
        <span className="project-tooltip-label">{t('sidebar.lastActive')}</span>
        <span className="project-tooltip-value">
          {stats?.latest ? formatLastActive(stats.latest) : t('sidebar.lastActiveNever')}
        </span>
      </div>
    </div>
  );
}

export function ProjectSidebar({
  projects,
  currentFilter,
  onFilterChange,
  observations,
  summaries,
  prompts,
  projectStats,
  onProjectsDeleted,
}: ProjectSidebarProps) {
  const { t } = useLocale();

  // Ratio is the persistent setting; viewportWidth tracks the live browser
  // size; width is derived. Keeping ratio (not pixels) as the source of truth
  // is what makes the sidebar follow the browser when the user resizes it.
  const [ratio, setRatio] = useState<number>(readInitialRatio);
  const [viewportWidth, setViewportWidth] = useState<number>(getViewportWidth);
  const [isResizing, setIsResizing] = useState(false);
  const ratioRef = useRef(ratio);
  const width = ratioToWidth(ratio, viewportWidth);

  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Rows that the server refused to delete because an AI session is still
  // active. Surfaced as an "in use" chip on the row + tooltip hint. Cleared
  // implicitly when those projects either go inactive (next delete succeeds
  // and the response no longer lists them) or vanish entirely.
  const [inUse, setInUse] = useState<Set<string>>(new Set());

  // User groups default to collapsed. Expanded set is keyed by username; a
  // user appears here only after the user explicitly expands their group, so
  // the initial state has zero stored entries even with N users present.
  const [expandedUsers, setExpandedUsers] = useState<Set<string>>(new Set());

  useEffect(() => {
    ratioRef.current = ratio;
  }, [ratio]);

  // Live-track viewport width so the derived `width` re-flows when the user
  // resizes the browser. With ratio held constant this keeps the sidebar at
  // the same fraction of the viewport instead of locking to a stale pixel
  // value.
  useEffect(() => {
    const onResize = () => setViewportWidth(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    if (!isResizing) return;

    const handleMove = (e: MouseEvent) => {
      // Convert drag position to a ratio of the current viewport. The
      // clamping is also applied in ratioToWidth, but we clamp here too so
      // the stored ratio never drifts past the bounds (otherwise a resize
      // could bring an out-of-range ratio back into the visible range).
      const vw = window.innerWidth || 1;
      const raw = e.clientX / vw;
      setRatio(clampRatio(Math.max(MIN_WIDTH / vw, raw)));
    };
    const handleUp = () => {
      setIsResizing(false);
      try {
        // Persist 4 decimal places of ratio — enough for sub-pixel precision
        // at any reasonable viewport size, without bloating the value.
        window.localStorage.setItem(STORAGE_KEY, ratioRef.current.toFixed(4));
      } catch {
        /* ignore quota / privacy mode failures */
      }
    };

    document.addEventListener('mousemove', handleMove);
    document.addEventListener('mouseup', handleUp);
    document.body.classList.add('is-sidebar-resizing');

    return () => {
      document.removeEventListener('mousemove', handleMove);
      document.removeEventListener('mouseup', handleUp);
      document.body.classList.remove('is-sidebar-resizing');
    };
  }, [isResizing]);

  // Auto-dismiss toasts so they don't accumulate visually. Re-running on
  // every `toast` reference resets the timer for new messages.
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), TOAST_DURATION_MS);
    return () => clearTimeout(id);
  }, [toast]);

  // Clear any pending hover timer on unmount so a late-firing setTimeout
  // doesn't try to setTooltip on a dead component (React warning + memory leak).
  useEffect(() => () => {
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
  }, []);

  // When the project list changes (SSE arrival or post-delete prune), prune
  // selections AND in-use markers that point at projects no longer in the
  // list — otherwise a re-entering selection mode would "remember" deleted
  // entries, and an "in use" chip would linger on a project that actually
  // vanished (e.g. user resolved the session and deleted normally).
  useEffect(() => {
    const projectSet = new Set(projects);
    const prune = (s: Set<string>): Set<string> => {
      if (s.size === 0) return s;
      let changed = false;
      const next = new Set<string>();
      for (const p of s) {
        if (projectSet.has(p)) next.add(p);
        else changed = true;
      }
      return changed ? next : s;
    };
    setSelected(prune);
    setInUse(prune);
  }, [projects]);

  const stats = useMemo<Record<string, ProjectStat>>(() => {
    // Per-project counts. Authoritative source is `projectStats` from the
    // worker (kept fresh by SSE + initial fetch). The local-array fallback
    // covers the narrow window before /api/projects/stats has resolved on
    // first load, and any project that isn't in projectStats yet — in both
    // cases the SSE-accumulated counts beat showing 0/0/0.
    const acc: Record<string, ProjectStat> = {};
    const ensure = (p: string): ProjectStat => {
      if (!acc[p]) acc[p] = { observations: 0, summaries: 0, prompts: 0, total: 0, latest: 0 };
      return acc[p];
    };
    for (const o of observations) {
      const s = ensure(o.project);
      s.observations += 1;
      s.total += 1;
      if (o.created_at_epoch > s.latest) s.latest = o.created_at_epoch;
    }
    for (const s of summaries) {
      const st = ensure(s.project);
      st.summaries += 1;
      st.total += 1;
      if (s.created_at_epoch > st.latest) st.latest = s.created_at_epoch;
    }
    for (const p of prompts) {
      const st = ensure(p.project);
      st.prompts += 1;
      st.total += 1;
      if (p.created_at_epoch > st.latest) st.latest = p.created_at_epoch;
    }

    if (projectStats) {
      // Overlay authoritative numbers, but preserve a latest_epoch derived
      // from SSE that's newer than the persisted value (e.g. an observation
      // that arrived after the stats endpoint snapshotted).
      for (const [project, server] of Object.entries(projectStats)) {
        const local = acc[project];
        acc[project] = {
          observations: server.observations,
          summaries: server.summaries,
          prompts: server.prompts,
          total: server.total,
          latest: Math.max(server.latest, local?.latest ?? 0),
        };
      }
    }
    return acc;
  }, [observations, summaries, prompts, projectStats]);

  const sortedProjects = useMemo(() => {
    return [...projects].sort((a, b) => {
      const la = stats[a]?.latest ?? 0;
      const lb = stats[b]?.latest ?? 0;
      if (la !== lb) return lb - la;
      return a.localeCompare(b);
    });
  }, [projects, stats]);

  // Group projects by username extracted from the project ID. Single-user
  // setups fall back to a flat list (no group headers); two+ users get
  // collapsible group headers sorted by most-recent activity, with the
  // user's combined prompt + summary count on the right of the header row.
  interface ProjectGroup {
    user: string;            // empty string for projects without a recoverable username
    projects: string[];      // already sorted by `latest desc`
    messageCount: number;    // prompts + summaries across the user's projects
    latest: number;          // max(latest) — drives group sort order
  }
  const projectGroups = useMemo<ProjectGroup[]>(() => {
    const byUser = new Map<string, ProjectGroup>();
    for (const project of sortedProjects) {
      const user = parseProjectId(project)?.username ?? '';
      let group = byUser.get(user);
      if (!group) {
        group = { user, projects: [], messageCount: 0, latest: 0 };
        byUser.set(user, group);
      }
      group.projects.push(project);
      const s = stats[project];
      if (s) {
        group.messageCount += s.prompts + s.summaries;
        if (s.latest > group.latest) group.latest = s.latest;
      }
    }
    return Array.from(byUser.values()).sort((a, b) => {
      if (a.latest !== b.latest) return b.latest - a.latest;
      return a.user.localeCompare(b.user);
    });
  }, [sortedProjects, stats]);

  const groupingEnabled = projectGroups.length > 1;

  const toggleUser = useCallback((user: string) => {
    setExpandedUsers((prev) => {
      const next = new Set(prev);
      if (next.has(user)) next.delete(user);
      else next.add(user);
      return next;
    });
  }, []);

  // Sum of per-project totals; pulls from the merged `stats` so the "All
  // Projects" badge stays correct after worker restart (the raw observations
  // / summaries / prompts arrays are only SSE-live).
  const totalCount = Object.values(stats).reduce((acc, s) => acc + s.total, 0);
  const allSelected = projects.length > 0 && selected.size === projects.length;

  const showTooltipFor = useCallback((project: string, ev: React.MouseEvent<HTMLElement>) => {
    const target = ev.currentTarget;
    const rect = target.getBoundingClientRect();
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    hoverTimerRef.current = setTimeout(() => {
      setTooltip({ project, rect });
    }, HOVER_DELAY_MS);
  }, []);

  const hideTooltip = useCallback(() => {
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
    setTooltip(null);
  }, []);

  const toggleSelected = useCallback((project: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(project)) next.delete(project);
      else next.add(project);
      return next;
    });
  }, []);

  const toggleAll = useCallback(() => {
    setSelected((prev) => {
      if (prev.size === projects.length) return new Set();
      return new Set(projects);
    });
  }, [projects]);

  const exitSelectMode = useCallback(() => {
    setSelectMode(false);
    setSelected(new Set());
  }, []);

  const handleDelete = useCallback(async () => {
    if (selected.size === 0 || deleting) return;
    const confirmMsg = t('sidebar.deleteConfirm', { count: selected.size });
    if (typeof window !== 'undefined' && !window.confirm(confirmMsg)) return;

    setDeleting(true);
    try {
      const response = await fetch(API_ENDPOINTS.PROJECTS_DELETE, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projects: [...selected] }),
      });

      if (!response.ok) {
        const text = await response.text().catch(() => '');
        setToast({
          kind: 'error',
          msg: t('sidebar.deleteError', {
            error: `${response.status} ${text.slice(0, 120) || response.statusText}`,
          }),
          ts: Date.now(),
        });
        return;
      }

      const data: DeleteResponse = await response.json();

      if (data.deleted.length > 0) {
        onProjectsDeleted(data.deleted);
      }

      // Reset selection so the user sees a clean state; skipped projects stay
      // selected so they can see which ones still need attention. Also flag
      // them with the "in use" chip so the user can immediately tell WHY
      // they were skipped without re-opening the toast.
      const skippedSet = new Set(data.skipped.map((s) => s.project));
      setSelected(skippedSet);
      setInUse((prev) => {
        // Refresh: drop stale flags from previous attempts, then add the
        // newly-skipped projects. Successfully-deleted projects are gone
        // from the project list and will be pruned by the `projects` effect
        // shortly — no need to handle them here.
        const next = new Set(skippedSet);
        for (const p of prev) {
          if (!data.deleted.includes(p)) next.add(p);
        }
        return next;
      });

      // Compose the toast as up to three independent parts so the user can see
      // partial successes (e.g. "deleted 3, skipped 1").
      const parts: string[] = [];
      if (data.deleted.length > 0) parts.push(t('sidebar.deleteSuccess', { count: data.deleted.length }));
      if (data.skipped.length > 0) parts.push(t('sidebar.deleteSkipped', { count: data.skipped.length }));
      if (data.errors.length > 0) {
        parts.push(t('sidebar.deleteError', { error: data.errors[0].error.slice(0, 80) }));
      }

      const kind: ToastState['kind'] =
        data.errors.length > 0 ? 'error' : data.skipped.length > 0 ? 'warn' : 'success';
      setToast({ kind, msg: parts.join(' · ') || t('sidebar.deleteSuccess', { count: 0 }), ts: Date.now() });

      // Leave select mode only when every selection produced an outcome (no
      // residual skipped entries to retry). This makes the "retry skipped"
      // workflow a single click away.
      if (data.skipped.length === 0 && data.errors.length === 0) {
        setSelectMode(false);
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      setToast({
        kind: 'error',
        msg: t('sidebar.deleteError', { error: msg }),
        ts: Date.now(),
      });
    } finally {
      setDeleting(false);
    }
  }, [selected, deleting, onProjectsDeleted, t]);

  return (
    <aside
      className="project-sidebar"
      aria-label="Projects"
      style={{ width: `${width}px` }}
    >
      <div className="project-sidebar-header">
        {selectMode ? (
          <div className="project-sidebar-header-select">
            <label
              className="project-sidebar-checkbox-wrap"
              title={t(allSelected ? 'sidebar.deselectAll' : 'sidebar.selectAll')}
            >
              <input
                type="checkbox"
                checked={allSelected}
                onChange={toggleAll}
                aria-label={t(allSelected ? 'sidebar.deselectAll' : 'sidebar.selectAll')}
              />
            </label>
            <span className="project-sidebar-select-count">
              {selected.size} / {projects.length}
            </span>
            <button
              type="button"
              className="project-sidebar-delete-btn"
              onClick={handleDelete}
              disabled={selected.size === 0 || deleting}
              title={t('sidebar.deleteSelectedTip')}
            >
              {deleting ? t('sidebar.deleting') : t('sidebar.deleteSelected')}
            </button>
            <button
              type="button"
              className="project-sidebar-cancel-btn"
              onClick={exitSelectMode}
              title={t('sidebar.exitSelect')}
              aria-label={t('sidebar.exitSelect')}
            >
              ✕
            </button>
          </div>
        ) : (
          <>
            <span className="project-sidebar-title">{t('sidebar.title')}</span>
            <div className="project-sidebar-header-right">
              <button
                type="button"
                className="project-sidebar-manage-btn"
                onClick={() => setSelectMode(true)}
                title={t('sidebar.manageTip')}
                disabled={projects.length === 0}
              >
                {t('sidebar.manage')}
              </button>
              <span className="project-sidebar-count">{projects.length}</span>
            </div>
          </>
        )}
      </div>

      <div className="project-sidebar-list">
        <button
          type="button"
          className={`project-sidebar-item${currentFilter === '' ? ' is-active' : ''}`}
          onClick={() => onFilterChange('')}
          title={t('sidebar.allProjectsTip')}
        >
          <span className="project-sidebar-item-name">{t('header.allProjects')}</span>
          <span className="project-sidebar-item-count">{totalCount}</span>
        </button>

        {sortedProjects.length === 0 && (
          <div className="project-sidebar-empty">{t('sidebar.empty')}</div>
        )}

        {(() => {
          const renderProjectRow = (project: string, indented: boolean) => {
            const s =
              stats[project] ?? { total: 0, observations: 0, summaries: 0, prompts: 0, latest: 0 };
            const isActive = currentFilter === project;
            const isSelected = selected.has(project);
            const isInUse = inUse.has(project);
            const alias = getProjectAlias(project);

            // Single click semantics:
            //   select-mode  → toggle the checkbox
            //   normal       → filter the feed by this project
            const onItemClick = () => {
              if (selectMode) toggleSelected(project);
              else onFilterChange(project);
            };

            return (
              <div
                key={project}
                className={
                  'project-sidebar-item-wrap' +
                  (isActive ? ' is-active' : '') +
                  (selectMode ? ' is-select-mode' : '') +
                  (isSelected ? ' is-selected' : '') +
                  (isInUse ? ' is-in-use' : '') +
                  (indented ? ' is-grouped' : '')
                }
                onMouseEnter={(e) => showTooltipFor(project, e)}
                onMouseLeave={hideTooltip}
              >
                {selectMode && (
                  <input
                    type="checkbox"
                    className="project-sidebar-checkbox"
                    checked={isSelected}
                    onChange={() => toggleSelected(project)}
                    onClick={(e) => e.stopPropagation()}
                    aria-label={t('sidebar.selectCheckbox')}
                  />
                )}
                <button
                  type="button"
                  className={`project-sidebar-item${isActive ? ' is-active' : ''}`}
                  onClick={onItemClick}
                >
                  <span className="project-sidebar-item-name">{alias}</span>
                  {isInUse && (
                    <span
                      className="project-sidebar-in-use-chip"
                      title={t('sidebar.inUseTip')}
                      aria-label={t('sidebar.inUseTip')}
                    >
                      {t('sidebar.inUseChip')}
                    </span>
                  )}
                  <span className="project-sidebar-item-count">{s.total}</span>
                </button>
              </div>
            );
          };

          // Flat list when there's exactly one user (or none) — keeps the
          // single-user case visually identical to the pre-grouping layout.
          if (!groupingEnabled) {
            return sortedProjects.map((p) => renderProjectRow(p, false));
          }

          return projectGroups.map((group) => {
            const label = group.user || t('sidebar.unknownUser');
            const isExpanded = expandedUsers.has(group.user);
            return (
              <div key={`group:${group.user}`} className="project-sidebar-group">
                <button
                  type="button"
                  className={`project-sidebar-group-header${isExpanded ? ' is-expanded' : ''}`}
                  onClick={() => toggleUser(group.user)}
                  aria-expanded={isExpanded}
                  title={t('sidebar.userGroupTip')}
                >
                  <span className="project-sidebar-group-caret" aria-hidden="true">
                    {isExpanded ? '▾' : '▸'}
                  </span>
                  <span className="project-sidebar-group-name">{label}</span>
                  <span className="project-sidebar-group-count">{group.messageCount}</span>
                </button>
                {isExpanded && group.projects.map((p) => renderProjectRow(p, true))}
              </div>
            );
          });
        })()}
      </div>

      <div
        className={`project-sidebar-resizer${isResizing ? ' is-active' : ''}`}
        onMouseDown={(e) => {
          e.preventDefault();
          setIsResizing(true);
        }}
        role="separator"
        aria-orientation="vertical"
        aria-label={t('sidebar.resize')}
      />

      {tooltip && (
        <ProjectTooltip
          project={tooltip.project}
          rect={tooltip.rect}
          stats={stats[tooltip.project]}
          t={t}
        />
      )}

      {toast && (
        <div className={`project-sidebar-toast is-${toast.kind}`} role="status" aria-live="polite">
          {toast.msg}
        </div>
      )}
    </aside>
  );
}
