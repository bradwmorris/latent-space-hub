"use client";

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import LogsViewer from './LogsViewer';
import ToolsViewer from './ToolsViewer';
import ApiKeysViewer from './ApiKeysViewer';
import DatabaseViewer from './DatabaseViewer';
import ExternalAgentsPanel from './ExternalAgentsPanel';
import ContextViewer from './ContextViewer';
import SkillsSettings from './SkillsSettings';
import { apiKeyService } from '@/services/storage/apiKeys';
import { Theme, useTheme } from '@/components/theme/ThemeProvider';

export type SettingsTab =
  | 'logs'
  | 'tools'
  | 'skills'
  | 'apikeys'
  | 'database'
  | 'context'
  | 'agents'
  | 'theme';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: SettingsTab;
}

type TabType = SettingsTab;

export default function SettingsModal({ isOpen, onClose, initialTab }: SettingsModalProps) {
  const { theme, resolved, setTheme } = useTheme();

  // Default to API Keys tab if no keys are configured, otherwise logs
  const getDefaultTab = (): TabType => {
    if (typeof window !== 'undefined') {
      const hasKeys = apiKeyService.getOpenAiKey() || apiKeyService.getAnthropicKey();
      return hasKeys ? 'logs' : 'apikeys';
    }
    return 'logs';
  };

  const [activeTab, setActiveTab] = useState<TabType>(getDefaultTab());
  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (!isOpen || !initialTab) return;
    setActiveTab(initialTab);
  }, [initialTab, isOpen]);

  if (!isOpen) return null;

  const modalContent = (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0, 0, 0, 0.8)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: '80vw',
          height: '85vh',
          background: 'var(--bg-surface)',
          border: '1px solid var(--border-default)',
          borderRadius: '8px',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.6)',
          display: 'flex',
          overflow: 'hidden'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Sidebar */}
        <div
          style={{
            width: '20%',
            background: 'var(--bg-base)',
            borderRight: '1px solid var(--border-default)',
            display: 'flex',
            flexDirection: 'column',
            padding: '24px 0'
          }}
        >
          <div
            style={{
              padding: '0 24px',
              marginBottom: '24px',
              fontSize: '18px',
              fontWeight: '600',
              color: 'var(--text-primary)'
            }}
          >
            Settings
          </div>
          <nav>
            <div
              onClick={() => setActiveTab('logs')}
              style={{
                padding: '12px 24px',
                fontSize: '14px',
                color: activeTab === 'logs' ? 'var(--text-primary)' : 'var(--accent-primary)',
                background: activeTab === 'logs' ? 'var(--bg-elevated)' : 'transparent',
                borderLeft: activeTab === 'logs' ? '3px solid var(--accent-dark)' : '3px solid transparent',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
            >
              Logs
            </div>
            <div
              onClick={() => setActiveTab('tools')}
              style={{
                padding: '12px 24px',
                fontSize: '14px',
                color: activeTab === 'tools' ? 'var(--text-primary)' : 'var(--accent-primary)',
                background: activeTab === 'tools' ? 'var(--bg-elevated)' : 'transparent',
                borderLeft: activeTab === 'tools' ? '3px solid var(--accent-dark)' : '3px solid transparent',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
            >
              Tools
            </div>
            <div
              onClick={() => setActiveTab('skills')}
              style={{
                padding: '12px 24px',
                fontSize: '14px',
                color: activeTab === 'skills' ? 'var(--text-primary)' : 'var(--accent-primary)',
                background: activeTab === 'skills' ? 'var(--bg-elevated)' : 'transparent',
                borderLeft: activeTab === 'skills' ? '3px solid var(--accent-dark)' : '3px solid transparent',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
            >
              Skills
            </div>
            <div
              onClick={() => setActiveTab('apikeys')}
              style={{
                padding: '12px 24px',
                fontSize: '14px',
                color: activeTab === 'apikeys' ? 'var(--text-primary)' : 'var(--accent-primary)',
                background: activeTab === 'apikeys' ? 'var(--bg-elevated)' : 'transparent',
                borderLeft: activeTab === 'apikeys' ? '3px solid var(--accent-dark)' : '3px solid transparent',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
            >
              API Keys
            </div>
            <div
              onClick={() => setActiveTab('database')}
              style={{
                padding: '12px 24px',
                fontSize: '14px',
                color: activeTab === 'database' ? 'var(--text-primary)' : 'var(--accent-primary)',
                background: activeTab === 'database' ? 'var(--bg-elevated)' : 'transparent',
                borderLeft: activeTab === 'database' ? '3px solid var(--accent-dark)' : '3px solid transparent',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
            >
              Database
            </div>
            <div
              onClick={() => setActiveTab('context')}
              style={{
                padding: '12px 24px',
                fontSize: '14px',
                color: activeTab === 'context' ? 'var(--text-primary)' : 'var(--accent-primary)',
                background: activeTab === 'context' ? 'var(--bg-elevated)' : 'transparent',
                borderLeft: activeTab === 'context' ? '3px solid var(--accent-dark)' : '3px solid transparent',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
            >
              Context
            </div>
            <div
              onClick={() => setActiveTab('agents')}
              style={{
                padding: '12px 24px',
                fontSize: '14px',
                color: activeTab === 'agents' ? 'var(--text-primary)' : 'var(--accent-primary)',
                background: activeTab === 'agents' ? 'var(--bg-elevated)' : 'transparent',
                borderLeft: activeTab === 'agents' ? '3px solid var(--accent-dark)' : '3px solid transparent',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
            >
              External Agents
            </div>
            <div
              onClick={() => setActiveTab('theme')}
              style={{
                padding: '12px 24px',
                fontSize: '14px',
                color: activeTab === 'theme' ? 'var(--text-primary)' : 'var(--accent-primary)',
                background: activeTab === 'theme' ? 'var(--bg-elevated)' : 'transparent',
                borderLeft: activeTab === 'theme' ? '3px solid var(--accent-dark)' : '3px solid transparent',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
            >
              Theme
            </div>
            <div
              style={{
                padding: '12px 24px',
                fontSize: '14px',
                color: 'var(--accent-primary)',
                opacity: 0.4,
                cursor: 'not-allowed'
              }}
            >
              Preferences
            </div>
            <div
              style={{
                padding: '12px 24px',
                fontSize: '14px',
                color: 'var(--accent-primary)',
                opacity: 0.4,
                cursor: 'not-allowed'
              }}
            >
              Backups
            </div>
          </nav>

          <div
            style={{
              marginTop: 'auto',
              padding: '24px',
              borderTop: '1px solid var(--border-default)',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px'
            }}
          >
            <div
              style={{
                fontSize: '11px',
                fontWeight: 600,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: 'var(--text-muted)'
              }}
            >
              Local Mode
            </div>
            <p
              style={{
                fontSize: '13px',
                color: 'var(--text-secondary)',
                margin: 0,
                lineHeight: 1.5
              }}
            >
              This open-source build runs entirely on your machine. Add keys via the API Keys tab to unlock every agent.
            </p>
          </div>
        </div>

        {/* Content Area */}
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column'
          }}
        >
          {/* Header */}
          <div
            style={{
              padding: '16px 24px',
              borderBottom: '1px solid var(--border-default)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}
          >
            <h2
              style={{
                margin: 0,
                fontSize: '16px',
                fontWeight: '600',
                color: 'var(--text-primary)'
              }}
            >
              {activeTab === 'logs' && 'System Logs'}
              {activeTab === 'tools' && 'Tools'}
              {activeTab === 'skills' && 'Skills'}
              {activeTab === 'apikeys' && 'API Keys'}
              {activeTab === 'database' && 'Knowledge Database'}
              {activeTab === 'context' && 'Auto-Context'}
              {activeTab === 'agents' && 'External Agents'}
              {activeTab === 'theme' && 'Theme'}
            </h2>
            <button
              onClick={onClose}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--accent-primary)',
                cursor: 'pointer',
                fontSize: '24px',
                lineHeight: 1,
                padding: '4px 8px',
                transition: 'color 0.2s'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = 'var(--text-primary)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = 'var(--accent-primary)';
              }}
              title="Close (ESC)"
            >
              ×
            </button>
          </div>

          {/* Content */}
          <div style={{ flex: 1, overflow: 'hidden' }}>
            {activeTab === 'logs' && <LogsViewer key={isOpen ? 'open' : 'closed'} />}
            {activeTab === 'tools' && <ToolsViewer />}
            {activeTab === 'skills' && <SkillsSettings />}
            {activeTab === 'apikeys' && <ApiKeysViewer />}
            {activeTab === 'database' && <DatabaseViewer />}
            {activeTab === 'context' && <ContextViewer />}
            {activeTab === 'agents' && <ExternalAgentsPanel />}
            {activeTab === 'theme' && (
              <div
                style={{
                  height: '100%',
                  overflowY: 'auto',
                  padding: '24px',
                  color: 'var(--text-primary)'
                }}
              >
                <div
                  style={{
                    maxWidth: '560px',
                    border: '1px solid var(--border-default)',
                    background: 'var(--bg-surface)',
                    borderRadius: '8px',
                    padding: '20px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '16px'
                  }}
                >
                  <div>
                    <div style={{ fontSize: '14px', fontWeight: 600, marginBottom: '6px' }}>
                      Appearance
                    </div>
                    <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: 0 }}>
                      Choose how the app colors are rendered. Current resolved theme: {resolved}.
                    </p>
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    {(['light', 'dark', 'system'] as Theme[]).map((option) => {
                      const active = theme === option;
                      return (
                        <button
                          key={option}
                          onClick={() => setTheme(option)}
                          style={{
                            border: active ? '1px solid var(--accent-primary)' : '1px solid var(--border-default)',
                            background: active ? 'var(--bg-elevated)' : 'var(--bg-base)',
                            color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
                            padding: '8px 12px',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            textTransform: 'capitalize',
                            fontSize: '13px'
                          }}
                        >
                          {option}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}
