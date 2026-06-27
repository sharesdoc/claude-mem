import { useState, useCallback, useRef } from 'react';
import { Observation, Summary, UserPrompt } from '../types';
import { UI } from '../constants/ui';
import { API_ENDPOINTS } from '../constants/api';
import { authFetch } from '../utils/api';

interface PaginationState {
  isLoading: boolean;
  hasMore: boolean;
}

type DataType = 'observations' | 'summaries' | 'prompts';
type DataItem = Observation | Summary | UserPrompt;

export interface DateBounds {
  /** Inclusive start, ms epoch. */
  start: number;
  /** Exclusive end, ms epoch. */
  end: number;
}

// A "selection signature" key — when this string changes between renders the
// pagination cursor resets to 0 and `hasMore` is restored to true. Used so a
// switch in `currentFilter` *or* `dateBounds` re-starts the scroll from page 1.
function selectionKey(currentFilter: string, dateBounds: DateBounds | null, userLabel: string | null): string {
  return `${currentFilter}|${dateBounds ? `${dateBounds.start}-${dateBounds.end}` : 'all'}|${userLabel ?? 'any'}`;
}

function usePaginationFor<TItem extends DataItem>(
  endpoint: string,
  dataType: DataType,
  currentFilter: string,
  dateBounds: DateBounds | null,
  userLabel: string | null,
) {
  const [state, setState] = useState<PaginationState>({
    isLoading: false,
    hasMore: true
  });

  const offsetRef = useRef(0);
  const lastSelectionRef = useRef(selectionKey(currentFilter, dateBounds, userLabel));
  const stateRef = useRef(state);

  const loadMore = useCallback(async (): Promise<TItem[]> => {
    const key = selectionKey(currentFilter, dateBounds, userLabel);
    const filterChanged = lastSelectionRef.current !== key;

    if (filterChanged) {
      offsetRef.current = 0;
      lastSelectionRef.current = key;

      const newState = { isLoading: false, hasMore: true };
      setState(newState);
      stateRef.current = newState;
    }

    if (!filterChanged && (stateRef.current.isLoading || !stateRef.current.hasMore)) {
      return [];
    }

    stateRef.current = { ...stateRef.current, isLoading: true };
    setState(prev => ({ ...prev, isLoading: true }));

    const params = new URLSearchParams({
      offset: offsetRef.current.toString(),
      limit: UI.PAGINATION_PAGE_SIZE.toString()
    });

    if (currentFilter) {
      params.append('project', currentFilter);
    }
    if (dateBounds) {
      params.append('dateStart', String(dateBounds.start));
      params.append('dateEnd', String(dateBounds.end));
    }
    if (userLabel) {
      // T-22: when server-mode viewer picks a user, every list fetch
      // is scoped server-side so the client cannot reveal stale rows from
      // a different label while paginating.
      params.append('userLabel', userLabel);
    }

    try {
      const response = await authFetch(`${endpoint}?${params}`);

      if (!response.ok) {
        throw new Error(`Failed to load ${dataType}: ${response.statusText}`);
      }

      const data = await response.json() as { items: TItem[], hasMore: boolean };

      const nextState = {
        ...stateRef.current,
        isLoading: false,
        hasMore: data.hasMore
      };
      stateRef.current = nextState;

      setState(prev => ({
        ...prev,
        isLoading: false,
        hasMore: data.hasMore
      }));

      offsetRef.current += UI.PAGINATION_PAGE_SIZE;

      return data.items;
    } catch (error) {
      // Reset isLoading on error so the pagination guard allows future retries.
      // Without this, a transient failure (e.g. worker not ready after restart)
      // leaves isLoading permanently true, the Feed spinner spins forever, and
      // the IntersectionObserver sentinel never re-renders to trigger a retry.
      stateRef.current = { ...stateRef.current, isLoading: false };
      setState(prev => ({ ...prev, isLoading: false }));
      throw error;
    }
  }, [currentFilter, dateBounds?.start, dateBounds?.end, userLabel, endpoint, dataType]);

  return {
    ...state,
    loadMore
  };
}

export function usePagination(currentFilter: string, dateBounds: DateBounds | null = null, userLabel: string | null = null) {
  const observations = usePaginationFor<Observation>(API_ENDPOINTS.OBSERVATIONS, 'observations', currentFilter, dateBounds, userLabel);
  const summaries = usePaginationFor<Summary>(API_ENDPOINTS.SUMMARIES, 'summaries', currentFilter, dateBounds, userLabel);
  const prompts = usePaginationFor<UserPrompt>(API_ENDPOINTS.PROMPTS, 'prompts', currentFilter, dateBounds, userLabel);

  return {
    observations,
    summaries,
    prompts
  };
}
