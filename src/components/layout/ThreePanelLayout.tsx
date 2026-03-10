"use client";

import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import EventsCalendarPane from '../panes/EventsCalendarPane';
import EvalsClient from '@/app/evals/EvalsClient';
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

function formatEventDate(dateStr: string): string {
  const date = new Date(dateStr + 'T12:00:00');
  return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function formatCountdown(dateStr: string): string | null {
  const eventDate = new Date(dateStr + 'T00:00:00');
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const diffMs = eventDate.getTime() - now.getTime();
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return 'today';
  if (diffDays === 1) return 'tomorrow';
  if (diffDays <= 14) return `in ${diffDays} days`;
  return null;
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
  const [presenterAvatars, setPresenterAvatars] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!selectedType) {
      setNodes([]);
      return;
    }
    setLoading(true);
    const eventTypes = new Set(['event', 'paper-club', 'builders-club', 'podcast']);
    const fetchLimit = eventTypes.has(selectedType) ? 200 : 100;

    // For paper-club and builders-club, also fetch scheduled event nodes that match
    const typesWithScheduledEvents = new Set(['paper-club', 'builders-club']);
    const fetches: Promise<Node[]>[] = [
      fetch(`/api/nodes?type=${encodeURIComponent(selectedType)}&limit=${fetchLimit}&sortBy=event_date`)
        .then(res => res.json())
        .then(data => (data.success ? data.data : []))
    ];

    if (typesWithScheduledEvents.has(selectedType)) {
      fetches.push(
        fetch(`/api/nodes?type=event&limit=50&sortBy=event_date`)
          .then(res => res.json())
          .then(data => {
            if (!data.success) return [];
            return data.data.filter((n: Node) => {
              const meta = n.metadata as any;
              return meta?.event_type === selectedType && meta?.event_status === 'scheduled';
            });
          })
      );
    }

    Promise.all(fetches)
      .then(results => {
        const merged = results.flat();
        // Dedupe by id in case of overlap
        const seen = new Set<number>();
        setNodes(merged.filter(n => {
          if (seen.has(n.id)) return false;
          seen.add(n.id);
          return true;
        }));
      })
      .catch(err => console.error('Failed to fetch type nodes:', err))
      .finally(() => setLoading(false));
  }, [selectedType]);

  // Fetch member avatars for presenter lookup (paper-club, builders-club, event types)
  useEffect(() => {
    const typesWithPresenters = new Set(['event', 'paper-club', 'builders-club']);
    if (!selectedType || !typesWithPresenters.has(selectedType)) return;

    fetch('/api/nodes?type=member&limit=200')
      .then(res => res.json())
      .then(data => {
        if (!data.success) return;
        const avatarMap: Record<string, string> = {};
        for (const member of data.data) {
          const meta = member.metadata as any;
          if (meta?.avatar_url) {
            // Index by title (display name) and discord_handle
            if (member.title) avatarMap[member.title.toLowerCase()] = meta.avatar_url;
            if (meta.discord_handle) avatarMap[meta.discord_handle.toLowerCase()] = meta.avatar_url;
          }
        }
        setPresenterAvatars(avatarMap);
      })
      .catch(() => {});
  }, [selectedType]);

  if (!selectedType) {
    return (
      <div style={{
        flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: 'var(--text-muted)', fontSize: '13px', flexDirection: 'column', gap: '6px',
      }}>
        <div style={{ color: 'var(--accent-dark)' }}>Select a type from the left panel</div>
        <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>or switch to Feed or Map view</div>
      </div>
    );
  }

  if (loading) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
        Loading...
      </div>
    );
  }

  // Split into upcoming and past for date-based types
  const typesWithSections = new Set(['event', 'paper-club', 'builders-club', 'podcast']);
  const hasEventSections = selectedType !== null && typesWithSections.has(selectedType);
  const today = new Date().toISOString().slice(0, 10);

  const upcomingNodes = hasEventSections
    ? nodes.filter(n => {
        const meta = n.metadata as any;
        // Event nodes use event_status, content nodes use date comparison
        if (n.node_type === 'event') {
          return meta?.event_status === 'scheduled';
        }
        return (n.event_date || '') >= today;
      }).sort((a, b) => {
        const dateA = a.event_date || '';
        const dateB = b.event_date || '';
        return dateA.localeCompare(dateB); // ascending — soonest first
      })
    : [];
  const pastNodes = hasEventSections
    ? nodes.filter(n => {
        const meta = n.metadata as any;
        if (n.node_type === 'event') {
          return meta?.event_status !== 'scheduled';
        }
        return (n.event_date || '') < today;
      })
    : nodes;

  if (nodes.length === 0) {
    return (
      <div style={{
        flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: 'var(--text-muted)', fontSize: '13px',
      }}>
        No {selectedType} nodes yet
      </div>
    );
  }

  const renderSectionHeader = (label: string, count: number) => (
    <div style={{
      padding: '12px 24px 8px',
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      borderBottom: label === 'Upcoming' ? '1px solid rgba(139, 92, 246, 0.2)' : '1px solid var(--border-subtle)',
    }}>
      {label === 'Upcoming' && (
        <span style={{
          width: '6px',
          height: '6px',
          borderRadius: '50%',
          background: '#8b5cf6',
          flexShrink: 0,
        }} />
      )}
      <span style={{
        fontSize: '11px',
        fontWeight: 600,
        color: label === 'Upcoming' ? '#8b5cf6' : 'var(--text-muted)',
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
      }}>
        {label}
      </span>
      <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
        {count}
      </span>
    </div>
  );

  return (
    <div style={{ flex: 1, overflowY: 'auto' }}>
      {/* Header */}
      <div style={{
        padding: '16px 24px 12px',
        display: 'flex',
        alignItems: 'baseline',
        justifyContent: 'space-between',
        borderBottom: '1px solid var(--bg-elevated)',
      }}>
        <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'capitalize' }}>
          {selectedType}
        </span>
        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
          {nodes.length} node{nodes.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Upcoming events section */}
      {hasEventSections && (
        <>
          {renderSectionHeader('Upcoming', upcomingNodes.length)}
          {upcomingNodes.length > 0 ? (
            <div style={{ padding: '4px 0' }}>
              {upcomingNodes.map(node => renderNodeRow(node, true))}
            </div>
          ) : (
            <div style={{
              padding: '20px 24px',
              fontSize: '12px',
              color: 'var(--text-muted)',
              fontStyle: 'italic',
            }}>
              No upcoming events scheduled
            </div>
          )}
        </>
      )}

      {/* Past / all section */}
      {hasEventSections && renderSectionHeader('Past', pastNodes.length)}

      {/* Node list */}
      <div style={{ padding: '4px 0' }}>
        {pastNodes.map(node => renderNodeRow(node, false))}
      </div>
    </div>
  );

  function renderNodeRow(node: Node, isUpcoming: boolean) {
    const isHovered = hoveredId === node.id;
    const dims = node.dimensions?.slice(0, 3) || [];
    const edgeCount = node.edge_count ?? 0;
    const dateStr = node.event_date || node.updated_at || node.created_at;
    const formattedDate = dateStr
      ? (node.event_date
        ? (isUpcoming ? formatEventDate(dateStr) : formatAbsoluteDate(dateStr))
        : formatRelativeDate(dateStr))
      : '';
    const countdown = isUpcoming && node.event_date ? formatCountdown(node.event_date) : null;
    const thumb = getYouTubeThumbnail(node.link);
    const isMember = node.node_type === 'member';
    const memberAvatar = isMember ? (node.metadata as any)?.avatar_url : null;
    const meta = node.metadata as any;
    const isEvent = node.node_type === 'event';
    const eventType = isEvent ? meta?.event_type : null; // 'paper-club' or 'builders-club'
    const presenterName = meta?.presenter_name || null;
    const presenterAvatar = presenterName
      ? presenterAvatars[presenterName.toLowerCase()] || null
      : null;

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
          background: isHovered ? 'var(--bg-hover)' : (isUpcoming ? 'rgba(139, 92, 246, 0.06)' : 'transparent'),
          border: 'none',
          borderBottom: '1px solid var(--bg-hover)',
          borderLeft: isUpcoming ? '3px solid #8b5cf6' : '3px solid transparent',
          color: 'var(--text-primary)',
          cursor: 'pointer',
          textAlign: 'left',
          transition: 'background 0.12s ease',
          alignItems: isMember ? 'center' : 'flex-start',
        }}
      >
        {/* Presenter avatar (paper-club, builders-club, events) */}
        {presenterAvatar && !thumb && !isMember && (
          <img
            src={presenterAvatar}
            alt={presenterName || ''}
            loading="lazy"
            style={{
              width: '32px',
              height: '32px',
              objectFit: 'cover',
              borderRadius: '999px',
              flexShrink: 0,
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border-default)',
              marginTop: '2px',
            }}
          />
        )}

        {/* Presenter initial fallback (when no avatar but has presenter) */}
        {!presenterAvatar && presenterName && !thumb && !isMember && (
          <div style={{
            width: '32px',
            height: '32px',
            borderRadius: '999px',
            flexShrink: 0,
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border-default)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--text-muted)',
            fontSize: '13px',
            fontWeight: 500,
            marginTop: '2px',
          }}>
            {presenterName.charAt(0).toUpperCase()}
          </div>
        )}

        {/* Thumbnail (podcasts) */}
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
              background: 'var(--bg-elevated)',
              marginTop: '2px',
            }}
          />
        )}

        {/* Avatar (members) */}
        {isMember && (
          memberAvatar ? (
            <img
              src={memberAvatar}
              alt=""
              loading="lazy"
              style={{
                width: '40px',
                height: '40px',
                objectFit: 'cover',
                borderRadius: '999px',
                flexShrink: 0,
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border-default)',
              }}
            />
          ) : (
            <div style={{
              width: '40px',
              height: '40px',
              borderRadius: '999px',
              flexShrink: 0,
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border-default)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--text-muted)',
              fontSize: '16px',
            }}>
              {node.title?.charAt(0)?.toUpperCase() || '?'}
            </div>
          )
        )}

        {/* Text content */}
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {/* Title */}
        <div style={{
          fontSize: '13px',
          fontWeight: 500,
          color: isHovered ? 'var(--text-primary)' : 'var(--text-primary)',
          lineHeight: 1.4,
          transition: 'color 0.12s ease',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
        }}>
          {node.title}
          {eventType && (
            <span style={{
              fontSize: '9px',
              fontWeight: 500,
              color: eventType === 'paper-club' ? '#818cf8' : '#f59e0b',
              background: eventType === 'paper-club' ? 'rgba(129, 140, 248, 0.12)' : 'rgba(245, 158, 11, 0.12)',
              border: `1px solid ${eventType === 'paper-club' ? 'rgba(129, 140, 248, 0.25)' : 'rgba(245, 158, 11, 0.25)'}`,
              padding: '1px 6px',
              borderRadius: '3px',
              flexShrink: 0,
            }}>
              {eventType === 'paper-club' ? 'Paper Club' : 'Builders Club'}
            </span>
          )}
          {isUpcoming && countdown && (
            <span style={{
              fontSize: '10px',
              fontWeight: 600,
              color: '#8b5cf6',
              background: 'rgba(139, 92, 246, 0.1)',
              border: '1px solid rgba(139, 92, 246, 0.3)',
              padding: '2px 8px',
              borderRadius: '4px',
              flexShrink: 0,
              letterSpacing: '0.02em',
            }}>
              {countdown}
            </span>
          )}
          {isUpcoming && !countdown && (
            <span style={{
              fontSize: '10px',
              fontWeight: 600,
              color: '#8b5cf6',
              background: 'rgba(139, 92, 246, 0.1)',
              border: '1px solid rgba(139, 92, 246, 0.3)',
              padding: '2px 8px',
              borderRadius: '4px',
              flexShrink: 0,
              letterSpacing: '0.02em',
            }}>
              Upcoming
            </span>
          )}
        </div>

        {/* Presenter */}
        {presenterName && (
          <div style={{ fontSize: '12px', color: isUpcoming ? '#8b5cf6' : 'var(--text-secondary)', lineHeight: 1.4 }}>
            Hosted by {presenterName}
          </div>
        )}

        {/* Description */}
        {node.description && (
          <div style={{
            fontSize: '12px',
            color: 'var(--accent-dark)',
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
          {/* Date — prominent */}
          {formattedDate && (
            <span style={{
              fontSize: '13px',
              fontWeight: 600,
              color: isUpcoming ? '#8b5cf6' : 'var(--text-secondary)',
              fontVariantNumeric: 'tabular-nums',
              fontFamily: 'var(--font-mono)',
            }}>
              {formattedDate}
            </span>
          )}

          {/* Edge count */}
          {edgeCount > 0 && (
            <span style={{
              fontSize: '11px',
              color: 'var(--text-muted)',
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
                    color: 'var(--accent-dark)',
                    background: 'var(--bg-elevated)',
                    padding: '1px 6px',
                    borderRadius: '3px',
                    border: '1px solid var(--bg-elevated)',
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
  }
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

  // Settings modal removed — no longer needed

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
        if (document.activeElement?.closest('[data-ls-app]')) {
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
            case 'SKILL_UPDATED':
              if (typeof window !== 'undefined') {
                window.dispatchEvent(new CustomEvent('skills:updated', { detail: data.data }));
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

      case 'events':
        return (
          <EventsCalendarPane
            onNodeClick={handleNodeSelect}
          />
        );

      case 'evals':
        return <EvalsClient />;

      default:
        return null;
    }
  };

  return (
    <div
      ref={containerRef}
      data-ls-app
      style={{
        display: 'flex',
        height: '100vh',
        width: '100vw',
        background: 'var(--bg-base)',
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
        onEvalsClick={() => {
          setActiveView('evals');
          if (showingFocusedNode) {
            setActiveTab(null);
            setFocusedNodeId(null);
          }
        }}
        onSkillsClick={() => {
          window.location.assign('/docs/skills/start-here');
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
            background: 'var(--bg-surface)',
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
