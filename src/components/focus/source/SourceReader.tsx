"use client";

import { useMemo, useState, useEffect, useCallback, useRef } from 'react';
import { detectContentType, getContentTypeLabel } from './ContentDetector';
import RawFormatter from './formatters/RawFormatter';
import TranscriptFormatter from './formatters/TranscriptFormatter';
import BookFormatter from './formatters/BookFormatter';
import MarkdownFormatter from './formatters/MarkdownFormatter';
import SourceSearchBar from './SourceSearchBar';

interface SourceReaderProps {
  content: string;
  onTextSelect?: (text: string) => void;
  highlightedText?: string | null;
}

/**
 * Source Reader - Read-only formatted view of source content
 *
 * This is a pure presentation component that NEVER modifies the source data.
 * It detects content type and applies appropriate formatting for comfortable reading.
 */
export default function SourceReader({
  content,
  onTextSelect,
  highlightedText,
}: SourceReaderProps) {
  const [showSearch, setShowSearch] = useState(false);
  const [searchHighlight, setSearchHighlight] = useState<string | null>(null);
  const [searchMatchIndex, setSearchMatchIndex] = useState(0);
  const [scrollTrigger, setScrollTrigger] = useState(0);
  const contentRef = useRef<HTMLDivElement>(null);

  // Detect content type (memoized for performance)
  const contentType = useMemo(() => detectContentType(content), [content]);
  const contentTypeLabel = getContentTypeLabel(contentType);

  // Combined highlight: search takes precedence over external highlight
  const activeHighlight = searchHighlight || highlightedText;

  // Keyboard shortcut for Cmd+F
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
        e.preventDefault();
        setShowSearch(true);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Scroll to current match when search highlight changes
  useEffect(() => {
    if (!searchHighlight || !contentRef.current) return;

    // Small delay to let React render the mark element
    const timer = setTimeout(() => {
      const currentMatch = contentRef.current?.querySelector('mark[data-search-match="current"]');
      if (currentMatch) {
        currentMatch.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 50);

    return () => clearTimeout(timer);
  }, [searchHighlight, scrollTrigger]);

  const handleSearchClose = useCallback(() => {
    setShowSearch(false);
    setSearchHighlight(null);
    setSearchMatchIndex(0);
  }, []);

  const handleHighlightChange = useCallback((text: string | null, matchIndex: number) => {
    setSearchHighlight(text);
    setSearchMatchIndex(matchIndex);
    // Trigger scroll even if same text (for navigating between matches)
    setScrollTrigger(prev => prev + 1);
  }, []);

  // Render appropriate formatter based on content type
  const renderContent = () => {
    const highlightIndex = showSearch ? searchMatchIndex : undefined;
    switch (contentType) {
      case 'transcript':
        return <TranscriptFormatter content={content} onTextSelect={onTextSelect} highlightedText={activeHighlight} highlightMatchIndex={highlightIndex} />;
      case 'book':
      case 'article':
        return <BookFormatter content={content} onTextSelect={onTextSelect} highlightedText={activeHighlight} highlightMatchIndex={highlightIndex} />;
      case 'markdown':
        return <MarkdownFormatter content={content} onTextSelect={onTextSelect} highlightedText={activeHighlight} highlightMatchIndex={highlightIndex} />;
      default:
        return <RawFormatter content={content} onTextSelect={onTextSelect} highlightedText={activeHighlight} highlightMatchIndex={highlightIndex} />;
    }
  };

  return (
    <div style={{
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      background: 'var(--bg-surface)',
      borderRadius: '4px',
      overflow: 'hidden',
    }}>
      {/* Header with content type and search */}
      {content && content.length >= 50 && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 16px',
          borderBottom: '1px solid var(--bg-elevated)',
        }}>
          <span style={{
            fontSize: '10px',
            color: 'var(--accent-dark)',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
          }}>
            Detected: {contentTypeLabel}
          </span>
          <button
            onClick={() => setShowSearch(!showSearch)}
            title="Search content (⌘F)"
            style={{
              background: showSearch ? 'var(--border-default)' : 'transparent',
              border: 'none',
              borderRadius: '4px',
              padding: '4px 8px',
              cursor: 'pointer',
              color: showSearch ? 'var(--text-primary)' : 'var(--accent-dark)',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              fontSize: '10px',
              transition: 'all 150ms ease',
            }}
          >
            <svg width="12" height="12" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z" clipRule="evenodd" />
            </svg>
            <span>Search</span>
          </button>
        </div>
      )}

      {/* Search bar */}
      {showSearch && content && (
        <SourceSearchBar
          content={content}
          onClose={handleSearchClose}
          onHighlightChange={handleHighlightChange}
        />
      )}

      {/* Formatted content */}
      <div
        ref={contentRef}
        style={{
          flex: 1,
          overflow: 'auto',
        }}
      >
        {renderContent()}
      </div>
    </div>
  );
}
