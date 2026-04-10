'use client';

import { ExternalLink, FileText, Github, CalendarDays } from 'lucide-react';
import type { BacklogProjectSummary } from '@/services/backlog';

interface BacklogCardProps {
  project: BacklogProjectSummary;
  onClick: (id: string) => void;
}

function statusLabel(status: string): string {
  if (status === 'in_progress') return 'In Progress';
  return status.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

export default function BacklogCard({ project, onClick }: BacklogCardProps) {
  return (
    <button
      onClick={() => onClick(project.id)}
      style={{
        width: '100%',
        borderRadius: 12,
        border: '1px solid var(--border-default)',
        background: 'linear-gradient(180deg, var(--bg-surface), var(--bg-base))',
        padding: 14,
        color: 'inherit',
        cursor: 'pointer',
        textAlign: 'left',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        transition: 'border-color 0.12s ease, transform 0.12s ease',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontSize: 14,
              fontWeight: 600,
              color: 'var(--text-primary)',
              lineHeight: 1.35,
            }}
          >
            {project.title}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
            <span style={pillStyle('var(--accent-brand-subtle)', 'var(--accent-brand-light)')}>{statusLabel(project.status)}</span>
            <span style={pillStyle('var(--bg-hover)', 'var(--text-secondary)')}>{project.type}</span>
            <span style={pillStyle('var(--bg-hover)', 'var(--text-secondary)')}>{project.priority}</span>
          </div>
        </div>
        <span style={{ fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>#{project.queuePosition}</span>
      </div>

      <div
        style={{
          fontFamily: 'var(--font-body)',
          color: 'var(--text-secondary)',
          fontSize: 13,
          lineHeight: 1.55,
          display: '-webkit-box',
          WebkitLineClamp: 3,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
        }}
      >
        {project.notes}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
          {project.doneCount}/{project.taskCount} tasks complete
        </div>
        <div
          style={{
            flex: 1,
            height: 6,
            background: 'var(--bg-hover)',
            borderRadius: 999,
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              width: `${Math.round(project.completionRatio * 100)}%`,
              height: '100%',
              background: 'var(--accent-brand)',
            }}
          />
        </div>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10, color: 'var(--text-muted)', fontSize: 11 }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          <FileText size={12} />
          {project.prd.split('/').pop()}
        </span>
        {project.due_date ? (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <CalendarDays size={12} />
            {project.due_date}
          </span>
        ) : null}
        {project.github?.issue_url ? (
          <a
            href={project.github.issue_url}
            target="_blank"
            rel="noreferrer"
            onClick={(event) => event.stopPropagation()}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              color: 'var(--text-secondary)',
              textDecoration: 'none',
            }}
          >
            <Github size={12} />
            #{project.github.issue_number}
            <ExternalLink size={11} />
          </a>
        ) : (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <Github size={12} />
            no issue yet
          </span>
        )}
      </div>
    </button>
  );
}

function pillStyle(background: string, color: string): React.CSSProperties {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '3px 8px',
    borderRadius: 999,
    background,
    color,
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
  };
}
