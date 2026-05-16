import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocale } from '../hooks/useLocale';

interface DateFilterButtonProps {
  /** ISO YYYY-MM-DD (local) or null when no filter is active. */
  value: string | null;
  onChange: (value: string | null) => void;
}

function formatDateLabel(iso: string, locale: 'en' | 'zh'): string {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  if (locale === 'zh') return `${y}年${m}月${d}日`;
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function todayIso(): string {
  return daysAgoIso(0);
}

/**
 * Local-timezone YYYY-MM-DD for `daysAgo` days before today (0 = today,
 * 1 = yesterday, 2 = day-before-yesterday). Used both by the quick-shortcut
 * buttons and to preseed the date input so the user never sees the
 * confusing "yyyy/mm/dd" placeholder on a fresh open.
 */
function daysAgoIso(daysAgo: number): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - daysAgo);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// Wide enough that "Day before" / "Yesterday" / "Today" all fit on a single
// row at the standard 12px font; the previous 260px squeezed the longer
// English labels onto a second row.
const POPOVER_WIDTH = 360;

export function DateFilterButton({ value, onChange }: DateFilterButtonProps) {
  const { t, locale } = useLocale();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  // Fixed-position coordinates for the portal'd popover. Computed from the
  // button's getBoundingClientRect so the popover doesn't get clipped by a
  // parent's overflow/transform stacking context (the original `position:
  // absolute` variant was being painted under the feed).
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    if (!open || !buttonRef.current) return;
    const recompute = () => {
      if (!buttonRef.current) return;
      const r = buttonRef.current.getBoundingClientRect();
      // Right-align under the button, clamped so it doesn't hang off the
      // viewport edges.
      const left = Math.max(8, Math.min(window.innerWidth - POPOVER_WIDTH - 8, r.right - POPOVER_WIDTH));
      setPos({ top: r.bottom + 6, left });
    };
    recompute();
    window.addEventListener('resize', recompute);
    window.addEventListener('scroll', recompute, true);
    return () => {
      window.removeEventListener('resize', recompute);
      window.removeEventListener('scroll', recompute, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      const target = e.target as Node;
      // Portal'd popover lives outside containerRef, so check both anchors.
      if (containerRef.current?.contains(target)) return;
      if (popoverRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const handlePick = useCallback(
    (next: string) => {
      if (!next) return;
      onChange(next);
      setOpen(false);
    },
    [onChange]
  );

  const handleClear = useCallback(() => {
    onChange(null);
    setOpen(false);
  }, [onChange]);

  const label = value ? formatDateLabel(value, locale) : t('header.dateFilter');

  return (
    <div className="date-filter" ref={containerRef}>
      <button
        type="button"
        ref={buttonRef}
        className={`date-filter-btn${value ? ' is-active' : ''}`}
        onClick={() => setOpen((v) => !v)}
        title={value ? t('header.dateFilterClearTip') : t('header.dateFilterTip')}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <svg
          className="date-filter-icon"
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <rect x="3" y="4" width="18" height="18" rx="2" />
          <line x1="16" y1="2" x2="16" y2="6" />
          <line x1="8" y1="2" x2="8" y2="6" />
          <line x1="3" y1="10" x2="21" y2="10" />
        </svg>
        <span className="date-filter-label">{label}</span>
        {value && (
          <span
            className="date-filter-clear"
            role="button"
            aria-label={t('header.dateFilterClear')}
            title={t('header.dateFilterClear')}
            onClick={(e) => {
              e.stopPropagation();
              handleClear();
            }}
          >
            ✕
          </span>
        )}
      </button>

      {open && pos && createPortal(
        <div
          className="date-filter-popover"
          role="dialog"
          ref={popoverRef}
          style={{ position: 'fixed', top: pos.top, left: pos.left, width: POPOVER_WIDTH }}
        >
          {/* Pre-fill the input with today when no filter is committed yet,
              so the user never sees the browser's "yyyy/mm/dd" placeholder.
              The committed dateFilter is still `null` until the user
              actually picks (input onChange) or clicks a shortcut button. */}
          <input
            type="date"
            className="date-filter-input"
            value={value ?? todayIso()}
            max={todayIso()}
            autoFocus
            onChange={(e) => handlePick(e.target.value)}
          />
          {/* Row 1: three quick-pick day shortcuts in an equal-width grid so
              every label has the same room regardless of language. Row 2:
              the Clear button stretches full-width and only renders when a
              filter is committed — gives longer English labels ("Day before")
              real space instead of fighting a cramped 4-up flex row. */}
          <div className="date-filter-popover-actions">
            <div className="date-filter-quick-row">
              <button
                type="button"
                className="date-filter-quick-btn"
                onClick={() => handlePick(daysAgoIso(2))}
              >
                {t('header.dateFilterDayBefore')}
              </button>
              <button
                type="button"
                className="date-filter-quick-btn"
                onClick={() => handlePick(daysAgoIso(1))}
              >
                {t('header.dateFilterYesterday')}
              </button>
              <button
                type="button"
                className="date-filter-quick-btn"
                onClick={() => handlePick(todayIso())}
              >
                {t('header.dateFilterToday')}
              </button>
            </div>
            {value && (
              <button
                type="button"
                className="date-filter-quick-btn is-clear is-fullwidth"
                onClick={handleClear}
              >
                {t('header.dateFilterClear')}
              </button>
            )}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
