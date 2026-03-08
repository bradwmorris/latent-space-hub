"use client";

import { Node } from '@/types/database';
import { File } from 'lucide-react';

interface GridViewProps {
  nodes: Node[];
  onNodeClick: (nodeId: number) => void;
}

export default function GridView({ nodes, onNodeClick }: GridViewProps) {
  const truncateContent = (content?: string, maxLength: number = 120) => {
    if (!content) return '';
    if (content.length <= maxLength) return content;
    return content.substring(0, maxLength) + '...';
  };

  if (nodes.length === 0) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        color: 'var(--text-muted)',
        fontSize: '13px'
      }}>
        No nodes match the current filters
      </div>
    );
  }

  return (
    <div style={{
      height: '100%',
      overflowY: 'auto',
      padding: '12px'
    }}>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
        gap: '12px'
      }}>
        {nodes.map(node => (
            <button
              key={node.id}
              onClick={() => onNodeClick(node.id)}
              style={{
                display: 'flex',
                flexDirection: 'column',
                padding: '16px',
                background: 'var(--bg-base)',
                border: '1px solid var(--border-subtle)',
                borderRadius: '8px',
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'all 0.15s',
                minHeight: '140px',
                boxShadow: 'var(--card-shadow)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'var(--bg-surface)';
                e.currentTarget.style.borderColor = 'var(--border-default)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'var(--bg-base)';
                e.currentTarget.style.borderColor = 'var(--border-subtle)';
              }}
            >
              {/* Header with Icon */}
              <div style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '10px',
                marginBottom: '10px'
              }}>
                <div style={{
                  width: '28px',
                  height: '28px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: 'var(--bg-elevated)',
                  borderRadius: '4px',
                  flexShrink: 0
                }}>
                  <File size={14} color="var(--text-muted)" />
                </div>
                <div style={{
                  fontSize: '13px',
                  fontWeight: 500,
                  color: 'var(--text-primary)',
                  lineHeight: '1.3',
                  overflow: 'hidden',
                  display: '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical',
                  fontFamily: 'var(--font-mono)',
                }}>
                  {node.title || 'Untitled'}
                </div>
              </div>

              {/* Description or Content Preview */}
              {(node.description || node.notes) && (
                <div style={{
                  flex: 1,
                  fontSize: '12px',
                  color: 'var(--text-secondary)',
                  lineHeight: '1.5',
                  overflow: 'hidden',
                  display: '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical',
                  marginBottom: '10px',
                  fontFamily: 'var(--font-body)',
                }}>
                  {node.description || truncateContent(node.notes)}
                </div>
              )}

              {/* Footer with Dimensions */}
              {node.dimensions && node.dimensions.length > 0 && (
                <div style={{
                  display: 'flex',
                  gap: '4px',
                  flexWrap: 'wrap',
                  marginTop: 'auto'
                }}>
                  {node.dimensions.slice(0, 3).map(dim => (
                    <span
                      key={dim}
                      style={{
                        padding: '2px 6px',
                        background: 'var(--bg-elevated)',
                        borderRadius: '4px',
                        fontSize: '10px',
                        color: 'var(--text-muted)'
                      }}
                    >
                      {dim}
                    </span>
                  ))}
                  {node.dimensions.length > 3 && (
                    <span style={{
                      padding: '2px 6px',
                      fontSize: '10px',
                      color: 'var(--text-muted)'
                    }}>
                      +{node.dimensions.length - 3}
                    </span>
                  )}
                </div>
              )}
            </button>
        ))}
      </div>
    </div>
  );
}
