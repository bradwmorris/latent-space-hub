"use client";

import { useEffect, useState } from 'react';
import { CalendarDays, ExternalLink, FileText } from 'lucide-react';
import type { PaperMention } from '@/services/database/paperMentions';
import type { Node } from '@/types/database';

type ScheduledPaperEvent = {
  id: number;
  title: string;
  paperTitle: string;
  paperUrl: string | null;
  eventDate: string | null;
  presenterName: string;
  presenterDiscordId: string | null;
  presenterAvatarUrl: string | null;
};

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

function safeHost(url: string | null | undefined): string {
  if (!url) return 'source';
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return 'source';
  }
}

function Avatar({
  src,
  label,
}: {
  src?: string | null;
  label: string;
}) {
  const initial = label.replace(/^@/, '').trim().charAt(0).toUpperCase() || '?';
  if (src) {
    return (
      <img
        src={src}
        alt=""
        loading="lazy"
        style={{
          width: '26px',
          height: '26px',
          borderRadius: '999px',
          objectFit: 'cover',
          border: '1px solid var(--border-default)',
          background: 'var(--bg-elevated)',
          flexShrink: 0,
        }}
      />
    );
  }
  return (
    <span style={{
      width: '26px',
      height: '26px',
      borderRadius: '999px',
      border: '1px solid var(--border-default)',
      background: 'var(--bg-elevated)',
      color: 'var(--text-muted)',
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: '12px',
      fontWeight: 650,
      flexShrink: 0,
    }}>
      {initial}
    </span>
  );
}

export default function PaperMentionsPane() {
  const [rows, setRows] = useState<PaperMention[]>([]);
  const [scheduledEvents, setScheduledEvents] = useState<ScheduledPaperEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      fetch('/api/paper-mentions?limit=200').then((res) => res.json()),
      fetch('/api/nodes?type=event&limit=120&sortBy=event_date').then((res) => res.json()),
      fetch('/api/nodes?type=member&limit=300').then((res) => res.json()),
    ])
      .then(([paperData, eventData, memberData]) => {
        setRows(paperData.success ? paperData.data : []);
        const avatarByDiscordId = new Map<string, string>();
        const avatarByHandle = new Map<string, string>();
        if (memberData.success) {
          for (const member of memberData.data as Node[]) {
            const meta = member.metadata as any;
            if (!meta?.avatar_url) continue;
            if (meta.discord_id) avatarByDiscordId.set(String(meta.discord_id), meta.avatar_url);
            if (meta.discord_handle) avatarByHandle.set(String(meta.discord_handle).toLowerCase(), meta.avatar_url);
            if (member.title) avatarByHandle.set(member.title.toLowerCase(), meta.avatar_url);
          }
        }
        const today = new Date().toISOString().slice(0, 10);
        const events: ScheduledPaperEvent[] = eventData.success
          ? (eventData.data as Node[])
              .filter((node) => {
                const meta = node.metadata as any;
                return meta?.event_type === 'paper-club' &&
                  meta?.event_status === 'scheduled' &&
                  Boolean(node.event_date) &&
                  (node.event_date || '') >= today;
              })
              .map((node) => {
                const meta = node.metadata as any;
                const presenterName = String(meta?.presenter_name || 'TBD');
                const presenterDiscordId = meta?.presenter_discord_id ? String(meta.presenter_discord_id) : null;
                return {
                  id: node.id,
                  title: node.title,
                  paperTitle: String(meta?.paper_title || node.title.replace(/^Paper Club:\s*/i, '')),
                  paperUrl: meta?.paper_url ? String(meta.paper_url) : node.link || null,
                  eventDate: node.event_date || null,
                  presenterName,
                  presenterDiscordId,
                  presenterAvatarUrl: presenterDiscordId
                    ? avatarByDiscordId.get(presenterDiscordId) || null
                    : avatarByHandle.get(presenterName.toLowerCase()) || null,
                };
              })
          : [];
        setScheduledEvents(events);
      })
      .catch(() => {
        setRows([]);
        setScheduledEvents([]);
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
        Loading...
      </div>
    );
  }

  const backlogRows = rows.filter((row) => row.status !== 'scheduled');
  const totalCount = backlogRows.length + scheduledEvents.length;

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
            Recently shared papers and scheduled Paper Club sessions
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
          {totalCount}
        </div>
      </div>

      {totalCount === 0 ? (
        <div style={{ padding: '24px', color: 'var(--text-muted)', fontSize: '13px' }}>
          No papers yet.
        </div>
      ) : (
        <div style={{ padding: '18px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
          <PaperSection title="Mentioned Papers" count={backlogRows.length} rows={backlogRows} />
          <ScheduledSection rows={scheduledEvents} />
        </div>
      )}
    </div>
  );
}

function PaperSection({
  title,
  count,
  rows,
  scheduled = false,
}: {
  title: string;
  count: number;
  rows: PaperMention[];
  scheduled?: boolean;
}) {
  return (
    <section>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 2px 10px',
      }}>
        <h2 style={{
          margin: 0,
          color: 'var(--text-secondary)',
          fontSize: '12px',
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
        }}>
          {title}
        </h2>
        <span style={{ color: 'var(--text-muted)', fontSize: '11px', fontVariantNumeric: 'tabular-nums' }}>
          {count}
        </span>
      </div>
      {rows.length === 0 ? (
        <div style={{
          border: '1px solid var(--bg-elevated)',
          borderRadius: '8px',
          background: 'var(--bg-surface)',
          color: 'var(--text-muted)',
          padding: '18px',
          fontSize: '13px',
        }}>
          {scheduled ? 'No scheduled Paper Club sessions yet.' : 'No unscheduled papers yet.'}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {rows.map((row) => <PaperRow key={row.id} row={row} scheduled={scheduled} />)}
        </div>
      )}
    </section>
  );
}

function PaperRow({ row, scheduled }: { row: PaperMention; scheduled: boolean }) {
  const suggester = suggestedBy(row);
  const presenter = row.scheduled_presenter_name || row.scheduled_presenter_discord_id || 'TBD';
  const host = safeHost(row.paper_url);
  return (
    <article style={{
      padding: '16px',
      border: '1px solid var(--bg-elevated)',
      borderRadius: '8px',
      background: 'var(--bg-surface)',
      display: 'flex',
      flexWrap: 'wrap',
      gap: '14px',
      alignItems: 'start',
    }}>
      {row.thumbnail_url && (
        <img
          src={row.thumbnail_url}
          alt=""
          loading="lazy"
          style={{
            width: '148px',
            aspectRatio: '16 / 10',
            objectFit: 'cover',
            borderRadius: '7px',
            border: '1px solid var(--bg-elevated)',
            background: 'var(--bg-base)',
            flexShrink: 0,
          }}
        />
      )}
      <div style={{ minWidth: '240px', flex: '1 1 360px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
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
        <div style={{ color: 'var(--accent-dark)', fontSize: '12.5px', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
          {row.summary}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
          <span style={{ color: 'var(--text-muted)', fontSize: '11px', display: 'inline-flex', gap: '5px', alignItems: 'center' }}>
            <FileText size={12} />
            {host}
          </span>
          <span style={{ color: 'var(--text-muted)', fontSize: '11px', fontFamily: 'var(--font-mono)' }}>
            {formatDate(row.created_at)}
          </span>
          {scheduled && row.scheduled_event_date && (
            <span style={{ color: '#8b5cf6', fontSize: '11px', display: 'inline-flex', gap: '5px', alignItems: 'center' }}>
              <CalendarDays size={12} />
              {formatDate(row.scheduled_event_date)}
            </span>
          )}
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', minWidth: '190px', flex: '0 1 220px' }}>
        <PersonChip label="Added by" name={suggester} avatarUrl={row.suggested_by_avatar_url} />
        {scheduled && (
          <PersonChip label="Speaker" name={presenter} avatarUrl={row.scheduled_presenter_avatar_url} accent />
        )}
      </div>
    </article>
  );
}

function ScheduledSection({ rows }: { rows: ScheduledPaperEvent[] }) {
  return (
    <section>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 2px 10px',
      }}>
        <h2 style={{
          margin: 0,
          color: 'var(--text-secondary)',
          fontSize: '12px',
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
        }}>
          Scheduled Paper Club
        </h2>
        <span style={{ color: 'var(--text-muted)', fontSize: '11px', fontVariantNumeric: 'tabular-nums' }}>
          {rows.length}
        </span>
      </div>
      {rows.length === 0 ? (
        <div style={{
          border: '1px solid var(--bg-elevated)',
          borderRadius: '8px',
          background: 'var(--bg-surface)',
          color: 'var(--text-muted)',
          padding: '18px',
          fontSize: '13px',
        }}>
          No scheduled Paper Club sessions yet.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {rows.map((row) => <ScheduledRow key={row.id} row={row} />)}
        </div>
      )}
    </section>
  );
}

function ScheduledRow({ row }: { row: ScheduledPaperEvent }) {
  const content = (
    <>
      <span>{row.paperTitle}</span>
      {row.paperUrl && <ExternalLink size={13} style={{ flexShrink: 0, marginTop: '2px', color: 'var(--accent-dark)' }} />}
    </>
  );
  return (
    <article style={{
      padding: '16px',
      border: '1px solid rgba(139, 92, 246, 0.22)',
      borderRadius: '8px',
      background: 'rgba(139, 92, 246, 0.055)',
      display: 'flex',
      flexWrap: 'wrap',
      gap: '14px',
      alignItems: 'start',
    }}>
      <div style={{ minWidth: '240px', flex: '1 1 360px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {row.paperUrl ? (
          <a
            href={row.paperUrl}
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
            {content}
          </a>
        ) : (
          <div style={{ color: 'var(--text-primary)', fontSize: '14px', fontWeight: 650, lineHeight: 1.32 }}>
            {row.paperTitle}
          </div>
        )}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
          {row.paperUrl && (
            <span style={{ color: 'var(--text-muted)', fontSize: '11px', display: 'inline-flex', gap: '5px', alignItems: 'center' }}>
              <FileText size={12} />
              {safeHost(row.paperUrl)}
            </span>
          )}
          {row.eventDate && (
            <span style={{ color: '#8b5cf6', fontSize: '11px', display: 'inline-flex', gap: '5px', alignItems: 'center' }}>
              <CalendarDays size={12} />
              {formatDate(row.eventDate)}
            </span>
          )}
        </div>
      </div>
      <div style={{ minWidth: '190px', flex: '0 1 220px' }}>
        <PersonChip label="Speaker" name={row.presenterName} avatarUrl={row.presenterAvatarUrl} accent />
      </div>
    </article>
  );
}

function PersonChip({
  label,
  name,
  avatarUrl,
  accent = false,
}: {
  label: string;
  name: string;
  avatarUrl?: string | null;
  accent?: boolean;
}) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      padding: '8px',
      borderRadius: '8px',
      border: accent ? '1px solid rgba(139, 92, 246, 0.24)' : '1px solid var(--bg-elevated)',
      background: accent ? 'rgba(139, 92, 246, 0.08)' : 'var(--bg-base)',
      minWidth: 0,
    }}>
      <Avatar src={avatarUrl} label={name} />
      <span style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: '2px' }}>
        <span style={{ color: 'var(--text-muted)', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
          {label}
        </span>
        <span style={{ color: 'var(--text-secondary)', fontSize: '12px', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '130px' }}>
          {name}
        </span>
      </span>
    </div>
  );
}
