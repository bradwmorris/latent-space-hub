"use client";

import { useState, useEffect, useRef } from 'react';
import DimensionSearchModal from './DimensionSearchModal';

interface DimensionTagsProps {
  dimensions: string[];
  priorityDimensions?: string[];
  onUpdate: (dimensions: string[]) => Promise<void>;
  onPriorityToggle?: (dimension: string) => Promise<void>;
  disabled?: boolean;
}

interface DimensionSuggestion {
  dimension: string;
  count: number;
}

export default function DimensionTags({ 
  dimensions, 
  priorityDimensions = [],
  onUpdate, 
  onPriorityToggle,
  disabled = false 
}: DimensionTagsProps) {
  const [isAdding, setIsAdding] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [suggestions, setSuggestions] = useState<DimensionSuggestion[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Sort dimensions with priority ones first
  const sortedDimensions = [...dimensions].sort((a, b) => {
    const aPriority = priorityDimensions.includes(a);
    const bPriority = priorityDimensions.includes(b);
    if (aPriority && !bPriority) return -1;
    if (!aPriority && bPriority) return 1;
    return 0;
  });

  useEffect(() => {
    if (isAdding && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isAdding]);

  useEffect(() => {
    if (searchQuery.length > 0) {
      fetchSuggestions(searchQuery);
    } else if (isAdding) {
      // Load popular dimensions when field is empty
      fetchPopularDimensions();
    } else {
      setSuggestions([]);
    }
  }, [searchQuery, isAdding]);

  const fetchSuggestions = async (query: string) => {
    setIsLoading(true);
    try {
      const response = await fetch(`/api/dimensions/search?q=${encodeURIComponent(query)}`);
      const data = await response.json();
      if (data.success) {
        setSuggestions(data.data);
      }
    } catch (error) {
      console.error('Error fetching dimension suggestions:', error);
      setSuggestions([]);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchPopularDimensions = async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/dimensions/popular');
      const data = await response.json();
      if (data.success) {
        setSuggestions(data.data);
      }
    } catch (error) {
      console.error('Error fetching popular dimensions:', error);
      setSuggestions([]);
    } finally {
      setIsLoading(false);
    }
  };

  const addDimension = async (dimension: string, description?: string) => {
    if (!dimension.trim() || dimensions.includes(dimension.trim())) {
      return;
    }

    // If description is provided, create/update the dimension in the database first
    if (description) {
      try {
        await fetch('/api/dimensions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: dimension.trim(),
            description: description.trim(),
            isPriority: false
          })
        });
      } catch (error) {
        console.error('Error creating dimension with description:', error);
      }
    }

    const newDimensions = [...dimensions, dimension.trim()];
    await onUpdate(newDimensions);

    setSearchQuery('');
    setSuggestions([]);
    setIsAdding(false);
  };

  const removeDimension = async (index: number) => {
    const dimension = sortedDimensions[index];
    const newDimensions = dimensions.filter(d => d !== dimension);
    await onUpdate(newDimensions);
  };

  const handleDragStart = (index: number) => {
    setDraggedIndex(index);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === index) return;

    const draggedDimension = sortedDimensions[draggedIndex];
    const targetDimension = sortedDimensions[index];
    
    // Find original positions in unsorted array
    const draggedOrigIndex = dimensions.indexOf(draggedDimension);
    const targetOrigIndex = dimensions.indexOf(targetDimension);
    
    const newDimensions = [...dimensions];
    newDimensions.splice(draggedOrigIndex, 1);
    newDimensions.splice(targetOrigIndex, 0, draggedDimension);
    
    onUpdate(newDimensions);
    setDraggedIndex(index);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
  };

  const moveDimension = async (fromIndex: number, direction: 'up' | 'down') => {
    const toIndex = direction === 'up' ? fromIndex - 1 : fromIndex + 1;
    if (toIndex < 0 || toIndex >= sortedDimensions.length) return;

    const fromDimension = sortedDimensions[fromIndex];
    const toDimension = sortedDimensions[toIndex];
    
    // Find original positions in unsorted array
    const fromOrigIndex = dimensions.indexOf(fromDimension);
    const toOrigIndex = dimensions.indexOf(toDimension);
    
    const newDimensions = [...dimensions];
    [newDimensions[fromOrigIndex], newDimensions[toOrigIndex]] = [newDimensions[toOrigIndex], newDimensions[fromOrigIndex]];
    await onUpdate(newDimensions);
  };

  const togglePriority = async (dimension: string) => {
    if (onPriorityToggle) {
      await onPriorityToggle(dimension);
    }
  };

  // Check if dimensions overflow 2 lines (approximate)
  const shouldShowExpandButton = sortedDimensions.length > 6; // Rough estimate for 2 lines
  const displayedDimensions = (!isExpanded && shouldShowExpandButton) 
    ? sortedDimensions.slice(0, 6) 
    : sortedDimensions;
  const hiddenCount = sortedDimensions.length - 6;

  return (
    <div>
      <div 
        ref={containerRef}
        onClick={() => {
          if (shouldShowExpandButton && !isExpanded) {
            setIsExpanded(true);
          }
        }}
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '6px',
          marginBottom: '8px',
          cursor: (shouldShowExpandButton && !isExpanded) ? 'pointer' : 'default',
          position: 'relative',
          minHeight: dimensions.length === 0 ? '24px' : 'auto'
        }}
      >
        {/* Show placeholder when no dimensions */}
        {dimensions.length === 0 && !disabled && (
          <span style={{
            fontSize: '11px',
            color: '#555',
            fontStyle: 'italic',
            display: 'flex',
            alignItems: 'center',
            gap: '4px'
          }}>
            No dimensions
          </span>
        )}

        {displayedDimensions.map((dimension, index) => {
          const isPriority = priorityDimensions.includes(dimension);
          
          return (
            <div
              key={`${dimension}-${index}`}
              draggable={!disabled}
              onDragStart={() => handleDragStart(index)}
              onDragOver={(e) => handleDragOver(e, index)}
              onDragEnd={handleDragEnd}
              onClick={(e) => {
                e.stopPropagation();
                if (!disabled && onPriorityToggle) {
                  togglePriority(dimension);
                }
              }}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '3px',
                fontSize: '10px',
                color: isPriority ? '#ccc' : '#d1d5db',
                background: isPriority ? '#1a1a1a' : '#1a1a1a',
                border: isPriority ? '1px solid #555' : '1px solid #333',
                borderRadius: '8px',
                padding: '2px 6px',
                cursor: disabled ? 'default' : (onPriorityToggle ? 'pointer' : 'grab'),
                opacity: draggedIndex === index ? 0.5 : 1,
                transition: 'all 0.2s'
              }}
              onMouseEnter={(e) => {
                if (!disabled) {
                  e.currentTarget.style.borderColor = isPriority ? '#888' : '#555';
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = isPriority ? '#555' : '#333';
              }}
              title={isPriority ? 'Priority dimension (click to unpin)' : 'Click to pin as priority dimension'}
            >
              <span>{dimension}</span>
              
              {/* Reorder buttons removed - no longer needed */}
              
              {/* Remove button */}
              {!disabled && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    removeDimension(index);
                  }}
                  style={{
                    padding: '0 2px',
                    fontSize: '14px',
                    color: '#666',
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    marginLeft: '2px'
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = '#ff6b6b'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = '#666'; }}
                >
                  ×
                </button>
              )}
            </div>
          );
        })}
        
        {/* Show "+X more" indicator */}
        {shouldShowExpandButton && !isExpanded && hiddenCount > 0 && (
          <div
            onClick={(e) => {
              e.stopPropagation();
              setIsExpanded(true);
            }}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              fontSize: '11px',
              color: '#666',
              background: 'transparent',
              border: '1px dashed #333',
              borderRadius: '12px',
              padding: '2px 8px',
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = '#999';
              e.currentTarget.style.borderColor = '#444';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = '#666';
              e.currentTarget.style.borderColor = '#333';
            }}
          >
            +{hiddenCount} more
          </div>
        )}
        
        {/* Collapse button when expanded */}
        {isExpanded && shouldShowExpandButton && (
          <div
            onClick={(e) => {
              e.stopPropagation();
              setIsExpanded(false);
            }}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              fontSize: '11px',
              color: '#666',
              background: 'transparent',
              border: '1px dashed #333',
              borderRadius: '12px',
              padding: '2px 8px',
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = '#999';
              e.currentTarget.style.borderColor = '#444';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = '#666';
              e.currentTarget.style.borderColor = '#333';
            }}
          >
            show less
          </div>
        )}
        
        {/* Add dimension button - Opens modal */}
        {!disabled && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setIsAdding(true);
            }}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              fontSize: '11px',
              fontWeight: 600,
              color: '#999',
              textTransform: 'uppercase',
              letterSpacing: '0.1em',
              borderBottom: '1px solid #1a1a1a',
              background: '#0a0a0a',
              border: 'none',
              cursor: 'pointer',
              padding: '8px 12px',
              borderRadius: '8px',
              transition: 'all 0.2s'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = '#151515';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = '#0a0a0a';
            }}
            title="Add dimension"
          >
            <span style={{ 
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '16px',
              height: '16px',
              borderRadius: '50%',
              background: '#555',
              color: '#0a0a0a',
              fontSize: '12px',
              lineHeight: 1,
              fontWeight: 300,
              flexShrink: 0
            }}>+</span>
            Add
          </button>
        )}
      </div>

      {/* Dimension Search Modal */}
      <DimensionSearchModal
        isOpen={isAdding}
        onClose={() => setIsAdding(false)}
        onDimensionSelect={(dim, description) => {
          addDimension(dim, description);
        }}
        existingDimensions={dimensions}
      />
    </div>
  );
}
