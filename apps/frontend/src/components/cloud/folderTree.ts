// 문서함(폴더) 트리 유틸 — 목록(평면)과 트리(들여쓰기) 사이 변환.
// 서버는 폴더를 평면 배열로 주고, 트리 구성은 클라이언트가 한다
// (폴더 수가 많지 않고, 화면마다 표현이 달라 서버가 정할 이유가 없다).
import type { FolderItem } from '@/services/cloud/apiClient';

export interface FolderNode extends FolderItem {
  depth: number;
}

/** 부모→자식 순서로 펼친 목록 (이름 오름차순, depth 포함) */
export function flattenFolders(
  folders: FolderItem[],
  parentId: string | null = null,
  depth = 0,
): FolderNode[] {
  return folders
    .filter((f) => f.parentId === parentId)
    .sort((a, b) => a.name.localeCompare(b.name, 'ko'))
    .flatMap((f) => [
      { ...f, depth },
      ...flattenFolders(folders, f.folderId, depth + 1),
    ]);
}

/** 홈부터 해당 폴더까지의 경로 (breadcrumb 용) */
export function folderPath(folders: FolderItem[], folderId: string | null): FolderItem[] {
  const byId = new Map(folders.map((f) => [f.folderId, f]));
  const path: FolderItem[] = [];
  let cur = folderId ? byId.get(folderId) : undefined;
  const guard = new Set<string>(); // 데이터가 꼬여도 무한 루프하지 않도록
  while (cur && !guard.has(cur.folderId)) {
    guard.add(cur.folderId);
    path.unshift(cur);
    cur = cur.parentId ? byId.get(cur.parentId) : undefined;
  }
  return path;
}

/** 폴더 표시 이름 — null = 홈 */
export function folderLabel(folders: FolderItem[], folderId: string | null): string {
  if (!folderId) return '홈';
  return folders.find((f) => f.folderId === folderId)?.name ?? '(삭제된 폴더)';
}
