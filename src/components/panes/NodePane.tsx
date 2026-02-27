"use client";

import { useState, useEffect, useRef } from 'react';
import FocusPanel from '@/components/focus/FocusPanel';
import PaneHeader from './PaneHeader';
import { NodePaneProps, PaneType } from './types';

// Simple truncate for tab titles
function truncateTitle(title: string, maxLength = 20): string {
  if (title.length <= maxLength) return title;
  return title.slice(0, maxLength - 1) + '…';
}

export default function NodePane({
  slot,
  isActive,
  onPaneAction,
  onCollapse,
  onSwapPanes,
  openTabs,
  activeTab,
  onTabSelect,
  onTabClose,
  onNodeClick,
  onReorderTabs,
  refreshTrigger,
  onOpenInOtherSlot,
  onTextSelect,
  highlightedPassage,
}: NodePaneProps) {
  const [nodeTitles, setNodeTitles] = useState<Record<number, string>>({});
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; tabId: number } | null>(null);
  const fetchedRef = useRef<Set<number>>(new Set());

  const handleTypeChange = (type: PaneType) => {
    onPaneAction?.({ type: 'switch-pane-type', paneType: type });
  };

  // Fetch node titles for tabs
  useEffect(() => {
    const fetchTitle = async (tabId: number) => {
      if (fetchedRef.current.has(tabId)) return;
      fetchedRef.current.add(tabId);

      try {
        const response = await fetch(`/api/nodes/${tabId}`);
        if (response.ok) {
          const data = await response.json();
          if (data.success && data.node) {
            setNodeTitles(prev => ({ ...prev, [tabId]: data.node.title || 'Untitled' }));
          }
        }
      } catch (error) {
        console.error('Failed to fetch node title:', error);
        fetchedRef.current.delete(tabId); // Allow retry on error
      }
    };

    openTabs.forEach(fetchTitle);
  }, [openTabs]);

  // Clear fetched ref when tabs are closed
  useEffect(() => {
    const currentTabs = new Set(openTabs);
    fetchedRef.current.forEach(id => {
      if (!currentTabs.has(id)) {
        fetchedRef.current.delete(id);
      }
    });
  }, [openTabs]);

  // Close context menu on outside click or escape
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

  return (
    <div style={{
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      background: 'transparent',
      overflow: 'hidden',
    }}>
      <PaneHeader slot={slot} onCollapse={onCollapse} onSwapPanes={onSwapPanes}>
        {/* Tabs rendered inline */}
        {openTabs.length === 0 ? (
          <span style={{ fontSize: '12px', color: '#666' }}>No tabs open</span>
        ) : (
          openTabs.map((tabId) => {
            const title = nodeTitles[tabId] || 'Loading...';
            const isActiveTab = activeTab === tabId;
            return (
              <div
                key={tabId}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.effectAllowed = 'copyMove';
                  e.dataTransfer.setData('application/x-rah-tab', JSON.stringify({ id: tabId, title, sourceSlot: slot }));
                  e.dataTransfer.setData('text/plain', `[NODE:${tabId}:"${title}"]`);
                }}
                onContextMenu={(e) => {
                  e.preventDefault();
                  setContextMenu({ x: e.clientX, y: e.clientY, tabId });
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '4px 8px',
                  background: isActiveTab ? '#1f1f1f' : 'transparent',
                  borderRadius: '4px',
                  borderBottom: isActiveTab ? '2px solid var(--accent-brand)' : '2px solid transparent',
                  cursor: 'grab',
                  flexShrink: 0,
                }}
              >
                <button
                  onClick={() => onTabSelect(tabId)}
                  style={{
                    fontSize: '11px',
                    color: isActiveTab ? '#fff' : '#888',
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    padding: 0,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {truncateTitle(title)}
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onTabClose(tabId);
                  }}
                  style={{
                    fontSize: '12px',
                    color: '#666',
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    padding: '0 2px',
                    lineHeight: 1,
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
      </PaneHeader>

      <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
        <FocusPanel
          openTabs={openTabs}
          activeTab={activeTab}
          onTabSelect={onTabSelect}
          onNodeClick={onNodeClick}
          onTabClose={onTabClose}
          refreshTrigger={refreshTrigger}
          onReorderTabs={onReorderTabs}
          onOpenInOtherSlot={onOpenInOtherSlot}
          onTextSelect={onTextSelect}
          highlightedPassage={highlightedPassage}
          hideTabBar
        />
      </div>

      {/* Context menu for tabs */}
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
    </div>
  );
}
