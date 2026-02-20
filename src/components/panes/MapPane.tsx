"use client";

import { useEffect, useMemo, useRef, useState, useCallback, type CSSProperties } from 'react';
import {
  ReactFlow,
  Background,
  useNodesState,
  useEdgesState,
  addEdge as rfAddEdge,
  type Connection,
  type NodeMouseHandler,
  type Node as RFNode,
  type Edge as RFEdge,
  ReactFlowProvider,
  useReactFlow,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import type { Edge as DbEdge, Node as DbNode } from '@/types/database';
import PaneHeader from './PaneHeader';
import type { MapPaneProps } from './types';
import { ChevronDown } from 'lucide-react';

const isReadOnly = process.env.NEXT_PUBLIC_READONLY_MODE === 'true';

import { RahNode } from './map/RahNode';
import EdgeExplanationModal from './map/EdgeExplanationModal';
import { toRFNodes, toRFEdges, NODE_LIMIT, type RahNodeData } from './map/utils';
import './map/map-styles.css';

interface DimensionInfo {
  dimension: string;
  count: number;
  isPriority: boolean;
  description: string | null;
}

const nodeTypes = { rahNode: RahNode };

// Debounce helper
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function debounce<T extends (...args: any[]) => void>(fn: T, ms: number): T {
  let timer: ReturnType<typeof setTimeout>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return ((...args: any[]) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  }) as T;
}

function MapPaneInner({
  slot,
  isActive,
  onPaneAction,
  onCollapse,
  onSwapPanes,
  tabBar,
  onNodeClick,
  activeTabId,
}: MapPaneProps) {
  const reactFlowInstance = useReactFlow();

  // --- Data state (DB-level) ---
  const [baseNodes, setBaseNodes] = useState<DbNode[]>([]);
  const [expandedNodes, setExpandedNodes] = useState<DbNode[]>([]);
  const [dbEdges, setDbEdges] = useState<DbEdge[]>([]);
  const [lockedDimensions, setLockedDimensions] = useState<DimensionInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // --- UI state ---
  const [selectedNodeId, setSelectedNodeId] = useState<number | null>(null);
  const [selectedDimension, setSelectedDimension] = useState<string | null>(null);
  const [dimensionDropdownOpen, setDimensionDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // --- React Flow state ---
  const [rfNodes, setRfNodes, onNodesChange] = useNodesState<RFNode<RahNodeData>>([]);
  const [rfEdges, setRfEdges, onEdgesChange] = useEdgesState<RFEdge>([]);

  // --- Edge creation modal ---
  const [pendingConnection, setPendingConnection] = useState<Connection | null>(null);

  // Track current RF positions so we can preserve them across data refreshes
  const rfPositionsRef = useRef<Map<string, { x: number; y: number }>>(new Map());

  // Combine base + expanded
  const allDbNodes = useMemo(() => {
    const baseIds = new Set(baseNodes.map(n => n.id));
    return [...baseNodes, ...expandedNodes.filter(n => !baseIds.has(n.id))];
  }, [baseNodes, expandedNodes]);

  // Selected DB node
  const selectedDbNode = useMemo(
    () => allDbNodes.find(n => n.id === selectedNodeId) ?? null,
    [allDbNodes, selectedNodeId],
  );

  // Connected node IDs for info panel
  const connectedNodeIds = useMemo(() => {
    if (!selectedNodeId) return new Set<number>();
    const connected = new Set<number>();
    dbEdges.forEach(e => {
      if (e.from_node_id === selectedNodeId) connected.add(e.to_node_id);
      if (e.to_node_id === selectedNodeId) connected.add(e.from_node_id);
    });
    return connected;
  }, [selectedNodeId, dbEdges]);

  const lockedDimensionNames = useMemo(
    () => new Set(lockedDimensions.map(d => d.dimension)),
    [lockedDimensions],
  );

  // ----- Close dropdown on outside click -----
  useEffect(() => {
    if (!dimensionDropdownOpen) return;
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as HTMLElement)) {
        setDimensionDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [dimensionDropdownOpen]);

  // ----- Fetch base data -----
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setError(null);
      try {
        const nodesUrl = selectedDimension
          ? `/api/nodes?limit=${NODE_LIMIT}&sortBy=edges&dimensions=${encodeURIComponent(selectedDimension)}`
          : `/api/nodes?limit=${NODE_LIMIT}&sortBy=edges`;

        const [nodesRes, edgesRes, dimsRes] = await Promise.all([
          fetch(nodesUrl),
          fetch('/api/edges'),
          fetch('/api/dimensions/popular'),
        ]);

        if (!nodesRes.ok || !edgesRes.ok) throw new Error('Failed to load data');

        const nodesPayload = await nodesRes.json();
        const edgesPayload = await edgesRes.json();

        setBaseNodes(nodesPayload.data || []);
        setDbEdges(edgesPayload.data || []);
        setExpandedNodes([]);
        setSelectedNodeId(null);
        rfPositionsRef.current.clear();

        if (dimsRes.ok) {
          const dimsPayload = await dimsRes.json();
          if (dimsPayload.success && dimsPayload.data) {
            setLockedDimensions(
              (dimsPayload.data as DimensionInfo[]).filter(d => d.isPriority),
            );
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [selectedDimension]);

  // ----- Sync DB data → React Flow nodes/edges -----
  useEffect(() => {
    if (allDbNodes.length === 0) {
      setRfNodes([]);
      setRfEdges([]);
      return;
    }

    // Capture current RF positions before rebuild
    rfNodes.forEach(n => {
      rfPositionsRef.current.set(n.id, n.position);
    });

    const centerX = 600;
    const centerY = 400;

    const newRfNodes = toRFNodes(
      baseNodes,
      expandedNodes,
      centerX,
      centerY,
      selectedNodeId,
      connectedNodeIds,
      rfPositionsRef.current,
    );

    const nodeIdSet = new Set(newRfNodes.map(n => n.id));
    const newRfEdges = toRFEdges(dbEdges, nodeIdSet, selectedNodeId);

    setRfNodes(newRfNodes);
    setRfEdges(newRfEdges);
  }, [allDbNodes, baseNodes, expandedNodes, dbEdges, selectedNodeId, connectedNodeIds]);

  // ----- Node traversal: fetch connected nodes -----
  const fetchConnectedNodes = useCallback(async (nodeId: number) => {
    try {
      const edgesRes = await fetch(`/api/nodes/${nodeId}/edges`);
      let nodeEdges: DbEdge[] = [];

      if (edgesRes.ok) {
        const edgesData = await edgesRes.json();
        nodeEdges = edgesData.data || [];

        if (nodeEdges.length > 0) {
          setDbEdges(prev => {
            const existing = new Set(prev.map(e => e.id));
            const fresh = nodeEdges.filter(e => !existing.has(e.id));
            return fresh.length > 0 ? [...prev, ...fresh] : prev;
          });
        }
      }

      // Find missing connected node IDs
      const connectedIds = new Set<number>();
      dbEdges.forEach(e => {
        if (e.from_node_id === nodeId) connectedIds.add(e.to_node_id);
        if (e.to_node_id === nodeId) connectedIds.add(e.from_node_id);
      });
      nodeEdges.forEach(e => {
        if (e.from_node_id === nodeId) connectedIds.add(e.to_node_id);
        if (e.to_node_id === nodeId) connectedIds.add(e.from_node_id);
      });

      const existingIds = new Set(allDbNodes.map(n => n.id));
      const missingIds = Array.from(connectedIds).filter(id => !existingIds.has(id));
      if (missingIds.length === 0) return;

      const fetched = (
        await Promise.all(
          missingIds.slice(0, 50).map(async id => {
            try {
              const res = await fetch(`/api/nodes/${id}`);
              if (res.ok) {
                const data = await res.json();
                return data.node as DbNode;
              }
            } catch { /* ignore */ }
            return null;
          }),
        )
      ).filter((n): n is DbNode => n !== null);

      if (fetched.length > 0) {
        setExpandedNodes(prev => {
          const ids = new Set(prev.map(n => n.id));
          const fresh = fetched.filter(n => !ids.has(n.id));
          return fresh.length > 0 ? [...prev, ...fresh] : prev;
        });
      }
    } catch (err) {
      console.error('Failed to fetch connected nodes:', err);
    }
  }, [dbEdges, allDbNodes]);

  useEffect(() => {
    if (selectedNodeId) fetchConnectedNodes(selectedNodeId);
  }, [selectedNodeId, fetchConnectedNodes]);

  // ----- Focused node awareness -----
  useEffect(() => {
    if (!activeTabId) return;
    const existing = allDbNodes.find(n => n.id === activeTabId);
    if (existing) {
      setSelectedNodeId(activeTabId);
      // Pan + zoom closer to the focused node
      const rfNode = rfNodes.find(n => n.id === String(activeTabId));
      if (rfNode) {
        reactFlowInstance.setCenter(rfNode.position.x, rfNode.position.y, { duration: 400, zoom: 1.5 });
      }
    } else {
      (async () => {
        try {
          const res = await fetch(`/api/nodes/${activeTabId}`);
          if (res.ok) {
            const data = await res.json();
            const node = data.node as DbNode;
            if (node) {
              setExpandedNodes(prev => prev.some(n => n.id === node.id) ? prev : [...prev, node]);
              setSelectedNodeId(node.id);
              // After the next render cycle, zoom to the newly added node
              setTimeout(() => {
                reactFlowInstance.setCenter(600, 400, { duration: 400, zoom: 1.5 });
              }, 100);
            }
          }
        } catch (err) {
          console.error('Failed to fetch focused node:', err);
        }
      })();
    }
  }, [activeTabId]);

  // ----- SSE real-time sync -----
  useEffect(() => {
    let eventSource: EventSource | null = null;

    try {
      eventSource = new EventSource('/api/events');

      eventSource.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);

          switch (payload.type) {
            case 'NODE_UPDATED': {
              const node = payload.data?.node as DbNode | undefined;
              if (node?.id) {
                const updater = (prev: DbNode[]) =>
                  prev.map(n => n.id === node.id ? { ...n, ...node } : n);
                setBaseNodes(updater);
                setExpandedNodes(updater);
              }
              break;
            }
            case 'NODE_DELETED': {
              const deletedId = payload.data?.nodeId;
              if (deletedId) {
                setBaseNodes(prev => prev.filter(n => n.id !== deletedId));
                setExpandedNodes(prev => prev.filter(n => n.id !== deletedId));
                setDbEdges(prev => prev.filter(e => e.from_node_id !== deletedId && e.to_node_id !== deletedId));
                setSelectedNodeId(prev => prev === deletedId ? null : prev);
              }
              break;
            }
            case 'NODE_CREATED': {
              // If filtering by dimension and new node matches, could add it
              // For now, just note it happened — user can refresh
              break;
            }
            case 'EDGE_CREATED': {
              const edge = payload.data?.edge as DbEdge | undefined;
              if (edge?.id) {
                setDbEdges(prev => {
                  if (prev.some(e => e.id === edge.id)) return prev;
                  return [...prev, edge];
                });
              }
              break;
            }
            case 'EDGE_DELETED': {
              const edgeId = payload.data?.edgeId;
              if (edgeId) {
                setDbEdges(prev => prev.filter(e => e.id !== edgeId));
              }
              break;
            }
          }
        } catch {
          // Ignore parse errors (keep-alive pings, etc.)
        }
      };

      eventSource.onerror = () => {
        // EventSource auto-reconnects, just log
        console.error('Map SSE connection error');
      };
    } catch {
      console.error('Failed to establish Map SSE connection');
    }

    return () => {
      eventSource?.close();
    };
  }, []);

  // ----- Node drag → save position to metadata (debounced) -----
  const savePositionRef = useRef(
    debounce(async (nodeId: number, x: number, y: number) => {
      try {
        const res = await fetch(`/api/nodes/${nodeId}`);
        if (!res.ok) return;
        const { node: existing } = await res.json();
        const existingMetadata = existing?.metadata ?? {};
        const mergedMeta = typeof existingMetadata === 'string'
          ? (() => { try { return JSON.parse(existingMetadata); } catch { return {}; } })()
          : existingMetadata;

        await fetch(`/api/nodes/${nodeId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            metadata: { ...mergedMeta, map_position: { x, y } },
          }),
        });
      } catch (err) {
        console.error('Failed to save node position:', err);
      }
    }, 400),
  );

  const onNodeDragStop: NodeMouseHandler<RFNode<RahNodeData>> = useCallback((_event, node) => {
    const nodeId = parseInt(node.id);
    if (!isNaN(nodeId)) {
      rfPositionsRef.current.set(node.id, node.position);
      savePositionRef.current(nodeId, node.position.x, node.position.y);
    }
  }, []);

  // ----- Node click → select + traverse -----
  const onNodeClickHandler: NodeMouseHandler<RFNode<RahNodeData>> = useCallback((_event, node) => {
    const nodeId = parseInt(node.id);
    if (isNaN(nodeId)) return;
    setSelectedNodeId(prev => prev === nodeId ? null : nodeId);
  }, []);

  // ----- Node double-click → open in other pane -----
  const onNodeDoubleClick: NodeMouseHandler<RFNode<RahNodeData>> = useCallback((_event, node) => {
    const nodeId = parseInt(node.id);
    if (!isNaN(nodeId)) onNodeClick?.(nodeId);
  }, [onNodeClick]);

  // ----- Edge creation via drag (disabled in readonly mode) -----
  const onConnect = useCallback((connection: Connection) => {
    if (isReadOnly) return; // No edge creation in readonly mode
    if (connection.source === connection.target) return; // No self-connections
    setPendingConnection(connection);
  }, []);

  const handleEdgeCreate = useCallback(async (explanation: string) => {
    if (!pendingConnection?.source || !pendingConnection?.target) return;

    const fromId = parseInt(pendingConnection.source);
    const toId = parseInt(pendingConnection.target);

    try {
      const res = await fetch('/api/edges', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from_node_id: fromId,
          to_node_id: toId,
          source: 'user',
          explanation,
          created_via: 'ui',
        }),
      });

      if (res.ok) {
        const payload = await res.json();
        const edge = payload.data;
        if (edge?.id) {
          // Add to DB edges (SSE may also add it, dedup in handler)
          setDbEdges(prev => {
            if (prev.some(e => e.id === edge.id)) return prev;
            return [...prev, edge];
          });
        }
      }
    } catch (err) {
      console.error('Failed to create edge:', err);
    }

    setPendingConnection(null);
  }, [pendingConnection]);

  const handleEdgeCancel = useCallback(() => {
    setPendingConnection(null);
  }, []);

  // Get source/target titles for modal
  const pendingSourceTitle = pendingConnection?.source
    ? allDbNodes.find(n => n.id === parseInt(pendingConnection.source!))?.title || 'Unknown'
    : '';
  const pendingTargetTitle = pendingConnection?.target
    ? allDbNodes.find(n => n.id === parseInt(pendingConnection.target!))?.title || 'Unknown'
    : '';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'transparent', overflow: 'hidden' }}>
      <PaneHeader slot={slot} onCollapse={onCollapse} onSwapPanes={onSwapPanes} tabBar={tabBar}>
        {/* Dimension filter dropdown */}
        <div ref={dropdownRef} style={{ position: 'relative' }}>
          <button
            onClick={() => setDimensionDropdownOpen(!dimensionDropdownOpen)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 10px',
              background: selectedDimension ? 'rgba(136, 136, 136, 0.1)' : 'transparent',
              border: '1px solid',
              borderColor: selectedDimension ? 'rgba(136, 136, 136, 0.3)' : '#2a2a2a',
              borderRadius: '6px',
              color: selectedDimension ? '#ccc' : '#888',
              fontSize: '12px',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            <span>{selectedDimension || 'All dimensions'}</span>
            <ChevronDown size={12} style={{
              transform: dimensionDropdownOpen ? 'rotate(180deg)' : 'rotate(0deg)',
              transition: 'transform 0.15s ease',
            }} />
          </button>

          {dimensionDropdownOpen && (
            <div style={{
              position: 'absolute',
              top: '100%',
              left: 0,
              marginTop: '4px',
              background: '#1a1a1a',
              border: '1px solid #2a2a2a',
              borderRadius: '8px',
              padding: '4px',
              minWidth: '180px',
              maxHeight: '300px',
              overflowY: 'auto',
              zIndex: 1000,
              boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
            }}>
              <button
                onClick={() => { setSelectedDimension(null); setDimensionDropdownOpen(false); }}
                style={{
                  display: 'flex', alignItems: 'center', width: '100%', padding: '8px 12px',
                  background: !selectedDimension ? '#2a2a2a' : 'transparent',
                  border: 'none', borderRadius: '4px',
                  color: !selectedDimension ? '#fff' : '#888',
                  fontSize: '12px', cursor: 'pointer', textAlign: 'left',
                }}
              >
                All dimensions
                {!selectedDimension && <span style={{ marginLeft: 'auto', color: '#ccc' }}>&#10003;</span>}
              </button>

              {lockedDimensions.map(dim => (
                <button
                  key={dim.dimension}
                  onClick={() => { setSelectedDimension(dim.dimension); setDimensionDropdownOpen(false); }}
                  style={{
                    display: 'flex', alignItems: 'center', width: '100%', padding: '8px 12px',
                    background: selectedDimension === dim.dimension ? '#2a2a2a' : 'transparent',
                    border: 'none', borderRadius: '4px',
                    color: selectedDimension === dim.dimension ? '#fff' : '#888',
                    fontSize: '12px', cursor: 'pointer', textAlign: 'left',
                  }}
                  onMouseEnter={e => {
                    if (selectedDimension !== dim.dimension) {
                      e.currentTarget.style.background = '#222';
                      e.currentTarget.style.color = '#ccc';
                    }
                  }}
                  onMouseLeave={e => {
                    if (selectedDimension !== dim.dimension) {
                      e.currentTarget.style.background = 'transparent';
                      e.currentTarget.style.color = '#888';
                    }
                  }}
                >
                  {dim.dimension}
                  {selectedDimension === dim.dimension && <span style={{ marginLeft: 'auto', color: '#ccc' }}>&#10003;</span>}
                </button>
              ))}
            </div>
          )}
        </div>
      </PaneHeader>

      {/* Map content */}
      <div style={{ position: 'relative', flex: 1, background: '#080808' }}>
        {loading ? (
          <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#666' }}>
            Loading map...
          </div>
        ) : error ? (
          <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ef4444' }}>
            {error}
          </div>
        ) : rfNodes.length === 0 ? (
          <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#666' }}>
            No nodes to display
          </div>
        ) : (
          <div className="rah-map-wrapper" style={{ width: '100%', height: '100%' }}>
            <ReactFlow
              nodes={rfNodes}
              edges={rfEdges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onNodeClick={onNodeClickHandler}
              onNodeDoubleClick={onNodeDoubleClick}
              onNodeDragStop={onNodeDragStop}
              onConnect={isReadOnly ? undefined : onConnect}
              nodeTypes={nodeTypes}
              fitView
              fitViewOptions={{ padding: 0.2 }}
              minZoom={0.1}
              maxZoom={3}
              defaultEdgeOptions={{ type: 'default' }}
              proOptions={{ hideAttribution: true }}
              colorMode="dark"
            >
              <Background color="#1a1a1a" gap={40} size={1} />
            </ReactFlow>

            {/* Selected node info panel */}
            {selectedDbNode && (
              <div style={infoPanel}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: 8 }}>
                  <div style={{ fontWeight: 600, fontSize: 14, color: '#e5e7eb' }}>
                    {selectedDbNode.title || 'Untitled'}
                  </div>
                  <button
                    onClick={() => setSelectedNodeId(null)}
                    style={{ background: 'none', border: 'none', color: '#666', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}
                  >
                    &times;
                  </button>
                </div>
                <div style={{ fontSize: 12, color: '#666', marginBottom: 8 }}>
                  {connectedNodeIds.size} connected nodes
                </div>
                <div style={{ fontSize: 11, color: '#888', marginBottom: 8 }}>
                  Click a connected node to traverse &middot; Double-click to open
                </div>
                {selectedDbNode.dimensions && selectedDbNode.dimensions.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
                    {selectedDbNode.dimensions.slice(0, 5).map(dim => (
                      <span
                        key={dim}
                        style={{
                          padding: '2px 8px', borderRadius: 999, fontSize: 11,
                          background: lockedDimensionNames.has(dim) ? '#132018' : '#1a1a1a',
                          color: lockedDimensionNames.has(dim) ? '#86efac' : '#888',
                        }}
                      >
                        {dim}
                      </span>
                    ))}
                  </div>
                )}
                <button
                  onClick={() => onNodeClick?.(selectedDbNode.id)}
                  style={{
                    marginTop: 4, padding: '8px 12px', background: '#333', color: '#e5e5e5',
                    border: 'none', borderRadius: '6px', fontSize: 12, fontWeight: 500,
                    cursor: 'pointer', width: '100%',
                  }}
                >
                  Open Node
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Edge creation explanation modal */}
      {pendingConnection && (
        <EdgeExplanationModal
          sourceTitle={pendingSourceTitle}
          targetTitle={pendingTargetTitle}
          onSubmit={handleEdgeCreate}
          onCancel={handleEdgeCancel}
        />
      )}
    </div>
  );
}

// Wrap with ReactFlowProvider
export default function MapPane(props: MapPaneProps) {
  return (
    <ReactFlowProvider>
      <MapPaneInner {...props} />
    </ReactFlowProvider>
  );
}

const infoPanel: CSSProperties = {
  position: 'absolute',
  bottom: 16,
  left: 16,
  width: 260,
  background: '#0a0a0a',
  border: '1px solid #1f1f1f',
  borderRadius: 8,
  padding: 14,
  zIndex: 10,
};
