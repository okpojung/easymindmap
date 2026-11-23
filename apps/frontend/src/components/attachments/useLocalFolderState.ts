import { useEffect, useSyncExternalStore } from 'react';
import {
  getLocalFolderState, initializeLocalFolders, subscribeLocalFolders,
  isLocalAttachmentUrl, localRootId, type LocalFolderState,
} from '@/utils/localAttachments';

/** 폴더 상태 구독 — 읽기만. 권한 요청이나 선택창은 절대 열지 않는다 */
export function useLocalFolderState(rootId?: string): LocalFolderState {
  useEffect(() => { void Promise.resolve(initializeLocalFolders()).catch(() => undefined); }, []);
  return useSyncExternalStore(subscribeLocalFolders, () => getLocalFolderState(rootId), () => getLocalFolderState(rootId));
}

export function useAttachmentBadgeInfo(url?: string) {
  const local = isLocalAttachmentUrl(url);
  const state = useLocalFolderState(local ? localRootId(url) : undefined);
  return { local, status: local ? state.status : undefined };
}
