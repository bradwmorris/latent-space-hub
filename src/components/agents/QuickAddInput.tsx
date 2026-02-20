"use client";

import { useState, useCallback } from 'react';
import { createPortal } from 'react-dom';

interface QuickAddSubmitPayload {
  input: string;
  mode: 'link' | 'note' | 'chat';
  description?: string;
}

interface QuickAddInputProps {
  onSubmit: (payload: QuickAddSubmitPayload) => Promise<void>;
  // External control (optional - if provided, component is controlled)
  isOpen?: boolean;
  onClose?: () => void;
}

export default function QuickAddInput({ onSubmit, isOpen, onClose }: QuickAddInputProps) {
  const [input, setInput] = useState('');
  const [isPosting, setIsPosting] = useState(false);
  const [isExpandedInternal, setIsExpandedInternal] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Support both controlled (isOpen/onClose) and uncontrolled (internal state) modes
  const isControlled = isOpen !== undefined;
  const isExpanded = isControlled ? isOpen : isExpandedInternal;
  const setIsExpanded = isControlled
    ? (value: boolean) => { if (!value && onClose) onClose(); }
    : setIsExpandedInternal;

  const handleFileUpload = useCallback(async (file: File) => {
    setIsPosting(true);
    setUploadError(null);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/extract/pdf/upload', {
        method: 'POST',
        body: formData,
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Upload failed');
      }

      // Success - clear state
      setUploadedFile(null);
      setInput('');
      setIsExpanded(false);

      // Show warning if present (large file)
      if (result.warning) {
        console.log('[QuickAddInput] Upload warning:', result.warning);
      }

    } catch (error) {
      console.error('[QuickAddInput] Upload error:', error);
      setUploadError(error instanceof Error ? error.message : 'Upload failed');
    } finally {
      setIsPosting(false);
    }
  }, []);

  const handleSubmit = async () => {
    // If there's a file, upload it
    if (uploadedFile) {
      await handleFileUpload(uploadedFile);
      return;
    }

    // Otherwise, submit text as before
    if (!input.trim() || isPosting) return;

    setIsPosting(true);
    try {
      // Mode is auto-detected server-side via quickAdd.ts detectInputType()
      await onSubmit({
        input: input.trim(),
        mode: 'link', // Default; actual type is inferred server-side
      });
      setInput('');
      setIsExpanded(false);
    } catch (error) {
      console.error('[QuickAddInput] Submit error:', error);
    } finally {
      setIsPosting(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSubmit();
    }
    if (e.key === 'Escape') {
      setIsExpanded(false);
      setInput('');
      setUploadedFile(null);
      setUploadError(null);
    }
  };

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    setUploadError(null);

    const file = e.dataTransfer?.files[0];
    if (!file) return;

    // Check if it's a PDF
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      setUploadError('Only PDF files are supported');
      return;
    }

    // Check size (50MB limit)
    const MAX_SIZE = 50 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      setUploadError(`File too large (${Math.round(file.size / 1024 / 1024)}MB). Maximum is 50MB.`);
      return;
    }

    setUploadedFile(file);
    setInput(''); // Clear text input when file is dropped
  }, []);

  const clearFile = useCallback(() => {
    setUploadedFile(null);
    setUploadError(null);
  }, []);

  const hasContent = input.trim() || uploadedFile;

  const handleClose = () => {
    setIsExpanded(false);
    setInput('');
    setUploadedFile(null);
    setUploadError(null);
  };

  // Collapsed state - only show button if NOT controlled externally
  if (!isExpanded) {
    // In controlled mode, don't render anything when closed
    if (isControlled) return null;

    // Uncontrolled mode - show the "ADD STUFF" button
    return (
      <button
        onClick={() => setIsExpanded(true)}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '8px',
          padding: '10px 16px',
          background: 'rgba(136, 136, 136, 0.1)',
          border: '1px solid rgba(136, 136, 136, 0.3)',
          borderRadius: '8px',
          color: '#999',
          fontSize: '11px',
          fontWeight: 600,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          cursor: 'pointer',
          transition: 'all 0.2s ease',
          whiteSpace: 'nowrap',
          boxShadow: '0 0 12px rgba(136, 136, 136, 0.15)'
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = 'rgba(136, 136, 136, 0.2)';
          e.currentTarget.style.borderColor = '#999';
          e.currentTarget.style.boxShadow = '0 0 20px rgba(136, 136, 136, 0.25)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'rgba(136, 136, 136, 0.1)';
          e.currentTarget.style.borderColor = 'rgba(136, 136, 136, 0.3)';
          e.currentTarget.style.boxShadow = '0 0 12px rgba(136, 136, 136, 0.15)';
        }}
      >
        <span style={{
          width: '18px',
          height: '18px',
          borderRadius: '50%',
          background: '#555',
          color: '#0a0a0a',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '12px',
          fontWeight: 700
        }}>+</span>
        Add Stuff
      </button>
    );
  }

  // Expanded state - the card content
  const modalContent = (
    <div
      className="qa-card"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Header */}
      <div className="qa-header">
        <span className="qa-title">Add Stuff</span>
        <button onClick={handleClose} className="qa-close">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>

      {/* File preview (when a file is dropped) */}
      {uploadedFile && (
        <div className="qa-file-preview">
          {/* PDF icon */}
          <div className="qa-file-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="1.5">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" strokeLinecap="round" strokeLinejoin="round"/>
              <polyline points="14 2 14 8 20 8" strokeLinecap="round" strokeLinejoin="round"/>
              <line x1="16" y1="13" x2="8" y2="13" strokeLinecap="round"/>
              <line x1="16" y1="17" x2="8" y2="17" strokeLinecap="round"/>
            </svg>
          </div>

          {/* File info */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              color: '#e5e5e5',
              fontSize: '13px',
              fontWeight: 500,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap'
            }}>
              {uploadedFile.name}
            </div>
            <div style={{ color: '#666', fontSize: '11px', marginTop: '2px' }}>
              {uploadedFile.size < 1024 * 1024
                ? `${Math.round(uploadedFile.size / 1024)} KB`
                : `${(uploadedFile.size / 1024 / 1024).toFixed(1)} MB`}
            </div>
          </div>

          {/* Remove button */}
          <button onClick={clearFile} className="qa-close" style={{ color: '#666' }}
            onMouseEnter={(e) => { e.currentTarget.style.color = '#ef4444'; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = '#666'; }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
      )}

      {/* Error message */}
      {uploadError && (
        <div style={{
          padding: '10px 12px',
          background: 'rgba(239, 68, 68, 0.1)',
          border: '1px solid rgba(239, 68, 68, 0.2)',
          borderRadius: '10px',
          color: '#ef4444',
          fontSize: '12px',
        }}>
          {uploadError}
        </div>
      )}

      {/* Input area - show if no file uploaded */}
      {!uploadedFile && (
        <div className={`qa-input-wrapper ${dragOver ? 'dragging' : ''}`}>
          {/* Drag overlay */}
          {dragOver && (
            <div className="qa-drag-overlay">
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '8px',
                color: '#888'
              }}>
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" strokeLinecap="round" strokeLinejoin="round"/>
                  <polyline points="14 2 14 8 20 8" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                <span style={{ fontSize: '13px', fontWeight: 500 }}>Drop PDF here</span>
              </div>
            </div>
          )}

          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Paste a URL, note, or transcript — or drop a PDF"
            disabled={isPosting}
            autoFocus
            className="qa-textarea"
            style={{ opacity: dragOver ? 0.3 : 1 }}
          />
        </div>
      )}

      {/* Footer */}
      <div className="qa-footer">
        <span className="qa-hint">
          {uploadedFile
            ? 'Ready to upload'
            : <><kbd>{'\u2318\u21B5'}</kbd> submit <span className="qa-hint-sep">&middot;</span> <kbd>esc</kbd> close</>
          }
        </span>
        <button
          onClick={handleSubmit}
          disabled={!hasContent || isPosting}
          className={`qa-submit ${hasContent && !isPosting ? 'active' : ''}`}
        >
          {isPosting ? (
            <span className="qa-spinner" />
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 19V5"/>
              <path d="M5 12l7-7 7 7"/>
            </svg>
          )}
        </button>
      </div>

      <style jsx>{`
        .qa-card {
          display: flex;
          flex-direction: column;
          gap: 16px;
          background: #141414;
          padding: 24px;
          border-radius: 16px;
          border: 1px solid #262626;
          transition: border-color 0.15s ease;
          box-shadow:
            0 0 0 1px rgba(255, 255, 255, 0.04),
            0 24px 48px -12px rgba(0, 0, 0, 0.6);
          animation: qaCardIn 200ms cubic-bezier(0.16, 1, 0.3, 1);
          width: ${isControlled ? '540px' : 'auto'};
          max-width: ${isControlled ? '90vw' : 'none'};
        }

        .qa-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
        }

        .qa-title {
          color: #fafafa;
          font-size: 15px;
          font-weight: 600;
        }

        .qa-close {
          padding: 6px;
          background: transparent;
          border: none;
          color: #525252;
          cursor: pointer;
          border-radius: 6px;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: color 0.15s ease;
        }

        .qa-close:hover {
          color: #a3a3a3;
        }

        .qa-file-preview {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 12px 14px;
          background: #0f1a0f;
          border: 1px solid #1a3a1a;
          border-radius: 12px;
        }

        .qa-file-icon {
          width: 40px;
          height: 40px;
          border-radius: 8px;
          background: rgba(239, 68, 68, 0.1);
          border: 1px solid rgba(239, 68, 68, 0.2);
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }

        .qa-input-wrapper {
          position: relative;
          border-radius: 12px;
          border: 1px solid #262626;
          background: #0a0a0a;
          transition: all 0.15s ease;
        }

        .qa-input-wrapper:focus-within {
          border-color: #333;
        }

        .qa-input-wrapper.dragging {
          border: 2px dashed #555;
          background: rgba(136, 136, 136, 0.05);
        }

        .qa-drag-overlay {
          position: absolute;
          inset: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(136, 136, 136, 0.05);
          border-radius: 12px;
          z-index: 10;
          pointer-events: none;
        }

        .qa-textarea {
          width: 100%;
          min-height: 120px;
          max-height: 300px;
          padding: 16px 18px;
          background: transparent;
          border: none;
          color: #fafafa;
          font-size: 15px;
          font-family: inherit;
          outline: none;
          resize: none;
          line-height: 1.6;
          transition: opacity 0.15s ease;
        }

        .qa-textarea::placeholder {
          color: #525252;
        }

        .qa-footer {
          display: flex;
          align-items: center;
          justify-content: space-between;
        }

        .qa-hint {
          font-size: 11px;
          color: #525252;
        }

        .qa-hint kbd {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          padding: 2px 6px;
          background: #262626;
          border-radius: 4px;
          font-size: 10px;
          font-family: inherit;
          color: #737373;
          border: 1px solid #333;
        }

        .qa-hint-sep {
          margin: 0 2px;
        }

        .qa-submit {
          width: 36px;
          height: 36px;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 0;
          background: #262626;
          border: none;
          border-radius: 10px;
          color: #525252;
          cursor: default;
          transition: all 0.2s ease;
        }

        .qa-submit.active {
          background: #333;
          color: #e5e5e5;
          cursor: pointer;
        }

        .qa-submit.active:hover {
          background: #555;
          transform: translateY(-1px);
          box-shadow: 0 4px 12px rgba(136, 136, 136, 0.3);
        }

        .qa-spinner {
          width: 14px;
          height: 14px;
          border: 2px solid #0a0a0a;
          border-top-color: transparent;
          border-radius: 50%;
          animation: qaSpin 0.8s linear infinite;
        }

        @keyframes qaCardIn {
          from {
            opacity: 0;
            transform: scale(0.96) translateY(-8px);
          }
          to {
            opacity: 1;
            transform: scale(1) translateY(0);
          }
        }

        @keyframes qaSpin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );

  // In controlled mode, wrap with blurred backdrop + portal
  if (isControlled) {
    const backdrop = (
      <div
        className="qa-backdrop"
        onClick={handleClose}
      >
        <div className="qa-container">
          {modalContent}
        </div>

        <style jsx>{`
          .qa-backdrop {
            position: fixed;
            inset: 0;
            background: rgba(0, 0, 0, 0.85);
            backdrop-filter: blur(8px);
            display: flex;
            justify-content: center;
            padding-top: 15vh;
            z-index: 9999;
            animation: qaBackdropIn 200ms ease-out;
          }

          .qa-container {
            width: 100%;
            max-width: 540px;
          }

          @keyframes qaBackdropIn {
            from { opacity: 0; }
            to { opacity: 1; }
          }
        `}</style>
      </div>
    );

    return typeof window !== 'undefined' ? createPortal(backdrop, document.body) : null;
  }

  // Uncontrolled mode - render with absolute positioning
  return (
    <div style={{
      position: 'absolute',
      top: '60px',
      left: '20px',
      right: '20px',
      zIndex: 100,
    }}>
      {modalContent}
    </div>
  );
}
