// 이 PC 파일 연결(pickLocalAttachments) — 선택 전후로 계정·맵·읽기전용을 다시 확인한다.
import { captureAuthIdentity, isAuthIdentityCurrent } from '@/stores/authStore';
import { findNodeInMap, useDocumentStore } from '@/stores/documentStore';
import { useCloudStore } from '@/stores/cloudStore';
import type { NodeAttachment } from '@/editor/__samples__/types';
import { connectLocalFolder, getLocalFolderState, pickLocalAttachments } from '@/utils/localAttachments';
import { decideLocalPickAction } from './attachmentSource';

export type LocalPickResult = 'added' | 'cancelled' | 'changed' | 'failed' | 'empty' | 'connected' | 'loading' | 'unsupported';

/**
 * 반드시 사용자 클릭 핸들러에서 동기로 부른다(첫 await 전에 pickLocalAttachments 시작).
 * 고른 파일은 부른 시점의 계정/맵/노드에만 붙인다.
 */
export function attachFromThisPc(nodeId: string): Promise<LocalPickResult> {
  const identity = captureAuthIdentity();
  const epoch = useDocumentStore.getState().docEpoch;
  const still = () => isAuthIdentityCurrent(identity)
    && !useCloudStore.getState().readOnlyInfo
    && useDocumentStore.getState().docEpoch === epoch
    && !!findNodeInMap(useDocumentStore.getState().map, nodeId);
  if (!still()) return Promise.resolve('changed');
  const action = decideLocalPickAction(getLocalFolderState().status);
  if (action === 'wait') return Promise.resolve('loading');
  if (action === 'unsupported') return Promise.resolve('unsupported');
  if (action === 'connect') {
    // 같은 클릭에서 동기로 폴더 선택창만 연다. 끝난 뒤 두 번째 선택창은 열지 않는다.
    let connecting: ReturnType<typeof connectLocalFolder>;
    try { connecting = connectLocalFolder(); } catch { return Promise.resolve('failed'); }
    return connecting.then((st): LocalPickResult => {
      if (!still()) return 'changed';
      return st?.status === 'connected' ? 'connected' : 'failed';
    }, (e: unknown): LocalPickResult => ((e as { name?: string })?.name === 'AbortError' ? 'cancelled' : !still() ? 'changed' : 'failed'));
  }
  let picking: ReturnType<typeof pickLocalAttachments>;
  try { picking = pickLocalAttachments(); } catch { return Promise.resolve('failed'); }
  return picking.then((items): LocalPickResult => {
    if (!items?.length) return 'empty';
    if (!still()) return 'changed';
    for (const it of items) {
      if (!still()) return 'changed';
      useDocumentStore.getState().addNodeAttachment(nodeId, { name: it.name, kind: it.kind as NodeAttachment['kind'], size: it.size, url: it.url });
    }
    return 'added';
  }, (e: unknown): LocalPickResult => ((e as { name?: string })?.name === 'AbortError' ? 'cancelled' : 'failed'));
}
