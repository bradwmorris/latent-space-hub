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

  // Override the global overflow: hidden on html/body so docs page can scroll
  useEffect(() => {
    document.documentElement.style.overflow = 'auto';
    document.body.style.overflow = 'auto';
    document.documentElement.style.height = 'auto';
    document.body.style.height = 'auto';
    return () => {
      document.documentElement.style.overflow = '';
      document.body.style.overflow = '';
      document.documentElement.style.height = '';
      document.body.style.height = '';
    };
  }, []);

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
      fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    }}>
      {/* Top bar */}
      <header style={{
        position: 'sticky',
        top: 0,
        zIndex: 100,
        background: 'rgba(10, 10, 10, 0.85)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        borderBottom: '1px solid #1a1a1a',
        padding: '14px 24px',
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
              fontFamily: "'JetBrains Mono', monospace",
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
            fontFamily: "'JetBrains Mono', monospace",
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
        maxWidth: '980px',
        margin: '0 auto',
        padding: '0 32px',
      }}>
        {/* Section nav — desktop sidebar */}
        <nav
          className="docs-sidebar"
          style={{
            position: 'sticky',
            top: '60px',
            width: '180px',
            flexShrink: 0,
            height: 'calc(100vh - 60px)',
            paddingTop: '36px',
            paddingRight: '32px',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            {sections.map((s) => (
              <button
                key={s.id}
                onClick={() => scrollToSection(s.id)}
                style={{
                  background: 'none',
                  border: 'none',
                  textAlign: 'left',
                  padding: '6px 10px',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '13px',
                  lineHeight: 1.4,
                  color: activeSection === s.id ? '#e5e5e5' : '#666',
                  fontWeight: activeSection === s.id ? 500 : 400,
                  transition: 'all 0.15s',
                  fontFamily: "'Inter', -apple-system, sans-serif",
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
                  fontSize: '14px',
                  color: activeSection === s.id ? '#e5e5e5' : '#888',
                  fontWeight: activeSection === s.id ? 500 : 400,
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
            maxWidth: '740px',
            padding: '36px 0 100px',
          }}
        >
          {/* Hero */}
          <div style={{ marginBottom: '36px' }}>
            <p style={{
              fontSize: '15px',
              color: '#999',
              lineHeight: 1.6,
              margin: 0,
            }}>
              {description}
            </p>
          </div>

          {/* Markdown content */}
          <div className="docs-content" style={{ lineHeight: 1.75, fontSize: '14px' }}>
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
                        fontSize: '22px',
                        fontWeight: 600,
                        color: '#f0f0f0',
                        margin: '56px 0 18px 0',
                        paddingTop: '20px',
                        scrollMarginTop: '80px',
                        letterSpacing: '-0.01em',
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
                    margin: '32px 0 12px 0',
                  }}>
                    {children}
                  </h2>
                ),
                h3: ({ children }) => (
                  <h3 style={{
                    fontSize: '15px',
                    fontWeight: 600,
                    color: '#ccc',
                    margin: '24px 0 10px 0',
                  }}>
                    {children}
                  </h3>
                ),
                p: ({ children }) => (
                  <p style={{ margin: '0 0 16px 0', color: '#b0b0b0' }}>{children}</p>
                ),
                ul: ({ children }) => (
                  <ul style={{ margin: '0 0 16px 0', paddingLeft: '20px' }}>{children}</ul>
                ),
                ol: ({ children }) => (
                  <ol style={{ margin: '0 0 16px 0', paddingLeft: '20px' }}>{children}</ol>
                ),
                li: ({ children }) => (
                  <li style={{ margin: '0 0 8px 0', color: '#b0b0b0' }}>{children}</li>
                ),
                a: ({ href, children }) => (
                  <a
                    href={href}
                    target={href?.startsWith('http') ? '_blank' : undefined}
                    rel={href?.startsWith('http') ? 'noopener noreferrer' : undefined}
                    style={{ color: '#a78bfa', textDecoration: 'none', borderBottom: '1px solid rgba(167, 139, 250, 0.3)' }}
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
                        padding: '2px 7px',
                        borderRadius: '4px',
                        fontSize: '13px',
                        color: '#a78bfa',
                        fontFamily: "'JetBrains Mono', monospace",
                      }} {...props}>{children}</code>
                    );
                  }
                  return (
                    <code style={{
                      display: 'block',
                      background: '#111',
                      padding: '16px',
                      borderRadius: '8px',
                      fontSize: '13px',
                      overflowX: 'auto',
                      margin: '0 0 16px 0',
                      color: '#aaa',
                      whiteSpace: 'pre-wrap',
                      border: '1px solid #1e1e1e',
                      fontFamily: "'JetBrains Mono', monospace",
                    }} {...props}>{children}</code>
                  );
                },
                pre: ({ children }) => (
                  <pre style={{ margin: '0 0 16px 0' }}>{children}</pre>
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
                    borderTop: '1px solid #1e1e1e',
                    margin: '40px 0',
                  }} />
                ),
                blockquote: ({ children }) => (
                  <blockquote style={{
                    borderLeft: '3px solid #a78bfa',
                    paddingLeft: '16px',
                    margin: '0 0 16px 0',
                    color: '#999',
                  }}>{children}</blockquote>
                ),
                img: ({ src, alt }) => {
                  const isAvatar = typeof src === 'string' && src.includes('avatar');
                  return (
                    <img
                      src={src}
                      alt={alt || ''}
                      style={{
                        maxWidth: isAvatar ? '100px' : '100%',
                        borderRadius: isAvatar ? '50%' : '10px',
                        border: isAvatar ? '2px solid #2a2a2a' : '1px solid #1e1e1e',
                        margin: isAvatar ? '0 0 12px 0' : '8px 0 20px 0',
                      }}
                    />
                  );
                },
                table: ({ children }) => (
                  <div style={{ overflowX: 'auto', margin: '0 0 16px 0' }}>
                    <table style={{
                      width: '100%',
                      borderCollapse: 'collapse',
                      fontSize: '13px',
                    }}>
                      {children}
                    </table>
                  </div>
                ),
                th: ({ children }) => (
                  <th style={{
                    textAlign: 'left',
                    padding: '10px 14px',
                    borderBottom: '1px solid #2a2a2a',
                    color: '#888',
                    fontWeight: 500,
                    fontSize: '12px',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                  }}>
                    {children}
                  </th>
                ),
                td: ({ children }) => (
                  <td style={{
                    padding: '10px 14px',
                    borderBottom: '1px solid #161616',
                    color: '#b0b0b0',
                    verticalAlign: 'top',
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
