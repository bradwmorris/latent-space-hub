"use client";

import { useState, useEffect } from 'react';
import { CATEGORIES, CATEGORY_MAP } from '@/config/categories';
import { getYouTubeThumbnail } from '@/utils/thumbnails';
import AsciiHeader from './AsciiHeader';

interface PreviewItem {
  id: number;
  title: string;
  date?: string;
  edge_count?: number;
  link?: string;
  node_type?: string;
}

interface CategoryData {
  key: string;
  label: string;
  count: number;
  preview: PreviewItem[];
}

interface TypeCount {
  key: string;
  label: string;
  count: number;
}

interface RecentNode {
  id: number;
  title: string;
  node_type: string;
  event_date?: string;
  created_at: string;
}

interface DashboardData {
  stats: {
    total_nodes: number;
    total_edges: number;
    total_chunks: number;
    total_content: number;
    type_counts: TypeCount[];
  };
  categories: CategoryData[];
}

interface DashboardProps {
  onCategoryClick: (categoryKey: string) => void;
  onNodeClick: (nodeId: number) => void;
}

export default function Dashboard({ onCategoryClick, onNodeClick }: DashboardProps) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [recentNodes, setRecentNodes] = useState<RecentNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [hoveredCard, setHoveredCard] = useState<string | null>(null);
  const [hoveredNode, setHoveredNode] = useState<number | null>(null);
  const [hoveredPill, setHoveredPill] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/dashboard')
      .then(res => res.json())
      .then(res => {
        if (res.success) setData(res.data);
      })
      .catch(err => console.error('Failed to fetch dashboard:', err))
      .finally(() => setLoading(false));

    // Fetch recent content nodes
    const contentTypes = ['podcast', 'article', 'ainews', 'latentspacetv', 'paper-club', 'builders-club'];
    fetch(`/api/nodes?type=${contentTypes.join(',')}&limit=6&sortBy=created_at`)
      .then(res => res.json())
      .then(res => {
        if (res.success) setRecentNodes(res.data);
      })
      .catch(err => console.error('Failed to fetch recent nodes:', err));
  }, []);

  if (loading) {
    return (
      <div style={{
        flex: 1, display: 'flex', flexDirection: 'column', padding: '32px',
        gap: '16px', overflowY: 'auto',
      }}>
        <div style={{
          fontSize: '12px',
          color: 'var(--text-muted)',
          fontFamily: 'inherit',
          animation: 'blockPulse 1.5s ease-in-out infinite',
        }}>
          {'▓▒░'} loading graph {'░▒▓'}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px' }}>
          {[0, 1, 2, 3, 4, 5, 6, 7].map(i => (
            <div key={i} style={{
              height: '72px', background: 'var(--bg-hover)',
              borderRadius: '8px', border: '1px solid var(--bg-elevated)',
            }} />
          ))}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
          {[0, 1, 2, 3, 4, 5, 6, 7].map(i => (
            <div key={i} style={{
              height: '180px', background: 'var(--bg-hover)',
              borderRadius: '8px', border: '1px solid var(--bg-elevated)',
            }} />
          ))}
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div style={{
        flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: 'var(--accent-dark)', fontSize: '13px',
      }}>
        Failed to load dashboard
      </div>
    );
  }

  const { stats, categories } = data;

  // Build a map for quick lookup
  const categoryDataMap: Record<string, CategoryData> = {};
  for (const c of categories) {
    categoryDataMap[c.key] = c;
  }

  return (
    <div style={{
      flex: 1, display: 'flex', flexDirection: 'column',
      padding: '32px', gap: '24px', overflowY: 'auto',
    }}>
      {/* Hero tile — ASCII banner left, type stats right */}
      <div style={{
        display: 'flex',
        gap: '24px',
        alignItems: 'stretch',
      }}>
        {/* Left: ASCII banner */}
        <div style={{
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
        }}>
          <AsciiHeader
            totalNodes={stats.total_nodes}
            totalEdges={stats.total_edges}
            totalChunks={stats.total_chunks}
            totalContent={stats.total_content}
          />
        </div>

        {/* Right: Type breakdown pills */}
        <div style={{
          flex: 1,
          display: 'grid',
          gridTemplateColumns: 'repeat(2, 1fr)',
          gap: '10px',
          alignContent: 'center',
        }}>
          {(stats.type_counts || []).map((tc) => {
            const catConfig = CATEGORY_MAP[tc.key];
            const Icon = catConfig?.icon;
            const isActive = hoveredPill === tc.key;
            return (
              <button
                key={tc.key}
                onClick={() => onCategoryClick(tc.key)}
                onMouseEnter={() => setHoveredPill(tc.key)}
                onMouseLeave={() => setHoveredPill(null)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  padding: '10px 14px',
                  background: isActive ? 'var(--bg-elevated)' : 'var(--bg-hover)',
                  border: `1px solid ${isActive ? 'var(--accent-brand-muted)' : 'var(--border-subtle)'}`,
                  borderRadius: '8px',
                  cursor: 'pointer',
                  transition: 'all 0.12s ease',
                  color: 'inherit',
                  textAlign: 'left',
                  boxShadow: 'var(--card-shadow)',
                }}
                aria-label={`${tc.label}: ${tc.count}`}
              >
                {Icon && <Icon size={14} style={{ color: isActive ? 'var(--accent-brand)' : 'var(--accent-dark)', flexShrink: 0, transition: 'color 0.12s ease' }} aria-hidden="true" />}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1px', minWidth: 0 }}>
                  <span style={{
                    fontSize: '16px', fontWeight: 700, color: isActive ? 'var(--text-primary)' : 'var(--text-primary)',
                    fontVariantNumeric: 'tabular-nums', lineHeight: 1.2,
                    transition: 'color 0.12s ease',
                  }}>
                    {tc.count.toLocaleString()}
                  </span>
                  <span style={{
                    fontSize: '10px', color: isActive ? 'var(--accent-primary)' : 'var(--accent-dark)',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {tc.label}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Recently added */}
      {recentNodes.length > 0 && (
        <div>
          <div style={{
            fontSize: '11px',
            fontWeight: 600,
            color: 'var(--text-muted)',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            marginBottom: '12px',
            fontFamily: 'var(--font-mono)',
          }}>
            Recently Added
          </div>
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '2px',
          }}>
            {recentNodes.map((node) => {
              const isItemHovered = hoveredNode === node.id;
              const dateStr = node.event_date || node.created_at;
              const date = dateStr ? new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '';
              return (
                <button
                  key={node.id}
                  onClick={() => onNodeClick(node.id)}
                  onMouseEnter={() => setHoveredNode(node.id)}
                  onMouseLeave={() => setHoveredNode(null)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '6px 8px',
                    background: isItemHovered ? 'var(--bg-hover)' : 'transparent',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    transition: 'background 0.1s',
                    width: '100%',
                    textAlign: 'left',
                  }}
                >
                  <span style={{
                    fontSize: '9px',
                    fontWeight: 500,
                    color: 'var(--accent-brand)',
                    background: 'var(--accent-brand-subtle)',
                    padding: '1px 6px',
                    borderRadius: '4px',
                    flexShrink: 0,
                    fontFamily: 'var(--font-mono)',
                  }}>
                    {node.node_type}
                  </span>
                  <span style={{
                    flex: 1,
                    fontSize: '13px',
                    color: isItemHovered ? 'var(--text-primary)' : 'var(--text-secondary)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    transition: 'color 0.1s',
                    fontFamily: 'var(--font-mono)',
                  }}>
                    {node.title}
                  </span>
                  <span style={{
                    fontSize: '11px',
                    color: 'var(--text-muted)',
                    flexShrink: 0,
                    fontVariantNumeric: 'tabular-nums',
                  }}>
                    {date}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Section divider */}
      <div style={{
        color: 'var(--border-default)',
        fontSize: '11px',
        userSelect: 'none',
        letterSpacing: '0.1em',
        lineHeight: 1,
      }}
        aria-hidden="true"
      >
        {'═'.repeat(72)}
      </div>

      {/* Category cards — 2-column grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: '16px',
      }}>
        {CATEGORIES.map((cat) => {
          const catData = categoryDataMap[cat.key];
          const count = catData?.count ?? 0;
          const preview = catData?.preview ?? [];
          const isHovered = hoveredCard === cat.key;
          const Icon = cat.icon;
          const catConfig = CATEGORY_MAP[cat.key];

          return (
            <div
              key={cat.key}
              onMouseEnter={() => setHoveredCard(cat.key)}
              onMouseLeave={() => setHoveredCard(null)}
              style={{
                background: isHovered ? 'var(--bg-elevated)' : 'var(--bg-hover)',
                borderRadius: '8px',
                border: `1px solid ${isHovered ? 'var(--border-default)' : 'var(--border-subtle)'}`,
                padding: '16px',
                transition: 'all 0.12s ease',
                overflow: 'hidden',
                minWidth: 0,
                boxShadow: 'var(--card-shadow)',
              }}
            >
              {/* Card header with tree prefix */}
              <button
                onClick={() => onCategoryClick(cat.key)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  width: '100%',
                  background: 'none',
                  border: 'none',
                  padding: 0,
                  cursor: 'pointer',
                  color: 'inherit',
                }}
                aria-label={`${cat.label}, ${count} items`}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, flex: 1 }}>
                  <span style={{ color: 'var(--border-default)', fontSize: '12px', flexShrink: 0, userSelect: 'none' }} aria-hidden="true">┌─</span>
                  <Icon size={14} style={{ color: isHovered ? 'var(--accent-brand)' : 'var(--accent-dark)', flexShrink: 0, transition: 'color 0.12s ease' }} aria-hidden="true" />
                  <h2 style={{
                    fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)',
                    margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {cat.label}
                  </h2>
                </div>
                <span style={{
                  fontSize: '12px', color: 'var(--accent-dark)',
                  fontVariantNumeric: 'tabular-nums',
                }}>
                  {count.toLocaleString()}
                </span>
              </button>

              {/* Preview items with tree characters */}
              {preview.length === 0 ? (
                <div style={{
                  fontSize: '11px', color: 'var(--border-default)', padding: '8px 0 2px',
                  userSelect: 'none',
                }}>
                  <span style={{ color: 'var(--border-default)', marginRight: '6px' }}>└─</span>
                  {'─ no items ──'}
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', marginTop: '6px' }}>
                  {preview.map((item, idx) => {
                    const thumb = getYouTubeThumbnail(item.link);
                    const isItemHovered = hoveredNode === item.id;
                    const isLast = idx === preview.length - 1;
                    const treeChar = isLast ? '└─' : '├─';

                    return (
                      <button
                        key={item.id}
                        onClick={() => onNodeClick(item.id)}
                        onMouseEnter={() => setHoveredNode(item.id)}
                        onMouseLeave={() => setHoveredNode(null)}
                        tabIndex={0}
                        aria-label={item.title}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          padding: '3px 4px',
                          background: isItemHovered ? 'var(--bg-elevated)' : 'transparent',
                          border: 'none',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          transition: 'background 0.1s',
                          width: '100%',
                          textAlign: 'left',
                        }}
                      >
                        {/* Tree prefix */}
                        <span style={{
                          color: 'var(--border-default)', fontSize: '12px', flexShrink: 0,
                          userSelect: 'none', lineHeight: 1,
                        }} aria-hidden="true">{treeChar}</span>

                        {/* Thumbnail */}
                        {thumb && (
                          <img
                            src={thumb}
                            alt=""
                            loading="lazy"
                            style={{
                              width: '56px',
                              height: '32px',
                              objectFit: 'cover',
                              borderRadius: '3px',
                              flexShrink: 0,
                              background: 'var(--bg-elevated)',
                            }}
                          />
                        )}

                        {/* Text */}
                        <div style={{
                          flex: 1, minWidth: 0,
                          display: 'flex', flexDirection: 'column', gap: '1px',
                        }}>
                          <span style={{
                            fontSize: '12px',
                            color: isItemHovered ? 'var(--text-primary)' : 'var(--accent-light)',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            transition: 'color 0.1s',
                          }}>
                            {item.title}
                          </span>
                          <span style={{
                            fontSize: '11px', color: 'var(--text-muted)',
                            fontVariantNumeric: 'tabular-nums',
                          }}>
                            {catConfig?.sortMode === 'connected' && item.edge_count !== undefined
                              ? `${item.edge_count} edges`
                              : item.date || ''
                            }
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
