"use client";

import { useState, useEffect, useRef } from 'react';

interface SourceSearchBarProps {
  content: string;
  onClose: () => void;
  onHighlightChange: (text: string | null, matchIndex: number) => void;
}

interface SearchMatch {
  index: number;
  text: string;
}

export default function SourceSearchBar({
  content,
  onClose,
  onHighlightChange
}: SourceSearchBarProps) {
  const [query, setQuery] = useState('');
  const [matches, setMatches] = useState<SearchMatch[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Search when query changes
  useEffect(() => {
    if (!query.trim()) {
      setMatches([]);
      setCurrentIndex(0);
      onHighlightChange(null, 0);
      return;
    }

    const searchQuery = query.toLowerCase();
    const contentLower = content.toLowerCase();
    const foundMatches: SearchMatch[] = [];

    let pos = 0;
    while (pos < contentLower.length) {
      const index = contentLower.indexOf(searchQuery, pos);
      if (index === -1) break;
      foundMatches.push({
        index,
        text: content.slice(index, index + query.length)
      });
      pos = index + 1;
    }

    setMatches(foundMatches);
    setCurrentIndex(0);

    if (foundMatches.length > 0) {
      onHighlightChange(foundMatches[0].text, 0);
    } else {
      onHighlightChange(null, 0);
    }
  }, [query, content, onHighlightChange]);

  // Update highlight when navigating
  useEffect(() => {
    if (matches.length > 0 && matches[currentIndex]) {
      onHighlightChange(matches[currentIndex].text, currentIndex);
    }
  }, [currentIndex, matches, onHighlightChange]);

  const goToNext = () => {
    if (matches.length === 0) return;
    setCurrentIndex((prev) => (prev + 1) % matches.length);
  };

  const goToPrev = () => {
    if (matches.length === 0) return;
    setCurrentIndex((prev) => (prev - 1 + matches.length) % matches.length);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (e.shiftKey) {
        goToPrev();
      } else {
        goToNext();
      }
    }
  };

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '12px',
      background: 'var(--bg-hover)',
      border: '1px solid var(--border-default)',
      borderRadius: '12px',
      padding: '10px 16px',
      margin: '8px 12px',
    }}>
      {/* Search icon */}
      <svg
        width="16"
        height="16"
        viewBox="0 0 20 20"
        fill="var(--text-secondary)"
        style={{ flexShrink: 0 }}
      >
        <path
          fillRule="evenodd"
          d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z"
          clipRule="evenodd"
        />
      </svg>

      {/* Input */}
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Search in source..."
        style={{
          flex: 1,
          background: 'none',
          border: 'none',
          outline: 'none',
          color: 'var(--text-primary)',
          fontSize: '14px',
          fontFamily: 'inherit',
        }}
      />

      {/* Match count */}
      {query && (
        <span style={{
          fontSize: '12px',
          color: matches.length > 0 ? 'var(--text-muted)' : 'var(--error)',
          whiteSpace: 'nowrap',
        }}>
          {matches.length > 0
            ? `${currentIndex + 1} of ${matches.length}`
            : 'No matches'
          }
        </span>
      )}

      {/* Navigation arrows */}
      {matches.length > 1 && (
        <div style={{ display: 'flex', gap: '4px' }}>
          <button
            onClick={goToPrev}
            title="Previous (Shift+Enter)"
            style={{
              background: 'var(--border-default)',
              border: 'none',
              borderRadius: '4px',
              padding: '4px 6px',
              cursor: 'pointer',
              color: 'var(--text-secondary)',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <svg width="12" height="12" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M14.77 12.79a.75.75 0 01-1.06-.02L10 8.832 6.29 12.77a.75.75 0 11-1.08-1.04l4.25-4.5a.75.75 0 011.08 0l4.25 4.5a.75.75 0 01-.02 1.06z" clipRule="evenodd" />
            </svg>
          </button>
          <button
            onClick={goToNext}
            title="Next (Enter)"
            style={{
              background: 'var(--border-default)',
              border: 'none',
              borderRadius: '4px',
              padding: '4px 6px',
              cursor: 'pointer',
              color: 'var(--text-secondary)',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <svg width="12" height="12" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
            </svg>
          </button>
        </div>
      )}

      {/* Close button */}
      <button
        onClick={onClose}
        title="Close (Esc)"
        style={{
          background: 'none',
          border: 'none',
          padding: '4px',
          cursor: 'pointer',
          color: 'var(--text-secondary)',
          display: 'flex',
          alignItems: 'center',
        }}
      >
        <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor">
          <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
        </svg>
      </button>

      {/* Keyboard hint */}
      <kbd style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2px 6px',
        background: 'var(--border-default)',
        borderRadius: '4px',
        fontSize: '10px',
        fontFamily: 'inherit',
        color: 'var(--text-secondary)',
        border: '1px solid var(--border-default)',
      }}>
        esc
      </kbd>
    </div>
  );
}
