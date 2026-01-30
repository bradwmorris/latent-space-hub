"use client";

import { useState, useEffect, type CSSProperties } from 'react';

interface ToolGroup {
  id: string;
  name: string;
  description: string;
}

export default function ToolsViewer() {
  const [groups, setGroups] = useState<Record<string, ToolGroup>>({});
  const [groupedTools, setGroupedTools] = useState<Record<string, { name: string; description: string }[]>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch('/api/tools');
        const result = await res.json();
        if (result.success) {
          setGroups(result.data.groups);
          setGroupedTools(result.data.tools);
        }
      } catch (e) {
        console.error('Failed to load tools:', e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  if (loading) {
    return <div style={loadingStyle}>Loading...</div>;
  }

  return (
    <div style={containerStyle}>
      <p style={descStyle}>Available tools grouped by function.</p>

      {Object.entries(groups).map(([groupId, group]) => {
        const tools = groupedTools[groupId] || [];
        if (tools.length === 0) return null;

        return (
          <div key={groupId} style={{ marginBottom: 24 }}>
            <div style={groupHeaderStyle}>
              <span style={groupTitleStyle}>{group.name}</span>
              <span style={countStyle}>{tools.length}</span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {tools.map((tool) => (
                <div key={tool.name} style={toolStyle}>
                  <div style={toolNameStyle}>{tool.name}</div>
                  <div style={toolDescStyle}>{tool.description}</div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

const containerStyle: CSSProperties = { padding: 24, height: '100%', overflow: 'auto' };
const loadingStyle: CSSProperties = { padding: 24, color: '#6b7280' };
const descStyle: CSSProperties = { fontSize: 13, color: '#6b7280', marginBottom: 20 };

const groupHeaderStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  marginBottom: 10,
  paddingBottom: 8,
  borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
};

const groupTitleStyle: CSSProperties = { fontSize: 13, fontWeight: 500, color: '#e5e7eb' };
const countStyle: CSSProperties = { fontSize: 11, color: '#6b7280' };

const toolStyle: CSSProperties = {
  padding: '10px 14px',
  background: 'rgba(255, 255, 255, 0.02)',
  border: '1px solid rgba(255, 255, 255, 0.06)',
  borderRadius: 6,
};

const toolNameStyle: CSSProperties = {
  fontSize: 12,
  fontFamily: 'monospace',
  color: '#9333ea',
  marginBottom: 4,
};

const toolDescStyle: CSSProperties = {
  fontSize: 12,
  color: '#9ca3af',
  lineHeight: 1.4,
};
