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

/* ── ISO 8601 week math ──────────────────────────────────────────────────────
 * ISO 8601 weeks start on Monday, and week 1 is defined as the week that
 * contains the year's first Thursday (equivalently, the week containing Jan 4).
 * A consequence is that early-January and late-December days can belong to a
 * DIFFERENT year's week numbering than their calendar year — e.g. 2025-12-29
 * (a Monday) is ISO week 1 of 2026. All three helpers below are built on the
 * classic "shift to the nearest Thursday" trick, computed in UTC so that the
 * viewer's local DST transitions can never shift a date across a day boundary.
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * Return the ISO week-numbering {year, week} that the given date falls in.
 * Algorithm: move the date to the Thursday of its own ISO week, then count how
 * many whole weeks separate that Thursday from the first Thursday of its year.
 * Because we land on the Thursday first, `getUTCFullYear()` already yields the
 * correct ISO *week-year* (which may differ from the input's calendar year).
 */
function isoWeekOf(d: Date): { year: number; week: number } {
  // Work in UTC on a date-only value so time-of-day / DST can't shift the day.
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = (date.getUTCDay() + 6) % 7;            // remap Sun..Sat(0..6) → Mon..Sun(0..6)
  date.setUTCDate(date.getUTCDate() - dayNum + 3);      // jump to this week's Thursday
  // First Thursday of the (now resolved) ISO year = the Thursday of the week
  // that contains Jan 4 (Jan 4 is always in ISO week 1, by definition).
  const firstThursday = new Date(Date.UTC(date.getUTCFullYear(), 0, 4));
  const ftDayNum = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - ftDayNum + 3);
  // Whole weeks between the two Thursdays, +1 because week 1 itself counts.
  const week = 1 + Math.round((date.getTime() - firstThursday.getTime()) / (7 * 86400000));
  return { year: date.getUTCFullYear(), week };
}

/**
 * Inverse of isoWeekOf for the week start: the local Date of the Monday that
 * begins ISO `week` of `isoYear`. Used to turn a picked week-number back into
 * the concrete Monday anchor (YYYY-MM-DD) the backend windows on.
 * Anchored on Jan 4 (always week 1): step back to that week's Monday, then add
 * (week-1) whole weeks. May land in the previous calendar year (e.g. W1 → Dec).
 */
function mondayOfIsoWeek(isoYear: number, week: number): Date {
  const jan4 = new Date(isoYear, 0, 4);
  const jan4Dow = (jan4.getDay() + 6) % 7;             // Mon=0
  const week1Monday = new Date(jan4);
  week1Monday.setDate(jan4.getDate() - jan4Dow);       // Monday of ISO week 1
  const monday = new Date(week1Monday);
  monday.setDate(week1Monday.getDate() + (week - 1) * 7);
  monday.setHours(0, 0, 0, 0);
  return monday;
}

/**
 * Number of ISO weeks in `year` — 53 for "long" years, otherwise 52. A year is
 * long iff its first day is a Thursday, or it's a leap year whose first day is a
 * Wednesday. The `p(y)` helper returns the weekday index (mod 7) of Dec 31 via
 * Gauss's congruence, which encodes exactly those two conditions as p===4 (this
 * year) or p(year-1)===3 (the prior year ended on a Wednesday → leap-Wed case).
 * Drives the week grid's cell count (e.g. 2026 has 53 weeks, 2025 has 52).
 */
function isoWeeksInYear(year: number): number {
  const p = (y: number) => (y + Math.floor(y / 4) - Math.floor(y / 100) + Math.floor(y / 400)) % 7;
  return p(year) === 4 || p(year - 1) === 3 ? 53 : 52;
}

/* ── label shown on the trigger button ───────────────────────────────────────
 * Converts the stored anchor into the human-facing label. day/month are already
 * in display form; week stores a Monday DATE but shows the ISO `YYYY-WW` it maps
 * to; quarter stores `YYYY-Q` (Q=1..4) but shows `YYYY-QN`.
 * ──────────────────────────────────────────────────────────────────────────── */
/** Short descriptive prefix shown before the value (日/周/月/季 · D/W/M/Q). */
function labelPrefix(mode: ScopeMode, locale: 'en' | 'zh'): string {
  const zh: Record<ScopeMode, string> = { day: '日', week: '周', month: '月', quarter: '季' };
  const en: Record<ScopeMode, string> = { day: 'D', week: 'W', month: 'M', quarter: 'Q' };
  return (locale === 'zh' ? zh : en)[mode];
}

function buttonLabel(mode: ScopeMode, value: string): string {
  switch (mode) {
    case 'day':
      return value; // YYYY-MM-DD — shown as-is
    case 'week': {
      // value is the week's Monday (YYYY-MM-DD); render the ISO week it belongs
      // to. Going through isoWeekOf (not the calendar year) keeps the label right
      // for boundary weeks, e.g. Monday 2025-12-29 → "2026-01".
      const [y, m, d] = value.split('-').map(Number);
      if (!y) return value;
      const iso = isoWeekOf(new Date(y, m - 1, d));
      return `${iso.year}-${pad2(iso.week)}`;
    }
    case 'month':
      return value; // YYYY-MM — shown as-is
    case 'quarter': {
      const [y, q] = value.split('-');
      return `${y}-Q${q}`; // YYYY-Q → "YYYY-QN"
    }
  }
}

export function ScopePicker({ mode, value, onChange, active, onActivate }: ScopePickerProps) {
  const { t, locale } = useLocale();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);   // trigger wrapper (for outside-click test)
  const buttonRef = useRef<HTMLButtonElement | null>(null);   // trigger button (for popover anchoring)
  const popoverRef = useRef<HTMLDivElement | null>(null);     // portal'd popover (for outside-click test)
  // Fixed-position coords for the portal'd popover; null until first measured.
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  // Which year/month the popover grid is currently showing. Independent of the
  // committed `value` so the user can browse other periods without selecting;
  // `month` is only meaningful in day mode (year-based modes ignore it).
  const [nav, setNav] = useState<{ year: number; month: number }>(() => ({ year: 0, month: 0 }));

  const today = useMemo(() => todayMidnight(), []);            // local midnight, stable for the mount
  const width = POP_WIDTH[mode];                              // per-mode popover width

  // Seed the nav cursor from the committed value each time the popover opens.
  const seedNav = useCallback(() => {
    if (mode === 'day') {
      const [y, m] = value.split('-').map(Number);
      setNav({ year: y || today.getFullYear(), month: (m || 1) - 1 });
    } else if (mode === 'week') {
      // Open on the selected week's ISO year, NOT the Monday's calendar year —
      // they differ at boundaries (e.g. 2025-12-29 is ISO 2026-W01), and using
      // the calendar year would show the wrong grid with no highlight.
      const [y, m, d] = value.split('-').map(Number);
      const iso = y ? isoWeekOf(new Date(y, m - 1, d)) : { year: today.getFullYear(), week: 1 };
      setNav({ year: iso.year, month: 0 });
    } else {
      const y = Number(value.split('-')[0]) || today.getFullYear();
      setNav({ year: y, month: 0 });
    }
  }, [mode, value, today]);

  // Trigger-button click. Two cases:
  //  • not the active scope → only switch the page to this scope (highlight it);
  //    do NOT open the popover. The user must click again, on the now-active
  //    button, to reveal the picker.
  //  • already active → toggle the popover open/closed.
  // seedNav runs on every open so the grid starts on the committed value.
  const handleBtn = useCallback(() => {
    if (!active) { onActivate(); return; }
    setOpen(prev => { if (!prev) seedNav(); return !prev; });
  }, [active, onActivate, seedNav]);

  // Position the portal'd popover just under the trigger button. The popover is
  // rendered into <body> (not inline) so a parent's overflow/transform can't clip
  // it, which means we must compute fixed coords ourselves from the button rect.
  // left is clamped to [8, viewportWidth-width-8] so it never hangs off either
  // edge on narrow screens; recomputed on scroll/resize to track the button.
  useLayoutEffect(() => {
    if (!open || !buttonRef.current) return;
    const recompute = () => {
      if (!buttonRef.current) return;
      const r = buttonRef.current.getBoundingClientRect();
      const left = Math.max(8, Math.min(window.innerWidth - width - 8, r.left));
      setPos({ top: r.bottom + 6, left });   // 6px gap below the button
    };
    recompute();
    window.addEventListener('resize', recompute);
    window.addEventListener('scroll', recompute, true);   // capture: catch scrolls in any ancestor
    return () => {
      window.removeEventListener('resize', recompute);
      window.removeEventListener('scroll', recompute, true);
    };
  }, [open, width]);

  // Dismiss on outside mousedown or Escape. The popover lives outside
  // containerRef (it's portal'd), so an outside click is one that hits neither
  // the trigger wrapper nor the popover itself.
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
    onPrevMonth?: () => void, onNextMonth?: () => void, nextMonthDisabled?: boolean, nextYearDisabled?: boolean) {
    return (
      <div className="sp-head">
        <div className="sp-nav-group">
          <button type="button" className="sp-nav" onClick={onPrevYear} aria-label={t('stats.pickerPrevYear')}>«</button>
          {onPrevMonth && <button type="button" className="sp-nav" onClick={onPrevMonth} aria-label={t('stats.pickerPrevMonth')}>‹</button>}
        </div>
        <span className="sp-title">{title}</span>
        <div className="sp-nav-group">
          {onNextMonth && <button type="button" className="sp-nav" onClick={onNextMonth} disabled={nextMonthDisabled} aria-label={t('stats.pickerNextMonth')}>›</button>}
          <button type="button" className="sp-nav" onClick={onNextYear} disabled={nextYearDisabled} aria-label={t('stats.pickerNextYear')}>»</button>
        </div>
      </div>
    );
  }

  /**
   * Day mode: a Monday-first month calendar for nav.{year,month}. Renders
   * `lead` empty cells so day 1 lands under its real weekday column, then one
   * button per day. Future days are disabled; the committed value gets
   * is-selected and the real today gets is-today (both may apply at once).
   */
  function renderDay() {
    const { year, month } = nav;
    const first = new Date(year, month, 1);
    // Weekday of the 1st remapped to Monday=0..Sunday=6, i.e. how many blank
    // leading cells are needed before day 1 in a Monday-first grid.
    const lead = (first.getDay() + 6) % 7;
    const total = daysInMonth(year, month);
    const cells: React.ReactNode[] = [];
    for (let i = 0; i < lead; i++) cells.push(<span key={`b${i}`} className="sp-cell is-blank" />);
    for (let d = 1; d <= total; d++) {
      const date = new Date(year, month, d);
      const iso = ymd(date);                                   // YYYY-MM-DD anchor for this day
      const disabled = date.getTime() > today.getTime();       // no future days
      const cls = `sp-cell${iso === value ? ' is-selected' : ''}${iso === ymd(today) ? ' is-today' : ''}${disabled ? ' is-disabled' : ''}`;
      cells.push(
        <button key={d} type="button" className={cls} disabled={disabled} onClick={() => pick(iso)}>{d}</button>
      );
    }
    // Next-month and next-year arrows disable independently: from a past month
    // in the current year, → (next month) stays enabled but » (next year) must
    // be blocked so it can't jump to a fully-future year.
    const ty = today.getFullYear(), tm = today.getMonth();
    const nextMonthDisabled = year > ty || (year === ty && month >= tm);
    const nextYearDisabled = year >= ty;
    const step = (dy: number, dm: number) => {
      const nm = new Date(year, month + dm, 1); nm.setFullYear(nm.getFullYear() + dy);
      setNav({ year: nm.getFullYear(), month: nm.getMonth() });
    };
    return (
      <>
        {renderHeader(`${year}-${pad2(month + 1)}`,
          () => step(-1, 0), () => step(1, 0), () => step(0, -1), () => step(0, 1), nextMonthDisabled, nextYearDisabled)}
        <div className="sp-dow">{dow.map((w, i) => <span key={i}>{w}</span>)}</div>
        <div className="sp-grid sp-grid--day">{cells}</div>
      </>
    );
  }

  /**
   * Week mode: one cell per ISO week (1..52/53) of nav.year, laid out 7-per-row.
   * Each cell carries the week NUMBER as its label but commits the week's Monday
   * date (ymd(monday)) as the anchor — the backend windows on that Monday, while
   * the trigger button re-derives the ISO label from it. Selection/current are
   * compared on the full {year,week} pair so the highlight is correct even at the
   * year boundary where a week's Monday lives in the adjacent calendar year.
   */
  function renderWeek() {
    const { year } = nav;
    const count = isoWeeksInYear(year);
    const curIso = isoWeekOf(today);                              // {year,week} of the real current week
    // ISO {year,week} of the committed anchor (its Monday date), or null if unset.
    const selIso = (() => { const [y, m, d] = value.split('-').map(Number); return y ? isoWeekOf(new Date(y, m - 1, d)) : null; })();
    const cells: React.ReactNode[] = [];
    for (let w = 1; w <= count; w++) {
      const monday = mondayOfIsoWeek(year, w);
      const disabled = monday.getTime() > mondayOf(today).getTime();  // weeks beyond the current week
      const isSel = !!selIso && selIso.year === year && selIso.week === w;
      const isCur = curIso.year === year && curIso.week === w;
      const cls = `sp-cell${isSel ? ' is-selected' : ''}${isCur ? ' is-today' : ''}${disabled ? ' is-disabled' : ''}`;
      cells.push(
        <button key={w} type="button" className={cls} disabled={disabled} onClick={() => pick(ymd(monday))}
          title={`${ymd(monday)}`}>{w}</button>          // hover shows the concrete Monday date
      );
    }
    const nextDisabled = year >= today.getFullYear();
    return (
      <>
        {renderHeader(`${year} · ${count}W`, () => setNav(n => ({ ...n, year: n.year - 1 })), () => setNav(n => ({ ...n, year: n.year + 1 })), undefined, undefined, undefined, nextDisabled)}
        <div className="sp-grid sp-grid--week">{cells}</div>
      </>
    );
  }

  /**
   * Month mode: the 12 months of nav.year in a 3-per-row grid. Anchor is
   * `YYYY-MM`; months after the current one (in the current year) are disabled.
   */
  function renderMonth() {
    const { year } = nav;
    const cells: React.ReactNode[] = [];
    for (let m = 1; m <= 12; m++) {
      const key = `${year}-${pad2(m)}`;                        // YYYY-MM anchor
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
        {renderHeader(String(year), () => setNav(n => ({ ...n, year: n.year - 1 })), () => setNav(n => ({ ...n, year: n.year + 1 })), undefined, undefined, undefined, nextDisabled)}
        <div className="sp-grid sp-grid--month">{cells}</div>
      </>
    );
  }

  /**
   * Quarter mode: Q1..Q4 of nav.year stacked one per row, each showing its month
   * range as a subtitle. Anchor is `YYYY-Q` (Q=1..4); quarters after the current
   * one (in the current year) are disabled.
   */
  function renderQuarter() {
    const { year } = nav;
    const curQ = Math.floor(today.getMonth() / 3) + 1;         // 1..4 for the current month
    const cells: React.ReactNode[] = [];
    for (let q = 1; q <= 4; q++) {
      const key = `${year}-${q}`;                              // YYYY-Q anchor
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
        {renderHeader(String(year), () => setNav(n => ({ ...n, year: n.year - 1 })), () => setNav(n => ({ ...n, year: n.year + 1 })), undefined, undefined, undefined, nextDisabled)}
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
        {labelPrefix(mode, locale)} {buttonLabel(mode, value)}
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
