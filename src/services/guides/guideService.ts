import fs from 'fs';
import path from 'path';
import os from 'os';
import matter from 'gray-matter';

export interface GuideMeta {
  name: string;
  description: string;
}

export interface Guide extends GuideMeta {
  content: string;
}

// In readonly/production mode, only use bundled guides (no filesystem persistence)
const isReadOnly = process.env.NEXT_PUBLIC_READONLY_MODE === 'true';

const GUIDES_DIR = path.join(
  os.homedir(),
  'Library/Application Support/RA-H/guides'
);

const BUNDLED_GUIDES_DIR = path.join(
  process.cwd(),
  'src/config/guides'
);

function ensureGuidesDir(): void {
  if (isReadOnly) return; // Skip in readonly mode
  if (!fs.existsSync(GUIDES_DIR)) {
    fs.mkdirSync(GUIDES_DIR, { recursive: true });
  }
}

function seedDefaultGuides(): void {
  if (isReadOnly) return; // Skip in readonly mode
  if (!fs.existsSync(BUNDLED_GUIDES_DIR)) return;

  const bundled = fs.readdirSync(BUNDLED_GUIDES_DIR).filter(f => f.endsWith('.md'));
  for (const file of bundled) {
    const dest = path.join(GUIDES_DIR, file);
    if (!fs.existsSync(dest)) {
      fs.copyFileSync(path.join(BUNDLED_GUIDES_DIR, file), dest);
    }
  }
}

function init(): void {
  if (isReadOnly) return; // Skip in readonly mode - use bundled directly
  ensureGuidesDir();
  const existing = fs.readdirSync(GUIDES_DIR).filter(f => f.endsWith('.md'));
  if (existing.length === 0) {
    seedDefaultGuides();
  }
}

function getGuidesDirectory(): string {
  // In readonly mode, always use bundled guides
  if (isReadOnly) {
    return BUNDLED_GUIDES_DIR;
  }
  return GUIDES_DIR;
}

export function listGuides(): GuideMeta[] {
  init();
  const guidesDir = getGuidesDirectory();
  if (!fs.existsSync(guidesDir)) return [];

  const files = fs.readdirSync(guidesDir).filter(f => f.endsWith('.md'));
  return files.map(file => {
    const raw = fs.readFileSync(path.join(guidesDir, file), 'utf-8');
    const { data } = matter(raw);
    return {
      name: data.name || file.replace('.md', ''),
      description: data.description || '',
    };
  });
}

export function readGuide(name: string): Guide | null {
  init();
  const guidesDir = getGuidesDirectory();
  if (!fs.existsSync(guidesDir)) return null;

  // Try exact filename first, then lowercase
  const candidates = [
    `${name}.md`,
    `${name.toLowerCase()}.md`,
  ];

  for (const filename of candidates) {
    const filepath = path.join(guidesDir, filename);
    if (fs.existsSync(filepath)) {
      const raw = fs.readFileSync(filepath, 'utf-8');
      const { data, content } = matter(raw);
      return {
        name: data.name || name,
        description: data.description || '',
        content: content.trim(),
      };
    }
  }

  return null;
}

export function writeGuide(name: string, content: string): void {
  if (isReadOnly) return; // No writes in readonly mode
  init();
  const filename = `${name.toLowerCase()}.md`;
  const filepath = path.join(GUIDES_DIR, filename);
  fs.writeFileSync(filepath, content, 'utf-8');
}
