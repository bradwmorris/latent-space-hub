"use client";

import { useState } from 'react';
import { LayoutDashboard, FolderOpen, List, Map } from 'lucide-react';

export type MainView = 'dashboard' | 'type' | 'feed' | 'map';

interface MainViewSwitcherProps {
  activeView: MainView;
  onViewChange: (view: MainView) => void;
  selectedType?: string | null;
}

const VIEW_CONFIG: { id: MainView; icon: typeof FolderOpen; label: string }[] = [
  { id: 'dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { id: 'type', icon: FolderOpen, label: 'Type' },
  { id: 'feed', icon: List, label: 'Feed' },
  { id: 'map', icon: Map, label: 'Map' },
];

export default function MainViewSwitcher({
  activeView,
  onViewChange,
  selectedType,
}: MainViewSwitcherProps) {
  const [hoveredView, setHoveredView] = useState<MainView | null>(null);

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '2px',
        padding: '8px 16px',
        borderBottom: '1px solid #1a1a1a',
        background: '#0d0d0d',
      }}
    >
      {/* View mode tabs */}
      <div style={{ display: 'flex', gap: '1px', background: '#151515', borderRadius: '6px', padding: '2px' }}>
        {VIEW_CONFIG.map(({ id, icon: Icon, label }) => {
          const isActive = activeView === id;
          const isHovered = hoveredView === id;
          return (
            <button
              key={id}
              onClick={() => onViewChange(id)}
              onMouseEnter={() => setHoveredView(id)}
              onMouseLeave={() => setHoveredView(null)}
              aria-label={label}
              aria-pressed={isActive}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                padding: '5px 10px',
                borderRadius: '4px',
                border: 'none',
                background: isActive ? '#1a1a1a' : 'transparent',
                color: isActive ? 'var(--accent-brand-light)' : (isHovered ? '#aaa' : '#666'),
                cursor: 'pointer',
                fontSize: '12px',
                fontWeight: isActive ? 500 : 400,
                transition: 'all 0.1s',
              }}
            >
              <Icon size={14} />
              <span>{label}</span>
            </button>
          );
        })}
      </div>

      {/* Context breadcrumb */}
      {selectedType && activeView === 'type' && (
        <span
          style={{
            marginLeft: '12px',
            fontSize: '12px',
            color: '#555',
            textTransform: 'capitalize',
          }}
        >
          / {selectedType}
        </span>
      )}
    </div>
  );
}
