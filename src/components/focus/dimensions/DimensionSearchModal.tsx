"use client";

import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

interface DimensionSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onDimensionSelect: (dimension: string, description?: string) => void;
  existingDimensions: string[];
}

interface DimensionSuggestion {
  dimension: string;
  count: number;
  isPriority: boolean;
}

export default function DimensionSearchModal({ 
  isOpen, 
  onClose, 
  onDimensionSelect,
  existingDimensions 
}: DimensionSearchModalProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [suggestions, setSuggestions] = useState<DimensionSuggestion[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [newDimensionDescription, setNewDimensionDescription] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  // Store the element that triggered the modal for return focus
  useEffect(() => {
    if (isOpen && document.activeElement instanceof HTMLElement) {
      returnFocusRef.current = document.activeElement;
    }
  }, [isOpen]);

  // Focus trap and accessibility
  useEffect(() => {
    if (!isOpen) return;

    // Autofocus input
    inputRef.current?.focus();

    // Lock body scroll
    document.body.style.overflow = 'hidden';

    // Handle Escape key
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };

    // Focus trap: keep focus within modal
    const handleTab = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      
      const focusableElements = modalRef.current?.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      
      if (!focusableElements || focusableElements.length === 0) return;
      
      const firstElement = focusableElements[0] as HTMLElement;
      const lastElement = focusableElements[focusableElements.length - 1] as HTMLElement;
      
      if (e.shiftKey) {
        if (document.activeElement === firstElement) {
          e.preventDefault();
          lastElement.focus();
        }
      } else {
        if (document.activeElement === lastElement) {
          e.preventDefault();
          firstElement.focus();
        }
      }
    };

    document.addEventListener('keydown', handleEscape);
    document.addEventListener('keydown', handleTab);

    return () => {
      document.body.style.overflow = '';
      document.removeEventListener('keydown', handleEscape);
      document.removeEventListener('keydown', handleTab);
      
      // Return focus to trigger element
      if (returnFocusRef.current) {
        returnFocusRef.current.focus();
      }
    };
  }, [isOpen, onClose]);

  // Track if we're in "create new" mode to avoid re-fetching
  const isCreatingNew = searchQuery.trim() &&
    !suggestions.some(s => s.dimension.toLowerCase() === searchQuery.toLowerCase().trim());

  // Fetch dimension suggestions
  useEffect(() => {
    const fetchSuggestions = async () => {
      try {
        const response = await fetch('/api/dimensions/popular?limit=50');
        const result = await response.json();

        if (result.success) {
          const allDimensions: DimensionSuggestion[] = result.data;

          // Filter based on search query and exclude existing dimensions
          const filtered = allDimensions.filter(dim => {
            const matchesQuery = !searchQuery.trim() ||
              dim.dimension.toLowerCase().includes(searchQuery.toLowerCase());
            const notExisting = !existingDimensions.includes(dim.dimension);
            return matchesQuery && notExisting;
          });

          // Sort: priority first, then by count
          const sorted = filtered.sort((a, b) => {
            if (a.isPriority && !b.isPriority) return -1;
            if (!a.isPriority && b.isPriority) return 1;
            return b.count - a.count;
          });

          setSuggestions(sorted.slice(0, 20));
          setSelectedIndex(0);
        }
      } catch (error) {
        console.error('Error fetching dimension suggestions:', error);
        setSuggestions([]);
      }
    };

    // Only fetch when modal is open and we're not actively creating a new dimension
    // (user has typed description means they're committing to create)
    if (isOpen && !newDimensionDescription.trim()) {
      const timeoutId = setTimeout(fetchSuggestions, 100);
      return () => clearTimeout(timeoutId);
    }
  }, [searchQuery, existingDimensions, isOpen, newDimensionDescription]);

  // Handle keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => Math.min(prev + 1, suggestions.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();

      if (suggestions[selectedIndex]) {
        // Select existing dimension
        handleSelectDimension(suggestions[selectedIndex].dimension);
      } else if (searchQuery.trim()) {
        // Create new dimension with description
        handleSelectDimension(searchQuery.trim(), newDimensionDescription.trim() || undefined);
      }
    }
  };

  const handleSelectDimension = (dimension: string, description?: string) => {
    onDimensionSelect(dimension, description);
    setSearchQuery('');
    setNewDimensionDescription('');
    setSuggestions([]);
    onClose();
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  if (!isOpen) return null;

  const canCreateNew = searchQuery.trim() && 
    !suggestions.some(s => s.dimension.toLowerCase() === searchQuery.toLowerCase());

  const modalContent = (
    <div
      className="search-backdrop"
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-label="Search dimensions"
    >
      <div ref={modalRef} className="search-container" onClick={(e) => e.stopPropagation()}>
        {/* Search Input */}
        <div className="search-input-wrapper">
          <svg className="search-icon" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z" clipRule="evenodd" />
          </svg>
          
          <input
            ref={inputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search or create dimension..."
            className="search-input"
          />
          
          <div className="search-shortcut">
            <kbd>esc</kbd>
          </div>
        </div>

        {/* Results */}
        {suggestions.length > 0 && (
          <div className="search-results">
            {suggestions.map((suggestion, index) => (
              <button
                key={suggestion.dimension}
                onClick={() => handleSelectDimension(suggestion.dimension)}
                onMouseEnter={() => setSelectedIndex(index)}
                className={`search-result-item ${index === selectedIndex ? 'selected' : ''}`}
              >
                <span className={`result-name ${suggestion.isPriority ? 'priority' : ''}`}>
                  {suggestion.dimension}
                </span>
                <span className="result-count">{suggestion.count}</span>
                {index === selectedIndex && (
                  <span className="result-hint">↵</span>
                )}
              </button>
            ))}
          </div>
        )}

        {/* Create New Option */}
        {canCreateNew && (
          <div
            className="search-create"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="create-header">
              <span className="create-icon">+</span>
              <span className="create-title">Create &quot;{searchQuery.trim()}&quot;</span>
            </div>
            <div className="description-input-wrapper">
              <textarea
                ref={textareaRef}
                value={newDimensionDescription}
                onChange={(e) => setNewDimensionDescription(e.target.value.slice(0, 500))}
                onFocus={(e) => e.stopPropagation()}
                onClick={(e) => e.stopPropagation()}
                placeholder="Describe what belongs in this dimension..."
                className="description-input"
                rows={2}
              />
              <span className="description-counter">{newDimensionDescription.length}/500</span>
            </div>
            {!newDimensionDescription.trim() && (
              <div className="description-warning">
                Dimensions without descriptions may not auto-assign correctly
              </div>
            )}
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleSelectDimension(searchQuery.trim(), newDimensionDescription.trim() || undefined);
              }}
              onMouseEnter={() => setSelectedIndex(suggestions.length)}
              className={`create-button ${selectedIndex === suggestions.length ? 'selected' : ''}`}
            >
              Create Dimension
            </button>
          </div>
        )}

        {/* Empty state */}
        {!searchQuery && suggestions.length === 0 && (
          <div className="search-empty">
            Start typing to search dimensions
          </div>
        )}
      </div>

      <style jsx>{`
        .search-backdrop {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.85);
          backdrop-filter: blur(8px);
          display: flex;
          justify-content: center;
          padding-top: 15vh;
          z-index: 9999;
          animation: backdropIn 200ms ease-out;
        }
        
        .search-container {
          width: 100%;
          max-width: 640px;
          max-height: 70vh;
          animation: containerIn 200ms cubic-bezier(0.16, 1, 0.3, 1);
        }
        
        .search-input-wrapper {
          display: flex;
          align-items: center;
          gap: 16px;
          background: var(--bg-hover);
          border: 1px solid var(--border-default);
          border-radius: 16px;
          padding: 20px 24px;
          box-shadow: 
            0 0 0 1px rgba(255, 255, 255, 0.04),
            0 24px 48px -12px rgba(0, 0, 0, 0.6);
        }
        
        .search-icon {
          width: 22px;
          height: 22px;
          color: var(--text-secondary);
          flex-shrink: 0;
        }
        
        .search-input {
          flex: 1;
          background: none;
          border: none;
          outline: none;
          color: var(--text-primary);
          font-size: 18px;
          font-family: inherit;
          font-weight: 400;
        }
        
        .search-input::placeholder {
          color: var(--text-secondary);
        }
        
        .search-shortcut {
          display: flex;
          align-items: center;
          gap: 4px;
        }
        
        .search-shortcut kbd {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          padding: 4px 8px;
          background: var(--border-default);
          border-radius: 6px;
          font-size: 11px;
          font-family: inherit;
          color: var(--text-muted);
          border: 1px solid var(--border-default);
        }
        
        .search-results {
          margin-top: 8px;
          background: var(--bg-hover);
          border: 1px solid var(--border-default);
          border-radius: 16px;
          overflow: hidden;
          box-shadow: 
            0 0 0 1px rgba(255, 255, 255, 0.04),
            0 24px 48px -12px rgba(0, 0, 0, 0.6);
          animation: resultsIn 150ms ease-out;
        }
        
        .search-result-item {
          width: 100%;
          display: flex;
          align-items: center;
          gap: 14px;
          padding: 16px 20px;
          background: transparent;
          border: none;
          border-bottom: 1px solid var(--bg-elevated);
          cursor: pointer;
          transition: background 100ms ease;
          text-align: left;
          font-family: inherit;
        }
        
        .search-result-item:last-child {
          border-bottom: none;
        }
        
        .search-result-item:hover,
        .search-result-item.selected {
          background: var(--bg-elevated);
        }
        
        .result-name {
          flex: 1;
          color: var(--text-primary);
          font-size: 15px;
        }
        
        .result-name.priority {
          color: var(--text-secondary);
        }
        
        .result-count {
          color: var(--text-secondary);
          font-size: 12px;
          font-family: 'SF Mono', 'Fira Code', monospace;
        }
        
        .result-hint {
          color: var(--text-secondary);
          font-size: 13px;
        }
        
        .search-create {
          margin-top: 8px;
          background: var(--bg-hover);
          border: 1px solid var(--border-default);
          border-radius: 16px;
          overflow: hidden;
          padding: 16px 20px;
          box-shadow:
            0 0 0 1px rgba(255, 255, 255, 0.04),
            0 24px 48px -12px rgba(0, 0, 0, 0.6);
        }

        .create-header {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-bottom: 12px;
        }

        .create-title {
          color: var(--text-secondary);
          font-size: 15px;
          font-weight: 500;
        }

        .description-input-wrapper {
          position: relative;
          margin-bottom: 8px;
        }

        .description-input {
          width: 100%;
          padding: 12px;
          background: var(--bg-base);
          border: 1px solid var(--border-default);
          border-radius: 8px;
          color: var(--text-primary);
          font-size: 14px;
          font-family: inherit;
          resize: none;
          outline: none;
          transition: border-color 150ms ease;
        }

        .description-input:focus {
          border-color: var(--text-secondary);
        }

        .description-input::placeholder {
          color: var(--text-secondary);
        }

        .description-counter {
          position: absolute;
          bottom: 8px;
          right: 12px;
          font-size: 11px;
          color: var(--text-secondary);
          font-family: 'SF Mono', 'Fira Code', monospace;
        }

        .description-warning {
          margin-bottom: 12px;
          padding: 8px 12px;
          background: rgba(234, 179, 8, 0.1);
          border: 1px solid rgba(234, 179, 8, 0.2);
          border-radius: 6px;
          color: #eab308;
          font-size: 12px;
        }

        .create-button {
          width: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          padding: 12px 16px;
          background: var(--bg-elevated);
          border: 1px solid var(--border-default);
          border-radius: 8px;
          cursor: pointer;
          transition: background 100ms ease;
          font-family: inherit;
          color: var(--text-secondary);
          font-size: 14px;
          font-weight: 500;
        }

        .create-button:hover,
        .create-button.selected {
          background: var(--border-default);
        }

        .create-icon {
          font-size: 18px;
          font-weight: 300;
          color: var(--text-secondary);
        }
        
        .search-empty {
          margin-top: 8px;
          padding: 32px 24px;
          background: var(--bg-hover);
          border: 1px solid var(--border-default);
          border-radius: 16px;
          color: var(--text-secondary);
          font-size: 14px;
          text-align: center;
        }
        
        @keyframes backdropIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        
        @keyframes containerIn {
          from { 
            opacity: 0;
            transform: scale(0.96) translateY(-8px);
          }
          to { 
            opacity: 1;
            transform: scale(1) translateY(0);
          }
        }
        
        @keyframes resultsIn {
          from { 
            opacity: 0;
            transform: translateY(-4px);
          }
          to { 
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  );

  return typeof window !== 'undefined' ? createPortal(modalContent, document.body) : null;
}
