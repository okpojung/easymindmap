// 문서함에서 [＋ 새 맵] 을 눌렀을 때 고른 폴더 (2026-10-26 사용자 요청).
//
// 새 맵은 처음 ☁ 저장할 때 비로소 서버에 생긴다(규칙 3) — 그래서 "어느 폴더에"는
// 그때 저장 대화상자가 기본값으로 쓴다. 팝오버를 연 뒤 **새 문서가 실제로 열렸을 때만**
// 쓰도록 문서 세대(docEpoch)를 같이 적어 둔다. 고르기만 하고 닫았으면 쓰이지 않는다.
let target: { folderId: string; epoch: number } | null = null;

/** 문서함이 새 맵 팝오버를 열 때 — 고른 폴더(없으면 홈)와 그때의 문서 세대 */
export function setNewMapTarget(folderId: string | null, epoch: number): void {
  target = folderId ? { folderId, epoch } : null;
}

/** 저장 대화상자의 기본 폴더 — 팝오버 이후 새 문서가 열렸으면 그 폴더 */
export function newMapTargetFolder(epochNow: number): string | null {
  return target && epochNow > target.epoch ? target.folderId : null;
}

/** 저장했거나 다른 맵을 열었다 — 다음 새 맵에 끌려가지 않게 지운다 */
export function clearNewMapTarget(): void { target = null; }
