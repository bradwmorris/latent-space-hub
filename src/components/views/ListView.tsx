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
        color: '#666',
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
              background: '#0a0a0a',
              border: '1px solid #1a1a1a',
              borderRadius: '6px',
              cursor: 'pointer',
              textAlign: 'left',
              transition: 'all 0.2s'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = '#111';
              e.currentTarget.style.borderColor = '#333';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = '#0a0a0a';
              e.currentTarget.style.borderColor = '#1a1a1a';
            }}
          >
            {/* Icon */}
            <div style={{
              width: '32px',
              height: '32px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: '#1a1a1a',
              borderRadius: '6px',
              flexShrink: 0
            }}>
              <File size={16} color="#666" />
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
                  color: '#e5e5e5',
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
                  color: '#666',
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
                          background: '#1a1a1a',
                          borderRadius: '3px',
                          fontSize: '10px',
                          color: '#888'
                        }}
                      >
                        {dim}
                      </span>
                    ))}
                    {node.dimensions.length > 3 && (
                      <span style={{
                        padding: '2px 6px',
                        fontSize: '10px',
                        color: '#666'
                      }}>
                        +{node.dimensions.length - 3}
                      </span>
                    )}
                  </div>
                )}

                {/* Event date (if available) or Updated date */}
                <span style={{
                  fontSize: '10px',
                  color: node.event_date ? '#6ee7b7' : '#555'
                }}>
                  {node.event_date ? formatDate(node.event_date) : formatDate(node.updated_at || node.created_at)}
                </span>

                {/* Edge count */}
                {node.edge_count !== undefined && node.edge_count > 0 && (
                  <span style={{
                    fontSize: '10px',
                    color: '#555'
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
