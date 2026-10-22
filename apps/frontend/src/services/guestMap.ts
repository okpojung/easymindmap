// Guest 체험 맵 열기·초기화 (2026-10-22 사용자 요청).
//
// · 시작 맵은 관리자가 '관리자 > Guest로 체험하기 맵' 에서 저장한 맵이다(유료 모듈의
//   공개 읽기 API). 저장된 것이 없거나 서버가 답하지 않으면 앱에 들어 있는 샘플
//   ("2026 제품 로드맵")을 그대로 쓴다 — 공개판도 이 경로다.
// · 내장 샘플을 **먼저** 띄우고 서버 맵이 오면 바꾼다. 화면이 비어 기다리지 않게.
//   그 사이 사용자가 이미 편집을 시작했으면(되돌리기 기록이 생겼으면) 덮어쓰지 않는다.
// · [초기화] 는 묻고 나서(버튼 쪽) 같은 순서로 처음 맵으로 되돌린다 — 이때는 편집이
//   있어도 덮어쓴다. 이 브라우저에 남은 게스트 초안도 지운다.

import { loadGuestSeed } from '@pro';
import type { SampleMap, LayoutType } from '@/editor/__samples__/types';
import { useDocumentStore } from '@/stores/documentStore';
import { useEditorUiStore } from '@/stores/editorUiStore';
import { useInteractionStore } from '@/stores/interactionStore';
import { useAuthStore } from '@/stores/authStore';
import { clearLocalDraft } from '@/hooks/useLocalDraft';

let generation = 0;

function showBuiltIn(): void {
  const doc = useDocumentStore.getState();
  doc.setSample();
  doc.clearHistory();
  useInteractionStore.getState().setSelectedId('root');
}

/**
 * 게스트 맵을 연다. `reset` 이면 지금 편집을 버리고 처음 맵으로 되돌린다.
 * 서버 맵을 기다리는 동안 다시 불리면 앞선 요청의 결과는 버린다.
 */
export async function openGuestMap({ reset = false }: { reset?: boolean } = {}): Promise<void> {
  const mine = ++generation;
  if (reset) await clearLocalDraft(null).catch(() => { /* 초안 정리 실패가 초기화를 막지 않는다 */ });
  showBuiltIn();
  const seed = await loadGuestSeed().catch(() => null);
  if (!seed || mine !== generation) return;
  const auth = useAuthStore.getState();
  if (!auth.guest || auth.session) return;           // 그 사이 로그인했다
  if (useDocumentStore.getState().past.length > 0) return; // 그 사이 편집을 시작했다
  const doc = useDocumentStore.getState();
  doc.loadMap(JSON.parse(JSON.stringify(seed.map)) as SampleMap, { resetHistory: true });
  doc.clearHistory();
  const ui = useEditorUiStore.getState();
  ui.setLayoutType(seed.editor.layoutType as LayoutType);
  ui.setSpacingX(seed.editor.spacingX);
  ui.setSpacingY(seed.editor.spacingY);
  useInteractionStore.getState().setSelectedId('root');
}
