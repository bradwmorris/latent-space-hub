import { getDoc, listDocsNavigation } from '@/services/docs/docsService';
import DocsLayout from '@/components/docs/DocsLayout';
import { notFound } from 'next/navigation';

export const metadata = { title: 'Indexing & Search — Docs — Latent Space Hub' };

export default function IndexSearchPage() {
  const doc = getDoc('index-search');
  if (!doc) notFound();
  const pages = listDocsNavigation();
  return <DocsLayout content={doc.content} title={doc.title} description={doc.description} currentSlug="index-search" pages={pages} />;
}
