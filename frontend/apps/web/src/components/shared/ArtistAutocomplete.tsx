'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export interface ArtistOption {
  id: number;
  name: string;
  type?: string;
  imageUrl?: string | null;
}

interface ArtistAutocompleteProps {
  value: ArtistOption | null;
  onChange: (artist: ArtistOption | null, rawText: string) => void;
  placeholder?: string;
  required?: boolean;
  label?: string;
  disabled?: boolean;
}

const functionsBaseUrl = [
  process.env.NEXT_PUBLIC_GCP_FUNCTIONS_BASE_URL
]
  .map((v) => (typeof v === 'string' ? v.trim() : ''))
  .find((v) => v.length > 0)?.replace(/\/$/, '') ?? '';

async function fetchArtists(query: string): Promise<ArtistOption[]> {
  if (!functionsBaseUrl || !query.trim()) return [];
  try {
    const url = `${functionsBaseUrl}/artists?q=${encodeURIComponent(query.trim())}&limit=10`;
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) return [];
    const data = (await res.json()) as { items?: ArtistOption[] };
    return Array.isArray(data.items) ? data.items : [];
  } catch {
    return [];
  }
}

export function ArtistAutocomplete({
  value,
  onChange,
  placeholder = 'Buscar artista...',
  required = false,
  label,
  disabled = false
}: ArtistAutocompleteProps) {
  const [inputText, setInputText] = useState(value?.name ?? '');
  const [suggestions, setSuggestions] = useState<ArtistOption[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (value) {
      setInputText(value.name);
    }
  }, [value]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleInputChange = useCallback((text: string) => {
    setInputText(text);
    onChange(null, text);

    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (!text.trim()) {
      setSuggestions([]);
      setShowDropdown(false);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      const results = await fetchArtists(text);
      setSuggestions(results);
      setShowDropdown(results.length > 0);
      setLoading(false);
    }, 300);
  }, [onChange]);

  const handleSelect = useCallback((artist: ArtistOption) => {
    setInputText(artist.name);
    onChange(artist, artist.name);
    setShowDropdown(false);
    setSuggestions([]);
  }, [onChange]);

  return (
    <div className="create-form-field artist-autocomplete" ref={containerRef} style={{ position: 'relative' }}>
      {label && <span>{label}</span>}
      <input
        type="text"
        value={inputText}
        onChange={(e) => handleInputChange(e.target.value)}
        onFocus={() => {
          if (suggestions.length > 0) setShowDropdown(true);
        }}
        placeholder={placeholder}
        required={required}
        disabled={disabled}
        autoComplete="off"
      />
      {loading && <span className="artist-autocomplete-loading">Buscando...</span>}
      {showDropdown && suggestions.length > 0 && (
        <ul className="artist-autocomplete-dropdown">
          {suggestions.map((artist) => (
            <li key={artist.id}>
              <button
                type="button"
                className="artist-autocomplete-option"
                onClick={() => handleSelect(artist)}
              >
                {artist.name}
                {artist.type && artist.type !== 'unknown' && (
                  <span className="artist-autocomplete-type">{artist.type}</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
      {!value && inputText.trim() && !showDropdown && !loading && (
        <span className="artist-autocomplete-hint">
          Se creará como nuevo artista si no existe.
        </span>
      )}
    </div>
  );
}
