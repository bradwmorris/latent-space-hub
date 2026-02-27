"use client";

import { useState } from 'react';
import { parseAndRenderContent } from './NodeLabelRenderer';

interface MarkdownRendererProps {
  content: string;
  streaming?: boolean;
  onNodeClick?: (nodeId: number) => void;
}

export default function MarkdownRenderer({ content, streaming, onNodeClick }: MarkdownRendererProps) {
  if (!content) return null;

  const segments = splitCodeBlocks(content);
  return (
    <div style={{ color: 'var(--text-primary)', fontSize: 16, lineHeight: 1.7, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
      {segments.map((seg, i) =>
        seg.type === 'code' ? (
          <CodeBlock key={i} language={seg.lang} code={seg.text} />
        ) : (
          <span key={i}>{renderTextWithFormatting(transformMarkdownNodeLinks(seg.text), onNodeClick)}</span>
        )
      )}
      {streaming ? (
        <span style={{ display: 'inline-block', width: 3, height: 12, marginLeft: 2, background: 'rgba(200,200,200,0.5)', verticalAlign: 'baseline' }} />
      ) : null}
    </div>
  );
}

function CodeBlock({ code, language }: { code: string; language?: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1000);
    } catch {}
  };
  return (
    <div style={{ margin: '8px 0' }}>
      <div style={{
        background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: 6,
        padding: 8, overflowX: 'auto', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 12
      }}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 6 }}>
          <span style={{ color: '#8a8a8a', fontSize: 11 }}>{language || 'code'}</span>
          <button onClick={handleCopy} style={{ marginLeft: 'auto', fontSize: 11, color: '#8a8a8a', background: 'transparent', border: '1px solid var(--border-default)', borderRadius: 4, padding: '1px 6px', cursor: 'pointer' }}>
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
        <pre style={{ margin: 0 }}>
          <code>{code}</code>
        </pre>
      </div>
    </div>
  );
}

function renderTextWithFormatting(text: string, onNodeClick?: (nodeId: number) => void): React.ReactNode[] {
  // Extract source quotes ONLY (pattern: > "quote text")
  const quoteSegments = splitSourceQuotes(text);
  
  return quoteSegments.flatMap((segment, segIdx) => {
    if (segment.type === 'quote') {
      return (
        <div key={`quote-${segIdx}`} style={{
          margin: '12px 0',
          padding: '10px 14px',
          borderLeft: '3px solid var(--border-default)',
          background: 'var(--bg-surface)',
          fontStyle: 'italic',
          color: '#b8b8b8',
          position: 'relative'
        }}>
          <span style={{ 
            position: 'absolute', 
            top: 8, 
            left: 8, 
            fontSize: 24, 
            color: '#3a3a3a',
            lineHeight: 1
          }}>"</span>
          <div style={{ paddingLeft: 12 }}>
            {parseInlineFormatting(segment.text, onNodeClick)}
          </div>
        </div>
      );
    } else {
      return <span key={`text-${segIdx}`}>{parseInlineFormatting(segment.text, onNodeClick)}</span>;
    }
  });
}

function splitSourceQuotes(input: string): Array<{ type: 'text' | 'quote'; text: string }> {
  const out: Array<{ type: 'text' | 'quote'; text: string }> = [];
  
  // ONLY match quotes that start with "> " (blockquote syntax from search tool)
  // This ensures we don't break [NODE:ID:"title"] patterns
  const quotePattern = /^>\s+"(.+?)"$/gm;
  
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  
  while ((match = quotePattern.exec(input)) !== null) {
    // Add text before quote
    if (match.index > lastIndex) {
      out.push({ type: 'text', text: input.slice(lastIndex, match.index) });
    }
    
    // Add the quote content (without the > and quote marks)
    out.push({ type: 'quote', text: match[1] });
    
    lastIndex = match.index + match[0].length;
  }
  
  // Add remaining text
  if (lastIndex < input.length) {
    out.push({ type: 'text', text: input.slice(lastIndex) });
  }
  
  return out.length > 0 ? out : [{ type: 'text', text: input }];
}

function parseInlineFormatting(text: string, onNodeClick?: (nodeId: number) => void): React.ReactNode[] {
  // Pattern for **bold** text
  const boldPattern = /\*\*(.+?)\*\*/g;
  
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  
  // First pass: handle bold text
  const textParts: Array<{ type: 'text' | 'bold'; text: string }> = [];
  while ((match = boldPattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      textParts.push({ type: 'text', text: text.slice(lastIndex, match.index) });
    }
    textParts.push({ type: 'bold', text: match[1] });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    textParts.push({ type: 'text', text: text.slice(lastIndex) });
  }
  
  // If no bold text found, just use the original text
  if (textParts.length === 0) {
    textParts.push({ type: 'text', text });
  }
  
  // Second pass: render each part with node label parsing
  return textParts.flatMap((part, idx) => {
    if (part.type === 'bold') {
      return (
        <strong key={`bold-${idx}`} style={{ 
          fontWeight: 600,
          textDecoration: 'underline',
          textDecorationColor: '#4a4a4a',
          textDecorationThickness: '1px',
          textUnderlineOffset: '2px',
          color: 'var(--text-primary)'
        }}>
          {parseAndRenderContent(part.text, onNodeClick)}
        </strong>
      );
    } else {
      return <span key={`text-${idx}`}>{parseAndRenderContent(part.text, onNodeClick)}</span>;
    }
  });
}

function splitCodeBlocks(input: string): Array<{ type: 'text' | 'code'; text: string; lang?: string }>
{
  const out: Array<{ type: 'text' | 'code'; text: string; lang?: string }> = [];
  const codeFence = /```([a-zA-Z0-9_-]+)?\n([\s\S]*?)```/g;
  let lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = codeFence.exec(input)) !== null) {
    if (m.index > lastIndex) out.push({ type: 'text', text: input.slice(lastIndex, m.index) });
    out.push({ type: 'code', lang: m[1], text: m[2] });
    lastIndex = m.index + m[0].length;
  }
  if (lastIndex < input.length) out.push({ type: 'text', text: input.slice(lastIndex) });
  return out;
}

// Convert markdown links that point to #NODE:ID:"Title" into the inline token [NODE:ID:"Title"]
function transformMarkdownNodeLinks(input: string): string {
  if (!input) return input;
  // Use non-greedy match (.+?) to handle quotes inside titles
  const nodeLink = /\[[^\]]*\]\(\s*#NODE:\s*(\d+)\s*:\s*["""'](.+?)["""']\s*\)/g;
  return input.replace(nodeLink, (_m, id, title) => `[NODE:${id}:"${title}"]`);
}
