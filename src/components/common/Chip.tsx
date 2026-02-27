"use client";

import { CSSProperties, useState } from 'react';

interface ChipProps {
  label: string;
  onRemove?: () => void;
  color?: string;
  maxWidth?: number;
  icon?: React.ReactNode;
  style?: CSSProperties;
}

export default function Chip({
  label,
  onRemove,
  color = 'var(--bg-elevated)',
  maxWidth = 150,
  icon,
  style = {}
}: ChipProps) {
  const [showTooltip, setShowTooltip] = useState(false);
  const needsTruncation = label.length > 20;
  const displayLabel = needsTruncation ? label.slice(0, 18) + '...' : label;

  return (
    <div
      style={{
        position: 'relative',
        display: 'inline-block',
        ...style
      }}
      onMouseEnter={() => needsTruncation && setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      <span
        style={{
          background: color,
          color: 'var(--text-primary)',
          padding: '2px 6px',
          borderRadius: '12px',
          fontSize: '10px',
          display: 'inline-flex',
          alignItems: 'center',
          gap: '4px',
          maxWidth: `${maxWidth}px`,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          border: '1px solid rgba(255, 255, 255, 0.1)'
        }}
      >
        {icon}
        <span style={{ 
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap'
        }}>
          {displayLabel}
        </span>
        {onRemove && (
          <button
            onClick={onRemove}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-primary)',
              cursor: 'pointer',
              fontSize: '8px',
              padding: '0',
              lineHeight: 1,
              marginLeft: '2px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '12px',
              height: '12px',
              borderRadius: '50%',
              transition: 'background 0.2s'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'none';
            }}
          >
            ✕
          </button>
        )}
      </span>
      
      {/* Tooltip */}
      {showTooltip && needsTruncation && (
        <div
          style={{
            position: 'absolute',
            bottom: '100%',
            left: '50%',
            transform: 'translateX(-50%)',
            marginBottom: '4px',
            padding: '4px 8px',
            background: 'var(--border-default)',
            color: 'var(--text-primary)',
            fontSize: '11px',
            borderRadius: '3px',
            whiteSpace: 'nowrap',
            zIndex: 1000,
            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.5)',
            pointerEvents: 'none'
          }}
        >
          {label}
        </div>
      )}
    </div>
  );
}