import { redirect } from 'next/navigation';

export const metadata = {
  title: 'Docs — Latent Space Hub',
  description: 'A knowledge graph of the entire Latent Space universe — every podcast, article, and AI News digest, structured, connected, and searchable.',
};

export default function DocsPage() {
  redirect('/docs/overview');
}
