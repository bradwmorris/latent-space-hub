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
                color: '#888',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                padding: '4px',
                borderRadius: '4px',
              }}
              onMouseEnter={e => { e.currentTarget.style.color = '#ccc'; }}
              onMouseLeave={e => { e.currentTarget.style.color = '#888'; }}
            >
              <ArrowLeft size={16} />
            </button>
            <span style={{ color: '#ccc', fontSize: '13px', fontWeight: 500 }}>
              {selectedGuide.name}
            </span>
          </div>
        )}
      </PaneHeader>

      <div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: '12px' }}>
        {loading ? (
          <div style={{ color: '#555', fontSize: '13px', textAlign: 'center', paddingTop: '24px' }}>
            Loading...
          </div>
        ) : selectedGuide ? (
          <div className="guide-content" style={{ color: '#ccc', fontSize: '13px', lineHeight: '1.6' }}>
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                h1: ({ children }) => (
                  <h1 style={{ fontSize: '18px', fontWeight: 600, color: '#eee', margin: '0 0 16px 0' }}>{children}</h1>
                ),
                h2: ({ children }) => (
                  <h2 style={{ fontSize: '15px', fontWeight: 600, color: '#ddd', margin: '20px 0 8px 0' }}>{children}</h2>
                ),
                h3: ({ children }) => (
                  <h3 style={{ fontSize: '14px', fontWeight: 600, color: '#ccc', margin: '16px 0 6px 0' }}>{children}</h3>
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
                        background: '#1a1a1a',
                        padding: '2px 6px',
                        borderRadius: '4px',
                        fontSize: '12px',
                        color: '#999',
                      }} {...props}>{children}</code>
                    );
                  }
                  return (
                    <code style={{
                      display: 'block',
                      background: '#0d0d0d',
                      padding: '12px',
                      borderRadius: '6px',
                      fontSize: '12px',
                      overflowX: 'auto',
                      margin: '0 0 12px 0',
                      color: '#aaa',
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
                  <hr style={{ border: 'none', borderTop: '1px solid #2a2a2a', margin: '16px 0' }} />
                ),
                blockquote: ({ children }) => (
                  <blockquote style={{
                    borderLeft: '3px solid #333',
                    paddingLeft: '12px',
                    margin: '0 0 12px 0',
                    color: '#999',
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
              <div style={{ color: '#555', fontSize: '13px', textAlign: 'center', paddingTop: '24px' }}>
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
                    background: '#161616',
                    border: '1px solid #222',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    textAlign: 'left',
                    transition: 'all 0.15s ease',
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.background = '#1a1a1a';
                    e.currentTarget.style.borderColor = '#333';
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.background = '#161616';
                    e.currentTarget.style.borderColor = '#222';
                  }}
                >
                  <span style={{ color: '#ddd', fontSize: '13px', fontWeight: 500 }}>
                    {guide.name}
                  </span>
                  <span style={{ color: '#777', fontSize: '12px', lineHeight: '1.4' }}>
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
