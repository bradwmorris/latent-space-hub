'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

type ToolCall = {
  tool: string;
  args: Record<string, unknown>;
  result: unknown;
  duration_ms: number;
  error?: string;
};

type OpenRouterUsage = Record<string, unknown>;

type TraceMetadata = {
  interaction_kind?: string;
  discord_user_id?: string;
  discord_username?: string;
  discord_channel_id?: string;
  discord_message_id?: string;
  retrieval_method?: string;
  context_node_ids?: number[];
  tool_calls?: ToolCall[];
  tools_used?: string[];
  skills_used?: string[];
  member_id?: number | null;
  model?: string;
  is_slash_command?: boolean;
  slash_command?: string | null;
  is_kickoff?: boolean;
  response_length?: number;
  latency_ms?: number;
  system_message?: string | null;
  llm_messages?: unknown;
  llm_request_payload?: unknown;
  openrouter_response_id?: string | null;
  openrouter_provider?: string | null;
  openrouter_usage?: OpenRouterUsage | null;
  estimated_cost_usd?: number | null;
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
    return d.toLocaleString('en-AU', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
  } catch {
    return iso;
  }
}

function truncate(text: string | null, max = 80): string {
  if (!text) return '—';
  const clean = text.replace(/\s+/g, ' ').trim();
  return clean.length > max ? `${clean.slice(0, max)}...` : clean;
}

function interactionLabel(metadata: TraceMetadata | null): string {
  if (!metadata) return 'Unknown interaction';
  if (metadata.interaction_kind) return metadata.interaction_kind;
  if (metadata.is_kickoff) return 'Kickoff post from newly ingested content';
  if (metadata.is_slash_command) return `Slash command: /${metadata.slash_command || 'unknown'}`;
  if (metadata.retrieval_method === 'smalltalk') return 'Thread chat / small talk';
  if (metadata.retrieval_method === 'agentic') return 'Thread user request answered with retrieval';
  if (metadata.retrieval_method === 'event_create') return 'Event scheduling workflow';
  return 'Discord interaction';
}

function extractCostUsd(metadata: TraceMetadata | null): number | null {
  if (!metadata) return null;
  if (typeof metadata.estimated_cost_usd === 'number' && Number.isFinite(metadata.estimated_cost_usd)) return metadata.estimated_cost_usd;
  const usage = metadata.openrouter_usage;
  if (!usage) return null;
  const candidates = [usage.total_cost, usage.cost, usage.estimated_cost, usage.usd_cost, usage.total_cost_usd];
  for (const value of candidates) {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim()) {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return null;
}

function formatCostUsd(cost: number | null): string {
  if (cost == null) return '—';
  return `$${cost.toFixed(cost < 0.01 ? 4 : 3)}`;
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

  useEffect(() => {
    fetchTraces();
  }, [fetchTraces]);

  const handleSearch = () => {
    setPage(1);
    setSearch(searchInput);
  };

  const expanded = useMemo(() => traces.find((t) => t.id === expandedId) || null, [traces, expandedId]);

  return (
    <div
      style={{
        flex: 1,
        height: '100%',
        overflowY: 'auto',
        background: 'var(--bg-base)',
        color: 'var(--text-primary)',
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
      }}
    >
      <div style={{ padding: 24, maxWidth: 1500, margin: '0 auto' }}>
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ fontSize: 20, fontWeight: 600, color: 'var(--accent-brand-light)', marginBottom: 4 }}>Evals - Slop Discord Traces</h1>
          <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>{total} trace{total !== 1 ? 's' : ''} logged</div>
        </div>

        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 16 }}>
          {FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => {
                setFilter(f.value);
                setPage(1);
              }}
              style={{
                padding: '5px 12px',
                borderRadius: 6,
                border: filter === f.value ? '1px solid var(--accent-brand-light)' : '1px solid var(--border-default)',
                background: filter === f.value ? 'var(--accent-brand-subtle)' : 'var(--bg-surface)',
                color: filter === f.value ? 'var(--accent-brand-light)' : 'var(--text-muted)',
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
              placeholder="Search messages, responses, or interaction type..."
              style={{
                padding: '5px 10px',
                borderRadius: 6,
                border: '1px solid var(--border-default)',
                background: 'var(--bg-surface)',
                color: 'var(--text-secondary)',
                fontSize: 12,
                fontFamily: 'inherit',
                minWidth: 300,
              }}
            />
            <button
              onClick={handleSearch}
              style={{
                padding: '5px 10px',
                borderRadius: 6,
                border: '1px solid var(--border-default)',
                background: 'var(--bg-surface)',
                color: 'var(--text-muted)',
                cursor: 'pointer',
                fontSize: 12,
                fontFamily: 'inherit',
              }}
            >
              Go
            </button>
          </div>
        </div>

        <div style={{ border: '1px solid var(--border-default)', borderRadius: 8, overflow: 'hidden', marginBottom: 16 }}>
          {loading ? (
            <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)' }}>Loading...</div>
          ) : traces.length === 0 ? (
            <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)' }}>No traces found. Slop has not logged any Discord interactions yet.</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-default)', background: 'var(--bg-surface)' }}>
                  <th style={th}>Time</th>
                  <th style={th}>User</th>
                  <th style={th}>Type</th>
                  <th style={th}>Interaction</th>
                  <th style={th}>Message</th>
                  <th style={th}>Tools</th>
                  <th style={th}>Cost</th>
                  <th style={th}>Latency</th>
                </tr>
              </thead>
              <tbody>
                {traces.map((trace) => {
                  const m = trace.metadata;
                  const toolCount = m?.tool_calls?.length || 0;
                  const isExpanded = expandedId === trace.id;
                  const cost = extractCostUsd(m);
                  return (
                    <tr
                      key={trace.id}
                      onClick={() => setExpandedId(isExpanded ? null : trace.id)}
                      style={{
                        cursor: 'pointer',
                        borderBottom: '1px solid var(--border-subtle)',
                        background: isExpanded ? 'var(--accent-brand-subtle)' : 'transparent',
                      }}
                    >
                      <td style={td}>{formatTime(trace.created_at)}</td>
                      <td style={td}>
                        <span style={{ color: 'var(--accent-brand-light)' }}>@{m?.discord_username || '?'}</span>
                      </td>
                      <td style={td}>
                        {m?.is_kickoff ? (
                          <span style={badgeStyle('kickoff')}>kickoff</span>
                        ) : m?.is_slash_command ? (
                          <span style={badgeStyle('slash')}>/{m.slash_command}</span>
                        ) : (
                          <span style={badgeStyle('default')}>message</span>
                        )}
                      </td>
                      <td style={{ ...td, maxWidth: 360 }}>{truncate(interactionLabel(m), 64)}</td>
                      <td style={{ ...td, maxWidth: 360 }}>{truncate(trace.user_message)}</td>
                      <td style={td}>{toolCount > 0 ? <span style={badgeStyle('brand')}>{toolCount}</span> : <span style={{ color: 'var(--text-muted)' }}>0</span>}</td>
                      <td style={td}>{formatCostUsd(cost)}</td>
                      <td style={td}>{m?.latency_ms != null ? `${(m.latency_ms / 1000).toFixed(1)}s` : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {totalPages > 1 && (
          <div style={{ display: 'flex', justifyContent: 'center', gap: 12, alignItems: 'center', marginBottom: 24 }}>
            <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1} style={paginationBtn(page <= 1)}>
              prev
            </button>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>page {page} of {totalPages}</span>
            <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages} style={paginationBtn(page >= totalPages)}>
              next
            </button>
          </div>
        )}

        {expanded && <TraceDetail trace={expanded} />}
      </div>
    </div>
  );
}

function TraceDetail({ trace }: { trace: Trace }) {
  const m = trace.metadata;
  const toolCalls = m?.tool_calls || [];
  const skillsUsed = m?.skills_used || [];
  const toolsUsed = m?.tools_used || toolCalls.map((t) => t.tool);
  const cost = extractCostUsd(m);

  return (
    <div style={{ border: '1px solid var(--border-default)', borderRadius: 8, background: 'var(--bg-surface)', padding: 20 }}>
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 16, fontSize: 12 }}>
        <div><span style={{ color: 'var(--text-muted)' }}>Trace</span> <span style={{ color: 'var(--accent-brand-light)' }}>#{trace.id}</span></div>
        <div><span style={{ color: 'var(--text-muted)' }}>Time</span> {formatTime(trace.created_at)}</div>
        <div><span style={{ color: 'var(--text-muted)' }}>Interaction</span> {interactionLabel(m)}</div>
        <div><span style={{ color: 'var(--text-muted)' }}>User</span> <span style={{ color: 'var(--accent-brand-light)' }}>@{m?.discord_username || '?'}</span> <span style={{ color: 'var(--text-muted)' }}>({m?.discord_user_id || 'unknown'})</span></div>
        <div><span style={{ color: 'var(--text-muted)' }}>Latency</span> {m?.latency_ms != null ? `${(m.latency_ms / 1000).toFixed(2)}s` : '—'}</div>
        <div><span style={{ color: 'var(--text-muted)' }}>Model</span> {m?.model || '—'}</div>
        <div><span style={{ color: 'var(--text-muted)' }}>Cost</span> {formatCostUsd(cost)}</div>
        <div><span style={{ color: 'var(--text-muted)' }}>OpenRouter id</span> {m?.openrouter_response_id || '—'}</div>
        <div><span style={{ color: 'var(--text-muted)' }}>Provider</span> {m?.openrouter_provider || '—'}</div>
        <div><span style={{ color: 'var(--text-muted)' }}>Retrieval</span> {m?.retrieval_method || '—'}</div>
        {m?.is_slash_command && <div><span style={{ color: 'var(--text-muted)' }}>Slash</span> /{m?.slash_command || 'unknown'}</div>}
        {m?.member_id && <div><span style={{ color: 'var(--text-muted)' }}>Member</span> node #{m.member_id}</div>}
        {m?.context_node_ids && m.context_node_ids.length > 0 && <div><span style={{ color: 'var(--text-muted)' }}>Context nodes</span> {m.context_node_ids.join(', ')}</div>}
      </div>

      <Section title="User Message">
        <pre style={preStyle}>{trace.user_message || '—'}</pre>
      </Section>

      <Section title="Assistant Response">
        <pre style={preStyle}>{trace.assistant_message || '—'}</pre>
      </Section>

      <Section title={`Tools Used (${toolsUsed.length})`}>
        <pre style={preStyle}>{toolsUsed.length ? toolsUsed.join('\n') : 'No tools used'}</pre>
      </Section>

      <Section title={`Skills Read (${skillsUsed.length})`}>
        <pre style={preStyle}>{skillsUsed.length ? skillsUsed.join('\n') : 'No skills read'}</pre>
      </Section>

      {toolCalls.length > 0 && (
        <Section title={`Tool Call Trace (${toolCalls.length})`}>
          {toolCalls.map((tc, idx) => (
            <div
              key={idx}
              style={{
                marginBottom: idx < toolCalls.length - 1 ? 12 : 0,
                paddingBottom: idx < toolCalls.length - 1 ? 12 : 0,
                borderBottom: idx < toolCalls.length - 1 ? '1px solid var(--border-subtle)' : 'none',
              }}
            >
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 6, fontSize: 12 }}>
                <span style={{ color: 'var(--accent-brand-light)', fontWeight: 600 }}>{idx + 1}. {tc.tool}</span>
                <span style={{ color: 'var(--text-muted)' }}>{tc.duration_ms}ms</span>
                {tc.error && <span style={badgeStyle('error')}>error</span>}
              </div>
              <div style={{ fontSize: 11 }}>
                <div style={{ color: 'var(--text-muted)', marginBottom: 2 }}>Args:</div>
                <pre style={{ ...preStyle, fontSize: 11, marginBottom: 6 }}>{JSON.stringify(tc.args, null, 2)}</pre>
                {tc.error ? (
                  <>
                    <div style={{ color: '#ef4444', marginBottom: 2 }}>Error:</div>
                    <pre style={{ ...preStyle, fontSize: 11, color: '#ef4444' }}>{tc.error}</pre>
                  </>
                ) : (
                  <>
                    <div style={{ color: 'var(--text-muted)', marginBottom: 2 }}>Result:</div>
                    <pre style={{ ...preStyle, fontSize: 11 }}>{typeof tc.result === 'string' ? tc.result : JSON.stringify(tc.result, null, 2)}</pre>
                  </>
                )}
              </div>
            </div>
          ))}
        </Section>
      )}

      <Section title="System Message Sent To Agent">
        <pre style={preStyle}>{m?.system_message || 'Not captured for this trace'}</pre>
      </Section>

      <Section title="Full LLM Messages Payload">
        <pre style={preStyle}>{m?.llm_messages ? JSON.stringify(m.llm_messages, null, 2) : 'Not captured for this trace'}</pre>
      </Section>

      <Section title="OpenRouter Usage">
        <pre style={preStyle}>{m?.openrouter_usage ? JSON.stringify(m.openrouter_usage, null, 2) : 'No usage data returned'}</pre>
      </Section>

      <Section title="Raw Metadata JSON">
        <pre style={preStyle}>{m ? JSON.stringify(m, null, 2) : '—'}</pre>
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div
        style={{
          fontSize: 11,
          color: 'var(--text-muted)',
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          marginBottom: 6,
          borderBottom: '1px solid var(--border-subtle)',
          paddingBottom: 4,
        }}
      >
        {title}
      </div>
      {children}
    </div>
  );
}

const th: React.CSSProperties = {
  padding: '8px 10px',
  textAlign: 'left',
  color: 'var(--text-muted)',
  fontWeight: 500,
  fontSize: 11,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
};
const td: React.CSSProperties = { padding: '8px 10px', verticalAlign: 'top' };
const preStyle: React.CSSProperties = {
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
  margin: 0,
  padding: 10,
  background: 'var(--bg-elevated)',
  borderRadius: 4,
  fontSize: 12,
  lineHeight: 1.5,
  color: 'var(--text-secondary)',
  maxHeight: 360,
  overflowY: 'auto',
};

function badgeStyle(variant: 'kickoff' | 'slash' | 'default' | 'brand' | 'error'): React.CSSProperties {
  const base: React.CSSProperties = { display: 'inline-block', padding: '2px 8px', borderRadius: 4, fontSize: 11, fontFamily: 'inherit' };
  switch (variant) {
    case 'kickoff':
      return { ...base, background: 'rgba(245, 158, 11, 0.12)', color: '#f59e0b' };
    case 'slash':
      return { ...base, background: 'rgba(52, 211, 153, 0.12)', color: '#34d399' };
    case 'brand':
      return { ...base, background: 'var(--accent-brand-subtle)', color: 'var(--accent-brand-light)' };
    case 'error':
      return { ...base, background: 'rgba(239, 68, 68, 0.12)', color: '#ef4444' };
    default:
      return { ...base, background: 'var(--bg-elevated)', color: 'var(--text-muted)' };
  }
}

function paginationBtn(disabled: boolean): React.CSSProperties {
  return {
    padding: '5px 14px',
    borderRadius: 6,
    border: '1px solid var(--border-default)',
    background: disabled ? 'var(--bg-base)' : 'var(--bg-surface)',
    color: disabled ? 'var(--text-muted)' : 'var(--text-secondary)',
    cursor: disabled ? 'default' : 'pointer',
    fontSize: 12,
    fontFamily: 'inherit',
  };
}
