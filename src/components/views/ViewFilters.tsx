"use client";

import { useState } from 'react';
import { X, Plus, ChevronDown } from 'lucide-react';
import { ViewFilter } from '@/types/views';

interface ViewFiltersProps {
  filters: ViewFilter[];
  filterLogic: 'and' | 'or';
  dimensions: string[];
  onFilterChange: (filters: ViewFilter[]) => void;
  onFilterLogicChange: (logic: 'and' | 'or') => void;
}

export default function ViewFilters({
  filters,
  filterLogic,
  dimensions,
  onFilterChange,
  onFilterLogicChange
}: ViewFiltersProps) {
  const [showDimensionPicker, setShowDimensionPicker] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const handleAddFilter = (dimension: string) => {
    if (!filters.some(f => f.dimension === dimension)) {
      onFilterChange([...filters, { dimension, operator: 'includes' }]);
    }
    setShowDimensionPicker(false);
    setSearchQuery('');
  };

  const handleRemoveFilter = (dimension: string) => {
    onFilterChange(filters.filter(f => f.dimension !== dimension));
  };

  const handleToggleOperator = (dimension: string) => {
    onFilterChange(filters.map(f =>
      f.dimension === dimension
        ? { ...f, operator: f.operator === 'includes' ? 'excludes' : 'includes' }
        : f
    ));
  };

  const filteredDimensions = dimensions.filter(d =>
    d.toLowerCase().includes(searchQuery.toLowerCase()) &&
    !filters.some(f => f.dimension === d)
  );

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      padding: '8px 12px',
      borderBottom: '1px solid var(--bg-elevated)',
      background: 'var(--bg-base)',
      flexWrap: 'wrap',
      minHeight: '40px'
    }}>
      <span style={{ fontSize: '11px', color: 'var(--accent-dark)', fontWeight: 500 }}>
        Filters:
      </span>

      {/* Filter Chips */}
      {filters.map(filter => (
        <div
          key={filter.dimension}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            padding: '4px 8px',
            background: filter.operator === 'includes' ? 'var(--bg-elevated)' : '#2a1515',
            border: `1px solid ${filter.operator === 'includes' ? 'var(--accent-dark)' : '#7f1d1d'}`,
            borderRadius: '4px',
            fontSize: '11px',
            color: filter.operator === 'includes' ? 'var(--accent-primary)' : 'var(--error)'
          }}
        >
          <button
            onClick={() => handleToggleOperator(filter.dimension)}
            style={{
              background: 'none',
              border: 'none',
              padding: '0 2px',
              cursor: 'pointer',
              color: 'inherit',
              fontSize: '10px',
              opacity: 0.7
            }}
            title={filter.operator === 'includes' ? 'Click to exclude' : 'Click to include'}
          >
            {filter.operator === 'includes' ? '+' : '-'}
          </button>
          <span>{filter.dimension}</span>
          <button
            onClick={() => handleRemoveFilter(filter.dimension)}
            style={{
              background: 'none',
              border: 'none',
              padding: '0',
              cursor: 'pointer',
              color: 'inherit',
              display: 'flex',
              alignItems: 'center'
            }}
          >
            <X size={12} />
          </button>
        </div>
      ))}

      {/* Add Filter Button */}
      <div style={{ position: 'relative' }}>
        <button
          onClick={() => setShowDimensionPicker(!showDimensionPicker)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            padding: '4px 8px',
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border-default)',
            borderRadius: '4px',
            fontSize: '11px',
            color: 'var(--accent-primary)',
            cursor: 'pointer',
            transition: 'all 0.2s'
          }}
        >
          <Plus size={12} />
          Add
        </button>

        {/* Dimension Picker Dropdown */}
        {showDimensionPicker && (
          <div style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            marginTop: '4px',
            width: '200px',
            maxHeight: '300px',
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border-default)',
            borderRadius: '6px',
            overflow: 'hidden',
            zIndex: 100,
            boxShadow: '0 4px 12px rgba(0,0,0,0.5)'
          }}>
            <input
              type="text"
              placeholder="Search dimensions..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 12px',
                background: 'var(--bg-base)',
                border: 'none',
                borderBottom: '1px solid var(--border-default)',
                color: 'var(--text-primary)',
                fontSize: '12px',
                outline: 'none'
              }}
              autoFocus
            />
            <div style={{ maxHeight: '250px', overflowY: 'auto' }}>
              {filteredDimensions.length === 0 ? (
                <div style={{
                  padding: '12px',
                  fontSize: '12px',
                  color: 'var(--accent-dark)',
                  textAlign: 'center'
                }}>
                  No dimensions found
                </div>
              ) : (
                filteredDimensions.map(dim => (
                  <button
                    key={dim}
                    onClick={() => handleAddFilter(dim)}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      background: 'transparent',
                      border: 'none',
                      color: 'var(--text-primary)',
                      fontSize: '12px',
                      textAlign: 'left',
                      cursor: 'pointer',
                      transition: 'background 0.2s'
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--border-default)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                  >
                    {dim}
                  </button>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      {/* Logic Toggle */}
      {filters.length > 1 && (
        <button
          onClick={() => onFilterLogicChange(filterLogic === 'and' ? 'or' : 'and')}
          style={{
            padding: '4px 8px',
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border-default)',
            borderRadius: '4px',
            fontSize: '10px',
            fontWeight: 600,
            color: filterLogic === 'and' ? 'var(--accent-primary)' : '#3b82f6',
            cursor: 'pointer',
            textTransform: 'uppercase',
            letterSpacing: '0.05em'
          }}
          title={filterLogic === 'and' ? 'Match ALL filters' : 'Match ANY filter'}
        >
          {filterLogic}
        </button>
      )}

      {/* Click outside to close */}
      {showDimensionPicker && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 99
          }}
          onClick={() => setShowDimensionPicker(false)}
        />
      )}
    </div>
  );
}
