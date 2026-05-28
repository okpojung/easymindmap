// Design tokens — Warm Productivity (light) + Modern Dark
// Reference doc: docs/03-editor-core/canvas/10-canvas.md § 28

export type ThemeName = 'light' | 'dark';

export interface NodeFamily {
  fill: string;
  text: string;
  border: string;
}

export interface ThemeTokens {
  name: ThemeName;

  // Surfaces
  bg: string;
  canvas: string;
  surface: string;
  surfaceAlt: string;
  surfaceSunken: string;

  // Borders & dividers
  border: string;
  borderStrong: string;
  divider: string;

  // Text
  text: string;
  textMuted: string;
  textSubtle: string;

  // Primary (amber by default)
  primary: string;
  primaryHover: string;
  primarySoft: string;
  primaryBorder: string;

  accent: string;
  success: string;
  warning: string;
  danger: string;

  // Node families
  nodeRoot: NodeFamily;
  nodeL1A: NodeFamily;
  nodeL1B: NodeFamily;
  nodeL1C: NodeFamily;
  nodeL1D: NodeFamily;
  nodeL1E: NodeFamily;
  nodeL2: NodeFamily;

  // Edges
  edge: string;
  edgeStrong: string;

  // Collab user colors
  user1: string; user2: string; user3: string; user4: string; user5: string;

  // Shadows
  shadowSm: string;
  shadowMd: string;
  shadowLg: string;

  highlight: string;
}

export const THEMES: Record<ThemeName, ThemeTokens> = {
  light: {
    name: 'light',
    bg: '#FAF7F2',
    canvas: '#F5F0E8',
    surface: '#FFFFFF',
    surfaceAlt: '#FBF8F3',
    surfaceSunken: '#F1ECE3',
    border: '#E8E0D2',
    borderStrong: '#D6CBB7',
    divider: '#EFE8DB',
    text: '#1F1B16',
    textMuted: '#6B6358',
    textSubtle: '#958A78',
    primary: '#D97706',
    primaryHover: '#B45309',
    primarySoft: '#FEF3C7',
    primaryBorder: '#F59E0B',
    accent: '#0284C7',
    success: '#15803D',
    warning: '#CA8A04',
    danger: '#DC2626',
    nodeRoot: { fill: '#D97706', text: '#FFFFFF', border: '#B45309' },
    nodeL1A:  { fill: '#FEF3C7', text: '#78350F', border: '#F59E0B' },
    nodeL1B:  { fill: '#DBEAFE', text: '#1E3A8A', border: '#3B82F6' },
    nodeL1C:  { fill: '#DCFCE7', text: '#14532D', border: '#22C55E' },
    nodeL1D:  { fill: '#FEE2E2', text: '#7F1D1D', border: '#EF4444' },
    nodeL1E:  { fill: '#EDE9FE', text: '#4C1D95', border: '#8B5CF6' },
    nodeL2:   { fill: '#FFFFFF', text: '#1F1B16', border: '#D6CBB7' },
    edge: '#B8A888',
    edgeStrong: '#8A7E6A',
    user1: '#D97706', user2: '#0284C7', user3: '#15803D', user4: '#9333EA', user5: '#DC2626',
    shadowSm: '0 1px 2px rgba(60, 42, 12, 0.06)',
    shadowMd: '0 4px 12px rgba(60, 42, 12, 0.08), 0 1px 3px rgba(60, 42, 12, 0.06)',
    shadowLg: '0 12px 32px rgba(60, 42, 12, 0.12), 0 4px 10px rgba(60, 42, 12, 0.08)',
    highlight: '#FEF3C7',
  },
  dark: {
    name: 'dark',
    bg: '#0F1115',
    canvas: '#14171D',
    surface: '#181A20',
    surfaceAlt: '#1C1F26',
    surfaceSunken: '#0C0E12',
    border: '#2A2E38',
    borderStrong: '#3A3F4B',
    divider: '#23262E',
    text: '#E8E6E3',
    textMuted: '#A09A90',
    textSubtle: '#6B6558',
    primary: '#F59E0B',
    primaryHover: '#FBBF24',
    primarySoft: '#3B2A0A',
    primaryBorder: '#F59E0B',
    accent: '#38BDF8',
    success: '#4ADE80',
    warning: '#FACC15',
    danger: '#F87171',
    nodeRoot: { fill: '#F59E0B', text: '#1A120A', border: '#FBBF24' },
    nodeL1A:  { fill: '#3B2A0A', text: '#FBBF24', border: '#F59E0B' },
    nodeL1B:  { fill: '#0C2340', text: '#93C5FD', border: '#3B82F6' },
    nodeL1C:  { fill: '#0F2F1E', text: '#86EFAC', border: '#22C55E' },
    nodeL1D:  { fill: '#3B1414', text: '#FCA5A5', border: '#EF4444' },
    nodeL1E:  { fill: '#231640', text: '#C4B5FD', border: '#8B5CF6' },
    nodeL2:   { fill: '#1C1F26', text: '#E8E6E3', border: '#3A3F4B' },
    edge: '#4A4E5A',
    edgeStrong: '#6B6F7D',
    user1: '#F59E0B', user2: '#38BDF8', user3: '#4ADE80', user4: '#C084FC', user5: '#F87171',
    shadowSm: '0 1px 2px rgba(0,0,0,0.4)',
    shadowMd: '0 4px 12px rgba(0,0,0,0.5), 0 1px 3px rgba(0,0,0,0.4)',
    shadowLg: '0 12px 32px rgba(0,0,0,0.6), 0 4px 10px rgba(0,0,0,0.5)',
    highlight: '#3B2A0A',
  },
};
