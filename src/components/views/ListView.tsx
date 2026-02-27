"use client";

import { Node } from '@/types/database';
import { File } from 'lucide-react';

interface ListViewProps {
  nodes: Node[];
  onNodeClick: (nodeId: number) => void;
}

export default function ListView({ nodes, onNodeClick }: ListViewProps) {
  const formatDate = (dateString?: string) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  const truncateContent = (content?: string, maxLength: number = 100) => {
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
        color: 'var(--accent-dark)',
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
      padding: '8px'
    }}>
      {nodes.map(node => (
          <button
            key={node.id}
            onClick={() => onNodeClick(node.id)}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'flex-start',
              gap: '12px',
              padding: '12px',
              marginBottom: '4px',
              background: 'var(--bg-base)',
              border: '1px solid var(--bg-elevated)',
              borderRadius: '6px',
              cursor: 'pointer',
              textAlign: 'left',
              transition: 'all 0.2s'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'var(--bg-surface)';
              e.currentTarget.style.borderColor = 'var(--border-default)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'var(--bg-base)';
              e.currentTarget.style.borderColor = 'var(--bg-elevated)';
            }}
          >
            {/* Icon */}
            <div style={{
              width: '32px',
              height: '32px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'var(--bg-elevated)',
              borderRadius: '6px',
              flexShrink: 0
            }}>
              <File size={16} color="var(--accent-dark)" />
            </div>

            {/* Content */}
            <div style={{ flex: 1, minWidth: 0 }}>
              {/* Title row with node_type badge */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                marginBottom: '4px'
              }}>
                {node.node_type && (
                  <span style={{
                    padding: '1px 5px',
                    background: '#1a1a2e',
                    color: '#818cf8',
                    borderRadius: '3px',
                    fontSize: '9px',
                    fontWeight: 500,
                    flexShrink: 0,
                    border: '1px solid #2d2d5e'
                  }}>
                    {node.node_type}
                  </span>
                )}
                <div style={{
                  fontSize: '13px',
                  fontWeight: 500,
                  color: 'var(--text-primary)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap'
                }}>
                  {node.title || 'Untitled'}
                </div>
              </div>

              {/* Description or Notes Preview */}
              {(node.description || node.notes) && (
                <div style={{
                  fontSize: '12px',
                  color: 'var(--accent-dark)',
                  marginBottom: '8px',
                  lineHeight: '1.4',
                  display: '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical',
                  overflow: 'hidden'
                }}>
                  {node.description || truncateContent(node.notes)}
                </div>
              )}

              {/* Metadata Row */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                flexWrap: 'wrap'
              }}>
                {/* Dimensions */}
                {node.dimensions && node.dimensions.length > 0 && (
                  <div style={{
                    display: 'flex',
                    gap: '4px',
                    flexWrap: 'wrap'
                  }}>
                    {node.dimensions.slice(0, 3).map(dim => (
                      <span
                        key={dim}
                        style={{
                          padding: '2px 6px',
                          background: 'var(--bg-elevated)',
                          borderRadius: '3px',
                          fontSize: '10px',
                          color: 'var(--accent-primary)'
                        }}
                      >
                        {dim}
                      </span>
                    ))}
                    {node.dimensions.length > 3 && (
                      <span style={{
                        padding: '2px 6px',
                        fontSize: '10px',
                        color: 'var(--accent-dark)'
                      }}>
                        +{node.dimensions.length - 3}
                      </span>
                    )}
                  </div>
                )}

                {/* Event date (if available) or Updated date */}
                <span style={{
                  fontSize: '10px',
                  color: node.event_date ? '#6ee7b7' : 'var(--accent-dark)'
                }}>
                  {node.event_date ? formatDate(node.event_date) : formatDate(node.updated_at || node.created_at)}
                </span>

                {/* Edge count */}
                {node.edge_count !== undefined && node.edge_count > 0 && (
                  <span style={{
                    fontSize: '10px',
                    color: 'var(--accent-dark)'
                  }}>
                    {node.edge_count} connections
                  </span>
                )}
              </div>
            </div>
          </button>
      ))}
    </div>
  );
}
