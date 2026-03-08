import { getDoc, listDocsNavigation } from '@/services/docs/docsService';
import DocsLayout from '@/components/docs/DocsLayout';
import { notFound } from 'next/navigation';

export const metadata = { title: 'Getting Started (Humans) — Docs — Latent Space Hub' };

export default function Page() {
  const doc = getDoc('getting-started-understand-app-and-bot');
  if (!doc) notFound();
  const pages = listDocsNavigation();
  return <DocsLayout content={doc.content} title={doc.title} description={doc.description} currentSlug="getting-started-understand-app-and-bot" pages={pages} />;
}
