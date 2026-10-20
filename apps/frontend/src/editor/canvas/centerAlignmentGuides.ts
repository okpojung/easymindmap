// Visual-only world-coordinate guides. The caller supplies focus/collapse-visible
// boxes and excludes the moving topic's descendants; this module knows no tree/store.

export interface AlignmentRect {
  id: string;
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface AlignmentBounds {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface AlignmentGuide {
  axis: 'x' | 'y';
  coordinate: number;
  from: number;
  to: number;
  targetId: string;
  movingAnchor: 'start' | 'center' | 'end';
  targetAnchor: 'start' | 'center' | 'end';
}

type Anchor = AlignmentGuide['movingAnchor'];
const anchors: readonly Anchor[] = ['start', 'center', 'end'];

function validBounds(rect: AlignmentBounds): boolean {
  return Number.isFinite(rect.left) && Number.isFinite(rect.top)
    && Number.isFinite(rect.width) && rect.width > 0
    && Number.isFinite(rect.height) && rect.height > 0
    && Number.isFinite(rect.left + rect.width)
    && Number.isFinite(rect.top + rect.height);
}

// Edge-only contact has no visible area.
function intersects(a: AlignmentBounds, b: AlignmentBounds): boolean {
  return a.left < b.left + b.width && a.left + a.width > b.left
    && a.top < b.top + b.height && a.top + a.height > b.top;
}

function anchorCoordinate(start: number, size: number, anchor: Anchor): number {
  return start + (anchor === 'start' ? 0 : anchor === 'center' ? size / 2 : size);
}

interface Candidate {
  guide: AlignmentGuide;
  deltaPx: number;
  like: number;
  center: number;
  distancePx: number;
}

function compare(a: Candidate, b: Candidate): number {
  // Code-unit ID ordering is stable across locales and target iteration order.
  return a.deltaPx - b.deltaPx || a.like - b.like || a.center - b.center
    || a.distancePx - b.distancePx
    || (a.guide.targetId < b.guide.targetId ? -1 : a.guide.targetId > b.guide.targetId ? 1 : 0)
    || anchors.indexOf(a.guide.movingAnchor) - anchors.indexOf(b.guide.movingAnchor)
    || anchors.indexOf(a.guide.targetAnchor) - anchors.indexOf(b.guide.targetAnchor)
    // Also keep duplicate-ID inputs deterministic.
    || a.guide.coordinate - b.guide.coordinate
    || a.guide.from - b.guide.from || a.guide.to - b.guide.to;
}

/**
 * Returns at most one vertical (x) and one horizontal (y) guide, in that order.
 * Coordinates lie on the target anchor, never a corrected moving position.
 * Ties: screen delta, like anchors, most center anchors, screen bbox-gap
 * distance, then stable ID and anchor order. All nine anchor pairs are eligible.
 * Invalid moving/viewport/scales/options return []; invalid targets are skipped.
 */
export function computeCenterAlignmentGuides(input: {
  moving: AlignmentRect;
  targets: readonly AlignmentRect[];
  viewport: AlignmentBounds;
  excludedIds?: ReadonlySet<string>;
  worldPerScreenPixel: { x: number; y: number };
  tolerancePx?: number;
  nearbyPx?: number;
}): AlignmentGuide[] {
  const { moving, targets, viewport, excludedIds, worldPerScreenPixel } = input;
  const { x: scaleX, y: scaleY } = worldPerScreenPixel;
  const tolerance = input.tolerancePx ?? 6;
  const nearby = input.nearbyPx ?? 320;
  if (!validBounds(moving) || !validBounds(viewport)
    || !Number.isFinite(scaleX) || scaleX <= 0
    || !Number.isFinite(scaleY) || scaleY <= 0
    || !Number.isFinite(tolerance) || tolerance < 0
    || !Number.isFinite(nearby) || nearby < 0
    || !intersects(moving, viewport)) return [];

  let bestX: Candidate | undefined;
  let bestY: Candidate | undefined;
  for (const target of targets) {
    if (target.id === moving.id || excludedIds?.has(target.id)
      || !validBounds(target) || !intersects(target, viewport)) continue;
    const gapX = Math.max(0, target.left - (moving.left + moving.width),
      moving.left - (target.left + target.width)) / scaleX;
    const gapY = Math.max(0, target.top - (moving.top + moving.height),
      moving.top - (target.top + target.height)) / scaleY;
    const distancePx = Math.hypot(gapX, gapY);
    if (!Number.isFinite(distancePx) || distancePx > nearby) continue;

    for (const axis of ['x', 'y'] as const) {
      const vertical = axis === 'x';
      const scale = vertical ? scaleX : scaleY;
      const viewStart = vertical ? viewport.left : viewport.top;
      const viewEnd = viewStart + (vertical ? viewport.width : viewport.height);
      const segmentStart = vertical ? viewport.top : viewport.left;
      const segmentEnd = segmentStart + (vertical ? viewport.height : viewport.width);
      const padding = 8 * (vertical ? scaleY : scaleX);
      const from = Math.max(segmentStart, Math.min(
        vertical ? moving.top : moving.left,
        vertical ? target.top : target.left,
      ) - padding);
      const to = Math.min(segmentEnd, Math.max(
        vertical ? moving.top + moving.height : moving.left + moving.width,
        vertical ? target.top + target.height : target.left + target.width,
      ) + padding);
      for (const movingAnchor of anchors) {
        const movingCoordinate = anchorCoordinate(
          vertical ? moving.left : moving.top,
          vertical ? moving.width : moving.height, movingAnchor,
        );
        for (const targetAnchor of anchors) {
          const coordinate = anchorCoordinate(
            vertical ? target.left : target.top,
            vertical ? target.width : target.height, targetAnchor,
          );
          const deltaPx = Math.abs(movingCoordinate - coordinate) / scale;
          // Don't move an offscreen anchor onto a viewport edge to invent a guide.
          if (!Number.isFinite(deltaPx) || deltaPx > tolerance
            || coordinate < viewStart || coordinate > viewEnd) continue;
          const candidate: Candidate = {
            guide: { axis, coordinate, from, to, targetId: target.id, movingAnchor, targetAnchor },
            deltaPx,
            like: movingAnchor === targetAnchor ? 0 : 1,
            center: -(Number(movingAnchor === 'center') + Number(targetAnchor === 'center')),
            distancePx,
          };
          if (vertical) {
            if (!bestX || compare(candidate, bestX) < 0) bestX = candidate;
          } else if (!bestY || compare(candidate, bestY) < 0) bestY = candidate;
        }
      }
    }
  }
  return [...(bestX ? [bestX.guide] : []), ...(bestY ? [bestY.guide] : [])];
}
