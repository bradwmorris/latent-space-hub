"use client";

// Stub type for delegation (delegation system removed in rah-light)
type AgentDelegation = {
  id: number;
  sessionId: string;
  task: string;
  status: 'queued' | 'in_progress' | 'completed' | 'failed';
  summary?: string | null;
  createdAt: string;
  updatedAt: string;
};

interface QuickAddStatusProps {
  delegations: AgentDelegation[];
  onDelegationClick: (sessionId: string) => void;
}

export default function QuickAddStatus({ delegations, onDelegationClick }: QuickAddStatusProps) {
  const activeDelegations = delegations.filter(d => d.status === 'queued' || d.status === 'in_progress');
  const completedDelegations = delegations.filter(d => d.status === 'completed' || d.status === 'failed');
  
  console.log('[QuickAddStatus] Rendering with', delegations.length, 'total delegations,', activeDelegations.length, 'active');
  
  const handleClearCompleted = async () => {
    for (const delegation of completedDelegations) {
      try {
        await fetch(`/api/rah/delegations/${delegation.sessionId}`, { method: 'DELETE' });
      } catch (error) {
        console.error('Failed to delete delegation:', error);
      }
    }
    window.location.reload();
  };
  
  return (
    <div style={{
      padding: '12px',
      display: 'flex',
      flexDirection: 'column',
      gap: '8px',
      overflowY: 'auto',
      height: '100%',
      background: '#0a0a0a'
    }}>
      {/* Header */}
      {delegations.length > 0 && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 12px',
          background: '#151515',
          borderRadius: '6px',
          color: '#a8a8a8',
          fontSize: '11px',
          fontFamily: "'JetBrains Mono', ui-monospace",
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          borderLeft: activeDelegations.length > 0 ? '3px solid #888' : '3px solid #6b6b6b'
        }}>
          <span>
            {activeDelegations.length > 0 
              ? `Processing ${activeDelegations.length} Quick Add${activeDelegations.length > 1 ? 's' : ''}...`
              : `${delegations.length} Recent Quick Add${delegations.length > 1 ? 's' : ''}`
            }
          </span>
          {completedDelegations.length > 0 && (
            <button
              onClick={handleClearCompleted}
              style={{
                padding: '4px 8px',
                background: '#1a1a1a',
                border: '1px solid #2a2a2a',
                borderRadius: '4px',
                color: '#6b6b6b',
                fontSize: '10px',
                fontFamily: "'JetBrains Mono', ui-monospace",
                cursor: 'pointer',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                transition: 'all 0.15s ease'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = '#222';
                e.currentTarget.style.color = '#a8a8a8';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = '#1a1a1a';
                e.currentTarget.style.color = '#6b6b6b';
              }}
            >
              Clear Completed
            </button>
          )}
        </div>
      )}
      
      {delegations.map((delegation) => {
        const statusColor = delegation.status === 'in_progress' ? '#888' : 
                           delegation.status === 'completed' ? '#6b6b6b' : 
                           delegation.status === 'failed' ? '#ff6b6b' : '#5c9aff';
        
        const statusLabel = delegation.status === 'in_progress' ? 'Processing' :
                           delegation.status === 'completed' ? 'Done' :
                           delegation.status === 'failed' ? 'Failed' : 'Queued';

        return (
          <button
            key={delegation.sessionId}
            onClick={() => onDelegationClick(delegation.sessionId)}
            style={{
              padding: '12px',
              background: '#151515',
              border: '1px solid #2a2a2a',
              borderRadius: '6px',
              textAlign: 'left',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
              display: 'flex',
              flexDirection: 'column',
              gap: '6px'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = '#1a1a1a';
              e.currentTarget.style.borderColor = '#3a3a3a';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = '#151515';
              e.currentTarget.style.borderColor = '#2a2a2a';
            }}
          >
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '8px'
            }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}>
                <span style={{
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  background: statusColor,
                  flexShrink: 0
                }} />
                <span style={{
                  color: '#e5e5e5',
                  fontSize: '12px',
                  fontWeight: 600,
                  fontFamily: "'JetBrains Mono', ui-monospace",
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em'
                }}>
                  {statusLabel}
                </span>
              </div>
              <span style={{
                color: '#6b6b6b',
                fontSize: '11px',
                fontFamily: "'JetBrains Mono', ui-monospace"
              }}>
                {new Date(delegation.createdAt).toLocaleTimeString()}
              </span>
            </div>

            <div style={{
              color: '#a8a8a8',
              fontSize: '12px',
              fontFamily: "'JetBrains Mono', ui-monospace",
              lineHeight: '1.5',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap'
            }}>
              {delegation.task}
            </div>

            {delegation.summary && delegation.status === 'completed' && (
              <div style={{
                color: '#6b6b6b',
                fontSize: '11px',
                fontFamily: "'JetBrains Mono', ui-monospace",
                lineHeight: '1.4',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap'
              }}>
                {delegation.summary}
              </div>
            )}

            {delegation.summary && delegation.status === 'failed' && (
              <div style={{
                color: '#ff6b6b',
                fontSize: '11px',
                fontFamily: "'JetBrains Mono', ui-monospace",
                lineHeight: '1.4'
              }}>
                {delegation.summary}
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
}
