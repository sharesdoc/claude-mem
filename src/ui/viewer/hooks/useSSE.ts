import { useState, useEffect, useRef, useCallback } from 'react';
import { Observation, Summary, UserPrompt, StreamEvent } from '../types';
import { API_ENDPOINTS } from '../constants/api';
import { TIMING } from '../constants/timing';

export interface ProjectStat {
  observations: number;
  summaries: number;
  prompts: number;
  total: number;
  latest: number;
}

export function useSSE() {
  const [observations, setObservations] = useState<Observation[]>([]);
  const [summaries, setSummaries] = useState<Summary[]>([]);
  const [prompts, setPrompts] = useState<UserPrompt[]>([]);
  const [projects, setProjects] = useState<string[]>([]);
  // Map of project → user_label (from sdk_sessions). Authoritative source
  // for sidebar user grouping; absent entries fall back to path parsing
  // then to "unknown" so legacy / cross-OS project IDs still group sanely.
  const [projectUsers, setProjectUsers] = useState<Record<string, string | null>>({});
  // Authoritative per-project counts. Seeded from /api/projects/stats on
  // first SSE open, then bumped incrementally by new_* events. Survives
  // worker restarts (the SSE reconnect re-fetches it).
  const [projectStats, setProjectStats] = useState<Record<string, ProjectStat>>({});
  const [isConnected, setIsConnected] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [queueDepth, setQueueDepth] = useState(0);
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout>();

  const addProjectIfNew = (project: string) => {
    setProjects(prev => prev.includes(project) ? prev : [...prev, project]);
  };

  /**
   * Update the project → user_label map from an SSE delta. Without this,
   * new projects that arrive via sync between full refreshes have no entry
   * in projectUsers, fall back to path parsing, and end up in the UNKNOWN
   * group on the server viewer. Null / empty labels are ignored so we
   * never overwrite a known label with garbage.
   */
  const bumpStat = (
    project: string,
    field: 'observations' | 'summaries' | 'prompts',
    epoch: number,
  ) => {
    setProjectStats(prev => {
      const cur = prev[project] ?? { observations: 0, summaries: 0, prompts: 0, total: 0, latest: 0 };
      const next: ProjectStat = {
        ...cur,
        [field]: cur[field] + 1,
        total: cur.total + 1,
        latest: epoch > cur.latest ? epoch : cur.latest,
      };
      return { ...prev, [project]: next };
    });
  };

  // Pull authoritative project counts from the worker. Called once after
  // SSE opens so the sidebar reflects historical data — without this, every
  // worker restart leaves the sidebar at zero until new SSE events arrive.
  // Also scheduled on a debounce after each stat-changing SSE event so the
  // incremental bumpStat never drifts far from the DB truth.
  const fetchProjectStats = async () => {
    try {
      const r = await fetch('/api/projects/stats');
      if (!r.ok) return;
      const body = (await r.json()) as {
        projects?: Record<string, ProjectStat>;
        projectUsers?: Record<string, string | null>;
      };
      if (body.projects) {
        setProjectStats(body.projects);
        // Populate project list from API so the sidebar never appears
        // empty on refresh — SSE initial_load may arrive later.
        const apiProjects = Object.keys(body.projects);
        if (apiProjects.length > 0) {
          setProjects(prev => {
            const merged = new Set([...prev, ...apiProjects]);
            return merged.size === prev.length ? prev : [...merged];
          });
        }
      }
      if (body.projectUsers) setProjectUsers(body.projectUsers);
    } catch {
      // Network blip or worker not ready — fall back to incremental SSE
      // accumulation (still wrong-but-not-broken).
    }
  };

  const statsRefreshRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleStatsRefresh = () => {
    if (statsRefreshRef.current) clearTimeout(statsRefreshRef.current);
    statsRefreshRef.current = setTimeout(() => {
      statsRefreshRef.current = null;
      void fetchProjectStats();
    }, 3000);
  };

  useEffect(() => {
    const connect = () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }

      const eventSource = new EventSource(API_ENDPOINTS.STREAM);
      eventSourceRef.current = eventSource;

      eventSource.onopen = () => {
        console.log('[SSE] Connected');
        setIsConnected(true);
        if (reconnectTimeoutRef.current) {
          clearTimeout(reconnectTimeoutRef.current);
        }
        // Pull authoritative counts every time we (re)connect, not just on
        // first mount. Worker restarts trigger a fresh fetch so the sidebar
        // doesn't display stale-zero counts after restart.
        void fetchProjectStats();
      };

      eventSource.onerror = (error) => {
        console.error('[SSE] Connection error:', error);
        setIsConnected(false);
        eventSource.close();

        reconnectTimeoutRef.current = setTimeout(() => {
          reconnectTimeoutRef.current = undefined;
          console.log('[SSE] Attempting to reconnect...');
          connect();
        }, TIMING.SSE_RECONNECT_DELAY_MS);
      };

      eventSource.onmessage = (event) => {
        const data: StreamEvent = JSON.parse(event.data);

        switch (data.type) {
          case 'initial_load':
            console.log('[SSE] Initial load:', {
              projects: data.projects?.length || 0
            });
            setProjects(data.projects || []);
            // Adopt the freshest user-label map; falls back to {} if the
            // server is on an older build that doesn't send projectUsers.
            setProjectUsers((data as { projectUsers?: Record<string, string | null> }).projectUsers ?? {});
            break;

          case 'new_observation':
            if (data.observation) {
              console.log('[SSE] New observation:', data.observation.id);
              addProjectIfNew(data.observation.project);
              setProjectUsers(prev => {
                const label = data.observation!.user_label;
                if (!label) return prev;
                return prev[data.observation!.project] === label ? prev : { ...prev, [data.observation!.project]: label };
              });
              setObservations(prev => [data.observation!, ...prev]);
              bumpStat(data.observation.project, 'observations', data.observation.created_at_epoch);
              scheduleStatsRefresh();
            }
            break;

          case 'new_summary':
            if (data.summary) {
              console.log('[SSE] New summary:', data.summary.id);
              addProjectIfNew(data.summary.project);
              setProjectUsers(prev => {
                const label = data.summary!.user_label;
                if (!label) return prev;
                return prev[data.summary!.project] === label ? prev : { ...prev, [data.summary!.project]: label };
              });
              setSummaries(prev => [data.summary!, ...prev]);
              bumpStat(data.summary.project, 'summaries', data.summary.created_at_epoch);
              scheduleStatsRefresh();
            }
            break;

          case 'new_prompt':
            if (data.prompt) {
              console.log('[SSE] New prompt:', data.prompt.id);
              addProjectIfNew(data.prompt.project);
              setProjectUsers(prev => {
                const label = data.prompt!.user_label;
                if (!label) return prev;
                return prev[data.prompt!.project] === label ? prev : { ...prev, [data.prompt!.project]: label };
              });
              setPrompts(prev => [data.prompt!, ...prev]);
              bumpStat(data.prompt.project, 'prompts', data.prompt.created_at_epoch);
              scheduleStatsRefresh();
            }
            break;

          case 'processing_status':
            if (typeof data.isProcessing === 'boolean') {
              console.log('[SSE] Processing status:', data.isProcessing, 'Queue depth:', data.queueDepth);
              setIsProcessing(data.isProcessing);
              setQueueDepth(data.queueDepth || 0);
            }
            break;

          case 'prompt_deleted':
            // A prompt was deleted (viewer card delete button). Drop it from
            // the live feed. The broadcast reaches every client including the
            // originator, so this is the single source of truth for live-state
            // pruning. Sidebar prompt counts self-heal via the debounced
            // authoritative refetch below — same mechanism bumpStat relies on.
            if (typeof data.id === 'number') {
              const deletedId = data.id;
              console.log('[SSE] Prompt deleted:', deletedId);
              setPrompts(prev => prev.filter(p => p.id !== deletedId));
              scheduleStatsRefresh();
            }
            break;

          case 'projects_deleted':
            // Server-side admin removed projects (POST /api/projects/delete).
            // Local feed state is stale for those projects until we filter it
            // out — without this we'd leave ghost rows visible in the UI.
            if (Array.isArray(data.projects) && data.projects.length > 0) {
              const removed = new Set(data.projects);
              console.log('[SSE] Projects deleted:', data.projects);
              setObservations(prev => prev.filter(o => !removed.has(o.project)));
              setSummaries(prev => prev.filter(s => !removed.has(s.project)));
              setPrompts(prev => prev.filter(p => !removed.has(p.project)));
              setProjects(prev => prev.filter(p => !removed.has(p)));
              setProjectUsers(prev => {
                const next: Record<string, string | null> = {};
                for (const [k, v] of Object.entries(prev)) {
                  if (!removed.has(k)) next[k] = v;
                }
                return next;
              });
              setProjectStats(prev => {
                const next: Record<string, ProjectStat> = {};
                for (const [k, v] of Object.entries(prev)) {
                  if (!removed.has(k)) next[k] = v;
                }
                return next;
              });
            }
            break;
        }
      };
    };

    connect();

    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (statsRefreshRef.current) {
        clearTimeout(statsRefreshRef.current);
      }
    };
  }, []);

  /**
   * Locally drop every entry that belongs to one of `projectsToRemove`.
   * Used by the project-delete admin path so the UI refreshes immediately
   * after the API call returns, without waiting for the SSE round-trip.
   * The SSE listener above is idempotent — applying both paths is fine.
   */
  const pruneByProjects = useCallback((projectsToRemove: string[]) => {
    if (projectsToRemove.length === 0) return;
    const removed = new Set(projectsToRemove);
    setObservations(prev => prev.filter(o => !removed.has(o.project)));
    setSummaries(prev => prev.filter(s => !removed.has(s.project)));
    setPrompts(prev => prev.filter(p => !removed.has(p.project)));
    setProjects(prev => prev.filter(p => !removed.has(p)));
    setProjectStats(prev => {
      const next: Record<string, ProjectStat> = {};
      for (const [k, v] of Object.entries(prev)) {
        if (!removed.has(k)) next[k] = v;
      }
      return next;
    });
  }, []);

  return {
    observations,
    summaries,
    prompts,
    projects,
    projectUsers,
    projectStats,
    isProcessing,
    queueDepth,
    isConnected,
    pruneByProjects
  };
}
