import {
  Mic, Users, FileText, Building2, Hammer,
  BookOpen, Presentation, Newspaper, UserCircle,
  type LucideIcon,
} from 'lucide-react';

export interface CategoryConfig {
  key: string;
  label: string;
  icon: LucideIcon;
  sortMode: 'recent' | 'connected';
  order: number;
}

export const CATEGORIES: CategoryConfig[] = [
  { key: 'podcast',       label: 'Podcast',       icon: Mic,          sortMode: 'recent',    order: 0 },
  { key: 'guest',         label: 'Guest',          icon: Users,        sortMode: 'connected', order: 1 },
  { key: 'article',       label: 'Article',        icon: FileText,     sortMode: 'recent',    order: 2 },
  { key: 'entity',        label: 'Entity',         icon: Building2,    sortMode: 'connected', order: 3 },
  { key: 'builders-club', label: 'Builders Club',  icon: Hammer,       sortMode: 'recent',    order: 4 },
  { key: 'paper-club',    label: 'Paper Club',     icon: BookOpen,     sortMode: 'recent',    order: 5 },
  { key: 'workshop',      label: 'Workshop',       icon: Presentation, sortMode: 'recent',    order: 6 },
  { key: 'ainews',        label: 'AI News',        icon: Newspaper,    sortMode: 'recent',    order: 7 },
  { key: 'member',        label: 'Member',         icon: UserCircle,   sortMode: 'connected', order: 8 },
];

export type CategoryKey = typeof CATEGORIES[number]['key'];

export const CATEGORY_KEYS: string[] = CATEGORIES.map(c => c.key);

export const CATEGORY_LABELS: Record<string, string> = Object.fromEntries(
  CATEGORIES.map(c => [c.key, c.label])
);

export const CATEGORY_MAP: Record<string, CategoryConfig> = Object.fromEntries(
  CATEGORIES.map(c => [c.key, c])
);
