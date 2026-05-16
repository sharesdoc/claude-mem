import React from 'react';

export type ViewMode = 'all' | 'prompts';

interface ViewModeToggleProps {
  mode: ViewMode;
  onChange: (mode: ViewMode) => void;
  labels: { all: string; prompts: string };
}

export function ViewModeToggle({ mode, onChange, labels }: ViewModeToggleProps) {
  return (
    <div className="viewmode-toggle" role="group" aria-label={labels.all + ' / ' + labels.prompts}>
      <button
        type="button"
        className={`viewmode-toggle-btn${mode === 'all' ? ' is-active' : ''}`}
        onClick={() => onChange('all')}
        title={labels.all}
      >
        {labels.all}
      </button>
      <button
        type="button"
        className={`viewmode-toggle-btn${mode === 'prompts' ? ' is-active' : ''}`}
        onClick={() => onChange('prompts')}
        title={labels.prompts}
      >
        {labels.prompts}
      </button>
    </div>
  );
}
