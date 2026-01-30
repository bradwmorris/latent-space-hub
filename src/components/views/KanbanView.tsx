"use client";

import { useState, DragEvent } from 'react';
import { Plus, GripVertical, X } from 'lucide-react';
import { Node } from '@/types/database';
import { KanbanColumn } from '@/types/views';

interface KanbanViewProps {
  nodes: Node[];
  columns: KanbanColumn[];
  dimensions: string[];
  onNodeClick: (nodeId: number) => void;
  onColumnChange: (columns: KanbanColumn[]) => void;
  onNodeDimensionUpdate: (nodeId: number, newDimension: string, oldDimension?: string) => void;
}

export default function KanbanView({
  nodes,
  columns,
  dimensions,
  onNodeClick,
  onColumnChange,
  onNodeDimensionUpdate
}: KanbanViewProps) {
  const [showColumnPicker, setShowColumnPicker] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [draggedNodeId, setDraggedNodeId] = useState<number | null>(null);
  const [draggedFromColumn, setDraggedFromColumn] = useState<string | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<string | null>(null);
  const [draggingColumnId, setDraggingColumnId] = useState<string | null>(null);
  const [dragOverColumnId, setDragOverColumnId] = useState<string | null>(null);

  // Get nodes for a specific column (dimension)
  const getNodesForColumn = (dimension: string) => {
    return nodes.filter(node => node.dimensions?.includes(dimension));
  };

  // Get uncategorized nodes (not in any column)
  const getUncategorizedNodes = () => {
    const columnDimensions = columns.map(c => c.dimension);
    return nodes.filter(node =>
      !node.dimensions || !node.dimensions.some(d => columnDimensions.includes(d))
    );
  };

  const handleAddColumn = (dimension: string) => {
    const newColumn: KanbanColumn = {
      id: `col-${Date.now()}`,
      dimension,
      order: columns.length
    };
    onColumnChange([...columns, newColumn]);
    setShowColumnPicker(false);
    setSearchQuery('');
  };

  const handleRemoveColumn = (columnId: string) => {
    onColumnChange(columns.filter(c => c.id !== columnId));
  };

  // Node drag handlers
  const handleNodeDragStart = (e: DragEvent, nodeId: number, fromColumn: string) => {
    setDraggedNodeId(nodeId);
    setDraggedFromColumn(fromColumn);
    e.dataTransfer.effectAllowed = 'copyMove';

    // Find the node to get its title for chat drop
    const node = nodes.find(n => n.id === nodeId);
    const title = node?.title || 'Untitled';

    // Set MIME types for chat input drops
    e.dataTransfer.setData('application/x-rah-node', JSON.stringify({ id: nodeId, title }));
    e.dataTransfer.setData('application/node-info', JSON.stringify({ id: nodeId, title, dimensions: node?.dimensions || [] }));
    e.dataTransfer.setData('text/plain', `[NODE:${nodeId}:"${title}"]`);
  };

  const handleNodeDragEnd = () => {
    setDraggedNodeId(null);
    setDraggedFromColumn(null);
    setDragOverColumn(null);
  };

  const handleColumnDragOver = (e: DragEvent, columnDimension: string) => {
    e.preventDefault();
    if (draggedNodeId !== null) {
      setDragOverColumn(columnDimension);
    }
  };

  const handleColumnDragLeave = () => {
    setDragOverColumn(null);
  };

  const handleColumnDrop = (e: DragEvent, targetDimension: string) => {
    e.preventDefault();
    if (draggedNodeId !== null && draggedFromColumn !== targetDimension) {
      onNodeDimensionUpdate(
        draggedNodeId,
        targetDimension,
        draggedFromColumn || undefined
      );
    }
    handleNodeDragEnd();
  };

  // Column reorder drag handlers
  const handleColumnDragStart = (e: DragEvent, columnId: string) => {
    setDraggingColumnId(columnId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleColumnDragEnd = () => {
    setDraggingColumnId(null);
    setDragOverColumnId(null);
  };

  const handleColumnReorderDragOver = (e: DragEvent, columnId: string) => {
    e.preventDefault();
    if (draggingColumnId && draggingColumnId !== columnId) {
      setDragOverColumnId(columnId);
    }
  };

  const handleColumnReorderDrop = (e: DragEvent, targetColumnId: string) => {
    e.preventDefault();
    if (!draggingColumnId || draggingColumnId === targetColumnId) return;

    const newColumns = [...columns];
    const dragIndex = newColumns.findIndex(c => c.id === draggingColumnId);
    const dropIndex = newColumns.findIndex(c => c.id === targetColumnId);

    if (dragIndex !== -1 && dropIndex !== -1) {
      const [removed] = newColumns.splice(dragIndex, 1);
      newColumns.splice(dropIndex, 0, removed);
      // Update order values
      newColumns.forEach((col, idx) => { col.order = idx; });
      onColumnChange(newColumns);
    }

    handleColumnDragEnd();
  };

  const filteredDimensions = dimensions.filter(d =>
    d.toLowerCase().includes(searchQuery.toLowerCase()) &&
    !columns.some(c => c.dimension === d)
  );

  const sortedColumns = [...columns].sort((a, b) => a.order - b.order);

  return (
    <div style={{
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      background: '#000'
    }}>
      {/* Column Setup Bar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '8px 12px',
        borderBottom: '1px solid #222',
        background: '#0a0a0a',
        flexShrink: 0
      }}>
        <span style={{ fontSize: '11px', color: '#666', fontWeight: 500 }}>
          Columns:
        </span>

        {columns.length === 0 && (
          <span style={{ fontSize: '11px', color: '#555', fontStyle: 'italic' }}>
            Add dimensions to create columns
          </span>
        )}

        {/* Add Column Button */}
        <div style={{ position: 'relative' }}>
          <button
            onClick={() => setShowColumnPicker(!showColumnPicker)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              padding: '4px 8px',
              background: '#1a1a1a',
              border: '1px solid #333',
              borderRadius: '4px',
              fontSize: '11px',
              color: '#888',
              cursor: 'pointer'
            }}
          >
            <Plus size={12} />
            Add Column
          </button>

          {/* Dimension Picker */}
          {showColumnPicker && (
            <div style={{
              position: 'absolute',
              top: '100%',
              left: 0,
              marginTop: '4px',
              width: '200px',
              maxHeight: '300px',
              background: '#1a1a1a',
              border: '1px solid #333',
              borderRadius: '6px',
              overflow: 'hidden',
              zIndex: 100,
              boxShadow: '0 4px 12px rgba(0,0,0,0.5)'
            }}>
              <input
                type="text"
                placeholder="Search dimensions..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  background: '#0a0a0a',
                  border: 'none',
                  borderBottom: '1px solid #333',
                  color: '#fff',
                  fontSize: '12px',
                  outline: 'none'
                }}
                autoFocus
              />
              <div style={{ maxHeight: '250px', overflowY: 'auto' }}>
                {filteredDimensions.length === 0 ? (
                  <div style={{
                    padding: '12px',
                    fontSize: '12px',
                    color: '#666',
                    textAlign: 'center'
                  }}>
                    No dimensions available
                  </div>
                ) : (
                  filteredDimensions.map(dim => (
                    <button
                      key={dim}
                      onClick={() => handleAddColumn(dim)}
                      style={{
                        width: '100%',
                        padding: '8px 12px',
                        background: 'transparent',
                        border: 'none',
                        color: '#ccc',
                        fontSize: '12px',
                        textAlign: 'left',
                        cursor: 'pointer'
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = '#2a2a2a'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                    >
                      {dim}
                    </button>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {/* Click outside to close */}
        {showColumnPicker && (
          <div
            style={{ position: 'fixed', inset: 0, zIndex: 99 }}
            onClick={() => setShowColumnPicker(false)}
          />
        )}
      </div>

      {/* Kanban Board */}
      <div style={{
        flex: 1,
        display: 'flex',
        gap: '12px',
        padding: '12px',
        overflowX: 'auto',
        overflowY: 'hidden'
      }}>
        {sortedColumns.map(column => {
          const columnNodes = getNodesForColumn(column.dimension);
          const isDropTarget = dragOverColumn === column.dimension && draggedFromColumn !== column.dimension;
          const isReorderTarget = dragOverColumnId === column.id;

          return (
            <div
              key={column.id}
              style={{
                width: '280px',
                minWidth: '280px',
                display: 'flex',
                flexDirection: 'column',
                background: isDropTarget ? '#1e1b4b' : '#0a0a0a',
                border: isReorderTarget ? '2px dashed #9333ea' : '1px solid #1a1a1a',
                borderRadius: '8px',
                transition: 'all 0.2s'
              }}
              onDragOver={(e) => handleColumnDragOver(e, column.dimension)}
              onDragLeave={handleColumnDragLeave}
              onDrop={(e) => handleColumnDrop(e, column.dimension)}
            >
              {/* Column Header */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '10px 12px',
                  borderBottom: '1px solid #1a1a1a',
                  cursor: 'grab'
                }}
                draggable
                onDragStart={(e) => handleColumnDragStart(e, column.id)}
                onDragEnd={handleColumnDragEnd}
                onDragOver={(e) => handleColumnReorderDragOver(e, column.id)}
                onDrop={(e) => handleColumnReorderDrop(e, column.id)}
              >
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}>
                  <GripVertical size={14} color="#444" />
                  <span style={{
                    fontSize: '12px',
                    fontWeight: 600,
                    color: '#e5e5e5',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em'
                  }}>
                    {column.dimension}
                  </span>
                  <span style={{
                    fontSize: '11px',
                    color: '#666',
                    background: '#1a1a1a',
                    padding: '2px 6px',
                    borderRadius: '10px'
                  }}>
                    {columnNodes.length}
                  </span>
                </div>
                <button
                  onClick={() => handleRemoveColumn(column.id)}
                  style={{
                    background: 'none',
                    border: 'none',
                    padding: '4px',
                    cursor: 'pointer',
                    color: '#666',
                    display: 'flex',
                    alignItems: 'center'
                  }}
                >
                  <X size={14} />
                </button>
              </div>

              {/* Column Content */}
              <div style={{
                flex: 1,
                overflowY: 'auto',
                padding: '8px'
              }}>
                {columnNodes.map(node => (
                  <div
                    key={node.id}
                    draggable
                    onDragStart={(e) => handleNodeDragStart(e, node.id, column.dimension)}
                    onDragEnd={handleNodeDragEnd}
                    onClick={() => onNodeClick(node.id)}
                    style={{
                      padding: '10px',
                      marginBottom: '6px',
                      background: draggedNodeId === node.id ? '#1a1a1a' : '#111',
                      border: '1px solid #222',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      opacity: draggedNodeId === node.id ? 0.5 : 1,
                      transition: 'all 0.2s'
                    }}
                    onMouseEnter={(e) => {
                      if (draggedNodeId !== node.id) {
                        e.currentTarget.style.background = '#1a1a1a';
                        e.currentTarget.style.borderColor = '#333';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (draggedNodeId !== node.id) {
                        e.currentTarget.style.background = '#111';
                        e.currentTarget.style.borderColor = '#222';
                      }
                    }}
                  >
                    <div style={{
                      fontSize: '12px',
                      fontWeight: 500,
                      color: '#e5e5e5',
                      marginBottom: '4px',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap'
                    }}>
                      {node.title || 'Untitled'}
                    </div>
                    {node.dimensions && node.dimensions.length > 1 && (
                      <div style={{
                        display: 'flex',
                        gap: '4px',
                        flexWrap: 'wrap',
                        marginTop: '6px'
                      }}>
                        {node.dimensions
                          .filter(d => d !== column.dimension)
                          .slice(0, 2)
                          .map(dim => (
                            <span
                              key={dim}
                              style={{
                                padding: '2px 6px',
                                background: '#1a1a1a',
                                borderRadius: '3px',
                                fontSize: '10px',
                                color: '#666'
                              }}
                            >
                              {dim}
                            </span>
                          ))}
                      </div>
                    )}
                  </div>
                ))}

                {columnNodes.length === 0 && (
                  <div style={{
                    padding: '20px',
                    textAlign: 'center',
                    color: '#444',
                    fontSize: '11px'
                  }}>
                    Drop nodes here
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {/* Uncategorized Column (if nodes exist without column dimensions) */}
        {columns.length > 0 && getUncategorizedNodes().length > 0 && (
          <div
            style={{
              width: '280px',
              minWidth: '280px',
              display: 'flex',
              flexDirection: 'column',
              background: '#0a0a0a',
              border: '1px dashed #333',
              borderRadius: '8px'
            }}
          >
            <div style={{
              padding: '10px 12px',
              borderBottom: '1px solid #1a1a1a'
            }}>
              <span style={{
                fontSize: '12px',
                fontWeight: 600,
                color: '#666',
                textTransform: 'uppercase',
                letterSpacing: '0.05em'
              }}>
                Uncategorized ({getUncategorizedNodes().length})
              </span>
            </div>
            <div style={{
              flex: 1,
              overflowY: 'auto',
              padding: '8px'
            }}>
              {getUncategorizedNodes().map(node => (
                <div
                  key={node.id}
                  draggable
                  onDragStart={(e) => handleNodeDragStart(e, node.id, '__uncategorized__')}
                  onDragEnd={handleNodeDragEnd}
                  onClick={() => onNodeClick(node.id)}
                  style={{
                    padding: '10px',
                    marginBottom: '6px',
                    background: '#111',
                    border: '1px solid #222',
                    borderRadius: '6px',
                    cursor: 'pointer'
                  }}
                >
                  <div style={{
                    fontSize: '12px',
                    fontWeight: 500,
                    color: '#888',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap'
                  }}>
                    {node.title || 'Untitled'}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Empty State */}
        {columns.length === 0 && (
          <div style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#666',
            fontSize: '13px'
          }}>
            Add dimension columns to organize your nodes
          </div>
        )}
      </div>
    </div>
  );
}
