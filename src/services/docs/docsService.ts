import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';

export interface DocMeta {
  title: string;
  description: string;
}

export interface Doc extends DocMeta {
  content: string;
}

const DOCS_DIR = path.join(process.cwd(), 'src/config/docs');

export function getDoc(name: string): Doc | null {
  const filepath = path.join(DOCS_DIR, `${name}.md`);
  if (!fs.existsSync(filepath)) return null;

  const raw = fs.readFileSync(filepath, 'utf-8');
  const { data, content } = matter(raw);
  return {
    title: data.title || name,
    description: data.description || '',
    content: content.trim(),
  };
}
