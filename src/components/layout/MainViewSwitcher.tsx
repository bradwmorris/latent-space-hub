"use client";

import { useState } from 'react';
import { LayoutDashboard, FolderOpen, List, Map, Sun, Moon } from 'lucide-react';
import { useTheme } from '@/components/theme/ThemeProvider';

export type MainView = 'dashboard' | 'type' | 'feed' | 'map' | 'skills' | 'evals';

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
        <div style={{ display: 'flex', gap: '1px', background: 'var(--bg-hover)', borderRadius: '6px', padding: '2px' }}>
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
                  color: isActive ? 'var(--accent-brand-light)' : (isHovered ? 'var(--accent-light)' : 'var(--accent-dark)'),
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
              color: 'var(--text-muted)',
              textTransform: 'capitalize',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
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
          display: 'inline-flex',
          alignItems: 'center',
          gap: '8px',
          border: '1px solid var(--border-default)',
          borderRadius: '999px',
          background: 'var(--bg-base)',
          color: 'var(--text-secondary)',
          padding: '4px 8px',
          cursor: 'pointer',
          transition: 'all 0.1s',
          flexShrink: 0,
        }}
      >
        <Moon size={12} style={{ color: !isLight ? 'var(--text-primary)' : 'var(--text-muted)' }} />
        <span
          aria-hidden="true"
          style={{
            position: 'relative',
            width: '32px',
            height: '16px',
            borderRadius: '999px',
            background: isLight ? 'var(--accent-brand)' : 'var(--bg-elevated)',
            border: `1px solid ${isLight ? 'var(--accent-brand-light)' : 'var(--border-default)'}`,
            transition: 'all 0.15s ease',
          }}
        >
          <span
            style={{
              position: 'absolute',
              top: '1px',
              left: isLight ? '16px' : '1px',
              width: '12px',
              height: '12px',
              borderRadius: '50%',
              background: 'var(--text-primary)',
              transition: 'left 0.15s ease',
            }}
          />
        </span>
        <Sun size={12} style={{ color: isLight ? 'var(--text-primary)' : 'var(--text-muted)' }} />
      </button>
    </div>
  );
}
