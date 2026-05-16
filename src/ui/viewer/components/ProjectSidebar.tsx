import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Observation, Summary, UserPrompt } from '../types';

interface ProjectSidebarProps {
  projects: string[];
  currentFilter: string;
  onFilterChange: (project: string) => void;
  observations: Observation[];
  summaries: Summary[];
  prompts: UserPrompt[];
}

interface ProjectStat {
  observations: number;
  summaries: number;
  prompts: number;
  total: number;
  latest: number;
}

const STORAGE_KEY = 'claude-mem.sidebarWidth';
const MIN_WIDTH = 160;
const MAX_RATIO = 0.50; // 50% of viewport width
const DEFAULT_RATIO = 0.20; // 20% of viewport width

function getMaxWidth(): number {
  if (typeof window === 'undefined') return 600;
  return Math.round(window.innerWidth * MAX_RATIO);
}

function clampWidth(n: number): number {
  return Math.max(MIN_WIDTH, Math.min(getMaxWidth(), Math.round(n)));
}

function readInitialWidth(): number {
  if (typeof window === 'undefined') return 240;
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const n = parseInt(stored, 10);
      if (Number.isFinite(n)) return clampWidth(n);
    }
  } catch {
    /* localStorage may be disabled — fall through to default */
  }
  return clampWidth(window.innerWidth * DEFAULT_RATIO);
}

export function ProjectSidebar({
  projects,
  currentFilter,
  onFilterChange,
  observations,
  summaries,
  prompts,
}: ProjectSidebarProps) {
  const [width, setWidth] = useState<number>(readInitialWidth);
  const [isResizing, setIsResizing] = useState(false);
  const widthRef = useRef(width);

  useEffect(() => {
    widthRef.current = width;
  }, [width]);

  // Re-clamp when the viewport shrinks below 2× current width (current would
  // exceed the 50% cap). Avoids the sidebar visually exceeding the new limit.
  useEffect(() => {
    const onResize = () => setWidth((w) => clampWidth(w));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    if (!isResizing) return;

    const handleMove = (e: MouseEvent) => {
      setWidth(clampWidth(e.clientX));
    };
    const handleUp = () => {
      setIsResizing(false);
      try {
        window.localStorage.setItem(STORAGE_KEY, String(widthRef.current));
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

  const stats = useMemo<Record<string, ProjectStat>>(() => {
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
    return acc;
  }, [observations, summaries, prompts]);

  const sortedProjects = useMemo(() => {
    return [...projects].sort((a, b) => {
      const la = stats[a]?.latest ?? 0;
      const lb = stats[b]?.latest ?? 0;
      if (la !== lb) return lb - la;
      return a.localeCompare(b);
    });
  }, [projects, stats]);

  const totalCount = observations.length + summaries.length + prompts.length;

  return (
    <aside
      className="project-sidebar"
      aria-label="Projects"
      style={{ width: `${width}px` }}
    >
      <div className="project-sidebar-header">
        <span className="project-sidebar-title">Projects</span>
        <span className="project-sidebar-count">{projects.length}</span>
      </div>
      <div className="project-sidebar-list">
        <button
          type="button"
          className={`project-sidebar-item${currentFilter === '' ? ' is-active' : ''}`}
          onClick={() => onFilterChange('')}
          title="Show items from all projects"
        >
          <span className="project-sidebar-item-name">All Projects</span>
          <span className="project-sidebar-item-count">{totalCount}</span>
        </button>
        {sortedProjects.length === 0 && (
          <div className="project-sidebar-empty">No projects yet</div>
        )}
        {sortedProjects.map((project) => {
          const s =
            stats[project] ?? { total: 0, observations: 0, summaries: 0, prompts: 0, latest: 0 };
          const isActive = currentFilter === project;
          return (
            <button
              key={project}
              type="button"
              className={`project-sidebar-item${isActive ? ' is-active' : ''}`}
              onClick={() => onFilterChange(project)}
              title={`${project}\nobservations: ${s.observations}\nsummaries: ${s.summaries}\nprompts: ${s.prompts}`}
            >
              <span className="project-sidebar-item-name">{project}</span>
              <span className="project-sidebar-item-count">{s.total}</span>
            </button>
          );
        })}
      </div>
      <div
        className={`project-sidebar-resizer${isResizing ? ' is-active' : ''}`}
        onMouseDown={(e) => {
          e.preventDefault();
          setIsResizing(true);
        }}
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize project sidebar"
      />
    </aside>
  );
}
