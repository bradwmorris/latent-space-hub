"use client";

import { useState, useCallback, useEffect, useRef } from 'react';
import { GripVertical } from 'lucide-react';

interface SplitHandleProps {
  isSecondPaneOpen: boolean;
  onOpenSecondPane: () => void;
  onResize: (newWidthPercent: number) => void;
  onCloseSecondPane: () => void;
  containerRef: React.RefObject<HTMLDivElement>;
  toolbarWidth?: number;
}

export default function SplitHandle({
  isSecondPaneOpen,
  onOpenSecondPane,
  onResize,
  onCloseSecondPane,
  containerRef,
  toolbarWidth = 50,
}: SplitHandleProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const startXRef = useRef<number>(0);
  const startWidthRef = useRef<number>(50);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();

    if (!isSecondPaneOpen) {
      // First drag opens the second pane at 50%
      onOpenSecondPane();
    }

    setIsDragging(true);
    startXRef.current = e.clientX;

    // Calculate current width from container
    if (containerRef.current) {
      const containerWidth = containerRef.current.offsetWidth - toolbarWidth;
      // Assume current position is at the split point
      startWidthRef.current = 50; // Default to 50% for new split
    }
  }, [isSecondPaneOpen, onOpenSecondPane, containerRef, toolbarWidth]);

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!containerRef.current) return;

      const containerRect = containerRef.current.getBoundingClientRect();
      const containerWidth = containerRect.width - toolbarWidth;
      const mouseX = e.clientX - containerRect.left - toolbarWidth;

      // Calculate what percentage of the available space should be Slot B
      // mouseX is distance from left edge, so slotA width = mouseX
      // slotB width = containerWidth - mouseX
      const slotBWidthPercent = ((containerWidth - mouseX) / containerWidth) * 100;

      // Clamp between 20% and 70%
      const clampedWidth = Math.max(20, Math.min(70, slotBWidthPercent));

      // If dragged to less than 15%, close the pane
      if (slotBWidthPercent < 15) {
        onCloseSecondPane();
        setIsDragging(false);
        return;
      }

      onResize(clampedWidth);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isDragging, containerRef, toolbarWidth, onResize, onCloseSecondPane]);

  // When second pane is closed, show a wider handle with grip icon
  if (!isSecondPaneOpen) {
    return (
      <div
        onMouseDown={handleMouseDown}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        style={{
          width: '12px',
          cursor: 'col-resize',
          background: isHovered ? 'var(--bg-elevated)' : 'transparent',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'background 0.15s ease',
          flexShrink: 0,
        }}
        title="Drag to split view (⌘\)"
      >
        <GripVertical
          size={12}
          color={isHovered ? 'var(--accent-primary)' : 'var(--text-muted)'}
          style={{ transition: 'color 0.15s ease' }}
        />
      </div>
    );
  }

  // When second pane is open, show resize handle
  return (
    <div
      onMouseDown={handleMouseDown}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        width: '8px',
        cursor: 'col-resize',
        background: isDragging ? 'var(--accent-dark)' : (isHovered ? 'var(--bg-elevated)' : 'transparent'),
        transition: isDragging ? 'none' : 'background 0.15s ease',
        flexShrink: 0,
      }}
    />
  );
}
