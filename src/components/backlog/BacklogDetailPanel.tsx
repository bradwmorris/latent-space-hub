'use client';

import { useEffect, useState } from 'react';
import { ExternalLink, FileText, Github, X } from 'lucide-react';
import MarkdownRenderer from '@/components/helpers/MarkdownRenderer';
import type { BacklogProjectDetail } from '@/services/backlog';

interface BacklogDetailPanelProps {
  projectId: string | null;
  onClose: () => void;
}

export default function BacklogDetailPanel({ projectId, onClose }: BacklogDetailPanelProps) {
  const [detail, setDetail] = useState<BacklogProjectDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!projectId) {
      setDetail(null);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);
    fetch(`/api/backlog/${encodeURIComponent(projectId)}`)
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok || !payload.success) {
          throw new Error(payload.error || `Failed to fetch backlog project ${projectId}`);
        }
        setDetail(payload.data);
      })
      .catch((fetchError) => {
        setError(fetchError instanceof Error ? fetchError.message : 'Failed to load project');
      })
      .finally(() => setLoading(false));
  }, [projectId]);

  return (
    <aside
      style={{
        width: 420,
        minWidth: 320,
        maxWidth: '100%',
        borderLeft: '1px solid var(--border-default)',
        background: 'var(--bg-surface)',
        height: '100%',
        overflowY: 'auto',
      }}
    >
      <div style={{ padding: 18, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, borderBottom: '1px solid var(--border-default)' }}>
        <div>
          <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--accent-brand-light)' }}>Backlog Detail</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
            {projectId || 'Select a project'}
          </div>
        </div>
        <button onClick={onClose} style={closeButtonStyle}>
          <X size={14} />
        </button>
      </div>

      {!projectId ? (
        <EmptyState text="Select a backlog card to read the PRD and linked issue." />
      ) : loading ? (
        <EmptyState text="Loading backlog detail..." />
      ) : error ? (
        <EmptyState text={error} />
      ) : detail ? (
        <div style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div>
            <div style={{ fontSize: 20, fontWeight: 600, lineHeight: 1.35 }}>{detail.project.title}</div>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 8, fontFamily: 'var(--font-body)', lineHeight: 1.55 }}>
              {detail.project.notes}
            </div>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <span style={metaPill}>{detail.project.status}</span>
            <span style={metaPill}>{detail.project.type}</span>
            <span style={metaPill}>{detail.project.priority}</span>
            {detail.project.due_date ? <span style={metaPill}>due {detail.project.due_date}</span> : null}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <a
              href={`https://github.com/bradwmorris/latent-space-hub/blob/main/${detail.project.prd}`}
              target="_blank"
              rel="noreferrer"
              style={linkStyle}
            >
              <FileText size={14} />
              Open PRD
              <ExternalLink size={12} />
            </a>
            {detail.project.github?.issue_url ? (
              <a href={detail.project.github.issue_url} target="_blank" rel="noreferrer" style={linkStyle}>
                <Github size={14} />
                Open Issue #{detail.project.github.issue_number}
                <ExternalLink size={12} />
              </a>
            ) : null}
          </div>

          <div>
            <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', marginBottom: 10 }}>
              PRD
            </div>
            <div style={{ borderRadius: 12, border: '1px solid var(--border-default)', padding: 14, background: 'var(--bg-base)' }}>
              <MarkdownRenderer content={detail.prdContent} />
            </div>
          </div>
        </div>
      ) : null}
    </aside>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div style={{ padding: 24, color: 'var(--text-muted)', fontSize: 13 }}>
      {text}
    </div>
  );
}

const closeButtonStyle: React.CSSProperties = {
  width: 28,
  height: 28,
  borderRadius: 8,
  border: '1px solid var(--border-default)',
  background: 'transparent',
  color: 'var(--text-muted)',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};

const metaPill: React.CSSProperties = {
  borderRadius: 999,
  padding: '4px 9px',
  background: 'var(--bg-hover)',
  color: 'var(--text-secondary)',
  fontSize: 11,
};

const linkStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 8,
  color: 'var(--text-secondary)',
  textDecoration: 'none',
  fontSize: 13,
};
