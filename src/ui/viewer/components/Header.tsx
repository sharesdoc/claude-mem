import React from 'react';
import { ThemeToggle } from './ThemeToggle';
import { LocaleToggle } from './LocaleToggle';
import { ViewModeToggle, ViewMode } from './ViewModeToggle';
import { DateFilterButton } from './DateFilterButton';
import { UserSelector } from './UserSelector';
import { SyncStatusBadge } from './SyncStatusBadge';
import type { SyncStatus } from '../hooks/useSyncStatus';
import { ThemePreference } from '../hooks/useTheme';
import { GitHubStarsButton } from './GitHubStarsButton';
import { useSpinningFavicon } from '../hooks/useSpinningFavicon';
import { useLocale } from '../hooks/useLocale';
import { authFetch } from '../utils/api';
import type { UserRow } from '../hooks/useUsers';

interface HeaderProps {
  isConnected: boolean;
  projects: string[];
  currentFilter: string;
  onFilterChange: (filter: string) => void;
  isProcessing: boolean;
  queueDepth: number;
  themePreference: ThemePreference;
  onThemeChange: (theme: ThemePreference) => void;
  onContextPreviewToggle: () => void;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  /** Local-timezone YYYY-MM-DD, or null when no day-filter is active. */
  dateFilter: string | null;
  onDateFilterChange: (next: string | null) => void;
  /** Server-mode-only user picker. */
  showUserSelector: boolean;
  /** Deployment role for the logo title (client/server installs vs local-only). */
  deployment: 'client' | 'server' | 'standalone';
  users: UserRow[];
  userLabelFilter: string | null;
  onUserLabelFilterChange: (next: string | null) => void;
  syncStatus: SyncStatus | null;
  syncStatusReady: boolean;
  onShowHelp?: () => void;
  /** Server-mode logout callback. When provided, shows a sign-out button. */
  onLogout?: () => void;
  /** Stats mode toggle. */
  statsMode: boolean;
  onStatsToggle: () => void;
}

export function Header({
  isConnected,
  projects,
  currentFilter,
  onFilterChange,
  isProcessing,
  queueDepth,
  themePreference,
  onThemeChange,
  onContextPreviewToggle,
  viewMode,
  onViewModeChange,
  dateFilter,
  onDateFilterChange,
  showUserSelector,
  deployment,
  users,
  userLabelFilter,
  onUserLabelFilterChange,
  syncStatus,
  syncStatusReady,
  onShowHelp,
  onLogout,
  statsMode,
  onStatsToggle,
}: HeaderProps) {
  useSpinningFavicon(isProcessing);
  const { locale, setLocale, t } = useLocale();

  // Brand the title by how the node was installed: explicit --role client/
  // server installs identify themselves; a plain local-only install keeps
  // the generic year branding.
  const logoText =
    deployment === 'client' ? 'claude-mem client' :
    deployment === 'server' ? 'claude-mem server' :
    'claude-mem';

  // Sync browser tab title with deployment mode
  React.useEffect(() => {
    document.title = logoText;
  }, [logoText]);

  return (
    <div className="header">
      <div className="header-main">
        <h1>
          <div style={{ position: 'relative', display: 'inline-block' }}>
            <img src="claude-mem-logomark.webp" alt="" className={`logomark ${isProcessing ? 'spinning' : ''}`} />
            {queueDepth > 0 && (
              <div className="queue-bubble">
                {queueDepth}
              </div>
            )}
          </div>
          <span className="logo-text">{logoText}</span>
        </h1>
      </div>
      <div className="status">
        <SyncStatusBadge status={syncStatus} ready={syncStatusReady} />
        {deployment === 'client' && (
          <button type="button" className="sync-force-btn"
            onClick={async () => {
              const b = document.querySelector('.sync-force-btn');
              if (b) b.textContent = '⋯';
              try {
                const r = await authFetch('/api/sync/trigger', { method: 'POST' });
                const d = await r.json();
                if (d.ok) alert(`${t('sync.triggerOk')}\n${JSON.stringify(d.status?.lag ?? {}, null, 0)}`);
                else alert(`${t('sync.triggerFail')}: ${d.error || r.statusText}`);
              } catch (e: unknown) { alert(`${t('sync.triggerFail')}: ${(e as Error).message || String(e)}`); }
              if (b) b.textContent = '↻';
            }}
            title={t('sync.triggerTip')}
          >↻</button>
        )}
        {showUserSelector && (
          <UserSelector
            users={users}
            value={userLabelFilter}
            onChange={onUserLabelFilterChange}
          />
        )}
        <DateFilterButton value={dateFilter} onChange={onDateFilterChange} />
        <ViewModeToggle
          mode={viewMode}
          onChange={onViewModeChange}
          labels={{ all: t('header.viewAll'), prompts: t('header.viewPrompts') }}
        />
        <button
          type="button"
          className={`settings-btn${statsMode ? ' active' : ''}`}
          onClick={onStatsToggle}
          title={t('header.statsTitle')}
          aria-label={t('header.stats')}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="20" x2="18" y2="10"></line>
            <line x1="12" y1="20" x2="12" y2="4"></line>
            <line x1="6" y1="20" x2="6" y2="14"></line>
          </svg>
        </button>
        <a
          href="https://docs.claude-mem.ai"
          target="_blank"
          rel="noopener noreferrer"
          className="icon-link"
          title={t('header.docs')}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path>
            <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>
          </svg>
        </a>
        <a
          href="https://x.com/Claude_Memory"
          target="_blank"
          rel="noopener noreferrer"
          className="icon-link"
          title={t('header.followX')}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
            <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
          </svg>
        </a>
        <a
          href="https://discord.gg/J4wttp9vDu"
          target="_blank"
          rel="noopener noreferrer"
          className="icon-link"
          title={t('header.discord')}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
            <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515a.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0a12.64 12.64 0 0 0-.617-1.25a.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057a19.9 19.9 0 0 0 5.993 3.03a.078.078 0 0 0 .084-.028a14.09 14.09 0 0 0 1.226-1.994a.076.076 0 0 0-.041-.106a13.107 13.107 0 0 1-1.872-.892a.077.077 0 0 1-.008-.128a10.2 10.2 0 0 0 .372-.292a.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127a12.299 12.299 0 0 1-1.873.892a.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028a19.839 19.839 0 0 0 6.002-3.03a.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419c0-1.333.956-2.419 2.157-2.419c1.21 0 2.176 1.096 2.157 2.42c0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419c0-1.333.955-2.419 2.157-2.419c1.21 0 2.176 1.096 2.157 2.42c0 1.333-.946 2.418-2.157 2.418z"/>
          </svg>
        </a>
        <GitHubStarsButton username="thedotmack" repo="claude-mem" />
        <select
          value={currentFilter}
          onChange={e => onFilterChange(e.target.value)}
          style={{ maxWidth: '360px' }}
        >
          <option value="">{t('header.allProjects')}</option>
          {projects.map(project => (
            <option key={project} value={project} title={project}>{project}</option>
          ))}
        </select>
        <ThemeToggle
          preference={themePreference}
          onThemeChange={onThemeChange}
        />
        <LocaleToggle
          locale={locale}
          onLocaleChange={setLocale}
          label={t('header.languageLabel')}
        />
        <button
          className="settings-btn"
          onClick={() => onShowHelp?.()}
          title={t('header.showWelcome')}
          aria-label={t('header.showWelcome')}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"></circle>
            <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path>
            <line x1="12" y1="17" x2="12.01" y2="17"></line>
          </svg>
        </button>
        {onLogout && (
          <button
            className="settings-btn"
            onClick={onLogout}
            title="Sign out"
            aria-label="Sign out"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
              <polyline points="16 17 21 12 16 7"></polyline>
              <line x1="21" y1="12" x2="9" y2="12"></line>
            </svg>
          </button>
        )}
        <button
          className="settings-btn"
          onClick={onContextPreviewToggle}
          title={t('header.settings')}
        >
          <svg className="settings-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"></path>
            <circle cx="12" cy="12" r="3"></circle>
          </svg>
        </button>
      </div>
    </div>
  );
}
