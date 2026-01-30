"use client";

import React from 'react';
import { FileText } from 'lucide-react';

interface NodeLabelProps {
  id: string;
  title: string;
  dimensions: string[];
  onNodeClick?: (nodeId: number) => void;
}

function NodeLabel({ id, title, dimensions, onNodeClick }: NodeLabelProps) {
  const handleClick = (e: React.MouseEvent) => {
    // Prevent bubbling into parent containers (e.g., content view onClick that toggles edit)
    e.stopPropagation();
    if (onNodeClick) {
      onNodeClick(parseInt(id));
    }
  };

  const maxTitleLength = 40;
  const truncatedTitle = title.length > maxTitleLength 
    ? `${title.substring(0, maxTitleLength)}...`
    : title;
  const showTooltip = title.length > maxTitleLength;

  return (
    <>
      {/* Clickable ID badge - inline with existing line height */}
      <span 
        onClick={handleClick}
        title={showTooltip ? title : undefined}
        style={{
          display: 'inline',
          padding: '2px 6px',
          background: '#9333ea',
          color: '#000',
          borderRadius: '3px',
          fontSize: '11px',
          fontWeight: '600',
          cursor: 'pointer',
          marginRight: '4px',
          lineHeight: '1', /* prevent line height issues */
          verticalAlign: 'baseline'
        }}
      >
        {id}
      </span>
      {/* Non-clickable title - bold and underlined */}
      <span style={{
        fontWeight: 'bold',
        textDecoration: 'underline',
        color: '#e5e5e5'
      }}>
        {truncatedTitle}
      </span>
    </>
  );
}

export function parseAndRenderContent(content: string, onNodeClick?: (nodeId: number) => void): React.ReactNode[] {
  if (!content) return [content];
  
  // Pattern to match [NODE:id:"title"] (dimensions removed)
  // Be tolerant of spaces and curly quotes
  // Use non-greedy match (.+?) to handle quotes inside titles
  const nodePattern = /\[NODE:\s*(\d+)\s*:\s*["""'](.+?)["""']\s*\]/g;
  
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match;
  
  while ((match = nodePattern.exec(content)) !== null) {
    // Add text before the node
    if (match.index > lastIndex) {
      parts.push(content.substring(lastIndex, match.index));
    }
    
    // Parse the node data
    const id = match[1];
    const title = match[2];
    const dimensions: string[] = []; // No dimensions in new format
    
    // Add the node label
    parts.push(
      <NodeLabel
        key={`node-${id}-${match.index}`}
        id={id}
        title={title}
        dimensions={dimensions}
        onNodeClick={onNodeClick}
      />
    );
    
    lastIndex = match.index + match[0].length;
  }
  
  // Add any remaining text
  if (lastIndex < content.length) {
    parts.push(content.substring(lastIndex));
  }
  
  return parts.length > 0 ? parts : [content];
}
