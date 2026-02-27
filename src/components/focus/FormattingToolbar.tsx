"use client";

import React from 'react';
import { Bold, Italic, Heading1, Heading2, Heading3 } from 'lucide-react';

interface FormattingToolbarProps {
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  value: string;
  onChange: (newValue: string) => void;
  inline?: boolean;
}

export default function FormattingToolbar({ textareaRef, value, onChange, inline = false }: FormattingToolbarProps) {
  const applyFormatting = (
    type: 'h1' | 'h2' | 'h3' | 'bold' | 'italic'
  ) => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = value.substring(start, end);

    let newText = value;
    let newCursorPos = end;

    switch (type) {
      case 'h1':
      case 'h2':
      case 'h3': {
        const prefix = type === 'h1' ? '# ' : type === 'h2' ? '## ' : '### ';
        // Find the start of the current line
        const lineStart = value.lastIndexOf('\n', start - 1) + 1;
        const lineEnd = value.indexOf('\n', end);
        const actualLineEnd = lineEnd === -1 ? value.length : lineEnd;
        const currentLine = value.substring(lineStart, actualLineEnd);

        // Check if line already has a heading prefix
        const headingMatch = currentLine.match(/^(#{1,3})\s/);
        if (headingMatch) {
          // Replace existing heading
          const newLine = prefix + currentLine.replace(/^#{1,3}\s/, '');
          newText = value.substring(0, lineStart) + newLine + value.substring(actualLineEnd);
          newCursorPos = lineStart + newLine.length;
        } else {
          // Add heading prefix
          newText = value.substring(0, lineStart) + prefix + value.substring(lineStart);
          newCursorPos = start + prefix.length;
        }
        break;
      }
      case 'bold': {
        if (selectedText) {
          // Wrap selection with **
          newText = value.substring(0, start) + '**' + selectedText + '**' + value.substring(end);
          newCursorPos = end + 4;
        } else {
          // Insert ** and place cursor in middle
          newText = value.substring(0, start) + '****' + value.substring(end);
          newCursorPos = start + 2;
        }
        break;
      }
      case 'italic': {
        if (selectedText) {
          // Wrap selection with *
          newText = value.substring(0, start) + '*' + selectedText + '*' + value.substring(end);
          newCursorPos = end + 2;
        } else {
          // Insert ** and place cursor in middle
          newText = value.substring(0, start) + '**' + value.substring(end);
          newCursorPos = start + 1;
        }
        break;
      }
    }

    onChange(newText);

    // Restore focus and cursor position
    setTimeout(() => {
      if (textarea) {
        textarea.focus();
        textarea.setSelectionRange(newCursorPos, newCursorPos);
      }
    }, 0);
  };

  const buttonStyle: React.CSSProperties = {
    background: 'transparent',
    border: '1px solid var(--border-default)',
    borderRadius: '4px',
    padding: '4px 8px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: 'var(--accent-primary)',
    transition: 'all 0.15s'
  };

  const handleMouseEnter = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.currentTarget.style.background = 'var(--bg-elevated)';
    e.currentTarget.style.color = 'var(--text-primary)';
  };

  const handleMouseLeave = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.currentTarget.style.background = 'transparent';
    e.currentTarget.style.color = 'var(--accent-primary)';
  };

  return (
    <div style={{
      display: 'flex',
      gap: '4px',
      alignItems: 'center',
      ...(inline ? {} : {
        marginBottom: '8px',
        paddingBottom: '8px',
        borderBottom: '1px solid var(--bg-elevated)'
      })
    }}>
      <button
        type="button"
        onClick={() => applyFormatting('h1')}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        style={buttonStyle}
        title="Heading 1 (# )"
      >
        <Heading1 size={14} />
      </button>
      <button
        type="button"
        onClick={() => applyFormatting('h2')}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        style={buttonStyle}
        title="Heading 2 (## )"
      >
        <Heading2 size={14} />
      </button>
      <button
        type="button"
        onClick={() => applyFormatting('h3')}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        style={buttonStyle}
        title="Heading 3 (### )"
      >
        <Heading3 size={14} />
      </button>
      <div style={{ width: '1px', background: 'var(--border-default)', margin: '0 4px' }} />
      <button
        type="button"
        onClick={() => applyFormatting('bold')}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        style={buttonStyle}
        title="Bold (**text**)"
      >
        <Bold size={14} />
      </button>
      <button
        type="button"
        onClick={() => applyFormatting('italic')}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        style={buttonStyle}
        title="Italic (*text*)"
      >
        <Italic size={14} />
      </button>
    </div>
  );
}
