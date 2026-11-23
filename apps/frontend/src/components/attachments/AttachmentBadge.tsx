import type { CSSProperties } from 'react';
import { isLocalAttachmentUrl } from '@/utils/localAttachments';
import { useTr } from '@/i18n';
import { classifyAttachmentSource, badgeKindFor } from './attachmentSource';
import { useAttachmentBadgeInfo } from './useLocalFolderState';
import './register';

/** [서버] [이 PC] [이 PC · 연결 끊김] [맵 내장] [링크] — 글자만, 그림 없음 */
export function AttachmentBadge({ url, style }: { url?: string; style?: CSSProperties }) {
  const tr = useTr();
  const { status } = useAttachmentBadgeInfo(url);
  const kind = badgeKindFor(classifyAttachmentSource(url, { isLocal: isLocalAttachmentUrl }), status);
  return <span data-testid="attachment-badge" data-badge={kind}
    style={{ fontSize: 10, fontWeight: 600, whiteSpace: 'nowrap', flexShrink: 0, color: kind === 'localOff' ? '#B45309' : undefined, ...style }}>
    [{tr('localAtt.badge.' + kind)}]
  </span>;
}
