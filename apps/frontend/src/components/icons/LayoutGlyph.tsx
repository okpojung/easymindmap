// File: src/components/icons/LayoutGlyph.tsx
// Version: MVP-LayoutGlyph-v1.0.1
// Description:
// - Minimal SVG layout glyph icons
// - Used by LayoutTab.tsx
// - No external project imports to avoid circular import

import type { ReactNode } from 'react';

export type LayoutGlyphType =
  | 'both-radial'
  | 'radial-right'
  | 'tree-right'
  | 'tree-down'
  | 'hierarchy-right'
  | 'process-tree-right'
  | 'kanban'
  | 'freeform'
  | 'timeline'
  | 'timeline-center';

interface LayoutGlyphProps {
  type: LayoutGlyphType;
  color?: string;
  width?: number;
  height?: number;
  strokeWidth?: number;
}

function SvgWrap({
  width,
  height,
  children,
}: {
  width: number;
  height: number;
  children: ReactNode;
}) {
  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 44 26"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export function LayoutGlyph({
  type,
  color = '#6E7F9E',
  width = 44,
  height = 26,
  strokeWidth = 1.7,
}: LayoutGlyphProps) {
  const lineProps = {
    stroke: color,
    strokeWidth,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    fill: 'none',
    vectorEffect: 'non-scaling-stroke' as const,
  };

  const rectProps = {
    stroke: color,
    strokeWidth,
    fill: 'none',
    rx: 0.8,
    ry: 0.8,
    vectorEffect: 'non-scaling-stroke' as const,
  };

  // ── 시간배치 2종 ────────────────────────────────────────────────
  // 두 아이콘 모두 **중심 주제를 축 왼쪽 끝에** 그린다 (2026-08-07 요청 —
  // 실제 배치와 같아야 고를 때 결과가 보인다). 둘의 차이는 하나뿐:
  //   timeline        — 2레벨 주제가 축에서 **위/아래로 떨어져 매달린다**
  //   timeline-center — 2레벨 주제가 **축 위에 얹힌다**(축이 관통)
  if (type === 'timeline') {
    return (
      <SvgWrap width={width} height={height}>
        {/* 중심 주제 = 축 왼쪽 끝 */}
        <rect x="2" y="10.5" width="8" height="5" {...rectProps} />
        <line x1="10" y1="13" x2="40" y2="13" {...lineProps} />
        <path d="M38 10.5 L42 13 L38 15.5" {...lineProps} />
        {/* 주제는 축에서 떨어져 매달린다 */}
        <rect x="14" y="2.5" width="9" height="5" {...rectProps} />
        <line x1="18.5" y1="7.5" x2="18.5" y2="13" {...lineProps} />
        <rect x="27" y="18.5" width="9" height="5" {...rectProps} />
        <line x1="31.5" y1="13" x2="31.5" y2="18.5" {...lineProps} />
      </SvgWrap>
    );
  }

  if (type === 'timeline-center') {
    return (
      <SvgWrap width={width} height={height}>
        {/* 중심 주제 + 주제 2개가 **모두 축 위에** — 축은 상자 사이만 잇는다 */}
        <rect x="2" y="10.5" width="8" height="5" {...rectProps} />
        <line x1="10" y1="13" x2="14" y2="13" {...lineProps} />
        <rect x="14" y="10.5" width="9" height="5" {...rectProps} />
        <line x1="23" y1="13" x2="27" y2="13" {...lineProps} />
        <rect x="27" y="10.5" width="9" height="5" {...rectProps} />
        <line x1="36" y1="13" x2="40" y2="13" {...lineProps} />
        <path d="M38 10.5 L42 13 L38 15.5" {...lineProps} />
        {/* 하위는 위/아래로 번갈아 */}
        <line x1="16.5" y1="10.5" x2="16.5" y2="6" {...lineProps} />
        <line x1="16.5" y1="6" x2="21" y2="6" {...lineProps} />
        <line x1="29.5" y1="15.5" x2="29.5" y2="20" {...lineProps} />
        <line x1="29.5" y1="20" x2="34" y2="20" {...lineProps} />
      </SvgWrap>
    );
  }

  if (type === 'both-radial') {
    return (
      <SvgWrap width={width} height={height}>
        <rect x="18" y="10" width="8" height="5" {...rectProps} />

        <path d="M18 12.5 C14 12.5 13 7 9 7" {...lineProps} />
        <path d="M18 12.5 C14 12.5 13 18 9 18" {...lineProps} />
        <path d="M26 12.5 C30 12.5 31 7 35 7" {...lineProps} />
        <path d="M26 12.5 C30 12.5 31 18 35 18" {...lineProps} />

        <line x1="7" y1="7" x2="10" y2="7" {...lineProps} />
        <line x1="7" y1="18" x2="10" y2="18" {...lineProps} />
        <line x1="34" y1="7" x2="37" y2="7" {...lineProps} />
        <line x1="34" y1="18" x2="37" y2="18" {...lineProps} />
      </SvgWrap>
    );
  }

  if (type === 'radial-right') {
    return (
      <SvgWrap width={width} height={height}>
        <rect x="4" y="10" width="8" height="5" {...rectProps} />

        <path d="M12 12.5 C18 12.5 20 6 31 6" {...lineProps} />
        <path d="M12 12.5 C18 12.5 20 12.5 31 12.5" {...lineProps} />
        <path d="M12 12.5 C18 12.5 20 19 31 19" {...lineProps} />

        <line x1="31" y1="6" x2="35" y2="6" {...lineProps} />
        <line x1="31" y1="12.5" x2="35" y2="12.5" {...lineProps} />
        <line x1="31" y1="19" x2="35" y2="19" {...lineProps} />
      </SvgWrap>
    );
  }

  if (type === 'tree-right') {
    return (
      <SvgWrap width={width} height={height}>
        <rect x="4" y="2" width="14" height="7" {...rectProps} />

        <path d="M8 9 V23" {...lineProps} />
        <path d="M8 12 H12" {...lineProps} />
        <path d="M8 17 H12" {...lineProps} />
        <path d="M8 22 H12" {...lineProps} />
      </SvgWrap>
    );
  }

  if (type === 'tree-down') {
    return (
      <SvgWrap width={width} height={height}>
        <rect x="18" y="2" width="8" height="5" {...rectProps} />

        <path d="M22 7 V12" {...lineProps} />
        <path d="M10 12 H34" {...lineProps} />
        <path d="M12 12 V16" {...lineProps} />
        <path d="M22 12 V16" {...lineProps} />
        <path d="M32 12 V16" {...lineProps} />
      </SvgWrap>
    );
  }

  if (type === 'hierarchy-right') {
    return (
      <SvgWrap width={width} height={height}>
        <rect x="4" y="2" width="12" height="7" {...rectProps} />

        <path d="M16 5.5 H19" {...lineProps} />
        <path d="M19 5.5 V23" {...lineProps} />
        <path d="M19 11 H22" {...lineProps} />
        <path d="M19 18 H22" {...lineProps} />
        <path d="M19 23 C19 24 19.5 24 21 24" {...lineProps} />
        <path d="M19 5.5 C19 4.5 19.5 4.5 21 4.5" {...lineProps} />
      </SvgWrap>
    );
  }

  if (type === 'process-tree-right') {
    return (
      <SvgWrap width={width} height={height}>
        <rect x="4" y="2" width="12" height="7" {...rectProps} />

        <path d="M8 9 V12" {...lineProps} />
        <path d="M8 12 H37" {...lineProps} />
        <path d="M14 12 V17" {...lineProps} />
        <path d="M24 12 V17" {...lineProps} />
        <path d="M37 12 V17" {...lineProps} />
      </SvgWrap>
    );
  }

  if (type === 'kanban') {
    return (
      <SvgWrap width={width} height={height}>
        <rect x="5" y="4" width="8" height="16" {...rectProps} />
        <rect x="18" y="4" width="8" height="16" {...rectProps} />
        <rect x="31" y="4" width="8" height="16" {...rectProps} />
      </SvgWrap>
    );
  }

  return (
    <SvgWrap width={width} height={height}>
      <rect x="6" y="5" width="5" height="3.5" {...rectProps} />
      <rect x="17" y="14" width="5" height="3.5" {...rectProps} />
      <rect x="30" y="7" width="5" height="3.5" {...rectProps} />
    </SvgWrap>
  );
}

export default LayoutGlyph;