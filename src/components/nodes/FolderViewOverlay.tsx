"use client";

import { useEffect, useMemo, useState, useRef, type DragEvent } from 'react';
import { Check, X, ArrowLeft, Plus, Trash2, Edit2, LayoutGrid, List, Columns3, Save, Filter, ChevronDown, Lock } from 'lucide-react';
import type { Node } from '@/types/database';
import ConfirmDialog from '../common/ConfirmDialog';
import InputDialog from '../common/InputDialog';
import { getNodeIcon } from '@/utils/nodeIcons';
import LucideIconPicker, { DynamicIcon } from '../common/LucideIconPicker';
import { usePersistentState } from '@/hooks/usePersistentState';

const isReadOnly = process.env.NEXT_PUBLIC_READONLY_MODE === 'true';

type DimensionViewMode = 'grid' | 'list' | 'kanban';
type OverlayMode = 'folders' | 'filtered';

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
  viewMode: DimensionViewMode;
  kanbanColumns?: { dimension: string; order: number }[];
  createdAt: string;
}

interface DimensionSummary {
  dimension: string;
  count: number;
  isPriority: boolean;
  description?: string | null;
}

interface FolderViewOverlayProps {
  onClose: () => void;
  onNodeOpen: (nodeId: number) => void;
  refreshToken: number;
  onDataChanged?: () => void;
  onDimensionSelect?: (dimensionName: string | null) => void;
}

const PAGE_SIZE = 100;

export default function FolderViewOverlay({ onClose, onNodeOpen, refreshToken, onDataChanged, onDimensionSelect: _onDimensionSelect }: FolderViewOverlayProps) {
  const [view, setView] = useState<'dimensions' | 'nodes'>('dimensions');
  const [dimensions, setDimensions] = useState<DimensionSummary[]>([]);
  const [dimensionsLoading, setDimensionsLoading] = useState(true);
  const [dimensionsError, setDimensionsError] = useState<string | null>(null);
  const [selectedDimension, setSelectedDimension] = useState<DimensionSummary | null>(null);
  const [nodes, setNodes] = useState<Node[]>([]);
  const [nodesLoading, setNodesLoading] = useState(false);
  const [nodesError, setNodesError] = useState<string | null>(null);
  const [hasMoreNodes, setHasMoreNodes] = useState(false);
  const [nodeOffset, setNodeOffset] = useState(0);
  const [deletingDimension, setDeletingDimension] = useState<string | null>(null);
  const [dimensionPendingDelete, setDimensionPendingDelete] = useState<string | null>(null);
  const [dragHoverDimension, setDragHoverDimension] = useState<string | null>(null);
  const [editingDescription, setEditingDescription] = useState<boolean>(false);
  const [editDescriptionText, setEditDescriptionText] = useState('');
  const [editingDimensionName, setEditingDimensionName] = useState<boolean>(false);
  const [editDimensionNameText, setEditDimensionNameText] = useState('');
  const [showAddDimensionDialog, setShowAddDimensionDialog] = useState(false);
  const draggedNodeRef = useRef<{ id: number; title?: string; dimensions?: string[] } | null>(null);

  // View mode state (persisted)
  const [viewMode, setViewMode] = usePersistentState<DimensionViewMode>('ui.dimensionViewMode', 'grid');

  // All nodes state (for list/kanban view at top level)
  const [allNodes, setAllNodes] = useState<Node[]>([]);
  const [allNodesLoading, setAllNodesLoading] = useState(false);

  // Kanban columns state (global, persisted)
  const [kanbanColumns, setKanbanColumns] = usePersistentState<{ dimension: string; order: number }[]>(
    'ui.kanbanColumns.global',
    []
  );

  // Kanban-specific drag states
  const [draggedNodeId, setDraggedNodeId] = useState<number | null>(null);
  const [draggedFromColumn, setDraggedFromColumn] = useState<string | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<string | null>(null);
  const [showKanbanColumnPicker, setShowKanbanColumnPicker] = useState(false);
  const [kanbanSearchQuery, setKanbanSearchQuery] = useState('');

  // Filter/View system state
  const [overlayMode, setOverlayMode] = useState<OverlayMode>('folders');
  // Primary column state - each column has unique ID, allows duplicate dimensions
  const [columns, setColumns] = usePersistentState<ColumnFilter[]>('ui.viewColumns', []);
  const [filteredNodes, setFilteredNodes] = useState<Node[]>([]);
  const [filteredNodesLoading, setFilteredNodesLoading] = useState(false);
  const [showFilterPicker, setShowFilterPicker] = useState(false);
  const [filterSearchQuery, setFilterSearchQuery] = useState('');
  const [savedViews, setSavedViews] = usePersistentState<SavedView[]>('ui.savedViews', []);
  const [activeViewId, setActiveViewId] = useState<string | null>(null);
  const [showSaveViewDialog, setShowSaveViewDialog] = useState(false);
  const [showSavedViewsDropdown, setShowSavedViewsDropdown] = useState(false);

  // Which column is showing filter picker (by column ID)
  const [showColumnFilterPicker, setShowColumnFilterPicker] = useState<string | null>(null);

  // Derive selectedFilters for backward compatibility (unique dimensions)
  // Memoized to prevent infinite useEffect loops
  const selectedFilters = useMemo(() =>
    [...new Set(columns.map(c => c.dimension))],
    [columns]
  );

  // Kanban drag-and-drop state
  const [draggedNode, setDraggedNode] = useState<{ id: number; fromDimension: string } | null>(null);
  const [dropTargetDimension, setDropTargetDimension] = useState<string | null>(null);

  // Kanban column reordering state
  const [draggedColumn, setDraggedColumn] = useState<string | null>(null);
  const [columnDropTarget, setColumnDropTarget] = useState<string | null>(null);

  // Node priority ordering within dimensions (persisted)
  const [dimensionOrders, setDimensionOrders] = usePersistentState<Record<string, number[]>>('ui.dimensionOrders', {});

  // Dimension icons (persisted) - maps dimension name to Lucide icon name
  const [dimensionIcons, setDimensionIcons] = usePersistentState<Record<string, string>>('ui.dimensionIcons', {});

  // Dimension edit modal state
  const [editingDimensionModal, setEditingDimensionModal] = useState<DimensionSummary | null>(null);
  const [editModalDescription, setEditModalDescription] = useState('');
  const [editModalIcon, setEditModalIcon] = useState('Folder');
  const [savingDimensionEdit, setSavingDimensionEdit] = useState(false);

  // Within-dimension reorder drag state
  const [reorderDrag, setReorderDrag] = useState<{ nodeId: number; dimension: string; index: number } | null>(null);
  const [reorderDropIndex, setReorderDropIndex] = useState<number | null>(null);

  useEffect(() => {
    fetchDimensions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (view === 'dimensions') {
      fetchDimensions();
    } else if (selectedDimension) {
      fetchNodes(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshToken]);

  useEffect(() => {
    if (!selectedDimension) return;
    fetchNodes(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDimension?.dimension]);

  // Fetch all nodes when viewMode is list or kanban (at top level)
  useEffect(() => {
    if (view === 'dimensions' && (viewMode === 'list' || viewMode === 'kanban')) {
      fetchAllNodes();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode, view, refreshToken]);

  const fetchAllNodes = async () => {
    setAllNodesLoading(true);
    try {
      const response = await fetch('/api/nodes?limit=500');
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to fetch nodes');
      }
      setAllNodes(data.data || []);
    } catch (error) {
      console.error('Error fetching all nodes:', error);
    } finally {
      setAllNodesLoading(false);
    }
  };

  // Fetch filtered nodes when filters change
  useEffect(() => {
    if (overlayMode === 'filtered' && selectedFilters.length > 0) {
      fetchFilteredNodes();
    } else if (overlayMode === 'filtered' && selectedFilters.length === 0) {
      setFilteredNodes([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedFilters, overlayMode, refreshToken]);

  const fetchFilteredNodes = async () => {
    if (selectedFilters.length === 0) {
      setFilteredNodes([]);
      return;
    }
    setFilteredNodesLoading(true);
    try {
      // Fetch nodes that match ANY of the selected dimensions
      const response = await fetch(`/api/nodes?limit=500`);
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to fetch nodes');
      }
      // Filter client-side to get nodes matching selected dimensions
      const allFetched: Node[] = data.data || [];
      const filtered = allFetched.filter(node =>
        node.dimensions?.some(d => selectedFilters.includes(d))
      );
      setFilteredNodes(filtered);
    } catch (error) {
      console.error('Error fetching filtered nodes:', error);
    } finally {
      setFilteredNodesLoading(false);
    }
  };

  // Filter helper functions
  // Add a new column (allows duplicate dimensions)
  const addColumn = (dimension: string) => {
    const newColumn: ColumnFilter = {
      id: `col-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      dimension
    };
    setColumns([...columns, newColumn]);
    setShowFilterPicker(false);
    setFilterSearchQuery('');
  };

  // Remove a column by ID
  const removeColumn = (columnId: string) => {
    setColumns(columns.filter(c => c.id !== columnId));
  };

  // Legacy: remove first column with this dimension (for chip X buttons)
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

  // Column filter helper functions (per-column AND filters)
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

  // Kanban column reorder handler (now works with column IDs)
  const handleColumnReorder = (draggedColumnId: string, targetColumnId: string) => {
    if (draggedColumnId === targetColumnId) return;

    const currentColumns = [...columns];
    const draggedIndex = currentColumns.findIndex(c => c.id === draggedColumnId);
    const targetIndex = currentColumns.findIndex(c => c.id === targetColumnId);

    if (draggedIndex === -1 || targetIndex === -1) return;

    // Remove dragged item and insert at target position
    const [draggedItem] = currentColumns.splice(draggedIndex, 1);
    currentColumns.splice(targetIndex, 0, draggedItem);

    setColumns(currentColumns);
  };

  // Kanban drag-and-drop handler
  const handleKanbanDrop = async (nodeId: number, fromDimension: string, toDimension: string) => {
    if (fromDimension === toDimension) return;

    // Find the node to get its current dimensions
    const node = filteredNodes.find(n => n.id === nodeId);
    if (!node) return;

    // Calculate new dimensions: remove fromDimension, add toDimension
    const currentDimensions = node.dimensions || [];
    const newDimensions = currentDimensions
      .filter(d => d !== fromDimension)
      .concat(toDimension)
      .filter((d, i, arr) => arr.indexOf(d) === i); // Remove duplicates

    try {
      // Update the node via API
      const response = await fetch(`/api/nodes/${nodeId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dimensions: newDimensions })
      });

      if (response.ok) {
        // Refresh the filtered nodes
        fetchFilteredNodes();
        // Notify parent that data changed
        onDataChanged?.();
      }
    } catch (error) {
      console.error('Failed to update node dimensions:', error);
    }
  };

  // Saved view helper functions
  const saveCurrentView = (name: string) => {
    const newView: SavedView = {
      id: `view-${Date.now()}`,
      name: name.trim(),
      filters: selectedFilters, // Legacy: unique dimensions
      columnFilters: columns.length > 0 ? [...columns] : undefined,
      viewMode,
      kanbanColumns: viewMode === 'kanban' ? [...kanbanColumns] : undefined,
      createdAt: new Date().toISOString()
    };
    setSavedViews([...savedViews, newView]);
    setActiveViewId(newView.id);
    setShowSaveViewDialog(false);
  };

  const loadSavedView = (view: SavedView) => {
    setOverlayMode('filtered');
    // Load columnFilters if available, otherwise convert legacy filters
    if (view.columnFilters && view.columnFilters.length > 0) {
      setColumns(view.columnFilters);
    } else {
      // Legacy: convert simple filters to columns
      setColumns(view.filters.map((dim, i) => ({
        id: `col-legacy-${i}`,
        dimension: dim
      })));
    }
    setViewMode(view.viewMode);
    if (view.kanbanColumns) {
      setKanbanColumns(view.kanbanColumns);
    }
    setActiveViewId(view.id);
    setShowSavedViewsDropdown(false);
  };

  const deleteSavedView = (viewId: string) => {
    setSavedViews(savedViews.filter(v => v.id !== viewId));
    if (activeViewId === viewId) {
      setActiveViewId(null);
    }
  };

  const activeView = savedViews.find(v => v.id === activeViewId);

  // Sort nodes by their priority order within a dimension
  const sortNodesByDimensionOrder = (nodes: Node[], dimension: string): Node[] => {
    const order = dimensionOrders[dimension] || [];
    return [...nodes].sort((a, b) => {
      const aIndex = order.indexOf(a.id);
      const bIndex = order.indexOf(b.id);
      // Nodes in order array come first, sorted by their position
      // Nodes not in order array go to end, sorted by ID
      if (aIndex === -1 && bIndex === -1) return a.id - b.id;
      if (aIndex === -1) return 1;
      if (bIndex === -1) return -1;
      return aIndex - bIndex;
    });
  };

  // Handle reordering a node within a dimension
  const handleReorderDrop = (dimension: string, fromIndex: number, toIndex: number, nodes: Node[]) => {
    if (fromIndex === toIndex) return;

    // Get current order or create from current node order
    const currentOrder = dimensionOrders[dimension] || nodes.map(n => n.id);
    const nodeIds = [...currentOrder];

    // Ensure all nodes are in the order array
    nodes.forEach(n => {
      if (!nodeIds.includes(n.id)) {
        nodeIds.push(n.id);
      }
    });

    // Move the node from fromIndex to toIndex
    const [movedId] = nodeIds.splice(fromIndex, 1);
    nodeIds.splice(toIndex, 0, movedId);

    // Update the dimension orders
    setDimensionOrders({
      ...dimensionOrders,
      [dimension]: nodeIds
    });

    setReorderDrag(null);
    setReorderDropIndex(null);
  };

  // Get nodes grouped by column for list/grid views (respects column filters)
  const getColumnsWithNodes = () => {
    return columns.map(column => {
      const nodesInColumn = getNodesForColumnById(column.id);
      const sortedNodes = sortNodesByDimensionOrder(nodesInColumn, column.dimension);
      return {
        column,
        label: getColumnLabel(column),
        nodes: sortedNodes,
        hasFilter: !!column.filterBy
      };
    });
  };

  const sortedDimensions = useMemo(() => {
    return [...dimensions].sort((a, b) => {
      if (a.isPriority !== b.isPriority) {
        return a.isPriority ? -1 : 1;
      }
      return a.dimension.localeCompare(b.dimension);
    });
  }, [dimensions]);

  const fetchDimensions = async () => {
    setDimensionsLoading(true);
    setDimensionsError(null);
    try {
      const response = await fetch('/api/dimensions/popular');
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to fetch dimensions');
      }
      setDimensions(data.data || []);
    } catch (error) {
      console.error('Error fetching dimensions:', error);
      setDimensionsError('Failed to load dimensions');
    } finally {
      setDimensionsLoading(false);
    }
  };

  const fetchNodes = async (reset = false) => {
    if (!selectedDimension) return;
    setNodesLoading(true);
    setNodesError(null);
    try {
      const offset = reset ? 0 : nodeOffset;
      const response = await fetch(`/api/nodes?dimensions=${encodeURIComponent(selectedDimension.dimension)}&limit=${PAGE_SIZE}&offset=${offset}`);
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to fetch nodes');
      }
      const fetchedNodes: Node[] = data.data || [];
      setNodes((prev) => reset ? fetchedNodes : [...prev, ...fetchedNodes]);
      setHasMoreNodes(fetchedNodes.length === PAGE_SIZE);
      setNodeOffset(offset + fetchedNodes.length);
    } catch (error) {
      console.error('Error fetching nodes:', error);
      setNodesError('Failed to load nodes');
    } finally {
      setNodesLoading(false);
    }
  };

  const handleSelectDimension = (dimension: DimensionSummary) => {
    setSelectedDimension(dimension);
    setNodes([]);
    setNodeOffset(0);
    setHasMoreNodes(false);
    setView('nodes');
  };

  const handleBackToDimensions = () => {
    setView('dimensions');
    setSelectedDimension(null);
    setNodes([]);
    setNodeOffset(0);
    setHasMoreNodes(false);
  };

  const handleAddDimension = async (name: string) => {
    if (!name || !name.trim()) return;
    try {
      const response = await fetch('/api/dimensions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim() })
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to create dimension');
      }
      await fetchDimensions();
      onDataChanged?.();
      setShowAddDimensionDialog(false);
    } catch (error) {
      console.error('Error adding dimension:', error);
      alert('Failed to create dimension. Please try again.');
    }
  };

  const handleToggleLock = async (dimension: string) => {
    try {
      const response = await fetch('/api/dimensions/popular', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dimension })
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to toggle dimension');
      }
      await fetchDimensions();
      onDataChanged?.();
    } catch (error) {
      console.error('Error toggling lock:', error);
      alert('Failed to update lock state.');
    }
  };

  const handleDeleteDimension = async (dimension: string) => {
    setDeletingDimension(dimension);
    try {
      const response = await fetch(`/api/dimensions?name=${encodeURIComponent(dimension)}`, {
        method: 'DELETE'
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to delete dimension');
      }
      if (selectedDimension?.dimension === dimension) {
        handleBackToDimensions();
      }
      await fetchDimensions();
      onDataChanged?.();
    } catch (error) {
      console.error('Error deleting dimension:', error);
      alert('Failed to delete dimension. Please try again.');
    } finally {
      setDeletingDimension((current) => (current === dimension ? null : current));
      setDimensionPendingDelete((current) => (current === dimension ? null : current));
    }
  };

  const handleNodeTileDragStart = (event: DragEvent<HTMLDivElement>, node: Node) => {
    event.dataTransfer.effectAllowed = 'copyMove';
    const nodeData = {
      id: node.id,
      title: node.title || 'Untitled',
      dimensions: node.dimensions || []
    };
    // Store in ref for webview compatibility (dataTransfer.getData can fail in Electron/Tauri)
    draggedNodeRef.current = nodeData;
    // Set multiple MIME types for different drop targets
    event.dataTransfer.setData('application/node-info', JSON.stringify(nodeData));
    // For chat input drops - includes title for [NODE:id:"title"] token
    event.dataTransfer.setData('application/x-rah-node', JSON.stringify({ id: node.id, title: node.title || 'Untitled' }));
    // Fallback for browsers/webviews that only support text/plain
    event.dataTransfer.setData('text/plain', `[NODE:${node.id}:"${node.title || 'Untitled'}"]`);

     // Provide a compact drag preview so drop targets stay visible
    const preview = document.createElement('div');
    preview.textContent = node.title || `Node #${node.id}`;
    preview.style.position = 'fixed';
    preview.style.top = '-1000px';
    preview.style.left = '-1000px';
    preview.style.padding = '4px 8px';
    preview.style.background = '#0f0f0f';
    preview.style.color = '#f8fafc';
    preview.style.fontSize = '11px';
    preview.style.fontWeight = '600';
    preview.style.borderRadius = '6px';
    preview.style.border = '1px solid #1f1f1f';
    document.body.appendChild(preview);
    event.dataTransfer.setDragImage(preview, 6, 6);
    setTimeout(() => {
      if (preview.parentNode) {
        preview.parentNode.removeChild(preview);
      }
    }, 0);
  };

  const handleNodeTileDragEnd = () => {
    // Clear ref if drag ends without a drop
    draggedNodeRef.current = null;
  };

  const handleDimensionDragOver = (event: DragEvent<HTMLElement>) => {
    if (event.dataTransfer.types.includes('application/node-info') || event.dataTransfer.types.includes('text/plain')) {
      event.preventDefault();
      event.dataTransfer.dropEffect = 'copy';
    }
  };

  const handleDimensionDragEnter = (event: DragEvent<HTMLElement>, dimension: string) => {
    if (event.dataTransfer.types.includes('application/node-info') || event.dataTransfer.types.includes('text/plain')) {
      setDragHoverDimension(dimension);
    }
  };

  const handleDimensionDragLeave = (event: DragEvent<HTMLElement>, dimension: string) => {
    if (dragHoverDimension === dimension) {
      setDragHoverDimension(null);
    }
  };

  const handleNodeDropOnDimension = async (event: DragEvent<HTMLElement>, dimension: string) => {
    event.preventDefault();
    event.stopPropagation();
    
    // Try to get data from ref first (works in Electron/Tauri webviews)
    let payload: { id: number; dimensions?: string[] } | null = draggedNodeRef.current;
    
    // Fallback to dataTransfer for browser compatibility
    if (!payload) {
      const raw = event.dataTransfer.getData('application/node-info') || event.dataTransfer.getData('text/plain');
      if (raw) {
        try {
          payload = JSON.parse(raw);
        } catch (e) {
          console.error('Failed to parse drag data:', e);
        }
      }
    }
    
    // Clear the ref
    draggedNodeRef.current = null;
    
    if (!payload?.id) {
      console.warn('No valid node data in drop event');
      return;
    }

    try {
      const currentDimensions = payload.dimensions || [];
      if (currentDimensions.some((dim) => dim.toLowerCase() === dimension.toLowerCase())) {
        setDragHoverDimension(null);
        return;
      }

      const updatedDimensions = Array.from(new Set([...currentDimensions, dimension]));
      const response = await fetch(`/api/nodes/${payload.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dimensions: updatedDimensions })
      });

      if (!response.ok) {
        throw new Error('Failed to update node dimensions');
      }

      if (selectedDimension?.dimension === dimension) {
        fetchNodes(true);
      }
      fetchDimensions();
      onDataChanged?.();
    } catch (error) {
      console.error('Error handling node drop:', error);
      alert('Failed to add dimension to node. Please try again.');
    } finally {
      setDragHoverDimension(null);
    }
  };

  const getContentPreview = (value?: string | null): string => {
    if (!value) return '';
    const trimmed = value.trim();
    if (trimmed.length <= 160) return trimmed;
    return `${trimmed.slice(0, 160)}…`;
  };

  const handleEditDescription = () => {
    if (!selectedDimension) return;
    setEditingDescription(true);
    setEditDescriptionText(selectedDimension.description || '');
  };

  const handleSaveDescription = async () => {
    if (!selectedDimension) return;

    try {
      const response = await fetch('/api/dimensions', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          name: selectedDimension.dimension, 
          description: editDescriptionText.trim()
        })
      });

      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to update description');
      }

      // Update the local selectedDimension with new description
      setSelectedDimension(prev => prev ? { ...prev, description: editDescriptionText.trim() } : null);
      
      await fetchDimensions();
      onDataChanged?.();
      setEditingDescription(false);
      setEditDescriptionText('');
    } catch (error) {
      console.error('Error updating description:', error);
      alert('Failed to update description. Please try again.');
    }
  };

  const handleCancelDescription = () => {
    setEditingDescription(false);
    setEditDescriptionText('');
  };

  // Dimension edit modal handlers (from folder cards)
  const openDimensionEditModal = (dimension: DimensionSummary) => {
    setEditingDimensionModal(dimension);
    setEditModalDescription(dimension.description || '');
    setEditModalIcon(dimensionIcons[dimension.dimension] || 'Folder');
  };

  const closeDimensionEditModal = () => {
    setEditingDimensionModal(null);
    setEditModalDescription('');
    setEditModalIcon('Folder');
    setSavingDimensionEdit(false);
  };

  const saveDimensionEdit = async () => {
    if (!editingDimensionModal) return;

    setSavingDimensionEdit(true);
    try {
      // Save description to API
      const response = await fetch('/api/dimensions', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editingDimensionModal.dimension,
          description: editModalDescription.trim()
        })
      });

      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to update dimension');
      }

      // Save icon to localStorage
      setDimensionIcons(prev => ({
        ...prev,
        [editingDimensionModal.dimension]: editModalIcon
      }));

      await fetchDimensions();
      onDataChanged?.();
      closeDimensionEditModal();
    } catch (error) {
      console.error('Error saving dimension:', error);
      alert('Failed to save dimension. Please try again.');
      setSavingDimensionEdit(false);
    }
  };

  const handleEditDimensionName = () => {
    if (!selectedDimension) return;
    setEditingDimensionName(true);
    setEditDimensionNameText(selectedDimension.dimension);
  };

  const handleSaveDimensionName = async () => {
    if (!selectedDimension || !editDimensionNameText.trim()) return;

    const newName = editDimensionNameText.trim();
    if (newName === selectedDimension.dimension) {
      // No change, just cancel
      handleCancelDimensionName();
      return;
    }

    try {
      const response = await fetch('/api/dimensions', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          currentName: selectedDimension.dimension,
          newName: newName,
          description: selectedDimension.description
        })
      });

      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to update dimension name');
      }

      // Update the local selectedDimension with new name
      setSelectedDimension(prev => prev ? { ...prev, dimension: newName } : null);
      
      await fetchDimensions();
      onDataChanged?.();
      setEditingDimensionName(false);
      setEditDimensionNameText('');
    } catch (error) {
      console.error('Error updating dimension name:', error);
      alert('Failed to update dimension name. Please try again.');
    }
  };

  const handleCancelDimensionName = () => {
    setEditingDimensionName(false);
    setEditDimensionNameText('');
  };

  const renderDimensionGrid = () => {
    if (dimensionsLoading) {
      return (
        <div style={{ padding: '40px', color: '#888', textAlign: 'center' }}>
          Loading dimensions...
        </div>
      );
    }

    if (dimensionsError) {
      return (
        <div style={{ padding: '40px', color: '#f87171', textAlign: 'center' }}>
          {dimensionsError}
        </div>
      );
    }

    if (sortedDimensions.length === 0) {
      return (
        <div style={{ padding: '40px', color: '#888', textAlign: 'center' }}>
          No dimensions yet. Create one to get started.
        </div>
      );
    }

    return (
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '24px',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
          gap: '8px',
          alignContent: 'start'
        }}
      >
        {sortedDimensions.map((dimension) => {
          const isLocked = dimension.isPriority;
          const isDragTarget = dragHoverDimension === dimension.dimension;

          return (
            <div
              key={dimension.dimension}
              role="button"
              tabIndex={0}
              onClick={() => handleSelectDimension(dimension)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  handleSelectDimension(dimension);
                }
              }}
              onDragOver={(event) => handleDimensionDragOver(event)}
              onDragEnter={(event) => handleDimensionDragEnter(event, dimension.dimension)}
              onDragLeave={(event) => handleDimensionDragLeave(event, dimension.dimension)}
              onDrop={(event) => handleNodeDropOnDimension(event, dimension.dimension)}
              style={{
                background: isDragTarget ? 'rgba(136, 136, 136, 0.05)' : 'transparent',
                borderLeft: isLocked ? '2px solid #888' : '2px solid transparent',
                borderRadius: '6px',
                padding: '12px 14px',
                textAlign: 'left',
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                cursor: 'pointer',
                transition: 'all 0.12s ease',
                position: 'relative'
              }}
              onMouseEnter={(e) => {
                if (!isDragTarget) {
                  e.currentTarget.style.background = 'rgba(255, 255, 255, 0.02)';
                }
              }}
              onMouseLeave={(e) => {
                if (!isDragTarget) {
                  e.currentTarget.style.background = 'transparent';
                }
              }}
            >
              {/* Dimension icon */}
              <div style={{
                width: '28px',
                height: '28px',
                borderRadius: '6px',
                background: isLocked ? 'rgba(136, 136, 136, 0.08)' : 'rgba(255, 255, 255, 0.03)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0
              }}>
                <DynamicIcon
                  name={dimensionIcons[dimension.dimension] || 'Folder'}
                  size={14}
                  style={{ color: isLocked ? '#888' : '#555' }}
                />
              </div>

              {/* Name and description */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontSize: '13px',
                  fontWeight: 500,
                  color: isLocked ? '#f0f0f0' : '#999',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  letterSpacing: '-0.01em'
                }}>
                  {dimension.dimension}
                </div>
                {dimension.description && (
                  <div style={{
                    fontSize: '11px',
                    color: '#555',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    marginTop: '1px'
                  }}>
                    {dimension.description}
                  </div>
                )}
              </div>

              {/* Count - minimal */}
              <span style={{
                fontSize: '11px',
                fontWeight: 500,
                color: isLocked ? '#888' : '#444',
                fontFamily: 'monospace',
                flexShrink: 0
              }}>
                {dimension.count}
              </span>

              {/* Action buttons - subtle - hidden in readonly mode */}
              {!isReadOnly && (
              <div style={{ display: 'flex', gap: '2px', flexShrink: 0, opacity: 0.4 }}
                onMouseEnter={(e) => { e.currentTarget.style.opacity = '1'; }}
                onMouseLeave={(e) => { e.currentTarget.style.opacity = '0.4'; }}
              >
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    openDimensionEditModal(dimension);
                  }}
                  title="Edit"
                  style={{
                    background: 'transparent',
                    border: 'none',
                    borderRadius: '4px',
                    width: '22px',
                    height: '22px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    color: '#666',
                    transition: 'color 0.1s ease'
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = '#999'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = '#666'; }}
                >
                  <Edit2 size={12} />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleToggleLock(dimension.dimension);
                  }}
                  title={isLocked ? 'Unlock' : 'Lock'}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    borderRadius: '4px',
                    width: '22px',
                    height: '22px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    color: isLocked ? '#888' : '#666',
                    transition: 'color 0.1s ease'
                  }}
                  onMouseEnter={(e) => { if (!isLocked) e.currentTarget.style.color = '#888'; }}
                  onMouseLeave={(e) => { if (!isLocked) e.currentTarget.style.color = '#666'; }}
                >
                  {isLocked ? <Check size={12} /> : <Lock size={12} />}
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setDimensionPendingDelete(dimension.dimension);
                  }}
                  title="Delete"
                  style={{
                    background: 'transparent',
                    border: 'none',
                    borderRadius: '4px',
                    width: '22px',
                    height: '22px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: deletingDimension === dimension.dimension ? 'not-allowed' : 'pointer',
                    color: '#666',
                    opacity: deletingDimension === dimension.dimension ? 0.3 : 1,
                    transition: 'color 0.1s ease'
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = '#ef4444'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = '#666'; }}
                  disabled={deletingDimension === dimension.dimension}
                >
                  <Trash2 size={12} />
                </button>
              </div>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  // Kanban helper functions
  const getNodesForKanbanColumn = (dimension: string) => {
    return nodes.filter(node => node.dimensions?.includes(dimension));
  };

  const handleAddKanbanColumn = (dimension: string) => {
    const newColumn = {
      dimension,
      order: kanbanColumns.length
    };
    setKanbanColumns([...kanbanColumns, newColumn]);
    setShowKanbanColumnPicker(false);
    setKanbanSearchQuery('');
  };

  const handleRemoveKanbanColumn = (dimension: string) => {
    setKanbanColumns(kanbanColumns.filter(c => c.dimension !== dimension));
  };

  const handleKanbanNodeDragStart = (e: DragEvent<HTMLDivElement>, nodeId: number, fromColumn: string) => {
    setDraggedNodeId(nodeId);
    setDraggedFromColumn(fromColumn);
    e.dataTransfer.effectAllowed = 'copyMove';
    // Find the node to get its title for chat drops
    const node = nodes.find(n => n.id === nodeId);
    const title = node?.title || 'Untitled';
    // Set MIME types for chat input and folder drops
    e.dataTransfer.setData('application/x-rah-node', JSON.stringify({ id: nodeId, title }));
    e.dataTransfer.setData('application/node-info', JSON.stringify({ id: nodeId, title, dimensions: node?.dimensions || [] }));
    e.dataTransfer.setData('text/plain', `[NODE:${nodeId}:"${title}"]`);
    // Store in ref for webview compatibility
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

  const handleKanbanColumnDragLeave = () => {
    setDragOverColumn(null);
  };

  const handleKanbanNodeDrop = async (e: DragEvent<HTMLDivElement>, targetDimension: string) => {
    e.preventDefault();
    if (draggedNodeId === null || draggedFromColumn === targetDimension) {
      handleKanbanNodeDragEnd();
      return;
    }

    try {
      const node = nodes.find(n => n.id === draggedNodeId);
      if (!node) return;

      const currentDimensions = node.dimensions || [];
      let updatedDimensions: string[];

      if (draggedFromColumn === '__uncategorized__') {
        // Adding to a new dimension
        updatedDimensions = [...currentDimensions, targetDimension];
      } else {
        // Replace old dimension with new one
        updatedDimensions = currentDimensions.map(d =>
          d === draggedFromColumn ? targetDimension : d
        );
      }

      const response = await fetch(`/api/nodes/${draggedNodeId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dimensions: updatedDimensions })
      });

      if (!response.ok) {
        throw new Error('Failed to update node dimensions');
      }

      fetchNodes(true);
      onDataChanged?.();
    } catch (error) {
      console.error('Error updating node dimension:', error);
      alert('Failed to move node. Please try again.');
    } finally {
      handleKanbanNodeDragEnd();
    }
  };

  const filteredKanbanDimensions = dimensions.filter(d =>
    d.dimension.toLowerCase().includes(kanbanSearchQuery.toLowerCase()) &&
    !kanbanColumns.some(c => c.dimension === d.dimension) &&
    d.dimension !== selectedDimension?.dimension
  );

  const sortedKanbanColumns = [...kanbanColumns].sort((a, b) => a.order - b.order);

  // Render functions for each view mode
  const renderGridContent = () => (
    <div
      style={{
        flex: 1,
        overflowY: 'auto',
        padding: '0 24px 24px',
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
        gap: '16px',
        alignContent: 'start'
      }}
    >
      {nodes.map((node) => (
        <div
          key={node.id}
          draggable
          onDragStart={(event) => handleNodeTileDragStart(event, node)}
          onDragEnd={handleNodeTileDragEnd}
          onClick={() => {
            onNodeOpen(node.id);
            onClose();
          }}
          style={{
            background: '#0a0a0a',
            border: '1px solid #161616',
            borderRadius: '12px',
            padding: '14px',
            display: 'flex',
            flexDirection: 'column',
            gap: '6px',
            cursor: 'pointer',
            transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
            position: 'relative',
            minHeight: '120px',
            boxShadow: '0 1px 4px rgba(0, 0, 0, 0.2)'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = '#111111';
            e.currentTarget.style.transform = 'translateY(-2px)';
            e.currentTarget.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.3)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = '#0a0a0a';
            e.currentTarget.style.transform = 'translateY(0px)';
            e.currentTarget.style.boxShadow = '0 1px 4px rgba(0, 0, 0, 0.2)';
          }}
        >
          {/* Header: ID | Title | Icon */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: '#888',
              color: '#0a0a0a',
              fontSize: '9px',
              fontWeight: 600,
              padding: '1px 5px',
              borderRadius: '3px',
              flexShrink: 0,
              fontFamily: 'monospace',
              lineHeight: 1,
              height: '16px'
            }}>
              #{node.id}
            </span>
            <div style={{
              fontSize: '14px',
              fontWeight: 600,
              color: '#f8fafc',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              lineHeight: '1.2',
              flex: 1
            }}>
              {node.title || 'Untitled'}
            </div>
            {node.link && (
              <span style={{ flexShrink: 0 }}>
                {getNodeIcon(node)}
              </span>
            )}
          </div>
          {node.notes && (
            <div style={{
              fontSize: '12px',
              color: '#94a3b8',
              lineHeight: '1.4',
              overflow: 'hidden',
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              fontWeight: 400
            }}>
              {getContentPreview(node.notes)}
            </div>
          )}
          {node.dimensions && node.dimensions.length > 0 && (
            <div style={{ display: 'flex', gap: '6px', overflow: 'hidden', flexWrap: 'nowrap' }}>
              {node.dimensions.slice(0, 3).map((dimension, index) => {
                const isCurrentDimension = dimension === selectedDimension?.dimension;
                return (
                  <span
                    key={`${dimension}-${index}`}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      padding: '3px 8px',
                      fontSize: '10px',
                      fontWeight: 500,
                      color: isCurrentDimension ? '#7de8a5' : '#cbd5e1',
                      background: isCurrentDimension ? 'rgba(125, 232, 165, 0.15)' : 'rgba(148, 163, 184, 0.1)',
                      border: isCurrentDimension ? '1px solid rgba(125, 232, 165, 0.3)' : '1px solid rgba(148, 163, 184, 0.2)',
                      borderRadius: '8px',
                      whiteSpace: 'nowrap',
                      textTransform: 'uppercase',
                      letterSpacing: '0.025em',
                      flexShrink: 0,
                      maxWidth: '100px',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis'
                    }}
                  >
                    {dimension}
                  </span>
                );
              })}
              {node.dimensions.length > 3 && (
                <span style={{
                  fontSize: '10px',
                  color: '#64748b',
                  fontWeight: 500,
                  padding: '3px 6px',
                  background: 'rgba(100, 116, 139, 0.1)',
                  borderRadius: '6px',
                  flexShrink: 0
                }}>
                  +{node.dimensions.length - 3}
                </span>
              )}
            </div>
          )}
        </div>
      ))}
      {nodesLoading && (
        <div style={{ padding: '20px', color: '#888' }}>Loading...</div>
      )}
      {!nodesLoading && nodes.length === 0 && (
        <div style={{ gridColumn: '1 / -1', textAlign: 'center', color: '#888', paddingTop: '40px' }}>
          No nodes in this dimension yet.
        </div>
      )}
    </div>
  );

  const renderListContent = () => (
    <div
      style={{
        flex: 1,
        overflowY: 'auto',
        padding: '0 24px 24px'
      }}
    >
      {nodes.map((node) => (
        <button
          key={node.id}
          onClick={() => {
            onNodeOpen(node.id);
            onClose();
          }}
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'flex-start',
            gap: '12px',
            padding: '12px 16px',
            marginBottom: '4px',
            background: '#0a0a0a',
            border: '1px solid #161616',
            borderRadius: '10px',
            cursor: 'pointer',
            textAlign: 'left',
            transition: 'all 0.2s'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = '#111';
            e.currentTarget.style.borderColor = '#222';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = '#0a0a0a';
            e.currentTarget.style.borderColor = '#161616';
          }}
        >
          <div style={{
            width: '32px',
            height: '32px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: '#1a1a1a',
            borderRadius: '8px',
            flexShrink: 0
          }}>
            {getNodeIcon(node)}
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontSize: '13px',
              fontWeight: 500,
              color: '#f8fafc',
              marginBottom: '4px',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap'
            }}>
              {node.title || 'Untitled'}
            </div>

            {node.notes && (
              <div style={{
                fontSize: '12px',
                color: '#94a3b8',
                marginBottom: '8px',
                lineHeight: '1.4',
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden'
              }}>
                {getContentPreview(node.notes)}
              </div>
            )}

            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              flexWrap: 'wrap'
            }}>
              {node.dimensions && node.dimensions.length > 0 && (
                <div style={{
                  display: 'flex',
                  gap: '4px',
                  flexWrap: 'wrap'
                }}>
                  {node.dimensions.slice(0, 3).map(dim => {
                    const isCurrentDimension = dim === selectedDimension?.dimension;
                    return (
                      <span
                        key={dim}
                        style={{
                          padding: '2px 6px',
                          background: isCurrentDimension ? 'rgba(125, 232, 165, 0.15)' : '#1a1a1a',
                          borderRadius: '4px',
                          fontSize: '10px',
                          color: isCurrentDimension ? '#7de8a5' : '#888',
                          textTransform: 'uppercase'
                        }}
                      >
                        {dim}
                      </span>
                    );
                  })}
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

              <span style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: '#888',
                color: '#0a0a0a',
                fontSize: '9px',
                fontWeight: 600,
                padding: '1px 5px',
                borderRadius: '3px',
                flexShrink: 0,
                fontFamily: 'monospace',
                lineHeight: 1,
                height: '16px'
              }}>
                #{node.id}
              </span>
            </div>
          </div>
        </button>
      ))}
      {nodesLoading && (
        <div style={{ padding: '20px', color: '#888' }}>Loading...</div>
      )}
      {!nodesLoading && nodes.length === 0 && (
        <div style={{ textAlign: 'center', color: '#888', paddingTop: '40px' }}>
          No nodes in this dimension yet.
        </div>
      )}
    </div>
  );

  const renderKanbanContent = () => (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Kanban Column Setup Bar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '8px 24px',
        borderBottom: '1px solid #1a1a1a',
        background: '#0a0a0a',
        flexShrink: 0
      }}>
        <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 500 }}>
          Group by:
        </span>

        {kanbanColumns.length === 0 && (
          <span style={{ fontSize: '11px', color: '#555', fontStyle: 'italic' }}>
            Add dimensions to create columns
          </span>
        )}

        <div style={{ position: 'relative' }}>
          <button
            onClick={() => setShowKanbanColumnPicker(!showKanbanColumnPicker)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              padding: '4px 8px',
              background: '#1a1a1a',
              border: '1px solid #333',
              borderRadius: '6px',
              fontSize: '11px',
              color: '#888',
              cursor: 'pointer'
            }}
          >
            <Plus size={12} />
            Add Column
          </button>

          {showKanbanColumnPicker && (
            <div style={{
              position: 'absolute',
              top: '100%',
              left: 0,
              marginTop: '4px',
              width: '200px',
              maxHeight: '300px',
              background: '#1a1a1a',
              border: '1px solid #333',
              borderRadius: '8px',
              overflow: 'hidden',
              zIndex: 100,
              boxShadow: '0 4px 12px rgba(0,0,0,0.5)'
            }}>
              <input
                type="text"
                placeholder="Search dimensions..."
                value={kanbanSearchQuery}
                onChange={(e) => setKanbanSearchQuery(e.target.value)}
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
                {filteredKanbanDimensions.length === 0 ? (
                  <div style={{
                    padding: '12px',
                    fontSize: '12px',
                    color: '#666',
                    textAlign: 'center'
                  }}>
                    No dimensions available
                  </div>
                ) : (
                  filteredKanbanDimensions.map(dim => (
                    <button
                      key={dim.dimension}
                      onClick={() => handleAddKanbanColumn(dim.dimension)}
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
                      {dim.dimension}
                    </button>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {showKanbanColumnPicker && (
          <div
            style={{ position: 'fixed', inset: 0, zIndex: 99 }}
            onClick={() => setShowKanbanColumnPicker(false)}
          />
        )}
      </div>

      {/* Kanban Board */}
      <div style={{
        flex: 1,
        display: 'flex',
        gap: '16px',
        padding: '16px 24px',
        overflowX: 'auto',
        overflowY: 'hidden'
      }}>
        {sortedKanbanColumns.map(column => {
          const columnNodes = getNodesForKanbanColumn(column.dimension);
          const isDropTarget = dragOverColumn === column.dimension && draggedFromColumn !== column.dimension;

          return (
            <div
              key={column.dimension}
              style={{
                width: '280px',
                minWidth: '280px',
                display: 'flex',
                flexDirection: 'column',
                background: isDropTarget ? '#1a1a1a' : '#0a0a0a',
                border: '1px solid #1a1a1a',
                borderRadius: '12px',
                transition: 'all 0.2s'
              }}
              onDragOver={(e) => handleKanbanColumnDragOver(e, column.dimension)}
              onDragLeave={handleKanbanColumnDragLeave}
              onDrop={(e) => handleKanbanNodeDrop(e, column.dimension)}
            >
              {/* Column Header */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '12px',
                borderBottom: '1px solid #1a1a1a'
              }}>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}>
                  <span style={{
                    fontSize: '12px',
                    fontWeight: 600,
                    color: '#f8fafc',
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
                  onClick={() => handleRemoveKanbanColumn(column.dimension)}
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
                    onDragStart={(e) => handleKanbanNodeDragStart(e, node.id, column.dimension)}
                    onDragEnd={handleKanbanNodeDragEnd}
                    onClick={() => {
                      onNodeOpen(node.id);
                      onClose();
                    }}
                    style={{
                      padding: '10px',
                      marginBottom: '6px',
                      background: draggedNodeId === node.id ? '#1a1a1a' : '#111',
                      border: '1px solid #222',
                      borderRadius: '8px',
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
                      color: '#f8fafc',
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
                          .filter(d => d !== column.dimension && d !== selectedDimension?.dimension)
                          .slice(0, 2)
                          .map(dim => (
                            <span
                              key={dim}
                              style={{
                                padding: '2px 6px',
                                background: '#1a1a1a',
                                borderRadius: '4px',
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

        {/* Empty State */}
        {kanbanColumns.length === 0 && (
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

  // Render all nodes view (list or kanban) - shown at top level when not in folder view
  const renderAllNodesView = () => {
    if (allNodesLoading) {
      return (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#888' }}>
          Loading nodes...
        </div>
      );
    }

    if (viewMode === 'list') {
      return (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ padding: '0 24px 12px', color: '#94a3b8', fontSize: '12px', fontWeight: 500 }}>
            Showing <strong style={{ color: '#f8fafc' }}>{allNodes.length}</strong> nodes
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: '0 24px 24px' }}>
            {allNodes.map((node) => (
              <button
                key={node.id}
                onClick={() => {
                  onNodeOpen(node.id);
                  onClose();
                }}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '12px',
                  padding: '12px 16px',
                  marginBottom: '4px',
                  background: '#0a0a0a',
                  border: '1px solid #161616',
                  borderRadius: '10px',
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'all 0.2s'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = '#111';
                  e.currentTarget.style.borderColor = '#222';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = '#0a0a0a';
                  e.currentTarget.style.borderColor = '#161616';
                }}
              >
                <div style={{
                  width: '32px',
                  height: '32px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: '#1a1a1a',
                  borderRadius: '8px',
                  flexShrink: 0
                }}>
                  {getNodeIcon(node)}
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: '13px',
                    fontWeight: 500,
                    color: '#f8fafc',
                    marginBottom: '4px',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap'
                  }}>
                    {node.title || 'Untitled'}
                  </div>

                  {node.notes && (
                    <div style={{
                      fontSize: '12px',
                      color: '#94a3b8',
                      marginBottom: '8px',
                      lineHeight: '1.4',
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                      overflow: 'hidden'
                    }}>
                      {getContentPreview(node.notes)}
                    </div>
                  )}

                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    {node.dimensions && node.dimensions.length > 0 && (
                      <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                        {node.dimensions.slice(0, 3).map(dim => (
                          <span
                            key={dim}
                            style={{
                              padding: '2px 6px',
                              background: '#1a1a1a',
                              borderRadius: '4px',
                              fontSize: '10px',
                              color: '#888',
                              textTransform: 'uppercase'
                            }}
                          >
                            {dim}
                          </span>
                        ))}
                        {node.dimensions.length > 3 && (
                          <span style={{ padding: '2px 6px', fontSize: '10px', color: '#666' }}>
                            +{node.dimensions.length - 3}
                          </span>
                        )}
                      </div>
                    )}
                    <span style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      background: '#888',
                      color: '#0a0a0a',
                      fontSize: '9px',
                      fontWeight: 600,
                      padding: '1px 5px',
                      borderRadius: '3px',
                      flexShrink: 0,
                      fontFamily: 'monospace',
                      lineHeight: 1,
                      height: '16px'
                    }}>
                      #{node.id}
                    </span>
                  </div>
                </div>
              </button>
            ))}
            {allNodes.length === 0 && (
              <div style={{ textAlign: 'center', color: '#888', paddingTop: '40px' }}>
                No nodes yet.
              </div>
            )}
          </div>
        </div>
      );
    }

    if (viewMode === 'kanban') {
      return (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {/* Kanban Column Setup Bar */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '8px 24px',
            borderBottom: '1px solid #1a1a1a',
            background: '#0a0a0a',
            flexShrink: 0
          }}>
            <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 500 }}>
              Group by:
            </span>

            {kanbanColumns.length === 0 && (
              <span style={{ fontSize: '11px', color: '#555', fontStyle: 'italic' }}>
                Add dimensions to create columns
              </span>
            )}

            <div style={{ position: 'relative' }}>
              <button
                onClick={() => setShowKanbanColumnPicker(!showKanbanColumnPicker)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '4px 8px',
                  background: '#1a1a1a',
                  border: '1px solid #333',
                  borderRadius: '6px',
                  fontSize: '11px',
                  color: '#888',
                  cursor: 'pointer'
                }}
              >
                <Plus size={12} />
                Add Column
              </button>

              {showKanbanColumnPicker && (
                <div style={{
                  position: 'absolute',
                  top: '100%',
                  left: 0,
                  marginTop: '4px',
                  width: '200px',
                  maxHeight: '300px',
                  background: '#1a1a1a',
                  border: '1px solid #333',
                  borderRadius: '8px',
                  overflow: 'hidden',
                  zIndex: 100,
                  boxShadow: '0 4px 12px rgba(0,0,0,0.5)'
                }}>
                  <input
                    type="text"
                    placeholder="Search dimensions..."
                    value={kanbanSearchQuery}
                    onChange={(e) => setKanbanSearchQuery(e.target.value)}
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
                    {dimensions.filter(d =>
                      d.dimension.toLowerCase().includes(kanbanSearchQuery.toLowerCase()) &&
                      !kanbanColumns.some(c => c.dimension === d.dimension)
                    ).length === 0 ? (
                      <div style={{
                        padding: '12px',
                        fontSize: '12px',
                        color: '#666',
                        textAlign: 'center'
                      }}>
                        No dimensions available
                      </div>
                    ) : (
                      dimensions.filter(d =>
                        d.dimension.toLowerCase().includes(kanbanSearchQuery.toLowerCase()) &&
                        !kanbanColumns.some(c => c.dimension === d.dimension)
                      ).map(dim => (
                        <button
                          key={dim.dimension}
                          onClick={() => handleAddKanbanColumn(dim.dimension)}
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
                          {dim.dimension}
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            {showKanbanColumnPicker && (
              <div
                style={{ position: 'fixed', inset: 0, zIndex: 99 }}
                onClick={() => setShowKanbanColumnPicker(false)}
              />
            )}
          </div>

          {/* Kanban Board */}
          <div style={{
            flex: 1,
            display: 'flex',
            gap: '16px',
            padding: '16px 24px',
            overflowX: 'auto',
            overflowY: 'hidden'
          }}>
            {sortedKanbanColumns.map(column => {
              const columnNodes = allNodes.filter(node => node.dimensions?.includes(column.dimension));
              const isDropTarget = dragOverColumn === column.dimension && draggedFromColumn !== column.dimension;

              return (
                <div
                  key={column.dimension}
                  style={{
                    width: '280px',
                    minWidth: '280px',
                    display: 'flex',
                    flexDirection: 'column',
                    background: isDropTarget ? '#1a1a1a' : '#0a0a0a',
                    border: '1px solid #1a1a1a',
                    borderRadius: '12px',
                    transition: 'all 0.2s'
                  }}
                  onDragOver={(e) => handleKanbanColumnDragOver(e, column.dimension)}
                  onDragLeave={handleKanbanColumnDragLeave}
                  onDrop={(e) => handleAllNodesKanbanDrop(e, column.dimension)}
                >
                  {/* Column Header */}
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '12px',
                    borderBottom: '1px solid #1a1a1a'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{
                        fontSize: '12px',
                        fontWeight: 600,
                        color: '#f8fafc',
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
                      onClick={() => handleRemoveKanbanColumn(column.dimension)}
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
                  <div style={{ flex: 1, overflowY: 'auto', padding: '8px' }}>
                    {columnNodes.map(node => (
                      <div
                        key={node.id}
                        draggable
                        onDragStart={(e) => handleKanbanNodeDragStart(e, node.id, column.dimension)}
                        onDragEnd={handleKanbanNodeDragEnd}
                        onClick={() => {
                          onNodeOpen(node.id);
                          onClose();
                        }}
                        style={{
                          padding: '10px',
                          marginBottom: '6px',
                          background: draggedNodeId === node.id ? '#1a1a1a' : '#111',
                          border: '1px solid #222',
                          borderRadius: '8px',
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
                          color: '#f8fafc',
                          marginBottom: '4px',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap'
                        }}>
                          {node.title || 'Untitled'}
                        </div>
                        {node.dimensions && node.dimensions.length > 1 && (
                          <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginTop: '6px' }}>
                            {node.dimensions
                              .filter(d => d !== column.dimension)
                              .slice(0, 2)
                              .map(dim => (
                                <span
                                  key={dim}
                                  style={{
                                    padding: '2px 6px',
                                    background: '#1a1a1a',
                                    borderRadius: '4px',
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
                      <div style={{ padding: '20px', textAlign: 'center', color: '#444', fontSize: '11px' }}>
                        Drop nodes here
                      </div>
                    )}
                  </div>
                </div>
              );
            })}

            {/* Empty State */}
            {kanbanColumns.length === 0 && (
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

    return null;
  };

  // Handle kanban drop for all nodes view
  const handleAllNodesKanbanDrop = async (e: DragEvent<HTMLDivElement>, targetDimension: string) => {
    e.preventDefault();
    if (draggedNodeId === null || draggedFromColumn === targetDimension) {
      handleKanbanNodeDragEnd();
      return;
    }

    try {
      const node = allNodes.find(n => n.id === draggedNodeId);
      if (!node) return;

      const currentDimensions = node.dimensions || [];
      let updatedDimensions: string[];

      if (draggedFromColumn === '__uncategorized__') {
        updatedDimensions = [...currentDimensions, targetDimension];
      } else {
        updatedDimensions = currentDimensions.map(d =>
          d === draggedFromColumn ? targetDimension : d
        );
      }

      const response = await fetch(`/api/nodes/${draggedNodeId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dimensions: updatedDimensions })
      });

      if (!response.ok) {
        throw new Error('Failed to update node dimensions');
      }

      fetchAllNodes();
      onDataChanged?.();
    } catch (error) {
      console.error('Error updating node dimension:', error);
      alert('Failed to move node. Please try again.');
    } finally {
      handleKanbanNodeDragEnd();
    }
  };

  const renderNodeGrid = () => {
    if (!selectedDimension) return null;

    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ padding: '0 24px 12px', color: '#94a3b8', fontSize: '12px', fontWeight: 500 }}>
          Showing <strong style={{ color: '#f8fafc' }}>{nodes.length}</strong> nodes tagged with <strong style={{ color: '#7de8a5' }}>{selectedDimension.dimension.toUpperCase()}</strong>
        </div>

        {renderGridContent()}

        {nodesError && (
          <div style={{ padding: '12px 16px', color: '#f87171', fontSize: '12px' }}>
            {nodesError}
          </div>
        )}
        {hasMoreNodes && (
          <div style={{ padding: '16px', textAlign: 'center' }}>
            <button
              onClick={() => fetchNodes(false)}
              disabled={nodesLoading}
              style={{
                padding: '10px 18px',
                borderRadius: '999px',
                border: '1px solid #1f1f1f',
                background: '#111',
                color: '#f1f5f9',
                cursor: nodesLoading ? 'not-allowed' : 'pointer'
              }}
            >
              {nodesLoading ? 'Loading...' : 'Load more'}
            </button>
          </div>
        )}
      </div>
    );
  };

  // Render filtered view content based on viewMode
  const renderFilteredView = () => {
    if (filteredNodesLoading) {
      return (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#888' }}>
          Loading...
        </div>
      );
    }

    if (selectedFilters.length === 0) {
      return (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#666', fontSize: '13px' }}>
          Select dimension filters to view nodes
        </div>
      );
    }

    if (filteredNodes.length === 0) {
      return (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#666', fontSize: '13px' }}>
          No nodes match the selected filters
        </div>
      );
    }

    // List view with dimension grouping
    if (viewMode === 'list') {
      const groups = getColumnsWithNodes();
      return (
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 24px' }}>
          {groups.map(group => (
            <div key={group.column.id} style={{ marginBottom: '24px' }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                fontSize: '11px',
                fontWeight: 600,
                color: '#888',
                textTransform: 'uppercase',
                letterSpacing: '0.1em',
                padding: '8px 0',
                borderBottom: '1px solid #1a1a1a',
                marginBottom: '8px'
              }}>
                {/* Left side: dimension name + AND filter button */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', position: 'relative' }}>
                  <span>{group.label} ({group.nodes.length})</span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowColumnFilterPicker(showColumnFilterPicker === group.column.id ? null : group.column.id);
                    }}
                    style={{
                      background: group.hasFilter ? 'rgba(136, 136, 136, 0.2)' : 'rgba(136, 136, 136, 0.1)',
                      border: '1px solid rgba(136, 136, 136, 0.3)',
                      padding: '3px 8px',
                      cursor: 'pointer',
                      color: '#888',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      borderRadius: '4px',
                      fontSize: '9px',
                      fontWeight: 600,
                      transition: 'all 0.15s',
                      textTransform: 'uppercase'
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(136, 136, 136, 0.3)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = group.hasFilter ? 'rgba(136, 136, 136, 0.2)' : 'rgba(136, 136, 136, 0.1)'; }}
                    title={group.hasFilter ? 'Change filter' : 'Add AND filter'}
                  >
                    <Plus size={10} />
                    {group.hasFilter ? group.column.filterBy : 'AND'}
                  </button>
                  {showColumnFilterPicker === group.column.id && (
                    <>
                      <div
                        style={{ position: 'fixed', inset: 0, zIndex: 99 }}
                        onClick={() => setShowColumnFilterPicker(null)}
                      />
                      <div style={{
                        position: 'absolute',
                        top: '100%',
                        left: 0,
                        marginTop: '4px',
                        width: '180px',
                        maxHeight: '200px',
                        background: '#1a1a1a',
                        border: '1px solid #333',
                        borderRadius: '8px',
                        overflow: 'hidden',
                        zIndex: 100,
                        boxShadow: '0 4px 12px rgba(0,0,0,0.5)'
                      }}>
                        <div style={{ padding: '8px', borderBottom: '1px solid #333', fontSize: '10px', color: '#888' }}>
                          Filter by (AND)
                        </div>
                        <div style={{ maxHeight: '150px', overflowY: 'auto' }}>
                          {group.hasFilter && (
                            <button
                              onClick={() => setColumnSecondaryFilter(group.column.id, undefined)}
                              style={{
                                width: '100%',
                                padding: '8px 12px',
                                background: 'transparent',
                                border: 'none',
                                color: '#ef4444',
                                fontSize: '11px',
                                textAlign: 'left',
                                cursor: 'pointer',
                                borderBottom: '1px solid #333'
                              }}
                              onMouseEnter={(e) => { e.currentTarget.style.background = '#2a2a2a'; }}
                              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                            >
                              Clear filter
                            </button>
                          )}
                          {dimensions
                            .filter(d => d.dimension !== group.column.dimension && d.dimension !== group.column.filterBy)
                            .map(dim => (
                              <button
                                key={dim.dimension}
                                onClick={() => setColumnSecondaryFilter(group.column.id, dim.dimension)}
                                style={{
                                  width: '100%',
                                  padding: '8px 12px',
                                  background: 'transparent',
                                  border: 'none',
                                  color: '#ccc',
                                  fontSize: '11px',
                                  textAlign: 'left',
                                  cursor: 'pointer',
                                  display: 'flex',
                                  justifyContent: 'space-between',
                                  alignItems: 'center'
                                }}
                                onMouseEnter={(e) => { e.currentTarget.style.background = '#2a2a2a'; }}
                                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                              >
                                <span>{dim.dimension}</span>
                                <span style={{ fontSize: '9px', color: '#666' }}>{dim.count}</span>
                              </button>
                            ))}
                        </div>
                      </div>
                    </>
                  )}
                </div>
                {/* Right side: remove button */}
                <button
                  onClick={() => removeColumn(group.column.id)}
                  style={{
                    background: 'none',
                    border: 'none',
                    padding: '4px',
                    cursor: 'pointer',
                    color: '#555',
                    display: 'flex',
                    alignItems: 'center',
                    borderRadius: '4px',
                    transition: 'all 0.15s'
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = '#ef4444'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = '#555'; }}
                  title="Remove column"
                >
                  <X size={12} />
                </button>
              </div>
              {group.nodes.map((node, index) => (
                <div
                  key={node.id}
                  draggable
                  onDragStart={(e) => {
                    setReorderDrag({ nodeId: node.id, dimension: group.column.dimension, index });
                    e.dataTransfer.effectAllowed = 'copyMove';
                    // Set MIME types for chat input and folder drops
                    const title = node.title || 'Untitled';
                    e.dataTransfer.setData('application/x-rah-node', JSON.stringify({ id: node.id, title }));
                    e.dataTransfer.setData('application/node-info', JSON.stringify({ id: node.id, title, dimensions: node.dimensions || [] }));
                    e.dataTransfer.setData('text/plain', `[NODE:${node.id}:"${title}"]`);
                    // Store in ref for webview compatibility
                    draggedNodeRef.current = { id: node.id, title, dimensions: node.dimensions || [] };
                  }}
                  onDragEnd={() => {
                    setReorderDrag(null);
                    setReorderDropIndex(null);
                    draggedNodeRef.current = null;
                  }}
                  onDragOver={(e) => {
                    e.preventDefault();
                    if (reorderDrag && reorderDrag.dimension === group.column.dimension && reorderDrag.nodeId !== node.id) {
                      setReorderDropIndex(index);
                    }
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (reorderDrag && reorderDrag.dimension === group.column.dimension) {
                      handleReorderDrop(group.column.dimension, reorderDrag.index, index, group.nodes);
                    }
                  }}
                  onClick={() => {
                    onNodeOpen(node.id);
                    onClose();
                  }}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    padding: '8px 10px',
                    marginBottom: '2px',
                    background: reorderDrag?.nodeId === node.id ? '#1a2a1f' : 'transparent',
                    border: reorderDropIndex === index && reorderDrag?.dimension === group.column.dimension && reorderDrag?.nodeId !== node.id
                      ? '1px dashed #888'
                      : '1px solid transparent',
                    borderRadius: '6px',
                    cursor: 'grab',
                    textAlign: 'left',
                    transition: 'all 0.15s',
                    opacity: reorderDrag?.nodeId === node.id ? 0.5 : 1
                  }}
                  onMouseEnter={(e) => {
                    if (!reorderDrag) e.currentTarget.style.background = '#111';
                  }}
                  onMouseLeave={(e) => {
                    if (!reorderDrag) e.currentTarget.style.background = 'transparent';
                  }}
                >
                  <span style={{
                    fontSize: '10px',
                    color: '#555',
                    cursor: 'grab',
                    userSelect: 'none'
                  }}>⋮⋮</span>
                  <span style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: '#888',
                    color: '#0a0a0a',
                    fontSize: '9px',
                    fontWeight: 600,
                    padding: '1px 5px',
                    borderRadius: '3px',
                    flexShrink: 0,
                    fontFamily: 'monospace',
                    lineHeight: 1,
                    height: '16px'
                  }}>
                    #{node.id}
                  </span>
                  <div style={{
                    width: '24px',
                    height: '24px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0
                  }}>
                    {getNodeIcon(node)}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontSize: '12px',
                      fontWeight: 500,
                      color: '#e5e5e5',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap'
                    }}>
                      {node.title || 'Untitled'}
                    </div>
                  </div>
                  {node.dimensions && node.dimensions.length > 1 && (
                    <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
                      {node.dimensions
                        .filter((d: string) => d !== group.column.dimension)
                        .slice(0, 2)
                        .map(dim => (
                          <span
                            key={dim}
                            style={{
                              padding: '2px 5px',
                              background: selectedFilters.includes(dim) ? 'rgba(136, 136, 136, 0.1)' : 'transparent',
                              borderRadius: '3px',
                              fontSize: '9px',
                              color: selectedFilters.includes(dim) ? '#888' : '#444',
                              fontWeight: 500
                            }}
                          >
                            {dim}
                          </span>
                        ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>
      );
    }

    // Grid view with dimension grouping
    if (viewMode === 'grid') {
      const groups = getColumnsWithNodes();
      return (
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 24px' }}>
          {groups.map(group => (
            <div key={group.column.id} style={{ marginBottom: '32px' }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                fontSize: '11px',
                fontWeight: 600,
                color: '#888',
                textTransform: 'uppercase',
                letterSpacing: '0.1em',
                padding: '8px 0',
                borderBottom: '1px solid #1a1a1a',
                marginBottom: '16px'
              }}>
                {/* Left side: dimension name + AND filter button */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', position: 'relative' }}>
                  <span>{group.label} ({group.nodes.length})</span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowColumnFilterPicker(showColumnFilterPicker === group.column.id ? null : group.column.id);
                    }}
                    style={{
                      background: group.hasFilter ? 'rgba(136, 136, 136, 0.2)' : 'rgba(136, 136, 136, 0.1)',
                      border: '1px solid rgba(136, 136, 136, 0.3)',
                      padding: '3px 8px',
                      cursor: 'pointer',
                      color: '#888',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      borderRadius: '4px',
                      fontSize: '9px',
                      fontWeight: 600,
                      transition: 'all 0.15s',
                      textTransform: 'uppercase'
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(136, 136, 136, 0.3)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = group.hasFilter ? 'rgba(136, 136, 136, 0.2)' : 'rgba(136, 136, 136, 0.1)'; }}
                    title={group.hasFilter ? 'Change filter' : 'Add AND filter'}
                  >
                    <Plus size={10} />
                    {group.hasFilter ? group.column.filterBy : 'AND'}
                  </button>
                  {showColumnFilterPicker === group.column.id && (
                    <>
                      <div
                        style={{ position: 'fixed', inset: 0, zIndex: 99 }}
                        onClick={() => setShowColumnFilterPicker(null)}
                      />
                      <div style={{
                        position: 'absolute',
                        top: '100%',
                        left: 0,
                        marginTop: '4px',
                        width: '180px',
                        maxHeight: '200px',
                        background: '#1a1a1a',
                        border: '1px solid #333',
                        borderRadius: '8px',
                        overflow: 'hidden',
                        zIndex: 100,
                        boxShadow: '0 4px 12px rgba(0,0,0,0.5)'
                      }}>
                        <div style={{ padding: '8px', borderBottom: '1px solid #333', fontSize: '10px', color: '#888' }}>
                          Filter by (AND)
                        </div>
                        <div style={{ maxHeight: '150px', overflowY: 'auto' }}>
                          {group.hasFilter && (
                            <button
                              onClick={() => setColumnSecondaryFilter(group.column.id, undefined)}
                              style={{
                                width: '100%',
                                padding: '8px 12px',
                                background: 'transparent',
                                border: 'none',
                                color: '#ef4444',
                                fontSize: '11px',
                                textAlign: 'left',
                                cursor: 'pointer',
                                borderBottom: '1px solid #333'
                              }}
                              onMouseEnter={(e) => { e.currentTarget.style.background = '#2a2a2a'; }}
                              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                            >
                              Clear filter
                            </button>
                          )}
                          {dimensions
                            .filter(d => d.dimension !== group.column.dimension && d.dimension !== group.column.filterBy)
                            .map(dim => (
                              <button
                                key={dim.dimension}
                                onClick={() => setColumnSecondaryFilter(group.column.id, dim.dimension)}
                                style={{
                                  width: '100%',
                                  padding: '8px 12px',
                                  background: 'transparent',
                                  border: 'none',
                                  color: '#ccc',
                                  fontSize: '11px',
                                  textAlign: 'left',
                                  cursor: 'pointer',
                                  display: 'flex',
                                  justifyContent: 'space-between',
                                  alignItems: 'center'
                                }}
                                onMouseEnter={(e) => { e.currentTarget.style.background = '#2a2a2a'; }}
                                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                              >
                                <span>{dim.dimension}</span>
                                <span style={{ fontSize: '9px', color: '#666' }}>{dim.count}</span>
                              </button>
                            ))}
                        </div>
                      </div>
                    </>
                  )}
                </div>
                {/* Right side: remove button */}
                <button
                  onClick={() => removeColumn(group.column.id)}
                  style={{
                    background: 'none',
                    border: 'none',
                    padding: '4px',
                    cursor: 'pointer',
                    color: '#555',
                    display: 'flex',
                    alignItems: 'center',
                    borderRadius: '4px',
                    transition: 'all 0.15s'
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = '#ef4444'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = '#555'; }}
                  title="Remove column"
                >
                  <X size={12} />
                </button>
              </div>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
                  gap: '10px'
                }}
              >
                {group.nodes.map((node: Node, index: number) => (
                  <div
                    key={node.id}
                    draggable
                    onDragStart={(e) => {
                      setReorderDrag({ nodeId: node.id, dimension: group.column.dimension, index });
                      e.dataTransfer.effectAllowed = 'copyMove';
                      // Set MIME types for chat input and folder drops
                      const title = node.title || 'Untitled';
                      e.dataTransfer.setData('application/x-rah-node', JSON.stringify({ id: node.id, title }));
                      e.dataTransfer.setData('application/node-info', JSON.stringify({ id: node.id, title, dimensions: node.dimensions || [] }));
                      e.dataTransfer.setData('text/plain', `[NODE:${node.id}:"${title}"]`);
                      // Store in ref for webview compatibility
                      draggedNodeRef.current = { id: node.id, title, dimensions: node.dimensions || [] };
                    }}
                    onDragEnd={() => {
                      setReorderDrag(null);
                      setReorderDropIndex(null);
                      draggedNodeRef.current = null;
                    }}
                    onDragOver={(e) => {
                      e.preventDefault();
                      if (reorderDrag && reorderDrag.dimension === group.column.dimension && reorderDrag.nodeId !== node.id) {
                        setReorderDropIndex(index);
                      }
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      if (reorderDrag && reorderDrag.dimension === group.column.dimension) {
                        handleReorderDrop(group.column.dimension, reorderDrag.index, index, group.nodes);
                      }
                    }}
                    onClick={() => {
                      onNodeOpen(node.id);
                      onClose();
                    }}
                    style={{
                      background: reorderDrag?.nodeId === node.id ? '#1a2a1f' : '#0a0a0a',
                      border: reorderDropIndex === index && reorderDrag?.dimension === group.column.dimension && reorderDrag?.nodeId !== node.id
                        ? '2px dashed #888'
                        : '1px solid #161616',
                      borderRadius: '10px',
                      padding: '14px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '8px',
                      cursor: 'grab',
                      transition: 'all 0.15s ease',
                      minHeight: '120px',
                      maxHeight: '140px',
                      overflow: 'hidden',
                      opacity: reorderDrag?.nodeId === node.id ? 0.5 : 1
                    }}
                    onMouseEnter={(e) => {
                      if (!reorderDrag) {
                        e.currentTarget.style.background = '#111';
                        e.currentTarget.style.borderColor = '#222';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!reorderDrag) {
                        e.currentTarget.style.background = '#0a0a0a';
                        e.currentTarget.style.borderColor = '#161616';
                      }
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                      <span style={{
                        fontSize: '10px',
                        color: '#555',
                        cursor: 'grab',
                        userSelect: 'none',
                        marginTop: '2px'
                      }}>⋮⋮</span>
                      <span style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        background: '#888',
                        color: '#0a0a0a',
                        fontSize: '9px',
                        fontWeight: 600,
                        padding: '1px 5px',
                        borderRadius: '3px',
                        flexShrink: 0,
                        fontFamily: 'monospace',
                        lineHeight: 1,
                        height: '16px'
                      }}>
                        #{node.id}
                      </span>
                      <span style={{ flexShrink: 0, marginTop: '1px' }}>{getNodeIcon(node)}</span>
                      <div style={{
                        fontSize: '12px',
                        fontWeight: 500,
                        color: '#e5e5e5',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        flex: 1
                      }}>
                        {node.title || 'Untitled'}
                      </div>
                    </div>
                    {node.notes && (
                      <div style={{
                        fontSize: '11px',
                        color: '#666',
                        lineHeight: '1.4',
                        overflow: 'hidden',
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical'
                      }}>
                        {getContentPreview(node.notes)}
                      </div>
                    )}
                    {node.dimensions && node.dimensions.length > 1 && (
                      <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginTop: 'auto' }}>
                        {node.dimensions.filter((d: string) => d !== group.column.dimension).slice(0, 2).map((dim: string) => (
                          <span
                            key={dim}
                            style={{
                              padding: '2px 5px',
                              fontSize: '9px',
                              fontWeight: 500,
                              color: selectedFilters.includes(dim) ? '#888' : '#555',
                              background: selectedFilters.includes(dim) ? 'rgba(136, 136, 136, 0.1)' : 'transparent',
                              borderRadius: '3px'
                            }}
                          >
                            {dim}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      );
    }

    // Kanban view - group by columns with drag-and-drop
    if (viewMode === 'kanban') {
      return (
        <div style={{
          flex: 1,
          display: 'flex',
          gap: '16px',
          padding: '16px 24px',
          overflowX: 'auto',
          overflowY: 'hidden'
        }}>
          {columns.map(column => {
            const unsortedColumnNodes = getNodesForColumnById(column.id);
            const columnNodes = sortNodesByDimensionOrder(unsortedColumnNodes, column.dimension);
            const columnLabel = getColumnLabel(column);
            const hasSecondaryFilter = !!column.filterBy;
            const isDropTarget = dropTargetDimension === column.id;
            const isColumnDropTarget = columnDropTarget === column.id && draggedColumn !== column.id;
            const isBeingDragged = draggedColumn === column.id;
            return (
              <div
                key={column.id}
                onDragOver={(e) => {
                  e.preventDefault();
                  // If dragging a column, set column drop target
                  if (draggedColumn) {
                    setColumnDropTarget(column.id);
                  } else {
                    setDropTargetDimension(column.id);
                  }
                }}
                onDragLeave={(e) => {
                  // Only clear if leaving the column entirely
                  if (!e.currentTarget.contains(e.relatedTarget as HTMLElement)) {
                    setDropTargetDimension(null);
                    setColumnDropTarget(null);
                  }
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  // Handle column reorder
                  if (draggedColumn && draggedColumn !== column.id) {
                    handleColumnReorder(draggedColumn, column.id);
                    setDraggedColumn(null);
                    setColumnDropTarget(null);
                  }
                  // Handle node drop
                  else if (draggedNode && draggedNode.fromDimension !== column.dimension) {
                    handleKanbanDrop(draggedNode.id, draggedNode.fromDimension, column.dimension);
                  }
                  setDraggedNode(null);
                  setDropTargetDimension(null);
                }}
                style={{
                  width: '280px',
                  minWidth: '280px',
                  display: 'flex',
                  flexDirection: 'column',
                  background: isColumnDropTarget ? '#0d1a12' : (isDropTarget ? '#0d1a12' : '#0a0a0a'),
                  border: isColumnDropTarget ? '1px solid #888' : (isDropTarget ? '1px solid #888' : '1px solid #1a1a1a'),
                  borderRadius: '12px',
                  transition: 'all 0.15s ease',
                  opacity: isBeingDragged ? 0.5 : 1
                }}
              >
                {/* Column header - draggable for reordering */}
                <div
                  draggable
                  onDragStart={(e) => {
                    setDraggedColumn(column.id);
                    e.dataTransfer.effectAllowed = 'move';
                  }}
                  onDragEnd={() => {
                    setDraggedColumn(null);
                    setColumnDropTarget(null);
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '12px',
                    borderBottom: '1px solid #1a1a1a',
                    cursor: 'grab',
                    userSelect: 'none'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', position: 'relative' }}>
                    <span style={{
                      fontSize: '10px',
                      color: '#555',
                      cursor: 'grab'
                    }}>⋮⋮</span>
                    <span style={{
                      fontSize: '12px',
                      fontWeight: 600,
                      color: '#f8fafc',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em'
                    }}>
                      {columnLabel}
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
                    {/* AND filter button - inline with column name */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowColumnFilterPicker(showColumnFilterPicker === column.id ? null : column.id);
                      }}
                      style={{
                        background: hasSecondaryFilter ? 'rgba(136, 136, 136, 0.2)' : 'rgba(136, 136, 136, 0.1)',
                        border: '1px solid rgba(136, 136, 136, 0.3)',
                        padding: '3px 8px',
                        cursor: 'pointer',
                        color: '#888',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                        borderRadius: '4px',
                        fontSize: '9px',
                        fontWeight: 600,
                        transition: 'all 0.15s',
                        textTransform: 'uppercase'
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(136, 136, 136, 0.3)'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = hasSecondaryFilter ? 'rgba(136, 136, 136, 0.2)' : 'rgba(136, 136, 136, 0.1)'; }}
                      title={hasSecondaryFilter ? 'Change filter' : 'Add AND filter'}
                    >
                      <Plus size={10} />
                      {hasSecondaryFilter ? column.filterBy : 'AND'}
                    </button>
                    {showColumnFilterPicker === column.id && (
                      <>
                        <div
                          style={{ position: 'fixed', inset: 0, zIndex: 99 }}
                          onClick={() => setShowColumnFilterPicker(null)}
                        />
                        <div style={{
                          position: 'absolute',
                          top: '100%',
                          left: 0,
                          marginTop: '4px',
                          width: '180px',
                          maxHeight: '200px',
                          background: '#1a1a1a',
                          border: '1px solid #333',
                          borderRadius: '8px',
                          overflow: 'hidden',
                          zIndex: 100,
                          boxShadow: '0 4px 12px rgba(0,0,0,0.5)'
                        }}>
                          <div style={{ padding: '8px', borderBottom: '1px solid #333', fontSize: '10px', color: '#888' }}>
                            Filter by (AND)
                          </div>
                          <div style={{ maxHeight: '150px', overflowY: 'auto' }}>
                            {hasSecondaryFilter && (
                              <button
                                onClick={() => setColumnSecondaryFilter(column.id, undefined)}
                                style={{
                                  width: '100%',
                                  padding: '8px 12px',
                                  background: 'transparent',
                                  border: 'none',
                                  color: '#ef4444',
                                  fontSize: '11px',
                                  textAlign: 'left',
                                  cursor: 'pointer',
                                  borderBottom: '1px solid #333'
                                }}
                                onMouseEnter={(e) => { e.currentTarget.style.background = '#2a2a2a'; }}
                                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                              >
                                Clear filter
                              </button>
                            )}
                            {dimensions
                              .filter(d => d.dimension !== column.dimension && d.dimension !== column.filterBy)
                              .map(dim => (
                                <button
                                  key={dim.dimension}
                                  onClick={() => setColumnSecondaryFilter(column.id, dim.dimension)}
                                  style={{
                                    width: '100%',
                                    padding: '8px 12px',
                                    background: 'transparent',
                                    border: 'none',
                                    color: '#ccc',
                                    fontSize: '11px',
                                    textAlign: 'left',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center'
                                  }}
                                  onMouseEnter={(e) => { e.currentTarget.style.background = '#2a2a2a'; }}
                                  onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                                >
                                  <span>{dim.dimension}</span>
                                  <span style={{ fontSize: '9px', color: '#666' }}>{dim.count}</span>
                                </button>
                              ))}
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                </div>
                <div style={{ flex: 1, overflowY: 'auto', padding: '8px' }}>
                  {columnNodes.map((node, index) => {
                    const isReorderTarget = reorderDropIndex === index && reorderDrag?.dimension === column.dimension && reorderDrag?.nodeId !== node.id;
                    return (
                    <div
                      key={node.id}
                      draggable
                      onDragStart={(e) => {
                        setDraggedNode({ id: node.id, fromDimension: column.dimension });
                        setReorderDrag({ nodeId: node.id, dimension: column.dimension, index });
                        e.dataTransfer.effectAllowed = 'copyMove';
                        // Set MIME types for chat input and folder drops
                        const title = node.title || 'Untitled';
                        e.dataTransfer.setData('application/x-rah-node', JSON.stringify({ id: node.id, title }));
                        e.dataTransfer.setData('application/node-info', JSON.stringify({ id: node.id, title, dimensions: node.dimensions || [] }));
                        e.dataTransfer.setData('text/plain', `[NODE:${node.id}:"${title}"]`);
                        // Store in ref for webview compatibility
                        draggedNodeRef.current = { id: node.id, title, dimensions: node.dimensions || [] };
                      }}
                      onDragEnd={() => {
                        setDraggedNode(null);
                        setDropTargetDimension(null);
                        setReorderDrag(null);
                        setReorderDropIndex(null);
                        draggedNodeRef.current = null;
                      }}
                      onDragOver={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        // If dragging within same column, show reorder indicator
                        if (reorderDrag && reorderDrag.dimension === column.dimension && reorderDrag.nodeId !== node.id) {
                          setReorderDropIndex(index);
                        }
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        // Handle within-column reorder
                        if (reorderDrag && reorderDrag.dimension === column.dimension && reorderDrag.nodeId !== node.id) {
                          handleReorderDrop(column.dimension, reorderDrag.index, index, columnNodes);
                        }
                      }}
                      onClick={() => {
                        onNodeOpen(node.id);
                        onClose();
                      }}
                      style={{
                        padding: '10px',
                        marginBottom: '6px',
                        background: draggedNode?.id === node.id ? '#1a2a1f' : '#111',
                        border: isReorderTarget ? '2px dashed #888' : (draggedNode?.id === node.id ? '1px solid #888' : '1px solid #222'),
                        borderRadius: '8px',
                        cursor: 'grab',
                        transition: 'all 0.15s',
                        userSelect: 'none',
                        opacity: draggedNode?.id === node.id ? 0.5 : 1
                      }}
                      onMouseEnter={(e) => {
                        if (!draggedNode) {
                          e.currentTarget.style.background = '#1a1a1a';
                          e.currentTarget.style.borderColor = '#333';
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!draggedNode) {
                          e.currentTarget.style.background = '#111';
                          e.currentTarget.style.borderColor = '#222';
                        }
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '6px' }}>
                        <span style={{
                          fontSize: '10px',
                          color: '#555',
                          cursor: 'grab',
                          userSelect: 'none'
                        }}>⋮⋮</span>
                        <span style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          background: '#888',
                          color: '#0a0a0a',
                          fontSize: '9px',
                          fontWeight: 600,
                          padding: '1px 5px',
                          borderRadius: '3px',
                          flexShrink: 0,
                          fontFamily: 'monospace',
                          lineHeight: 1,
                          height: '16px'
                        }}>
                          #{node.id}
                        </span>
                        <div style={{
                          fontSize: '12px',
                          fontWeight: 500,
                          color: '#e5e5e5',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          flex: 1
                        }}>
                          {node.title || 'Untitled'}
                        </div>
                      </div>
                      {node.dimensions && node.dimensions.length > 1 && (
                        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginTop: '4px' }}>
                          {node.dimensions
                            .filter((d: string) => d !== column.dimension)
                            .slice(0, 2)
                            .map(dim => (
                              <span
                                key={dim}
                                style={{
                                  padding: '2px 5px',
                                  background: selectedFilters.includes(dim) ? 'rgba(136, 136, 136, 0.1)' : 'transparent',
                                  borderRadius: '3px',
                                  fontSize: '9px',
                                  fontWeight: 500,
                                  color: selectedFilters.includes(dim) ? '#888' : '#555'
                                }}
                              >
                                {dim}
                              </span>
                            ))}
                        </div>
                      )}
                    </div>
                  );})}
                  {columnNodes.length === 0 && (
                    <div style={{
                      padding: '20px',
                      textAlign: 'center',
                      color: isDropTarget ? '#888' : '#444',
                      fontSize: '11px',
                      border: isDropTarget ? '2px dashed #888' : '2px dashed transparent',
                      borderRadius: '8px',
                      transition: 'all 0.15s ease'
                    }}>
                      {isDropTarget ? 'Drop here' : 'No nodes'}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      );
    }

    return null;
  };

  return (
    <>
    <div
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: '#050505',
        borderRadius: '4px',
        border: '1px solid #1a1a1a',
        display: 'flex',
        flexDirection: 'column',
        zIndex: 5
      }}
    >
      {/* Header */}
      <div style={{ borderBottom: '1px solid #1a1a1a' }}>
        {/* Top row: Mode tabs + Actions */}
        <div style={{ padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {/* Back button when viewing nodes in a dimension */}
            {view === 'nodes' && (
              <button
                onClick={handleBackToDimensions}
                style={{
                  padding: '6px',
                  borderRadius: '6px',
                  border: '1px solid #1f1f1f',
                  background: 'transparent',
                  cursor: 'pointer',
                  color: '#cbd5f5'
                }}
              >
                <ArrowLeft size={16} />
              </button>
            )}

            {/* Mode tabs - only show when not drilling into a specific dimension */}
            {view === 'dimensions' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                <button
                  onClick={() => {
                    setOverlayMode('folders');
                    setActiveViewId(null);
                  }}
                  style={{
                    padding: 0,
                    border: 'none',
                    background: 'transparent',
                    cursor: 'pointer',
                    color: overlayMode === 'folders' ? '#f8fafc' : '#555',
                    fontSize: '13px',
                    fontWeight: 500,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    transition: 'color 0.15s'
                  }}
                >
                  <DynamicIcon name="Folder" size={14} style={{ color: overlayMode === 'folders' ? '#888' : '#555' }} />
                  Folders
                </button>
                <button
                  onClick={() => setOverlayMode('filtered')}
                  style={{
                    padding: 0,
                    border: 'none',
                    background: 'transparent',
                    cursor: 'pointer',
                    color: overlayMode === 'filtered' ? '#f8fafc' : '#555',
                    fontSize: '13px',
                    fontWeight: 500,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    transition: 'color 0.15s'
                  }}
                >
                  <Filter size={14} style={{ color: overlayMode === 'filtered' ? '#888' : '#555' }} />
                  {activeView ? activeView.name : 'Filter'}
                </button>
              </div>
            )}

            {/* Title when viewing nodes in a dimension */}
            {view === 'nodes' && (
              <div style={{ fontSize: '13px', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#f8fafc', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span>Nodes –</span>
                <span style={{ color: '#888' }}>{selectedDimension?.dimension ?? ''}</span>
              </div>
            )}

            {/* Saved views dropdown */}
            {view === 'dimensions' && savedViews.length > 0 && (
              <div style={{ position: 'relative', marginLeft: '8px' }}>
                <button
                  onClick={() => setShowSavedViewsDropdown(!showSavedViewsDropdown)}
                  style={{
                    padding: 0,
                    border: 'none',
                    background: 'transparent',
                    cursor: 'pointer',
                    color: '#555',
                    fontSize: '12px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    transition: 'color 0.15s'
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = '#888'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = '#555'; }}
                >
                  <Save size={12} />
                  <ChevronDown size={10} />
                </button>
                {showSavedViewsDropdown && (
                  <>
                    <div
                      style={{ position: 'fixed', inset: 0, zIndex: 99 }}
                      onClick={() => setShowSavedViewsDropdown(false)}
                    />
                    <div style={{
                      position: 'absolute',
                      top: '100%',
                      left: 0,
                      marginTop: '4px',
                      minWidth: '200px',
                      background: '#1a1a1a',
                      border: '1px solid #333',
                      borderRadius: '8px',
                      overflow: 'hidden',
                      zIndex: 100,
                      boxShadow: '0 4px 12px rgba(0,0,0,0.5)'
                    }}>
                      {savedViews.map(sv => (
                        <div
                          key={sv.id}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '8px 12px',
                            cursor: 'pointer',
                            background: activeViewId === sv.id ? '#2a2a2a' : 'transparent'
                          }}
                          onMouseEnter={(e) => { if (activeViewId !== sv.id) e.currentTarget.style.background = '#252525'; }}
                          onMouseLeave={(e) => { if (activeViewId !== sv.id) e.currentTarget.style.background = 'transparent'; }}
                        >
                          <span
                            onClick={() => loadSavedView(sv)}
                            style={{ flex: 1, fontSize: '12px', color: '#ccc' }}
                          >
                            {sv.name}
                          </span>
                          {/* Delete saved view - hidden in readonly mode */}
                          {!isReadOnly && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                deleteSavedView(sv.id);
                              }}
                              style={{
                                padding: '4px',
                                background: 'none',
                                border: 'none',
                                color: '#666',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center'
                              }}
                            >
                              <Trash2 size={12} />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            {/* Add Dimension button - only in folders mode, hidden in readonly */}
            {!isReadOnly && view === 'dimensions' && overlayMode === 'folders' && (
              <button
                onClick={() => setShowAddDimensionDialog(true)}
                title="Add dimension"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '28px',
                  height: '28px',
                  color: '#555',
                  background: 'transparent',
                  border: '1px solid #1f1f1f',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  transition: 'all 0.15s'
                }}
                onMouseEnter={(e) => { e.currentTarget.style.color = '#888'; e.currentTarget.style.borderColor = '#888'; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = '#555'; e.currentTarget.style.borderColor = '#1f1f1f'; }}
              >
                <Plus size={14} />
              </button>
            )}

            {/* View mode toggle - only in filtered mode with filters */}
            {view === 'dimensions' && overlayMode === 'filtered' && selectedFilters.length > 0 && (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '2px',
                padding: '2px',
                background: '#0a0a0a',
                borderRadius: '6px',
                border: '1px solid #1f1f1f'
              }}>
                <button
                  onClick={() => setViewMode('list')}
                  title="List view"
                  style={{
                    padding: '4px',
                    borderRadius: '4px',
                    border: 'none',
                    background: viewMode === 'list' ? '#1f1f1f' : 'transparent',
                    cursor: 'pointer',
                    color: viewMode === 'list' ? '#888' : '#555',
                    display: 'flex',
                    alignItems: 'center',
                    transition: 'all 0.15s'
                  }}
                >
                  <List size={14} />
                </button>
                <button
                  onClick={() => setViewMode('grid')}
                  title="Grid view"
                  style={{
                    padding: '4px',
                    borderRadius: '4px',
                    border: 'none',
                    background: viewMode === 'grid' ? '#1f1f1f' : 'transparent',
                    cursor: 'pointer',
                    color: viewMode === 'grid' ? '#888' : '#555',
                    display: 'flex',
                    alignItems: 'center',
                    transition: 'all 0.15s'
                  }}
                >
                  <LayoutGrid size={14} />
                </button>
                <button
                  onClick={() => setViewMode('kanban')}
                  title="Kanban view"
                  style={{
                    padding: '4px',
                    borderRadius: '4px',
                    border: 'none',
                    background: viewMode === 'kanban' ? '#1f1f1f' : 'transparent',
                    cursor: 'pointer',
                    color: viewMode === 'kanban' ? '#888' : '#555',
                    display: 'flex',
                    alignItems: 'center',
                    transition: 'all 0.15s'
                  }}
                >
                  <Columns3 size={14} />
                </button>
              </div>
            )}

            {/* Save View button - only in filtered mode with filters, hidden in readonly */}
            {!isReadOnly && view === 'dimensions' && overlayMode === 'filtered' && selectedFilters.length > 0 && (
              <button
                onClick={() => setShowSaveViewDialog(true)}
                title="Save view"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '28px',
                  height: '28px',
                  color: '#555',
                  background: 'transparent',
                  border: '1px solid #1f1f1f',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  transition: 'all 0.15s'
                }}
                onMouseEnter={(e) => { e.currentTarget.style.color = '#888'; e.currentTarget.style.borderColor = '#888'; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = '#555'; e.currentTarget.style.borderColor = '#1f1f1f'; }}
              >
                <Save size={14} />
              </button>
            )}

            <button
              onClick={onClose}
              title="Close"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '28px',
                height: '28px',
                borderRadius: '6px',
                border: '1px solid #1f1f1f',
                background: 'transparent',
                cursor: 'pointer',
                color: '#555',
                transition: 'all 0.15s'
              }}
              onMouseEnter={(e) => { e.currentTarget.style.color = '#888'; e.currentTarget.style.background = '#1a1a1a'; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = '#555'; e.currentTarget.style.background = 'transparent'; }}
            >
              <X size={14} />
            </button>
          </div>
        </div>

        {/* Filter bar - only show in filtered mode */}
        {view === 'dimensions' && overlayMode === 'filtered' && (
          <div style={{
            padding: '0 16px 10px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            flexWrap: 'wrap'
          }}>
            {/* Filter chips */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '5px', flexWrap: 'wrap' }}>
              {selectedFilters.map(filter => (
                <span
                  key={filter}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: '3px 6px',
                    background: 'rgba(136, 136, 136, 0.1)',
                    borderRadius: '4px',
                    fontSize: '10px',
                    color: '#888',
                    fontWeight: 500,
                    letterSpacing: '0.02em'
                  }}
                >
                  <DynamicIcon
                    name={dimensionIcons[filter] || 'Folder'}
                    size={10}
                    style={{ opacity: 0.8 }}
                  />
                  {filter}
                  <button
                    onClick={() => removeFilter(filter)}
                    style={{
                      background: 'none',
                      border: 'none',
                      padding: 0,
                      cursor: 'pointer',
                      color: '#888',
                      display: 'flex',
                      alignItems: 'center',
                      opacity: 0.7,
                      transition: 'opacity 0.15s'
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.opacity = '1'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.opacity = '0.7'; }}
                  >
                    <X size={10} />
                  </button>
                </span>
              ))}

              {/* Add filter button */}
              <div style={{ position: 'relative' }}>
                <button
                  onClick={() => setShowFilterPicker(!showFilterPicker)}
                  title="Add filter"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '4px 10px 4px 4px',
                    background: 'transparent',
                    border: 'none',
                    borderRadius: '6px',
                    color: '#888',
                    cursor: 'pointer',
                    transition: 'all 0.15s',
                    fontSize: '11px',
                    fontWeight: 500
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = '#151515'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                >
                  <span style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: '20px',
                    height: '20px',
                    borderRadius: '50%',
                    background: '#888',
                    color: '#0a0a0a',
                    fontSize: '14px',
                    lineHeight: 1,
                    fontWeight: 300,
                    flexShrink: 0
                  }}>+</span>
                  Add Filter
                </button>
                {showFilterPicker && (
                  <>
                    <div
                      style={{ position: 'fixed', inset: 0, zIndex: 99 }}
                      onClick={() => setShowFilterPicker(false)}
                    />
                    <div style={{
                      position: 'absolute',
                      top: '100%',
                      left: 0,
                      marginTop: '4px',
                      width: '200px',
                      maxHeight: '300px',
                      background: '#1a1a1a',
                      border: '1px solid #333',
                      borderRadius: '8px',
                      overflow: 'hidden',
                      zIndex: 100,
                      boxShadow: '0 4px 12px rgba(0,0,0,0.5)'
                    }}>
                      <input
                        type="text"
                        placeholder="Search dimensions..."
                        value={filterSearchQuery}
                        onChange={(e) => setFilterSearchQuery(e.target.value)}
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
                        {dimensions
                          .filter(d =>
                            d.dimension.toLowerCase().includes(filterSearchQuery.toLowerCase())
                          )
                          .map(dim => (
                            <button
                              key={dim.dimension}
                              onClick={() => addColumn(dim.dimension)}
                              style={{
                                width: '100%',
                                padding: '8px 12px',
                                background: 'transparent',
                                border: 'none',
                                color: '#ccc',
                                fontSize: '12px',
                                textAlign: 'left',
                                cursor: 'pointer',
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center'
                              }}
                              onMouseEnter={(e) => { e.currentTarget.style.background = '#2a2a2a'; }}
                              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                            >
                              <span>{dim.dimension}</span>
                              <span style={{ fontSize: '10px', color: '#666' }}>{dim.count}</span>
                            </button>
                          ))}
                        {dimensions.filter(d =>
                          d.dimension.toLowerCase().includes(filterSearchQuery.toLowerCase()) &&
                          !selectedFilters.includes(d.dimension)
                        ).length === 0 && (
                          <div style={{ padding: '12px', fontSize: '12px', color: '#666', textAlign: 'center' }}>
                            No dimensions available
                          </div>
                        )}
                      </div>
                    </div>
                  </>
                )}
              </div>

              {selectedFilters.length > 0 && (
                <button
                  onClick={clearFilters}
                  title="Clear all filters"
                  style={{
                    padding: 0,
                    marginLeft: '4px',
                    background: 'transparent',
                    border: 'none',
                    fontSize: '10px',
                    color: '#444',
                    cursor: 'pointer',
                    transition: 'color 0.15s'
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = '#888'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = '#444'; }}
                >
                  clear
                </button>
              )}
            </div>

          </div>
        )}
      </div>

      {/* Content */}
      {view === 'nodes' ? (
        renderNodeGrid()
      ) : overlayMode === 'folders' ? (
        renderDimensionGrid()
      ) : (
        renderFilteredView()
      )}
    </div>
    <ConfirmDialog
      open={dimensionPendingDelete !== null}
      title="Delete this dimension?"
      message={`This will remove "${dimensionPendingDelete ?? ''}" from every node.`}
      confirmLabel="Delete"
      onConfirm={() => {
        if (dimensionPendingDelete) {
          handleDeleteDimension(dimensionPendingDelete);
        }
      }}
      onCancel={() => setDimensionPendingDelete(null)}
    />
    <InputDialog
      open={showAddDimensionDialog}
      title="Add New Dimension"
      message="Enter a name for the new dimension:"
      placeholder="e.g. Research, Work, Ideas"
      confirmLabel="Create"
      onConfirm={handleAddDimension}
      onCancel={() => setShowAddDimensionDialog(false)}
    />
    <InputDialog
      open={showSaveViewDialog}
      title="Save View"
      message="Enter a name for this saved view:"
      placeholder="e.g. Research Tasks, Active Projects"
      confirmLabel="Save"
      onConfirm={saveCurrentView}
      onCancel={() => setShowSaveViewDialog(false)}
    />

    {/* Dimension Edit Modal */}
    {editingDimensionModal && (
      <div
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0, 0, 0, 0.7)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }}
        onClick={(e) => {
          if (e.target === e.currentTarget) closeDimensionEditModal();
        }}
      >
        <div
          style={{
            background: '#0a0a0a',
            border: '1px solid #333',
            borderRadius: '12px',
            width: '480px',
            maxWidth: '90vw',
            maxHeight: '90vh',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column'
          }}
        >
          {/* Header */}
          <div style={{
            padding: '16px 20px',
            borderBottom: '1px solid #1a1a1a',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                background: editingDimensionModal.isPriority ? 'rgba(136, 136, 136, 0.1)' : '#111',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <DynamicIcon
                  name={editModalIcon}
                  size={16}
                  style={{ color: editingDimensionModal.isPriority ? '#888' : '#888' }}
                />
              </div>
              <div>
                <div style={{
                  fontSize: '15px',
                  fontWeight: 600,
                  color: '#e5e5e5'
                }}>
                  Edit Dimension
                </div>
                <div style={{
                  fontSize: '13px',
                  color: editingDimensionModal.isPriority ? '#888' : '#888'
                }}>
                  {editingDimensionModal.dimension}
                </div>
              </div>
            </div>
            <button
              onClick={closeDimensionEditModal}
              style={{
                background: 'transparent',
                border: 'none',
                borderRadius: '6px',
                width: '28px',
                height: '28px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                color: '#666'
              }}
            >
              <X size={16} />
            </button>
          </div>

          {/* Content */}
          <div style={{
            padding: '20px',
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: '20px'
          }}>
            {/* Description */}
            <div>
              <label style={{
                display: 'block',
                fontSize: '12px',
                fontWeight: 600,
                color: '#888',
                marginBottom: '8px',
                textTransform: 'uppercase',
                letterSpacing: '0.05em'
              }}>
                Description
              </label>
              <textarea
                value={editModalDescription}
                onChange={(e) => setEditModalDescription(e.target.value)}
                placeholder="Describe what this dimension is for..."
                maxLength={500}
                style={{
                  width: '100%',
                  minHeight: '80px',
                  padding: '12px',
                  background: '#111',
                  border: '1px solid #333',
                  borderRadius: '8px',
                  color: '#e5e5e5',
                  fontSize: '13px',
                  resize: 'vertical',
                  outline: 'none'
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = '#888';
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = '#333';
                }}
              />
              <div style={{
                marginTop: '4px',
                fontSize: '11px',
                color: '#555',
                textAlign: 'right'
              }}>
                {editModalDescription.length}/500
              </div>
            </div>

            {/* Icon Picker */}
            <div>
              <label style={{
                display: 'block',
                fontSize: '12px',
                fontWeight: 600,
                color: '#888',
                marginBottom: '8px',
                textTransform: 'uppercase',
                letterSpacing: '0.05em'
              }}>
                Icon
              </label>
              <LucideIconPicker
                selectedIcon={editModalIcon}
                onSelect={setEditModalIcon}
              />
            </div>
          </div>

          {/* Footer */}
          <div style={{
            padding: '16px 20px',
            borderTop: '1px solid #1a1a1a',
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '8px'
          }}>
            <button
              onClick={closeDimensionEditModal}
              style={{
                padding: '8px 16px',
                background: 'transparent',
                border: '1px solid #333',
                borderRadius: '6px',
                color: '#888',
                fontSize: '13px',
                fontWeight: 500,
                cursor: 'pointer'
              }}
            >
              Cancel
            </button>
            <button
              onClick={saveDimensionEdit}
              disabled={savingDimensionEdit}
              style={{
                padding: '8px 16px',
                background: '#888',
                border: 'none',
                borderRadius: '6px',
                color: '#000',
                fontSize: '13px',
                fontWeight: 600,
                cursor: savingDimensionEdit ? 'not-allowed' : 'pointer',
                opacity: savingDimensionEdit ? 0.6 : 1
              }}
            >
              {savingDimensionEdit ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  );
}
