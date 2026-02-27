"use client";

import { useState, useEffect } from 'react';
import { ArrowLeft } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import PaneHeader from './PaneHeader';
import type { BasePaneProps } from './types';

interface GuideMeta {
  name: string;
  description: string;
}

interface Guide extends GuideMeta {
  content: string;
}

export default function GuidesPane({
  slot,
  isActive,
  onPaneAction,
  onCollapse,
  onSwapPanes,
  tabBar,
}: BasePaneProps) {
  const [guides, setGuides] = useState<GuideMeta[]>([]);
  const [selectedGuide, setSelectedGuide] = useState<Guide | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchGuides();

    const handleGuideUpdated = () => { fetchGuides(); };
    window.addEventListener('guides:updated', handleGuideUpdated);
    return () => window.removeEventListener('guides:updated', handleGuideUpdated);
  }, []);

  const fetchGuides = async () => {
    try {
      const res = await fetch('/api/guides');
      const data = await res.json();
      if (data.success) {
        setGuides(data.data);
      }
    } catch (err) {
      console.error('[GuidesPane] Failed to fetch guides:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectGuide = async (name: string) => {
    try {
      const res = await fetch(`/api/guides/${encodeURIComponent(name)}`);
      const data = await res.json();
      if (data.success) {
        setSelectedGuide(data.data);
      }
    } catch (err) {
      console.error('[GuidesPane] Failed to fetch guide:', err);
    }
  };

  const handleBack = () => {
    setSelectedGuide(null);
  };

  return (
    <div style={{
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      background: 'transparent',
      overflow: 'hidden',
    }}>
      <PaneHeader slot={slot} onCollapse={onCollapse} onSwapPanes={onSwapPanes} tabBar={tabBar}>
        {selectedGuide && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              onClick={handleBack}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--accent-primary)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                padding: '4px',
                borderRadius: '4px',
              }}
              onMouseEnter={e => { e.currentTarget.style.color = 'var(--text-primary)'; }}
              onMouseLeave={e => { e.currentTarget.style.color = 'var(--accent-primary)'; }}
            >
              <ArrowLeft size={16} />
            </button>
            <span style={{ color: 'var(--text-primary)', fontSize: '13px', fontWeight: 500 }}>
              {selectedGuide.name}
            </span>
          </div>
        )}
      </PaneHeader>

      <div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: '12px' }}>
        {loading ? (
          <div style={{ color: 'var(--accent-dark)', fontSize: '13px', textAlign: 'center', paddingTop: '24px' }}>
            Loading...
          </div>
        ) : selectedGuide ? (
          <div className="guide-content" style={{ color: 'var(--text-primary)', fontSize: '13px', lineHeight: '1.6' }}>
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                h1: ({ children }) => (
                  <h1 style={{ fontSize: '18px', fontWeight: 600, color: '#eee', margin: '0 0 16px 0' }}>{children}</h1>
                ),
                h2: ({ children }) => (
                  <h2 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)', margin: '20px 0 8px 0' }}>{children}</h2>
                ),
                h3: ({ children }) => (
                  <h3 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', margin: '16px 0 6px 0' }}>{children}</h3>
                ),
                p: ({ children }) => (
                  <p style={{ margin: '0 0 12px 0' }}>{children}</p>
                ),
                ul: ({ children }) => (
                  <ul style={{ margin: '0 0 12px 0', paddingLeft: '20px' }}>{children}</ul>
                ),
                ol: ({ children }) => (
                  <ol style={{ margin: '0 0 12px 0', paddingLeft: '20px' }}>{children}</ol>
                ),
                li: ({ children }) => (
                  <li style={{ margin: '0 0 4px 0' }}>{children}</li>
                ),
                code: ({ className, children, ...props }) => {
                  const isInline = !className;
                  if (isInline) {
                    return (
                      <code style={{
                        background: 'var(--bg-elevated)',
                        padding: '2px 6px',
                        borderRadius: '4px',
                        fontSize: '12px',
                        color: 'var(--text-secondary)',
                      }} {...props}>{children}</code>
                    );
                  }
                  return (
                    <code style={{
                      display: 'block',
                      background: 'var(--bg-surface)',
                      padding: '12px',
                      borderRadius: '6px',
                      fontSize: '12px',
                      overflowX: 'auto',
                      margin: '0 0 12px 0',
                      color: 'var(--accent-light)',
                      whiteSpace: 'pre-wrap',
                    }} {...props}>{children}</code>
                  );
                },
                pre: ({ children }) => (
                  <pre style={{ margin: '0 0 12px 0' }}>{children}</pre>
                ),
                strong: ({ children }) => (
                  <strong style={{ color: '#eee', fontWeight: 600 }}>{children}</strong>
                ),
                hr: () => (
                  <hr style={{ border: 'none', borderTop: '1px solid var(--border-default)', margin: '16px 0' }} />
                ),
                blockquote: ({ children }) => (
                  <blockquote style={{
                    borderLeft: '3px solid var(--border-default)',
                    paddingLeft: '12px',
                    margin: '0 0 12px 0',
                    color: 'var(--text-secondary)',
                  }}>{children}</blockquote>
                ),
              }}
            >
              {selectedGuide.content}
            </ReactMarkdown>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {guides.length === 0 ? (
              <div style={{ color: 'var(--accent-dark)', fontSize: '13px', textAlign: 'center', paddingTop: '24px' }}>
                No guides found
              </div>
            ) : (
              guides.map((guide) => (
                <button
                  key={guide.name}
                  onClick={() => handleSelectGuide(guide.name)}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '4px',
                    padding: '12px',
                    background: 'var(--bg-hover)',
                    border: '1px solid var(--bg-elevated)',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    textAlign: 'left',
                    transition: 'all 0.15s ease',
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.background = 'var(--bg-elevated)';
                    e.currentTarget.style.borderColor = 'var(--border-default)';
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.background = 'var(--bg-hover)';
                    e.currentTarget.style.borderColor = 'var(--bg-elevated)';
                  }}
                >
                  <span style={{ color: 'var(--text-primary)', fontSize: '13px', fontWeight: 500 }}>
                    {guide.name}
                  </span>
                  <span style={{ color: 'var(--text-muted)', fontSize: '12px', lineHeight: '1.4' }}>
                    {guide.description}
                  </span>
                </button>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
