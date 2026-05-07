# Editor Core

이 폴더는 easymindmap의 **핵심 편집 엔진(Editor Engine)**을 정의합니다.

Canvas, Interaction, Layout, State, History 등  
실제 사용자가 사용하는 모든 편집 기능이 이 레이어에서 구현됩니다.

> **최종 업데이트:** 2026-05-07  
> **변경 이력:** v1.1 — 구형 파일명 참조를 현재 번호 체계(01~17) 기준으로 전면 교체

---

## 📌 주요 영역

---

### 🗺️ 맵 관리

- **map/01-map.md**
  - 맵 생성 / 열기 / 삭제 / 목록 관리

---

### 🖊️ 노드 편집 기능

- **node/02-node-editing.md**
  - 노드 추가 / 편집 / 삭제 / 이동 / 복제
- **node/03-node-indicator.md**
  - 노드 추가 인디케이터(+버튼), 상태 인디케이터
- **node/04-node-content.md**
  - 노드 콘텐츠 구조 (markdown / code / note)
- **node/05-node-style.md**
  - 노드 스타일 (색상 / 폰트 / border / 배경 이미지)
- **node/06-node-rendering.md**
  - 노드 렌더링 (자동 크기 / 줄바꿈 / overflow / zoom LOD)
- **node/07-markdown-format-policy.md**
  - Markdown → 노드 변환 파싱 정책

---

### 🧭 Layout & 좌표 계산

- **layout/08-layout.md**
  - 레이아웃 유형 및 Layout Engine 정책 (2-pass 알고리즘, subtree 단위)
- **edge-policy.md**
  - tree-line / curve-line Edge 타입 자동 결정 정책

---

### 🃏 캔버스 & 선택

- **canvas/09-kanban.md**
  - Kanban 보드형 레이아웃 (컬럼 / 카드 / depth 제한)
- **canvas/10-canvas.md**
  - 캔버스 조작 (줌 / 팬 / FitScreen / Fullscreen)
- **canvas/11-selection.md**
  - 노드 선택 (단일 / 다중 / 서브트리 / 영역 선택)

---

### ⏪ 히스토리

- **history/12-history-undo-redo.md**
  - 실행 취소 / 복원 (클라이언트 Undo/Redo)
- **history/13-version-history.md**
  - 버전 히스토리 (서버 기반 영구 버전 관리 + Diff Viewer)

---

### 💾 자동 저장

- **save/14-save.md**
  - Patch 기반 실시간 자동 저장 전략 (debounce / 즉시 저장)

---

### 🏷️ 검색 & 태그 & 단축키

- **search/15-tag.md**
  - 노드 태그 추가 / 제거 / 필터
- **search/16-search.md**
  - 텍스트 / 태그 기반 검색
- **search/17-keyboard-shortcuts.md**
  - 키보드 단축키 정의

---

### 🧠 상태 관리

- **state-architecture.md**
  - Document / UI / Viewport / Interaction / Autosave 5-Store 분리 구조

---

## 📌 핵심 설계 특징

- 2-pass Layout Engine (Measure → Arrange)
- subtree 기반 partial relayout
- Patch 기반 상태 변경 (`add` / `update` / `delete` / `move`)
- UI 상태와 Document 상태 분리

---

## 📌 Domain과의 관계

- Domain → 데이터 구조 정의 (`docs/02-domain/`)
- Editor Core → 사용자 인터랙션 처리

---

## 🚀 중요도

👉 이 폴더는 **제품의 핵심 경쟁력 (UX Engine)** 입니다.
