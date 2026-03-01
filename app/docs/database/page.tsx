import { getDoc, listDocs } from '@/services/docs/docsService';
import DocsLayout from '@/components/docs/DocsLayout';
import { notFound } from 'next/navigation';

export const metadata = { title: 'Database — Docs — Latent Space Hub' };

export default function DatabasePage() {
  const doc = getDoc('database');
  if (!doc) notFound();
  const pages = listDocs();
  return <DocsLayout content={doc.content} title={doc.title} description={doc.description} currentSlug="database" pages={pages} />;
}
