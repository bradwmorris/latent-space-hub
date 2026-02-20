"use client";

import { useEffect, useMemo, useState, useRef, useCallback, type DragEvent } from 'react';
import { Plus, Trash2, LayoutGrid, List, Columns3, Save, Filter, ChevronDown, X } from 'lucide-react';
import type { Node } from '@/types/database';
import InputDialog from '../common/InputDialog';
import { getNodeIcon } from '@/utils/nodeIcons';

const isReadOnly = process.env.NEXT_PUBLIC_READONLY_MODE === 'true';

type ViewMode = 'grid' | 'list' | 'kanban';

// Each column can have a primary dimension and optional secondary filter (AND logic)
interface ColumnFilter {
  id: string;
  dimension: string;     // Primary dimension
  filterBy?: string;     // Optional secondary dimension (AND filter)
}

interface SavedView {
  id: string;
  name: string;
  filters: string[];              // Legacy: simple dimension names
  columnFilters?: ColumnFilter[]; // NEW: columns with optional secondary filters
  viewMode: ViewMode;
  kanbanColumns?: { dimension: string; order: number }[];
  createdAt: string;
}

interface DimensionSummary {
  dimension: string;
  count: number;
  isPriority: boolean;
  description?: string | null;
}

interface ViewsOverlayProps {
  onNodeClick: (nodeId: number) => void;
  onNodeOpenInOtherPane?: (nodeId: number) => void;
  refreshToken?: number;
}

export default function ViewsOverlay({ onNodeClick, onNodeOpenInOtherPane, refreshToken = 0 }: ViewsOverlayProps) {
  // Dimensions for filter picker
  const [dimensions, setDimensions] = useState<DimensionSummary[]>([]);
  const [dimensionsLoading, setDimensionsLoading] = useState(true);

  // View mode state (local - simpler for now)
  const [viewMode, setViewMode] = useState<ViewMode>('list');

  // Filter/View system state (local - simpler for now)
  const [columns, setColumns] = useState<ColumnFilter[]>([]);
  const [filteredNodes, setFilteredNodes] = useState<Node[]>([]);
  const [filteredNodesLoading, setFilteredNodesLoading] = useState(false);
  const [showFilterPicker, setShowFilterPicker] = useState(false);
  const [filterSearchQuery, setFilterSearchQuery] = useState('');
  const [savedViews, setSavedViews] = useState<SavedView[]>([]);
  const [activeViewId, setActiveViewId] = useState<string | null>(null);
  const [showSaveViewDialog, setShowSaveViewDialog] = useState(false);
  const [showSavedViewsDropdown, setShowSavedViewsDropdown] = useState(false);

  // Which column is showing filter picker (by column ID)
  const [showColumnFilterPicker, setShowColumnFilterPicker] = useState<string | null>(null);

  // Node priority ordering within dimensions (local for now)
  const [dimensionOrders, setDimensionOrders] = useState<Record<string, number[]>>({});

  // Drag state
  const draggedNodeRef = useRef<{ id: number; title?: string; dimensions?: string[] } | null>(null);

  // Derive selectedFilters for backward compatibility (unique dimensions)
  const selectedFilters = useMemo(() =>
    [...new Set(columns.map(c => c.dimension))],
    [columns]
  );

  // Kanban drag states
  const [draggedNodeId, setDraggedNodeId] = useState<number | null>(null);
  const [draggedFromColumn, setDraggedFromColumn] = useState<string | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<string | null>(null);

  // Column reorder state
  const [draggedColumn, setDraggedColumn] = useState<string | null>(null);
  const [columnDropTarget, setColumnDropTarget] = useState<string | null>(null);

  // Reorder state within dimension
  const [reorderDrag, setReorderDrag] = useState<{ nodeId: number; dimension: string; index: number } | null>(null);
  const [reorderDropIndex, setReorderDropIndex] = useState<number | null>(null);

  // Active view helper
  const activeView = savedViews.find(v => v.id === activeViewId);

  // Sorted dimensions (locked first)
  const sortedDimensions = useMemo(() => {
    return [...dimensions].sort((a, b) => {
      if (a.isPriority && !b.isPriority) return -1;
      if (!a.isPriority && b.isPriority) return 1;
      return a.dimension.localeCompare(b.dimension);
    });
  }, [dimensions]);

  // Fetch functions defined first (memoized)
  const fetchDimensions = useCallback(async () => {
    setDimensionsLoading(true);
    try {
      const response = await fetch('/api/dimensions');
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to fetch dimensions');
      }
      setDimensions(data.data || []);
    } catch (error) {
      console.error('Error fetching dimensions:', error);
    } finally {
      setDimensionsLoading(false);
    }
  }, []);

  const fetchAllNodes = useCallback(async () => {
    setFilteredNodesLoading(true);
    try {
      const response = await fetch('/api/nodes?limit=500&sort=created_at&order=desc');
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to fetch nodes');
      }
      setFilteredNodes(data.data || []);
    } catch (error) {
      console.error('Error fetching nodes:', error);
    } finally {
      setFilteredNodesLoading(false);
    }
  }, []);

  const fetchFilteredNodes = useCallback(async (filters: string[]) => {
    if (filters.length === 0) {
      fetchAllNodes();
      return;
    }
    setFilteredNodesLoading(true);
    try {
      const response = await fetch(`/api/nodes?limit=500&sort=created_at&order=desc`);
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to fetch nodes');
      }
      // Filter client-side to get nodes matching selected dimensions
      const allFetched: Node[] = data.data || [];
      const filtered = allFetched.filter(node =>
        node.dimensions?.some(d => filters.includes(d))
      );
      setFilteredNodes(filtered);
    } catch (error) {
      console.error('Error fetching filtered nodes:', error);
    } finally {
      setFilteredNodesLoading(false);
    }
  }, [fetchAllNodes]);

  // Stringify filters for stable dependency
  const filtersKey = selectedFilters.join(',');

  // Fetch dimensions on mount
  useEffect(() => {
    fetchDimensions();
  }, [fetchDimensions]);

  // Fetch nodes on mount and when filters/refreshToken change
  useEffect(() => {
    if (refreshToken > 0) {
      console.log('🔄 Feed refreshing due to SSE event (refreshToken:', refreshToken, ')');
    }
    if (selectedFilters.length > 0) {
      fetchFilteredNodes(selectedFilters);
    } else {
      fetchAllNodes();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtersKey, refreshToken]);

  // Also refresh dimensions when data changes (for filter picker counts)
  useEffect(() => {
    if (refreshToken > 0) {
      fetchDimensions();
    }
  }, [refreshToken, fetchDimensions]);

  // Column management
  const addColumn = (dimension: string) => {
    const newColumn: ColumnFilter = {
      id: `col-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      dimension
    };
    setColumns([...columns, newColumn]);
    setShowFilterPicker(false);
    setFilterSearchQuery('');
  };

  const removeColumn = (columnId: string) => {
    setColumns(columns.filter(c => c.id !== columnId));
  };

  const removeFilter = (dimension: string) => {
    const idx = columns.findIndex(c => c.dimension === dimension);
    if (idx !== -1) {
      setColumns(columns.filter((_, i) => i !== idx));
    }
  };

  const clearFilters = () => {
    setColumns([]);
    setActiveViewId(null);
  };

  // Column filter helpers
  const getColumn = (columnId: string): ColumnFilter | undefined => {
    return columns.find(c => c.id === columnId);
  };

  const setColumnSecondaryFilter = (columnId: string, filterBy: string | undefined) => {
    setColumns(columns.map(c =>
      c.id === columnId ? { ...c, filterBy } : c
    ));
    setShowColumnFilterPicker(null);
  };

  const getColumnLabel = (column: ColumnFilter): string => {
    return column.filterBy ? `${column.dimension} + ${column.filterBy}` : column.dimension;
  };

  const getNodesForColumnById = (columnId: string): Node[] => {
    const column = getColumn(columnId);
    if (!column) return [];
    return filteredNodes.filter(node => {
      const hasPrimary = node.dimensions?.includes(column.dimension);
      if (!hasPrimary) return false;
      if (column.filterBy) {
        return node.dimensions?.includes(column.filterBy);
      }
      return true;
    });
  };

  // Column reorder handler
  const handleColumnReorder = (draggedColumnId: string, targetColumnId: string) => {
    if (draggedColumnId === targetColumnId) return;

    const currentColumns = [...columns];
    const draggedIndex = currentColumns.findIndex(c => c.id === draggedColumnId);
    const targetIndex = currentColumns.findIndex(c => c.id === targetColumnId);

    if (draggedIndex === -1 || targetIndex === -1) return;

    const [draggedItem] = currentColumns.splice(draggedIndex, 1);
    currentColumns.splice(targetIndex, 0, draggedItem);

    setColumns(currentColumns);
  };

  // Kanban drag handlers - disabled in readonly mode
  const handleKanbanDrop = async (nodeId: number, fromDimension: string, toDimension: string) => {
    if (isReadOnly) return; // No dimension changes in readonly mode
    if (fromDimension === toDimension) return;

    const node = filteredNodes.find(n => n.id === nodeId);
    if (!node) return;

    const newDimensions = [...(node.dimensions || [])].filter(d => d !== fromDimension);
    if (!newDimensions.includes(toDimension)) {
      newDimensions.push(toDimension);
    }

    // Optimistic update
    setFilteredNodes(prev => prev.map(n =>
      n.id === nodeId ? { ...n, dimensions: newDimensions } : n
    ));

    try {
      const response = await fetch(`/api/nodes/${nodeId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dimensions: newDimensions })
      });

      if (!response.ok) {
        // Revert on failure
        setFilteredNodes(prev => prev.map(n =>
          n.id === nodeId ? { ...n, dimensions: node.dimensions } : n
        ));
      }
    } catch (error) {
      console.error('Error updating node dimensions:', error);
      setFilteredNodes(prev => prev.map(n =>
        n.id === nodeId ? { ...n, dimensions: node.dimensions } : n
      ));
    }
  };

  const handleKanbanNodeDragStart = (e: DragEvent<HTMLDivElement>, nodeId: number, fromColumn: string) => {
    if (isReadOnly) {
      e.preventDefault();
      return;
    }
    setDraggedNodeId(nodeId);
    setDraggedFromColumn(fromColumn);
    e.dataTransfer.effectAllowed = 'copyMove';
    const node = filteredNodes.find(n => n.id === nodeId);
    const title = node?.title || 'Untitled';
    e.dataTransfer.setData('application/x-rah-node', JSON.stringify({ id: nodeId, title }));
    e.dataTransfer.setData('application/node-info', JSON.stringify({ id: nodeId, title, dimensions: node?.dimensions || [] }));
    e.dataTransfer.setData('text/plain', `[NODE:${nodeId}:"${title}"]`);
    draggedNodeRef.current = { id: nodeId, title, dimensions: node?.dimensions || [] };
  };

  const handleKanbanNodeDragEnd = () => {
    setDraggedNodeId(null);
    setDraggedFromColumn(null);
    setDragOverColumn(null);
    draggedNodeRef.current = null;
  };

  const handleKanbanColumnDragOver = (e: DragEvent<HTMLDivElement>, columnDimension: string) => {
    e.preventDefault();
    if (draggedNodeId !== null) {
      setDragOverColumn(columnDimension);
    }
  };

  const handleKanbanColumnDrop = (e: DragEvent<HTMLDivElement>, targetDimension: string) => {
    e.preventDefault();
    if (draggedNodeId !== null && draggedFromColumn !== null) {
      handleKanbanDrop(draggedNodeId, draggedFromColumn, targetDimension);
    }
    setDragOverColumn(null);
  };

  // Node ordering
  const getOrderedNodes = (dimension: string, nodesInDimension: Node[]): Node[] => {
    const order = dimensionOrders[dimension];
    if (!order || order.length === 0) return nodesInDimension;

    return [...nodesInDimension].sort((a, b) => {
      const aIndex = order.indexOf(a.id);
      const bIndex = order.indexOf(b.id);
      if (aIndex === -1 && bIndex === -1) return 0;
      if (aIndex === -1) return 1;
      if (bIndex === -1) return -1;
      return aIndex - bIndex;
    });
  };

  const handleNodeReorder = (dimension: string, nodeId: number, newIndex: number, nodesInDimension: Node[]) => {
    const currentOrder = dimensionOrders[dimension] || nodesInDimension.map(n => n.id);
    const nodeIndex = currentOrder.indexOf(nodeId);
    if (nodeIndex === -1) return;

    const newOrder = [...currentOrder];
    newOrder.splice(nodeIndex, 1);
    newOrder.splice(newIndex, 0, nodeId);

    setDimensionOrders(prev => ({
      ...prev,
      [dimension]: newOrder
    }));
  };

  // Saved views
  const handleSaveView = (name: string) => {
    const newView: SavedView = {
      id: `view-${Date.now()}`,
      name,
      filters: selectedFilters,
      columnFilters: columns,
      viewMode,
      createdAt: new Date().toISOString()
    };
    setSavedViews([...savedViews, newView]);
    setActiveViewId(newView.id);
    setShowSaveViewDialog(false);
  };

  const handleLoadView = (view: SavedView) => {
    if (view.columnFilters) {
      setColumns(view.columnFilters);
    } else {
      // Legacy: convert filters to columns
      setColumns(view.filters.map((f, i) => ({
        id: `col-legacy-${i}`,
        dimension: f
      })));
    }
    setViewMode(view.viewMode);
    setActiveViewId(view.id);
    setShowSavedViewsDropdown(false);
  };

  const handleDeleteView = (viewId: string) => {
    setSavedViews(savedViews.filter(v => v.id !== viewId));
    if (activeViewId === viewId) {
      setActiveViewId(null);
    }
  };

  // Filter dimensions for picker
  const filterPickerDimensions = sortedDimensions.filter(d =>
    d.dimension.toLowerCase().includes(filterSearchQuery.toLowerCase())
  );

  // Render node card
  const renderNodeCard = (node: Node, columnId?: string, dimension?: string) => {
    const nodeIcon = getNodeIcon(node);

    return (
      <div
        key={node.id}
        onClick={() => onNodeClick(node.id)}
        draggable
        onDragStart={(e) => {
          if (dimension) {
            handleKanbanNodeDragStart(e, node.id, dimension);
          } else {
            const title = node.title || 'Untitled';
            e.dataTransfer.setData('application/x-rah-node', JSON.stringify({ id: node.id, title }));
            e.dataTransfer.setData('application/node-info', JSON.stringify({ id: node.id, title, dimensions: node.dimensions || [] }));
            e.dataTransfer.setData('text/plain', `[NODE:${node.id}:"${title}"]`);
          }
        }}
        onDragEnd={handleKanbanNodeDragEnd}
        style={{
          padding: '12px 0 14px 0',
          background: 'transparent',
          cursor: 'pointer',
          transition: 'all 0.15s ease',
          borderBottom: '1px solid #1a1a1a',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = 'rgba(255,255,255,0.02)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'transparent';
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          if (onNodeOpenInOtherPane) {
            onNodeOpenInOtherPane(node.id);
          }
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
          <div style={{
            width: '24px',
            height: '24px',
            borderRadius: '6px',
            background: 'rgba(136, 136, 136, 0.1)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0
          }}>
            {nodeIcon}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              marginBottom: '4px'
            }}>
              <span style={{
                fontSize: '13px',
                fontWeight: 500,
                color: '#f0f0f0',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                flex: 1,
                minWidth: 0,
              }}>
                {node.title || 'Untitled'}
              </span>
              <span style={{
                fontSize: '10px',
                color: '#555',
                background: '#1a1a1a',
                padding: '2px 6px',
                borderRadius: '4px',
                fontFamily: 'monospace',
                flexShrink: 0,
              }}>
                #{node.id}
              </span>
            </div>
            <div style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '4px',
              minHeight: '18px',
            }}>
              {node.dimensions && node.dimensions.length > 0 ? (
                <>
                  {node.dimensions.slice(0, 3).map(d => (
                    <span
                      key={d}
                      style={{
                        fontSize: '10px',
                        padding: '2px 6px',
                        background: 'rgba(136, 136, 136, 0.1)',
                        color: '#888',
                        borderRadius: '4px'
                      }}
                    >
                      {d}
                    </span>
                  ))}
                  {node.dimensions.length > 3 && (
                    <span style={{ fontSize: '10px', color: '#666' }}>
                      +{node.dimensions.length - 3}
                    </span>
                  )}
                </>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    );
  };

  // Render list view
  const renderListView = () => {
    if (filteredNodesLoading) {
      return (
        <div style={{ padding: '40px', color: '#888', textAlign: 'center' }}>
          Loading...
        </div>
      );
    }

    if (filteredNodes.length === 0) {
      return (
        <div style={{ padding: '40px', color: '#888', textAlign: 'center' }}>
          {selectedFilters.length > 0 ? 'No nodes match the selected filters.' : 'No nodes yet. Add some content to get started.'}
        </div>
      );
    }

    return (
      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: '16px',
        display: 'flex',
        flexDirection: 'column',
        gap: '8px'
      }}>
        {filteredNodes.map(node => renderNodeCard(node))}
      </div>
    );
  };

  // Render grid view
  const renderGridView = () => {
    if (filteredNodesLoading) {
      return (
        <div style={{ padding: '40px', color: '#888', textAlign: 'center' }}>
          Loading...
        </div>
      );
    }

    if (filteredNodes.length === 0) {
      return (
        <div style={{ padding: '40px', color: '#888', textAlign: 'center' }}>
          {selectedFilters.length > 0 ? 'No nodes match the selected filters.' : 'No nodes yet. Add some content to get started.'}
        </div>
      );
    }

    return (
      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: '16px',
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
        gap: '12px',
        alignContent: 'start'
      }}>
        {filteredNodes.map(node => renderNodeCard(node))}
      </div>
    );
  };

  // Render kanban view
  const renderKanbanView = () => {
    if (columns.length === 0) {
      return (
        <div style={{ padding: '40px', color: '#888', textAlign: 'center' }}>
          Add dimension filters to see kanban columns.
        </div>
      );
    }

    return (
      <div style={{
        flex: 1,
        overflowX: 'auto',
        overflowY: 'hidden',
        padding: '16px',
        display: 'flex',
        gap: '16px'
      }}>
        {columns.map((column) => {
          const nodesInColumn = getNodesForColumnById(column.id);
          const orderedNodes = getOrderedNodes(column.dimension, nodesInColumn);
          const isDropTarget = dragOverColumn === column.dimension;

          return (
            <div
              key={column.id}
              draggable
              onDragStart={(e) => {
                setDraggedColumn(column.id);
                e.dataTransfer.effectAllowed = 'move';
              }}
              onDragEnd={() => {
                setDraggedColumn(null);
                setColumnDropTarget(null);
              }}
              onDragOver={(e) => {
                e.preventDefault();
                if (draggedColumn && draggedColumn !== column.id) {
                  setColumnDropTarget(column.id);
                }
                handleKanbanColumnDragOver(e, column.dimension);
              }}
              onDragLeave={() => {
                setColumnDropTarget(null);
              }}
              onDrop={(e) => {
                if (draggedColumn && draggedColumn !== column.id) {
                  handleColumnReorder(draggedColumn, column.id);
                  setColumnDropTarget(null);
                }
                handleKanbanColumnDrop(e, column.dimension);
              }}
              style={{
                minWidth: '280px',
                maxWidth: '320px',
                background: columnDropTarget === column.id ? 'rgba(136, 136, 136, 0.05)' : '#0c0c0c',
                borderRadius: '10px',
                border: isDropTarget ? '2px dashed #888' : '1px solid #1a1a1a',
                display: 'flex',
                flexDirection: 'column',
                maxHeight: '100%',
                transition: 'border-color 0.15s ease'
              }}
            >
              {/* Column header */}
              <div style={{
                padding: '12px 14px',
                borderBottom: '1px solid #1a1a1a',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                cursor: 'grab'
              }}>
                <div style={{
                  fontSize: '12px',
                  fontWeight: 600,
                  color: '#f0f0f0',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em'
                }}>
                  {getColumnLabel(column)}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <span style={{
                    fontSize: '11px',
                    color: '#666',
                    fontFamily: 'monospace'
                  }}>
                    {nodesInColumn.length}
                  </span>
                  <button
                    onClick={() => removeColumn(column.id)}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: '#666',
                      cursor: 'pointer',
                      padding: '2px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.color = '#ef4444'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.color = '#666'; }}
                  >
                    <X size={14} />
                  </button>
                </div>
              </div>

              {/* Column content */}
              <div style={{
                flex: 1,
                overflowY: 'auto',
                padding: '12px',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px'
              }}>
                {orderedNodes.map((node, index) => (
                  <div key={node.id}>
                    {renderNodeCard(node, column.id, column.dimension)}
                  </div>
                ))}
                {nodesInColumn.length === 0 && (
                  <div style={{
                    padding: '20px',
                    color: '#555',
                    fontSize: '12px',
                    textAlign: 'center',
                    border: '1px dashed #2a2a2a',
                    borderRadius: '6px'
                  }}>
                    Drop nodes here
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      background: 'transparent'
    }}>
      {/* Header with filters */}
      <div style={{
        padding: '12px 16px',
        borderBottom: '1px solid #1a1a1a',
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        flexWrap: 'wrap'
      }}>
        {/* Filter chips */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', flex: 1 }}>
          {selectedFilters.map(filter => (
            <div
              key={filter}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '4px 10px',
                background: 'rgba(136, 136, 136, 0.1)',
                border: '1px solid rgba(136, 136, 136, 0.2)',
                borderRadius: '6px',
                fontSize: '12px',
                color: '#888'
              }}
            >
              {filter}
              <button
                onClick={() => removeFilter(filter)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#888',
                  cursor: 'pointer',
                  padding: '0',
                  display: 'flex',
                  alignItems: 'center'
                }}
              >
                <X size={12} />
              </button>
            </div>
          ))}

          {/* Add filter button */}
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => setShowFilterPicker(!showFilterPicker)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                padding: '4px 10px',
                background: 'transparent',
                border: '1px dashed #333',
                borderRadius: '6px',
                color: '#666',
                fontSize: '12px',
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = '#888';
                e.currentTarget.style.color = '#888';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = '#333';
                e.currentTarget.style.color = '#666';
              }}
            >
              <Plus size={12} />
              Filter
            </button>

            {/* Filter picker dropdown */}
            {showFilterPicker && (
              <div style={{
                position: 'absolute',
                top: '100%',
                left: 0,
                marginTop: '4px',
                background: '#1a1a1a',
                border: '1px solid #2a2a2a',
                borderRadius: '8px',
                padding: '8px',
                minWidth: '200px',
                maxHeight: '300px',
                overflowY: 'auto',
                zIndex: 1000,
                boxShadow: '0 4px 12px rgba(0,0,0,0.3)'
              }}>
                <input
                  type="text"
                  value={filterSearchQuery}
                  onChange={(e) => setFilterSearchQuery(e.target.value)}
                  placeholder="Search dimensions..."
                  autoFocus
                  style={{
                    width: '100%',
                    padding: '8px',
                    background: '#0a0a0a',
                    border: '1px solid #2a2a2a',
                    borderRadius: '6px',
                    color: '#f0f0f0',
                    fontSize: '12px',
                    marginBottom: '8px'
                  }}
                />
                {dimensionsLoading ? (
                  <div style={{ padding: '12px', color: '#666', fontSize: '12px', textAlign: 'center' }}>
                    Loading dimensions...
                  </div>
                ) : filterPickerDimensions.length === 0 ? (
                  <div style={{ padding: '12px', color: '#666', fontSize: '12px', textAlign: 'center' }}>
                    {filterSearchQuery ? 'No matching dimensions' : 'No dimensions available'}
                  </div>
                ) : (
                  filterPickerDimensions.map(d => (
                    <button
                      key={d.dimension}
                      onClick={() => addColumn(d.dimension)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        width: '100%',
                        padding: '8px',
                        background: 'transparent',
                        border: 'none',
                        borderRadius: '4px',
                        color: '#ccc',
                        fontSize: '12px',
                        cursor: 'pointer',
                        textAlign: 'left'
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = '#2a2a2a'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                    >
                      <span>{d.dimension}</span>
                      <span style={{ color: '#666', fontFamily: 'monospace', fontSize: '11px' }}>
                        {d.count}
                      </span>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>

          {selectedFilters.length > 0 && (
            <button
              onClick={clearFilters}
              style={{
                padding: '4px 8px',
                background: 'transparent',
                border: 'none',
                color: '#666',
                fontSize: '11px',
                cursor: 'pointer'
              }}
              onMouseEnter={(e) => { e.currentTarget.style.color = '#ef4444'; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = '#666'; }}
            >
              Clear all
            </button>
          )}
        </div>

        {/* View mode toggle */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '2px',
          padding: '2px',
          background: '#111',
          borderRadius: '6px'
        }}>
          <button
            onClick={() => setViewMode('list')}
            style={{
              padding: '6px 8px',
              background: viewMode === 'list' ? '#1a1a1a' : 'transparent',
              border: 'none',
              borderRadius: '4px',
              color: viewMode === 'list' ? '#999' : '#666',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center'
            }}
            title="List view"
          >
            <List size={14} />
          </button>
          <button
            onClick={() => setViewMode('grid')}
            style={{
              padding: '6px 8px',
              background: viewMode === 'grid' ? '#1a1a1a' : 'transparent',
              border: 'none',
              borderRadius: '4px',
              color: viewMode === 'grid' ? '#999' : '#666',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center'
            }}
            title="Grid view"
          >
            <LayoutGrid size={14} />
          </button>
          <button
            onClick={() => setViewMode('kanban')}
            style={{
              padding: '6px 8px',
              background: viewMode === 'kanban' ? '#1a1a1a' : 'transparent',
              border: 'none',
              borderRadius: '4px',
              color: viewMode === 'kanban' ? '#999' : '#666',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center'
            }}
            title="Kanban view"
          >
            <Columns3 size={14} />
          </button>
        </div>

        {/* Saved views dropdown */}
        <div style={{ position: 'relative' }}>
          <button
            onClick={() => setShowSavedViewsDropdown(!showSavedViewsDropdown)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              padding: '6px 10px',
              background: 'transparent',
              border: '1px solid #2a2a2a',
              borderRadius: '6px',
              color: activeView ? '#999' : '#888',
              fontSize: '12px',
              cursor: 'pointer'
            }}
          >
            <Filter size={12} />
            {activeView?.name || 'Views'}
            <ChevronDown size={12} />
          </button>

          {showSavedViewsDropdown && (
            <div style={{
              position: 'absolute',
              top: '100%',
              right: 0,
              marginTop: '4px',
              background: '#1a1a1a',
              border: '1px solid #2a2a2a',
              borderRadius: '8px',
              padding: '4px',
              minWidth: '180px',
              zIndex: 1000,
              boxShadow: '0 4px 12px rgba(0,0,0,0.3)'
            }}>
              {savedViews.length === 0 ? (
                <div style={{ padding: '12px', color: '#666', fontSize: '12px', textAlign: 'center' }}>
                  No saved views yet
                </div>
              ) : (
                savedViews.map(view => (
                  <div
                    key={view.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '8px 10px',
                      borderRadius: '4px',
                      background: activeViewId === view.id ? '#2a2a2a' : 'transparent',
                      cursor: 'pointer'
                    }}
                    onClick={() => handleLoadView(view)}
                    onMouseEnter={(e) => {
                      if (activeViewId !== view.id) {
                        e.currentTarget.style.background = '#222';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (activeViewId !== view.id) {
                        e.currentTarget.style.background = 'transparent';
                      }
                    }}
                  >
                    <span style={{ color: '#ccc', fontSize: '12px' }}>{view.name}</span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteView(view.id);
                      }}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: '#666',
                        cursor: 'pointer',
                        padding: '2px'
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.color = '#ef4444'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.color = '#666'; }}
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                ))
              )}
              <div style={{ borderTop: '1px solid #2a2a2a', marginTop: '4px', paddingTop: '4px' }}>
                <button
                  onClick={() => {
                    setShowSavedViewsDropdown(false);
                    setShowSaveViewDialog(true);
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    width: '100%',
                    padding: '8px 10px',
                    background: 'transparent',
                    border: 'none',
                    borderRadius: '4px',
                    color: '#999',
                    fontSize: '12px',
                    cursor: 'pointer'
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = '#222'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                >
                  <Save size={12} />
                  Save current view
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Content area */}
      {viewMode === 'list' && renderListView()}
      {viewMode === 'grid' && renderGridView()}
      {viewMode === 'kanban' && renderKanbanView()}

      {/* Save view dialog */}
      <InputDialog
        open={showSaveViewDialog}
        onCancel={() => setShowSaveViewDialog(false)}
        onConfirm={handleSaveView}
        title="Save View"
        message="Enter a name for this view"
        placeholder="View name"
        confirmLabel="Save"
      />
    </div>
  );
}
