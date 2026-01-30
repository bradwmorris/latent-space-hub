"use client";

import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface NodeLabelInlineProps {
  id: string;
  title: string;
  onNodeClick?: (nodeId: number) => void;
}

function NodeLabelInline({ id, title, onNodeClick }: NodeLabelInlineProps) {
  const handleClick = (e: React.MouseEvent) => {
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
    <span
      onClick={handleClick}
      title={showTooltip ? title : undefined}
      style={{
        display: 'inline',
        cursor: 'pointer',
        verticalAlign: 'baseline'
      }}
    >
      <span
        style={{
          display: 'inline',
          padding: '2px 6px',
          background: '#9333ea',
          color: '#000',
          borderRadius: '3px',
          fontSize: '11px',
          fontWeight: '600',
          marginRight: '4px',
          lineHeight: '1',
          verticalAlign: 'baseline'
        }}
      >
        {id}
      </span>
      <span style={{
        fontWeight: 'bold',
        textDecoration: 'underline',
        color: '#e5e5e5'
      }}>
        {truncatedTitle}
      </span>
    </span>
  );
}

// Pattern to match [NODE:id:"title"]
const nodePattern = /\[NODE:\s*(\d+)\s*:\s*["""'](.+?)["""']\s*\]/g;

interface MarkdownWithNodeTokensProps {
  content: string;
  onNodeClick?: (nodeId: number) => void;
}

export default function MarkdownWithNodeTokens({ content, onNodeClick }: MarkdownWithNodeTokensProps) {
  if (!content) return null;

  // Store placeholders and their node data
  const placeholders: { id: string; title: string }[] = [];

  // Replace node tokens with placeholders before markdown parsing
  nodePattern.lastIndex = 0;
  const contentWithPlaceholders = content.replace(nodePattern, (_match, id, title) => {
    const index = placeholders.length;
    placeholders.push({ id, title });
    return `%%NODE_PLACEHOLDER_${index}%%`;
  });

  // Helper function to process text and replace placeholders with components
  const processText = (text: string, keyPrefix: string): React.ReactNode => {
    const placeholderPattern = /%%NODE_PLACEHOLDER_(\d+)%%/g;
    const parts: React.ReactNode[] = [];
    let lastIdx = 0;
    let m;
    let matchCount = 0;

    placeholderPattern.lastIndex = 0;

    while ((m = placeholderPattern.exec(text)) !== null) {
      if (m.index > lastIdx) {
        parts.push(text.substring(lastIdx, m.index));
      }

      const placeholderIndex = parseInt(m[1]);
      const nodeData = placeholders[placeholderIndex];
      if (nodeData) {
        parts.push(
          <NodeLabelInline
            key={`${keyPrefix}-node-${nodeData.id}-${matchCount}`}
            id={nodeData.id}
            title={nodeData.title}
            onNodeClick={onNodeClick}
          />
        );
      }

      lastIdx = m.index + m[0].length;
      matchCount++;
    }

    if (lastIdx < text.length) {
      parts.push(text.substring(lastIdx));
    }

    return parts.length > 0 ? <>{parts}</> : text;
  };

  // Recursively process children to replace placeholders
  const processChildren = (children: React.ReactNode, keyPrefix: string): React.ReactNode => {
    return React.Children.map(children, (child, index) => {
      if (typeof child === 'string') {
        return processText(child, `${keyPrefix}-${index}`);
      }
      if (React.isValidElement(child)) {
        const childElement = child as React.ReactElement<{ children?: React.ReactNode }>;
        if (childElement.props.children !== undefined) {
          return React.cloneElement(childElement, {
            children: processChildren(childElement.props.children, `${keyPrefix}-${index}`)
          });
        }
      }
      return child;
    });
  };

  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        // Style headings
        h1: ({ children }) => (
          <h1 style={{ fontSize: '1.5em', fontWeight: 'bold', marginTop: '16px', marginBottom: '8px', color: '#e5e5e5' }}>
            {processChildren(children, 'h1')}
          </h1>
        ),
        h2: ({ children }) => (
          <h2 style={{ fontSize: '1.3em', fontWeight: 'bold', marginTop: '14px', marginBottom: '6px', color: '#e5e5e5' }}>
            {processChildren(children, 'h2')}
          </h2>
        ),
        h3: ({ children }) => (
          <h3 style={{ fontSize: '1.1em', fontWeight: 'bold', marginTop: '12px', marginBottom: '4px', color: '#e5e5e5' }}>
            {processChildren(children, 'h3')}
          </h3>
        ),
        // Style paragraphs
        p: ({ children }) => (
          <p style={{ marginTop: '8px', marginBottom: '8px', lineHeight: '1.7' }}>
            {processChildren(children, 'p')}
          </p>
        ),
        // Style bold/italic
        strong: ({ children }) => (
          <strong style={{ fontWeight: 'bold', color: '#f5f5f5' }}>
            {processChildren(children, 'strong')}
          </strong>
        ),
        em: ({ children }) => (
          <em style={{ fontStyle: 'italic' }}>
            {processChildren(children, 'em')}
          </em>
        ),
        // Style lists
        ul: ({ children }) => (
          <ul style={{ marginLeft: '20px', marginTop: '8px', marginBottom: '8px', listStyleType: 'disc' }}>
            {processChildren(children, 'ul')}
          </ul>
        ),
        ol: ({ children }) => (
          <ol style={{ marginLeft: '20px', marginTop: '8px', marginBottom: '8px', listStyleType: 'decimal' }}>
            {processChildren(children, 'ol')}
          </ol>
        ),
        li: ({ children }) => (
          <li style={{ marginBottom: '4px' }}>
            {processChildren(children, 'li')}
          </li>
        ),
        // Style links
        a: ({ href, children }) => (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: '#9333ea', textDecoration: 'underline' }}
          >
            {processChildren(children, 'a')}
          </a>
        ),
        // Style code
        code: ({ children, className }) => {
          const isInline = !className;
          if (isInline) {
            return (
              <code style={{
                background: '#1a1a1a',
                padding: '2px 4px',
                borderRadius: '3px',
                fontSize: '0.9em',
                fontFamily: 'monospace'
              }}>
                {processChildren(children, 'code')}
              </code>
            );
          }
          return (
            <code style={{ fontFamily: 'monospace' }}>
              {processChildren(children, 'code-block')}
            </code>
          );
        },
        pre: ({ children }) => (
          <pre style={{
            background: '#1a1a1a',
            padding: '12px',
            borderRadius: '4px',
            overflow: 'auto',
            marginTop: '8px',
            marginBottom: '8px'
          }}>
            {children}
          </pre>
        ),
        // Style blockquotes
        blockquote: ({ children }) => (
          <blockquote style={{
            borderLeft: '3px solid #333',
            paddingLeft: '12px',
            marginLeft: '0',
            marginTop: '8px',
            marginBottom: '8px',
            color: '#999'
          }}>
            {processChildren(children, 'blockquote')}
          </blockquote>
        )
      }}
    >
      {contentWithPlaceholders}
    </ReactMarkdown>
  );
}
