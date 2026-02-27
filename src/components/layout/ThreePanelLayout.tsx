"use client";

import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import SettingsModal, { SettingsTab } from '../settings/SettingsModal';
import SearchModal from '../nodes/SearchModal';
import { Node } from '@/types/database';
import { DatabaseEvent } from '@/services/events';
import { usePersistentState } from '@/hooks/usePersistentState';
import { getYouTubeThumbnail } from '@/utils/thumbnails';

const isReadOnly = process.env.NEXT_PUBLIC_READONLY_MODE === 'true';

// Layout components
import LeftTypePanel from './LeftTypePanel';
import MainViewSwitcher, { MainView } from './MainViewSwitcher';

// Content pane components
import { NodePane, MapPane, ViewsPane } from '../panes';
import Dashboard from '../dashboard/Dashboard';
import QuickAddInput from '../agents/QuickAddInput';

// ─── Type View: list of nodes for selected type ──────────────────────────────

function formatAbsoluteDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatRelativeDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return 'today';
  if (diffDays === 1) return 'yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
  if (diffDays < 365) return `${Math.floor(diffDays / 30)}mo ago`;
  return `${Math.floor(diffDays / 365)}y ago`;
}

function TypeNodeList({
  selectedType,
  onNodeClick,
}: {
  selectedType: string | null;
  onNodeClick: (nodeId: number) => void;
}) {
  const [nodes, setNodes] = useState<Node[]>([]);
  const [loading, setLoading] = useState(false);
  const [hoveredId, setHoveredId] = useState<number | null>(null);

  useEffect(() => {
    if (!selectedType) {
      setNodes([]);
      return;
    }
    setLoading(true);
    fetch(`/api/nodes?type=${encodeURIComponent(selectedType)}&limit=100&sortBy=event_date`)
      .then(res => res.json())
      .then(data => {
        if (data.success) setNodes(data.data);
      })
      .catch(err => console.error('Failed to fetch type nodes:', err))
      .finally(() => setLoading(false));
  }, [selectedType]);

  if (!selectedType) {
    return (
      <div style={{
        flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: '#444', fontSize: '13px', flexDirection: 'column', gap: '6px',
      }}>
        <div style={{ color: '#555' }}>Select a type from the left panel</div>
        <div style={{ fontSize: '12px', color: '#3a3a3a' }}>or switch to Feed or Map view</div>
      </div>
    );
  }

  if (loading) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#444', fontSize: '13px' }}>
        Loading...
      </div>
    );
  }

  if (nodes.length === 0) {
    return (
      <div style={{
        flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: '#444', fontSize: '13px',
      }}>
        No {selectedType} nodes yet
      </div>
    );
  }

  return (
    <div style={{ flex: 1, overflowY: 'auto' }}>
      {/* Header */}
      <div style={{
        padding: '16px 24px 12px',
        display: 'flex',
        alignItems: 'baseline',
        justifyContent: 'space-between',
        borderBottom: '1px solid #1a1a1a',
      }}>
        <span style={{ fontSize: '13px', fontWeight: 600, color: '#999', textTransform: 'capitalize' }}>
          {selectedType}
        </span>
        <span style={{ fontSize: '11px', color: '#444' }}>
          {nodes.length} node{nodes.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Node list */}
      <div style={{ padding: '4px 0' }}>
        {nodes.map(node => {
          const isHovered = hoveredId === node.id;
          const dims = node.dimensions?.slice(0, 3) || [];
          const edgeCount = node.edge_count ?? 0;
          const dateStr = node.event_date || node.updated_at || node.created_at;
          const formattedDate = dateStr
            ? (node.event_date ? formatAbsoluteDate(dateStr) : formatRelativeDate(dateStr))
            : '';
          const thumb = getYouTubeThumbnail(node.link);

          return (
            <button
              key={node.id}
              onClick={() => onNodeClick(node.id)}
              onMouseEnter={() => setHoveredId(node.id)}
              onMouseLeave={() => setHoveredId(null)}
              style={{
                width: '100%',
                display: 'flex',
                gap: '12px',
                padding: '12px 24px',
                background: isHovered ? '#161616' : 'transparent',
                border: 'none',
                borderBottom: '1px solid #161616',
                color: '#ccc',
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'background 0.12s ease',
                alignItems: 'flex-start',
              }}
            >
              {/* Thumbnail */}
              {thumb && (
                <img
                  src={thumb}
                  alt=""
                  loading="lazy"
                  style={{
                    width: '96px',
                    height: '54px',
                    objectFit: 'cover',
                    borderRadius: '4px',
                    flexShrink: 0,
                    background: '#1a1a1a',
                    marginTop: '2px',
                  }}
                />
              )}

              {/* Text content */}
              <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {/* Title */}
              <div style={{
                fontSize: '13px',
                fontWeight: 500,
                color: isHovered ? '#fff' : '#e0e0e0',
                lineHeight: 1.4,
                transition: 'color 0.12s ease',
              }}>
                {node.title}
              </div>

              {/* Description */}
              {node.description && (
                <div style={{
                  fontSize: '12px',
                  color: '#666',
                  lineHeight: 1.4,
                  overflow: 'hidden',
                  display: '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical',
                }}>
                  {node.description}
                </div>
              )}

              {/* Metadata row */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                flexWrap: 'wrap',
                marginTop: '2px',
              }}>
                {/* Date */}
                {formattedDate && (
                  <span style={{ fontSize: '11px', color: '#444' }}>
                    {formattedDate}
                  </span>
                )}

                {/* Edge count */}
                {edgeCount > 0 && (
                  <span style={{
                    fontSize: '11px',
                    color: '#444',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '3px',
                  }}>
                    <span style={{ fontSize: '9px' }}>&#9679;</span>
                    {edgeCount} edge{edgeCount !== 1 ? 's' : ''}
                  </span>
                )}

                {/* Dimensions */}
                {dims.length > 0 && (
                  <div style={{ display: 'flex', gap: '4px', marginLeft: 'auto' }}>
                    {dims.map(dim => (
                      <span
                        key={dim}
                        style={{
                          fontSize: '10px',
                          color: '#555',
                          background: '#1a1a1a',
                          padding: '1px 6px',
                          borderRadius: '3px',
                          border: '1px solid #222',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {dim}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              </div>{/* close text content wrapper */}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Main Layout ─────────────────────────────────────────────────────────────
export default function ThreePanelLayout() {
  const containerRef = useRef<HTMLDivElement>(null);

  // ── New simple state model ──
  const [isLeftPanelCollapsed, setIsLeftPanelCollapsed] = usePersistentState<boolean>('ui.leftPanel.collapsed', false);
  const [activeView, setActiveView] = usePersistentState<MainView>('ui.activeView', 'dashboard');
  const [selectedType, setSelectedType] = usePersistentState<string | null>('ui.selectedType', null);

  // Always land on Dashboard on a fresh page load.
  useEffect(() => {
    setActiveView('dashboard');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Node focus state
  const [openTabs, setOpenTabs] = useState<number[]>([]);
  const [activeTab, setActiveTab] = useState<number | null>(null);
  const [focusedNodeId, setFocusedNodeId] = useState<number | null>(null);

  // Settings modal state
  const [showSettings, setShowSettings] = useState(false);
  const [settingsInitialTab, setSettingsInitialTab] = useState<SettingsTab>();
  const handleCloseSettings = useCallback(() => {
    setShowSettings(false);
    setSettingsInitialTab(undefined);
  }, []);

  // Search modal state
  const [showSearchModal, setShowSearchModal] = useState(false);

  // Add Stuff modal state
  const [showAddStuff, setShowAddStuff] = useState(false);

  // SSE refresh triggers
  const [nodesPanelRefresh, setNodesPanelRefresh] = useState(0);
  const [focusPanelRefresh, setFocusPanelRefresh] = useState(0);

  // Highlighted passage context for source awareness
  const [highlightedPassage, setHighlightedPassage] = useState<{
    nodeId: number;
    nodeTitle: string;
    selectedText: string;
  } | null>(null);

  // Track open tabs in a ref for SSE handler
  const openTabsRef = useRef<number[]>([]);
  useEffect(() => { openTabsRef.current = openTabs; }, [openTabs]);

  // ── Keyboard shortcuts ──
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setShowSearchModal(true);
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'n') {
        if (document.activeElement?.closest('[data-rah-app]')) {
          e.preventDefault();
          setShowAddStuff(true);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // ── SSE connection ──
  useEffect(() => {
    let eventSource: EventSource | null = null;

    try {
      eventSource = new EventSource('/api/events');
      eventSource.onmessage = (event) => {
        try {
          const data: DatabaseEvent = JSON.parse(event.data);
          switch (data.type) {
            case 'NODE_CREATED':
              setNodesPanelRefresh(prev => prev + 1);
              break;
            case 'NODE_UPDATED': {
              const updatedNodeId = Number(data.data.nodeId);
              if (openTabsRef.current.includes(updatedNodeId)) {
                setFocusPanelRefresh(prev => prev + 1);
              }
              setNodesPanelRefresh(prev => prev + 1);
              break;
            }
            case 'NODE_DELETED':
              handleCloseTab(data.data.nodeId);
              setNodesPanelRefresh(prev => prev + 1);
              break;
            case 'EDGE_CREATED':
            case 'EDGE_DELETED':
              if (openTabsRef.current.includes(data.data.fromNodeId) ||
                  openTabsRef.current.includes(data.data.toNodeId)) {
                setFocusPanelRefresh(prev => prev + 1);
              }
              break;
            case 'DIMENSION_UPDATED':
              setNodesPanelRefresh(prev => prev + 1);
              break;
            case 'GUIDE_UPDATED':
              if (typeof window !== 'undefined') {
                window.dispatchEvent(new CustomEvent('guides:updated', { detail: data.data }));
              }
              break;
            case 'HELPER_UPDATED':
            case 'AGENT_UPDATED':
              if (typeof window !== 'undefined') {
                window.dispatchEvent(new CustomEvent('agents:updated', { detail: data.data }));
              }
              break;
          }
        } catch (error) {
          console.error('Failed to parse SSE event:', error);
        }
      };
      eventSource.onerror = (error) => {
        console.error('SSE connection error:', error);
      };
    } catch (error) {
      console.error('Failed to establish SSE connection:', error);
    }

    return () => {
      if (eventSource) eventSource.close();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Node opening / tab management ──
  const handleNodeSelect = useCallback((nodeId: number) => {
    setFocusedNodeId(nodeId);
    setOpenTabs(prev => {
      if (prev.includes(nodeId)) return prev;
      return [...prev, nodeId];
    });
    setActiveTab(nodeId);
  }, []);

  const handleTabSelect = useCallback((tabId: number) => {
    setActiveTab(tabId);
    setFocusedNodeId(tabId);
  }, []);

  const handleCloseTab = useCallback((tabId: number) => {
    setOpenTabs(prev => {
      const newTabs = prev.filter(id => id !== tabId);
      // If we closed the active tab, activate the nearest remaining
      if (activeTab === tabId && newTabs.length > 0) {
        const idx = Math.min(prev.indexOf(tabId), newTabs.length - 1);
        setActiveTab(newTabs[idx]);
        setFocusedNodeId(newTabs[idx]);
      } else if (newTabs.length === 0) {
        setActiveTab(null);
        setFocusedNodeId(null);
      }
      return newTabs;
    });
  }, [activeTab]);

  const handleReorderTabs = useCallback((fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex) return;
    setOpenTabs(prev => {
      const updated = [...prev];
      const [moved] = updated.splice(fromIndex, 1);
      updated.splice(toIndex, 0, moved);
      return updated;
    });
  }, []);

  const handleNodeCreated = useCallback((newNode: Node) => {
    setOpenTabs(prev => prev.includes(newNode.id) ? prev : [...prev, newNode.id]);
    setActiveTab(newNode.id);
    setFocusedNodeId(newNode.id);
  }, []);

  // Handle Quick Add submit
  const handleQuickAddSubmit = useCallback(async ({ input, mode, description }: { input: string; mode: 'link' | 'note' | 'chat'; description?: string }) => {
    try {
      const response = await fetch('/api/quick-add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input, mode, description })
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to submit Quick Add');
      }
      setShowAddStuff(false);
    } catch (error) {
      console.error('[ThreePanelLayout] Quick Add error:', error);
    }
  }, []);

  // Handle search result selection
  const handleSearchNodeSelect = useCallback((nodeId: number) => {
    handleNodeSelect(nodeId);
    setShowSearchModal(false);
  }, [handleNodeSelect]);

  // Determine if we're showing a focused node (node detail view)
  const showingFocusedNode = activeTab !== null && openTabs.length > 0;

  // ── Render main workspace content ──
  const renderMainContent = () => {
    // If a node is focused, show it
    if (showingFocusedNode) {
      return (
        <NodePane
          slot="A"
          isActive={true}
          openTabs={openTabs}
          activeTab={activeTab}
          onTabSelect={handleTabSelect}
          onTabClose={handleCloseTab}
          onNodeClick={handleNodeSelect}
          onReorderTabs={handleReorderTabs}
          refreshTrigger={focusPanelRefresh}
          onTextSelect={(nodeId, nodeTitle, text) => {
            setHighlightedPassage({ nodeId, nodeTitle, selectedText: text });
          }}
          highlightedPassage={highlightedPassage}
        />
      );
    }

    // Otherwise render the active view
    switch (activeView) {
      case 'dashboard':
        return (
          <Dashboard
            onCategoryClick={(categoryKey) => {
              setSelectedType(categoryKey);
              setActiveView('type');
            }}
            onNodeClick={handleNodeSelect}
          />
        );

      case 'type':
        return (
          <TypeNodeList
            selectedType={selectedType}
            onNodeClick={handleNodeSelect}
          />
        );

      case 'feed':
        return (
          <ViewsPane
            slot="A"
            isActive={true}
            onNodeClick={handleNodeSelect}
            refreshToken={nodesPanelRefresh}
          />
        );

      case 'map':
        return (
          <MapPane
            slot="A"
            isActive={true}
            onNodeClick={handleNodeSelect}
            activeTabId={activeTab}
          />
        );

      default:
        return null;
    }
  };

  return (
    <div
      ref={containerRef}
      data-rah-app
      style={{
        display: 'flex',
        height: '100vh',
        width: '100vw',
        background: '#0a0a0a',
        overflow: 'hidden',
      }}
    >
      {/* Left Type Panel */}
      <LeftTypePanel
        isCollapsed={isLeftPanelCollapsed}
        onToggleCollapse={() => setIsLeftPanelCollapsed(prev => !prev)}
        selectedType={selectedType}
        onTypeSelect={(type) => {
          setSelectedType(type);
          if (type) {
            setActiveView('type');
            // Clear focused node when switching types
            if (showingFocusedNode) {
              setActiveTab(null);
              setFocusedNodeId(null);
            }
          }
        }}
        onNodeSelect={handleNodeSelect}
        onSearchClick={() => setShowSearchModal(true)}
        onAddClick={() => setShowAddStuff(true)}
        onSettingsClick={() => {
          setSettingsInitialTab(undefined);
          setShowSettings(true);
        }}
      />

      {/* Main Workspace */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Top view switcher */}
        <MainViewSwitcher
          activeView={activeView}
          onViewChange={(view) => {
            setActiveView(view);
            // Clear focused node when switching views
            if (showingFocusedNode) {
              setActiveTab(null);
              setFocusedNodeId(null);
            }
          }}
          selectedType={selectedType}
        />

        {/* Workspace content */}
        <div
          style={{
            flex: 1,
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            background: '#111',
            margin: '0 8px 8px 0',
            borderRadius: '8px',
          }}
        >
          {renderMainContent()}
        </div>
      </div>

      {/* Search Modal */}
      <SearchModal
        isOpen={showSearchModal}
        onClose={() => setShowSearchModal(false)}
        onNodeSelect={handleSearchNodeSelect}
        existingFilters={[]}
      />

      {/* Settings Modal */}
      {!isReadOnly && (
        <SettingsModal
          isOpen={showSettings}
          onClose={handleCloseSettings}
          initialTab={settingsInitialTab}
        />
      )}

      {/* Add Stuff Modal */}
      {!isReadOnly && (
        <QuickAddInput
          isOpen={showAddStuff}
          onClose={() => setShowAddStuff(false)}
          onSubmit={handleQuickAddSubmit}
        />
      )}
    </div>
  );
}
