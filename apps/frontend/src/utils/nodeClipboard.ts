// nodeClipboard — 노드 복사/붙여넣기 클립보드 (2026-08-04, 2026-08-05 확장).
//
// 배경: Ctrl+C 에 노드 복사 구현이 없어서, 복사 후 붙여넣기가 텍스트
// 경로(클립보드의 잡탕 텍스트 → 하위 노드 생성)로 빠져 "이상한 내용"이
// 붙었다 (사용자 보고).
//
// **두 갈래로 담는다** (2026-08-05 — "다른 맵의 노드를 복사해 붙일 수
// 없나?" 보고):
//   ① 메모리 스택 — 같은 탭 안에서는 이쪽을 쓴다. 원본 그대로라 가장
//      정확하고, 큰 사진이 있어도 클립보드를 거치지 않는다.
//   ② 시스템 클립보드 텍스트 — 첫 줄에 토큰, 둘째 줄부터 서브트리 JSON.
//      **다른 탭·다른 맵**에서는 이 JSON 을 읽어 붙인다.
// 붙여넣기는 ①을 먼저 찾고, 없으면 ②를 파싱한다.
//
// ②의 JSON 은 시스템 클립보드를 거쳐 오므로 **믿을 수 없는 입력**이다 —
// sanitizeNodes()가 아는 필드만, 아는 형태로만 통과시킨다.

import type { MindNode, NodeInlineImage, SampleMap } from '@/editor/__samples__/types';

export const NODE_CLIP_PREFIX = 'EMM-NODES::';

// 클립보드 텍스트로 실어 보낼 최대 크기 — 넘으면 토큰만 쓴다(같은 탭
// 안에서는 그대로 동작). 사진(data URL)이 많은 서브트리 방어.
const CLIP_TEXT_LIMIT = 4_000_000;

let stash: { token: string; nodes: MindNode[] } | null = null;

/** 선택 id 들의 서브트리를 문서 순서로 수집 — 조상이 이미 선택된 노드는
 *  제외한다(중복 복사 방지). 루트('root')는 복사 대상이 아니다. */
export function collectSubtrees(map: SampleMap, ids: string[]): MindNode[] {
  const idSet = new Set(ids.filter((id) => id !== 'root'));
  const out: MindNode[] = [];
  const walk = (nodes: MindNode[]) => {
    for (const n of nodes) {
      if (idSet.has(n.id)) {
        out.push(n); // 서브트리째 — 하위는 내려가지 않는다
      } else if (n.children?.length) {
        walk(n.children);
      }
    }
  };
  walk(map.branches as MindNode[]);
  return out;
}

/**
 * 서브트리들을 메모리에 보관하고 **시스템 클립보드에 쓸 텍스트**를
 * 돌려준다 — 첫 줄 토큰 + 둘째 줄부터 JSON.
 */
export function stashNodes(nodes: MindNode[]): string {
  const token = NODE_CLIP_PREFIX + Math.random().toString(36).slice(2, 10);
  const copy = JSON.parse(JSON.stringify(nodes)) as MindNode[];
  stash = { token, nodes: copy };
  let body = '';
  try {
    body = JSON.stringify(copy);
  } catch {
    body = '';
  }
  if (!body || body.length > CLIP_TEXT_LIMIT) return token; // 같은 탭 전용
  return `${token}\n${body}`;
}

/** 우리 클립보드 형태인가 — 형태는 맞는데 읽을 수 없으면(새로고침 뒤
 *  토큰만 남은 경우) 텍스트 경로로 흘리지 말고 조용히 무시한다 */
export function isNodeClipToken(text: string): boolean {
  return String(text ?? '').trimStart().startsWith(NODE_CLIP_PREFIX);
}

/**
 * 붙여넣은 텍스트에서 서브트리를 꺼낸다.
 *   · 같은 탭(토큰이 메모리 스택과 일치) → 원본 그대로
 *   · 다른 탭·다른 맵 → 둘째 줄부터의 JSON 을 검증해서
 *   · 둘 다 아니면 null
 */
export function takeStashed(text: string): MindNode[] | null {
  const raw = String(text ?? '');
  const nl = raw.indexOf('\n');
  const token = (nl < 0 ? raw : raw.slice(0, nl)).trim();
  if (!token.startsWith(NODE_CLIP_PREFIX)) return null;

  if (stash && token === stash.token) {
    return JSON.parse(JSON.stringify(stash.nodes)) as MindNode[];
  }
  if (nl < 0) return null; // 토큰만 온 복사 — 이 탭에는 원본이 없다
  try {
    const parsed: unknown = JSON.parse(raw.slice(nl + 1));
    if (!Array.isArray(parsed)) return null;
    const safe = sanitizeNodes(parsed, 0);
    return safe.length ? safe : null;
  } catch {
    return null;
  }
}

// ── 밖에서 들어온 JSON 정화 ──────────────────────────────────────────
// 시스템 클립보드는 누구나 쓸 수 있다. 아는 필드만, 아는 타입으로만
// 통과시키고, 사진·링크 주소는 data:image/ 와 http(s) 만 허용한다.
// 노트의 html(리치 붙여넣기 원문)은 통째로 렌더되므로 **버린다**.

const MAX_NODES = 5000;
const MAX_DEPTH = 40;

function str(v: unknown, max = 20000): string | undefined {
  return typeof v === 'string' ? v.slice(0, max) : undefined;
}
function num(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}
function bool(v: unknown): boolean | undefined {
  return typeof v === 'boolean' ? v : undefined;
}
function safeUrl(v: unknown): string | undefined {
  const s = str(v, 5_000_000);
  if (!s) return undefined;
  return /^(https?:\/\/|data:image\/)/i.test(s) ? s : undefined;
}
function pickEnum<T extends string>(v: unknown, allowed: readonly T[]): T | undefined {
  return typeof v === 'string' && (allowed as readonly string[]).includes(v)
    ? (v as T) : undefined;
}

let budget = MAX_NODES;

function sanitizeNode(raw: unknown, depth: number): MindNode | null {
  if (!raw || typeof raw !== 'object' || depth > MAX_DEPTH || budget <= 0) return null;
  budget -= 1;
  const o = raw as Record<string, unknown>;
  const node: MindNode = {
    // id 는 붙일 때 reassignIds 가 새로 매기지만 형태를 맞춰 둔다
    id: str(o.id, 200) ?? `clip-${budget}`,
    text: str(o.text) ?? '',
  };
  const align = pickEnum(o.textAlign, ['left', 'center', 'right'] as const);
  if (align) node.textAlign = align;
  const side = pickEnum(o.side, ['left', 'right', 'center'] as const);
  if (side) node.side = side;
  const colorKey = str(o.colorKey, 40);
  if (colorKey) node.colorKey = colorKey as MindNode['colorKey'];
  const layoutType = str(o.layoutType, 40);
  if (layoutType) node.layoutType = layoutType as MindNode['layoutType'];
  const edgeType = str(o.edgeType, 40);
  if (edgeType) node.edgeType = edgeType as MindNode['edgeType'];
  const icon = str(o.icon, 20);
  if (icon) node.icon = icon;
  const iconSide = pickEnum(o.iconSide, ['left', 'right'] as const);
  if (iconSide) node.iconSide = iconSide;
  const tag = str(o.tag, 100);
  if (tag) node.tag = tag;
  if (Array.isArray(o.tags)) {
    const tags = o.tags.map((x) => str(x, 100)).filter(Boolean) as string[];
    if (tags.length) node.tags = tags.slice(0, 50);
  }
  const collapsed = bool(o.collapsed);
  if (collapsed !== undefined) node.collapsed = collapsed;
  const locked = bool(o.locked);
  if (locked !== undefined) node.locked = locked;
  const sizeW = num(o.sizeW);
  if (sizeW !== undefined) node.sizeW = sizeW;
  const sizeH = num(o.sizeH);
  if (sizeH !== undefined) node.sizeH = sizeH;

  // 스타일 — 색 문자열만 (CSS 색으로 그대로 들어가므로 길이 제한)
  if (o.style && typeof o.style === 'object') {
    const s = o.style as Record<string, unknown>;
    const style: Record<string, string> = {};
    for (const k of ['fill', 'border', 'textColor', 'fontFamily'] as const) {
      const v = str(s[k], 120);
      if (v) style[k] = v;
    }
    if (Object.keys(style).length) node.style = style as MindNode['style'];
  }

  // 노트 — 아는 블록 종류만, html 은 제외
  if (Array.isArray(o.notes)) {
    const notes = o.notes.slice(0, 200).map((b) => {
      if (!b || typeof b !== 'object') return null;
      const bo = b as Record<string, unknown>;
      const type = pickEnum(bo.type, [
        'paragraph', 'heading', 'bullet_list', 'numbered_list',
        'quote', 'code_block', 'divider', 'checklist',
      ] as const);
      if (!type) return null;
      const lang = str(bo.lang, 40);
      const checked = bool(bo.checked);
      return {
        id: str(bo.id, 200) ?? `nb-${budget}`,
        type,
        text: str(bo.text, 200000) ?? '',
        ...(checked !== undefined ? { checked } : {}),
        ...(lang ? { lang } : {}),
      };
    }).filter(Boolean);
    if (notes.length) node.notes = notes as MindNode['notes'];
  }

  // 링크 — http(s)만
  if (Array.isArray(o.links)) {
    const links = o.links.slice(0, 50).map((l) => {
      if (!l || typeof l !== 'object') return null;
      const lo = l as Record<string, unknown>;
      const url = str(lo.url, 4000);
      if (!url || !/^https?:\/\//i.test(url)) return null;
      return { id: str(lo.id, 200) ?? `lk-${budget}`, url, label: str(lo.label, 300) };
    }).filter(Boolean);
    if (links.length) node.links = links as MindNode['links'];
  }

  // 사진 — data:image/ 또는 http(s)만
  if (o.image && typeof o.image === 'object') {
    const im = o.image as Record<string, unknown>;
    const src = safeUrl(im.src);
    if (src) node.image = { src, w: num(im.w) ?? 400, h: num(im.h) ?? 300 };
  }
  if (Array.isArray(o.images)) {
    const images = o.images.slice(0, 100).map((x) => {
      if (!x || typeof x !== 'object') return null;
      const xo = x as Record<string, unknown>;
      const src = safeUrl(xo.src);
      if (!src) return null;
      return {
        src, w: num(xo.w) ?? 400, h: num(xo.h) ?? 300,
        afterLine: num(xo.afterLine) ?? 0,
      } as NodeInlineImage;
    }).filter(Boolean) as NodeInlineImage[];
    if (images.length) node.images = images;
  }

  // 첨부는 옮기지 않는다 — 원본 맵의 저장소(blob:·서버 id)에 묶여 있어
  // 다른 맵에서는 열리지 않는다.

  if (Array.isArray(o.children)) {
    const kids = sanitizeNodes(o.children, depth + 1);
    if (kids.length) node.children = kids;
  }
  return node;
}

function sanitizeNodes(list: unknown[], depth: number): MindNode[] {
  if (depth === 0) budget = MAX_NODES;
  const out: MindNode[] = [];
  for (const raw of list.slice(0, MAX_NODES)) {
    const n = sanitizeNode(raw, depth);
    if (n) out.push(n);
  }
  return out;
}
