"use client";

import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';

interface EdgeExplanationModalProps {
  sourceTitle: string;
  targetTitle: string;
  onSubmit: (explanation: string) => void;
  onCancel: () => void;
}

export default function EdgeExplanationModal({
  sourceTitle,
  targetTitle,
  onSubmit,
  onCancel,
}: EdgeExplanationModalProps) {
  const [explanation, setExplanation] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    textareaRef.current?.focus();
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onCancel();
    } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && explanation.trim()) {
      e.preventDefault();
      onSubmit(explanation.trim());
    }
  };

  const modalContent = (
    <div
      className="edge-modal-backdrop"
      onClick={onCancel}
      role="dialog"
      aria-modal="true"
      aria-label="Connect nodes"
    >
      <div className="edge-modal-container">
        <div
          className="edge-modal-card"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Connection visualization */}
          <div className="edge-modal-connection">
            <span className="edge-modal-node-badge">{sourceTitle.length > 24 ? sourceTitle.slice(0, 22) + '\u2026' : sourceTitle}</span>
            <svg width="20" height="12" viewBox="0 0 20 12" fill="none" style={{ flexShrink: 0 }}>
              <path d="M0 6h16M12 1l5 5-5 5" stroke="var(--accent-primary)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span className="edge-modal-node-badge">{targetTitle.length > 24 ? targetTitle.slice(0, 22) + '\u2026' : targetTitle}</span>
          </div>

          {/* Textarea */}
          <div className="edge-modal-input-wrapper">
            <textarea
              ref={textareaRef}
              value={explanation}
              onChange={(e) => setExplanation(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="How are these connected?"
              rows={2}
              className="edge-modal-textarea"
            />
          </div>

          {/* Footer */}
          <div className="edge-modal-footer">
            <span className="edge-modal-hint">
              <kbd>&#x2318;&#x21B5;</kbd> connect &middot; <kbd>esc</kbd> cancel
            </span>
            <div className="edge-modal-actions">
              <button onClick={onCancel} className="edge-modal-btn edge-modal-btn--cancel">
                Cancel
              </button>
              <button
                onClick={() => explanation.trim() && onSubmit(explanation.trim())}
                disabled={!explanation.trim()}
                className={`edge-modal-btn edge-modal-btn--submit ${explanation.trim() ? 'active' : ''}`}
              >
                Connect
              </button>
            </div>
          </div>
        </div>
      </div>

      <style jsx>{`
        .edge-modal-backdrop {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.85);
          backdrop-filter: blur(8px);
          display: flex;
          justify-content: center;
          padding-top: 18vh;
          z-index: 9999;
          animation: edgeBackdropIn 200ms ease-out;
        }

        .edge-modal-container {
          width: 100%;
          max-width: 480px;
          animation: edgeContainerIn 200ms cubic-bezier(0.16, 1, 0.3, 1);
        }

        .edge-modal-card {
          background: var(--bg-hover);
          border: 1px solid var(--border-default);
          border-radius: 16px;
          padding: 24px;
          box-shadow:
            0 0 0 1px rgba(255, 255, 255, 0.04),
            0 24px 48px -12px rgba(0, 0, 0, 0.6);
        }

        .edge-modal-connection {
          display: flex;
          align-items: center;
          gap: 12px;
          justify-content: center;
          margin-bottom: 20px;
        }

        .edge-modal-node-badge {
          display: inline-flex;
          align-items: center;
          padding: 6px 12px;
          background: rgba(136, 136, 136, 0.08);
          border: 1px solid rgba(136, 136, 136, 0.15);
          border-radius: 8px;
          color: #86efac;
          font-size: 13px;
          font-weight: 500;
          max-width: 180px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .edge-modal-input-wrapper {
          border: 1px solid var(--border-default);
          border-radius: 12px;
          background: var(--bg-base);
          transition: border-color 0.15s ease;
        }

        .edge-modal-input-wrapper:focus-within {
          border-color: var(--border-default);
        }

        .edge-modal-textarea {
          width: 100%;
          background: transparent;
          border: none;
          padding: 16px 18px;
          color: var(--text-primary);
          font-size: 15px;
          font-family: inherit;
          resize: none;
          outline: none;
          line-height: 1.5;
        }

        .edge-modal-textarea::placeholder {
          color: var(--text-secondary);
        }

        .edge-modal-footer {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-top: 16px;
        }

        .edge-modal-hint {
          font-size: 11px;
          color: var(--text-secondary);
        }

        .edge-modal-hint kbd {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          padding: 2px 6px;
          background: var(--border-default);
          border-radius: 4px;
          font-size: 10px;
          font-family: inherit;
          color: var(--text-muted);
          border: 1px solid var(--border-default);
        }

        .edge-modal-actions {
          display: flex;
          gap: 8px;
        }

        .edge-modal-btn {
          padding: 8px 16px;
          border-radius: 8px;
          font-size: 13px;
          font-weight: 500;
          font-family: inherit;
          cursor: pointer;
          transition: all 0.15s ease;
        }

        .edge-modal-btn--cancel {
          background: transparent;
          border: 1px solid var(--border-default);
          color: var(--text-muted);
        }

        .edge-modal-btn--cancel:hover {
          border-color: var(--border-default);
          color: var(--text-secondary);
        }

        .edge-modal-btn--submit {
          background: var(--border-default);
          border: 1px solid transparent;
          color: var(--text-secondary);
          cursor: default;
        }

        .edge-modal-btn--submit.active {
          background: var(--border-default);
          color: var(--text-primary);
          cursor: pointer;
        }

        .edge-modal-btn--submit.active:hover {
          background: var(--accent-dark);
        }

        @keyframes edgeBackdropIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        @keyframes edgeContainerIn {
          from {
            opacity: 0;
            transform: scale(0.96) translateY(-8px);
          }
          to {
            opacity: 1;
            transform: scale(1) translateY(0);
          }
        }
      `}</style>
    </div>
  );

  return typeof window !== 'undefined' ? createPortal(modalContent, document.body) : null;
}
