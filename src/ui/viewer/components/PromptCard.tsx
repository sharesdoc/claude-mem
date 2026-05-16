import React, { useEffect, useRef, useState } from 'react';
import { UserPrompt } from '../types';
import { formatDate } from '../utils/formatters';
import { useLocale } from '../hooks/useLocale';

interface PromptCardProps {
  prompt: UserPrompt;
}

const COPIED_DURATION_MS = 2000;

export function PromptCard({ prompt }: PromptCardProps) {
  const { t } = useLocale();
  const [copied, setCopied] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const date = formatDate(prompt.created_at_epoch);

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
      </div>
      <div className="card-content">
        {prompt.prompt_text}
      </div>
      <div className="card-meta prompt-meta">
        <span className="meta-date">
          #{prompt.id} • {date}
          {prompt.user_name && (
            <span className="meta-user" title="OS user">  {prompt.user_name}</span>
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
