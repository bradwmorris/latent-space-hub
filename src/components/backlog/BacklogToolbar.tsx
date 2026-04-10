'use client';

interface BacklogToolbarProps {
  view: 'board' | 'calendar';
  onViewChange: (view: 'board' | 'calendar') => void;
  totalItems: number;
  githubEnabled: boolean;
  lastUpdated: string;
}

export default function BacklogToolbar({
  view,
  onViewChange,
  totalItems,
  githubEnabled,
  lastUpdated,
}: BacklogToolbarProps) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        flexWrap: 'wrap',
      }}
    >
      <div>
        <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--text-primary)' }}>Backlog</div>
        <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 6 }}>
          {totalItems} active items · updated {lastUpdated} · {githubEnabled ? 'GitHub sync enabled' : 'local-only mode'}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, border: '1px solid var(--border-default)', borderRadius: 10, padding: 3 }}>
        <button onClick={() => onViewChange('board')} style={viewButtonStyle(view === 'board')}>
          Board
        </button>
        <button onClick={() => onViewChange('calendar')} style={viewButtonStyle(view === 'calendar')}>
          Calendar
        </button>
      </div>
    </div>
  );
}

function viewButtonStyle(active: boolean): React.CSSProperties {
  return {
    borderRadius: 8,
    border: 'none',
    background: active ? 'var(--accent-brand-subtle)' : 'transparent',
    color: active ? 'var(--accent-brand-light)' : 'var(--text-secondary)',
    padding: '7px 12px',
    fontSize: 12,
    cursor: 'pointer',
  };
}
