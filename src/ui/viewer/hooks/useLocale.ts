import { useCallback, useEffect, useState } from 'react';
import { Locale, getStoredLocale, setStoredLocale, translate } from '../utils/i18n';

const LOCALE_EVENT = 'claude-mem.locale-changed';

export interface UseLocaleResult {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
}

export function useLocale(): UseLocaleResult {
  const [locale, setLocaleState] = useState<Locale>(() => getStoredLocale());

  // Cross-component sync: when one component flips the locale, all subscribers
  // re-render. Use a window event since this state lives in localStorage anyway.
  useEffect(() => {
    const onChange = (e: Event) => {
      const detail = (e as CustomEvent<Locale>).detail;
      if (detail && detail !== locale) setLocaleState(detail);
    };
    window.addEventListener(LOCALE_EVENT, onChange);
    return () => window.removeEventListener(LOCALE_EVENT, onChange);
  }, [locale]);

  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.lang = locale === 'zh' ? 'zh-CN' : 'en';
    }
  }, [locale]);

  const setLocale = useCallback((next: Locale) => {
    setStoredLocale(next);
    setLocaleState(next);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent<Locale>(LOCALE_EVENT, { detail: next }));
    }
  }, []);

  const t = useCallback(
    (key: string, vars?: Record<string, string | number>) => translate(locale, key, vars),
    [locale]
  );

  return { locale, setLocale, t };
}
