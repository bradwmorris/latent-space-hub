"use client";

import { useState, useEffect, useRef } from 'react';
import { ArrowLeft, Menu, X } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface Section {
  id: string;
  title: string;
}

interface DocsLayoutProps {
  content: string;
  title: string;
  description: string;
}

function extractSections(markdown: string): Section[] {
  const sections: Section[] = [];
  const lines = markdown.split('\n');
  for (const line of lines) {
    const match = line.match(/^# (.+)$/);
    if (match) {
      const title = match[1];
      const id = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
      sections.push({ id, title });
    }
  }
  return sections;
}

export default function DocsLayout({ content, title, description }: DocsLayoutProps) {
  const [activeSection, setActiveSection] = useState<string>('');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const sections = extractSections(content);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveSection(entry.target.id);
          }
        }
      },
      { rootMargin: '-80px 0px -60% 0px', threshold: 0 }
    );

    const headings = contentRef.current?.querySelectorAll('h1[id]');
    headings?.forEach((h) => observer.observe(h));
    return () => observer.disconnect();
  }, [content]);

  const scrollToSection = (id: string) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setMobileNavOpen(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: '#0a0a0a',
      color: '#ccc',
      fontFamily: "'JetBrains Mono', 'SF Mono', 'Fira Code', 'Consolas', monospace",
    }}>
      {/* Top bar */}
      <header style={{
        position: 'sticky',
        top: 0,
        zIndex: 100,
        background: '#0a0a0a',
        borderBottom: '1px solid #1a1a1a',
        padding: '12px 24px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <a
            href="/"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              color: '#888',
              textDecoration: 'none',
              fontSize: '13px',
            }}
          >
            <ArrowLeft size={14} />
            <span>Hub</span>
          </a>
          <span style={{ color: '#333' }}>/</span>
          <span style={{
            fontSize: '13px',
            fontWeight: 600,
            color: '#999',
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
          }}>
            Docs
          </span>
        </div>

        {/* Mobile nav toggle */}
        <button
          onClick={() => setMobileNavOpen(!mobileNavOpen)}
          style={{
            display: 'none',
            background: 'none',
            border: 'none',
            color: '#888',
            cursor: 'pointer',
            padding: '4px',
          }}
          className="docs-mobile-toggle"
        >
          {mobileNavOpen ? <X size={18} /> : <Menu size={18} />}
        </button>
      </header>

      {/* Main layout */}
      <div style={{
        display: 'flex',
        maxWidth: '960px',
        margin: '0 auto',
        padding: '0 24px',
      }}>
        {/* Section nav — desktop sidebar */}
        <nav
          className="docs-sidebar"
          style={{
            position: 'sticky',
            top: '57px',
            width: '200px',
            flexShrink: 0,
            height: 'calc(100vh - 57px)',
            paddingTop: '32px',
            paddingRight: '24px',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {sections.map((s) => (
              <button
                key={s.id}
                onClick={() => scrollToSection(s.id)}
                style={{
                  background: 'none',
                  border: 'none',
                  textAlign: 'left',
                  padding: '6px 8px',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '12px',
                  color: activeSection === s.id ? '#e5e5e5' : '#666',
                  fontWeight: activeSection === s.id ? 600 : 400,
                  transition: 'color 0.15s',
                }}
              >
                {s.title}
              </button>
            ))}
          </div>
        </nav>

        {/* Mobile nav dropdown */}
        {mobileNavOpen && (
          <div
            className="docs-mobile-nav"
            style={{
              position: 'fixed',
              top: '57px',
              left: 0,
              right: 0,
              background: '#111',
              borderBottom: '1px solid #1a1a1a',
              padding: '12px 24px',
              zIndex: 99,
              display: 'flex',
              flexDirection: 'column',
              gap: '4px',
            }}
          >
            {sections.map((s) => (
              <button
                key={s.id}
                onClick={() => scrollToSection(s.id)}
                style={{
                  background: 'none',
                  border: 'none',
                  textAlign: 'left',
                  padding: '8px',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '13px',
                  color: activeSection === s.id ? '#e5e5e5' : '#888',
                  fontWeight: activeSection === s.id ? 600 : 400,
                }}
              >
                {s.title}
              </button>
            ))}
          </div>
        )}

        {/* Content */}
        <main
          ref={contentRef}
          style={{
            flex: 1,
            minWidth: 0,
            maxWidth: '720px',
            padding: '32px 0 80px',
          }}
        >
          {/* Hero */}
          <div style={{ marginBottom: '32px' }}>
            <p style={{
              fontSize: '14px',
              color: '#999',
              lineHeight: 1.6,
              margin: 0,
            }}>
              {description}
            </p>
          </div>

          {/* Markdown content */}
          <div style={{ lineHeight: 1.7, fontSize: '13px' }}>
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                h1: ({ children }) => {
                  const text = String(children);
                  const id = text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
                  return (
                    <h1
                      id={id}
                      style={{
                        fontSize: '20px',
                        fontWeight: 600,
                        color: '#e5e5e5',
                        margin: '48px 0 16px 0',
                        paddingTop: '16px',
                        scrollMarginTop: '80px',
                      }}
                    >
                      {children}
                    </h1>
                  );
                },
                h2: ({ children }) => (
                  <h2 style={{
                    fontSize: '16px',
                    fontWeight: 600,
                    color: '#ddd',
                    margin: '28px 0 10px 0',
                  }}>
                    {children}
                  </h2>
                ),
                h3: ({ children }) => (
                  <h3 style={{
                    fontSize: '14px',
                    fontWeight: 600,
                    color: '#ccc',
                    margin: '20px 0 8px 0',
                  }}>
                    {children}
                  </h3>
                ),
                p: ({ children }) => (
                  <p style={{ margin: '0 0 14px 0', color: '#bbb' }}>{children}</p>
                ),
                ul: ({ children }) => (
                  <ul style={{ margin: '0 0 14px 0', paddingLeft: '20px' }}>{children}</ul>
                ),
                ol: ({ children }) => (
                  <ol style={{ margin: '0 0 14px 0', paddingLeft: '20px' }}>{children}</ol>
                ),
                li: ({ children }) => (
                  <li style={{ margin: '0 0 6px 0', color: '#bbb' }}>{children}</li>
                ),
                a: ({ href, children }) => (
                  <a
                    href={href}
                    target={href?.startsWith('http') ? '_blank' : undefined}
                    rel={href?.startsWith('http') ? 'noopener noreferrer' : undefined}
                    style={{ color: '#888', textDecoration: 'underline', textUnderlineOffset: '2px' }}
                  >
                    {children}
                  </a>
                ),
                code: ({ className, children, ...props }) => {
                  const isInline = !className;
                  if (isInline) {
                    return (
                      <code style={{
                        background: '#1a1a1a',
                        padding: '2px 6px',
                        borderRadius: '4px',
                        fontSize: '12px',
                        color: '#999',
                      }} {...props}>{children}</code>
                    );
                  }
                  return (
                    <code style={{
                      display: 'block',
                      background: '#0d0d0d',
                      padding: '14px',
                      borderRadius: '6px',
                      fontSize: '12px',
                      overflowX: 'auto',
                      margin: '0 0 14px 0',
                      color: '#aaa',
                      whiteSpace: 'pre-wrap',
                      border: '1px solid #1a1a1a',
                    }} {...props}>{children}</code>
                  );
                },
                pre: ({ children }) => (
                  <pre style={{ margin: '0 0 14px 0' }}>{children}</pre>
                ),
                strong: ({ children }) => (
                  <strong style={{ color: '#e5e5e5', fontWeight: 600 }}>{children}</strong>
                ),
                em: ({ children }) => (
                  <em style={{ color: '#bbb', fontStyle: 'italic' }}>{children}</em>
                ),
                hr: () => (
                  <hr style={{
                    border: 'none',
                    borderTop: '1px solid #1a1a1a',
                    margin: '32px 0',
                  }} />
                ),
                blockquote: ({ children }) => (
                  <blockquote style={{
                    borderLeft: '3px solid #333',
                    paddingLeft: '14px',
                    margin: '0 0 14px 0',
                    color: '#999',
                  }}>{children}</blockquote>
                ),
                table: ({ children }) => (
                  <div style={{ overflowX: 'auto', margin: '0 0 14px 0' }}>
                    <table style={{
                      width: '100%',
                      borderCollapse: 'collapse',
                      fontSize: '12px',
                    }}>
                      {children}
                    </table>
                  </div>
                ),
                th: ({ children }) => (
                  <th style={{
                    textAlign: 'left',
                    padding: '8px 12px',
                    borderBottom: '1px solid #2a2a2a',
                    color: '#999',
                    fontWeight: 600,
                    fontSize: '11px',
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                  }}>
                    {children}
                  </th>
                ),
                td: ({ children }) => (
                  <td style={{
                    padding: '8px 12px',
                    borderBottom: '1px solid #1a1a1a',
                    color: '#bbb',
                  }}>
                    {children}
                  </td>
                ),
              }}
            >
              {content}
            </ReactMarkdown>
          </div>
        </main>
      </div>

      {/* Responsive styles */}
      <style>{`
        @media (max-width: 768px) {
          .docs-sidebar { display: none !important; }
          .docs-mobile-toggle { display: flex !important; }
        }
        @media (min-width: 769px) {
          .docs-mobile-nav { display: none !important; }
        }
      `}</style>
    </div>
  );
}
