// Shared content-indicator model for a node (note / link / file / media).
// Used by NodeRenderer (to draw the icons) and Canvas (to draw the chooser
// popover for multi-item categories) so both stay in sync.
//
// 노트는 종류(문단/코드/표/체크)별로 **각각 하나의 인디케이터**를 만든다 —
// 클릭하면 그 종류의 노트만 담은 뷰어 창이 열린다.

import type { LaidOutNode } from '@/layout/types';
import type { NoteBlock } from '@/editor/__samples__/types';

export type NoteKind = 'note-paragraph' | 'note-code' | 'note-table' | 'note-check';
export type ContentKind = NoteKind | 'note' | 'link' | 'file' | 'media';

export interface ContentItem {
  label: string;
  url?: string;
}

export interface ContentIndicator {
  kind: ContentKind;
  icon: string;
  title: string;
  count: number;
  items: ContentItem[];
}

// 노트 종류별 표시 규격 — 인디케이터 글리프(NoteTypeGlyph)와 뷰어 제목,
// HTML 내보내기 뷰어(drawMarkerGlyph)가 모두 이 매핑을 따른다.
//   문단 = T(Text) · 코드 = C(Code) · 표 = 격자(⊞) · 체크 = ✓
export const NOTE_KIND_META: Record<
  NoteKind,
  { label: string; letter: string; color: string; blockType: string }
> = {
  'note-paragraph': { label: '문단 노트',     letter: 'T', color: '#64748B', blockType: 'paragraph' },
  'note-code':      { label: '코드 노트',     letter: 'C', color: '#B45309', blockType: 'code_block' },
  'note-table':     { label: '표 노트',       letter: '⊞', color: '#1D4ED8', blockType: 'table' },
  'note-check':     { label: '체크리스트',    letter: '✓', color: '#15803D', blockType: 'checklist' },
};

export const NOTE_KINDS: NoteKind[] = [
  'note-paragraph', 'note-code', 'note-table', 'note-check',
];

export function isNoteKind(kind: ContentKind): kind is NoteKind {
  return kind in NOTE_KIND_META;
}

// 폐기된 옛 타입(warning/tip)은 문단으로 취급 (하위호환)
export function normalizedBlockType(block: { type: string }): string {
  return block.type === 'warning' || block.type === 'tip' ? 'paragraph' : block.type;
}

// 해당 노트 종류의 블록만 골라낸다 — 뷰어 창에 넘길 목록.
export function notesOfKind(notes: NoteBlock[] | undefined, kind: NoteKind): NoteBlock[] {
  const want = NOTE_KIND_META[kind].blockType;
  return (notes ?? []).filter((b) => normalizedBlockType(b) === want);
}

const KIND_ICON: Record<'link' | 'file' | 'media', string> = {
  link: '🔗',
  file: '📎',
  media: '▶️',
};

const KIND_LABEL: Record<'link' | 'file' | 'media', string> = {
  link: '링크',
  file: '첨부파일',
  media: '멀티미디어',
};

export function nodeContentIndicators(n: LaidOutNode): ContentIndicator[] {
  const links = n.links ?? [];
  const attachments = n.attachments ?? [];
  const files = attachments.filter((a) => a.kind === 'file');
  const media = attachments.filter((a) => a.kind === 'audio' || a.kind === 'video');

  const out: ContentIndicator[] = [];

  // 노트 — 종류별로 개별 인디케이터 (문단 T / 코드 C / 표 ⊞ / 체크 ✓)
  const notes = n.notes ?? [];
  if (notes.length > 0) {
    for (const kind of NOTE_KINDS) {
      const blocks = notesOfKind(notes, kind);
      if (blocks.length === 0) continue;
      const meta = NOTE_KIND_META[kind];
      out.push({
        kind,
        icon: meta.letter,
        title: blocks.length > 1 ? `${meta.label} ${blocks.length}개` : meta.label,
        count: blocks.length,
        items: [],
      });
    }
  } else if (n.note) {
    // 레거시: note 플래그만 있고 블록이 없는 노드 — 문단 노트 하나로 표시
    out.push({
      kind: 'note-paragraph',
      icon: NOTE_KIND_META['note-paragraph'].letter,
      title: NOTE_KIND_META['note-paragraph'].label,
      count: 1,
      items: [],
    });
  }

  if (links.length) {
    out.push({
      kind: 'link',
      icon: KIND_ICON.link,
      title: links.length > 1 ? `${KIND_LABEL.link} ${links.length}개` : links[0].label || links[0].url,
      count: links.length,
      items: links.map((l) => ({ label: l.label || l.url, url: l.url })),
    });
  }
  if (files.length) {
    out.push({
      kind: 'file',
      icon: KIND_ICON.file,
      title: files.length > 1 ? `${KIND_LABEL.file} ${files.length}개` : files[0].name,
      count: files.length,
      items: files.map((a) => ({ label: a.name, url: a.url })),
    });
  }
  if (media.length) {
    out.push({
      kind: 'media',
      icon: KIND_ICON.media,
      title: media.length > 1 ? `${KIND_LABEL.media} ${media.length}개` : media[0].name,
      count: media.length,
      items: media.map((a) => ({ label: a.name, url: a.url })),
    });
  }

  return out;
}

// 노드에서 나오는 측정 옵션 묶음 — 모든 레이아웃 전략이 sizeNodeForText에
// 전략별 minW/maxW와 함께 spread 한다 (아이콘·인디케이터·수동 크기·사진).
export function nodeSizingOpts(n: {
  icon?: string;
  note?: boolean;
  notes?: { type?: string }[];
  links?: unknown[];
  attachments?: { kind?: string }[];
  sizeW?: number;
  sizeH?: number;
  image?: { w: number; h: number };
  images?: { w: number; h: number }[];
}): {
  hasIcon: boolean;
  indicators: number;
  manualW?: number;
  manualH?: number;
  image?: { w: number; h: number };
  images?: { w: number; h: number }[];
} {
  return {
    hasIcon: !!n.icon,
    indicators: contentIndicatorCount(n),
    manualW: n.sizeW,
    manualH: n.sizeH,
    // 인라인 사진(images)이 있으면 레거시 단일 사진은 무시 — 렌더러와
    // 같은 규칙이어야 측정·표시 높이가 일치한다
    image: !n.images?.length && n.image
      ? { w: n.image.w, h: n.image.h }
      : undefined,
    images: n.images?.length
      ? n.images.map((im) => ({ w: im.w, h: im.h }))
      : undefined,
  };
}

// Number of content-indicator icons a node shows. Layout strategies pass
// this to sizeNodeForText so the node box is widened to fit the icons
// INSIDE it, next to the text. 노트는 종류 수만큼 아이콘이 생기므로
// 종류 수를 센다 (nodeContentIndicators와 반드시 일치해야 한다).
export function contentIndicatorCount(n: {
  note?: boolean;
  notes?: { type?: string }[];
  links?: unknown[];
  attachments?: { kind?: string }[];
}): number {
  let count = 0;
  const notes = n.notes ?? [];
  if (notes.length > 0) {
    const types = new Set(
      notes.map((b) => normalizedBlockType({ type: String(b.type ?? 'paragraph') })),
    );
    count += types.size;
  } else if (n.note) {
    count += 1;
  }
  if ((n.links?.length ?? 0) > 0) count += 1;
  const atts = n.attachments ?? [];
  if (atts.some((a) => a.kind !== 'audio' && a.kind !== 'video')) count += 1;
  if (atts.some((a) => a.kind === 'audio' || a.kind === 'video')) count += 1;
  return count;
}
