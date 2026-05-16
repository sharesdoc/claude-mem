import React from 'react';
import { useLocale } from '../hooks/useLocale';
import type { UserRow } from '../hooks/useUsers';

interface UserSelectorProps {
  users: UserRow[];
  value: string | null;
  onChange: (next: string | null) => void;
}

/**
 * T-21 — server-mode employee picker.
 *
 * Renders only when the parent has decided the worker is in server mode
 * (App.tsx gates on /api/admin/role). Empty selection = "all users",
 * which we represent on the wire as an absent query param so the server
 * uses its existing unfiltered fast path.
 */
export function UserSelector({ users, value, onChange }: UserSelectorProps) {
  const { t } = useLocale();
  const selectValue = value ?? '__all__';

  return (
    <label className="user-selector" title={t('user.selectorTip')}>
      <span className="user-selector-label">{t('user.selectorLabel')}</span>
      <select
        className="user-selector-select"
        value={selectValue}
        onChange={(e) => {
          const next = e.target.value === '__all__' ? null : e.target.value;
          onChange(next);
        }}
      >
        <option value="__all__">{t('user.all')}</option>
        {users.map((u) => (
          <option key={u.user_label} value={u.user_label}>
            {u.user_label} · {u.sessions}
          </option>
        ))}
      </select>
    </label>
  );
}
