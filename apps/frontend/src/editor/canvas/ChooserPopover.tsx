// ChooserPopover — 링크(🔗)/첨부(📎)/미디어(▶) 인디케이터 클릭 시 항목 목록.
//
// 2026-07 사용자 요청:
//   · 위치 = 노드(아이콘) **오른쪽** — 목록이 노트/노드 아래를 가리지 않게
//   · 호버 중인 항목을 **시인성 있게 강조** (배경·굵게·왼쪽 바 + ↗) —
//     풀 URL 툴팁만으로는 어느 항목 위에 있는지 알기 어려웠다
//   · 첨부: PDF·사진·텍스트는 새 탭에서 바로 열기, 오피스는 즉시 다운로드
//     (openAttachment.ts 정책)

import { useState } from 'react';
import type { ThemeTokens } from '@/components/design-tokens/theme';
import type { LaidOutNode } from '@/layout/types';
import type { ContentIndicator } from '@/editor/node-renderer/nodeContent';
import { openAttachment } from '@/utils/openAttachment';

export function ChooserPopover({
  t, node, ind, onClose,
}: {
  t: ThemeTokens;
  node: LaidOutNode;
  ind: ContentIndicator;
  onClose: () => void;
}) {
  const [hover, setHover] = useState(-1);
  const width = 260;
  const height = Math.min(300, 10 + ind.items.length * 26);

  return (
    <foreignObject
      // 노드 오른쪽 옆, 세로는 노드 중심 정렬
      x={node.x + node.w / 2 + 10}
      y={node.y - height / 2}
      width={width}
      height={height}
    >
      <div
        data-testid="chooser-popover"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
        style={{
          background: t.surface,
          border: `1px solid ${t.border}`,
          borderRadius: 6,
          boxShadow: '0 4px 14px rgba(0,0,0,0.2)',
          padding: 4,
          fontFamily: 'inherit',
          maxHeight: height,
          overflow: 'auto',
        }}
      >
        {ind.items.map((it, i) => {
          const on = hover === i;
          return (
            <button
              key={i}
              data-chooser-item={i}
              title={it.url || it.label}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover((h) => (h === i ? -1 : h))}
              onClick={() => {
                if (ind.kind === 'link') {
                  if (it.url) window.open(it.url, '_blank', 'noopener');
                } else {
                  openAttachment(it.label, it.url);
                }
                onClose();
              }}
              style={{
                display: 'block', width: '100%', textAlign: 'left',
                padding: '5px 8px', border: 'none',
                // 호버 항목 강조 — 배경 + 왼쪽 바 + 굵게 (어느 항목을
                // 고르는 중인지 한눈에)
                background: on ? t.primarySoft : 'transparent',
                boxShadow: on ? `inset 3px 0 0 ${t.primary}` : undefined,
                color: on ? t.primary : t.text,
                fontWeight: on ? 700 : 400,
                fontSize: 11.5, cursor: 'pointer', borderRadius: 4,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}
            >
              {ind.icon} {it.label}{on ? ' ↗' : ''}
            </button>
          );
        })}
      </div>
    </foreignObject>
  );
}
