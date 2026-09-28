import React from 'react';
import { Locale } from '../utils/i18n';

interface LocaleToggleProps {
  locale: Locale;
  onLocaleChange: (locale: Locale) => void;
  label?: string;
}

export function LocaleToggle({ locale, onLocaleChange, label }: LocaleToggleProps) {
  return (
    <div className="locale-toggle" role="group" aria-label={label ?? 'Language'}>
      <button
        type="button"
        className={`locale-toggle-btn${locale === 'en' ? ' is-active' : ''}`}
        onClick={() => onLocaleChange('en')}
        title="English"
      >
        EN
      </button>
      <button
        type="button"
        className={`locale-toggle-btn${locale === 'zh' ? ' is-active' : ''}`}
        onClick={() => onLocaleChange('zh')}
        title="中文"
      >
        中
      </button>
    </div>
  );
}
