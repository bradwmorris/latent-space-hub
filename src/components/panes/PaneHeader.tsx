"use client";

import { useState } from 'react';
import { X } from 'lucide-react';
import { PaneHeaderProps } from './types';

export default function PaneHeader({
  slot,
  onCollapse,
  onSwapPanes,
  children
}: PaneHeaderProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);

  const handleDragStart = (e: React.DragEvent) => {
    if (!slot) return;
    e.dataTransfer.setData('application/x-ls-pane', slot);
    e.dataTransfer.effectAllowed = 'move';
    setIsDragging(true);
  };

  const handleDragEnd = () => {
    setIsDragging(false);
  };

  const handleDragOver = (e: React.DragEvent) => {
    if (!e.dataTransfer.types.includes('application/x-ls-pane')) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);

    const sourceSlot = e.dataTransfer.getData('application/x-ls-pane');
    if (sourceSlot && sourceSlot !== slot && onSwapPanes) {
      onSwapPanes();
    }
  };

  return (
    <div
      draggable={!!slot && !!onSwapPanes}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '8px 12px',
        background: isDragOver ? 'rgba(255, 255, 255, 0.03)' : 'transparent',
        minHeight: '44px',
        cursor: slot && onSwapPanes ? 'grab' : 'default',
        opacity: isDragging ? 0.5 : 1,
        borderRadius: isDragOver ? '6px' : '0',
        transition: 'background 0.15s ease',
      }}
    >
      {/* Children (tabs, etc.) - takes up available space */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '4px', minWidth: 0 }}>
        {children}
      </div>

      {/* Close button (when onCollapse is provided) */}
      {onCollapse && (
        <button
          onClick={onCollapse}
          style={{
            width: '28px',
            height: '28px',
            borderRadius: '6px',
            border: '1px solid var(--border-default)',
            background: 'var(--bg-surface)',
            color: 'var(--text-muted)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
            flexShrink: 0,
          }}
          title="Close pane"
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'var(--bg-elevated)';
            e.currentTarget.style.borderColor = '#3a3a3a';
            e.currentTarget.style.color = 'var(--accent-light)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'var(--bg-surface)';
            e.currentTarget.style.borderColor = 'var(--border-default)';
            e.currentTarget.style.color = 'var(--text-muted)';
          }}
        >
          <X size={14} />
        </button>
      )}
    </div>
  );
}
