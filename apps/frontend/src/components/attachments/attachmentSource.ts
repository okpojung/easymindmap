// 첨부 URL 출처 분류 — 서버 / 이 PC / 맵 내장(data:) / 링크. 순수 함수(테스트 가능).
import { serverAttachmentId } from '@/services/cloud/apiClient';

export type AttachmentSource = 'server' | 'local' | 'embedded' | 'link';
export type FolderStatus = 'loading' | 'connected' | 'disconnected' | 'unsupported';
export type BadgeKind = 'server' | 'local' | 'localOff' | 'embedded' | 'link';

export interface SourceDeps { isLocal: (url?: string) => boolean }

export function classifyAttachmentSource(url: string | undefined, deps: SourceDeps): AttachmentSource {
  if (!url) return 'link';
  if (deps.isLocal(url)) return 'local';
  if (serverAttachmentId(url)) return 'server';
  if (/^data:/i.test(url)) return 'embedded';
  return 'link';
}

/** loading 은 끊김으로 표시하지 않는다 — IndexedDB 를 읽기 전에 '연결 끊김' 이라고 말하지 않기 위해 */
export function badgeKindFor(source: AttachmentSource, folderStatus?: FolderStatus): BadgeKind {
  if (source !== 'local') return source;
  return folderStatus === 'disconnected' || folderStatus === 'unsupported' ? 'localOff' : 'local';
}

export type LocalPickAction = 'pick' | 'connect' | 'wait' | 'unsupported';
/** 클릭 순간의 폴더 상태 → 할 일. connect 후에는 선택창을 이어 열지 않는다(제스처 소진) — 다음 클릭에서 pick */
export function decideLocalPickAction(status: FolderStatus): LocalPickAction {
  if (status === 'connected') return 'pick';
  if (status === 'disconnected') return 'connect';
  if (status === 'loading') return 'wait';
  return 'unsupported';
}
export type HostReason = 'disconnected' | 'missing' | 'unsupported' | 'changed' | 'failed' | 'unapproved';
export type HostAction = 'reconnect' | 'approve' | 'none';
/** 오류 모달에서 보일 단추 — 신뢰할 수 있는 local URL(루트 id 있음)일 때만. 폴더 재연결과 파일 승인은 서로 다른 사유 */
export function hostActionFor(reason: HostReason, validLocalUrl: boolean): HostAction {
  if (!validLocalUrl) return 'none';
  if (reason === 'disconnected') return 'reconnect';
  if (reason === 'unapproved') return 'approve';
  return 'none';
}