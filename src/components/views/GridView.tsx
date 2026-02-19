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
                background: '#0a0a0a',
                border: '1px solid #1a1a1a',
                borderRadius: '8px',
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'all 0.2s',
                minHeight: '140px'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = '#111';
                e.currentTarget.style.borderColor = '#333';
                e.currentTarget.style.transform = 'translateY(-2px)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = '#0a0a0a';
                e.currentTarget.style.borderColor = '#1a1a1a';
                e.currentTarget.style.transform = 'translateY(0)';
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
                  background: '#1a1a1a',
                  borderRadius: '6px',
                  flexShrink: 0
                }}>
                  <File size={14} color="#666" />
                </div>
                <div style={{
                  fontSize: '13px',
                  fontWeight: 500,
                  color: '#e5e5e5',
                  lineHeight: '1.3',
                  overflow: 'hidden',
                  display: '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical'
                }}>
                  {node.title || 'Untitled'}
                </div>
              </div>

              {/* Description or Content Preview */}
              {(node.description || node.notes) && (
                <div style={{
                  flex: 1,
                  fontSize: '11px',
                  color: '#666',
                  lineHeight: '1.5',
                  overflow: 'hidden',
                  display: '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical',
                  marginBottom: '10px'
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
                      color: '#555'
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
