"use client";

import { useState, useEffect, useCallback } from 'react';
import {
  ChevronRight,
  ChevronDown,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  Plus,
  Settings,
} from 'lucide-react';
import { Node, NodeType } from '@/types/database';

const isReadOnly = process.env.NEXT_PUBLIC_READONLY_MODE === 'true';

interface TypeCount {
  type: string;
  count: number;
}

interface LeftTypePanelProps {
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  selectedType: string | null;
  onTypeSelect: (type: string | null) => void;
  onNodeSelect: (nodeId: number) => void;
  onSearchClick: () => void;
  onAddClick: () => void;
  onSettingsClick: () => void;
}

export default function LeftTypePanel({
  isCollapsed,
  onToggleCollapse,
  selectedType,
  onTypeSelect,
  onNodeSelect,
  onSearchClick,
  onAddClick,
  onSettingsClick,
}: LeftTypePanelProps) {
  const [typeCounts, setTypeCounts] = useState<TypeCount[]>([]);
  const [expandedTypes, setExpandedTypes] = useState<Set<string>>(new Set());
  const [typeNodes, setTypeNodes] = useState<Record<string, Node[]>>({});
  const [loadingTypes, setLoadingTypes] = useState<Set<string>>(new Set());
  const [hoveredType, setHoveredType] = useState<string | null>(null);
  const [hoveredNode, setHoveredNode] = useState<number | null>(null);

  // Fetch type counts
  useEffect(() => {
    const fetchTypes = async () => {
      try {
        const res = await fetch('/api/types');
        if (res.ok) {
          const data = await res.json();
          if (data.success) {
            setTypeCounts(data.data);
          }
        }
      } catch (error) {
        console.error('Failed to fetch type counts:', error);
      }
    };
    fetchTypes();
  }, []);

  // Fetch nodes for a type when expanded
  const fetchNodesForType = useCallback(async (type: string) => {
    if (typeNodes[type]) return;
    setLoadingTypes(prev => new Set(prev).add(type));
    try {
      const res = await fetch(`/api/nodes?type=${encodeURIComponent(type)}&limit=50`);
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setTypeNodes(prev => ({ ...prev, [type]: data.data }));
        }
      }
    } catch (error) {
      console.error(`Failed to fetch nodes for type ${type}:`, error);
    } finally {
      setLoadingTypes(prev => {
        const next = new Set(prev);
        next.delete(type);
        return next;
      });
    }
  }, [typeNodes]);

  const handleTypeClick = useCallback((type: string) => {
    // Toggle expansion
    setExpandedTypes(prev => {
      const next = new Set(prev);
      if (next.has(type)) {
        next.delete(type);
      } else {
        next.add(type);
        fetchNodesForType(type);
      }
      return next;
    });
    // Set selected type
    onTypeSelect(type === selectedType ? null : type);
  }, [selectedType, onTypeSelect, fetchNodesForType]);

  const handleNodeClick = useCallback((nodeId: number) => {
    onNodeSelect(nodeId);
  }, [onNodeSelect]);

  // Collapsed state - minimal icon rail
  if (isCollapsed) {
    return (
      <div
        style={{
          width: '48px',
          height: '100%',
          background: '#0a0a0a',
          borderRight: '1px solid #1a1a1a',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          paddingTop: '12px',
          gap: '8px',
          flexShrink: 0,
        }}
      >
        <button
          onClick={onToggleCollapse}
          title="Expand panel"
          style={{
            width: '32px',
            height: '32px',
            borderRadius: '6px',
            border: 'none',
            background: 'transparent',
            color: '#666',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <PanelLeftOpen size={16} />
        </button>
        <button
          onClick={onSearchClick}
          title="Search (Cmd+K)"
          style={{
            width: '32px',
            height: '32px',
            borderRadius: '6px',
            border: 'none',
            background: 'transparent',
            color: '#666',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Search size={16} />
        </button>
        {!isReadOnly && (
          <>
            <button
              onClick={onAddClick}
              title="Add"
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '6px',
                border: 'none',
                background: 'transparent',
                color: '#666',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Plus size={16} />
            </button>
          </>
        )}
        <div style={{ flex: 1 }} />
        {!isReadOnly && (
          <button
            onClick={onSettingsClick}
            title="Settings"
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '6px',
              border: 'none',
              background: 'transparent',
              color: '#666',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: '12px',
            }}
          >
            <Settings size={16} />
          </button>
        )}
      </div>
    );
  }

  // Expanded state
  return (
    <div
      style={{
        width: '260px',
        height: '100%',
        background: '#0a0a0a',
        borderRight: '1px solid #1a1a1a',
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0,
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '12px 12px 8px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '1px solid #1a1a1a',
        }}
      >
        <span
          className="font-display"
          style={{
            fontSize: '13px',
            fontWeight: 600,
            color: '#999',
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
          }}
        >
          Latent Space
        </span>
        <button
          onClick={onToggleCollapse}
          title="Collapse panel"
          style={{
            width: '28px',
            height: '28px',
            borderRadius: '6px',
            border: 'none',
            background: 'transparent',
            color: '#666',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <PanelLeftClose size={14} />
        </button>
      </div>

      {/* Actions row */}
      <div
        style={{
          padding: '8px 8px',
          display: 'flex',
          gap: '4px',
        }}
      >
        <button
          onClick={onSearchClick}
          style={{
            flex: 1,
            height: '30px',
            borderRadius: '6px',
            border: '1px solid #1a1a1a',
            background: '#111',
            color: '#666',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '0 8px',
            fontSize: '12px',
          }}
        >
          <Search size={12} />
          <span>Search</span>
          <span style={{ marginLeft: 'auto', fontSize: '10px', color: '#444' }}>&#8984;K</span>
        </button>
        {!isReadOnly && (
          <button
            onClick={onAddClick}
            title="Add"
            style={{
              width: '30px',
              height: '30px',
              borderRadius: '6px',
              border: '1px solid #1a1a1a',
              background: '#111',
              color: '#666',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Plus size={14} />
          </button>
        )}
      </div>

      {/* Type folders */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '4px 0',
        }}
      >
        {typeCounts.length === 0 && (
          <div style={{ padding: '24px 16px', color: '#555', fontSize: '12px', textAlign: 'center' }}>
            No types found
          </div>
        )}
        {typeCounts.map(({ type, count }) => {
          const isExpanded = expandedTypes.has(type);
          const isSelected = selectedType === type;
          const isHovered = hoveredType === type;
          const isLoading = loadingTypes.has(type);
          const nodes = typeNodes[type] || [];

          return (
            <div key={type}>
              {/* Type folder header */}
              <button
                onClick={() => handleTypeClick(type)}
                onMouseEnter={() => setHoveredType(type)}
                onMouseLeave={() => setHoveredType(null)}
                style={{
                  width: '100%',
                  padding: '6px 12px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  background: isSelected ? '#151515' : (isHovered ? '#0f0f0f' : 'transparent'),
                  border: 'none',
                  borderLeft: isSelected ? '2px solid #666' : '2px solid transparent',
                  color: isSelected ? '#e5e5e5' : '#999',
                  cursor: 'pointer',
                  fontSize: '13px',
                  textAlign: 'left',
                  transition: 'background 0.1s, color 0.1s',
                }}
                aria-expanded={isExpanded}
                aria-label={`${type} - ${count} nodes`}
              >
                {isExpanded ? (
                  <ChevronDown size={14} style={{ flexShrink: 0, color: '#555' }} />
                ) : (
                  <ChevronRight size={14} style={{ flexShrink: 0, color: '#555' }} />
                )}
                <span style={{ flex: 1, textTransform: 'capitalize' }}>{type}</span>
                <span
                  style={{
                    fontSize: '11px',
                    color: '#555',
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {count}
                </span>
              </button>

              {/* Expanded node list */}
              {isExpanded && (
                <div style={{ paddingLeft: '20px' }}>
                  {isLoading && (
                    <div style={{ padding: '8px 12px', color: '#444', fontSize: '11px' }}>
                      Loading...
                    </div>
                  )}
                  {!isLoading && nodes.length === 0 && (
                    <div style={{ padding: '8px 12px', color: '#444', fontSize: '11px' }}>
                      No nodes
                    </div>
                  )}
                  {nodes.map((node) => (
                    <button
                      key={node.id}
                      onClick={() => handleNodeClick(node.id)}
                      onMouseEnter={() => setHoveredNode(node.id)}
                      onMouseLeave={() => setHoveredNode(null)}
                      style={{
                        width: '100%',
                        padding: '4px 12px',
                        display: 'block',
                        background: hoveredNode === node.id ? '#111' : 'transparent',
                        border: 'none',
                        color: '#aaa',
                        cursor: 'pointer',
                        fontSize: '12px',
                        textAlign: 'left',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        transition: 'background 0.1s',
                      }}
                      title={node.title}
                    >
                      {node.title}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Bottom settings */}
      {!isReadOnly && (
        <div
          style={{
            padding: '8px 12px',
            borderTop: '1px solid #1a1a1a',
          }}
        >
          <button
            onClick={onSettingsClick}
            style={{
              width: '100%',
              height: '30px',
              borderRadius: '6px',
              border: 'none',
              background: 'transparent',
              color: '#666',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '0 8px',
              fontSize: '12px',
            }}
          >
            <Settings size={14} />
            <span>Settings</span>
          </button>
        </div>
      )}
    </div>
  );
}
