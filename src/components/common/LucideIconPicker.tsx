"use client";

import { useState, useMemo } from 'react';
import {
  // Core
  Folder,
  BookOpen,
  Lightbulb,
  Star,
  Heart,
  Briefcase,
  Code,
  FileText,
  Globe,
  Hash,
  Inbox,
  Layers,
  Link,
  MessageSquare,
  Music,
  Paperclip,
  Search,
  Settings,
  Tag,
  User,
  Video,
  Zap,
  Archive,
  Award,
  Bell,
  Bookmark,
  Calendar,
  Camera,
  Clock,
  Cloud,
  Coffee,
  Compass,
  Database,
  Flag,
  Gift,
  Home,
  Image,
  Key,
  Mail,
  Map,
  Mic,
  Package,
  Smile,
  Target,
  // Thinking & Ideas
  Brain,
  Sparkles,
  Wand2,
  FlaskConical,
  Atom,
  // Content & Media
  Newspaper,
  Podcast,
  Youtube,
  Twitter,
  Rss,
  Radio,
  Tv,
  Film,
  // Work & Business
  Rocket,
  TrendingUp,
  PieChart,
  Presentation,
  LineChart,
  BarChart3,
  CircleDollarSign,
  Wallet,
  // People & Social
  Users,
  UserCircle,
  Contact,
  MessagesSquare,
  Share2,
  // Nature & Environment
  Leaf,
  Sun,
  Moon,
  Mountain,
  Trees,
  Flower2,
  // Objects & Tools
  Wrench,
  Hammer,
  Paintbrush,
  Pencil,
  Scissors,
  Ruler,
  // Tech & Development
  Terminal,
  GitBranch,
  Bug,
  Cpu,
  Server,
  Wifi,
  Smartphone,
  Laptop,
  // Documents & Files
  FileCode,
  FilePlus,
  FolderOpen,
  ClipboardList,
  ScrollText,
  StickyNote,
  // Health & Wellness
  HeartPulse,
  Activity,
  Dumbbell,
  Apple,
  // Navigation & Location
  Navigation,
  MapPin,
  Route,
  Signpost,
  // Misc Popular
  Crown,
  Diamond,
  Gem,
  Shield,
  Lock,
  Eye,
  ThumbsUp,
  CheckCircle,
  AlertCircle,
  Info,
  HelpCircle,
  Play,
  Pause,
  SkipForward,
  type LucideIcon
} from 'lucide-react';

// Static icon registry - no dynamic imports, works perfectly in Tauri WebView
export const ICON_REGISTRY: Record<string, LucideIcon> = {
  // Core
  Folder,
  BookOpen,
  Lightbulb,
  Star,
  Heart,
  Briefcase,
  Code,
  FileText,
  Globe,
  Hash,
  Inbox,
  Layers,
  Link,
  MessageSquare,
  Music,
  Paperclip,
  Search,
  Settings,
  Tag,
  User,
  Video,
  Zap,
  Archive,
  Award,
  Bell,
  Bookmark,
  Calendar,
  Camera,
  Clock,
  Cloud,
  Coffee,
  Compass,
  Database,
  Flag,
  Gift,
  Home,
  Image,
  Key,
  Mail,
  Map,
  Mic,
  Package,
  Smile,
  Target,
  // Thinking & Ideas
  Brain,
  Sparkles,
  Wand2,
  FlaskConical,
  Atom,
  // Content & Media
  Newspaper,
  Podcast,
  Youtube,
  Twitter,
  Rss,
  Radio,
  Tv,
  Film,
  // Work & Business
  Rocket,
  TrendingUp,
  PieChart,
  Presentation,
  LineChart,
  BarChart3,
  CircleDollarSign,
  Wallet,
  // People & Social
  Users,
  UserCircle,
  Contact,
  MessagesSquare,
  Share2,
  // Nature & Environment
  Leaf,
  Sun,
  Moon,
  Mountain,
  Trees,
  Flower2,
  // Objects & Tools
  Wrench,
  Hammer,
  Paintbrush,
  Pencil,
  Scissors,
  Ruler,
  // Tech & Development
  Terminal,
  GitBranch,
  Bug,
  Cpu,
  Server,
  Wifi,
  Smartphone,
  Laptop,
  // Documents & Files
  FileCode,
  FilePlus,
  FolderOpen,
  ClipboardList,
  ScrollText,
  StickyNote,
  // Health & Wellness
  HeartPulse,
  Activity,
  Dumbbell,
  Apple,
  // Navigation & Location
  Navigation,
  MapPin,
  Route,
  Signpost,
  // Misc Popular
  Crown,
  Diamond,
  Gem,
  Shield,
  Lock,
  Eye,
  ThumbsUp,
  CheckCircle,
  AlertCircle,
  Info,
  HelpCircle,
  Play,
  Pause,
  SkipForward,
};

// Helper to get icon component by name
export function getIconByName(name: string): LucideIcon {
  return ICON_REGISTRY[name] || Folder;
}

// Render icon by name - useful for dynamic rendering
export function DynamicIcon({
  name,
  size = 16,
  className,
  style
}: {
  name: string;
  size?: number;
  className?: string;
  style?: React.CSSProperties;
}) {
  const IconComponent = getIconByName(name);
  return <IconComponent size={size} className={className} style={style} />;
}

interface LucideIconPickerProps {
  selectedIcon: string;
  onSelect: (iconName: string) => void;
  onClose?: () => void;
}

export default function LucideIconPicker({ selectedIcon, onSelect, onClose }: LucideIconPickerProps) {
  const [searchQuery, setSearchQuery] = useState('');

  const iconNames = Object.keys(ICON_REGISTRY);

  const filteredIcons = useMemo(() => {
    if (!searchQuery.trim()) return iconNames;
    const query = searchQuery.toLowerCase();
    return iconNames.filter(name => name.toLowerCase().includes(query));
  }, [searchQuery, iconNames]);

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      gap: '12px',
      maxHeight: '300px'
    }}>
      {/* Search input */}
      <div style={{ position: 'relative' }}>
        <Search
          size={14}
          style={{
            position: 'absolute',
            left: '10px',
            top: '50%',
            transform: 'translateY(-50%)',
            color: 'var(--accent-dark)'
          }}
        />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search icons..."
          style={{
            width: '100%',
            padding: '8px 12px 8px 32px',
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-default)',
            borderRadius: '6px',
            color: 'var(--text-primary)',
            fontSize: '13px',
            outline: 'none'
          }}
          onFocus={(e) => {
            e.currentTarget.style.borderColor = 'var(--accent-primary)';
          }}
          onBlur={(e) => {
            e.currentTarget.style.borderColor = 'var(--border-default)';
          }}
        />
      </div>

      {/* Icon grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(8, 1fr)',
        gap: '4px',
        overflowY: 'auto',
        maxHeight: '240px',
        padding: '4px'
      }}>
        {filteredIcons.map((iconName) => {
          const IconComponent = ICON_REGISTRY[iconName];
          const isSelected = selectedIcon === iconName;

          return (
            <button
              key={iconName}
              onClick={() => {
                onSelect(iconName);
                onClose?.();
              }}
              title={iconName}
              style={{
                width: '36px',
                height: '36px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: isSelected ? 'rgba(136, 136, 136, 0.15)' : 'transparent',
                border: isSelected ? '1px solid var(--accent-primary)' : '1px solid transparent',
                borderRadius: '6px',
                cursor: 'pointer',
                color: isSelected ? 'var(--text-primary)' : 'var(--accent-primary)',
                transition: 'all 0.15s ease'
              }}
              onMouseEnter={(e) => {
                if (!isSelected) {
                  e.currentTarget.style.background = 'var(--bg-elevated)';
                  e.currentTarget.style.color = 'var(--text-primary)';
                }
              }}
              onMouseLeave={(e) => {
                if (!isSelected) {
                  e.currentTarget.style.background = 'transparent';
                  e.currentTarget.style.color = 'var(--accent-primary)';
                }
              }}
            >
              <IconComponent size={18} />
            </button>
          );
        })}
      </div>

      {filteredIcons.length === 0 && (
        <div style={{
          padding: '20px',
          textAlign: 'center',
          color: 'var(--accent-dark)',
          fontSize: '13px'
        }}>
          No icons match "{searchQuery}"
        </div>
      )}
    </div>
  );
}
