'use client';

import { useId } from 'react';

interface CommandSearchProps {
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
}

export function CommandSearch({ placeholder, value, onChange, onSubmit }: CommandSearchProps) {
  const inputId = useId();

  return (
    <form className="command-search" aria-label="Buscar canciones" onSubmit={onSubmit}>
      <label className="sr-only" htmlFor={inputId}>
        {placeholder}
      </label>
      <span className="material-symbols-outlined action-icon" aria-hidden="true">search</span>
      <input
        id={inputId}
        className="search-input command-search-input"
        type="search"
        name="home-search"
        aria-label={placeholder}
        autoComplete="off"
        placeholder={placeholder}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </form>
  );
}
