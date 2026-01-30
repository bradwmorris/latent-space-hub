"use client";

import { useEffect, useState, type CSSProperties } from 'react';
import type { Node } from '@/types/database';

interface AutoContextSettings {
  autoContextEnabled: boolean;
  lastPinnedMigration?: string;
}

interface NodeWithMetrics extends Node {
  edge_count?: number;
}

export default function ContextViewer() {
  const [nodes, setNodes] = useState<NodeWithMetrics[]>([]);
  const [enabled, setEnabled] = useState(false);
  const [loadingNodes, setLoadingNodes] = useState(true);
  const [loadingSettings, setLoadingSettings] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const loadNodes = async () => {
      try {
        const res = await fetch('/api/nodes?sortBy=edges&limit=10');
        const payload = await res.json();
        setNodes(payload.data || []);
      } catch (e) {
        console.error(e);
      } finally {
        setLoadingNodes(false);
      }
    };

    const loadSettings = async () => {
      try {
        const res = await fetch('/api/system/auto-context');
        const payload = await res.json() as { success: boolean; data?: AutoContextSettings };
        if (payload.success && payload.data) {
          setEnabled(payload.data.autoContextEnabled);
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoadingSettings(false);
      }
    };

    loadNodes();
    loadSettings();
  }, []);

  const handleToggle = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const res = await fetch('/api/system/auto-context', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ autoContextEnabled: !enabled }),
      });
      const payload = await res.json() as { success: boolean; data?: AutoContextSettings };
      if (payload.success && payload.data) {
        setEnabled(payload.data.autoContextEnabled);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={containerStyle}>
      <p style={descStyle}>
        Top 10 most-connected nodes are added to background context for tool execution.
      </p>

      {/* Toggle */}
      <div style={cardStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={labelStyle}>Auto-Context</div>
            <div style={subLabelStyle}>
              {loadingSettings ? 'Loading...' : enabled ? 'Enabled' : 'Disabled'}
            </div>
          </div>
          <button
            onClick={handleToggle}
            disabled={loadingSettings || saving}
            style={{
              ...toggleStyle,
              background: enabled ? '#9333ea' : 'rgba(255, 255, 255, 0.1)',
            }}
          >
            <span style={{
              ...toggleKnobStyle,
              left: enabled ? 26 : 4,
            }} />
          </button>
        </div>
      </div>

      {/* Nodes List */}
      <div style={labelStyle}>Top Nodes</div>
      {loadingNodes ? (
        <div style={mutedStyle}>Loading...</div>
      ) : nodes.length === 0 ? (
        <div style={mutedStyle}>No connected nodes yet.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {nodes.map((node) => (
            <div key={node.id} style={nodeCardStyle}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={nodeTitleStyle}>{node.title || 'Untitled'}</span>
                <span style={edgeCountStyle}>{node.edge_count ?? 0}</span>
              </div>
              {node.dimensions && node.dimensions.length > 0 && (
                <div style={{ display: 'flex', gap: 4, marginTop: 6, flexWrap: 'wrap' }}>
                  {node.dimensions.slice(0, 3).map((dim) => (
                    <span key={dim} style={dimTagStyle}>{dim}</span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const containerStyle: CSSProperties = { padding: 24, height: '100%', overflow: 'auto' };
const descStyle: CSSProperties = { fontSize: 13, color: '#6b7280', marginBottom: 20, lineHeight: 1.5 };

const cardStyle: CSSProperties = {
  background: 'rgba(255, 255, 255, 0.02)',
  border: '1px solid rgba(255, 255, 255, 0.06)',
  borderRadius: 8,
  padding: 16,
  marginBottom: 24,
};

const labelStyle: CSSProperties = { fontSize: 13, fontWeight: 500, color: '#e5e7eb', marginBottom: 8 };
const subLabelStyle: CSSProperties = { fontSize: 12, color: '#6b7280' };
const mutedStyle: CSSProperties = { fontSize: 13, color: '#6b7280' };

const toggleStyle: CSSProperties = {
  width: 48,
  height: 26,
  borderRadius: 13,
  border: 'none',
  cursor: 'pointer',
  position: 'relative',
  transition: 'background 0.15s',
};

const toggleKnobStyle: CSSProperties = {
  position: 'absolute',
  top: 4,
  width: 18,
  height: 18,
  borderRadius: '50%',
  background: '#fff',
  transition: 'left 0.15s',
};

const nodeCardStyle: CSSProperties = {
  padding: '12px 14px',
  background: 'rgba(255, 255, 255, 0.02)',
  border: '1px solid rgba(255, 255, 255, 0.06)',
  borderRadius: 6,
};

const nodeTitleStyle: CSSProperties = { fontSize: 13, fontWeight: 500, color: '#e5e7eb' };
const edgeCountStyle: CSSProperties = { fontSize: 12, color: '#9333ea' };

const dimTagStyle: CSSProperties = {
  padding: '2px 8px',
  borderRadius: 4,
  fontSize: 11,
  background: 'rgba(147, 51, 234, 0.1)',
  color: '#9333ea',
};
