# Editor Core

이 폴더는 easymindmap의 **핵심 편집 엔진(Editor Engine)**을 정의합니다.

Canvas, Interaction, Layout, State, History 등  
실제 사용자가 사용하는 모든 편집 기능이 이 레이어에서 구현됩니다.

---

## 📌 주요 영역

---

### 🧠 상태 관리

- **state-architecture.md ⭐**
  - Document / UI / Viewport / Interaction 분리 구조
- **command-history.md**
  - undo / redo (Command 기반)

---

### 🧭 Layout & 좌표 계산

- **layout-engine.md**
- **layout-coordinate-algorithm.md ⭐**
  - 2-pass layout (Measure → Arrange)
- **edge-policy.md**
  - tree / curve 라인 정책

---

### 🖊️ 노드 편집 기능

- **node-editing.md**
- **bulk-branch-insert.md ⭐**
  - 다중 가지 추가 (outline import)
- **node-indicator.md**
- **node-background-image.md**

---

### ⚡ 성능 및 렌더링

- **rendering-performance-strategy.md ⭐**
  - viewport culling
  - partial layout
  - dirty rendering

---

### 💾 자동 저장

- **autosave-engine.md**
  - 실시간 저장 전략

---

### 🏷️ 기타 기능

- **tag-system.md**
  - 태그 기반 분류 시스템

---

## 📌 핵심 설계 특징

- 2-pass Layout Engine
- subtree 기반 partial relayout
- command 기반 상태 변경
- UI 상태와 Document 상태 분리

---

## 📌 Domain과의 관계

- Domain → 데이터 구조 정의
- Editor Core → 사용자 인터랙션 처리

---

## 🚀 중요도

👉 이 폴더는 **제품의 핵심 경쟁력 (UX Engine)** 입니다.
