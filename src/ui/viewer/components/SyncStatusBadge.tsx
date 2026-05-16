import React from 'react';
import { useLocale } from '../hooks/useLocale';
import type { SyncStatus } from '../hooks/useSyncStatus';

interface Props {
  status: SyncStatus | null;
  ready: boolean;
}

/**
 * T-25 — header chip summarising client-side SyncAgent health.
 *
 * Visibility rules:
 *   - server mode -> hidden (the viewer is the destination, not pusher)
 *   - sync disabled -> "disabled" pill, low-contrast
 *   - consecutive_failures >= 3 -> red "error"
 *   - lag.total > 0 -> amber "{n} pending"
 *   - otherwise -> green "up to date"
 */
export function SyncStatusBadge({ status, ready }: Props) {
  const { t } = useLocale();

  if (!ready) return null;
  if (!status) return null;
  if (status.role === 'server') return null;

  if (!status.sync_enabled || !status.upstream) {
    return (
      <span className="sync-badge sync-badge-disabled" title={t('sync.statusDisabled')}>
        <span className="sync-badge-dot" />
        {t('sync.statusDisabled')}
      </span>
    );
  }

  if (status.consecutive_failures >= 3) {
    return (
      <span
        className="sync-badge sync-badge-error"
        title={[status.last_error ?? '', status.upstream].filter(Boolean).join(' · ')}
      >
        <span className="sync-badge-dot" />
        {t('sync.statusError')}
      </span>
    );
  }

  if (status.lag.total > 0) {
    return (
      <span className="sync-badge sync-badge-pending" title={status.upstream}>
        <span className="sync-badge-dot" />
        {t('sync.statusBehind', { n: String(status.lag.total) })}
      </span>
    );
  }

  return (
    <span className="sync-badge sync-badge-ok" title={status.upstream}>
      <span className="sync-badge-dot" />
      {t('sync.statusOk')}
    </span>
  );
}
