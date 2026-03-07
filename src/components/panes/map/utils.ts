import type { Node as DbNode, Edge as DbEdge } from '@/types/database';
import type { Node as RFNode, Edge as RFEdge } from '@xyflow/react';

export interface MapNodeData {
  label: string;
  dimensions: string[];
  edgeCount: number;
  isExpanded: boolean;
  dbNode: DbNode;
  [key: string]: unknown;
}

const NODE_LIMIT = 200;
const LABEL_THRESHOLD = 15;

export { NODE_LIMIT, LABEL_THRESHOLD };

/**
 * Get node position from saved metadata or calculate using Fibonacci spiral.
 */
export function getNodePosition(
  node: DbNode,
  index: number,
  total: number,
  centerX: number,
  centerY: number,
  maxEdges: number,
): { x: number; y: number } {
  // Check for saved position in metadata
  const metadata = typeof node.metadata === 'string'
    ? safeParseJSON(node.metadata)
    : node.metadata;
  const savedPos = metadata?.map_position;
  if (savedPos?.x !== undefined && savedPos?.y !== undefined) {
    return { x: savedPos.x, y: savedPos.y };
  }

  // Fibonacci spiral layout
  const edgeCount = node.edge_count ?? 0;
  const edgeRatio = maxEdges > 0 ? edgeCount / maxEdges : 0;

  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  const angle = index * goldenAngle;

  const isLabeled = index < LABEL_THRESHOLD;
  const labelSpacing = isLabeled ? 60 : 0;
  const containerSize = Math.min(centerX * 2, centerY * 2);
  const baseDistance = 80 + labelSpacing + (1 - edgeRatio) * containerSize * 0.35;
  const distance = baseDistance + index * 4;

  return {
    x: centerX + Math.cos(angle) * distance,
    y: centerY + Math.sin(angle) * distance,
  };
}

/**
 * Position expanded (traversal) nodes in a circle around a reference node.
 */
export function getExpandedNodePosition(
  index: number,
  total: number,
  refX: number,
  refY: number,
): { x: number; y: number } {
  const angle = (index / Math.max(total, 1)) * Math.PI * 2;
  const distance = 150 + (index % 3) * 40;
  return {
    x: refX + Math.cos(angle) * distance,
    y: refY + Math.sin(angle) * distance,
  };
}

/**
 * Transform DB nodes into React Flow nodes.
 * When a node is selected, non-connected nodes get dimmed via className.
 */
export function toRFNodes(
  baseNodes: DbNode[],
  expandedNodes: DbNode[],
  centerX: number,
  centerY: number,
  selectedNodeId: number | null,
  connectedNodeIds: Set<number>,
  existingPositions: Map<string, { x: number; y: number }>,
): RFNode<MapNodeData>[] {
  const sortedBase = [...baseNodes].sort((a, b) => (b.edge_count ?? 0) - (a.edge_count ?? 0));
  const maxEdges = Math.max(...sortedBase.map(n => n.edge_count ?? 0), 1);
  const baseNodeIds = new Set(baseNodes.map(n => n.id));
  const hasSelection = selectedNodeId !== null;

  const rfNodes: RFNode<MapNodeData>[] = sortedBase.map((node, index) => {
    const id = String(node.id);
    // Prefer React Flow's current position (for drag state), then saved, then calculated
    const existingPos = existingPositions.get(id);
    const pos = existingPos || getNodePosition(node, index, sortedBase.length, centerX, centerY, maxEdges);

    // Dim nodes that aren't selected or connected to selection
    const isDimmed = hasSelection && node.id !== selectedNodeId && !connectedNodeIds.has(node.id);

    return {
      id,
      type: 'mapNode',
      position: pos,
      className: isDimmed ? 'dimmed' : undefined,
      data: {
        label: node.title || 'Untitled',
        dimensions: node.dimensions || [],
        edgeCount: node.edge_count ?? 0,
        isExpanded: false,
        dbNode: node,
      },
    };
  });

  // Add expanded nodes not already in base
  const uniqueExpanded = expandedNodes.filter(n => !baseNodeIds.has(n.id));

  // Find reference position for expanded nodes (the selected node)
  let refX = centerX;
  let refY = centerY;
  if (selectedNodeId) {
    const selectedRF = rfNodes.find(n => n.id === String(selectedNodeId));
    if (selectedRF) {
      refX = selectedRF.position.x;
      refY = selectedRF.position.y;
    }
  }

  uniqueExpanded.forEach((node, index) => {
    const id = String(node.id);
    const existingPos = existingPositions.get(id);

    // Check for saved metadata position
    const metadata = typeof node.metadata === 'string'
      ? safeParseJSON(node.metadata)
      : node.metadata;
    const savedPos = metadata?.map_position;

    const pos = existingPos
      || (savedPos?.x !== undefined ? { x: savedPos.x, y: savedPos.y } : null)
      || getExpandedNodePosition(index, uniqueExpanded.length, refX, refY);

    const isDimmed = hasSelection && node.id !== selectedNodeId && !connectedNodeIds.has(node.id);

    rfNodes.push({
      id,
      type: 'mapNode',
      position: pos,
      className: isDimmed ? 'dimmed' : undefined,
      data: {
        label: node.title || 'Untitled',
        dimensions: node.dimensions || [],
        edgeCount: node.edge_count ?? 0,
        isExpanded: true,
        dbNode: node,
      },
    });
  });

  return rfNodes;
}

/**
 * Transform DB edges into React Flow edges, filtering to only those
 * connecting nodes currently in the graph.
 * When a node is selected, connected edges are highlighted and others dimmed.
 */
export function toRFEdges(
  dbEdges: DbEdge[],
  nodeIds: Set<string>,
  selectedNodeId: number | null,
): RFEdge[] {
  const hasSelection = selectedNodeId !== null;

  return dbEdges
    .filter(e => nodeIds.has(String(e.from_node_id)) && nodeIds.has(String(e.to_node_id)))
    .map(e => {
      const isConnected = hasSelection && (
        e.from_node_id === selectedNodeId || e.to_node_id === selectedNodeId
      );
      const isDimmed = hasSelection && !isConnected;

      return {
        id: String(e.id),
        source: String(e.from_node_id),
        target: String(e.to_node_id),
        animated: isConnected,
        style: isConnected
          ? { stroke: 'var(--accent-primary)', strokeWidth: 2.5, opacity: 1 }
          : isDimmed
            ? { stroke: '#374151', strokeWidth: 1, opacity: 0.15 }
            : undefined,
        zIndex: isConnected ? 10 : 0,
      };
    });
}

function safeParseJSON(str: string | null | undefined): Record<string, unknown> | null {
  if (!str || str === 'null') return null;
  try {
    return JSON.parse(str);
  } catch {
    return null;
  }
}
