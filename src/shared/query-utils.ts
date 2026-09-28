/**
 * Shared query-parameter utilities for the worker HTTP API.
 *
 * Context-inject endpoints accept project identifiers via `?projects=a&projects=b`
 * (repeated key) or the legacy `?project=a` (singular).  These helpers keep the
 * construction and parsing of those params in one place.
 */

// ---------------------------------------------------------------------------
// Server-side parsing (incoming request → string[])
// ---------------------------------------------------------------------------

/**
 * Normalise an unknown query-param value into a `string[]`.
 *
 * Handles:
 *  - `string[]` (express repeats `?projects=a&projects=b`)
 *  - plain `string`  (single value or comma-separated legacy form)
 *  - JSON-encoded arrays
 *
 * Returns `undefined` when the input is empty / absent, so callers can
 * distinguish "no param" from "empty array".
 */
export function normalizeStringArrayQuery(value: unknown): string[] | undefined {
  if (Array.isArray(value)) {
    return value
      .flatMap(item => Array.isArray(item) ? item : [item])
      .filter((item): item is string => typeof item === 'string')
      .map(item => item.trim())
      .filter(Boolean);
  }

  if (typeof value === 'string' && value.trim()) {
    const trimmed = value.trim();
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parsed
          .filter((item): item is string => typeof item === 'string')
          .map(item => item.trim())
          .filter(Boolean);
      }
    } catch {
      // not JSON – fall through to string handling
    }

    // Backward compatibility for older safe project IDs sent as projects=a,b.
    if (trimmed.includes(',') && !/[\\/]/.test(trimmed)) {
      return trimmed.split(',').map(part => part.trim()).filter(Boolean);
    }

    return [trimmed];
  }

  return undefined;
}

/**
 * Parse `projects` and/or `project` query params into a flat `string[]`.
 *
 * Returns `[]` (never `undefined`) – callers can check `.length === 0` to
 * reject requests that provide no project at all.
 */
export function parseProjectQuery(projectsValue: unknown, projectValue: unknown): string[] {
  return normalizeStringArrayQuery(projectsValue)
    ?? normalizeStringArrayQuery(projectValue)
    ?? [];
}

// ---------------------------------------------------------------------------
// Client-side construction (string[] → URL path)
// ---------------------------------------------------------------------------

/**
 * Build a `/api/context/inject?projects=…` path from a list of project IDs.
 *
 * Always uses the repeated-key form (`?projects=a&projects=b`) regardless of
 * array length.  The server-side `parseProjectQuery` handles both singular and
 * plural forms, but standardising on one format keeps call-sites consistent.
 */
export function buildContextInjectPath(projects: string[]): string {
  const query = new URLSearchParams();
  for (const project of projects) {
    query.append('projects', project);
  }
  return `/api/context/inject?${query.toString()}`;
}
