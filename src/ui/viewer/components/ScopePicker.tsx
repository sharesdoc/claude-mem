import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocale } from '../hooks/useLocale';

/**
 * ScopePicker — the dated stats-scope buttons (day / week / month / quarter).
 *
 * Renders a trigger button whose label is the currently-selected period and,
 * on click, a compact popover anchored directly under the button (portal'd to
 * <body> so it never gets clipped by a parent's overflow). Picking a cell calls
 * onChange with a per-mode `anchor` string that the backend understands:
 *   day     → YYYY-MM-DD            week → YYYY-MM-DD (that ISO week's Monday)
 *   month   → YYYY-MM               quarter → YYYY-Q  (Q = 1..4)
 *
 * Future periods are disabled. Theming/i18n ride entirely on the shared
 * CSS tokens + useLocale, so dark/light + en/zh follow the rest of the app.
 */

export type ScopeMode = 'day' | 'week' | 'month' | 'quarter';

interface ScopePickerProps {
  mode: ScopeMode;
  /** Current anchor string for this mode (see per-mode formats above). */
  value: string;
  onChange: (anchor: string) => void;
  /** True when this mode is the page's active scope (drives is-active style). */
  active: boolean;
  /** Switch the page scope to this mode (called when the button is clicked). */
  onActivate: () => void;
}

const pad2 = (n: number) => String(n).padStart(2, '0');
const POP_WIDTH: Record<ScopeMode, number> = { day: 248, week: 300, month: 232, quarter: 208 };

/* ── date helpers (all in the viewer's local TZ) ─────────────────────────── */
function todayMidnight(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}
function ymd(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}
function mondayOf(d: Date): Date {
  const m = new Date(d);
  m.setHours(0, 0, 0, 0);
  const isoDow = (m.getDay() + 6) % 7; // Mon=0..Sun=6
  m.setDate(m.getDate() - isoDow);
  return m;
}
function daysInMonth(year: number, month0: number): number {
  return new Date(year, month0 + 1, 0).getDate();
}

/* ── ISO 8601 week math ──────────────────────────────────────────────────── */
/** {isoYear, week} for a date (week 1 = the week containing the first Thursday). */
function isoWeekOf(d: Date): { year: number; week: number } {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = (date.getUTCDay() + 6) % 7; // Mon=0
  date.setUTCDate(date.getUTCDate() - dayNum + 3); // nearest Thursday
  const firstThursday = new Date(Date.UTC(date.getUTCFullYear(), 0, 4));
  const ftDayNum = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - ftDayNum + 3);
  const week = 1 + Math.round((date.getTime() - firstThursday.getTime()) / (7 * 86400000));
  return { year: date.getUTCFullYear(), week };
}
/** Local Date of the Monday starting ISO `week` of `isoYear`. */
function mondayOfIsoWeek(isoYear: number, week: number): Date {
  const jan4 = new Date(isoYear, 0, 4);
  const jan4Dow = (jan4.getDay() + 6) % 7; // Mon=0
  const week1Monday = new Date(jan4);
  week1Monday.setDate(jan4.getDate() - jan4Dow);
  const monday = new Date(week1Monday);
  monday.setDate(week1Monday.getDate() + (week - 1) * 7);
  monday.setHours(0, 0, 0, 0);
  return monday;
}
/** 52 or 53 — number of ISO weeks in `year`. */
function isoWeeksInYear(year: number): number {
  const p = (y: number) => (y + Math.floor(y / 4) - Math.floor(y / 100) + Math.floor(y / 400)) % 7;
  return p(year) === 4 || p(year - 1) === 3 ? 53 : 52;
}

/* ── label shown on the trigger button ───────────────────────────────────── */
function buttonLabel(mode: ScopeMode, value: string): string {
  switch (mode) {
    case 'day':
      return value; // YYYY-MM-DD
    case 'week': {
      const [y, m, d] = value.split('-').map(Number);
      if (!y) return value;
      const iso = isoWeekOf(new Date(y, m - 1, d));
      return `${iso.year}-${pad2(iso.week)}`;
    }
    case 'month':
      return value; // YYYY-MM
    case 'quarter': {
      const [y, q] = value.split('-');
      return `${y}-Q${q}`;
    }
  }
}

export function ScopePicker({ mode, value, onChange, active, onActivate }: ScopePickerProps) {
  const { t, locale } = useLocale();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  // Navigation cursor for the popover grid. `month` is only used in day mode.
  const [nav, setNav] = useState<{ year: number; month: number }>(() => ({ year: 0, month: 0 }));

  const today = useMemo(() => todayMidnight(), []);
  const width = POP_WIDTH[mode];

  // Seed the nav cursor from the committed value each time the popover opens.
  const seedNav = useCallback(() => {
    if (mode === 'day' || mode === 'week') {
      const [y, m] = value.split('-').map(Number);
      setNav({ year: y || today.getFullYear(), month: (m || 1) - 1 });
    } else {
      const y = Number(value.split('-')[0]) || today.getFullYear();
      setNav({ year: y, month: 0 });
    }
  }, [mode, value, today]);

  const handleBtn = useCallback(() => {
    if (!active) { onActivate(); seedNav(); setOpen(true); return; }
    setOpen(prev => { if (!prev) seedNav(); return !prev; });
  }, [active, onActivate, seedNav]);

  useLayoutEffect(() => {
    if (!open || !buttonRef.current) return;
    const recompute = () => {
      if (!buttonRef.current) return;
      const r = buttonRef.current.getBoundingClientRect();
      const left = Math.max(8, Math.min(window.innerWidth - width - 8, r.left));
      setPos({ top: r.bottom + 6, left });
    };
    recompute();
    window.addEventListener('resize', recompute);
    window.addEventListener('scroll', recompute, true);
    return () => {
      window.removeEventListener('resize', recompute);
      window.removeEventListener('scroll', recompute, true);
    };
  }, [open, width]);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (containerRef.current?.contains(target)) return;
      if (popoverRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const pick = useCallback((anchor: string) => {
    onChange(anchor);
    setOpen(false);
  }, [onChange]);

  // Localized short names (inline arrays keep this component self-contained).
  const dow = locale === 'zh'
    ? ['一', '二', '三', '四', '五', '六', '日']
    : ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
  const monthNames = locale === 'zh'
    ? ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月']
    : ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const quarterRange = locale === 'zh'
    ? ['1–3月', '4–6月', '7–9月', '10–12月']
    : ['Jan–Mar', 'Apr–Jun', 'Jul–Sep', 'Oct–Dec'];

  /* ── popover body per mode ─────────────────────────────────────────────── */
  function renderHeader(title: string, onPrevYear: () => void, onNextYear: () => void,
    onPrevMonth?: () => void, onNextMonth?: () => void, nextDisabled?: boolean) {
    return (
      <div className="sp-head">
        <div className="sp-nav-group">
          <button type="button" className="sp-nav" onClick={onPrevYear} aria-label={t('stats.pickerPrevYear')}>«</button>
          {onPrevMonth && <button type="button" className="sp-nav" onClick={onPrevMonth} aria-label={t('stats.pickerPrevMonth')}>‹</button>}
        </div>
        <span className="sp-title">{title}</span>
        <div className="sp-nav-group">
          {onNextMonth && <button type="button" className="sp-nav" onClick={onNextMonth} disabled={nextDisabled} aria-label={t('stats.pickerNextMonth')}>›</button>}
          <button type="button" className="sp-nav" onClick={onNextYear} disabled={nextDisabled} aria-label={t('stats.pickerNextYear')}>»</button>
        </div>
      </div>
    );
  }

  function renderDay() {
    const { year, month } = nav;
    const first = new Date(year, month, 1);
    const lead = (first.getDay() + 6) % 7; // blanks before day 1 (Mon-based)
    const total = daysInMonth(year, month);
    const cells: React.ReactNode[] = [];
    for (let i = 0; i < lead; i++) cells.push(<span key={`b${i}`} className="sp-cell is-blank" />);
    for (let d = 1; d <= total; d++) {
      const date = new Date(year, month, d);
      const iso = ymd(date);
      const disabled = date.getTime() > today.getTime();
      const cls = `sp-cell${iso === value ? ' is-selected' : ''}${iso === ymd(today) ? ' is-today' : ''}${disabled ? ' is-disabled' : ''}`;
      cells.push(
        <button key={d} type="button" className={cls} disabled={disabled} onClick={() => pick(iso)}>{d}</button>
      );
    }
    const nextDisabled = year > today.getFullYear() || (year === today.getFullYear() && month >= today.getMonth());
    const step = (dy: number, dm: number) => {
      const nm = new Date(year, month + dm, 1); nm.setFullYear(nm.getFullYear() + dy);
      setNav({ year: nm.getFullYear(), month: nm.getMonth() });
    };
    return (
      <>
        {renderHeader(`${year}-${pad2(month + 1)}`,
          () => step(-1, 0), () => step(1, 0), () => step(0, -1), () => step(0, 1), nextDisabled)}
        <div className="sp-dow">{dow.map((w, i) => <span key={i}>{w}</span>)}</div>
        <div className="sp-grid sp-grid--day">{cells}</div>
      </>
    );
  }

  function renderWeek() {
    const { year } = nav;
    const count = isoWeeksInYear(year);
    const curIso = isoWeekOf(today);
    const selIso = (() => { const [y, m, d] = value.split('-').map(Number); return y ? isoWeekOf(new Date(y, m - 1, d)) : null; })();
    const cells: React.ReactNode[] = [];
    for (let w = 1; w <= count; w++) {
      const monday = mondayOfIsoWeek(year, w);
      const disabled = monday.getTime() > mondayOf(today).getTime();
      const isSel = !!selIso && selIso.year === year && selIso.week === w;
      const isCur = curIso.year === year && curIso.week === w;
      const cls = `sp-cell${isSel ? ' is-selected' : ''}${isCur ? ' is-today' : ''}${disabled ? ' is-disabled' : ''}`;
      cells.push(
        <button key={w} type="button" className={cls} disabled={disabled} onClick={() => pick(ymd(monday))}
          title={`${ymd(monday)}`}>{w}</button>
      );
    }
    const nextDisabled = year >= today.getFullYear();
    return (
      <>
        {renderHeader(`${year} · ${count}W`, () => setNav(n => ({ ...n, year: n.year - 1 })), () => setNav(n => ({ ...n, year: n.year + 1 })), undefined, undefined, nextDisabled)}
        <div className="sp-grid sp-grid--week">{cells}</div>
      </>
    );
  }

  function renderMonth() {
    const { year } = nav;
    const cells: React.ReactNode[] = [];
    for (let m = 1; m <= 12; m++) {
      const key = `${year}-${pad2(m)}`;
      const disabled = year > today.getFullYear() || (year === today.getFullYear() && m - 1 > today.getMonth());
      const isCur = year === today.getFullYear() && m - 1 === today.getMonth();
      const cls = `sp-cell sp-cell--wide${key === value ? ' is-selected' : ''}${isCur ? ' is-today' : ''}${disabled ? ' is-disabled' : ''}`;
      cells.push(
        <button key={m} type="button" className={cls} disabled={disabled} onClick={() => pick(key)}>{monthNames[m - 1]}</button>
      );
    }
    const nextDisabled = year >= today.getFullYear();
    return (
      <>
        {renderHeader(String(year), () => setNav(n => ({ ...n, year: n.year - 1 })), () => setNav(n => ({ ...n, year: n.year + 1 })), undefined, undefined, nextDisabled)}
        <div className="sp-grid sp-grid--month">{cells}</div>
      </>
    );
  }

  function renderQuarter() {
    const { year } = nav;
    const curQ = Math.floor(today.getMonth() / 3) + 1;
    const cells: React.ReactNode[] = [];
    for (let q = 1; q <= 4; q++) {
      const key = `${year}-${q}`;
      const disabled = year > today.getFullYear() || (year === today.getFullYear() && q > curQ);
      const isCur = year === today.getFullYear() && q === curQ;
      const cls = `sp-cell sp-cell--row${key === value ? ' is-selected' : ''}${isCur ? ' is-today' : ''}${disabled ? ' is-disabled' : ''}`;
      cells.push(
        <button key={q} type="button" className={cls} disabled={disabled} onClick={() => pick(key)}>
          <span className="sp-q-main">Q{q}</span>
          <span className="sp-q-sub">{quarterRange[q - 1]}</span>
        </button>
      );
    }
    const nextDisabled = year >= today.getFullYear();
    return (
      <>
        {renderHeader(String(year), () => setNav(n => ({ ...n, year: n.year - 1 })), () => setNav(n => ({ ...n, year: n.year + 1 })), undefined, undefined, nextDisabled)}
        <div className="sp-grid sp-grid--quarter">{cells}</div>
      </>
    );
  }

  return (
    <div className="scope-picker" ref={containerRef}>
      <button
        type="button"
        ref={buttonRef}
        className={`stats-tab scope-picker-btn${active ? ' is-active' : ''}`}
        onClick={handleBtn}
        title={t(`stats.scope_${mode}`)}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        {buttonLabel(mode, value)}
      </button>

      {open && pos && createPortal(
        <div
          className="scope-picker-pop"
          role="dialog"
          ref={popoverRef}
          style={{ position: 'fixed', top: pos.top, left: pos.left, width }}
        >
          {mode === 'day' && renderDay()}
          {mode === 'week' && renderWeek()}
          {mode === 'month' && renderMonth()}
          {mode === 'quarter' && renderQuarter()}
        </div>,
        document.body
      )}
    </div>
  );
}
