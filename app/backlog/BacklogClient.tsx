'use client';

import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import BacklogBoard from '@/components/backlog/BacklogBoard';
import BacklogCalendar from '@/components/backlog/BacklogCalendar';
import BacklogDetailPanel from '@/components/backlog/BacklogDetailPanel';
import BacklogToolbar from '@/components/backlog/BacklogToolbar';
import type { BacklogOverview } from '@/services/backlog';

export default function BacklogClient() {
  const searchParams = useSearchParams();
  const initialProjectId = searchParams.get('id');

  const [data, setData] = useState<BacklogOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<'board' | 'calendar'>('board');
  const [selectedId, setSelectedId] = useState<string | null>(initialProjectId);

  useEffect(() => {
    fetch('/api/backlog')
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok || !payload.success) {
          throw new Error(payload.error || 'Failed to load backlog');
        }
        setData(payload.data);
      })
      .catch((fetchError) => {
        setError(fetchError instanceof Error ? fetchError.message : 'Failed to load backlog');
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (initialProjectId) {
      setSelectedId(initialProjectId);
    }
  }, [initialProjectId]);

  const completed = useMemo(() => data?.completed || [], [data]);

  if (loading) {
    return <Shell><StateMessage text="Loading backlog..." /></Shell>;
  }

  if (error || !data) {
    return <Shell><StateMessage text={error || 'Failed to load backlog'} /></Shell>;
  }

  return (
    <Shell>
      <div style={{ display: 'flex', height: '100%' }}>
        <div style={{ flex: 1, minWidth: 0, overflowY: 'auto' }}>
          <div style={{ padding: 24, maxWidth: 1700, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 20 }}>
            <BacklogToolbar
              view={view}
              onViewChange={setView}
              totalItems={data.queue.length}
              githubEnabled={data.githubEnabled}
              lastUpdated={data.lastUpdated}
            />

            <div style={{ borderRadius: 18, border: '1px solid var(--border-default)', background: 'linear-gradient(180deg, rgba(147,51,234,0.08), transparent 180px), var(--bg-base)', padding: 18, overflowX: 'auto' }}>
              {view === 'board' ? (
                <BacklogBoard columns={data.columns} onSelectProject={setSelectedId} />
              ) : (
                <BacklogCalendar projects={data.queue} onSelectProject={setSelectedId} />
              )}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
              {completed.slice(0, 6).map((item) => (
                <div
                  key={item.id}
                  style={{
                    borderRadius: 12,
                    border: '1px solid var(--border-default)',
                    background: 'var(--bg-surface)',
                    padding: 14,
                  }}
                >
                  <div style={{ fontSize: 11, color: 'var(--accent-brand-light)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Completed</div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.4, marginTop: 8 }}>
                    {item.title}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8 }}>
                    {item.completedDateLabel}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <BacklogDetailPanel projectId={selectedId} onClose={() => setSelectedId(null)} />
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        height: '100vh',
        background: 'radial-gradient(circle at top left, rgba(147,51,234,0.12), transparent 25%), var(--bg-base)',
        color: 'var(--text-primary)',
      }}
    >
      {children}
    </div>
  );
}

function StateMessage({ text }: { text: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)' }}>
      {text}
    </div>
  );
}
