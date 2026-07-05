// File: src/config/featureFlags.ts
// 기능 플래그 모음 — 개발 단계에 따라 UI를 켜고 끄는 중앙 스위치.
//
// ─────────────────────────────────────────────────────────────────────────────
// COLLAB_PRESENCE_UI — 협업(실시간 공동편집) 표시 UI 전체 스위치
// ─────────────────────────────────────────────────────────────────────────────
// MVP 에디터에서는 협업 기능이 아직 구현 전이므로 관련 표시 UI를 모두 숨긴다.
// (요구사항: 협업 참여자 명·수정위치 표시는 향후 협업 기능 개발 시 적용하고,
//  현재 MVP 에디터 화면에서는 표시하지 않는다. 코드는 삭제하지 않고 보존한다.)
//
// 이 플래그가 false일 때 숨겨지는 것들 (true로 바꾸면 전부 원상 복구):
//
//  1. TopToolbar의 협업자 아바타 스택 (지/민/J)
//     → src/components/top-toolbar/TopToolbar.tsx 의 <CollabAvatars>
//  2. 하단 상태바의 "협업자 N명 · 실시간 연결됨" 안내
//     → src/components/bottom-status-bar/BottomStatusBar.tsx
//  3. 노드의 협업자 편집 잠금 표시 (색상 테두리 링 + "○○○ 편집 중" 배지)
//     → src/editor/node-renderer/NodeRenderer.tsx 의 lockedBy 관련 블록 2곳
//  4. 캔버스 위 협업자 커서/이름 말풍선 (노드 우상단 "박민호" 화살표+이름표)
//     → src/editor/canvas/Canvas.tsx 의 <CollabCursor>
//  5. 레이아웃의 편집중 배지 공간 예약 (lockOverhang)
//     → src/layout/tagOverhang.ts — 배지가 안 보이는 동안 아래 여백도 예약하지 않음
//
// 협업 기능(V2, Yjs 실시간 동시 편집)을 개발할 때 이 값을 true로 되돌리고
// SAMPLE_COLLABS 목데이터를 실제 presence 데이터로 교체하면 된다.
export const COLLAB_PRESENCE_UI = false;
