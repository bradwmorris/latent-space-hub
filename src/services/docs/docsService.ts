import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';

export interface DocMeta {
  slug: string;
  title: string;
  description: string;
}

export interface Doc extends DocMeta {
  content: string;
}

const DOCS_DIR = path.join(process.cwd(), 'src/config/docs');

/** Ordered list of doc pages. Slug must match filename (without .md) and route. */
const DOC_ORDER = ['overview', 'ingestion', 'database', 'interfaces', 'evals'];

export function getDoc(slug: string): Doc | null {
  const filepath = path.join(DOCS_DIR, `${slug}.md`);
  if (!fs.existsSync(filepath)) return null;

  const raw = fs.readFileSync(filepath, 'utf-8');
  const { data, content } = matter(raw);
  return {
    slug,
    title: data.title || slug,
    description: data.description || '',
    content: content.trim(),
  };
}

export function listDocs(): DocMeta[] {
  return DOC_ORDER
    .map((slug) => {
      const filepath = path.join(DOCS_DIR, `${slug}.md`);
      if (!fs.existsSync(filepath)) return null;
      const raw = fs.readFileSync(filepath, 'utf-8');
      const { data } = matter(raw);
      return {
        slug,
        title: data.title || slug,
        description: data.description || '',
      };
    })
    .filter((d): d is DocMeta => d !== null);
}
