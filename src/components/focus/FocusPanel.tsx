"use client";

import { useState, useEffect, useRef, type DragEvent } from 'react';
import { Eye, Trash2, Link, Loader, Database, Check, RefreshCw, Pencil, X, Save, Plus } from 'lucide-react';
import { parseAndRenderContent } from '@/components/helpers/NodeLabelRenderer';
import MarkdownWithNodeTokens from '@/components/helpers/MarkdownWithNodeTokens';
import FormattingToolbar from '@/components/focus/FormattingToolbar';
import { parseNodeMarkers } from '@/tools/infrastructure/nodeFormatter';
import { Node, NodeConnection, Chunk } from '@/types/database';
import DimensionTags from './dimensions/DimensionTags';
import { getNodeIcon } from '@/utils/nodeIcons';
import ConfirmDialog from '../common/ConfirmDialog';
import { SourceReader } from './source';

interface PopularDimension {
  dimension: string;
  count: number;
  isPriority: boolean;
}

interface DimensionsResponse {
  success: boolean;
  data: PopularDimension[];
}

interface NodeSearchResult {
  id: number;
  title: string;
  dimensions?: string[];
}

interface FocusPanelProps {
  openTabs: number[];
  activeTab: number | null;
  onTabSelect: (nodeId: number) => void;
  onNodeClick?: (nodeId: number) => void;
  onTabClose: (nodeId: number) => void;
  refreshTrigger?: number;
  onReorderTabs?: (fromIndex: number, toIndex: number) => void;
  onOpenInOtherSlot?: (nodeId: number) => void;
  hideTabBar?: boolean;
  onTextSelect?: (nodeId: number, nodeTitle: string, text: string) => void;
  highlightedPassage?: { nodeId: number; selectedText: string } | null;
}

export default function FocusPanel({ openTabs, activeTab, onTabSelect, onNodeClick, onTabClose, refreshTrigger, onOpenInOtherSlot, hideTabBar, onTextSelect, highlightedPassage }: FocusPanelProps) {
  const [nodesData, setNodesData] = useState<Record<number, Node>>({});

  // Context menu state
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; tabId: number } | null>(null); 
  const [loadingNodes, setLoadingNodes] = useState<Set<number>>(new Set());
  const [editingField, setEditingField] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState<string>('');
  const [editingNodeId, setEditingNodeId] = useState<number | null>(null);
  const [savingField, setSavingField] = useState<string | null>(null);
  const [embeddingNode, setEmbeddingNode] = useState<number | null>(null);
  const [showReembedPrompt, setShowReembedPrompt] = useState<number | null>(null);
  const [priorityDimensions, setPriorityDimensions] = useState<string[]>([]);
  
  const activeNodeId = activeTab;
  const currentNode = activeNodeId !== null ? nodesData[activeNodeId] : undefined;

  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(null);

  // Auto-hide re-embed prompt after a few seconds
  useEffect(() => {
    if (showReembedPrompt !== null) {
      const timeout = setTimeout(() => setShowReembedPrompt(null), 4000);
      return () => clearTimeout(timeout);
    }
  }, [showReembedPrompt]);

  // Close context menu when clicking outside
  useEffect(() => {
    if (!contextMenu) return;
    const handleClick = () => setContextMenu(null);
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setContextMenu(null);
    };
    document.addEventListener('click', handleClick);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('click', handleClick);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [contextMenu]);

  // Edges state management (following same patterns as nodes)
  const [edgesData, setEdgesData] = useState<{ [key: number]: NodeConnection[] }>({});
  const [loadingEdges, setLoadingEdges] = useState<Set<number>>(new Set());
  const [addingEdge, setAddingEdge] = useState<number | null>(null);
  const [nodeSearchQuery, setNodeSearchQuery] = useState('');
  const [nodeSearchSuggestions, setNodeSearchSuggestions] = useState<NodeSearchResult[]>([]);
  const [selectedSearchIndex, setSelectedSearchIndex] = useState(0);
  const [edgeExplanation, setEdgeExplanation] = useState('');
  const [pendingEdgeTarget, setPendingEdgeTarget] = useState<{ id: number; title: string } | null>(null);
  const [deletingEdge, setDeletingEdge] = useState<number | null>(null);
  const [edgeEditingId, setEdgeEditingId] = useState<number | null>(null);
  const [edgeEditingValue, setEdgeEditingValue] = useState<string>('');
  const [edgeSavingId, setEdgeSavingId] = useState<number | null>(null);
  const [deletingNode, setDeletingNode] = useState<number | null>(null);
  const [pendingDeleteNodeId, setPendingDeleteNodeId] = useState<number | null>(null);
  
  // Chunk content toggle state - default to expanded (true)
  const [chunkExpanded, setChunkExpanded] = useState<{ [key: number]: boolean }>({});
  
  // Edges expand/collapse state
  const [edgesExpanded, setEdgesExpanded] = useState<{ [key: number]: boolean }>({});
  
  // Connections section collapsed state (default closed)
  const [showConnectionsModal, setShowConnectionsModal] = useState(false);
  
  // Title expanded state for click-to-expand full title
  const [titleExpanded, setTitleExpanded] = useState<{ [key: number]: boolean }>({});

  // Description regeneration state
  const [regeneratingDescription, setRegeneratingDescription] = useState<number | null>(null);

  // Content tab state: 'notes', 'desc', or 'source'
  const [activeContentTab, setActiveContentTab] = useState<'notes' | 'desc' | 'source'>('notes');

  // Desc (description) edit mode state
  const [descEditMode, setDescEditMode] = useState(false);
  const [descEditValue, setDescEditValue] = useState('');
  const [descSaving, setDescSaving] = useState(false);

  // Notes edit mode state (separate from inline editing)
  const [notesEditMode, setNotesEditMode] = useState(false);
  const [notesEditValue, setNotesEditValue] = useState('');
  const [notesSaving, setNotesSaving] = useState(false);
  const notesTextareaRef = useRef<HTMLTextAreaElement>(null);

  // Source (chunk) edit mode
  const [sourceEditMode, setSourceEditMode] = useState(false);
  const [sourceEditValue, setSourceEditValue] = useState('');
  const [sourceSaving, setSourceSaving] = useState(false);

  // Source reader mode: 'raw' (monospace) or 'reader' (formatted typography)
  const [sourceReaderMode, setSourceReaderMode] = useState<'raw' | 'reader'>('reader');

  // Embedded chunks state (actual chunks from chunks table)
  const [chunksData, setChunksData] = useState<Record<number, Chunk[]>>({});
  const [loadingChunks, setLoadingChunks] = useState<Set<number>>(new Set());
  const [chunksExpanded, setChunksExpanded] = useState<Record<number, boolean>>({});

  // Helper: preview edge type based on heuristics (mirrors backend logic)
  const previewEdgeType = (explanation: string): { type: string; label: string } | null => {
    const norm = (explanation || '').trim().toLowerCase();
    if (!norm) return null;

    const startsWithAny = (prefixes: string[]) => prefixes.some((p) => norm.startsWith(p));

    if (startsWithAny(['created by', 'made by', 'authored by', 'written by', 'founded by'])) {
      return { type: 'created_by', label: 'created by' };
    }
    if (startsWithAny(['part of', 'episode of', 'belongs to', 'in the series', 'in this series'])) {
      return { type: 'part_of', label: 'part of' };
    }
    if (startsWithAny(['features', 'mentions', 'hosted by', 'guest:', 'host:'])) {
      return { type: 'part_of', label: 'part of' };
    }
    if (startsWithAny(['came from', 'inspired by', 'derived from', 'from'])) {
      return { type: 'source_of', label: 'source of' };
    }
    if (startsWithAny(['related to', 'related'])) {
      return { type: 'related_to', label: 'related to' };
    }
    // No heuristic match - will be AI-inferred
    return { type: 'inferred', label: 'will be inferred' };
  };

  // Fetch priority dimensions on mount
  useEffect(() => {
    fetchPriorityDimensions();
  }, []);

  // Generate node search suggestions
  useEffect(() => {
    if (!nodeSearchQuery.trim() || !activeTab) {
      setNodeSearchSuggestions([]);
      return;
    }

    const fetchNodeSearchSuggestions = async () => {
      try {
        const response = await fetch(`/api/nodes/search?q=${encodeURIComponent(nodeSearchQuery)}&limit=10`);
        const result = await response.json();
        
        if (result.success) {
          const nodeSuggestions: NodeSearchResult[] = result.data
            .filter((node: any) => node.id !== activeTab) // Exclude current node
            .map((node: any) => ({
              id: node.id,
              title: node.title,
              dimensions: node.dimensions || []
            }));
          
          setNodeSearchSuggestions(nodeSuggestions);
          setSelectedSearchIndex(0);
        }
      } catch (error) {
        console.error('Error fetching node search suggestions:', error);
        setNodeSearchSuggestions([]);
      }
    };

    const timeoutId = setTimeout(fetchNodeSearchSuggestions, 200);
    return () => clearTimeout(timeoutId);
  }, [nodeSearchQuery, activeTab]);

  // Fetch node data when new tabs are opened
  useEffect(() => {
    openTabs.forEach((tabId) => {
      if (!nodesData[tabId] && !loadingNodes.has(tabId)) {
        fetchNodeData(tabId);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openTabs]);

  useEffect(() => {
    openTabs.forEach((tabId) => {
      if (nodesData[tabId] && !edgesData[tabId] && !loadingEdges.has(tabId)) {
        fetchEdgesData(tabId);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openTabs, nodesData, edgesData]);


  // Refresh data when SSE events trigger updates
  useEffect(() => {
    if (refreshTrigger !== undefined && refreshTrigger > 0 && activeTab) {
      fetchNodeData(activeTab);
      fetchEdgesData(activeTab);
    }
  }, [refreshTrigger, activeTab]);

  // Clear editing state when switching nodes
  useEffect(() => {
    // Clear all edit modes when switching to a different node
    setEditingField(null);
    setEditingValue('');
    setEditingNodeId(null);
    // Also clear notes/desc/source edit modes
    setNotesEditMode(false);
    setNotesEditValue('');
    setDescEditMode(false);
    setDescEditValue('');
    setSourceEditMode(false);
    setSourceEditValue('');
  }, [activeTab]);

  const fetchPriorityDimensions = async () => {
    try {
      const response = await fetch('/api/dimensions/popular');
      const payload = (await response.json()) as DimensionsResponse;
      if (payload?.success && Array.isArray(payload.data)) {
        const priority = payload.data.filter((d) => d.isPriority).map((d) => d.dimension);
        setPriorityDimensions(priority);
      }
    } catch (error) {
      console.error('Error fetching priority dimensions:', error);
    }
  };

  const fetchNodeData = async (id: number) => {
    setLoadingNodes(prev => new Set(prev).add(id));
    // First try to fetch as a node
    try {
      const nodeResponse = await fetch(`/api/nodes/${id}`);
      if (nodeResponse.ok) {
        const data = await nodeResponse.json();
        if (data.node) {
          setNodesData(prev => ({ ...prev, [id]: data.node }));
          setLoadingNodes(prev => {
            const newSet = new Set(prev);
            newSet.delete(id);
            return newSet;
          });
          return;
        }
      }
    } catch (error) {
      console.warn(`Failed to fetch node ${id}:`, error);
    }
    setLoadingNodes(prev => {
      const newSet = new Set(prev);
      newSet.delete(id);
      return newSet;
    });
  };


  const fetchEdgesData = async (nodeId: number) => {
    setLoadingEdges(prev => new Set(prev).add(nodeId));
    try {
      const response = await fetch(`/api/nodes/${nodeId}/edges`);
      const data = await response.json();
      if (data.success && data.data) {
        setEdgesData(prev => ({ ...prev, [nodeId]: data.data }));
      }
    } catch (error) {
      console.error(`Error fetching edges for node ${nodeId}:`, error);
    } finally {
      setLoadingEdges(prev => {
        const newSet = new Set(prev);
        newSet.delete(nodeId);
        return newSet;
      });
    }
  };

  // Fetch embedded chunks for a node
  const fetchChunksData = async (nodeId: number) => {
    if (loadingChunks.has(nodeId)) return;
    setLoadingChunks(prev => new Set(prev).add(nodeId));
    try {
      const response = await fetch(`/api/nodes/${nodeId}/chunks`);
      const data = await response.json();
      if (data.success && data.chunks) {
        setChunksData(prev => ({ ...prev, [nodeId]: data.chunks }));
      }
    } catch (error) {
      console.error(`Error fetching chunks for node ${nodeId}:`, error);
    } finally {
      setLoadingChunks(prev => {
        const newSet = new Set(prev);
        newSet.delete(nodeId);
        return newSet;
      });
    }
  };

  // Fetch chunks when switching to Source tab
  useEffect(() => {
    if (activeContentTab === 'source' && activeTab && !chunksData[activeTab] && !loadingChunks.has(activeTab)) {
      fetchChunksData(activeTab);
    }
  }, [activeContentTab, activeTab]);

  const truncateTitle = (title: string, maxLength: number = 20) => {
    if (title.length <= maxLength) return title;
    return title.substring(0, maxLength) + '...';
  };

  // Focus input when editing starts
  useEffect(() => {
    if (editingField && inputRef.current) {
      inputRef.current.focus();
      if (inputRef.current instanceof HTMLInputElement || inputRef.current instanceof HTMLTextAreaElement) {
        inputRef.current.select();
      }
    }
  }, [editingField]);

  const startEdit = (field: string, currentValue: string) => {
    if (savingField) return; // Don't start edit if currently saving
    setEditingField(field);
    setEditingValue(currentValue || '');
    if (activeNodeId !== null) setEditingNodeId(activeNodeId);
  };

  const cancelEdit = () => {
    setEditingField(null);
    setEditingValue('');
    setEditingNodeId(null);
  };

  const saveField = async () => {
    const nodeId = editingNodeId ?? activeNodeId;
    if (!nodeId || !editingField) return;
    // Validate required fields
    if (editingField === 'title' && !editingValue.trim()) {
      alert('Title cannot be empty');
      return;
    }

    setSavingField(editingField);
    try {
      const updateData: Record<string, string> = {};

      if (editingField === 'content') {
        updateData.content = editingValue;
      } else {
        updateData[editingField] = editingValue;
      }

      const response = await fetch(`/api/nodes/${nodeId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updateData),
      });

      if (!response.ok) {
        throw new Error('Failed to save');
      }

      const result = await response.json();
      if (result.node) {
        setNodesData(prev => ({ ...prev, [nodeId]: result.node }));
      }

      // Safety net: ensure edges exist for any tokens present in saved content
      if (editingField === 'content' && typeof editingValue === 'string') {
        try {
          const tokens = parseNodeMarkers(editingValue);
          const uniqueTargets = Array.from(new Set(tokens.map(t => t.id))).filter(id => id !== nodeId);
          await Promise.allSettled(uniqueTargets.map(async (toId) => {
            await fetch('/api/edges', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                from_node_id: nodeId,
                to_node_id: toId,
                source: 'user',
                explanation: 'Referenced via @ mention'
              })
            });
          }));
          // Refresh edges after ensuring
          await fetchEdgesData(nodeId);
        } catch (e) {
          console.warn('Failed to ensure edges from tokens:', e);
        }
      }
      
      setEditingField(null);
      setEditingValue('');
      setEditingNodeId(null);
    } catch (error) {
      console.error('Error saving field:', error);
      alert('Failed to save changes. Please try again.');
    } finally {
      setSavingField(null);
    }
  };

  // Explicit content saver to avoid stale state reads (used after @mention insert)
  const saveContentExplicit = async (contentValue: string, nodeId: number) => {
    if (!nodeId) return;
    setSavingField('content');
    try {
      const response = await fetch(`/api/nodes/${nodeId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: contentValue }),
      });
      if (!response.ok) throw new Error('Failed to save');
      const result = await response.json();
      if (result.node) {
        setNodesData(prev => ({ ...prev, [nodeId]: result.node }));
      }
      // Safety net: ensure edges for tokens in this specific content
      try {
        const tokens = parseNodeMarkers(contentValue);
        const uniqueTargets = Array.from(new Set(tokens.map(t => t.id))).filter(id => id !== nodeId);
        await Promise.allSettled(uniqueTargets.map(async (toId) => {
          await fetch('/api/edges', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              from_node_id: nodeId,
              to_node_id: toId,
              source: 'user',
              explanation: 'Referenced via @ mention'
            })
          });
        }));
        await fetchEdgesData(nodeId);
      } catch (e) {
        console.warn('Failed to ensure edges from tokens (explicit save):', e);
      }
      // Exit edit mode
      setEditingField(null);
      setEditingValue('');
    } catch (e) {
      console.error('Error saving content (explicit):', e);
      alert('Failed to save changes. Please try again.');
    } finally {
      setSavingField(null);
    }
  };

  // Save desc (description) with explicit Save button
  const saveDesc = async () => {
    if (!activeTab) return;
    setDescSaving(true);
    try {
      const response = await fetch(`/api/nodes/${activeTab}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: descEditValue }),
      });
      if (!response.ok) throw new Error('Failed to save');
      const result = await response.json();
      if (result.node) {
        setNodesData(prev => ({ ...prev, [activeTab]: result.node }));
      }
      setDescEditMode(false);
      setDescEditValue('');
    } catch (e) {
      console.error('Error saving description:', e);
      alert('Failed to save description. Please try again.');
    } finally {
      setDescSaving(false);
    }
  };

  // Cancel desc editing
  const cancelDescEdit = () => {
    setDescEditMode(false);
    setDescEditValue('');
  };

  // Start editing desc
  const startDescEdit = () => {
    if (!activeTab || !nodesData[activeTab]) return;
    setDescEditValue(nodesData[activeTab].description || '');
    setDescEditMode(true);
  };

  // Sync description to source (chunk) and re-embed
  const syncDescToSource = async () => {
    if (!activeTab) return;
    setDescSaving(true);
    try {
      // Save description to chunk field
      const response = await fetch(`/api/nodes/${activeTab}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chunk: descEditValue }),
      });
      if (!response.ok) throw new Error('Failed to sync');
      const result = await response.json();
      if (result.node) {
        setNodesData(prev => ({ ...prev, [activeTab]: result.node }));
      }

      // Trigger re-embedding
      await fetch('/api/ingestion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nodeId: activeTab }),
      });

      // Refresh chunks data
      fetchChunksData(activeTab);

      alert('Description synced to source and re-embedded successfully.');
    } catch (e) {
      console.error('Error syncing description to source:', e);
      alert('Failed to sync to source. Please try again.');
    } finally {
      setDescSaving(false);
    }
  };

  // Save notes (content) with explicit Save button
  const saveNotes = async () => {
    if (!activeTab) return;
    setNotesSaving(true);
    try {
      const response = await fetch(`/api/nodes/${activeTab}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: notesEditValue }),
      });
      if (!response.ok) throw new Error('Failed to save');
      const result = await response.json();
      if (result.node) {
        setNodesData(prev => ({ ...prev, [activeTab]: result.node }));
      }
      // Ensure edges for any node tokens
      try {
        const tokens = parseNodeMarkers(notesEditValue);
        const uniqueTargets = Array.from(new Set(tokens.map(t => t.id))).filter(id => id !== activeTab);
        await Promise.allSettled(uniqueTargets.map(async (toId) => {
          await fetch('/api/edges', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              from_node_id: activeTab,
              to_node_id: toId,
              source: 'user',
              explanation: 'Referenced via @ mention'
            })
          });
        }));
        await fetchEdgesData(activeTab);
      } catch (e) {
        console.warn('Failed to ensure edges from tokens:', e);
      }
      setNotesEditMode(false);
      setNotesEditValue('');
    } catch (e) {
      console.error('Error saving notes:', e);
      alert('Failed to save notes. Please try again.');
    } finally {
      setNotesSaving(false);
    }
  };

  // Cancel notes editing
  const cancelNotesEdit = () => {
    setNotesEditMode(false);
    setNotesEditValue('');
  };

  // Start editing notes
  const startNotesEdit = () => {
    if (!activeTab || !nodesData[activeTab]) return;
    setNotesEditValue(nodesData[activeTab].content || '');
    setNotesEditMode(true);
  };

  // Save source (chunk) with explicit Save button
  const saveSource = async () => {
    if (!activeTab) return;
    setSourceSaving(true);
    try {
      const response = await fetch(`/api/nodes/${activeTab}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chunk: sourceEditValue }),
      });
      if (!response.ok) throw new Error('Failed to save');
      const result = await response.json();
      if (result.node) {
        setNodesData(prev => ({ ...prev, [activeTab]: result.node }));
      }
      setSourceEditMode(false);
      setSourceEditValue('');
    } catch (e) {
      console.error('Error saving source:', e);
      alert('Failed to save source. Please try again.');
    } finally {
      setSourceSaving(false);
    }
  };

  // Cancel source editing
  const cancelSourceEdit = () => {
    setSourceEditMode(false);
    setSourceEditValue('');
  };

  // Start editing source
  const startSourceEdit = () => {
    if (!activeTab || !nodesData[activeTab]) return;
    setSourceEditValue(nodesData[activeTab].chunk || '');
    setSourceEditMode(true);
  };

  // Sync Notes content to Source (with confirmation)
  const [showSyncConfirm, setShowSyncConfirm] = useState(false);
  const [syncing, setSyncing] = useState(false);

  // Create linked note state
  const [creatingNote, setCreatingNote] = useState(false);

  const syncToSource = async () => {
    if (!activeTab) return;
    setSyncing(true);
    setShowSyncConfirm(false);
    try {
      // First, save notes content to chunk field
      const response = await fetch(`/api/nodes/${activeTab}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chunk: notesEditValue }),
      });
      if (!response.ok) throw new Error('Failed to sync');
      const result = await response.json();
      if (result.node) {
        setNodesData(prev => ({ ...prev, [activeTab]: result.node }));
      }

      // Then trigger re-embedding
      await fetch('/api/ingestion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nodeId: activeTab }),
      });

      // Refresh chunks data
      fetchChunksData(activeTab);

      // Stay in edit mode but show success
      alert('Content synced to source and re-embedded successfully.');
    } catch (e) {
      console.error('Error syncing to source:', e);
      alert('Failed to sync to source. Please try again.');
    } finally {
      setSyncing(false);
    }
  };

  // Create a new linked note from current node
  const createLinkedNote = async () => {
    if (!activeTab || !nodesData[activeTab]) return;
    setCreatingNote(true);

    const sourceNodeId = activeTab;
    const currentNode = nodesData[sourceNodeId];
    let newNodeId: number | null = null;

    try {
      const noteTitle = `New Node from ${currentNode.title}`;
      const noteDescription = `New node - ideas or insights from ${currentNode.title}`;

      // Create the new node
      const createResponse = await fetch('/api/nodes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: noteTitle,
          type: 'note',
          content: '',
          description: noteDescription,
          dimensions: currentNode.dimensions || []
        }),
      });

      if (!createResponse.ok) throw new Error('Failed to create note');
      const createResult = await createResponse.json();
      newNodeId = createResult.data?.id || createResult.node?.id || createResult.id;

      if (!newNodeId) throw new Error('No node ID returned');

      // Create edge from new note to source node
      const edgeResponse = await fetch('/api/edges', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from_node_id: newNodeId,
          to_node_id: sourceNodeId,
          source: 'user',
          explanation: `Ideas or insights from "${currentNode.title}"`
        }),
      });

      if (!edgeResponse.ok) {
        console.warn('Edge creation failed but note was created');
      }

      // Open the new note in focus
      if (onTabSelect && newNodeId) {
        onTabSelect(newNodeId);
      }
    } catch (e) {
      console.error('Error creating linked note:', e);
      // If node was created but something else failed, still open it
      if (newNodeId && onTabSelect) {
        onTabSelect(newNodeId);
      } else {
        alert('Failed to create note. Please try again.');
      }
    } finally {
      setCreatingNote(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      saveField();
    } else if (e.key === 'Escape') {
      cancelEdit();
    }
  };

  const handleBlur = () => {
    // If mention is active, defer saving slightly to avoid race with selection
    const attemptSave = () => {
      if (editingField) {
        saveField();
      }
    };
    if (mentionActive) {
      setTimeout(() => {
        if (!mentionActive) attemptSave();
      }, 220);
      return;
    }
    // Small delay to allow for clicking inline buttons
    setTimeout(attemptSave, 150);
  };

  // Regenerate description for a node
  const regenerateDescription = async (nodeId: number) => {
    setRegeneratingDescription(nodeId);
    try {
      const response = await fetch(`/api/nodes/${nodeId}/regenerate-description`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });

      if (!response.ok) {
        throw new Error('Failed to regenerate description');
      }

      const result = await response.json();
      if (result.node) {
        setNodesData(prev => ({ ...prev, [nodeId]: result.node }));
      }
    } catch (error) {
      console.error('Error regenerating description:', error);
      alert('Failed to regenerate description. Please try again.');
    } finally {
      setRegeneratingDescription(null);
    }
  };

  // --- @mention state ---
  const [mentionActive, setMentionActive] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionResults, setMentionResults] = useState<NodeSearchResult[]>([]);
  const [mentionIndex, setMentionIndex] = useState(0);
  const mentionTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const resetMention = () => {
    setMentionActive(false);
    setMentionQuery('');
    setMentionResults([]);
    setMentionIndex(0);
  };

  const findAtTrigger = (text: string, caret: number): { atIndex: number; query: string } | null => {
    // Find last '@' before caret that is at start or preceded by whitespace
    for (let i = caret - 1; i >= 0; i--) {
      const ch = text[i];
      if (ch === '@') {
        const prev = i === 0 ? ' ' : text[i - 1];
        if (/\s/.test(prev)) {
          const span = text.slice(i + 1, caret);
          // Stop if span contains disallowed characters (newline or punctuation other than - _ .)
          if (/[^A-Za-z0-9 _\-.]/.test(span)) return null;
          return { atIndex: i, query: span };
        }
        // If '@' is not preceded by whitespace, keep scanning left
      }
      // Stop scanning back on whitespace/newline to avoid spanning words
      if (ch === '\n') break;
    }
    return null;
  };

  const runMentionSearch = async (query: string) => {
    if (!activeTab) return;
    if (query.trim().length < 2) {
      setMentionResults([]);
      return;
    }
    try {
      const resp = await fetch(`/api/nodes/search?q=${encodeURIComponent(query)}&limit=10`);
      const payload = (await resp.json()) as { success: boolean; data: NodeSearchResult[] };
      if (payload?.success && Array.isArray(payload.data)) {
        const filtered = payload.data
          .filter((n) => n.id !== activeTab)
          .map((n) => ({ ...n, dimensions: n.dimensions ?? [] }));
        setMentionResults(filtered);
        setMentionIndex(0);
      }
    } catch (error) {
      console.warn('mention search failed:', error);
      setMentionResults([]);
    }
  };

  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setEditingValue(val);

    // Detect @mention
    const caret = e.target.selectionStart || val.length;
    const trig = findAtTrigger(val, caret);
    if (trig) {
      setMentionActive(true);
      setMentionQuery(trig.query);
      if (mentionTimeout.current) clearTimeout(mentionTimeout.current);
      mentionTimeout.current = setTimeout(() => runMentionSearch(trig.query), 280);
    } else if (mentionActive) {
      // Exit mention mode if trigger no longer valid
      resetMention();
    }
  };

  const replaceMentionWithToken = async (nodeId: number, title: string) => {
    if (!inputRef.current || !(inputRef.current instanceof HTMLTextAreaElement)) return;
    if (activeNodeId === null) return;
    const ta = inputRef.current as HTMLTextAreaElement;
    const sourceNodeId = activeNodeId!;
    const text = editingValue;
    const caret = ta.selectionStart || text.length;
    let trig = findAtTrigger(text, caret);
    if (!trig) {
      // Fallback: try to locate the last occurrence of the current mention token
      if (mentionQuery && mentionQuery.length > 0) {
        const needle = '@' + mentionQuery;
        const idx = text.lastIndexOf(needle);
        if (idx !== -1) {
          trig = { atIndex: idx, query: mentionQuery };
        }
      }
      if (!trig) return;
    }
    // Build quote-safe token
    const quoteTitleForToken = (t: string): string => {
      if (t.includes('"')) {
        // Wrap with single quotes; normalize inner straight single quotes
        const norm = t.replace(/'/g, '’');
        return `'${norm}'`;
      }
      // Wrap with double quotes; keep title as-is (no straight doubles inside)
      return `"${t}"`;
    };
    const token = `[NODE:${nodeId}:${quoteTitleForToken(title)}]`;
    const before = text.slice(0, trig.atIndex);
    const after = text.slice(trig.atIndex + 1 + trig.query.length); // skip '@' and query
    const newVal = before + token + after;
    setEditingValue(newVal);
    // Restore caret after token
    const newCaret = (before + token).length;
    requestAnimationFrame(() => {
      ta.selectionStart = ta.selectionEnd = newCaret;
      ta.focus();
    });

    // Create edge (idempotent server-side)
    if (sourceNodeId) {
      try {
        await fetch('/api/edges', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from_node_id: sourceNodeId,
            to_node_id: nodeId,
            source: 'user',
              explanation: 'Referenced via @ mention'
          })
        });
      } catch (e) {
        console.warn('edge create failed for mention:', e);
      }
    }

    resetMention();

    // Persist content immediately to avoid losing the token on refresh/navigation
    try {
      await saveContentExplicit(newVal, sourceNodeId);
    } catch (e) {
      console.warn('auto-save after mention failed:', e);
    }
  };

  // Handle @mention selection in the Notes tab
  const handleNotesMentionSelect = async (nodeId: number, title: string) => {
    if (!notesTextareaRef.current || activeNodeId === null) return;
    const ta = notesTextareaRef.current;
    const sourceNodeId = activeNodeId;
    const text = notesEditValue;
    const caret = ta.selectionStart || text.length;
    let trig = findAtTrigger(text, caret);
    if (!trig) {
      // Fallback: try to locate the last occurrence of the current mention token
      if (mentionQuery && mentionQuery.length > 0) {
        const needle = '@' + mentionQuery;
        const idx = text.lastIndexOf(needle);
        if (idx !== -1) {
          trig = { atIndex: idx, query: mentionQuery };
        }
      }
      if (!trig) return;
    }
    // Build quote-safe token
    const quoteTitleForToken = (t: string): string => {
      if (t.includes('"')) {
        const norm = t.replace(/'/g, '\u2019'); // curly right single quote
        return `'${norm}'`;
      }
      return `"${t}"`;
    };
    const token = `[NODE:${nodeId}:${quoteTitleForToken(title)}]`;
    const before = text.slice(0, trig.atIndex);
    const after = text.slice(trig.atIndex + 1 + trig.query.length);
    const newVal = before + token + after;
    setNotesEditValue(newVal);
    // Restore caret after token
    const newCaret = (before + token).length;
    requestAnimationFrame(() => {
      ta.selectionStart = ta.selectionEnd = newCaret;
      ta.focus();
    });

    // Create edge
    if (sourceNodeId) {
      try {
        await fetch('/api/edges', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from_node_id: sourceNodeId,
            to_node_id: nodeId,
            source: 'user',
            explanation: 'Referenced via @ mention'
          })
        });
        // Refresh edges for the current node
        fetchEdgesData(sourceNodeId);
      } catch (e) {
        console.warn('edge create failed for notes mention:', e);
      }
    }

    resetMention();
  };

  const embedContent = async (nodeId: number) => {
    const node = nodesData[nodeId];
    const hasContent = node?.content?.trim();
    const hasChunk = node?.chunk?.trim();
    // If chunk is empty but content exists, auto-populate chunk from content
    if (!hasChunk && hasContent) {
      try {
        const response = await fetch(`/api/nodes/${nodeId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chunk: hasContent })
        });
        
        if (response.ok) {
          const result = await response.json();
          if (result.node) {
            setNodesData(prev => ({ ...prev, [nodeId]: result.node }));
          }
        }
      } catch (error) {
        console.error('Failed to auto-populate chunk for embedding:', error);
        return;
      }
    }
    // If neither content nor chunk exist, require content
    if (!hasContent && !hasChunk) {
      startEdit('content', '');
      return;
    }
    setEmbeddingNode(nodeId);
    try {
      const response = await fetch('/api/ingestion', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ nodeId }),
      });

      const result = await response.json();
      
      if (!response.ok) {
        throw new Error(result.error || 'Failed to embed content');
      }

      // Show result details
      const nodeStatus = result.node_embedding?.status;
      const chunkStatus = result.chunk_embeddings?.status;
      const chunksCreated = result.chunk_embeddings?.chunks_created || 0;
      
      let message = 'Embedding complete:\n';
      if (nodeStatus === 'completed') message += '✓ Node metadata embedded\n';
      if (chunkStatus === 'completed') message += `✓ ${chunksCreated} chunks embedded\n`;
      if (chunkStatus === 'skipped') message += '• No chunk content to embed\n';
      
      console.log(message.trim());

      // Refresh node data to get updated status
      await fetchNodeData(nodeId);
      
    } catch (error) {
      console.error('Error embedding content:', error);
      alert(`Failed to embed content: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setEmbeddingNode(null);
    }
  };


  // Edge management functions (following same patterns as node functions)

  const handleEdgeNodeSelect = async (targetNodeId: number, _targetNodeTitle?: string) => {
    // Immediately create edge - backend auto-infers explanation and type
    await createEdgeAuto(targetNodeId);
  };

  // Handle node search keyboard navigation
  const handleNodeSearchKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedSearchIndex(prev => Math.min(prev + 1, nodeSearchSuggestions.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedSearchIndex(prev => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter' && nodeSearchSuggestions[selectedSearchIndex]) {
      e.preventDefault();
      handleSelectNodeSuggestion(nodeSearchSuggestions[selectedSearchIndex]);
    }
  };

  const handleSelectNodeSuggestion = async (suggestion: NodeSearchResult) => {
    // Immediately create edge - backend auto-infers explanation and type
    await createEdgeAuto(suggestion.id);
    setNodeSearchSuggestions([]);
    setNodeSearchQuery('');
  };

  // Auto-create edge - backend handles explanation generation and type inference
  const createEdgeAuto = async (targetNodeId: number) => {
    if (activeNodeId === null) return;
    try {
      const response = await fetch('/api/edges', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from_node_id: activeNodeId,
          to_node_id: targetNodeId,
          source: 'user',
          explanation: '' // Empty - backend will auto-generate
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to create edge');
      }

      // Refresh edges data
      await fetchEdgesData(activeNodeId);

      // Reset state
      setAddingEdge(null);
      setEdgeExplanation('');
      setPendingEdgeTarget(null);
      setShowConnectionsModal(false);

    } catch (error) {
      console.error('Error creating edge:', error);
      alert('Failed to create edge. Please try again.');
    }
  };

  // Legacy function for manual explanation (kept for compatibility)
  const createEdgeWithExplanation = async (targetNodeId: number, explanation: string) => {
    if (activeNodeId === null) return;
    try {
      const response = await fetch('/api/edges', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from_node_id: activeNodeId,
          to_node_id: targetNodeId,
          source: 'user',
          explanation: explanation || '' // Backend handles empty
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to create edge');
      }

      // Refresh edges data
      await fetchEdgesData(activeNodeId);

      // Reset state
      setAddingEdge(null);
      setEdgeExplanation('');
      setPendingEdgeTarget(null);
      setNodeSearchQuery('');
      setNodeSearchSuggestions([]);
      setShowConnectionsModal(false);

    } catch (error) {
      console.error('Error creating edge:', error);
      alert('Failed to create edge. Please try again.');
    }
  };

  const startEditEdgeExplanation = (edgeId: number, currentExplanation: string | undefined) => {
    if (edgeSavingId) return;
    setEdgeEditingId(edgeId);
    setEdgeEditingValue(currentExplanation || '');
  };

  const cancelEditEdgeExplanation = () => {
    setEdgeEditingId(null);
    setEdgeEditingValue('');
  };

  const saveEdgeExplanation = async (
    edgeId: number,
    currentContext: Record<string, unknown> | null | undefined
  ) => {
    if (activeNodeId === null) return;
    setEdgeSavingId(edgeId);
    try {
      const newContext: Record<string, unknown> = {
        ...(currentContext ?? {}),
        explanation: edgeEditingValue
      };
      const response = await fetch(`/api/edges/${edgeId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ context: newContext })
      });
      if (!response.ok) throw new Error('Failed to update edge');
      await fetchEdgesData(activeNodeId);
      setEdgeEditingId(null);
      setEdgeEditingValue('');
    } catch (e) {
      console.error('Failed updating edge explanation:', e);
      alert('Failed to update edge explanation');
    } finally {
      setEdgeSavingId(null);
    }
  };

  const deleteEdge = async (edgeId: number) => {
    if (activeNodeId === null) return;
    setDeletingEdge(edgeId);
    try {
      const response = await fetch(`/api/edges/${edgeId}`, {
        method: 'DELETE'
      });

      if (!response.ok) {
        throw new Error('Failed to delete edge');
      }

      await fetchEdgesData(activeNodeId);
      
    } catch (error) {
      console.error('Error deleting edge:', error);
      alert('Failed to delete edge. Please try again.');
    } finally {
      setDeletingEdge(null);
    }
  };

  const renderConnectionsBody = () => {
    if (!activeTab) {
      return <div style={{ color: '#777', fontSize: '12px' }}>Open a node to manage connections.</div>;
    }

    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        {/* Search Section */}
        <div style={{ marginBottom: '20px' }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '16px',
            background: '#141414',
            padding: '16px 20px',
            borderRadius: '12px',
            border: '1px solid #262626',
            boxShadow: '0 0 0 1px rgba(255, 255, 255, 0.02)'
          }}>
            <svg width="20" height="20" viewBox="0 0 20 20" fill="#525252" style={{ flexShrink: 0 }}>
              <path fillRule="evenodd" d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z" clipRule="evenodd" />
            </svg>
            <input
              type="text"
              value={nodeSearchQuery}
              onChange={(e) => setNodeSearchQuery(e.target.value)}
              onKeyDown={handleNodeSearchKeyDown}
              placeholder="Connect to node..."
              style={{
                flex: 1,
                background: 'none',
                border: 'none',
                outline: 'none',
                color: '#fafafa',
                fontSize: '16px',
                fontFamily: 'inherit',
                fontWeight: 400
              }}
            />
          </div>
          
          {/* Search Suggestions */}
          {nodeSearchSuggestions.length > 0 && (
            <div style={{
              marginTop: '8px',
              background: '#141414',
              border: '1px solid #262626',
              borderRadius: '12px',
              maxHeight: '240px',
              overflowY: 'auto',
              boxShadow: '0 8px 24px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(255, 255, 255, 0.02)'
            }}>
              {nodeSearchSuggestions.map((suggestion, index) => (
                <div
                  key={suggestion.id}
                  onClick={() => handleSelectNodeSuggestion(suggestion)}
                  style={{
                    padding: '10px 14px',
                    cursor: 'pointer',
                    borderBottom: index < nodeSearchSuggestions.length - 1 ? '1px solid #1f1f1f' : 'none',
                    background: index === selectedSearchIndex ? '#1a1a1a' : 'transparent',
                    transition: 'background 100ms ease',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px'
                  }}
                  onMouseEnter={(e) => {
                    if (index !== selectedSearchIndex) {
                      e.currentTarget.style.background = '#1a1a1a';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (index !== selectedSearchIndex) {
                      e.currentTarget.style.background = 'transparent';
                    }
                  }}
                >
                  <span style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '9px',
                    fontWeight: 600,
                    color: '#0a0a0a',
                    background: '#9333ea',
                    padding: '3px 6px',
                    borderRadius: '6px',
                    minWidth: '24px',
                    textAlign: 'center',
                    flexShrink: 0,
                    fontFamily: "'SF Mono', 'Fira Code', monospace"
                  }}>
                    {suggestion.id}
                  </span>
                  <span style={{
                    fontSize: '13px',
                    color: '#e5e5e5',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    flex: 1
                  }}>
                    {suggestion.title}
                  </span>
                  {index === selectedSearchIndex && (
                    <span style={{ color: '#525252', fontSize: '13px' }}>↵</span>
                  )}
                </div>
              ))}
            </div>
          )}

        </div>

        {/* Existing Connections */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          <div style={{ fontSize: '12px', color: '#737373', marginBottom: '12px', letterSpacing: '0.02em' }}>
            Existing Connections
          </div>
          {loadingEdges.has(activeTab) ? (
            <div style={{ color: '#777', fontSize: '12px', fontStyle: 'italic' }}>Loading connections…</div>
          ) : (() => {
            const list = edgesData[activeTab] || [];
            if (list.length === 0) {
              return <div style={{ color: '#777', fontSize: '12px', fontStyle: 'italic' }}>No connections yet. Search above to add one.</div>;
            }
            const visible = edgesExpanded[activeTab] ? list : list.slice(0, 5);
            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {visible.map((connection) => (
                  <div key={connection.id} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px' }}>
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        {/* Direction arrow: → if current node is FROM (outgoing), ← if current node is TO (incoming) */}
                        <span style={{
                          fontSize: '12px',
                          color: connection.edge.from_node_id === activeTab ? '#9333ea' : '#f59e0b',
                          fontWeight: 600,
                          width: '16px',
                          textAlign: 'center'
                        }}>
                          {connection.edge.from_node_id === activeTab ? '→' : '←'}
                        </span>
                        <span style={{
                          display: 'inline-block',
                          fontSize: '10px',
                          fontWeight: 700,
                          color: '#000',
                          background: '#9333ea',
                          padding: '2px 6px',
                          borderRadius: '6px',
                          minWidth: '20px',
                          textAlign: 'center',
                          letterSpacing: '0.05em'
                        }}>
                          {connection.connected_node.id}
                        </span>
                        <span style={{ color: '#f8fafc', fontSize: '13px', fontWeight: 500 }}>{connection.connected_node.title}</span>
                      </div>
                      {edgeEditingId === connection.edge.id ? (
                        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                          <input
                            value={edgeEditingValue}
                            onChange={(e) => setEdgeEditingValue(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                saveEdgeExplanation(connection.edge.id, connection.edge.context);
                              } else if (e.key === 'Escape') {
                                e.preventDefault();
                                cancelEditEdgeExplanation();
                              }
                            }}
                            style={{
                              flex: 1,
                              fontSize: '11px',
                              color: '#ddd',
                              background: 'transparent',
                              border: '1px solid #1a1a1a',
                              borderRadius: '0',
                              padding: '4px',
                              outline: 'none',
                              fontFamily: 'inherit'
                            }}
                            placeholder="Add explanation…"
                            autoFocus
                          />
                          <button
                            onClick={() => saveEdgeExplanation(connection.edge.id, connection.edge.context)}
                            disabled={edgeSavingId === connection.edge.id}
                            style={{
                              fontSize: '10px',
                              color: edgeSavingId === connection.edge.id ? '#555' : '#999',
                              background: 'transparent',
                              border: '1px solid #222',
                              borderRadius: '2px',
                              padding: '3px 6px',
                              cursor: edgeSavingId === connection.edge.id ? 'not-allowed' : 'pointer'
                            }}
                          >
                            {edgeSavingId === connection.edge.id ? 'saving…' : 'save'}
                          </button>
                          <button
                            onClick={cancelEditEdgeExplanation}
                            disabled={edgeSavingId === connection.edge.id}
                            style={{
                              fontSize: '10px',
                              color: '#666',
                              background: 'transparent',
                              border: 'none',
                              padding: '3px 4px',
                              cursor: 'pointer'
                            }}
                          >
                            cancel
                          </button>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          {typeof connection.edge.context?.type === 'string' && (
                            <span style={{
                              fontSize: '10px',
                              color: '#a3a3a3',
                              background: '#1f1f1f',
                              border: '1px solid #262626',
                              padding: '2px 6px',
                              borderRadius: '999px',
                              textTransform: 'none'
                            }}>
                              {String(connection.edge.context.type).replace(/_/g, ' ')}
                            </span>
                          )}
                          {connection.edge.context?.explanation ? (
                            <span
                              style={{
                                color: '#94a3b8',
                                fontSize: '12px',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                                minWidth: 0,
                              }}
                              title={String(connection.edge.context.explanation)}
                            >
                              — {connection.edge.context.explanation}
                            </span>
                          ) : (
                            <span style={{ color: '#64748b', fontSize: '12px', fontStyle: 'italic' }}>No explanation</span>
                          )}
                          <button
                            onClick={() => startEditEdgeExplanation(connection.edge.id, connection.edge.context?.explanation)}
                            style={{
                              fontSize: '11px',
                              color: '#94a3b8',
                              background: 'transparent',
                              border: 'none',
                              cursor: 'pointer',
                              textDecoration: 'underline'
                            }}
                            onMouseEnter={(e) => { e.currentTarget.style.color = '#cbd5f5'; }}
                            onMouseLeave={(e) => { e.currentTarget.style.color = '#94a3b8'; }}
                          >
                            edit
                          </button>
                        </div>
                      )}
                    </div>
                    <button
                      onClick={() => deleteEdge(connection.edge.id)}
                      disabled={deletingEdge === connection.edge.id}
                      style={{
                        color: deletingEdge === connection.edge.id ? '#64748b' : '#94a3b8',
                        fontSize: '12px',
                        background: 'transparent',
                        border: 'none',
                        cursor: deletingEdge === connection.edge.id ? 'not-allowed' : 'pointer',
                        padding: '2px 4px',
                        transition: 'color 0.2s'
                      }}
                      onMouseEnter={(e) => {
                        if (deletingEdge !== connection.edge.id) {
                          e.currentTarget.style.color = '#dc2626';
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (deletingEdge !== connection.edge.id) {
                          e.currentTarget.style.color = '#94a3b8';
                        }
                      }}
                    >
                      {deletingEdge === connection.edge.id ? '...' : '×'}
                    </button>
                  </div>
                ))}
                {list.length > 5 && (
                  <div style={{ marginTop: '6px' }}>
                    <button
                      onClick={() => setEdgesExpanded(prev => ({ ...prev, [activeTab]: !prev[activeTab] }))}
                      style={{
                        fontSize: '9px',
                        color: '#666',
                        background: 'transparent',
                        border: 'none',
                        cursor: 'pointer',
                        transition: 'color 0.2s'
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.color = '#999'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.color = '#666'; }}
                    >
                      {edgesExpanded[activeTab] ? 'show less' : `show ${list.length - 5} more`}
                    </button>
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      </div>
    );
  };

  const handleConfirmNodeDelete = () => {
    if (pendingDeleteNodeId === null) return;
    executeDeleteNode(pendingDeleteNodeId);
    setPendingDeleteNodeId(null);
  };

  const handleCancelNodeDelete = () => {
    setPendingDeleteNodeId(null);
  };

  const executeDeleteNode = async (nodeId: number) => {
    setDeletingNode(nodeId);
    try {
      const response = await fetch(`/api/nodes/${nodeId}`, {
        method: 'DELETE'
      });

      if (!response.ok) {
        throw new Error('Failed to delete node');
      }

      onTabClose(nodeId);
      setNodesData(prev => {
        const newData = { ...prev };
        delete newData[nodeId];
        return newData;
      });
      
    } catch (error) {
      console.error('Error deleting node:', error);
      alert('Failed to delete node. Please try again.');
    } finally {
      setDeletingNode(null);
    }
  };

  const confirmDeleteNode = (nodeId: number) => {
    setPendingDeleteNodeId(nodeId);
  };

  return (
    <>
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'transparent' }}>
      {/* Tab Bar - hidden when rendered from NodePane which has its own tab bar */}
      {!hideTabBar && (
        <div style={{
          display: 'flex',
          borderBottom: '1px solid #1a1a1a',
          background: '#0f0f0f',
          flexShrink: 0,
          overflowX: 'auto',
          overflowY: 'hidden'
        }}>
          {openTabs.length === 0 ? (
            <div style={{
              padding: '10px 16px',
              fontSize: '12px',
              color: '#666'
            }}>
              No tabs open
            </div>
          ) : (
            openTabs.map((tabId) => {
              const node = nodesData[tabId];
              const isActive = activeTab === tabId;
              const label = node ? truncateTitle(node.title || 'Untitled') : 'Loading...';

              return (
                <div
                  key={tabId}
                  draggable
                  onDragStart={(e) => {
                    const title = node?.title || 'Untitled';
                    e.dataTransfer.effectAllowed = 'copyMove';
                    e.dataTransfer.setData('application/x-rah-tab', JSON.stringify({ id: tabId, title }));
                    e.dataTransfer.setData('text/plain', `[NODE:${tabId}:"${title}"]`);
                  }}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setContextMenu({ x: e.clientX, y: e.clientY, tabId });
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    borderRight: '1px solid #1a1a1a',
                    background: isActive ? '#121212' : '#0f0f0f',
                    borderBottom: isActive ? '2px solid #666' : 'none',
                    paddingBottom: isActive ? '0' : '2px',
                    minWidth: '120px',
                    maxWidth: '200px',
                    cursor: 'grab'
                  }}
                >
                  <button
                    onClick={() => onTabSelect(tabId)}
                    style={{
                      flex: 1,
                      padding: '8px 12px',
                      fontSize: '12px',
                      fontFamily: 'inherit',
                      color: isActive ? '#fff' : '#999',
                      background: 'transparent',
                      border: 'none',
                      cursor: 'pointer',
                      textAlign: 'left',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap'
                    }}
                  >
                    {label}
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onTabClose(tabId);
                    }}
                    style={{
                      padding: '4px 8px',
                      fontSize: '14px',
                      color: '#666',
                      background: 'transparent',
                      border: 'none',
                      cursor: 'pointer',
                      transition: 'color 0.2s'
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.color = '#fff'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.color = '#666'; }}
                  >
                    ×
                  </button>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Content Area */}
      <div style={{ 
        flex: 1, 
        overflow: 'auto',
        padding: '20px',
        position: 'relative'
      }}>
        {!activeTab ? (
          <div style={{
            color: '#666',
            fontSize: '13px',
            textAlign: 'center',
            marginTop: '40px'
          }}>
            Select a node from the left panel to view details
          </div>
        ) : loadingNodes.has(activeTab) ? (
          <div style={{
            color: '#666',
            fontSize: '13px'
          }}>
            Loading...
          </div>
        ) : !currentNode ? (
          <div style={{ color: '#666', fontSize: '13px' }}>Node not found.</div>
        ) : nodesData[activeTab] ? (
          <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            {/* URL Row - Above Title */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              marginBottom: '8px',
              paddingLeft: '4px'
            }}>
              {/* Embedding status - only show when embedding or error */}
              {(() => {
                const node = nodesData[activeTab];
                const chunkStatus = node?.chunk_status ?? null;

                if (embeddingNode === activeTab || chunkStatus === 'chunking') {
                  return (
                    <Loader size={12} className="animate-spin" style={{ color: '#facc15', flexShrink: 0 }} />
                  );
                }

                if (chunkStatus === 'error') {
                  return (
                    <button
                      onClick={() => embedContent(activeTab)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                        padding: '2px 6px',
                        fontSize: '10px',
                        color: '#ef4444',
                        background: 'transparent',
                        border: '1px solid #7f1d1d',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        flexShrink: 0
                      }}
                      title="Embedding failed - click to retry"
                    >
                      <Database size={10} />
                      Retry
                    </button>
                  );
                }

                return null;
              })()}

              <div style={{ flex: 1, minWidth: 0 }}>
                {editingField === 'link' ? (
                  <input
                    ref={inputRef as React.RefObject<HTMLInputElement>}
                    type="url"
                    value={editingValue}
                    onChange={(e) => setEditingValue(e.target.value)}
                    onKeyDown={handleKeyDown}
                    onBlur={handleBlur}
                    disabled={savingField === 'link'}
                    style={{
                      color: '#3b82f6',
                      fontSize: '11px',
                      background: 'transparent',
                      border: '1px solid #1a1a1a',
                      borderRadius: '4px',
                      padding: '4px 6px',
                      fontFamily: 'inherit',
                      width: '100%',
                      outline: 'none'
                    }}
                    placeholder="Enter URL..."
                  />
                ) : nodesData[activeTab].link ? (
                  <a
                    href={nodesData[activeTab].link}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => {
                      if (e.metaKey || e.ctrlKey) {
                        e.preventDefault();
                        startEdit('link', nodesData[activeTab].link || '');
                      }
                    }}
                    style={{
                      color: '#3b82f6',
                      fontSize: '11px',
                      textDecoration: 'none',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      display: 'block'
                    }}
                    title={`${nodesData[activeTab].link} (Cmd+Click to edit)`}
                  >
                    {nodesData[activeTab].link}
                  </a>
                ) : (
                  <span
                    onClick={() => startEdit('link', '')}
                    style={{
                      color: '#555',
                      fontSize: '11px',
                      cursor: 'pointer',
                      fontStyle: 'italic'
                    }}
                  >
                    Click to add URL
                  </span>
                )}
              </div>
            </div>

            {/* Title Row - Node ID, Title, Connections, Trash */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              marginBottom: '8px'
            }}>
              {/* Node ID - Draggable */}
              <span
                draggable
                onDragStart={(e: DragEvent<HTMLSpanElement>) => {
                  const title = nodesData[activeTab]?.title || 'Untitled';
                  e.dataTransfer.effectAllowed = 'copyMove';
                  e.dataTransfer.setData('application/x-rah-node', JSON.stringify({ id: activeTab, title }));
                  e.dataTransfer.setData('application/node-info', JSON.stringify({ id: activeTab, title, dimensions: nodesData[activeTab]?.dimensions || [] }));
                  e.dataTransfer.setData('text/plain', `[NODE:${activeTab}:"${title}"]`);
                }}
                style={{
                  display: 'inline-block',
                  background: '#9333ea',
                  color: '#0a0a0a',
                  fontSize: '10px',
                  fontWeight: 600,
                  padding: '2px 6px',
                  borderRadius: '4px',
                  flexShrink: 0,
                  cursor: 'grab'
                }}
                title="Drag to chat to reference this node"
              >
                {activeTab}
              </span>

              {editingField === 'title' ? (
                <input
                  ref={inputRef as React.RefObject<HTMLInputElement>}
                  type="text"
                  value={editingValue}
                  onChange={(e) => setEditingValue(e.target.value)}
                  onKeyDown={handleKeyDown}
                  onBlur={handleBlur}
                  disabled={savingField === 'title'}
                  style={{
                    fontSize: '20px',
                    fontWeight: 'bold',
                    color: '#fff',
                    background: 'transparent',
                    border: '1px solid #1a1a1a',
                    borderRadius: '0',
                    padding: '4px 8px',
                    fontFamily: 'inherit',
                    flex: 1,
                    outline: 'none'
                  }}
                  placeholder="Enter title..."
                />
              ) : (
                <h1
                  onClick={() => {
                    if (titleExpanded[activeTab]) {
                      startEdit('title', nodesData[activeTab].title || '');
                    } else {
                      setTitleExpanded(prev => ({ ...prev, [activeTab]: true }));
                      setTimeout(() => {
                        setTitleExpanded(prev => ({ ...prev, [activeTab]: false }));
                      }, 3000);
                    }
                  }}
                  style={{
                    fontSize: '20px',
                    fontWeight: 'bold',
                    color: '#fff',
                    fontFamily: 'inherit',
                    cursor: 'pointer',
                    padding: '4px 8px',
                    margin: '0',
                    borderRadius: '0',
                    background: 'transparent',
                    border: '1px solid transparent',
                    transition: 'border-color 0.2s',
                    flex: 1,
                    minWidth: 0,
                    ...(titleExpanded[activeTab] ? {
                      whiteSpace: 'normal',
                      wordWrap: 'break-word'
                    } : {
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis'
                    })
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = '#1a1a1a';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = 'transparent';
                  }}
                  title={titleExpanded[activeTab] ? undefined : (nodesData[activeTab].title || 'Untitled')}
                >
                  {nodesData[activeTab].title || 'Untitled'}
                  {savingField === 'title' && <span style={{ color: '#555', fontSize: '10px', marginLeft: '6px' }}>saving...</span>}
                </h1>
              )}

              {/* Connections Button */}
              <button
                onClick={() => setShowConnectionsModal(true)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '4px 8px',
                  fontSize: '10px',
                  fontWeight: 500,
                  color: '#9333ea',
                  background: 'transparent',
                  border: '1px solid #7c3aed',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  flexShrink: 0
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = '#1e1b4b';
                  e.currentTarget.style.borderColor = '#9333ea';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent';
                  e.currentTarget.style.borderColor = '#7c3aed';
                }}
                title="Connections"
              >
                <Link size={12} />
                {activeTab && edgesData[activeTab] && edgesData[activeTab].length > 0 && (
                  <span style={{ fontWeight: 600 }}>
                    {edgesData[activeTab].length}
                  </span>
                )}
              </button>

              {/* Delete Button */}
              <button
                onClick={() => confirmDeleteNode(activeTab)}
                disabled={deletingNode === activeTab}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '4px',
                  color: deletingNode === activeTab ? '#994444' : '#525252',
                  background: 'transparent',
                  border: '1px solid #262626',
                  borderRadius: '4px',
                  cursor: deletingNode === activeTab ? 'wait' : 'pointer',
                  transition: 'all 0.2s',
                  flexShrink: 0
                }}
                onMouseEnter={(e) => {
                  if (deletingNode !== activeTab) {
                    e.currentTarget.style.color = '#dc2626';
                    e.currentTarget.style.borderColor = '#dc2626';
                    e.currentTarget.style.background = 'rgba(220, 38, 38, 0.1)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (deletingNode !== activeTab) {
                    e.currentTarget.style.color = '#525252';
                    e.currentTarget.style.borderColor = '#262626';
                    e.currentTarget.style.background = 'transparent';
                  }
                }}
                title="Delete node"
              >
                {deletingNode === activeTab ? '...' : <Trash2 size={12} />}
              </button>
            </div>

            {/* Dimensions Section */}
            <div style={{ marginBottom: '16px' }}>
              <div style={{
                overflowX: 'auto',
                overflowY: 'visible',
                position: 'relative'
              }}>
                <DimensionTags
                dimensions={nodesData[activeTab].dimensions || []}
                priorityDimensions={priorityDimensions}
                onUpdate={async (newDimensions) => {
                  try {
                    const response = await fetch(`/api/nodes/${activeTab}`, {
                      method: 'PUT',
                      headers: {
                        'Content-Type': 'application/json',
                      },
                      body: JSON.stringify({ dimensions: newDimensions }),
                    });

                    if (!response.ok) {
                      throw new Error('Failed to save');
                    }

                    const result = await response.json();
                    if (result.node) {
                      setNodesData(prev => ({ ...prev, [activeTab]: result.node }));
                    }
                  } catch (error) {
                    console.error('Error saving dimensions:', error);
                    alert('Failed to save dimensions. Please try again.');
                  }
                }}
                onPriorityToggle={async (dimension) => {
                  try {
                    const response = await fetch('/api/dimensions/popular', {
                      method: 'POST',
                      headers: {
                        'Content-Type': 'application/json',
                      },
                      body: JSON.stringify({ dimension }),
                    });

                    if (!response.ok) {
                      throw new Error('Failed to toggle priority');
                    }

                    // Refresh priority dimensions list
                    await fetchPriorityDimensions();
                  } catch (error) {
                    console.error('Error toggling priority:', error);
                    alert('Failed to toggle priority. Please try again.');
                  }
                }}
                disabled={false}
              />
              </div>
            </div>

            {/* Notes | Desc | Source Tabs */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
              {/* Tab Bar */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0',
                marginBottom: '12px',
                borderBottom: '1px solid #1a1a1a'
              }}>
                <button
                  onClick={() => { setActiveContentTab('notes'); setDescEditMode(false); setSourceEditMode(false); }}
                  style={{
                    padding: '8px 16px',
                    fontSize: '11px',
                    fontWeight: activeContentTab === 'notes' ? 600 : 400,
                    color: activeContentTab === 'notes' ? '#e5e5e5' : '#666',
                    background: 'transparent',
                    border: 'none',
                    borderBottom: activeContentTab === 'notes' ? '2px solid #9333ea' : '2px solid transparent',
                    cursor: 'pointer',
                    transition: 'all 0.15s',
                    marginBottom: '-1px'
                  }}
                >
                  Notes
                </button>
                <button
                  onClick={() => { setActiveContentTab('desc'); setNotesEditMode(false); setSourceEditMode(false); }}
                  style={{
                    padding: '8px 16px',
                    fontSize: '11px',
                    fontWeight: activeContentTab === 'desc' ? 600 : 400,
                    color: activeContentTab === 'desc' ? '#e5e5e5' : '#666',
                    background: 'transparent',
                    border: 'none',
                    borderBottom: activeContentTab === 'desc' ? '2px solid #9333ea' : '2px solid transparent',
                    cursor: 'pointer',
                    transition: 'all 0.15s',
                    marginBottom: '-1px'
                  }}
                >
                  Desc
                </button>
                <button
                  onClick={() => { setActiveContentTab('source'); setDescEditMode(false); setNotesEditMode(false); }}
                  style={{
                    padding: '8px 16px',
                    fontSize: '11px',
                    fontWeight: activeContentTab === 'source' ? 600 : 400,
                    color: activeContentTab === 'source' ? '#e5e5e5' : '#666',
                    background: 'transparent',
                    border: 'none',
                    borderBottom: activeContentTab === 'source' ? '2px solid #9333ea' : '2px solid transparent',
                    cursor: 'pointer',
                    transition: 'all 0.15s',
                    marginBottom: '-1px'
                  }}
                >
                  Source
                </button>
                <div style={{ flex: 1 }} />
                {/* Action buttons for Desc tab */}
                {activeContentTab === 'desc' && !descEditMode && (
                  <div style={{ display: 'flex', gap: '8px', marginBottom: '4px' }}>
                    <button
                      onClick={() => activeTab && regenerateDescription(activeTab)}
                      disabled={regeneratingDescription === activeTab}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                        padding: '4px 8px',
                        fontSize: '10px',
                        color: '#888',
                        background: 'transparent',
                        border: '1px solid #2a2a2a',
                        borderRadius: '4px',
                        cursor: 'pointer'
                      }}
                      title="Regenerate description with AI"
                    >
                      <RefreshCw size={12} style={{ animation: regeneratingDescription === activeTab ? 'spin 1s linear infinite' : 'none' }} />
                      Regenerate
                    </button>
                    <button
                      onClick={startDescEdit}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                        padding: '4px 8px',
                        fontSize: '10px',
                        color: '#888',
                        background: 'transparent',
                        border: '1px solid #2a2a2a',
                        borderRadius: '4px',
                        cursor: 'pointer'
                      }}
                      title="Edit description"
                    >
                      <Pencil size={12} />
                      Edit
                    </button>
                  </div>
                )}
                {/* Action buttons for Notes tab */}
                {activeContentTab === 'notes' && !notesEditMode && (
                  <div style={{ display: 'flex', gap: '8px', marginBottom: '4px' }}>
                    <button
                      onClick={createLinkedNote}
                      disabled={creatingNote}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                        padding: '4px 8px',
                        fontSize: '10px',
                        color: '#9333ea',
                        background: 'transparent',
                        border: '1px solid #7c3aed',
                        borderRadius: '4px',
                        cursor: 'pointer'
                      }}
                      title="Create a new linked node"
                    >
                      {creatingNote ? <Loader size={12} className="animate-spin" /> : <Plus size={12} />}
                      Node
                    </button>
                    <button
                      onClick={startNotesEdit}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                        padding: '4px 8px',
                        fontSize: '10px',
                        color: '#888',
                        background: 'transparent',
                        border: '1px solid #2a2a2a',
                        borderRadius: '4px',
                        cursor: 'pointer'
                      }}
                      title="Edit notes"
                    >
                      <Pencil size={12} />
                      Edit
                    </button>
                  </div>
                )}
                {/* Formatting toolbar for Notes edit mode - inline */}
                {activeContentTab === 'notes' && notesEditMode && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                    <FormattingToolbar
                      textareaRef={notesTextareaRef}
                      value={notesEditValue}
                      onChange={setNotesEditValue}
                      inline
                    />
                  </div>
                )}
              </div>

              {/* Desc Tab Content */}
              {activeContentTab === 'desc' && (
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                  {descEditMode ? (
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                      <div style={{
                        fontSize: '11px',
                        color: '#f59e0b',
                        marginBottom: '8px',
                        padding: '8px',
                        background: '#1a1500',
                        borderRadius: '4px',
                        border: '1px solid #3d3500'
                      }}>
                        Used as context for AI. Clearly describe what this node is in 280 chars or less.
                      </div>
                      {/* Editor */}
                      <div style={{ position: 'relative', flex: 1, display: 'flex', flexDirection: 'column' }}>
                        <textarea
                          value={descEditValue}
                          onChange={(e) => {
                            const newValue = e.target.value.slice(0, 280);
                            setDescEditValue(newValue);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Escape') {
                              cancelDescEdit();
                            }
                          }}
                          disabled={descSaving}
                          style={{
                            color: '#e5e5e5',
                            fontSize: '15px',
                            lineHeight: '1.7',
                            background: 'transparent',
                            border: '1px solid #2a2a2a',
                            borderRadius: '4px',
                            padding: '12px',
                            fontFamily: 'inherit',
                            width: '100%',
                            flex: 1,
                            minHeight: '120px',
                            resize: 'none',
                            outline: 'none',
                            overflow: 'auto'
                          }}
                          placeholder="Write a brief description of this node (max 280 chars)..."
                          maxLength={280}
                        />
                        <span style={{
                          position: 'absolute',
                          bottom: '12px',
                          right: '12px',
                          fontSize: '10px',
                          color: descEditValue.length >= 260 ? '#f59e0b' : '#555'
                        }}>
                          {descEditValue.length}/280
                        </span>
                      </div>
                      {/* Save/Cancel/Sync buttons */}
                      <div style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginTop: '12px'
                      }}>
                        {/* Sync to Source button - left side */}
                        <div>
                          <button
                            onClick={syncDescToSource}
                            disabled={descSaving}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '4px',
                              padding: '6px 10px',
                              fontSize: '10px',
                              color: '#f59e0b',
                              background: 'transparent',
                              border: '1px solid #3d3500',
                              borderRadius: '4px',
                              cursor: 'pointer'
                            }}
                            title="Copy description to source and re-embed"
                          >
                            {descSaving ? <Loader size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                            Sync to Source
                          </button>
                        </div>
                        {/* Save/Cancel - right side */}
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <button
                            onClick={cancelDescEdit}
                            disabled={descSaving}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '4px',
                              padding: '6px 12px',
                              fontSize: '11px',
                              color: '#888',
                              background: 'transparent',
                              border: '1px solid #2a2a2a',
                              borderRadius: '4px',
                              cursor: 'pointer'
                            }}
                          >
                            <X size={14} />
                            Cancel
                          </button>
                          <button
                            onClick={saveDesc}
                            disabled={descSaving}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '4px',
                              padding: '6px 12px',
                              fontSize: '11px',
                              color: '#000',
                              background: '#9333ea',
                              border: 'none',
                              borderRadius: '4px',
                              cursor: 'pointer',
                              fontWeight: 600
                            }}
                          >
                            {descSaving ? <Loader size={14} className="animate-spin" /> : <Save size={14} />}
                            Save
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : nodesData[activeTab]?.description ? (
                    <div
                      style={{
                        color: '#e5e5e5',
                        fontSize: '15px',
                        lineHeight: '1.7',
                        padding: '4px',
                        flex: 1,
                        overflow: 'auto'
                      }}
                    >
                      {nodesData[activeTab].description}
                    </div>
                  ) : (
                    <div
                      onClick={startDescEdit}
                      style={{
                        color: '#555',
                        fontSize: '12px',
                        fontStyle: 'italic',
                        cursor: 'pointer',
                        padding: '8px',
                        minHeight: '100px',
                        border: '1px dashed #1a1a1a',
                        borderRadius: '4px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        background: 'transparent',
                        flex: 1,
                        transition: 'border-color 0.15s'
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#2a2a2a'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#1a1a1a'; }}
                    >
                      Click to add a description...
                    </div>
                  )}
                </div>
              )}

              {/* Notes Tab Content */}
              {activeContentTab === 'notes' && (
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                  {notesEditMode ? (
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                      {/* Editor */}
                      <div style={{ position: 'relative', flex: 1, display: 'flex', flexDirection: 'column' }}>
                        <textarea
                          ref={notesTextareaRef}
                          value={notesEditValue}
                          onChange={(e) => {
                            const val = e.target.value;
                            setNotesEditValue(val);
                            // Detect @mention
                            const caret = e.target.selectionStart || val.length;
                            const trig = findAtTrigger(val, caret);
                            if (trig) {
                              setMentionActive(true);
                              setMentionQuery(trig.query);
                              if (mentionTimeout.current) clearTimeout(mentionTimeout.current);
                              mentionTimeout.current = setTimeout(() => runMentionSearch(trig.query), 280);
                            } else if (mentionActive) {
                              resetMention();
                            }
                          }}
                          onKeyDown={(e) => {
                            // @mention navigation
                            if (mentionActive && mentionResults.length > 0) {
                              if (e.key === 'ArrowDown') {
                                e.preventDefault();
                                setMentionIndex(i => Math.min(i + 1, mentionResults.length - 1));
                                return;
                              }
                              if (e.key === 'ArrowUp') {
                                e.preventDefault();
                                setMentionIndex(i => Math.max(i - 1, 0));
                                return;
                              }
                              if (e.key === 'Enter' && mentionResults[mentionIndex]) {
                                e.preventDefault();
                                handleNotesMentionSelect(mentionResults[mentionIndex].id, mentionResults[mentionIndex].title);
                                return;
                              }
                              if (e.key === 'Escape') {
                                e.preventDefault();
                                resetMention();
                                return;
                              }
                            }
                            if (e.key === 'Escape') {
                              cancelNotesEdit();
                            }
                          }}
                          disabled={notesSaving}
                          style={{
                            color: '#e5e5e5',
                            fontSize: '15px',
                            lineHeight: '1.7',
                            background: 'transparent',
                            border: '1px solid #2a2a2a',
                            borderRadius: '4px',
                            padding: '12px',
                            fontFamily: 'inherit',
                            width: '100%',
                            flex: 1,
                            minHeight: '200px',
                            resize: 'none',
                            outline: 'none',
                            overflow: 'auto'
                          }}
                          placeholder="Start writing... Use @ to mention nodes, and Markdown for formatting."
                        />
                        {/* @mention dropdown */}
                        {mentionActive && (
                          <div style={{
                            position: 'absolute',
                            top: '50px',
                            left: '12px',
                            background: '#1a1a1a',
                            border: '1px solid #333',
                            borderRadius: '6px',
                            zIndex: 1000,
                            maxHeight: '200px',
                            overflowY: 'auto',
                            minWidth: '300px',
                            boxShadow: '0 4px 12px rgba(0,0,0,0.5)'
                          }}>
                            {mentionQuery.trim().length < 2 ? (
                              <div style={{ padding: '8px 12px', fontSize: '12px', color: '#666' }}>
                                Type at least 2 characters to search...
                              </div>
                            ) : mentionResults.length === 0 ? (
                              <div style={{ padding: '8px 12px', fontSize: '12px', color: '#666' }}>
                                No nodes found
                              </div>
                            ) : (
                              mentionResults.map((n, idx) => (
                                <div
                                  key={n.id}
                                  onMouseDown={(e) => {
                                    e.preventDefault();
                                    handleNotesMentionSelect(n.id, n.title);
                                  }}
                                  onMouseEnter={() => setMentionIndex(idx)}
                                  style={{
                                    padding: '8px 12px',
                                    fontSize: '13px',
                                    color: '#ddd',
                                    cursor: 'pointer',
                                    background: idx === mentionIndex ? '#252525' : 'transparent',
                                    borderBottom: idx < mentionResults.length - 1 ? '1px solid #2a2a2a' : 'none'
                                  }}
                                >
                                  <span style={{ color: '#9333ea', marginRight: '8px', fontWeight: 600 }}>{n.id}</span>
                                  <span>{n.title.length > 50 ? n.title.slice(0, 50) + '…' : n.title}</span>
                                </div>
                              ))
                            )}
                          </div>
                        )}
                      </div>
                      {/* Save/Cancel/Sync buttons */}
                      <div style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginTop: '12px'
                      }}>
                        {/* Sync to Source button - left side */}
                        <div>
                          {nodesData[activeTab]?.chunk && (
                            <button
                              onClick={() => setShowSyncConfirm(true)}
                              disabled={notesSaving || syncing}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px',
                                padding: '6px 10px',
                                fontSize: '10px',
                                color: '#f59e0b',
                                background: 'transparent',
                                border: '1px solid #3d3500',
                                borderRadius: '4px',
                                cursor: 'pointer'
                              }}
                              title="Copy notes to source and re-embed"
                            >
                              {syncing ? <Loader size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                              Sync to Source
                            </button>
                          )}
                        </div>
                        {/* Save/Cancel - right side */}
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <button
                            onClick={cancelNotesEdit}
                            disabled={notesSaving || syncing}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '4px',
                              padding: '6px 12px',
                              fontSize: '11px',
                              color: '#888',
                              background: 'transparent',
                              border: '1px solid #2a2a2a',
                              borderRadius: '4px',
                              cursor: 'pointer'
                            }}
                          >
                            <X size={14} />
                            Cancel
                          </button>
                          <button
                            onClick={saveNotes}
                            disabled={notesSaving || syncing}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '4px',
                              padding: '6px 12px',
                              fontSize: '11px',
                              color: '#000',
                              background: '#9333ea',
                              border: 'none',
                              borderRadius: '4px',
                              cursor: 'pointer',
                              fontWeight: 600
                            }}
                          >
                            {notesSaving ? <Loader size={14} className="animate-spin" /> : <Save size={14} />}
                            Save
                          </button>
                        </div>
                      </div>
                      {/* Sync confirmation dialog */}
                      {showSyncConfirm && (
                        <div style={{
                          marginTop: '12px',
                          padding: '12px',
                          background: '#1a1500',
                          border: '1px solid #3d3500',
                          borderRadius: '4px'
                        }}>
                          <div style={{ fontSize: '12px', color: '#f59e0b', marginBottom: '8px' }}>
                            This will overwrite your source content and update what search uses.
                          </div>
                          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                            <button
                              onClick={() => setShowSyncConfirm(false)}
                              style={{
                                padding: '4px 10px',
                                fontSize: '11px',
                                color: '#888',
                                background: 'transparent',
                                border: '1px solid #2a2a2a',
                                borderRadius: '4px',
                                cursor: 'pointer'
                              }}
                            >
                              Cancel
                            </button>
                            <button
                              onClick={syncToSource}
                              style={{
                                padding: '4px 10px',
                                fontSize: '11px',
                                color: '#000',
                                background: '#f59e0b',
                                border: 'none',
                                borderRadius: '4px',
                                cursor: 'pointer',
                                fontWeight: 600
                              }}
                            >
                              Sync Now
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ) : nodesData[activeTab]?.content ? (
                    <div
                      style={{
                        color: '#e5e5e5',
                        fontSize: '15px',
                        lineHeight: '1.7',
                        padding: '4px',
                        flex: 1,
                        overflow: 'auto'
                      }}
                    >
                      <MarkdownWithNodeTokens
                        content={nodesData[activeTab].content}
                        onNodeClick={onNodeClick || onTabSelect}
                      />
                    </div>
                  ) : (
                    <div
                      onClick={startNotesEdit}
                      style={{
                        color: '#555',
                        fontSize: '12px',
                        fontStyle: 'italic',
                        cursor: 'pointer',
                        padding: '8px',
                        minHeight: '200px',
                        border: '1px dashed #1a1a1a',
                        borderRadius: '4px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        background: 'transparent',
                        flex: 1,
                        transition: 'all 0.2s'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.borderColor = '#2a2a2a';
                        e.currentTarget.style.color = '#666';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.borderColor = '#1a1a1a';
                        e.currentTarget.style.color = '#555';
                      }}
                    >
                      Click to add notes...
                    </div>
                  )}
                </div>
              )}

              {/* Source Tab Content */}
              {activeContentTab === 'source' && (
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                  {sourceEditMode ? (
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                      <div style={{
                        fontSize: '11px',
                        color: '#f59e0b',
                        marginBottom: '8px',
                        padding: '8px',
                        background: '#1a1500',
                        borderRadius: '4px',
                        border: '1px solid #3d3500'
                      }}>
                        Editing source changes what search uses. This is the raw content that gets embedded.
                      </div>
                      <textarea
                        value={sourceEditValue}
                        onChange={(e) => setSourceEditValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Escape') {
                            cancelSourceEdit();
                          }
                        }}
                        disabled={sourceSaving}
                        style={{
                          color: '#ccc',
                          fontSize: '12px',
                          lineHeight: '1.5',
                          background: 'transparent',
                          border: '1px solid #2a2a2a',
                          borderRadius: '4px',
                          padding: '12px',
                          fontFamily: 'monospace',
                          width: '100%',
                          flex: 1,
                          minHeight: '200px',
                          resize: 'none',
                          outline: 'none',
                          overflow: 'auto'
                        }}
                        placeholder="Add source content for embedding..."
                      />
                      <div style={{
                        display: 'flex',
                        justifyContent: 'flex-end',
                        gap: '8px',
                        marginTop: '12px'
                      }}>
                        <button
                          onClick={cancelSourceEdit}
                          disabled={sourceSaving}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                            padding: '6px 12px',
                            fontSize: '11px',
                            color: '#888',
                            background: 'transparent',
                            border: '1px solid #2a2a2a',
                            borderRadius: '4px',
                            cursor: 'pointer'
                          }}
                        >
                          <X size={14} />
                          Cancel
                        </button>
                        <button
                          onClick={saveSource}
                          disabled={sourceSaving}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                            padding: '6px 12px',
                            fontSize: '11px',
                            color: '#000',
                            background: '#9333ea',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            fontWeight: 600
                          }}
                        >
                          {sourceSaving ? <Loader size={14} className="animate-spin" /> : <Save size={14} />}
                          Save
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                      {/* Mode toggle and edit button */}
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        marginBottom: '8px',
                        flexShrink: 0,
                      }}>
                        {/* Raw / Reader toggle */}
                        <div style={{
                          display: 'flex',
                          background: '#111',
                          borderRadius: '4px',
                          border: '1px solid #222',
                          overflow: 'hidden',
                        }}>
                          <button
                            onClick={() => setSourceReaderMode('raw')}
                            style={{
                              padding: '4px 10px',
                              fontSize: '10px',
                              fontWeight: 500,
                              color: sourceReaderMode === 'raw' ? '#fff' : '#666',
                              background: sourceReaderMode === 'raw' ? '#2a2a2a' : 'transparent',
                              border: 'none',
                              cursor: 'pointer',
                              transition: 'all 0.15s ease',
                            }}
                          >
                            Raw
                          </button>
                          <button
                            onClick={() => setSourceReaderMode('reader')}
                            style={{
                              padding: '4px 10px',
                              fontSize: '10px',
                              fontWeight: 500,
                              color: sourceReaderMode === 'reader' ? '#fff' : '#666',
                              background: sourceReaderMode === 'reader' ? '#2a2a2a' : 'transparent',
                              border: 'none',
                              cursor: 'pointer',
                              transition: 'all 0.15s ease',
                            }}
                          >
                            Reader
                          </button>
                        </div>

                        {/* Edit button */}
                        <button
                          onClick={startSourceEdit}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                            padding: '4px 8px',
                            fontSize: '10px',
                            color: '#666',
                            background: 'transparent',
                            border: '1px solid #222',
                            borderRadius: '4px',
                            cursor: 'pointer',
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.color = '#888';
                            e.currentTarget.style.borderColor = '#333';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.color = '#666';
                            e.currentTarget.style.borderColor = '#222';
                          }}
                        >
                          <Pencil size={10} />
                          Edit
                        </button>
                      </div>

                      {/* Content display */}
                      <div style={{ flex: 1, overflow: 'auto' }}>
                        {nodesData[activeTab]?.chunk ? (
                          sourceReaderMode === 'reader' ? (
                            <SourceReader 
                              content={nodesData[activeTab].chunk} 
                              onTextSelect={onTextSelect ? (text) => onTextSelect(activeTab, nodesData[activeTab]?.title || 'Untitled', text) : undefined}
                              highlightedText={highlightedPassage?.nodeId === activeTab ? highlightedPassage.selectedText : null}
                            />
                          ) : (
                            <div
                              style={{
                                color: '#ccc',
                                fontSize: '12px',
                                lineHeight: '1.5',
                                padding: '12px',
                                background: '#0a0a0a',
                                border: '1px solid #1a1a1a',
                                borderRadius: '4px',
                                fontFamily: 'monospace',
                                whiteSpace: 'pre-wrap',
                                minHeight: '100%',
                              }}
                            >
                              {nodesData[activeTab].chunk}
                            </div>
                          )
                        ) : (
                          <div
                            onClick={startSourceEdit}
                            style={{
                              color: '#555',
                              fontSize: '12px',
                              fontStyle: 'italic',
                              cursor: 'pointer',
                              padding: '12px',
                              border: '1px dashed #1a1a1a',
                              borderRadius: '4px',
                              textAlign: 'center',
                              height: '100%',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center'
                            }}
                          >
                            No source content. Click to add.
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div style={{
            color: '#666',
            fontSize: '13px'
          }}>
            Node not found
          </div>
        )}
      </div>
    </div>
    <ConfirmDialog
      open={pendingDeleteNodeId !== null}
      title="Delete this node?"
      message="This will permanently remove the node and its data."
      confirmLabel="Delete"
      onConfirm={handleConfirmNodeDelete}
      onCancel={handleCancelNodeDelete}
    />
    {showConnectionsModal && activeTab && (
      <div
        onClick={(e) => {
          if (e.target === e.currentTarget) {
            setShowConnectionsModal(false);
            setNodeSearchQuery('');
            setNodeSearchSuggestions([]);
          }
        }}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0, 0, 0, 0.85)',
          backdropFilter: 'blur(8px)',
          display: 'flex',
          justifyContent: 'center',
          paddingTop: '10vh',
          zIndex: 9999,
          animation: 'backdropIn 200ms ease-out'
        }}
      >
        <div
          style={{
            width: '100%',
            maxWidth: '640px',
            maxHeight: '80vh',
            display: 'flex',
            flexDirection: 'column',
            animation: 'containerIn 200ms cubic-bezier(0.16, 1, 0.3, 1)'
          }}
        >
          {/* Search Input */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '16px',
            background: '#141414',
            border: '1px solid #262626',
            borderRadius: '16px',
            padding: '20px 24px',
            boxShadow: '0 0 0 1px rgba(255, 255, 255, 0.04), 0 24px 48px -12px rgba(0, 0, 0, 0.6)'
          }}>
            <svg width="22" height="22" viewBox="0 0 20 20" fill="#525252" style={{ flexShrink: 0 }}>
              <path fillRule="evenodd" d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z" clipRule="evenodd" />
            </svg>
            <input
              autoFocus
              type="text"
              value={nodeSearchQuery}
              onChange={(e) => setNodeSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  setShowConnectionsModal(false);
                  setNodeSearchQuery('');
                  setNodeSearchSuggestions([]);
                } else {
                  handleNodeSearchKeyDown(e);
                }
              }}
              placeholder="Search to add connection..."
              style={{
                flex: 1,
                background: 'none',
                border: 'none',
                outline: 'none',
                color: '#fafafa',
                fontSize: '18px',
                fontFamily: 'inherit',
                fontWeight: 400
              }}
            />
            <kbd style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '4px 8px',
              background: '#262626',
              borderRadius: '6px',
              fontSize: '11px',
              fontFamily: 'inherit',
              color: '#737373',
              border: '1px solid #333'
            }}>
              esc
            </kbd>
          </div>

          {/* Search Results */}
          {nodeSearchSuggestions.length > 0 && (
            <div style={{
              marginTop: '8px',
              background: '#141414',
              border: '1px solid #262626',
              borderRadius: '16px',
              overflow: 'hidden',
              boxShadow: '0 0 0 1px rgba(255, 255, 255, 0.04), 0 24px 48px -12px rgba(0, 0, 0, 0.6)',
              animation: 'resultsIn 150ms ease-out',
              maxHeight: '200px',
              overflowY: 'auto'
            }}>
              {nodeSearchSuggestions.map((suggestion, index) => (
                <div
                  key={suggestion.id}
                  onClick={() => {
                    handleSelectNodeSuggestion(suggestion);
                    setNodeSearchQuery('');
                    setNodeSearchSuggestions([]);
                  }}
                  style={{
                    padding: '10px 16px',
                    cursor: 'pointer',
                    borderBottom: index < nodeSearchSuggestions.length - 1 ? '1px solid #1f1f1f' : 'none',
                    background: index === selectedSearchIndex ? '#1a1a1a' : 'transparent',
                    transition: 'background 100ms ease',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = '#1a1a1a';
                  }}
                  onMouseLeave={(e) => {
                    if (index !== selectedSearchIndex) {
                      e.currentTarget.style.background = 'transparent';
                    }
                  }}
                >
                  <span style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '9px',
                    fontWeight: 600,
                    color: '#0a0a0a',
                    background: '#9333ea',
                    padding: '3px 6px',
                    borderRadius: '6px',
                    minWidth: '24px',
                    textAlign: 'center',
                    flexShrink: 0,
                    fontFamily: "'SF Mono', 'Fira Code', monospace"
                  }}>
                    {suggestion.id}
                  </span>
                  <span style={{
                    fontSize: '13px',
                    color: '#e5e5e5',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    flex: 1
                  }}>
                    {suggestion.title}
                  </span>
                  {index === selectedSearchIndex && (
                    <span style={{ color: '#525252', fontSize: '13px' }}>↵</span>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Empty search state */}
          {nodeSearchQuery && nodeSearchSuggestions.length === 0 && (
            <div style={{
              marginTop: '8px',
              padding: '24px',
              background: '#141414',
              border: '1px solid #262626',
              borderRadius: '16px',
              color: '#525252',
              fontSize: '14px',
              textAlign: 'center'
            }}>
              No results for "{nodeSearchQuery}"
            </div>
          )}

          {/* Existing Connections */}
          {!nodeSearchQuery && (
            <div style={{
              marginTop: '16px',
              background: '#141414',
              border: '1px solid #262626',
              borderRadius: '16px',
              overflow: 'hidden',
              boxShadow: '0 0 0 1px rgba(255, 255, 255, 0.04), 0 8px 24px -8px rgba(0, 0, 0, 0.4)',
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              minHeight: 0
            }}>
              <div style={{
                padding: '12px 16px',
                borderBottom: '1px solid #1f1f1f',
                fontSize: '12px',
                color: '#737373',
                letterSpacing: '0.05em',
                textTransform: 'uppercase',
                fontWeight: 600
              }}>
                Existing Connections ({(edgesData[activeTab] || []).length})
              </div>
              <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
                {loadingEdges.has(activeTab) ? (
                  <div style={{ padding: '24px', color: '#666', fontSize: '13px', textAlign: 'center' }}>
                    Loading...
                  </div>
                ) : (edgesData[activeTab] || []).length === 0 ? (
                  <div style={{ padding: '32px 24px', color: '#525252', fontSize: '14px', textAlign: 'center' }}>
                    No connections yet. Search above to add one.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    {(edgesData[activeTab] || []).map((connection) => (
                      <div
                        key={connection.id}
                        style={{
                          padding: '10px 16px',
                          borderBottom: '1px solid #1f1f1f',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '6px'
                        }}
                      >
                        {/* Connection header row */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          {/* Direction arrow: → if current node is FROM (outgoing), ← if current node is TO (incoming) */}
                          <span style={{
                            fontSize: '14px',
                            color: connection.edge.from_node_id === activeTab ? '#9333ea' : '#f59e0b',
                            fontWeight: 600,
                            width: '18px',
                            textAlign: 'center',
                            flexShrink: 0
                          }}>
                            {connection.edge.from_node_id === activeTab ? '→' : '←'}
                          </span>
                          <span style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '10px',
                            fontWeight: 600,
                            color: '#0a0a0a',
                            background: '#9333ea',
                            padding: '3px 6px',
                            borderRadius: '6px',
                            minWidth: '24px',
                            textAlign: 'center',
                            flexShrink: 0,
                            fontFamily: "'SF Mono', 'Fira Code', monospace"
                          }}>
                            {connection.connected_node.id}
                          </span>
                          <span
                            onClick={() => onNodeClick?.(connection.connected_node.id)}
                            style={{
                              flex: 1,
                              fontSize: '13px',
                              color: '#e5e5e5',
                              cursor: 'pointer',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap'
                            }}
                            onMouseEnter={(e) => { e.currentTarget.style.color = '#9333ea'; }}
                            onMouseLeave={(e) => { e.currentTarget.style.color = '#e5e5e5'; }}
                          >
                            {connection.connected_node.title}
                          </span>
                          <button
                            onClick={() => deleteEdge(connection.edge.id)}
                            disabled={deletingEdge === connection.edge.id}
                            style={{
                              padding: '6px',
                              background: 'transparent',
                              border: 'none',
                              color: '#525252',
                              cursor: deletingEdge === connection.edge.id ? 'not-allowed' : 'pointer',
                              borderRadius: '6px',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              transition: 'all 0.15s ease',
                              opacity: deletingEdge === connection.edge.id ? 0.5 : 1
                            }}
                            onMouseEnter={(e) => { e.currentTarget.style.color = '#ef4444'; e.currentTarget.style.background = '#1f1f1f'; }}
                            onMouseLeave={(e) => { e.currentTarget.style.color = '#525252'; e.currentTarget.style.background = 'transparent'; }}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                        {/* Description row */}
                        {edgeEditingId === connection.edge.id ? (
                          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                            <input
                              value={edgeEditingValue}
                              onChange={(e) => setEdgeEditingValue(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  saveEdgeExplanation(connection.edge.id, connection.edge.context);
                                } else if (e.key === 'Escape') {
                                  e.preventDefault();
                                  cancelEditEdgeExplanation();
                                }
                              }}
                              autoFocus
                              placeholder="Add explanation..."
                              style={{
                                flex: 1,
                                fontSize: '11px',
                                color: '#e5e5e5',
                                background: '#0a0a0a',
                                border: '1px solid #333',
                                borderRadius: '6px',
                                padding: '6px 8px',
                                outline: 'none',
                                fontFamily: 'inherit'
                              }}
                            />
                            <button
                              onClick={() => saveEdgeExplanation(connection.edge.id, connection.edge.context)}
                              style={{
                                padding: '5px 10px',
                                background: '#9333ea',
                                border: 'none',
                                borderRadius: '6px',
                                color: '#0a0a0a',
                                fontSize: '11px',
                                fontWeight: 600,
                                cursor: 'pointer'
                              }}
                            >
                              Save
                            </button>
                            <button
                              onClick={cancelEditEdgeExplanation}
                              style={{
                                padding: '5px 10px',
                                background: '#262626',
                                border: 'none',
                                borderRadius: '6px',
                                color: '#999',
                                fontSize: '11px',
                                fontWeight: 600,
                                cursor: 'pointer'
                              }}
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <div
                            onClick={() => startEditEdgeExplanation(connection.edge.id, connection.edge.context?.explanation as string | undefined)}
                            style={{
                              fontSize: '12px',
                              color: connection.edge.context?.explanation ? '#888' : '#525252',
                              cursor: 'pointer',
                              padding: '4px 0',
                              fontStyle: connection.edge.context?.explanation ? 'normal' : 'italic',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '8px'
                            }}
                            onMouseEnter={(e) => { e.currentTarget.style.color = '#aaa'; }}
                            onMouseLeave={(e) => { e.currentTarget.style.color = connection.edge.context?.explanation ? '#888' : '#525252'; }}
                          >
                            {typeof connection.edge.context?.type === 'string' && (
                              <span style={{
                                fontSize: '10px',
                                color: '#a3a3a3',
                                background: '#0f0f0f',
                                border: '1px solid #262626',
                                padding: '2px 6px',
                                borderRadius: '999px',
                                flexShrink: 0
                              }}>
                                {String(connection.edge.context.type).replace(/_/g, ' ')}
                              </span>
                            )}
                            <span
                              style={{
                                flex: 1,
                                minWidth: 0,
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                              }}
                              title={String(connection.edge.context?.explanation || '')}
                            >
                              {(connection.edge.context?.explanation as string) || 'Click to add explanation...'}
                            </span>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
        <style jsx>{`
          @keyframes backdropIn {
            from { opacity: 0; }
            to { opacity: 1; }
          }
          @keyframes containerIn {
            from { 
              opacity: 0;
              transform: scale(0.96) translateY(-8px);
            }
            to { 
              opacity: 1;
              transform: scale(1) translateY(0);
            }
          }
          @keyframes resultsIn {
            from { 
              opacity: 0;
              transform: translateY(-4px);
            }
            to { 
              opacity: 1;
              transform: translateY(0);
            }
          }
        `}</style>
      </div>
    )}

    {/* Tab Context Menu */}
    {contextMenu && (
      <div
        style={{
          position: 'fixed',
          top: contextMenu.y,
          left: contextMenu.x,
          background: '#1a1a1a',
          border: '1px solid #2a2a2a',
          borderRadius: '6px',
          padding: '4px',
          zIndex: 9999,
          boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
          minWidth: '160px',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {onOpenInOtherSlot && (
          <button
            onClick={() => {
              onOpenInOtherSlot(contextMenu.tabId);
              setContextMenu(null);
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              width: '100%',
              padding: '8px 12px',
              background: 'transparent',
              border: 'none',
              borderRadius: '4px',
              color: '#ccc',
              fontSize: '12px',
              cursor: 'pointer',
              textAlign: 'left',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = '#2a2a2a';
              e.currentTarget.style.color = '#fff';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent';
              e.currentTarget.style.color = '#ccc';
            }}
          >
            <span style={{ fontSize: '14px' }}>↗</span>
            Open in other panel
          </button>
        )}
        <button
          onClick={() => {
            onTabClose(contextMenu.tabId);
            setContextMenu(null);
          }}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            width: '100%',
            padding: '8px 12px',
            background: 'transparent',
            border: 'none',
            borderRadius: '4px',
            color: '#ccc',
            fontSize: '12px',
            cursor: 'pointer',
            textAlign: 'left',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = '#2a2a2a';
            e.currentTarget.style.color = '#fff';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'transparent';
            e.currentTarget.style.color = '#ccc';
          }}
        >
          <span style={{ fontSize: '14px' }}>×</span>
          Close tab
        </button>
      </div>
    )}

  </>
  );
}
