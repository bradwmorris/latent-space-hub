"use client";

import { memo } from 'react';
import { Handle, Position, type NodeProps, type Node } from '@xyflow/react';
import type { MapNodeData } from './utils';
import { LABEL_THRESHOLD } from './utils';

type MapNodeType = Node<MapNodeData, 'mapNode'>;

function MapNodeComponent({ data, selected }: NodeProps<MapNodeType>) {
  const { label, dimensions, edgeCount, isExpanded } = data;
  const isTop = !isExpanded && edgeCount > 3;

  return (
    <div
      className={[
        'ls-map-node',
        isExpanded && 'ls-map-node--expanded',
        isTop && 'ls-map-node--top',
        selected && 'ls-map-node--selected',
      ].filter(Boolean).join(' ')}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="ls-map-handle"
      />
      <div className="ls-map-node__title">
        {label.length > 28 ? label.slice(0, 26) + '\u2026' : label}
      </div>
      {(isTop || isExpanded) && dimensions.length > 0 && (
        <div className="ls-map-node__dims">
          {dimensions.slice(0, 3).map(d => d.length > 12 ? d.slice(0, 11) + '\u2026' : d).join(' \u00b7 ')}
        </div>
      )}
      <Handle
        type="source"
        position={Position.Bottom}
        className="ls-map-handle"
      />
    </div>
  );
}

export const MapNode = memo(MapNodeComponent);
