// Tiny SVG glyphs that visually preview each layout style in the picker.

type GlyphType = 'radial' | 'tree' | 'hier' | 'kanban';

export function LayoutGlyph({ type }: { type: GlyphType }) {
  const size = { width: 18, height: 14 };
  if (type === 'radial') return (
    <svg {...size} viewBox="0 0 18 14">
      <circle cx="9" cy="7" r="2" fill="currentColor"/>
      <circle cx="2" cy="3"  r="1.3" fill="currentColor" opacity="0.5"/>
      <circle cx="2" cy="11" r="1.3" fill="currentColor" opacity="0.5"/>
      <circle cx="16" cy="3"  r="1.3" fill="currentColor" opacity="0.5"/>
      <circle cx="16" cy="11" r="1.3" fill="currentColor" opacity="0.5"/>
    </svg>
  );
  if (type === 'tree') return (
    <svg {...size} viewBox="0 0 18 14">
      <rect x="1"  y="5" width="5" height="4" rx="1" fill="currentColor"/>
      <rect x="12" y="1" width="5" height="3" rx="1" fill="currentColor" opacity="0.5"/>
      <rect x="12" y="6" width="5" height="3" rx="1" fill="currentColor" opacity="0.5"/>
      <rect x="12" y="11" width="5" height="3" rx="1" fill="currentColor" opacity="0.5"/>
    </svg>
  );
  if (type === 'hier') return (
    <svg {...size} viewBox="0 0 18 14">
      <rect x="6" y="1" width="6" height="3" rx="1" fill="currentColor"/>
      <rect x="1"  y="9" width="4" height="3" rx="1" fill="currentColor" opacity="0.5"/>
      <rect x="7"  y="9" width="4" height="3" rx="1" fill="currentColor" opacity="0.5"/>
      <rect x="13" y="9" width="4" height="3" rx="1" fill="currentColor" opacity="0.5"/>
    </svg>
  );
  // kanban
  return (
    <svg {...size} viewBox="0 0 18 14">
      <rect x="1"  y="2" width="4" height="10" rx="1" fill="currentColor" opacity="0.4"/>
      <rect x="7"  y="2" width="4" height="10" rx="1" fill="currentColor" opacity="0.4"/>
      <rect x="13" y="2" width="4" height="10" rx="1" fill="currentColor" opacity="0.4"/>
    </svg>
  );
}
