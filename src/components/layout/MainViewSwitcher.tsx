"use client";

import { useState } from 'react';
import { LayoutDashboard, FolderOpen, List, Map, CalendarDays, Sun, Moon } from 'lucide-react';
import { useTheme } from '@/components/theme/ThemeProvider';

export type MainView = 'dashboard' | 'type' | 'feed' | 'map' | 'events' | 'skills' | 'evals';

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
  { id: 'events', icon: CalendarDays, label: 'Events' },
];

export default function MainViewSwitcher({
  activeView,
  onViewChange,
  selectedType,
}: MainViewSwitcherProps) {
  const [hoveredView, setHoveredView] = useState<MainView | null>(null);
  const { theme, resolved, setTheme } = useTheme();
  const isLight = resolved === 'light';

  const toggleTheme = () => {
    if (theme === 'system') {
      setTheme(isLight ? 'dark' : 'light');
      return;
    }
    setTheme(theme === 'dark' ? 'light' : 'dark');
  };

  const themeLabel = theme === 'system' ? `Theme: System (${resolved})` : `Theme: ${theme}`;

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '2px',
        padding: '8px 16px',
        borderBottom: '1px solid var(--border-subtle)',
        background: 'var(--bg-surface)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', minWidth: 0 }}>
        {/* View mode tabs */}
        <div style={{ display: 'flex', gap: '1px', background: 'var(--bg-hover)', borderRadius: '8px', padding: '2px' }}>
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
                  background: isActive ? 'var(--bg-elevated)' : 'transparent',
                  color: isActive ? 'var(--text-primary)' : (isHovered ? 'var(--text-secondary)' : 'var(--text-muted)'),
                  cursor: 'pointer',
                  fontSize: '12px',
                  fontWeight: isActive ? 500 : 400,
                  transition: 'all 0.1s',
                  borderBottom: isActive ? '2px solid var(--accent-brand)' : '2px solid transparent',
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
              fontSize: '11px',
              color: 'var(--text-muted)',
              textTransform: 'capitalize',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              fontWeight: 400,
            }}
          >
            / {selectedType}
          </span>
        )}
      </div>

      <button
        onClick={toggleTheme}
        aria-label={themeLabel}
        title={`${themeLabel} (toggle light/dark)`}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '28px',
          height: '28px',
          border: 'none',
          borderRadius: '8px',
          background: 'transparent',
          color: 'var(--text-muted)',
          cursor: 'pointer',
          transition: 'color 0.15s, background 0.15s',
          flexShrink: 0,
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = 'var(--bg-hover)';
          e.currentTarget.style.color = 'var(--text-primary)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'transparent';
          e.currentTarget.style.color = 'var(--text-muted)';
        }}
      >
        {isLight ? <Moon size={15} /> : <Sun size={15} />}
      </button>
    </div>
  );
}
