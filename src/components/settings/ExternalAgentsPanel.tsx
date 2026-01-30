"use client";

import { useCallback, useEffect, useMemo, useState } from 'react';

interface McpStatus {
  enabled: boolean;
  url: string | null;
  port: number | null;
  last_updated?: string | null;
  target_base_url?: string | null;
  last_error?: string | null;
  error?: string | null;
}

const initialStatus: McpStatus = {
  enabled: false,
  url: null,
  port: null
};

export default function ExternalAgentsPanel() {
  const [status, setStatus] = useState<McpStatus>(initialStatus);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copyState, setCopyState] = useState<'idle' | 'copied'>('idle');

  useEffect(() => {
    const fetchStatus = async () => {
      try {
        setLoading(true);
        const response = await fetch('/api/system/mcp-status');
        const data = await response.json();
        setStatus(data);
        setError(null);
      } catch (err) {
        console.error('Failed to load MCP status', err);
        setError('MCP server not running. See docs/8_mcp.md for setup instructions.');
        setStatus(initialStatus);
      } finally {
        setLoading(false);
      }
    };

    fetchStatus();
    const timer = setInterval(fetchStatus, 5000);
    return () => clearInterval(timer);
  }, []);

  const connectorUrl = useMemo(() => {
    if (status?.url) return status.url;
    if (status?.port) return `http://127.0.0.1:${status.port}/mcp`;
    return null;
  }, [status]);

  const handleCopy = useCallback(async () => {
    if (!connectorUrl) return;
    try {
      await navigator.clipboard.writeText(connectorUrl);
      setCopyState('copied');
      setTimeout(() => setCopyState('idle'), 2000);
    } catch (err) {
      console.error('Copy failed', err);
    }
  }, [connectorUrl]);

  return (
    <div style={{ padding: '32px', color: '#e2e8f0', overflowY: 'auto' }}>
      <h2 style={{ fontSize: '20px', fontWeight: 600, marginBottom: '8px' }}>External Agents</h2>
      <p style={{ color: '#94a3b8', marginBottom: '24px', lineHeight: 1.5 }}>
        Connect Claude, ChatGPT, Gemini, or any MCP-compatible assistant to your local RA-H database.
        Everything stays on device—tools simply call this connector to add or search nodes.
      </p>

      <div
        style={{
          border: '1px solid #1f2937',
          borderRadius: '10px',
          padding: '20px',
          marginBottom: '24px',
          background: '#090909'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: '14px', color: '#94a3b8' }}>Connector URL</div>
            <div style={{ fontSize: '18px', color: connectorUrl ? '#fff' : '#64748b', marginTop: '4px' }}>
              {loading ? 'Loading…' : connectorUrl ?? 'Unavailable (MCP server not running)'}
            </div>
            {status.last_updated && (
              <div style={{ fontSize: '12px', color: '#475569', marginTop: '6px' }}>
                Updated {new Date(status.last_updated).toLocaleTimeString()}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={handleCopy}
            disabled={!connectorUrl}
            style={{
              background: connectorUrl ? '#9333ea' : '#1f2937',
              color: connectorUrl ? '#000' : '#475569',
              border: 'none',
              borderRadius: '6px',
              padding: '10px 16px',
              cursor: connectorUrl ? 'pointer' : 'not-allowed',
              fontWeight: 600
            }}
          >
            {copyState === 'copied' ? 'Copied ✓' : 'Copy URL'}
          </button>
        </div>
        {status.last_error && (
          <div style={{ marginTop: '12px', fontSize: '13px', color: '#fbbf24' }}>
            ⚠️ {status.last_error}
          </div>
        )}
      </div>

      <div
        style={{
          border: '1px solid #1f2937',
          borderRadius: '10px',
          padding: '20px',
          marginBottom: '24px',
          background: '#0c111d'
        }}
      >
        <h3 style={{ marginBottom: '12px', fontSize: '16px', fontWeight: 600 }}>How to use in Claude or ChatGPT</h3>
        <ol style={{ paddingLeft: '20px', lineHeight: 1.6, color: '#cbd5f5' }}>
          <li>Open the MCP / connectors settings in your assistant.</li>
          <li>Select “Add connector” → choose HTTP → paste the URL above.</li>
          <li>Give the connector a friendly name (e.g., “RA-H”).</li>
          <li>Ask naturally: “Add this summary to RA-H” or “Search RA-H for my Apollo notes”.</li>
        </ol>
      </div>

      <div
        style={{
          border: '1px solid #3f1d1d',
          borderRadius: '10px',
          padding: '16px',
          background: '#170e0e',
          color: '#fca5a5',
          marginBottom: '24px',
          lineHeight: 1.5
        }}
      >
        External agents can edit your local graph. Only enable trusted connectors and monitor their output.
        Disconnect the connector or close RA-H if anything unexpected happens.
      </div>

      {error && (
        <div style={{ color: '#f87171', marginBottom: '16px', fontSize: '14px' }}>{error}</div>
      )}

      <div style={{ display: 'grid', gap: '16px' }}>
        <HelperCard
          title="Add to RA-H"
          body={`"Summarize our meeting and add it to RA-H under dimensions Strategy, Q1 Execution."`}
        />
        <HelperCard
          title="Search RA-H"
          body={`"Search RA-H for what I previously wrote about the Apollo launch delays."`}
        />
        <HelperCard
          title="Check nodes before writing"
          body={`"Before adding anything new, call rah.search_nodes to see if the note already exists."`}
        />
      </div>
    </div>
  );
}

function HelperCard({ title, body }: { title: string; body: string }) {
  return (
    <div
      style={{
        border: '1px solid #1f2937',
        borderRadius: '8px',
        padding: '14px',
        background: '#0f172a'
      }}
    >
      <div style={{ fontWeight: 600, marginBottom: '6px', color: '#f1f5f9' }}>{title}</div>
      <div style={{ color: '#cbd5f5', fontSize: '14px', lineHeight: 1.5 }}>{body}</div>
    </div>
  );
}
