"use client";

import { useState, useEffect, type CSSProperties } from 'react';
import { apiKeyService, ApiKeyStatus } from '@/services/storage/apiKeys';

export default function ApiKeysViewer() {
  const [openaiKey, setOpenaiKey] = useState('');
  const [anthropicKey, setAnthropicKey] = useState('');
  const [status, setStatus] = useState<ApiKeyStatus>({ openai: 'not-set', anthropic: 'not-set' });
  const [showKeys, setShowKeys] = useState(false);

  useEffect(() => {
    const stored = apiKeyService.getStoredKeys();
    setOpenaiKey(stored.openai || '');
    setAnthropicKey(stored.anthropic || '');
    setStatus(apiKeyService.getStatus());
  }, []);

  const handleSaveOpenAi = async () => {
    if (!openaiKey.trim()) return;
    apiKeyService.setOpenAiKey(openaiKey.trim());
    setStatus(prev => ({ ...prev, openai: 'testing' }));
    const ok = await apiKeyService.testOpenAiConnection();
    setStatus(prev => ({ ...prev, openai: ok ? 'connected' : 'failed' }));
  };

  const handleSaveAnthropic = async () => {
    if (!anthropicKey.trim()) return;
    apiKeyService.setAnthropicKey(anthropicKey.trim());
    setStatus(prev => ({ ...prev, anthropic: 'testing' }));
    const ok = await apiKeyService.testAnthropicConnection();
    setStatus(prev => ({ ...prev, anthropic: ok ? 'connected' : 'failed' }));
  };

  const handleClearOpenAi = () => {
    apiKeyService.clearOpenAiKey();
    setOpenaiKey('');
    setStatus(prev => ({ ...prev, openai: 'not-set' }));
  };

  const handleClearAnthropic = () => {
    apiKeyService.clearAnthropicKey();
    setAnthropicKey('');
    setStatus(prev => ({ ...prev, anthropic: 'not-set' }));
  };

  const getStatusLabel = (s: string) => {
    if (s === 'connected') return { text: 'Connected', color: '#9333ea' };
    if (s === 'failed') return { text: 'Failed', color: '#ef4444' };
    if (s === 'testing') return { text: 'Testing...', color: '#6b7280' };
    return { text: 'Not set', color: '#6b7280' };
  };

  return (
    <div style={containerStyle}>
      <p style={descStyle}>Keys are stored locally and never shared.</p>

      <label style={toggleStyle}>
        <input
          type="checkbox"
          checked={showKeys}
          onChange={(e) => setShowKeys(e.target.checked)}
          style={{ marginRight: 8 }}
        />
        Show keys
      </label>

      {/* OpenAI */}
      <div style={cardStyle}>
        <div style={cardHeaderStyle}>
          <span style={cardTitleStyle}>OpenAI</span>
          <span style={{ fontSize: 12, color: getStatusLabel(status.openai).color }}>
            {getStatusLabel(status.openai).text}
          </span>
        </div>
        <input
          type={showKeys ? 'text' : 'password'}
          value={openaiKey}
          onChange={(e) => setOpenaiKey(e.target.value)}
          placeholder="sk-..."
          style={inputStyle}
        />
        <div style={buttonRowStyle}>
          <button
            onClick={handleSaveOpenAi}
            disabled={!openaiKey.trim()}
            style={{ ...btnPrimaryStyle, opacity: openaiKey.trim() ? 1 : 0.4 }}
          >
            Save
          </button>
          <button
            onClick={handleClearOpenAi}
            disabled={!openaiKey}
            style={{ ...btnSecondaryStyle, opacity: openaiKey ? 1 : 0.4 }}
          >
            Clear
          </button>
        </div>
      </div>

      {/* Anthropic */}
      <div style={cardStyle}>
        <div style={cardHeaderStyle}>
          <span style={cardTitleStyle}>Anthropic</span>
          <span style={{ fontSize: 12, color: getStatusLabel(status.anthropic).color }}>
            {getStatusLabel(status.anthropic).text}
          </span>
        </div>
        <input
          type={showKeys ? 'text' : 'password'}
          value={anthropicKey}
          onChange={(e) => setAnthropicKey(e.target.value)}
          placeholder="sk-ant-..."
          style={inputStyle}
        />
        <div style={buttonRowStyle}>
          <button
            onClick={handleSaveAnthropic}
            disabled={!anthropicKey.trim()}
            style={{ ...btnPrimaryStyle, opacity: anthropicKey.trim() ? 1 : 0.4 }}
          >
            Save
          </button>
          <button
            onClick={handleClearAnthropic}
            disabled={!anthropicKey}
            style={{ ...btnSecondaryStyle, opacity: anthropicKey ? 1 : 0.4 }}
          >
            Clear
          </button>
        </div>
      </div>

      {/* Help */}
      <div style={helpStyle}>
        <div style={{ marginBottom: 8 }}>Get keys from:</div>
        <div>
          <a href="https://platform.openai.com/api-keys" target="_blank" rel="noreferrer" style={linkStyle}>
            OpenAI →
          </a>
          <span style={{ margin: '0 12px', color: '#4b5563' }}>·</span>
          <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noreferrer" style={linkStyle}>
            Anthropic →
          </a>
        </div>
      </div>
    </div>
  );
}

const containerStyle: CSSProperties = {
  padding: 24,
  height: '100%',
  overflow: 'auto',
};

const descStyle: CSSProperties = {
  fontSize: 13,
  color: '#6b7280',
  marginBottom: 16,
};

const toggleStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  fontSize: 12,
  color: '#6b7280',
  cursor: 'pointer',
  marginBottom: 20,
};

const cardStyle: CSSProperties = {
  background: 'rgba(255, 255, 255, 0.02)',
  border: '1px solid rgba(255, 255, 255, 0.06)',
  borderRadius: 8,
  padding: 16,
  marginBottom: 12,
};

const cardHeaderStyle: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  marginBottom: 12,
};

const cardTitleStyle: CSSProperties = {
  fontSize: 13,
  fontWeight: 500,
  color: '#e5e7eb',
};

const inputStyle: CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  fontSize: 13,
  fontFamily: 'monospace',
  background: 'rgba(0, 0, 0, 0.3)',
  border: '1px solid rgba(255, 255, 255, 0.08)',
  borderRadius: 6,
  color: '#e5e7eb',
  marginBottom: 12,
  outline: 'none',
};

const buttonRowStyle: CSSProperties = {
  display: 'flex',
  gap: 8,
};

const btnPrimaryStyle: CSSProperties = {
  padding: '8px 14px',
  fontSize: 12,
  fontWeight: 500,
  background: '#9333ea',
  color: '#1e1b4b',
  border: 'none',
  borderRadius: 6,
  cursor: 'pointer',
};

const btnSecondaryStyle: CSSProperties = {
  padding: '8px 14px',
  fontSize: 12,
  fontWeight: 500,
  background: 'rgba(255, 255, 255, 0.06)',
  color: '#9ca3af',
  border: 'none',
  borderRadius: 6,
  cursor: 'pointer',
};

const helpStyle: CSSProperties = {
  marginTop: 8,
  padding: 16,
  background: 'rgba(255, 255, 255, 0.02)',
  border: '1px solid rgba(255, 255, 255, 0.06)',
  borderRadius: 8,
  fontSize: 12,
  color: '#6b7280',
};

const linkStyle: CSSProperties = {
  color: '#9333ea',
  textDecoration: 'none',
};
