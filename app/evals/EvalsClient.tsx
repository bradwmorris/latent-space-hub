'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

type ToolCall = {
  tool: string;
  args: Record<string, unknown>;
  result: unknown;
  duration_ms: number;
  error?: string;
};

type TraceMetadata = {
  discord_user_id?: string;
  discord_username?: string;
  discord_channel_id?: string;
  discord_message_id?: string;
  retrieval_method?: string;
  context_node_ids?: number[];
  tool_calls?: ToolCall[];
  member_id?: number | null;
  model?: string;
  is_slash_command?: boolean;
  slash_command?: string | null;
  is_kickoff?: boolean;
  response_length?: number;
  latency_ms?: number;
};

type Trace = {
  id: number;
  user_message: string | null;
  assistant_message: string | null;
  thread_id: string | null;
  helper_name: string | null;
  agent_type: string | null;
  metadata: TraceMetadata | null;
  created_at: string | null;
};

type ApiResponse = {
  traces: Trace[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};

const FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'slash', label: 'Slash commands' },
  { value: 'kickoff', label: 'Kickoffs' },
  { value: 'tools', label: 'With tools' },
] as const;

function formatTime(iso: string | null): string {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    return d.toLocaleString('en-AU', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  } catch {
    return iso;
  }
}

function truncate(text: string | null, max = 80): string {
  if (!text) return '—';
  const clean = text.replace(/\s+/g, ' ').trim();
  return clean.length > max ? `${clean.slice(0, max)}...` : clean;
}

export default function EvalsClient() {
  const [traces, setTraces] = useState<Trace[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const fetchTraces = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: '25', filter });
      if (search) params.set('search', search);
      const res = await fetch(`/api/evals?${params}`);
      if (!res.ok) throw new Error(`${res.status}`);
      const data: ApiResponse = await res.json();
      setTraces(data.traces);
      setTotal(data.total);
      setTotalPages(data.totalPages);
    } catch (err) {
      console.error('Failed to fetch traces:', err);
    } finally {
      setLoading(false);
    }
  }, [page, filter, search]);

  useEffect(() => { fetchTraces(); }, [fetchTraces]);

  const handleSearch = () => {
    setPage(1);
    setSearch(searchInput);
  };

  const expanded = useMemo(() => traces.find((t) => t.id === expandedId) || null, [traces, expandedId]);

  return (
    <div style={{ flex: 1, height: '100%', overflowY: 'auto', background: '#0a0a0a', color: '#e0e0e0', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace' }}>
      <div style={{ padding: 24, maxWidth: 1400, margin: '0 auto' }}>
        {/* Header */}
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ fontSize: 20, fontWeight: 600, color: '#a78bfa', marginBottom: 4 }}>
            Evals — Slop Discord Traces
          </h1>
          <div style={{ fontSize: 13, color: '#666' }}>
            {total} trace{total !== 1 ? 's' : ''} logged
          </div>
        </div>

        {/* Filters */}
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 16 }}>
          {FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => { setFilter(f.value); setPage(1); }}
              style={{
                padding: '5px 12px',
                borderRadius: 6,
                border: filter === f.value ? '1px solid #a78bfa' : '1px solid #333',
                background: filter === f.value ? '#1e1b2e' : '#111',
                color: filter === f.value ? '#a78bfa' : '#999',
                cursor: 'pointer',
                fontSize: 12,
                fontFamily: 'inherit',
              }}
            >
              {f.label}
            </button>
          ))}
          <div style={{ display: 'flex', gap: 4 }}>
            <input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              placeholder="Search messages..."
              style={{
                padding: '5px 10px', borderRadius: 6, border: '1px solid #333',
                background: '#111', color: '#ccc', fontSize: 12, fontFamily: 'inherit', minWidth: 200,
              }}
            />
            <button
              onClick={handleSearch}
              style={{
                padding: '5px 10px', borderRadius: 6, border: '1px solid #333',
                background: '#111', color: '#999', cursor: 'pointer', fontSize: 12, fontFamily: 'inherit',
              }}
            >
              Go
            </button>
          </div>
        </div>

        {/* Table */}
        <div style={{ border: '1px solid #222', borderRadius: 8, overflow: 'hidden', marginBottom: 16 }}>
          {loading ? (
            <div style={{ padding: 24, textAlign: 'center', color: '#555' }}>Loading...</div>
          ) : traces.length === 0 ? (
            <div style={{ padding: 24, textAlign: 'center', color: '#555' }}>No traces found. Slop hasn&apos;t logged any Discord interactions yet.</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #222', background: '#111' }}>
                  <th style={th}>Time</th>
                  <th style={th}>User</th>
                  <th style={th}>Type</th>
                  <th style={th}>Message</th>
                  <th style={th}>Tools</th>
                  <th style={th}>Retrieval</th>
                  <th style={th}>Latency</th>
                </tr>
              </thead>
              <tbody>
                {traces.map((trace) => {
                  const m = trace.metadata;
                  const toolCount = m?.tool_calls?.length || 0;
                  const isExpanded = expandedId === trace.id;
                  return (
                    <tr
                      key={trace.id}
                      onClick={() => setExpandedId(isExpanded ? null : trace.id)}
                      style={{
                        cursor: 'pointer',
                        borderBottom: '1px solid #1a1a1a',
                        background: isExpanded ? '#1a1528' : 'transparent',
                      }}
                    >
                      <td style={td}>{formatTime(trace.created_at)}</td>
                      <td style={td}>
                        <span style={{ color: '#a78bfa' }}>@{m?.discord_username || '?'}</span>
                      </td>
                      <td style={td}>
                        {m?.is_kickoff ? (
                          <span style={badge('#2d1f0a', '#f59e0b')}>kickoff</span>
                        ) : m?.is_slash_command ? (
                          <span style={badge('#0a2d1f', '#34d399')}>/{m.slash_command}</span>
                        ) : (
                          <span style={badge('#1a1a1a', '#666')}>message</span>
                        )}
                      </td>
                      <td style={{ ...td, maxWidth: 400 }}>{truncate(trace.user_message)}</td>
                      <td style={td}>
                        {toolCount > 0 ? (
                          <span style={badge('#1e1b2e', '#a78bfa')}>{toolCount}</span>
                        ) : (
                          <span style={{ color: '#444' }}>0</span>
                        )}
                      </td>
                      <td style={td}>
                        <span style={{ color: '#666' }}>{m?.retrieval_method || '—'}</span>
                      </td>
                      <td style={td}>
                        {m?.latency_ms != null ? `${(m.latency_ms / 1000).toFixed(1)}s` : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div style={{ display: 'flex', justifyContent: 'center', gap: 12, alignItems: 'center', marginBottom: 24 }}>
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              style={paginationBtn(page <= 1)}
            >
              prev
            </button>
            <span style={{ fontSize: 12, color: '#666' }}>
              page {page} of {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              style={paginationBtn(page >= totalPages)}
            >
              next
            </button>
          </div>
        )}

        {/* Expanded Trace Detail */}
        {expanded && <TraceDetail trace={expanded} />}
      </div>
    </div>
  );
}

function TraceDetail({ trace }: { trace: Trace }) {
  const m = trace.metadata;
  const toolCalls = m?.tool_calls || [];

  return (
    <div style={{ border: '1px solid #222', borderRadius: 8, background: '#111', padding: 20 }}>
      {/* Trace header */}
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 16, fontSize: 12 }}>
        <div><span style={{ color: '#666' }}>Trace</span> <span style={{ color: '#a78bfa' }}>#{trace.id}</span></div>
        <div><span style={{ color: '#666' }}>Time</span> {formatTime(trace.created_at)}</div>
        <div><span style={{ color: '#666' }}>User</span> <span style={{ color: '#a78bfa' }}>@{m?.discord_username || '?'}</span> <span style={{ color: '#555' }}>({m?.discord_user_id})</span></div>
        <div><span style={{ color: '#666' }}>Latency</span> {m?.latency_ms != null ? `${(m.latency_ms / 1000).toFixed(2)}s` : '—'}</div>
        <div><span style={{ color: '#666' }}>Model</span> {m?.model || '—'}</div>
        <div><span style={{ color: '#666' }}>Retrieval</span> {m?.retrieval_method || '—'}</div>
        {m?.member_id && <div><span style={{ color: '#666' }}>Member</span> node #{m.member_id}</div>}
        {m?.context_node_ids && m.context_node_ids.length > 0 && (
          <div><span style={{ color: '#666' }}>Context nodes</span> {m.context_node_ids.join(', ')}</div>
        )}
      </div>

      {/* User message */}
      <Section title="User Message">
        <pre style={preStyle}>{trace.user_message || '—'}</pre>
      </Section>

      {/* Tool calls */}
      {toolCalls.length > 0 && (
        <Section title={`Tool Calls (${toolCalls.length})`}>
          {toolCalls.map((tc, idx) => (
            <div key={idx} style={{ marginBottom: idx < toolCalls.length - 1 ? 12 : 0, paddingBottom: idx < toolCalls.length - 1 ? 12 : 0, borderBottom: idx < toolCalls.length - 1 ? '1px solid #1a1a1a' : 'none' }}>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 6, fontSize: 12 }}>
                <span style={{ color: '#a78bfa', fontWeight: 600 }}>{idx + 1}. {tc.tool}</span>
                <span style={{ color: '#555' }}>{tc.duration_ms}ms</span>
                {tc.error && <span style={badge('#2d0a0a', '#f87171')}>error</span>}
              </div>
              <div style={{ fontSize: 11 }}>
                <div style={{ color: '#666', marginBottom: 2 }}>Args:</div>
                <pre style={{ ...preStyle, fontSize: 11, marginBottom: 6 }}>{JSON.stringify(tc.args, null, 2)}</pre>
                {tc.error ? (
                  <>
                    <div style={{ color: '#f87171', marginBottom: 2 }}>Error:</div>
                    <pre style={{ ...preStyle, fontSize: 11, color: '#f87171' }}>{tc.error}</pre>
                  </>
                ) : (
                  <>
                    <div style={{ color: '#666', marginBottom: 2 }}>Result:</div>
                    <pre style={{ ...preStyle, fontSize: 11 }}>{typeof tc.result === 'string' ? tc.result : JSON.stringify(tc.result, null, 2)}</pre>
                  </>
                )}
              </div>
            </div>
          ))}
        </Section>
      )}

      {/* Response */}
      <Section title="Response">
        <pre style={preStyle}>{trace.assistant_message || '—'}</pre>
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 11, color: '#555', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6, borderBottom: '1px solid #1a1a1a', paddingBottom: 4 }}>
        {title}
      </div>
      {children}
    </div>
  );
}

// Styles
const th: React.CSSProperties = { padding: '8px 10px', textAlign: 'left', color: '#555', fontWeight: 500, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em' };
const td: React.CSSProperties = { padding: '8px 10px', verticalAlign: 'top' };
const preStyle: React.CSSProperties = { whiteSpace: 'pre-wrap', wordBreak: 'break-word', margin: 0, padding: 10, background: '#0a0a0a', borderRadius: 4, fontSize: 12, lineHeight: 1.5, color: '#ccc', maxHeight: 300, overflowY: 'auto' };

function badge(bg: string, color: string): React.CSSProperties {
  return { display: 'inline-block', padding: '2px 8px', borderRadius: 4, fontSize: 11, background: bg, color, fontFamily: 'inherit' };
}

function paginationBtn(disabled: boolean): React.CSSProperties {
  return {
    padding: '5px 14px', borderRadius: 6, border: '1px solid #333',
    background: disabled ? '#0a0a0a' : '#111', color: disabled ? '#333' : '#999',
    cursor: disabled ? 'default' : 'pointer', fontSize: 12, fontFamily: 'inherit',
  };
}
