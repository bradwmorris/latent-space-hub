"use client";

import { useEffect, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import type { PaperMention } from '@/services/database/paperMentions';

function formatDate(value: string | null | undefined): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function suggestedBy(row: PaperMention): string {
  if (row.suggested_by_handle) return `@${row.suggested_by_handle}`;
  if (row.suggested_by_discord_id) return `<@${row.suggested_by_discord_id}>`;
  return 'unknown';
}

export default function PaperMentionsPane() {
  const [rows, setRows] = useState<PaperMention[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch('/api/paper-mentions?limit=200')
      .then((res) => res.json())
      .then((data) => setRows(data.success ? data.data : []))
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
        Loading...
      </div>
    );
  }

  return (
    <div style={{ flex: 1, overflowY: 'auto' }}>
      <div style={{
        padding: '16px 24px 12px',
        display: 'flex',
        alignItems: 'baseline',
        justifyContent: 'space-between',
        borderBottom: '1px solid var(--bg-elevated)',
      }}>
        <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)' }}>
          Mentioned Papers
        </span>
        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
          {rows.length} paper{rows.length !== 1 ? 's' : ''}
        </span>
      </div>

      {rows.length === 0 ? (
        <div style={{ padding: '24px', color: 'var(--text-muted)', fontSize: '13px' }}>
          No mentioned papers yet.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {rows.map((row) => (
            <div
              key={row.id}
              style={{
                padding: '14px 24px',
                borderBottom: '1px solid var(--bg-hover)',
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                gap: '16px',
                alignItems: 'start',
              }}
            >
              <div style={{ minWidth: 0 }}>
                <a
                  href={row.paper_url}
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    color: 'var(--text-primary)',
                    fontSize: '13px',
                    fontWeight: 600,
                    lineHeight: 1.35,
                    textDecoration: 'none',
                    display: 'inline-flex',
                    gap: '6px',
                    alignItems: 'baseline',
                  }}
                >
                  <span>{row.title}</span>
                  <ExternalLink size={12} style={{ flexShrink: 0 }} />
                </a>
                {row.status === 'scheduled' && (
                  <div style={{
                    marginTop: '6px',
                    color: '#8b5cf6',
                    fontSize: '10px',
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                  }}>
                    Scheduled
                  </div>
                )}
              </div>
              <div style={{
                color: 'var(--accent-dark)',
                fontSize: '12px',
                lineHeight: 1.5,
                whiteSpace: 'pre-wrap',
              }}>
                {row.summary}
              </div>
              <div style={{ color: 'var(--text-secondary)', fontSize: '12px', lineHeight: 1.4 }}>
                {suggestedBy(row)}
              </div>
              <div style={{ color: 'var(--text-muted)', fontSize: '12px', fontFamily: 'var(--font-mono)' }}>
                {formatDate(row.created_at)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
