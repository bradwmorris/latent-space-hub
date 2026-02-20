"use client";

import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import SettingsModal, { SettingsTab } from '../settings/SettingsModal';
import SearchModal from '../nodes/SearchModal';
import { Node } from '@/types/database';
import { DatabaseEvent } from '@/services/events';
import { usePersistentState } from '@/hooks/usePersistentState';

const isReadOnly = process.env.NEXT_PUBLIC_READONLY_MODE === 'true';

// Layout components
import LeftTypePanel from './LeftTypePanel';
import MainViewSwitcher, { MainView } from './MainViewSwitcher';

// Content pane components
import { NodePane, MapPane, ViewsPane } from '../panes';
import QuickAddInput from '../agents/QuickAddInput';

// ─── Type View: list of nodes for selected type ──────────────────────────────
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
    fetch(`/api/nodes?type=${encodeURIComponent(selectedType)}&limit=100`)
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
        color: '#555', fontSize: '13px', flexDirection: 'column', gap: '8px',
      }}>
        <div>Select a type from the left panel</div>
        <div style={{ fontSize: '12px', color: '#444' }}>or switch to Feed or Map view</div>
      </div>
    );
  }

  if (loading) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#555' }}>
        Loading...
      </div>
    );
  }

  if (nodes.length === 0) {
    return (
      <div style={{
        flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: '#555', fontSize: '13px',
      }}>
        No nodes of type &ldquo;{selectedType}&rdquo;
      </div>
    );
  }

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
      {nodes.map(node => (
        <button
          key={node.id}
          onClick={() => onNodeClick(node.id)}
          onMouseEnter={() => setHoveredId(node.id)}
          onMouseLeave={() => setHoveredId(null)}
          style={{
            width: '100%',
            display: 'flex',
            flexDirection: 'column',
            gap: '2px',
            padding: '10px 20px',
            background: hoveredId === node.id ? '#151515' : 'transparent',
            border: 'none',
            borderBottom: '1px solid #141414',
            color: '#ccc',
            cursor: 'pointer',
            textAlign: 'left',
            transition: 'background 0.1s',
          }}
        >
          <div style={{ fontSize: '13px', fontWeight: 500, color: '#e5e5e5' }}>{node.title}</div>
          {node.description && (
            <div style={{
              fontSize: '12px', color: '#777', overflow: 'hidden',
              textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%',
            }}>
              {node.description}
            </div>
          )}
        </button>
      ))}
    </div>
  );
}

// ─── Main Layout ─────────────────────────────────────────────────────────────
export default function ThreePanelLayout() {
  const containerRef = useRef<HTMLDivElement>(null);

  // ── New simple state model ──
  const [isLeftPanelCollapsed, setIsLeftPanelCollapsed] = usePersistentState<boolean>('ui.leftPanel.collapsed', false);
  const [activeView, setActiveView] = usePersistentState<MainView>('ui.activeView', 'type');
  const [selectedType, setSelectedType] = usePersistentState<string | null>('ui.selectedType', null);

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
