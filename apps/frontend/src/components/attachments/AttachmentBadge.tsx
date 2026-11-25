import type { CSSProperties } from 'react';
import { isLocalAttachmentUrl } from '@/utils/localAttachments';
import { useTr } from '@/i18n';
import { classifyAttachmentSource, badgeKindFor } from './attachmentSource';
import { useAttachmentBadgeInfo } from './useLocalFolderState';
import './register';

/** [Cloud] [이 PC] [이 PC · 연결 끊김] [Cloud·맵 내장] [링크] — 글자만, 마우스를 올리면 뜻이 나온다 (2026-11-26) */
export function AttachmentBadge({ url, style }: { url?: string; style?: CSSProperties }) {
  const tr = useTr();
  const { status } = useAttachmentBadgeInfo(url);
  const kind = badgeKindFor(classifyAttachmentSource(url, { isLocal: isLocalAttachmentUrl }), status);
  return <span data-testid="attachment-badge" data-badge={kind} title={tr('localAtt.badgeTip.' + kind)}
    style={{ fontSize: 10, fontWeight: 600, whiteSpace: 'nowrap', flexShrink: 0, color: kind === 'localOff' ? '#B45309' : undefined, ...style }}>
    [{tr('localAtt.badge.' + kind)}]
  </span>;
}
