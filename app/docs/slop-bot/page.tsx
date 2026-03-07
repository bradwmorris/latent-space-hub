import { getDoc, listDocs } from '@/services/docs/docsService';
import DocsLayout from '@/components/docs/DocsLayout';
import { notFound } from 'next/navigation';

export const metadata = { title: 'Slop Bot — Docs — Latent Space Hub' };

export default function SlopBotPage() {
  const doc = getDoc('slop-bot');
  if (!doc) notFound();
  const pages = listDocs();
  return <DocsLayout content={doc.content} title={doc.title} description={doc.description} currentSlug="slop-bot" pages={pages} />;
}
