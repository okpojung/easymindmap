// Inline SVG icons — outline style, 20x20 default, currentColor stroke
// Lucide-inspired, custom-tuned for the warm UI of EasyMindMap

import type { CSSProperties, SVGProps, ReactNode } from 'react';

export interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'children'> {
  size?: number;
  strokeWidth?: number;
  style?: CSSProperties;
  children?: ReactNode;
}

const Icon = ({
  children,
  size = 18,
  strokeWidth = 1.6,
  style = {},
  ...rest
}: IconProps) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    style={{ flexShrink: 0, ...style }}
    {...rest}
  >
    {children}
  </svg>
);

type P = Partial<IconProps>;

export const I = {
  Logo: (p: P = {}) => (
    <svg
      width={p.size || 22}
      height={p.size || 22}
      viewBox="0 0 24 24"
      fill="none"
      {...(p as any)}
    >
      <circle cx="12" cy="12" r="3.2" fill="#D97706" />
      <circle cx="5" cy="6.5" r="2" fill="#F59E0B" />
      <circle cx="19" cy="6.5" r="2" fill="#F59E0B" />
      <circle cx="5" cy="17.5" r="2" fill="#F59E0B" />
      <circle cx="19" cy="17.5" r="2" fill="#F59E0B" />
      <path
        d="M7 7.5L10 10.5M17 7.5L14 10.5M7 16.5L10 13.5M17 16.5L14 13.5"
        stroke="#D97706"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  ),

  Menu: (p: P = {}) => (
    <Icon {...p}>
      <line x1="4" y1="6" x2="20" y2="6" />
      <line x1="4" y1="12" x2="20" y2="12" />
      <line x1="4" y1="18" x2="20" y2="18" />
    </Icon>
  ),

  Undo: (p: P = {}) => (
    <Icon {...p}>
      <path d="M3 7v6h6" />
      <path d="M21 17a9 9 0 0 0-15-6.7L3 13" />
    </Icon>
  ),

  Redo: (p: P = {}) => (
    <Icon {...p}>
      <path d="M21 7v6h-6" />
      <path d="M3 17a9 9 0 0 1 15-6.7L21 13" />
    </Icon>
  ),

  Plus: (p: P = {}) => (
    <Icon {...p}>
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </Icon>
  ),

  Minus: (p: P = {}) => (
    <Icon {...p}>
      <line x1="5" y1="12" x2="19" y2="12" />
    </Icon>
  ),

  Search: (p: P = {}) => (
    <Icon {...p}>
      <circle cx="11" cy="11" r="7" />
      <line x1="20" y1="20" x2="16.65" y2="16.65" />
    </Icon>
  ),

  Tree: (p: P = {}) => (
    <Icon {...p}>
      <rect x="3" y="3" width="6" height="4" rx="1" />
      <rect x="15" y="3" width="6" height="4" rx="1" />
      <rect x="9" y="17" width="6" height="4" rx="1" />
      <path d="M6 7v4h12V7M12 11v6" />
    </Icon>
  ),

  Template: (p: P = {}) => (
    <Icon {...p}>
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </Icon>
  ),

  History: (p: P = {}) => (
    <Icon {...p}>
      <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
      <path d="M3 3v5h5" />
      <path d="M12 7v5l3 2" />
    </Icon>
  ),

  Layout: (p: P = {}) => (
    <Icon {...p}>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <line x1="9" y1="3" x2="9" y2="21" />
      <line x1="3" y1="9" x2="21" y2="9" />
    </Icon>
  ),

  Sparkles: (p: P = {}) => (
    <Icon {...p}>
      <path d="M12 3l2 5 5 2-5 2-2 5-2-5-5-2 5-2z" />
      <path d="M19 14l1 2 2 1-2 1-1 2-1-2-2-1 2-1z" />
    </Icon>
  ),

  Share: (p: P = {}) => (
    <Icon {...p}>
      <circle cx="18" cy="5" r="3" />
      <circle cx="6" cy="12" r="3" />
      <circle cx="18" cy="19" r="3" />
      <line x1="8.6" y1="13.5" x2="15.4" y2="17.5" />
      <line x1="15.4" y1="6.5" x2="8.6" y2="10.5" />
    </Icon>
  ),

  Download: (p: P = {}) => (
    <Icon {...p}>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </Icon>
  ),

  Check: (p: P = {}) => (
    <Icon {...p}>
      <polyline points="20 6 9 17 4 12" />
    </Icon>
  ),

  Cloud: (p: P = {}) => (
    <Icon {...p}>
      <path d="M18 10a5 5 0 0 0-9.8-1.2A4 4 0 0 0 7 17h11a4 4 0 0 0 0-7z" />
    </Icon>
  ),

  ChevronDown: (p: P = {}) => (
    <Icon {...p}>
      <polyline points="6 9 12 15 18 9" />
    </Icon>
  ),

  ChevronRight: (p: P = {}) => (
    <Icon {...p}>
      <polyline points="9 6 15 12 9 18" />
    </Icon>
  ),

  ChevronLeft: (p: P = {}) => (
    <Icon {...p}>
      <polyline points="15 6 9 12 15 18" />
    </Icon>
  ),

  X: (p: P = {}) => (
    <Icon {...p}>
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </Icon>
  ),

  MoreH: (p: P = {}) => (
    <Icon {...p}>
      <circle cx="5" cy="12" r="1.4" />
      <circle cx="12" cy="12" r="1.4" />
      <circle cx="19" cy="12" r="1.4" />
    </Icon>
  ),

  Tag: (p: P = {}) => (
    <Icon {...p}>
      <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
      <circle cx="7" cy="7" r="1.2" />
    </Icon>
  ),

  Note: (p: P = {}) => (
    <Icon {...p}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="8" y1="13" x2="16" y2="13" />
      <line x1="8" y1="17" x2="13" y2="17" />
    </Icon>
  ),

  Link: (p: P = {}) => (
    <Icon {...p}>
      <path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1" />
      <path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1" />
    </Icon>
  ),

  Palette: (p: P = {}) => (
    <Icon {...p}>
      <circle cx="13.5" cy="6.5" r="1.2" />
      <circle cx="17.5" cy="10.5" r="1.2" />
      <circle cx="8.5" cy="7.5" r="1.2" />
      <circle cx="6.5" cy="12.5" r="1.2" />
      <path d="M12 22a10 10 0 1 1 10-10c0 3-2 4-4 4h-1a2 2 0 0 0-2 2 2 2 0 0 0 .5 1.3A2 2 0 0 1 14 22z" />
    </Icon>
  ),

  Shapes: (p: P = {}) => (
    <Icon {...p}>
      <circle cx="7" cy="16" r="4" />
      <rect x="13" y="13" width="7" height="7" rx="1" />
      <path d="M13 7l3-5 3 5z" />
    </Icon>
  ),

  Type: (p: P = {}) => (
    <Icon {...p}>
      <polyline points="4 7 4 4 20 4 20 7" />
      <line x1="9" y1="20" x2="15" y2="20" />
      <line x1="12" y1="4" x2="12" y2="20" />
    </Icon>
  ),

  Globe: (p: P = {}) => (
    <Icon {...p}>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3a13 13 0 0 1 0 18A13 13 0 0 1 12 3z" />
    </Icon>
  ),

  Users: (p: P = {}) => (
    <Icon {...p}>
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.9" />
      <path d="M16 3.1a4 4 0 0 1 0 7.8" />
    </Icon>
  ),

  Lock: (p: P = {}) => (
    <Icon {...p}>
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </Icon>
  ),

  Panel: (p: P = {}) => (
    <Icon {...p}>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <line x1="15" y1="3" x2="15" y2="21" />
    </Icon>
  ),

  Full: (p: P = {}) => (
    <Icon {...p}>
      <polyline points="3 9 3 3 9 3" />
      <polyline points="21 9 21 3 15 3" />
      <polyline points="3 15 3 21 9 21" />
      <polyline points="21 15 21 21 15 21" />
    </Icon>
  ),

  Fit: (p: P = {}) => (
    <Icon {...p}>
      <path d="M8 3H5a2 2 0 0 0-2 2v3" />
      <path d="M21 8V5a2 2 0 0 0-2-2h-3" />
      <path d="M3 16v3a2 2 0 0 0 2 2h3" />
      <path d="M16 21h3a2 2 0 0 0 2-2v-3" />
    </Icon>
  ),

  Hand: (p: P = {}) => (
    <Icon {...p}>
      <path d="M18 11V6a2 2 0 0 0-4 0v5M14 10V4a2 2 0 0 0-4 0v6M10 10.5V6a2 2 0 0 0-4 0v8" />
      <path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-2-5-3L3 13a2 2 0 1 1 3.2-2.4" />
    </Icon>
  ),

  ArrowUp: (p: P = {}) => (
    <Icon {...p}>
      <line x1="12" y1="19" x2="12" y2="5" />
      <polyline points="5 12 12 5 19 12" />
    </Icon>
  ),

  ArrowDown: (p: P = {}) => (
    <Icon {...p}>
      <line x1="12" y1="5" x2="12" y2="19" />
      <polyline points="19 12 12 19 5 12" />
    </Icon>
  ),

  ArrowRight: (p: P = {}) => (
    <Icon {...p}>
      <line x1="5" y1="12" x2="19" y2="12" />
      <polyline points="12 5 19 12 12 19" />
    </Icon>
  ),

  ArrowLeft: (p: P = {}) => (
    <Icon {...p}>
      <line x1="19" y1="12" x2="5" y2="12" />
      <polyline points="12 19 5 12 12 5" />
    </Icon>
  ),

  Copy: (p: P = {}) => (
    <Icon {...p}>
      <rect x="9" y="9" width="13" height="13" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </Icon>
  ),

  Trash: (p: P = {}) => (
    <Icon {...p}>
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6M14 11v6" />
    </Icon>
  ),

  Focus: (p: P = {}) => (
    <Icon {...p}>
      <circle cx="12" cy="12" r="3" />
      <path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2" />
    </Icon>
  ),

  Center: (p: P = {}) => (
    <Icon {...p}>
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="2" fill="currentColor" />
    </Icon>
  ),

  Bot: (p: P = {}) => (
    <Icon {...p}>
      <rect x="4" y="8" width="16" height="12" rx="2" />
      <circle cx="9" cy="14" r="1" fill="currentColor" />
      <circle cx="15" cy="14" r="1" fill="currentColor" />
      <path d="M12 4v4M9 20v2M15 20v2" />
    </Icon>
  ),

  Settings: (p: P = {}) => (
    <Icon {...p}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 0 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
    </Icon>
  ),

  Circle: (p: P = {}) => (
    <Icon {...p}>
      <circle cx="12" cy="12" r="9" />
    </Icon>
  ),

  Square: (p: P = {}) => (
    <Icon {...p}>
      <rect x="4" y="4" width="16" height="16" rx="2" />
    </Icon>
  ),

  Diamond: (p: P = {}) => (
    <Icon {...p}>
      <path d="M12 2l10 10-10 10L2 12z" />
    </Icon>
  ),

  Capsule: (p: P = {}) => (
    <Icon {...p}>
      <rect x="3" y="8" width="18" height="8" rx="4" />
    </Icon>
  ),

  Hexagon: (p: P = {}) => (
    <Icon {...p}>
      <path d="M21 8.5v7L12 21l-9-5.5v-7L12 3z" />
    </Icon>
  ),

  Sidebar: (p: P = {}) => (
    <Icon {...p}>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <line x1="9" y1="3" x2="9" y2="21" />
    </Icon>
  ),

  Bell: (p: P = {}) => (
    <Icon {...p}>
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.7 21a2 2 0 0 1-3.4 0" />
    </Icon>
  ),

  Mouse: (p: P = {}) => (
    <Icon {...p}>
      <path d="M5 3l7 18 2.5-8 8-2.5z" />
    </Icon>
  ),
};