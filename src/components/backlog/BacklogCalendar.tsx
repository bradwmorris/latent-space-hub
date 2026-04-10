'use client';

import { useMemo, useState } from 'react';
import type { BacklogProjectSummary } from '@/services/backlog';

interface BacklogCalendarProps {
  projects: BacklogProjectSummary[];
  onSelectProject: (id: string) => void;
}

function monthLabel(date: Date): string {
  return date.toLocaleDateString('en-AU', { month: 'long', year: 'numeric' });
}

function dateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export default function BacklogCalendar({ projects, onSelectProject }: BacklogCalendarProps) {
  const [cursor, setCursor] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

  const dueProjects = projects.filter((project) => project.due_date);

  const grid = useMemo(() => {
    const start = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const startDay = start.getDay();
    const gridStart = new Date(start);
    gridStart.setDate(start.getDate() - startDay);

    return Array.from({ length: 42 }, (_, index) => {
      const date = new Date(gridStart);
      date.setDate(gridStart.getDate() + index);
      return date;
    });
  }, [cursor]);

  const itemsByDate = useMemo(() => {
    const map = new Map<string, BacklogProjectSummary[]>();
    for (const project of dueProjects) {
      if (!project.due_date) continue;
      const existing = map.get(project.due_date) || [];
      existing.push(project);
      map.set(project.due_date, existing);
    }
    return map;
  }, [dueProjects]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)' }}>{monthLabel(cursor)}</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{dueProjects.length} dated backlog items</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))} style={navButtonStyle}>
            Prev
          </button>
          <button onClick={() => setCursor(new Date())} style={navButtonStyle}>
            Today
          </button>
          <button onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))} style={navButtonStyle}>
            Next
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 10 }}>
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((label) => (
          <div key={label} style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', padding: '0 4px' }}>
            {label}
          </div>
        ))}
        {grid.map((date) => {
          const key = dateKey(date);
          const items = itemsByDate.get(key) || [];
          const isCurrentMonth = date.getMonth() === cursor.getMonth();
          const isToday = key === dateKey(new Date());
          return (
            <div
              key={key}
              style={{
                minHeight: 138,
                borderRadius: 14,
                border: `1px solid ${isToday ? 'var(--accent-brand)' : 'var(--border-default)'}`,
                background: isCurrentMonth ? 'var(--bg-surface)' : 'var(--bg-base)',
                opacity: isCurrentMonth ? 1 : 0.55,
                padding: 10,
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
              }}
            >
              <div style={{ fontSize: 12, color: isToday ? 'var(--accent-brand-light)' : 'var(--text-secondary)' }}>
                {date.getDate()}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {items.slice(0, 3).map((project) => (
                  <button
                    key={project.id}
                    onClick={() => onSelectProject(project.id)}
                    style={{
                      border: '1px solid var(--border-default)',
                      borderRadius: 8,
                      background: 'var(--bg-hover)',
                      padding: '6px 8px',
                      color: 'var(--text-primary)',
                      fontSize: 11,
                      textAlign: 'left',
                      cursor: 'pointer',
                    }}
                  >
                    {project.title}
                  </button>
                ))}
                {items.length > 3 ? (
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>+{items.length - 3} more</div>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const navButtonStyle: React.CSSProperties = {
  borderRadius: 8,
  border: '1px solid var(--border-default)',
  background: 'var(--bg-surface)',
  color: 'var(--text-secondary)',
  padding: '6px 10px',
  fontSize: 12,
  cursor: 'pointer',
};
