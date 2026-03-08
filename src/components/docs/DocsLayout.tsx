"use client";

import { useState, useEffect, useRef } from 'react';
import { ArrowLeft, Menu, X, Moon, Sun } from 'lucide-react';
import { useTheme } from '@/components/theme/ThemeProvider';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';

interface PageLink {
  slug: string;
  title: string;
}

interface Section {
  id: string;
  title: string;
}

interface DocsLayoutProps {
  content: string;
  title: string;
  description: string;
  currentSlug: string;
  pages: PageLink[];
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

export default function DocsLayout({ content, title, description, currentSlug, pages }: DocsLayoutProps) {
  const [activeSection, setActiveSection] = useState<string>('');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const sections = extractSections(content);
  const { theme, resolved, setTheme } = useTheme();
  const isLight = resolved === 'light';

  const toggleTheme = () => {
    if (theme === 'system') {
      setTheme(isLight ? 'dark' : 'light');
      return;
    }
    setTheme(theme === 'dark' ? 'light' : 'dark');
  };

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
      background: 'var(--bg-base)',
      color: 'var(--text-primary)',
      fontFamily: 'var(--font-body)',
    }}>
      {/* Top bar */}
      <header style={{
        position: 'sticky',
        top: 0,
        zIndex: 100,
        background: 'var(--bg-base)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        borderBottom: '1px solid var(--border-default)',
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
              color: 'var(--text-secondary)',
              textDecoration: 'none',
              fontSize: '13px',
              fontFamily: 'var(--font-mono)',
            }}
          >
            <ArrowLeft size={14} />
            <span>Hub</span>
          </a>
          <span style={{ color: 'var(--border-default)' }}>/</span>
          <span style={{
            fontSize: '13px',
            fontWeight: 600,
            color: 'var(--text-primary)',
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
            fontFamily: 'var(--font-mono)',
          }}>
            Docs
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {/* Theme toggle */}
          <button
            onClick={toggleTheme}
            title={`Theme: ${theme}`}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              border: '1px solid var(--border-default)',
              borderRadius: '8px',
              background: 'var(--bg-surface)',
              color: 'var(--text-secondary)',
              padding: '4px 8px',
              cursor: 'pointer',
            }}
          >
            {isLight ? <Sun size={14} /> : <Moon size={14} />}
          </button>

          {/* Mobile nav toggle */}
          <button
            onClick={() => setMobileNavOpen(!mobileNavOpen)}
            style={{
              display: 'none',
              background: 'none',
              border: 'none',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              padding: '4px',
            }}
            className="docs-mobile-toggle"
          >
            {mobileNavOpen ? <X size={18} /> : <Menu size={18} />}
          </button>
        </div>
      </header>

      {/* Main layout */}
      <div style={{
        display: 'flex',
        maxWidth: '980px',
        margin: '0 auto',
        padding: '0 32px',
      }}>
        {/* Sidebar — page nav + section nav */}
        <nav
          className="docs-sidebar"
          style={{
            position: 'sticky',
            top: '60px',
            width: '180px',
            flexShrink: 0,
            height: 'calc(100vh - 60px)',
            paddingTop: '32px',
            paddingRight: '24px',
            overflowY: 'auto',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            {pages.map((page) => {
              const isCurrent = page.slug === currentSlug;
              return (
                <div key={page.slug}>
                  <a
                    href={`/docs/${page.slug}`}
                    style={{
                      display: 'block',
                      padding: '6px 10px',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontSize: '13px',
                      lineHeight: 1.4,
                      textDecoration: 'none',
                      fontFamily: 'var(--font-mono)',
                      color: isCurrent ? 'var(--text-primary)' : 'var(--text-muted)',
                      fontWeight: isCurrent ? 600 : 400,
                      background: isCurrent ? 'var(--bg-surface)' : 'transparent',
                      borderLeft: isCurrent ? '2px solid var(--accent-brand)' : '2px solid transparent',
                      transition: 'all 0.15s',
                    }}
                  >
                    {page.title}
                  </a>
                  {/* Show within-page sections for the current page */}
                  {isCurrent && sections.length > 1 && (
                    <div style={{ paddingLeft: '16px', marginTop: '4px' }}>
                      {sections.map((s) => (
                        <button
                          key={s.id}
                          onClick={() => scrollToSection(s.id)}
                          style={{
                            display: 'block',
                            background: 'none',
                            border: 'none',
                            textAlign: 'left',
                            padding: '3px 8px',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            fontSize: '12px',
                            lineHeight: 1.4,
                            fontFamily: 'var(--font-mono)',
                            color: activeSection === s.id ? 'var(--text-primary)' : 'var(--text-muted)',
                            fontWeight: activeSection === s.id ? 500 : 400,
                            transition: 'all 0.15s',
                          }}
                        >
                          {s.title}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
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
              background: 'var(--bg-surface)',
              borderBottom: '1px solid var(--border-default)',
              padding: '12px 24px',
              zIndex: 99,
              display: 'flex',
              flexDirection: 'column',
              gap: '4px',
            }}
          >
            {pages.map((page) => (
              <a
                key={page.slug}
                href={`/docs/${page.slug}`}
                onClick={() => setMobileNavOpen(false)}
                style={{
                  display: 'block',
                  padding: '8px',
                  borderRadius: '4px',
                  fontSize: '14px',
                  textDecoration: 'none',
                  color: page.slug === currentSlug ? 'var(--text-primary)' : 'var(--text-secondary)',
                  fontWeight: page.slug === currentSlug ? 500 : 400,
                }}
              >
                {page.title}
              </a>
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
            padding: '32px 0 100px',
          }}
        >
          {/* Hero */}
          <div style={{ marginBottom: '48px' }}>
            <h1 style={{
              fontSize: '28px',
              fontWeight: 600,
              color: 'var(--text-primary)',
              margin: '0 0 12px 0',
              letterSpacing: '-0.02em',
              fontFamily: 'var(--font-body)',
            }}>
              {title}
            </h1>
            <p style={{
              fontSize: '16px',
              color: 'var(--text-secondary)',
              lineHeight: 1.6,
              margin: 0,
              fontFamily: 'var(--font-body)',
            }}>
              {description}
            </p>
          </div>

          {/* Markdown content */}
          <div className="docs-content" style={{ lineHeight: 1.7, fontSize: '15px', fontFamily: 'var(--font-body)' }}>
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              rehypePlugins={[rehypeRaw]}
              components={{
                h1: ({ children }) => {
                  const text = String(children);
                  const id = text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
                  return (
                    <h1
                      id={id}
                      style={{
                        fontSize: '24px',
                        fontWeight: 600,
                        color: 'var(--text-primary)',
                        margin: '48px 0 16px 0',
                        paddingTop: '16px',
                        scrollMarginTop: '80px',
                        letterSpacing: '-0.02em',
                        fontFamily: 'var(--font-body)',
                      }}
                    >
                      {children}
                    </h1>
                  );
                },
                h2: ({ children }) => (
                  <h2 style={{
                    fontSize: '20px',
                    fontWeight: 600,
                    color: 'var(--text-primary)',
                    margin: '36px 0 12px 0',
                    fontFamily: 'var(--font-body)',
                  }}>
                    {children}
                  </h2>
                ),
                h3: ({ children }) => (
                  <h3 style={{
                    fontSize: '17px',
                    fontWeight: 600,
                    color: 'var(--text-primary)',
                    margin: '24px 0 8px 0',
                    fontFamily: 'var(--font-body)',
                  }}>
                    {children}
                  </h3>
                ),
                p: ({ children }) => (
                  <p style={{
                    margin: '0 0 16px 0',
                    color: 'var(--text-primary)',
                    lineHeight: 1.7,
                    maxWidth: '680px',
                  }}>{children}</p>
                ),
                ul: ({ children }) => (
                  <ul style={{ margin: '0 0 16px 0', paddingLeft: '22px', color: 'var(--text-primary)' }}>{children}</ul>
                ),
                ol: ({ children }) => (
                  <ol style={{ margin: '0 0 16px 0', paddingLeft: '22px', color: 'var(--text-primary)' }}>{children}</ol>
                ),
                li: ({ children }) => (
                  <li style={{ margin: '0 0 8px 0', color: 'var(--text-primary)', lineHeight: 1.6 }}>{children}</li>
                ),
                a: ({ href, children }) => (
                  <a
                    href={href}
                    target={href?.startsWith('http') ? '_blank' : undefined}
                    rel={href?.startsWith('http') ? 'noopener noreferrer' : undefined}
                    style={{
                      color: 'var(--accent-brand)',
                      textDecoration: 'none',
                      borderBottom: '1px solid var(--accent-brand-muted)',
                    }}
                  >
                    {children}
                  </a>
                ),
                code: ({ className, children, ...props }) => {
                  const isInline = !className;
                  if (isInline) {
                    return (
                      <code style={{
                        background: 'var(--bg-surface)',
                        padding: '2px 6px',
                        borderRadius: '4px',
                        fontSize: '13px',
                        color: 'var(--accent-brand)',
                        fontFamily: 'var(--font-mono)',
                        border: '1px solid var(--border-subtle)',
                      }} {...props}>{children}</code>
                    );
                  }
                  return (
                    <code style={{
                      display: 'block',
                      background: 'var(--bg-surface)',
                      padding: '16px',
                      borderRadius: '8px',
                      fontSize: '13px',
                      overflowX: 'auto',
                      margin: '0 0 16px 0',
                      color: 'var(--text-primary)',
                      whiteSpace: 'pre-wrap',
                      border: '1px solid var(--border-default)',
                      fontFamily: 'var(--font-mono)',
                      lineHeight: 1.6,
                    }} {...props}>{children}</code>
                  );
                },
                pre: ({ children }) => (
                  <pre style={{ margin: '0 0 16px 0' }}>{children}</pre>
                ),
                strong: ({ children }) => (
                  <strong style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{children}</strong>
                ),
                em: ({ children }) => (
                  <em style={{ color: 'var(--text-secondary)', fontStyle: 'italic' }}>{children}</em>
                ),
                hr: () => (
                  <hr style={{
                    border: 'none',
                    borderTop: '1px solid var(--border-default)',
                    margin: '40px 0',
                  }} />
                ),
                blockquote: ({ children }) => (
                  <blockquote style={{
                    borderLeft: '3px solid var(--border-default)',
                    background: 'var(--bg-surface)',
                    paddingLeft: '16px',
                    paddingTop: '12px',
                    paddingBottom: '12px',
                    paddingRight: '16px',
                    margin: '0 0 16px 0',
                    color: 'var(--text-secondary)',
                    borderRadius: '0 8px 8px 0',
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
                        borderRadius: isAvatar ? '50%' : '8px',
                        border: `1px solid var(--border-default)`,
                        margin: isAvatar ? '0 0 12px 0' : '8px 0 20px 0',
                      }}
                    />
                  );
                },
                table: ({ children }) => (
                  <div style={{ overflowX: 'auto', margin: '0 0 20px 0' }}>
                    <table style={{
                      width: '100%',
                      borderCollapse: 'collapse',
                      fontSize: '14px',
                      fontFamily: 'var(--font-body)',
                    }}>
                      {children}
                    </table>
                  </div>
                ),
                th: ({ children }) => (
                  <th style={{
                    textAlign: 'left',
                    padding: '10px 16px',
                    borderBottom: '1px solid var(--border-default)',
                    background: 'var(--bg-surface)',
                    color: 'var(--text-primary)',
                    fontWeight: 600,
                    fontSize: '13px',
                    fontFamily: 'var(--font-mono)',
                  }}>
                    {children}
                  </th>
                ),
                td: ({ children }) => (
                  <td style={{
                    padding: '10px 16px',
                    borderBottom: '1px solid var(--border-subtle)',
                    color: 'var(--text-primary)',
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
