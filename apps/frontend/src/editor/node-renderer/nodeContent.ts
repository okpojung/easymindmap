// Shared content-indicator model for a node (note / link / file / media).
// Used by NodeRenderer (to draw the icons) and Canvas (to draw the chooser
// popover for multi-item categories) so both stay in sync.

import type { LaidOutNode } from '@/layout/types';

export type ContentKind = 'note' | 'link' | 'file' | 'media';

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

const KIND_ICON: Record<ContentKind, string> = {
  note: '📝',
  link: '🔗',
  file: '📎',
  media: '▶️',
};

const KIND_LABEL: Record<ContentKind, string> = {
  note: '노트',
  link: '링크',
  file: '첨부파일',
  media: '멀티미디어',
};

export function nodeContentIndicators(n: LaidOutNode): ContentIndicator[] {
  const links = n.links ?? [];
  const attachments = n.attachments ?? [];
  const files = attachments.filter((a) => a.kind === 'file');
  const media = attachments.filter((a) => a.kind === 'audio' || a.kind === 'video');
  const hasNote = !!n.note || (n.notes?.length ?? 0) > 0;

  const out: ContentIndicator[] = [];

  if (hasNote) {
    out.push({ kind: 'note', icon: KIND_ICON.note, title: KIND_LABEL.note, count: 1, items: [] });
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
