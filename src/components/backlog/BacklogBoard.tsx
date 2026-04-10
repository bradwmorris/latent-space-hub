'use client';

import type { BacklogStatusColumn } from '@/services/backlog';
import BacklogCard from '@/components/backlog/BacklogCard';

interface BacklogBoardProps {
  columns: BacklogStatusColumn[];
  onSelectProject: (id: string) => void;
}

export default function BacklogBoard({ columns, onSelectProject }: BacklogBoardProps) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${columns.length}, minmax(260px, 1fr))`,
        gap: 16,
        minWidth: columns.length * 280,
      }}
    >
      {columns.map((column) => (
        <div
          key={column.id}
          style={{
            borderRadius: 14,
            border: '1px solid var(--border-subtle)',
            background: 'rgba(0,0,0,0.08)',
            padding: 12,
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
            <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--accent-brand-light)' }}>
              {column.label}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{column.items.length}</div>
          </div>

          {column.items.length ? (
            column.items.map((project) => (
              <BacklogCard key={project.id} project={project} onClick={onSelectProject} />
            ))
          ) : (
            <div
              style={{
                borderRadius: 12,
                border: '1px dashed var(--border-default)',
                padding: 16,
                color: 'var(--text-muted)',
                fontSize: 12,
                textAlign: 'center',
              }}
            >
              No items in {column.label.toLowerCase()}.
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
