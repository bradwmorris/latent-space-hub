"use client";

interface AsciiBannerProps {
  helperName: string;
  displayName?: string;
}

export default function AsciiBanner({ helperName, displayName }: AsciiBannerProps) {
  const name = displayName || helperName;
  const nameUpper = name.toUpperCase();
  
  // Create a unique minimal banner
  const createBanner = () => {
    // Dynamic sizing based on name length
    const minWidth = 24;
    const bannerWidth = Math.max(minWidth, nameUpper.length + 6);
    const padding = Math.floor((bannerWidth - nameUpper.length - 2) / 2);
    const paddedName = ' '.repeat(padding) + nameUpper + ' '.repeat(bannerWidth - nameUpper.length - padding - 2);
    
    const topBottom = '─'.repeat(bannerWidth - 2);
    
    return `┌${topBottom}┐
│${paddedName}│
└${topBottom}┘`;
  };

  const banner = createBanner();

  return (
    <div style={{
      padding: '32px 16px',
      fontFamily: 'inherit',
      opacity: 0,
      animation: 'fadeIn 0.5s ease-out forwards',
      textAlign: 'center'
    }}>
      <pre style={{
        color: '#353535',
        fontSize: '14px',
        lineHeight: '1.3',
        whiteSpace: 'pre',
        margin: '0 auto',
        display: 'inline-block',
        letterSpacing: '0.05em'
      }}>
        {banner}
      </pre>
      
      <div style={{
        marginTop: '12px',
        fontSize: '11px',
        letterSpacing: '0.15em',
        textTransform: 'uppercase'
      }}>
        <span style={{ color: 'var(--border-default)' }}>━━━</span>
        <span style={{ color: '#353535', margin: '0 8px' }}>ready</span>
        <span style={{ color: 'var(--border-default)' }}>━━━</span>
      </div>
      
      <style jsx>{`
        @keyframes fadeIn {
          to { opacity: 1; }
        }
      `}</style>
    </div>
  );
}