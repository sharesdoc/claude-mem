import React, { useEffect, useRef, useState } from 'react';
import { UserPrompt } from '../types';
import { formatDate } from '../utils/formatters';
import { authFetch } from '../utils/api';
import { useLocale } from '../hooks/useLocale';

interface PromptCardProps {
  prompt: UserPrompt;
  /** Called with the prompt id after it is deleted from the database. */
  onDeleted?: (id: number) => void;
  /** When true and prompt has completed_at_epoch, show processing time + duration. */
  showProcessingTime?: boolean;
}

const COPIED_DURATION_MS = 2000;

export function PromptCard({ prompt, onDeleted, showProcessingTime }: PromptCardProps) {
  const { t } = useLocale();
  const [copied, setCopied] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const date = formatDate(prompt.created_at_epoch);

  const processingInfo = (showProcessingTime && prompt.completed_at_epoch)
    ? (() => {
        const thinkMs = prompt.think_time_ms ?? 0;
        const durationMs = prompt.completed_at_epoch - prompt.created_at_epoch + thinkMs;
        const completedDate = formatDate(prompt.completed_at_epoch);
        const mins = Math.floor(durationMs / 60000);
        const secs = Math.round((durationMs % 60000) / 1000);
        const duration = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
        // Human think time (separate from AI processing)
        const thinkMins = thinkMs > 0 ? Math.floor(thinkMs / 60000) : 0;
        const thinkSecs = thinkMs > 0 ? Math.round((thinkMs % 60000) / 1000) : 0;
        const thinkStr = thinkMins > 0 ? `${thinkMins}m ${thinkSecs}s` : (thinkSecs > 0 ? `${thinkSecs}s` : '');
        return { completedDate, duration, thinkStr };
      })()
    : null;

  const handleDelete = async () => {
    if (deleting) return;
    setDeleting(true);
    try {
      const res = await authFetch(`/api/prompt/${prompt.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      // SSE prunes live state for all clients; this callback drops the row
      // from the paginated buffer on the originating client.
      onDeleted?.(prompt.id);
    } catch (err) {
      console.warn('Failed to delete prompt:', err);
      setDeleting(false);
    }
  };

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  const handleCopy = async () => {
    if (copied) return;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(prompt.prompt_text);
      } else {
        // Fallback for non-secure contexts where Clipboard API isn't exposed.
        const ta = document.createElement('textarea');
        ta.value = prompt.prompt_text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
    } catch (err) {
      console.warn('Failed to copy prompt:', err);
    }
    setCopied(true);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => setCopied(false), COPIED_DURATION_MS);
  };

  return (
    <div className="card prompt-card">
      <div className="card-header">
        <div className="card-header-left">
          <span className="card-type">{t('prompt.title')}</span>
          <span className={`card-source source-${prompt.platform_source || 'claude'}`}>
            {prompt.platform_source || 'claude'}
          </span>
          <span className="card-project">{prompt.project}</span>
        </div>
        <button
          type="button"
          className="prompt-delete-btn"
          onClick={handleDelete}
          disabled={deleting}
          title={t('prompt.delete')}
          aria-label={t('prompt.delete')}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polyline points="3 6 5 6 21 6"></polyline>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            <line x1="10" y1="11" x2="10" y2="17"></line>
            <line x1="14" y1="11" x2="14" y2="17"></line>
          </svg>
        </button>
      </div>
      <div className="card-content">
        {prompt.prompt_text}
      </div>
      <div className="card-meta prompt-meta">
        <span className="meta-date">
          #{prompt.id} • {date}
          {processingInfo && (
            <span className="meta-processing-time" title={`AI 处理完成: ${processingInfo.completedDate}${processingInfo.thinkStr ? ' · 人处理: ' + processingInfo.thinkStr : ''}`}>
              {' · '}⏱ {processingInfo.duration}{processingInfo.thinkStr && ` + ${processingInfo.thinkStr}`}
            </span>
          )}
          {prompt.user_label ? (
            <>
              <span className="meta-user-label" title={t('card.userLabelTip')}>  {prompt.user_label}</span>
              {prompt.user_name && prompt.user_name !== prompt.user_label && (
                <span className="meta-user" title={t('card.userNameTip')}>  {prompt.user_name}</span>
              )}
            </>
          ) : (
            prompt.user_name && (
              <span className="meta-user" title={t('card.userNameTip')}>  {prompt.user_name}</span>
            )
          )}
        </span>
        {copied && (
          <span className="prompt-meta-copied" role="status" aria-live="polite">
            {t('prompt.copiedMsg')}
          </span>
        )}
        <button
          type="button"
          className={`prompt-copy-btn${copied ? ' is-copied' : ''}`}
          onClick={handleCopy}
          disabled={copied}
          title={copied ? t('prompt.copied') : t('prompt.copy')}
          aria-label={copied ? t('prompt.copied') : t('prompt.copy')}
        >
          {copied ? (
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
          ) : (
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
            </svg>
          )}
        </button>
      </div>
    </div>
  );
}
