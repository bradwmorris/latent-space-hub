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
  BookOpen,
} from 'lucide-react';
import { Node } from '@/types/database';
import { CATEGORIES } from '@/config/categories';

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

  // Build a lookup map from API data
  const countMap: Record<string, number> = {};
  for (const tc of typeCounts) {
    countMap[tc.type] = tc.count;
  }

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
        <a
          href="/docs"
          title="Docs"
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
            textDecoration: 'none',
          }}
        >
          <BookOpen size={16} />
        </a>
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
            color: 'var(--accent-brand)',
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

      {/* Category list — fixed 8 categories in canonical order */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '4px 0',
        }}
      >
        {CATEGORIES.map(({ key, label, icon: Icon }) => {
          const count = countMap[key] || 0;
          const isExpanded = expandedTypes.has(key);
          const isSelected = selectedType === key;
          const isHovered = hoveredType === key;
          const isLoading = loadingTypes.has(key);
          const nodes = typeNodes[key] || [];
          const isDimmed = count === 0;

          return (
            <div key={key}>
              {/* Category header */}
              <button
                onClick={() => handleTypeClick(key)}
                onMouseEnter={() => setHoveredType(key)}
                onMouseLeave={() => setHoveredType(null)}
                style={{
                  width: '100%',
                  padding: '6px 12px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  background: isSelected ? '#151515' : (isHovered ? '#0f0f0f' : 'transparent'),
                  border: 'none',
                  borderLeft: isSelected ? '2px solid var(--accent-brand)' : '2px solid transparent',
                  color: isDimmed ? '#444' : (isSelected ? '#e5e5e5' : '#999'),
                  cursor: 'pointer',
                  fontSize: '13px',
                  textAlign: 'left',
                  transition: 'background 0.1s, color 0.1s',
                  opacity: isDimmed ? 0.5 : 1,
                }}
                aria-expanded={isExpanded}
                aria-label={`${label}, ${count} nodes`}
              >
                {isExpanded ? (
                  <ChevronDown size={14} style={{ flexShrink: 0, color: '#555' }} />
                ) : (
                  <ChevronRight size={14} style={{ flexShrink: 0, color: '#555' }} />
                )}
                <Icon size={14} style={{ flexShrink: 0 }} aria-hidden="true" />
                <span style={{ flex: 1 }}>{label}</span>
                <span
                  style={{
                    fontSize: '11px',
                    color: isDimmed ? '#333' : '#555',
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
                    <div style={{
                      padding: '8px 12px', color: '#444', fontSize: '11px',
                      animation: 'blockPulse 1.5s ease-in-out infinite',
                    }}>
                      {'▓▒░'} loading {'░▒▓'}
                    </div>
                  )}
                  {!isLoading && nodes.length === 0 && (
                    <div style={{ padding: '8px 12px', color: '#333', fontSize: '11px' }}>
                      {'── no nodes ──'}
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

      {/* Bottom actions */}
      <div
        style={{
          padding: '8px 12px',
          borderTop: '1px solid #1a1a1a',
          display: 'flex',
          flexDirection: 'column',
          gap: '2px',
        }}
      >
        <a
          href="/docs"
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
            textDecoration: 'none',
          }}
        >
          <BookOpen size={14} />
          <span>Docs</span>
        </a>
        {!isReadOnly && (
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
        )}
      </div>
    </div>
  );
}
