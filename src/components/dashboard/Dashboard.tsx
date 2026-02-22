"use client";

import { useState, useEffect } from 'react';
import { CATEGORIES, CATEGORY_MAP } from '@/config/categories';
import { getYouTubeThumbnail } from '@/utils/thumbnails';

interface PreviewItem {
  id: number;
  title: string;
  date?: string;
  edge_count?: number;
  link?: string;
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
  }, []);

  if (loading) {
    return (
      <div style={{
        flex: 1, display: 'flex', flexDirection: 'column', padding: '32px',
        gap: '24px', overflowY: 'auto',
      }}>
        {/* Skeleton type cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px' }}>
          {[0, 1, 2, 3, 4, 5, 6, 7].map(i => (
            <div key={i} style={{
              height: '72px', background: '#151515',
              borderRadius: '8px', border: '1px solid #1a1a1a',
            }} />
          ))}
        </div>
        {/* Skeleton cards */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
          {[0, 1, 2, 3, 4, 5, 6, 7].map(i => (
            <div key={i} style={{
              height: '180px', background: '#151515',
              borderRadius: '8px', border: '1px solid #1a1a1a',
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
        color: '#555', fontSize: '13px',
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
      {/* Dashboard heading */}
      <h1 style={{
        fontSize: '18px', fontWeight: 600, color: '#e5e5e5',
        margin: 0, letterSpacing: '-0.01em',
      }}>
        Dashboard
      </h1>

      {/* Type breakdown — card grid */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: '12px',
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
                  padding: '14px 16px',
                  background: isActive ? '#1c1c1c' : '#151515',
                  border: '1px solid #1a1a1a',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  transition: 'background 0.12s ease',
                  color: 'inherit',
                  textAlign: 'left',
                }}
                aria-label={`${tc.label}: ${tc.count}`}
              >
                {Icon && <Icon size={16} style={{ color: '#666', flexShrink: 0 }} aria-hidden="true" />}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0 }}>
                  <span style={{
                    fontSize: '18px', fontWeight: 600, color: isActive ? '#e5e5e5' : '#ccc',
                    fontVariantNumeric: 'tabular-nums', lineHeight: 1.2,
                  }}>
                    {tc.count.toLocaleString()}
                  </span>
                  <span style={{
                    fontSize: '11px', color: isActive ? '#888' : '#666',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {tc.label}
                  </span>
                </div>
              </button>
            );
          })}
        </div>

        {/* Aggregate totals — compact line */}
        <div style={{
          fontSize: '11px', color: '#555',
          fontVariantNumeric: 'tabular-nums',
          paddingLeft: '4px',
        }}>
          {stats.total_nodes.toLocaleString()} nodes{' · '}
          {stats.total_edges.toLocaleString()} edges{' · '}
          {stats.total_chunks.toLocaleString()} chunks{' · '}
          {stats.total_content.toLocaleString()} content
        </div>
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
                background: isHovered ? '#181818' : '#151515',
                borderRadius: '8px',
                border: '1px solid #1a1a1a',
                padding: '16px',
                transition: 'background 0.12s ease',
                overflow: 'hidden',
                minWidth: 0,
              }}
            >
              {/* Card header */}
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
                  <Icon size={16} style={{ color: '#777', flexShrink: 0 }} aria-hidden="true" />
                  <h2 style={{
                    fontSize: '14px', fontWeight: 600, color: '#ccc',
                    margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {cat.label}
                  </h2>
                </div>
                <span style={{
                  fontSize: '12px', color: '#555',
                  fontVariantNumeric: 'tabular-nums',
                }}>
                  {count.toLocaleString()}
                </span>
              </button>

              {/* Divider */}
              <div style={{
                height: '1px', background: '#1a1a1a',
                margin: '10px 0',
              }} />

              {/* Preview items */}
              {preview.length === 0 ? (
                <div style={{ fontSize: '12px', color: '#444', padding: '4px 0' }}>
                  No items yet
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  {preview.map((item) => {
                    const thumb = getYouTubeThumbnail(item.link);
                    const isItemHovered = hoveredNode === item.id;

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
                          gap: '10px',
                          padding: '4px',
                          background: isItemHovered ? '#1f1f1f' : 'transparent',
                          border: 'none',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          transition: 'background 0.1s',
                          width: '100%',
                          textAlign: 'left',
                        }}
                      >
                        {/* Thumbnail */}
                        {thumb && (
                          <img
                            src={thumb}
                            alt=""
                            loading="lazy"
                            style={{
                              width: '64px',
                              height: '36px',
                              objectFit: 'cover',
                              borderRadius: '3px',
                              flexShrink: 0,
                              background: '#1a1a1a',
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
                            color: isItemHovered ? '#ddd' : '#aaa',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            transition: 'color 0.1s',
                          }}>
                            {item.title}
                          </span>
                          <span style={{
                            fontSize: '11px', color: '#444',
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
