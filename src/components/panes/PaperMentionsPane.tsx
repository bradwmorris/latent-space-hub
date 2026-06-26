"use client";

import { useEffect, useState } from 'react';
import { ExternalLink, FileText, UserRound } from 'lucide-react';
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
    <div style={{ flex: 1, overflowY: 'auto', background: 'var(--bg-base)' }}>
      <div style={{
        padding: '22px 28px 18px',
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'space-between',
        borderBottom: '1px solid var(--bg-elevated)',
        background: 'var(--bg-surface)',
      }}>
        <div>
          <div style={{ fontSize: '18px', fontWeight: 650, color: 'var(--text-primary)', lineHeight: 1.2 }}>
            Papers
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '5px' }}>
            Recently shared papers and technical reports
          </div>
        </div>
        <div style={{
          color: 'var(--accent-brand)',
          background: 'rgba(139, 92, 246, 0.1)',
          border: '1px solid rgba(139, 92, 246, 0.22)',
          borderRadius: '6px',
          padding: '5px 9px',
          fontSize: '12px',
          fontWeight: 600,
          fontVariantNumeric: 'tabular-nums',
        }}>
          {rows.length}
        </div>
      </div>

      {rows.length === 0 ? (
        <div style={{ padding: '24px', color: 'var(--text-muted)', fontSize: '13px' }}>
          No papers yet.
        </div>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))',
          gap: '14px',
          padding: '18px',
          alignItems: 'stretch',
        }}>
          {rows.map((row) => (
            <div
              key={row.id}
              style={{
                padding: '16px',
                border: '1px solid var(--bg-elevated)',
                borderRadius: '8px',
                background: 'var(--bg-surface)',
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
                minHeight: '230px',
              }}
            >
              <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <a
                  href={row.paper_url}
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    color: 'var(--text-primary)',
                    fontSize: '14px',
                    fontWeight: 650,
                    lineHeight: 1.32,
                    textDecoration: 'none',
                    display: 'inline-flex',
                    gap: '6px',
                    alignItems: 'flex-start',
                  }}
                >
                  <span>{row.title}</span>
                  <ExternalLink size={13} style={{ flexShrink: 0, marginTop: '2px', color: 'var(--accent-dark)' }} />
                </a>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center' }}>
                  <span style={{
                    color: 'var(--text-muted)',
                    background: 'var(--bg-elevated)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: '5px',
                    padding: '2px 7px',
                    fontSize: '11px',
                    display: 'inline-flex',
                    gap: '4px',
                    alignItems: 'center',
                  }}>
                    <UserRound size={11} />
                    {suggestedBy(row)}
                  </span>
                  <span style={{
                    color: 'var(--text-muted)',
                    background: 'var(--bg-elevated)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: '5px',
                    padding: '2px 7px',
                    fontSize: '11px',
                    fontFamily: 'var(--font-mono)',
                  }}>
                    {formatDate(row.created_at)}
                  </span>
                  {row.status === 'scheduled' && (
                    <span style={{
                      color: '#8b5cf6',
                      background: 'rgba(139, 92, 246, 0.1)',
                      border: '1px solid rgba(139, 92, 246, 0.24)',
                      borderRadius: '5px',
                      padding: '2px 7px',
                      fontSize: '10px',
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      letterSpacing: '0.04em',
                    }}>
                      Scheduled
                    </span>
                  )}
                </div>
              </div>
              <div style={{
                color: 'var(--accent-dark)',
                fontSize: '12.5px',
                lineHeight: 1.5,
                whiteSpace: 'pre-wrap',
                flex: 1,
              }}>
                {row.summary}
              </div>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '10px',
                paddingTop: '10px',
                borderTop: '1px solid var(--bg-elevated)',
              }}>
                <span style={{
                  color: 'var(--text-muted)',
                  fontSize: '11px',
                  display: 'inline-flex',
                  gap: '5px',
                  alignItems: 'center',
                  minWidth: 0,
                }}>
                  <FileText size={12} />
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {new URL(row.paper_url).hostname.replace(/^www\./, '')}
                  </span>
                </span>
                <a
                  href={row.paper_url}
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    color: 'var(--accent-brand)',
                    fontSize: '12px',
                    fontWeight: 600,
                    textDecoration: 'none',
                    flexShrink: 0,
                  }}
                >
                  Open
                </a>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
