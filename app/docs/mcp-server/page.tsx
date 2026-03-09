import { getDoc, listDocsNavigation } from '@/services/docs/docsService';
import DocsLayout from '@/components/docs/DocsLayout';
import { notFound } from 'next/navigation';

export const metadata = { title: 'MCP Server — Docs — Latent Space Hub' };

export default function McpServerPage() {
  const doc = getDoc('mcp-server');
  if (!doc) notFound();
  const pages = listDocsNavigation();
  return <DocsLayout content={doc.content} title={doc.title} description={doc.description} currentSlug="mcp-server" pages={pages} />;
}
