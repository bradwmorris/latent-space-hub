"use client";

import { useMemo, useCallback, useRef } from 'react';

interface TranscriptFormatterProps {
  content: string;
  onTextSelect?: (text: string) => void;
  highlightedText?: string | null;
  highlightMatchIndex?: number;
}

interface TranscriptSegment {
  timestamp: string;
  speaker: string | null;
  text: string;
}

// Timestamp patterns for parsing
const TIMESTAMP_REGEX = /^(\[?\d{1,2}:\d{2}(?::\d{2})?\]?|\(\d{1,2}:\d{2}(?::\d{2})?\)|\d{1,2}:\d{2}(?::\d{2})?\s*[-–—]|\[\d+(?:\.\d+)?s\])\s*/;

// Speaker pattern - looks for "Name:" at start after timestamp
const SPEAKER_REGEX = /^([A-Z][a-zA-Z\s]{1,30}):?\s+/;

/**
 * Parse a line into timestamp, speaker, and text components
 */
function parseLine(line: string): TranscriptSegment | null {
  const trimmed = line.trim();
  if (!trimmed) return null;

  const timestampMatch = trimmed.match(TIMESTAMP_REGEX);
  if (!timestampMatch) return null;

  const timestamp = timestampMatch[1].replace(/[-–—]\s*$/, '').replace(/[\[\]\(\)]/g, '').trim();
  let remaining = trimmed.slice(timestampMatch[0].length);

  // Check for speaker name
  let speaker: string | null = null;
  const speakerMatch = remaining.match(SPEAKER_REGEX);
  if (speakerMatch) {
    speaker = speakerMatch[1].trim();
    remaining = remaining.slice(speakerMatch[0].length);
  }

  return {
    timestamp,
    speaker,
    text: remaining.trim(),
  };
}

/**
 * Group consecutive non-timestamp lines with the previous segment
 */
function parseTranscript(content: string): TranscriptSegment[] {
  const lines = content.split('\n');
  const segments: TranscriptSegment[] = [];
  let currentSegment: TranscriptSegment | null = null;

  for (const line of lines) {
    const parsed = parseLine(line);
    
    if (parsed) {
      if (currentSegment) {
        segments.push(currentSegment);
      }
      currentSegment = parsed;
    } else if (currentSegment && line.trim()) {
      currentSegment.text += '\n' + line.trim();
    }
  }

  if (currentSegment) {
    segments.push(currentSegment);
  }

  return segments;
}

/**
 * Transcript Formatter - Clean view for timestamped content
 */
export default function TranscriptFormatter({ content, onTextSelect, highlightedText, highlightMatchIndex = 0 }: TranscriptFormatterProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const globalMatchCounter = useRef(0);

  // Reset counter before each render
  globalMatchCounter.current = 0;

  const segments = useMemo(() => parseTranscript(content), [content]);

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

  const renderWithHighlight = useCallback((text: string): React.ReactNode => {
    if (!highlightedText) return text;

    const textLower = text.toLowerCase();
    const searchLower = highlightedText.toLowerCase();

    if (!textLower.includes(searchLower)) {
      return text;
    }

    const parts: React.ReactNode[] = [];
    let lastIndex = 0;
    let pos = 0;

    while (pos < textLower.length) {
      const index = textLower.indexOf(searchLower, pos);
      if (index === -1) break;

      if (index > lastIndex) {
        parts.push(text.slice(lastIndex, index));
      }

      const isCurrent = globalMatchCounter.current === highlightMatchIndex;
      globalMatchCounter.current++;

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

    if (lastIndex < text.length) {
      parts.push(text.slice(lastIndex));
    }

    return parts.length > 0 ? <>{parts}</> : text;
  }, [highlightedText, highlightMatchIndex]);

  if (segments.length === 0) {
    return (
      <div style={{
        color: 'var(--accent-dark)',
        fontSize: '15px',
        fontStyle: 'italic',
        textAlign: 'center',
        padding: '40px 20px',
      }}>
        No transcript content detected
      </div>
    );
  }

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
      {segments.map((segment, index) => (
        <div
          key={index}
          style={{
            marginBottom: '24px',
          }}
        >
          {/* Timestamp and speaker on same line */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            marginBottom: '8px',
          }}>
            <span style={{
              fontSize: '11px',
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, monospace',
              color: 'var(--accent-dark)',
            }}>
              {segment.timestamp}
            </span>
            {segment.speaker && (
              <span style={{
                fontSize: '12px',
                fontWeight: 600,
                color: 'var(--accent-primary)',
              }}>
                {segment.speaker}
              </span>
            )}
          </div>

          {/* Text content */}
          <div style={{
            fontFamily: 'inherit',
            fontSize: '16px',
            lineHeight: '1.75',
            color: '#d4d4d4',
            whiteSpace: 'pre-wrap',
            wordWrap: 'break-word',
          }}>
            {renderWithHighlight(segment.text)}
          </div>
        </div>
      ))}
    </div>
  );
}
