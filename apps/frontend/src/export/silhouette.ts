// silhouette — 퍼블리싱한 맵의 **미리보기 이미지**를 만든다.
// 설계: docs/04-extensions/publish/27a-paid-publish.md §2.1 · §2.2
//
// ★ 이 파일의 규칙은 하나다 — **글자를 한 글자도 그리지 않는다.**
//
//   흐리게·작게 만드는 방식은 쓰지 않는다. 마인드맵은 폰트가 균일하고
//   배경이 단색이라 업스케일·디블러·OCR 이 특히 잘 먹는다. "알아볼 수
//   없을 정도"의 경계를 잡아도 몇 달 뒤 모델이 좋아지면 그 경계가
//   무너지고, **한 번 나간 이미지는 회수할 수 없다.**
//
//   그래서 렌더링 단계에서 글자를 뺀다. 복원할 원본이 없으면 복원되지
//   않는다. `ctx.fillText` · `ctx.strokeText` 를 **부르지 않는 것**이
//   이 파일이 지키는 전부이고, 검증도 그것을 직접 확인한다.
//
// 전달하려는 것은 **규모 · 구조 · 밀도 · 색 배치**다. 글자는 어차피
// 안 읽히게 할 셈이었으므로 잃는 것이 없다.
//
// ★ 왜 브라우저에서 만드나
//   서버에는 헤드리스 브라우저도 이미지 라이브러리도 큐도 없다. 이미지
//   한 장을 위해 그 인프라를 들이는 것은 과하다. 퍼블리싱은 자주 하는 일이
//   아니므로 저자가 퍼블리싱할 때 그 브라우저에서 한 번 만들어 올린다.

import type { LayoutType, SampleMap } from '@/editor/__samples__/types';
import type { LaidOutNode } from '@/layout/types';
import { computeLayout, type LayoutSpacing } from '@/layout/LayoutEngine';
import { setLevelFontConfig, setLevelShapeConfig } from '@/editor/node-renderer/sizeNodeForText';

/**
 * 링크 카드(Open Graph)가 기대하는 비율 1.91:1 — 1200×630.
 * 목록 썸네일도 같은 파일을 쓰므로 한 벌만 만든다.
 */
export const SILHOUETTE_W = 1200;
export const SILHOUETTE_H = 630;

/** 내보내기 뷰어와 **같은 팔레트** (exportHtml 의 FAM_LIGHT) */
const FAM: Record<string, { fill: string; border: string }> = {
  root: { fill: '#D97706', border: '#B45309' },
  l1A: { fill: '#FEF3C7', border: '#F59E0B' },
  l1B: { fill: '#DBEAFE', border: '#3B82F6' },
  l1C: { fill: '#DCFCE7', border: '#22C55E' },
  l1D: { fill: '#FEE2E2', border: '#EF4444' },
  l1E: { fill: '#EDE9FE', border: '#8B5CF6' },
  l2: { fill: '#FFFFFF', border: '#D6CBB7' },
};
const EDGE = '#B8A888';
const BG = '#FBF8F3';
/** 글자가 있던 자리 — 흐린 글자가 아니라 **막대**다 */
const BAR = '#C9C2B6';

function famOf(n: LaidOutNode): { fill: string; border: string } {
  if (n.depth === 0) return FAM.root;
  if (n.depth === 1) return FAM[n.colorKey ?? ''] ?? FAM.l2;
  return FAM.l2;
}

/** depth ≥ 2 는 가지 색을 물려받는다 — 색 배치가 구조를 말해 준다 */
function borderOf(n: LaidOutNode, byId: Map<string, LaidOutNode>): string {
  if (n.depth <= 1) return famOf(n).border;
  let cur: LaidOutNode | undefined = n;
  while (cur && cur.depth > 1) cur = cur.parent ? byId.get(cur.parent) : undefined;
  return cur ? famOf(cur).border : FAM.l2.border;
}

function roundRect(
  ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number,
): void {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
  ctx.lineTo(x + w, y + h - rr);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
  ctx.lineTo(x + rr, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
  ctx.lineTo(x, y + rr);
  ctx.quadraticCurveTo(x, y, x + rr, y);
  ctx.closePath();
}

/**
 * 배치된 노드 목록을 캔버스에 그린다 — **글자 없이**.
 *
 * 좌표는 에디터와 같다(`x`·`y` 는 노드의 **중심**). 배치를 다시 계산하지
 * 않고 `computeLayout` 결과를 그대로 쓰므로, 실루엣의 구조는 저자가 보던
 * 화면과 같다.
 */
export function drawSilhouette(
  ctx: CanvasRenderingContext2D,
  laid: LaidOutNode[],
  width: number,
  height: number,
): void {
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, width, height);
  if (laid.length === 0) return;

  // ── 맵 전체를 담는 사각형 → 화면에 맞추는 배율 ────────────────────
  let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity;
  for (const n of laid) {
    minX = Math.min(minX, n.x - n.w / 2);
    maxX = Math.max(maxX, n.x + n.w / 2);
    minY = Math.min(minY, n.y - n.h / 2);
    maxY = Math.max(maxY, n.y + n.h / 2);
  }
  const pad = 28;
  const mapW = Math.max(1, maxX - minX);
  const mapH = Math.max(1, maxY - minY);
  const innerW = width - pad * 2;
  const innerH = height - pad * 2;

  // ★ **맞추기(fit)만 쓰면 긴 맵이 실오라기가 된다** (2026-09-05 측정)
  //
  //   카드는 1200×630 인데 맵의 비율은 제각각이다. 트리 레이아웃으로
  //   61노드를 그리면 세로 3700 · 가로 400 쯤 되는데, 이걸 통째로 맞추면
  //   배율이 0.15 로 떨어져 **가로 62px 짜리 세로 띠** 하나가 가운데
  //   남는다. 카드의 4% 만 쓴다 — 측정으로 확인했다(가지12 → 4%).
  //   가지가 2개뿐인 작은 맵이 18% 를 쓰는 것보다 **더 작게** 보였다.
  //
  //   그래서 비율이 크게 어긋나면 **채우고 자른다.** 잘려 나가는 것은
  //   맵의 끝부분이고, 남는 것은 밀도·구조·색 배치다 — 전달하려던 것이
  //   그것이다. 전체 규모는 화면이 숫자로 따로 말한다("전체 147노드").
  //   빈 여백만 잔뜩인 카드보다 이쪽이 낫다.
  const fitW = innerW / mapW;
  const fitH = innerH / mapH;
  const fit = Math.min(fitW, fitH, 1);
  // 통째로 맞췄을 때 **가로를 절반도 못 쓰면** 가로에 맞추고 세로를 자른다.
  // 2배까지만 키운다 — 그 위로 가면 노드 몇 개가 화면을 채워 "작은 맵"
  // 처럼 보인다.
  const scale = fit * mapW < width * 0.5 ? Math.min(fitW, 2) : fit;

  const drawW = mapW * scale;
  const drawH = mapH * scale;
  // 자를 때는 **맵이 시작하는 쪽**(중심 주제)을 남긴다 — 끝부분이 잘리는
  // 편이 자연스럽다. 넉넉하면 가운데 놓는다.
  const offX = (drawW > width ? pad : (width - drawW) / 2) - minX * scale;
  const offY = (drawH > height ? pad : (height - drawH) / 2) - minY * scale;

  ctx.save();
  ctx.translate(offX, offY);
  ctx.scale(scale, scale);

  const byId = new Map(laid.map((n) => [n.id, n]));

  // ── 연결선 먼저 (노드 밑에 깔린다) ────────────────────────────────
  ctx.strokeStyle = EDGE;
  ctx.lineCap = 'round';
  for (const n of laid) {
    const p = n.parent ? byId.get(n.parent) : undefined;
    if (!p) continue;
    ctx.lineWidth = (p.depth === 0 ? 2.2 : 1.6) / scale;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    // 굽은 선이냐 꺾인 선이냐만 가른다 — 정확한 경로가 아니라 **구조**를
    // 보이는 것이 목적이다. 세부 라우팅까지 맞추려면 엣지 렌더러를 통째로
    // 들여와야 하는데, 이 이미지에서는 그 차이가 보이지 않는다.
    if (n.edgeType === 'curve-line' || p.edgeType === 'curve-line') {
      const mx = (p.x + n.x) / 2;
      ctx.bezierCurveTo(mx, p.y, mx, n.y, n.x, n.y);
    } else {
      ctx.lineTo(n.x, n.y);
    }
    ctx.stroke();
  }

  // ── 노드 — 도형과 색은 그대로, 글자 자리에는 막대 ─────────────────
  for (const n of laid) {
    const fam = famOf(n);
    const x0 = n.x - n.w / 2;
    const y0 = n.y - n.h / 2;
    roundRect(ctx, x0, y0, n.w, n.h, n.depth === 0 ? 12 : 8);
    ctx.fillStyle = fam.fill;
    ctx.fill();
    if (n.depth !== 0) {
      ctx.strokeStyle = borderOf(n, byId);
      ctx.lineWidth = 1.4 / scale;
      ctx.stroke();
    }

    // ★ 글자가 있던 자리 — **글자 수에 비례한 길이의 막대만** 그린다.
    //   원문은 여기 오지 않는다(길이만 온다). 그래서 복원할 것이 없다.
    const lines = n._lines ?? [];
    if (lines.length === 0) continue;
    const fs = n._fontSize ?? 13;
    const lh = n._lineHeight ?? fs * 1.35;
    const barH = Math.max(2, fs * 0.42);
    // 글자 폭은 글꼴마다 다르지만, 실루엣에 필요한 것은 **상대적 길이**다.
    // 한글은 폭이 넓어 라틴보다 크게 잡는다(에디터 측정과 같은 어림).
    const widthOf = (s: string) => {
      let w = 0;
      for (const ch of s) w += /[ᄀ-퟿　-〿＀-￯]/.test(ch) ? fs : fs * 0.55;
      return w;
    };
    const blockH = lines.length * lh;
    let ly = n.y - blockH / 2 + (lh - barH) / 2;
    ctx.fillStyle = BAR;
    for (const line of lines) {
      const w = Math.min(widthOf(line), n.w - 16);
      if (w > 0) {
        roundRect(ctx, n.x - n.w / 2 + 8, ly, w, barH, barH / 2);
        ctx.fill();
      }
      ly += lh;
    }
  }

  ctx.restore();
}

export interface SilhouetteResult {
  blob: Blob;
  /** 그린 노드 수 — 화면이 "147노드" 같은 문구에 쓴다 */
  nodeCount: number;
  width: number;
  height: number;
}

/**
 * 맵 하나의 실루엣 PNG 를 만든다.
 *
 * `mapLayoutType`·`spacing` 은 저자가 보던 화면과 같은 배치를 만들기 위해
 * 그대로 넘긴다(스냅샷의 `editor` 값). 없으면 맵의 기본값을 쓴다.
 */
export async function buildSilhouette(
  map: SampleMap,
  mapLayoutType?: LayoutType,
  spacing?: LayoutSpacing,
): Promise<SilhouetteResult> {
  const layoutType = (mapLayoutType ?? map.root.layoutType ?? 'radial-bidirectional') as LayoutType;
  // 맵 설정(레벨별 글꼴·도형)을 측정에 반영한다 — 이게 없으면 노드 크기가
  // 에디터와 달라져 실루엣의 밀도가 실제와 어긋난다 (exportHtml 과 같다).
  setLevelFontConfig(map.settings?.levelFonts);
  setLevelShapeConfig(map.settings?.levelShapes);
  const laid = computeLayout(map, layoutType, 700, 400, spacing);

  const canvas = document.createElement('canvas');
  canvas.width = SILHOUETTE_W;
  canvas.height = SILHOUETTE_H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('이 브라우저에서는 미리보기 이미지를 만들 수 없습니다.');

  drawSilhouette(ctx, laid, SILHOUETTE_W, SILHOUETTE_H);

  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/png'));
  if (!blob) throw new Error('미리보기 이미지를 만들지 못했습니다.');
  return { blob, nodeCount: laid.length, width: SILHOUETTE_W, height: SILHOUETTE_H };
}
