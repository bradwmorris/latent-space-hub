"use client";

interface AsciiHeaderProps {
  totalNodes: number;
  totalEdges: number;
  totalChunks: number;
  totalContent: number;
}

const ASCII_ART = `██╗      █████╗ ████████╗███████╗███╗   ██╗████████╗
██║     ██╔══██╗╚══██╔══╝██╔════╝████╗  ██║╚══██╔══╝
██║     ███████║   ██║   █████╗  ██╔██╗ ██║   ██║
██║     ██╔══██║   ██║   ██╔══╝  ██║╚██╗██║   ██║
███████╗██║  ██║   ██║   ███████╗██║ ╚████║   ██║
╚══════╝╚═╝  ╚═╝   ╚═╝   ╚══════╝╚═╝  ╚═══╝   ╚═╝

███████╗██████╗  █████╗  ██████╗███████╗
██╔════╝██╔══██╗██╔══██╗██╔════╝██╔════╝
███████╗██████╔╝███████║██║     █████╗
╚════██║██╔═══╝ ██╔══██║██║     ██╔══╝
███████║██║     ██║  ██║╚██████╗███████╗
╚══════╝╚═╝     ╚═╝  ╚═╝ ╚═════╝╚══════╝`;

export default function AsciiHeader({ totalNodes, totalEdges, totalChunks, totalContent }: AsciiHeaderProps) {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      gap: '10px',
      animation: 'asciiReveal 0.5s ease-out',
    }}>
      <pre
        style={{
          fontFamily: 'inherit',
          fontSize: '7px',
          lineHeight: 1.15,
          color: 'var(--accent-brand)',
          opacity: 0.55,
          margin: 0,
          whiteSpace: 'pre',
          userSelect: 'none',
          letterSpacing: '0.02em',
        }}
        aria-hidden="true"
      >
        {ASCII_ART}
      </pre>

      {/* System status line */}
      <div style={{
        fontSize: '11px',
        color: 'var(--accent-dark)',
        fontVariantNumeric: 'tabular-nums',
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
      }}>
        <span style={{ color: 'var(--accent-brand)', opacity: 0.6, fontSize: '9px' }}>&#9679;</span>
        <span>
          {totalNodes.toLocaleString()} nodes{' \u00b7 '}
          {totalEdges.toLocaleString()} edges{' \u00b7 '}
          {totalChunks.toLocaleString()} chunks{' \u00b7 '}
          {totalContent.toLocaleString()} content
        </span>
      </div>
    </div>
  );
}
