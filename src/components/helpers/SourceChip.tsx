"use client";

interface SourceChipProps {
  url?: string;
  domain?: string;
}

function extractDomain(input?: string) {
  if (!input) return '';
  try {
    const d = input.includes('://') ? new URL(input).hostname : input;
    return d.replace(/^www\./, '');
  } catch {
    return input.replace(/^www\./, '');
  }
}

export default function SourceChip({ url, domain }: SourceChipProps) {
  const d = extractDomain(domain || url);
  const favicon = d ? `https://icons.duckduckgo.com/ip3/${d}.ico` : '';
  return (
    <span
      title={url || d}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        background: 'var(--bg-elevated)',
        border: '1px solid var(--border-default)',
        borderRadius: 999,
        padding: '2px 8px',
        fontSize: 11,
        color: '#bdbdbd',
        lineHeight: 1
      }}
    >
      {d ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={favicon}
          alt=""
          width={12}
          height={12}
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).style.display = 'none';
          }}
          style={{ borderRadius: 2 }}
        />
      ) : null}
      <span>{d || 'source'}</span>
    </span>
  );
}
