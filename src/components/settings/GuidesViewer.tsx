"use client";

import { useState, useEffect } from 'react';
import { Plus, Pencil, Trash2, Save, X, FileText } from 'lucide-react';

interface GuideMeta {
  name: string;
  description: string;
}

interface Guide extends GuideMeta {
  content: string;
}

export default function GuidesViewer() {
  const [guides, setGuides] = useState<GuideMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Guide | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchGuides();
  }, []);

  const fetchGuides = async () => {
    try {
      const res = await fetch('/api/guides');
      const data = await res.json();
      if (data.success) {
        setGuides(data.data);
      }
    } catch (err) {
      console.error('Failed to fetch guides:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = async (name: string) => {
    try {
      const res = await fetch(`/api/guides/${encodeURIComponent(name)}`);
      const data = await res.json();
      if (data.success) {
        setEditing(data.data);
        setIsNew(false);
        setError(null);
      }
    } catch (err) {
      console.error('Failed to fetch guide:', err);
    }
  };

  const handleNew = () => {
    setEditing({
      name: '',
      description: '',
      content: '# New Guide\n\nWrite your guide content here...',
    });
    setIsNew(true);
    setError(null);
  };

  const handleSave = async () => {
    if (!editing) return;
    if (!editing.name.trim()) {
      setError('Name is required');
      return;
    }

    try {
      const res = await fetch(`/api/guides/${encodeURIComponent(editing.name)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: editing.content,
          description: editing.description,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setEditing(null);
        fetchGuides();
        window.dispatchEvent(new Event('guides:updated'));
      } else {
        setError(data.error || 'Failed to save');
      }
    } catch (err) {
      setError('Failed to save guide');
    }
  };

  const handleDelete = async (name: string) => {
    if (!confirm(`Delete guide "${name}"?`)) return;

    try {
      const res = await fetch(`/api/guides/${encodeURIComponent(name)}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (data.success) {
        fetchGuides();
        window.dispatchEvent(new Event('guides:updated'));
      }
    } catch (err) {
      console.error('Failed to delete guide:', err);
    }
  };

  if (loading) {
    return (
      <div style={{ padding: '24px', color: '#666' }}>Loading guides...</div>
    );
  }

  if (editing) {
    return (
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column', padding: '24px' }}>
        <div style={{ display: 'flex', gap: '12px', marginBottom: '16px' }}>
          <input
            type="text"
            value={editing.name}
            onChange={(e) => setEditing({ ...editing, name: e.target.value })}
            placeholder="Guide name"
            disabled={!isNew}
            style={{
              flex: 1,
              padding: '8px 12px',
              background: '#1a1a1a',
              border: '1px solid #333',
              borderRadius: '6px',
              color: '#fff',
              fontSize: '14px',
            }}
          />
          <button
            onClick={handleSave}
            style={{
              padding: '8px 16px',
              background: '#9333ea',
              border: 'none',
              borderRadius: '6px',
              color: '#000',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '13px',
              fontWeight: 500,
            }}
          >
            <Save size={14} /> Save
          </button>
          <button
            onClick={() => setEditing(null)}
            style={{
              padding: '8px 16px',
              background: 'transparent',
              border: '1px solid #333',
              borderRadius: '6px',
              color: '#888',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '13px',
            }}
          >
            <X size={14} /> Cancel
          </button>
        </div>

        {error && (
          <div style={{ color: '#ef4444', fontSize: '13px', marginBottom: '12px' }}>{error}</div>
        )}

        <input
          type="text"
          value={editing.description}
          onChange={(e) => setEditing({ ...editing, description: e.target.value })}
          placeholder="Brief description"
          style={{
            padding: '8px 12px',
            background: '#1a1a1a',
            border: '1px solid #333',
            borderRadius: '6px',
            color: '#fff',
            fontSize: '13px',
            marginBottom: '16px',
          }}
        />

        <textarea
          value={editing.content}
          onChange={(e) => setEditing({ ...editing, content: e.target.value })}
          placeholder="Guide content (markdown)"
          style={{
            flex: 1,
            padding: '12px',
            background: '#1a1a1a',
            border: '1px solid #333',
            borderRadius: '6px',
            color: '#ccc',
            fontSize: '13px',
            fontFamily: 'monospace',
            resize: 'none',
            lineHeight: 1.5,
          }}
        />

        <p style={{ color: '#666', fontSize: '12px', marginTop: '12px' }}>
          Guides are markdown files that external agents can read via MCP tools. Use them to provide context, instructions, or reference material.
        </p>
      </div>
    );
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', padding: '24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <p style={{ color: '#888', fontSize: '13px', margin: 0 }}>
          Guides provide context and instructions for external AI agents via MCP.
        </p>
        <button
          onClick={handleNew}
          style={{
            padding: '8px 16px',
            background: '#9333ea',
            border: 'none',
            borderRadius: '6px',
            color: '#000',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            fontSize: '13px',
            fontWeight: 500,
          }}
        >
          <Plus size={14} /> New Guide
        </button>
      </div>

      <div style={{ flex: 1, overflow: 'auto' }}>
        {guides.length === 0 ? (
          <div style={{ color: '#555', textAlign: 'center', paddingTop: '48px' }}>
            <FileText size={48} style={{ marginBottom: '12px', opacity: 0.5 }} />
            <p style={{ fontSize: '14px' }}>No guides yet</p>
            <p style={{ fontSize: '12px', color: '#444' }}>Create guides to help external agents understand your knowledge base</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {guides.map((guide) => (
              <div
                key={guide.name}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  padding: '12px 16px',
                  background: '#161616',
                  border: '1px solid #222',
                  borderRadius: '8px',
                }}
              >
                <FileText size={18} style={{ color: '#9333ea', flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ color: '#ddd', fontSize: '14px', fontWeight: 500 }}>{guide.name}</div>
                  <div style={{ color: '#666', fontSize: '12px', marginTop: '2px' }}>{guide.description}</div>
                </div>
                <button
                  onClick={() => handleEdit(guide.name)}
                  style={{
                    padding: '6px',
                    background: 'transparent',
                    border: 'none',
                    color: '#666',
                    cursor: 'pointer',
                    borderRadius: '4px',
                  }}
                  title="Edit"
                >
                  <Pencil size={14} />
                </button>
                <button
                  onClick={() => handleDelete(guide.name)}
                  style={{
                    padding: '6px',
                    background: 'transparent',
                    border: 'none',
                    color: '#666',
                    cursor: 'pointer',
                    borderRadius: '4px',
                  }}
                  title="Delete"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
