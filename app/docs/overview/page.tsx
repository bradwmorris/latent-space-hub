import { getDoc, listDocs } from '@/services/docs/docsService';
import DocsLayout from '@/components/docs/DocsLayout';
import { notFound } from 'next/navigation';

export const metadata = { title: 'Overview — Docs — Latent Space Hub' };

export default function OverviewPage() {
  const doc = getDoc('overview');
  if (!doc) notFound();
  const pages = listDocs();
  return <DocsLayout content={doc.content} title={doc.title} description={doc.description} currentSlug="overview" pages={pages} />;
}
