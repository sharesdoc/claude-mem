import React, { useMemo, useRef, useEffect } from 'react';
import { Observation, Summary, UserPrompt, FeedItem } from '../types';
import { ObservationCard } from './ObservationCard';
import { SummaryCard } from './SummaryCard';
import { PromptCard } from './PromptCard';
import { ScrollToTop } from './ScrollToTop';
import { UI } from '../constants/ui';
import { useLocale } from '../hooks/useLocale';

/** Styles for the first-load-failed retry button (X-003). Uses the viewer's
 * CSS variables with hardcoded fallbacks for theme-agnostic rendering. */
const retryButtonStyle: React.CSSProperties = {
  padding: '6px 16px',
  background: 'var(--bg-accent, #21262d)',
  color: 'var(--fg, #c9d1d9)',
  border: '1px solid var(--border, #30363d)',
  borderRadius: '6px',
  cursor: 'pointer',
  fontSize: '14px'
};

interface FeedProps {
  observations: Observation[];
  summaries: Summary[];
  prompts: UserPrompt[];
  onLoadMore: () => void;
  onPromptDeleted?: (id: number) => void;
  isLoading: boolean;
  hasMore: boolean;
  /** Last load error; when set with no items, shows a retry affordance (X-003). */
  error?: Error | null;
  /** Manual retry callback; paired with `error` for the fallback button. */
  onRetry?: () => void;
}

export function Feed({ observations, summaries, prompts, onLoadMore, onPromptDeleted, isLoading, hasMore, error, onRetry }: FeedProps) {
  const { t } = useLocale();
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const feedRef = useRef<HTMLDivElement>(null);
  const onLoadMoreRef = useRef(onLoadMore);

  useEffect(() => {
    onLoadMoreRef.current = onLoadMore;
  }, [onLoadMore]);

  useEffect(() => {
    const element = loadMoreRef.current;
    if (!element) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const first = entries[0];
        if (first.isIntersecting && hasMore && !isLoading) {
          onLoadMoreRef.current?.();
        }
      },
      { threshold: UI.LOAD_MORE_THRESHOLD }
    );

    observer.observe(element);

    return () => {
      if (element) {
        observer.unobserve(element);
      }
      observer.disconnect();
    };
  }, [hasMore, isLoading]);

  const items = useMemo<FeedItem[]>(() => {
    const combined = [
      ...observations.map(o => ({ ...o, itemType: 'observation' as const })),
      ...summaries.map(s => ({ ...s, itemType: 'summary' as const })),
      ...prompts.map(p => ({ ...p, itemType: 'prompt' as const }))
    ];

    return combined.sort((a, b) => b.created_at_epoch - a.created_at_epoch);
  }, [observations, summaries, prompts]);

  return (
    <div className="feed" ref={feedRef}>
      <ScrollToTop targetRef={feedRef} />
      <div className="feed-content">
        {items.map(item => {
          const key = `${item.itemType}-${item.id}`;
          if (item.itemType === 'observation') {
            return <ObservationCard key={key} observation={item} />;
          } else if (item.itemType === 'summary') {
            return <SummaryCard key={key} summary={item} />;
          } else {
            return <PromptCard key={key} prompt={item} onDeleted={onPromptDeleted}  />;
          }
        })}
        {items.length === 0 && !isLoading && error && onRetry && (
          <div style={{ textAlign: 'center', padding: '40px', color: '#8b949e' }}>
            <div style={{ marginBottom: '12px' }}>{t('feed.loadFailed')}</div>
            <button type="button" onClick={onRetry} style={retryButtonStyle}>
              {t('feed.retry')}
            </button>
          </div>
        )}
        {items.length === 0 && !isLoading && !error && (
          <div style={{ textAlign: 'center', padding: '40px', color: '#8b949e' }}>
            {t('feed.empty')}
          </div>
        )}
        {isLoading && (
          <div style={{ textAlign: 'center', padding: '20px', color: '#8b949e' }}>
            <div className="spinner" style={{ display: 'inline-block', marginRight: '10px' }}></div>
            {t('feed.loading')}
          </div>
        )}
        {hasMore && !isLoading && items.length > 0 && (
          <div ref={loadMoreRef} style={{ height: '20px', margin: '10px 0' }} />
        )}
        {!hasMore && items.length > 0 && (
          <div style={{ textAlign: 'center', padding: '20px', color: '#8b949e', fontSize: '14px' }}>
            {t('feed.noMore')}
          </div>
        )}
      </div>
    </div>
  );
}
