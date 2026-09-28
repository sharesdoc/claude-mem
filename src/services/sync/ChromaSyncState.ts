import { readFileSync, writeFileSync, renameSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import { SettingsDefaultsManager } from '../../shared/SettingsDefaultsManager.js';
import { logger } from '../../utils/logger.js';

export type DocKind = 'observations' | 'summaries' | 'prompts';
type PendingIdsByKind = Partial<Record<DocKind, number[]>>;

export interface ProjectWatermarks {
  observations: number;
  summaries: number;
  prompts: number;
  pending?: PendingIdsByKind;
}

const ZERO: ProjectWatermarks = { observations: 0, summaries: 0, prompts: 0 };

function statePath(): string {
  const dataDir = SettingsDefaultsManager.get('CLAUDE_MEM_DATA_DIR');
  return join(dataDir, 'chroma-sync-state.json');
}

let cache: Record<string, ProjectWatermarks> | null = null;
let dirty = false;

function normalizePendingIds(ids: unknown): number[] {
  if (!Array.isArray(ids)) return [];
  return [...new Set(ids.filter((id): id is number => Number.isInteger(id) && id > 0))]
    .sort((a, b) => a - b);
}

function normalizeProjectWatermarks(marks?: Partial<ProjectWatermarks>): ProjectWatermarks {
  const normalized: ProjectWatermarks = {
    observations: Number.isInteger(marks?.observations) ? marks!.observations! : 0,
    summaries: Number.isInteger(marks?.summaries) ? marks!.summaries! : 0,
    prompts: Number.isInteger(marks?.prompts) ? marks!.prompts! : 0,
  };
  if (marks?.pending && typeof marks.pending === 'object') {
    const pending: PendingIdsByKind = {
      observations: normalizePendingIds(marks.pending.observations),
      summaries: normalizePendingIds(marks.pending.summaries),
      prompts: normalizePendingIds(marks.pending.prompts),
    };
    if (Object.values(pending).some(ids => ids && ids.length > 0)) normalized.pending = pending;
  }
  return normalized;
}

function load(): Record<string, ProjectWatermarks> {
  if (cache) return cache;
  const path = statePath();
  if (!existsSync(path)) {
    cache = {};
    return cache;
  }
  const raw = readFileSync(path, 'utf8');
  const parsed = JSON.parse(raw) as Record<string, Partial<ProjectWatermarks>>;
  const normalized: Record<string, ProjectWatermarks> = {};
  for (const [project, marks] of Object.entries(parsed)) {
    normalized[project] = normalizeProjectWatermarks(marks);
  }
  cache = normalized;
  return cache;
}

function persist(): void {
  if (!cache) return;
  const path = statePath();
  const dataDir = SettingsDefaultsManager.get('CLAUDE_MEM_DATA_DIR');
  if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, JSON.stringify(cache, null, 2), 'utf8');
  renameSync(tmp, path);
  dirty = false;
}

export const ChromaSyncState = {
  exists(): boolean {
    return existsSync(statePath());
  },

  get(project: string): ProjectWatermarks {
    const all = load();
    return normalizeProjectWatermarks(all[project] ?? ZERO);
  },

  getPending(project: string, kind: DocKind): number[] {
    return this.get(project).pending?.[kind] ?? [];
  },

  bump(project: string, kind: DocKind, id: number): void {
    if (!Number.isInteger(id) || id <= 0) return;
    const all = load();
    const current = normalizeProjectWatermarks(all[project] ?? ZERO);
    let changed = false;
    if (id > current[kind]) {
      current[kind] = id;
      changed = true;
    }
    const pending = current.pending?.[kind] ?? [];
    if (pending.includes(id)) {
      const remaining = pending.filter(pendingId => pendingId !== id);
      current.pending = current.pending ?? {};
      if (remaining.length > 0) current.pending[kind] = remaining;
      else delete current.pending[kind];
      if (Object.keys(current.pending).length === 0) delete current.pending;
      changed = true;
    }
    if (!changed) return;
    all[project] = current;
    dirty = true;
    persist();
  },

  replace(project: string, marks: ProjectWatermarks): void {
    const all = load();
    all[project] = normalizeProjectWatermarks(marks);
    dirty = true;
    persist();
  },

  markPending(project: string, kind: DocKind, ids: number[]): void {
    const additions = normalizePendingIds(ids);
    if (additions.length === 0) return;
    const all = load();
    const current = normalizeProjectWatermarks(all[project] ?? ZERO);
    const existing = current.pending?.[kind] ?? [];
    const merged = [...new Set([...existing, ...additions])].sort((a, b) => a - b);
    if (merged.length === existing.length && merged.every((id, index) => id === existing[index])) return;
    current.pending = current.pending ?? {};
    current.pending[kind] = merged;
    all[project] = current;
    dirty = true;
    persist();
  },

  clearPending(project: string, kind: DocKind, ids: number[]): void {
    const removals = new Set(normalizePendingIds(ids));
    if (removals.size === 0) return;
    const all = load();
    const current = normalizeProjectWatermarks(all[project] ?? ZERO);
    const existing = current.pending?.[kind] ?? [];
    const remaining = existing.filter(id => !removals.has(id));
    if (remaining.length === existing.length) return;
    current.pending = current.pending ?? {};
    if (remaining.length > 0) current.pending[kind] = remaining;
    else delete current.pending[kind];
    if (Object.keys(current.pending).length === 0) delete current.pending;
    all[project] = current;
    dirty = true;
    persist();
  },

  flush(): void {
    if (dirty) persist();
  },

  resetCache(): void {
    cache = null;
    dirty = false;
  }
};
