"use client";

import { useCallback, useRef, useMemo } from 'react';

interface BookFormatterProps {
  content: string;
  onTextSelect?: (text: string) => void;
  highlightedText?: string | null;
  highlightMatchIndex?: number;
}

/**
 * Book Formatter - Clean typography for long-form text
 *
 * Focuses on readability without attempting to parse chapter structure.
 * Structure parsing can be done on-demand via AI.
 */
export default function BookFormatter({ content, onTextSelect, highlightedText, highlightMatchIndex = 0 }: BookFormatterProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Handle text selection
  const handleMouseUp = useCallback(() => {
    if (!onTextSelect) return;

    const selection = window.getSelection();
    const text = selection?.toString().trim();

    if (text && text.length > 10) {
      const truncatedText = text.length > 2000
        ? text.slice(0, 2000) + '...'
        : text;
      onTextSelect(truncatedText);
      selection?.removeAllRanges();
    }
  }, [onTextSelect]);

  // Compute all match positions in the full content
  const matchPositions = useMemo(() => {
    if (!highlightedText) return [];
    const positions: number[] = [];
    const searchText = highlightedText.toLowerCase();
    const contentLower = content.toLowerCase();
    let pos = 0;
    while (pos < contentLower.length) {
      const index = contentLower.indexOf(searchText, pos);
      if (index === -1) break;
      positions.push(index);
      pos = index + 1;
    }
    return positions;
  }, [content, highlightedText]);

  // Track which global match index we're at as we render paragraphs
  const globalMatchCounter = useRef(0);

  // Reset counter before each render
  globalMatchCounter.current = 0;

  // Render text with all highlights, marking current one specially
  const renderWithHighlight = useCallback((text: string): React.ReactNode => {
    if (!highlightedText) return text;

    const textLower = text.toLowerCase();
    const searchLower = highlightedText.toLowerCase();

    if (!textLower.includes(searchLower)) {
      return text;
    }

    // Find all occurrences in this paragraph
    const parts: React.ReactNode[] = [];
    let lastIndex = 0;
    let pos = 0;

    while (pos < textLower.length) {
      const index = textLower.indexOf(searchLower, pos);
      if (index === -1) break;

      // Add text before match
      if (index > lastIndex) {
        parts.push(text.slice(lastIndex, index));
      }

      // Determine if this is the current match
      const isCurrent = globalMatchCounter.current === highlightMatchIndex;
      globalMatchCounter.current++;

      // Add highlighted match
      parts.push(
        <mark
          key={`match-${index}`}
          data-search-match={isCurrent ? 'current' : 'other'}
          style={{
            background: isCurrent ? 'rgba(250, 204, 21, 0.4)' : 'rgba(168, 85, 247, 0.2)',
            color: isCurrent ? '#fef08a' : '#e9d5ff',
            padding: '2px 0',
            borderRadius: '2px',
          }}
        >
          {text.slice(index, index + highlightedText.length)}
        </mark>
      );

      lastIndex = index + highlightedText.length;
      pos = index + 1;
    }

    // Add remaining text
    if (lastIndex < text.length) {
      parts.push(text.slice(lastIndex));
    }

    return parts.length > 0 ? <>{parts}</> : text;
  }, [highlightedText, highlightMatchIndex]);

  // Split content into paragraphs (double newlines or single newlines with blank lines)
  const paragraphs = content
    .split(/\n\n+/)
    .map(p => p.trim())
    .filter(p => p.length > 0);

  return (
    <div 
      ref={containerRef}
      onMouseUp={handleMouseUp}
      style={{
        maxWidth: '680px',
        margin: '0 auto',
        padding: '24px 16px',
      }}
    >
      {/* Clean text display */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5em' }}>
        {paragraphs.map((para, idx) => (
          <p
            key={idx}
            style={{
              fontFamily: 'inherit',
              fontSize: '16px',
              lineHeight: '1.75',
              color: '#d4d4d4',
              margin: 0,
              whiteSpace: 'pre-wrap',
              wordWrap: 'break-word',
              textAlign: 'justify',
              textJustify: 'inter-word',
              hyphens: 'auto',
            }}
          >
            {renderWithHighlight(para)}
          </p>
        ))}
      </div>
    </div>
  );
}
