import { getDoc } from '@/services/docs/docsService';
import DocsLayout from '@/components/docs/DocsLayout';

export const metadata = {
  title: 'Docs — Latent Space Hub',
  description: 'A knowledge graph of the entire Latent Space universe — every podcast, article, and AI News digest, structured, connected, and searchable.',
};

export default function DocsPage() {
  const doc = getDoc('index');

  if (!doc) {
    return (
      <div style={{
        minHeight: '100vh',
        background: '#0a0a0a',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#555',
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: '13px',
      }}>
        Documentation not found.
      </div>
    );
  }

  return (
    <DocsLayout
      content={doc.content}
      title={doc.title}
      description={doc.description}
    />
  );
}
