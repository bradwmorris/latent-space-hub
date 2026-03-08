import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import DocsLayout from '@/components/docs/DocsLayout';
import { getSkillDocBySlug, listDocsNavigation, listSkillDocSlugs } from '@/services/docs/docsService';

interface SkillDocPageProps {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  return listSkillDocSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: SkillDocPageProps): Promise<Metadata> {
  const { slug } = await params;
  const doc = getSkillDocBySlug(slug);
  if (!doc) return { title: 'Skill Not Found — Docs — Latent Space Hub' };
  return { title: `${doc.title} — Docs — Latent Space Hub` };
}

export default async function SkillDocPage({ params }: SkillDocPageProps) {
  const { slug } = await params;
  const doc = getSkillDocBySlug(slug);
  if (!doc) notFound();
  const pages = listDocsNavigation();
  return (
    <DocsLayout
      content={doc.content}
      title={doc.title}
      description={doc.description}
      currentSlug={`skills/${slug}`}
      pages={pages}
    />
  );
}
