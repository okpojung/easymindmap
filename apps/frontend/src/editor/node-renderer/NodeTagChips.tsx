// NodeTagChips — flag-shaped tag chips placed below a node.
// Matches docs/assets/태그2.png pattern. See 10-canvas.md § 24.
//
// 2026-10-23 사용자 요청
//   · 태그가 많으면 노드 오른쪽 경계를 넘지 않게 **여러 줄로** 놓는다 (layoutTagRows,
//     레이아웃 엔진도 같은 줄 수만큼 아래 자리를 비운다 — tagOverhang).
//   · 태그를 끌어 **순서를 바꾼다**. 놓을 자리에 세로 막대로 들어갈 곳을 보여 준다.
import { useRef, useState } from 'react';
import type { ThemeTokens } from '@/components/design-tokens/theme';
import type { LaidOutNode } from '@/layout/types';
import { layoutTagRows, TAG_INSET, TAG_INSET_LEFT_SPINE, TAG_ROW_GAP, TAG_ROW_H, TAG_TOP_GAP } from '@/layout/tagOverhang';
import { resolveTagColor } from './resolveTagColor';
import { measureTextApprox } from './mdTable';
import { useTr } from '@/i18n';

interface Props {
  n: LaidOutNode;
  tagList: string[];
  t: ThemeTokens;
  // X(닫기) 클릭 시 해당 태그를 노드에서 제거 (documentStore.removeNodeTag)
  onRemove?: (tag: string) => void;
  // 끌어서 순서 바꾸기 — tag 를 toIndex(tagList 기준) 자리로 (documentStore.moveNodeTag)
  onMove?: (tag: string, toIndex: number) => void;
}

export function NodeTagChips({ n, tagList, t, onRemove, onMove }: Props) {
  const tr = useTr();
  const tagH = TAG_ROW_H;
  const arrowW = 6;
  const padX = 8;

  // Some layouts route the connector to a node's children down the node's LEFT
  // side: process-tree (spine ≈ left + 14, EdgeRenderer.PROCESS_SPINE_INSET) and
  // tree-right (outline spine ≈ left + 12, EdgeRenderer.createOutlinePath). For
  // those, start the chips to the RIGHT of that spine so they don't cover the
  // connector line dropping to the children below. Other layouts keep the small
  // left inset.
  const connectorOnLeftSide =
    n.layoutType === 'process-tree-right' ||
    n.layoutType === 'process-tree-left' ||
    n.layoutType === 'process-tree-right-a' ||
    n.layoutType === 'process-tree-right-b' ||
    n.layoutType === 'progress-tree' ||
    n.layoutType === 'tree-right' ||
    n.layoutType === 'tree';

  const left = n.x - n.w / 2;
  const top = n.y + n.h / 2 + TAG_TOP_GAP;
  const slots = layoutTagRows(tagList, n.w, connectorOnLeftSide ? TAG_INSET_LEFT_SPINE : TAG_INSET)
    .map((s) => ({ ...s, x0: left + s.x, y0: top + s.row * (tagH + TAG_ROW_GAP) }));

  // ── 끌기 ─────────────────────────────────────────────────────────
  const [drag, setDrag] = useState<{ from: number; to: number; dx: number; dy: number } | null>(null);
  const start = useRef<{ id: number; x: number; y: number; from: number; el: Element; moved: boolean } | null>(null);
  /** 포인터가 놓인 자리 = 그 앞에 끼워 넣을 칩 번호 (0..length) */
  const insertAt = (wx: number, wy: number): number => {
    let best = slots.length, bestD = Infinity;
    slots.forEach((s, i) => {
      const cy = s.y0 + tagH / 2;
      for (const [x, k] of [[s.x0, i], [s.x0 + s.w, i + 1]] as const) {
        const d = Math.abs(wx - x) + Math.abs(wy - cy) * 3;
        if (d < bestD) { bestD = d; best = k; }
      }
    });
    return best;
  };
  const toWorld = (el: Element, clientX: number, clientY: number): { x: number; y: number } | null => {
    const m = (el as SVGGraphicsElement).getScreenCTM?.();
    if (!m) return null;
    const p = new DOMPoint(clientX, clientY).matrixTransform(m.inverse());
    return Number.isFinite(p.x) && Number.isFinite(p.y) ? { x: p.x, y: p.y } : null;
  };

  return (
    <g data-node-tags={n.id}>
      {tagList.map((tagName, i) => {
        const tc = resolveTagColor(tagName, t);
        // 글자 수 × 고정폭(6.2)은 한글 태그에서 폭이 모자라 라벨과 ✕가
        // 겹쳤다 — 문자 종류별 근사 폭(한글≈10px)으로 실제 폭을 잰다.
        const labelW = Math.max(20, Math.ceil(measureTextApprox(tagName, 10)));
        const s = slots[i];
        const dragging = drag?.from === i;
        const offX = dragging ? drag!.dx : 0, offY = dragging ? drag!.dy : 0;
        const x0 = s.x0 + offX;
        const x1 = x0 + arrowW;
        const x2 = x0 + s.w;
        const yTop = s.y0 + offY;
        const yBot = yTop + tagH;
        const yMid = yTop + tagH / 2;

        // Flag (ribbon) shape: pointed left tail + rounded right corners
        const path = `
          M ${x0} ${yMid}
          L ${x1} ${yTop}
          L ${x2 - 3} ${yTop}
          Q ${x2} ${yTop} ${x2} ${yTop + 3}
          L ${x2} ${yBot - 3}
          Q ${x2} ${yBot} ${x2 - 3} ${yBot}
          L ${x1} ${yBot}
          Z
        `;

        return (
          <g key={tagName + i} data-node-tag={tagName} opacity={dragging ? 0.75 : 1}>
            <g
              style={{ cursor: onMove && tagList.length > 1 ? (dragging ? 'grabbing' : 'grab') : undefined, touchAction: 'none' }}
              onPointerDown={(e) => {
                if (!onMove || e.button !== 0 || tagList.length < 2) return;
                e.stopPropagation();
                e.currentTarget.setPointerCapture(e.pointerId);
                start.current = { id: e.pointerId, x: e.clientX, y: e.clientY, from: i, el: e.currentTarget, moved: false };
              }}
              onPointerMove={(e) => {
                const st = start.current;
                if (!st || st.id !== e.pointerId) return;
                e.stopPropagation();
                if (!st.moved && Math.hypot(e.clientX - st.x, e.clientY - st.y) < 4) return;
                st.moved = true;
                const p = toWorld(e.currentTarget, e.clientX, e.clientY);
                const p0 = toWorld(e.currentTarget, st.x, st.y);
                if (!p || !p0) return;
                setDrag({ from: st.from, to: insertAt(p.x, p.y), dx: p.x - p0.x, dy: p.y - p0.y });
              }}
              onPointerUp={(e) => {
                const st = start.current;
                if (!st || st.id !== e.pointerId) return;
                e.stopPropagation();
                start.current = null;
                try { st.el.releasePointerCapture(e.pointerId); } catch { /* released */ }
                const d = drag;
                setDrag(null);
                if (!st.moved || !d) return;
                // 끼울 자리(to)는 원래 칩을 뺀 뒤의 번호로 바꾼다
                const to = d.to > d.from ? d.to - 1 : d.to;
                if (to !== d.from) onMove?.(tagName, to);
              }}
              onPointerCancel={() => { start.current = null; setDrag(null); }}
              onClick={(e) => e.stopPropagation()}
              onDoubleClick={(e) => e.stopPropagation()}
            >
              {onMove && tagList.length > 1 && <title>{tr('editor.node.dragTag')}</title>}
              <path d={path} fill={tc.bg} stroke={tc.border} strokeWidth="0.8" />
              <text x={x1 + padX} y={yMid + 3.4}
                    fontSize="10" fontWeight="600"
                    fill={tc.text} textAnchor="start"
                    style={{ fontFamily: 'inherit', letterSpacing: 0.2, userSelect: 'none' }}>
                {tagName}
              </text>
            </g>
            <line x1={x1 + padX + labelW + 2} y1={yTop + 3}
                  x2={x1 + padX + labelW + 2} y2={yBot - 3}
                  stroke={tc.text} strokeOpacity="0.25" strokeWidth="0.8" />
            <g transform={`translate(${x1 + padX + labelW + 8}, ${yMid})`}
               style={{ cursor: 'pointer' }}
               onPointerDown={(e) => e.stopPropagation()}
               onDoubleClick={(e) => e.stopPropagation()}
               onClick={(e) => {
                 // 노드 선택/드래그로 번지지 않게 막고 태그를 삭제한다
                 e.stopPropagation();
                 onRemove?.(tagName);
               }}>
              <title>{tr('editor.node.deleteTag')}</title>
              {/* 투명 히트 영역 — X 선만으로는 클릭 판정이 너무 좁다 */}
              <circle r={7} fill="transparent" />
              <line x1={-3} y1={-3} x2={3} y2={3}
                    stroke={tc.text} strokeOpacity="0.65" strokeWidth="1.2" strokeLinecap="round" />
              <line x1={3} y1={-3} x2={-3} y2={3}
                    stroke={tc.text} strokeOpacity="0.65" strokeWidth="1.2" strokeLinecap="round" />
            </g>
          </g>
        );
      })}
      {/* 끼워 넣을 자리 표시 */}
      {drag && drag.to !== drag.from && drag.to !== drag.from + 1 && slots.length > 0 && (() => {
        const k = drag.to;
        const s = k < slots.length ? slots[k] : slots[slots.length - 1];
        const x = k < slots.length ? s.x0 - 2 : s.x0 + s.w + 2;
        return <line x1={x} y1={s.y0 - 2} x2={x} y2={s.y0 + tagH + 2} stroke={t.primary} strokeWidth={2} strokeLinecap="round" pointerEvents="none" />;
      })()}
    </g>
  );
}
