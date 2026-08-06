# easymindmap — State Architecture

문서 버전: v3.0  
상태: 현행화 (실제 구현 기준)  
최종 업데이트: 2026-08-04 — 실제 구현 기준으로 전면 현행화: 5-Store → **코어 5 + 연동 3 = 8개 스토어**, Record/childIds 노드 모델(설계 초안) → 실제 **중첩 children 트리(MindNode)**, 각 스토어 필드를 실제 코드와 일치시킴, 저장 스냅샷 v2 에 editorUi 레이아웃·간격 포함 명시.  
대상: `docs/03-editor-core/state-architecture.md`

---

## 1. 문서 목적

본 문서는 easymindmap Editor의 상태관리(State Management) 구조를 정의한다.

이 문서의 목적은 다음과 같다.

1. 에디터 내부 상태를 명확하게 분리한다.
2. 어떤 상태가 서버 저장 대상이고 어떤 상태가 UI 전용 상태인지 구분한다.
3. Autosave, Undo/Redo, Layout Engine, (향후) Collaboration 기능이 서로 꼬이지 않도록 기반 구조를 만든다.
4. React + Zustand 기반 실제 구현 기준 문서로 사용한다. (서버 상태 캐시 라이브러리는 미도입 — `docs/05-implementation/state-management.md`)

즉, 이 문서는 단순한 "상태관리 개념 설명"이 아니라  
**easymindmap Editor 전체 동작의 뼈대**를 정의하는 문서이다.

---

## 2. 왜 상태관리가 중요한가

마인드맵 에디터는 겉으로 보기엔 단순해 보이지만 내부적으로는 동시에 많은 상태가 움직인다.

예를 들면 아래가 모두 상태(State)이다.

- 현재 맵 제목
- 현재 노드 트리
- 현재 선택된 노드
- 현재 zoom 배율
- 현재 저장 상태 배지
- 현재 어떤 서버 맵과 연결되어 있는지
- 현재 로그인 세션
- 현재 AI 설정

예를 들어 사용자가 노드를 하나 이동하면 실제로는 아래 일이 연쇄적으로 발생한다.

```text
node 이동
→ document 구조 변경 (+ past 스택 push)
→ layout 재계산
→ 화면 다시 렌더링
→ 자동저장 대기 (주기·안전 시점에 발사)
```

이걸 하나의 store에 몰아넣으면 다음 문제가 생긴다.

- state 변경 시 전체 rerender
- drag 중 과도한 업데이트
- 저장 상태와 UI 상태가 섞임
- undo/redo 경계가 모호해짐

그래서 easymindmap은 상태를 여러 Store로 분리한다.

---

## 3. 최상위 상태 구조 — 8개 스토어

**코어 5개** (에디터 동작):

```text
Editor State (apps/frontend/src/stores/)

├ documentStore      — 문서 원본 (map) + undo/redo (past/future)
├ editorUiStore      — 테마·레이아웃·패널·표시 토글
├ viewportStore      — zoom / pan / 중앙 이동 요청
├ interactionStore   — 선택 / 검색 강조 / 편집 중 노드
└ autosaveStore      — 저장 상태 배지 (saveState 1개)
```

**연동 3개** (서버·계정·AI):

```text
├ cloudStore         — 현재 문서 ↔ 서버 맵 연결 정보 (cloudMapId·제목·폴더·유형)
├ authStore          — 로그인 세션
└ aiSettingsStore    — AI 키·모델·모드 설정
```

이 구조는 대형 편집기들(Figma, Miro, Excalidraw 등)이 공통적으로 채택하는
방식과 유사하다.

핵심 원칙은 다음과 같다.

> **Document는 문서 그 자체이고,  
UI/Viewport/Interaction은 문서를 다루기 위한 일시적 상태이며,  
Autosave/Cloud는 저장·연결을 위한 별도 상태 계층이다.**

---

## 4. 상태관리 핵심 원칙

### 4.1 문서 상태와 UI 상태를 분리한다

문서 상태는 서버에 저장되는 원본이다.  
UI 상태는 사용자가 화면을 어떻게 보고 있고 무엇을 누르고 있는지에 대한 정보이다.

예:

- 문서 상태: 노드 text, children, tags, style
- UI 상태: 선택된 노드, 패널 열림 여부, 검색창 입력값

---

### 4.2 저장 대상 — Document 중심 + 레이아웃 예외

원칙은 여전히 아래다.

```text
documentStore.map 이 저장의 중심
```

단, **저장 스냅샷 v2 에는 editorUiStore 의 `layoutType`·`spacingX/Y` 도
함께 포함**된다 — 서버에서 맵을 다시 열 때 보던 레이아웃·간격을 복원하기
위해서다 (e2e85 [3]. v1 스냅샷에는 이 정보가 없어 현재 값이 유지된다).

- documentStore.map → 저장 O
- editorUiStore → **layoutType·spacingX/Y 만 스냅샷에 포함**, 나머지 저장 X
- viewportStore → 저장 X
- interactionStore → 저장 X
- autosaveStore → 저장 상태 관리용, 원본 저장 대상 아님
- cloudStore → 세션 한정 연결 정보 (비영속 — 새로고침 시 링크 해제)

---

### 4.3 Derived State는 가급적 계산한다

다음 값들은 원본 상태로 저장하기보다 selector / 계산 결과로 다룬다.

- 화면에 현재 보이는 노드 목록 (레이아웃 엔진 출력 `LaidOutNode[]`)
- edge SVG path
- subtree bounding box
- 검색 결과 목록
- zoom/pan 적용 후 screen coordinates

즉, 원본 데이터와 계산 결과를 분리한다.

---

### 4.4 짧게 사는 상태와 오래 사는 상태를 분리한다

예:

- 드래그 중간 좌표 → 컴포넌트 로컬/interaction — 히스토리·저장과 무관
- `node.text`, `node.children` → 오래 유지되는 상태 → documentStore

이 원칙이 무너지면 drag 중에도 저장 후보가 되고, autosave와 undo/redo가 엉키게 된다.
(드래그 연속 변경은 `setHistoryPaused` 로 undo 1단계로 합산 — `12-history-undo-redo.md`)

---

### 4.5 모든 편집은 문서 상태를 중심으로 흐른다

easymindmap의 편집 파이프라인은 아래 흐름을 따른다.

```text
사용자 입력
→ documentStore 액션 (set — past 스택 push 포함)
→ Layout 계산
→ Render
→ 자동저장 (주기·안전 시점에 PUT 스냅샷)
```

즉, 진짜 핵심은 항상 documentStore이다.

---

## 5. 스토어 상세 정의

---

## 5.1 documentStore

### 5.1.1 역할

documentStore는 **Mindmap 데이터 그 자체**와 **undo/redo 스택**을 담는다.

- `map: SampleMap` — 제목·루트·가지·맵 설정
- `past` / `future` — undo/redo 스냅샷 스택 (`12-history-undo-redo.md`)

한마디로 정리하면:

```text
documentStore = 실제 문서 + 되돌리기
```

---

### 5.1.2 실제 문서 모델 — SampleMap (중첩 트리)

```ts
// packages/emm-parser/src/model.ts — 문서 모델의 단일 원본 (EMM 파서와 공유)
interface SampleMap {
  title: string;
  root: SampleRoot;          // 중심 주제 (MindNode)
  branches: SampleBranch[];  // 1레벨 가지 목록 (각각 중첩 children 트리)
  settings?: MapSettings;    // 테마·레벨 폰트 등 맵 설정
}
```

> 노드를 `Record<string, Node>` + `childIds` 로 정규화하는 원안
> (§5.1.3 참조)은 **미채택** — 실제 모델은 **중첩 `children` 배열
> 트리**다. EMM 파일 포맷·내보내기와 같은 모델을 그대로 쓴다.

---

### 5.1.3 노드 정규화(Record/childIds) 설계 초안 — 미채택

> 원안은 "nodes를 배열이 아니라 `Record<string, MindmapNode>` +
> 파생 `childIds`로 저장"하는 설계였다 (빠른 조회·patch 계산 목적).
> patch 저장 자체가 미채택되면서 정규화도 도입하지 않았다 — 중첩 트리
> + 재귀 순회(`mutateNode`)로 충분하고, EMM 모델과 1:1 이라 직렬화
> 변환이 없다. 협업(CRDT) 도입 시 재검토.

---

### 5.1.4 Node 모델 (실제) — MindNode

```ts
// packages/emm-parser/src/model.ts — 앱은 @emm/model 로 재수출해 사용
interface MindNode {
  id: string;
  text: string;

  textAlign?: TextAlign;
  layoutType?: LayoutType;   // 없으면 부모/맵 상속
  edgeType?: EdgeType;

  colorKey?: NodeColorKey;
  side?: 'left' | 'right' | 'center';

  icon?: string;
  iconSide?: 'left' | 'right';

  tag?: string;
  tags?: string[];           // 태그 = 이름 문자열 목록 (15-tag.md)

  note?: boolean;
  locked?: boolean;

  collapsed?: boolean;
  style?: NodeStyle;
  links?: NodeLink[];        // 링크 객체 배열
  notes?: NoteBlock[];       // 노트 블록 배열
  attachments?: NodeAttachment[]; // 첨부 객체 배열
  image?: NodeImage;         // 노드 안 사진 (텍스트 아래)
  images?: NodeInlineImage[]; // 텍스트 중간 인라인 사진
  sizeW?: number;            // 우하단 핸들 수동 박스 크기
  sizeH?: number;

  children?: MindNode[];     // 중첩 트리 — childIds 아님
}
```

> 원안의 `MindmapNode`(parentId/childIds/orderIndex/depth/mapId …)는
> 정규화 설계 초안의 타입 — 미채택. `NodeObject`(domain-models.md)는
> 백엔드 정규화 노드 경로용이다.

---

### 5.1.5 documentStore의 책임 (실제 액션 발췌)

1. 노드 생성 — `addChildNode`, `addChildNodesBulk`, 부모 삽입
2. 노드 삭제 — `deleteNode`, `deleteNodesBulk`
3. 텍스트 수정 — `updateNodeText`
4. 레이아웃 변경 — `updateNodeLayoutType` 등
5. Collapse / Expand — `expandAncestors` 포함
6. 태그·스타일·링크·첨부·노트 변경
7. 맵 교체 — `newMap`, `loadMap`
8. Undo/Redo — `undo`, `redo` (past/future)
9. 저장 스냅샷 — `buildSnapshot` (`normalizeMapForSnapshot` 정규화)

편집 유틸리티는 재귀 헬퍼 `mutateNode`(스프레드 기반 불변 갱신)를 공유한다.

---

### 5.1.6 documentStore의 특징

- 가장 중요한 상태
- 서버에 저장되는 데이터 (스냅샷)
- Undo / Redo 대상 (스택도 이 스토어 안에)
- Autosave 대상
- Export 원본
- (향후) Collaboration 동기화의 기준 상태

---

## 5.2 editorUiStore

### 5.2.1 역할

editorUiStore는 **화면 구성 상태**를 관리한다 — 테마, 레이아웃, 패널,
표시 토글. (선택 상태는 여기가 아니라 **interactionStore** 가 담당한다.)

---

### 5.2.2 실제 구조 (발췌)

```ts
interface EditorUiState {
  themeName: ThemeName;            // light / dark (localStorage 지속)
  layoutType: LayoutType;          // 맵 레이아웃 — 저장 스냅샷 v2 포함
  navTab: NavTabKey;               // 좌측 레일 탭 (새 맵/검색/히스토리/AI …)
  inspectorTab: InspectorTabKey;   // 우측 패널 탭 (스타일/레이아웃/노트·태그/링크·첨부)
  activeSection: SidebarSection;
  sidebarCollapsed: boolean;
  sidebarWidth: number;

  showTags: boolean;               // 태그 배지 표시 토글
  hiddenTags: string[];            // 태그별 배지 숨김 필터

  multiAddOpen: boolean;           // Ctrl+Space 다중 추가 팝업

  spacingX: number;                // 간격 배율 (0.9~2.0) — 저장 스냅샷 v2 포함
  spacingY: number;

  outlineSplit: boolean;           // 아웃라인 분할 화면
  outlineSplitRatio: number;
  mainView: 'map' | 'outline';
  outlineFocusId: string | null;

  browserOpen: boolean;            // 문서함을 편집 영역에 연 상태
}
```

---

### 5.2.3 editorUiStore의 특징

- 대부분 저장 안 함 — 예외: `layoutType`·`spacingX/Y` 는 저장 스냅샷 v2 에 포함, `themeName` 은 localStorage
- 새로고침 시 복구하지 않아도 됨 (테마 제외)
- 문서 원본 진실이 아님 — 렌더링 편의 상태
- 단, **undo 스냅샷 `{map, layout}`** 에 레이아웃이 함께 기록된다 (칸반 전환 복원 — `12-history-undo-redo.md`)

---

## 5.3 viewportStore

### 5.3.1 역할

viewportStore는 사용자가 현재 **어느 화면 위치를 보고 있는가**를 나타낸다.
즉, 캔버스의 카메라 상태이다.

---

### 5.3.2 실제 구조

```ts
interface ViewportState {
  zoom: number;      // 퍼센트 (UI 표시용, /100 = transform scale)
  panX: number;      // viewBox 단위
  panY: number;
  panMode: boolean;  // Hand tool — H 키 토글

  fitRequestId: number;  // requestFit() 이 증가 → 캔버스가 반응해 전체 맞춤
  centerRequest: { id: string; zoom: number; seq: number } | null;
                     // requestCenterNode() — 검색/아웃라인의 중앙 이동 요청

  zoomIn: () => void;
  zoomOut: () => void;
  requestFit: () => void;
  requestCenterNode: (id: string, zoom?: number) => void;
  // ...
}
```

> 원안의 `canvasSize`/`worldBounds`/`isPanning`/`lastCenterNodeId` 는
> 스토어가 아니라 캔버스 컴포넌트 내부에서 계산·관리한다.

---

### 5.3.3 viewportStore가 담당하는 기능

- Zoom In / Out / 직접 입력
- 전체 맞춤 (fitRequestId 요청 패턴)
- Pan 모드 (H)
- 노드 중앙 이동 (centerRequest 요청 패턴 — 검색·아웃라인에서 사용)

---

### 5.3.4 중요한 구분

viewportStore는 **world coordinates** 와 **screen coordinates** 사이의 변환과 관련된다.

- world coordinates → 문서/레이아웃 엔진 기준 좌표
- screen coordinates → zoom/pan 적용 후 화면 좌표

이 둘을 섞으면 안 된다.

---

## 5.4 interactionStore

### 5.4.1 역할

interactionStore는 **사용자의 현재 조작 대상**을 저장한다 — 선택·검색
강조·편집 중 노드. 저장 대상이 아니고 undo 대상도 아니다.

---

### 5.4.2 실제 구조 — 필드 4개

```ts
interface InteractionState {
  selectedId: string | null;       // 단일 선택 노드
  searchHitId: string | null;      // 검색 강조 노드 (클릭한 1건)
  multiSelectedIds: string[];      // 러버밴드/Ctrl+클릭 다중 선택
  editingNodeId: string | null;    // 인라인 편집 중인 노드
}
```

> 원안의 hover/dragging/marquee/draftText 구조는 스토어에 두지 않는다 —
> 드래그·호버·러버밴드 중간값은 캔버스 컴포넌트 로컬 상태다 (초당 수십
> 회 변경을 전역 구독에 태우지 않기 위해).

---

### 5.4.3 interactionStore의 특징

- 저장 안 함, undo/redo 대상 아님
- 계정 경계 전환 시 리셋
- 렌더링(선택 테두리·강조·편집 오버레이)에 중요하지만 원본은 아님

---

## 5.5 autosaveStore (+ cloudStore)

### 5.5.1 역할

autosaveStore는 **저장 상태 배지 하나**를 관리한다. 디바운스 타이머와
실제 PUT 은 저장 서비스(cloud 연동 코드)가 담당하고, 스토어는 그 결과
상태만 표시용으로 든다.

서버 연결 정보는 **cloudStore** 가 별도로 담당한다.

---

### 5.5.2 실제 구조

```ts
// autosaveStore — 배지 1개
type SaveState = 'saved' | 'saving' | 'dirty' | 'error';
interface AutosaveState {
  saveState: SaveState;
  setSaveState: (v: SaveState) => void;
}

// cloudStore — 현재 문서 ↔ 서버 맵 연결 (세션 한정, 비영속)
interface CloudState {
  cloudMapId: string | null;    // 연결된 서버 맵 id (없으면 미저장)
  cloudTitle: string | null;    // 서버에 저장된 이름 — 재저장 시 이 이름 사용
  cloudFolderId: string | null;
  cloudKind: MapKind;
  // detachFromServer() — 새 맵/불러오기 시 링크 해제 (직전 맵 덮어쓰기 방지)
}
```

> 원안의 dirty/pendingPatches/debounceMs/baseVersion 구조는 patch 저장
> 설계 초안 — 미채택.

---

### 5.5.3 Autosave 트리거

**모든 문서 변경 = 미저장 편집 +1**, 서버 반영은 **주기(기본 5분)·미저장 편집 50개·탭 전환/창 닫기/온라인 복귀** (`14-save.md` §0.2). 그 사이 편집은 **로컬 초안(IndexedDB)** 이 지킨다.
유형별 즉시/디바운스 구분은 없다 — 스냅샷 방식이라 최종 상태 하나만
보내면 된다.

```text
documentStore 변경
→ saveState = 'dirty'
→ 자동저장 대기 (주기·안전 시점)
→ buildSnapshot() → PUT /maps/{cloudMapId}/document
→ 성공: saveState = 'saved' / 실패: 'error'
```

---

## 5.6 연동 스토어 — authStore · aiSettingsStore

- **authStore** — 로그인 세션(사용자·토큰). 계정 경계 전환 시 문서·링크·undo 리셋의 기준 (e2e85 [4]).
- **aiSettingsStore** — AI 모드(web/api)·키·모델 설정. localStorage 지속.

---

## 6. 전체 데이터 흐름

```text
사용자 입력
   ↓
documentStore 액션 (set — past push 포함)
   ├── interactionStore 정리 (선택 등)
   └── autosaveStore saveState = 'dirty'
   ↓
Layout Engine (computeLayout → LaidOutNode[])
   ↓
Renderer (SVG + HTML Overlay)
   ↓
자동저장 (주기 기본 5분·미저장 편집 50개·탭 전환/창 닫기 — cloudStore.cloudMapId 로 PUT)
   ↓
API / DB
```

이 흐름이 중요한 이유는 다음과 같다.

1. 편집은 항상 documentStore 변경을 중심으로 이뤄진다.
2. UI 상태는 문서 원본을 직접 바꾸지 않는다.
3. 저장은 문서와 분리된 배지/연결 스토어가 보조한다.
4. Undo/Redo와 (향후) Collaboration 확장이 쉬워진다.

---

## 7. 실제 코드 구조

```text
apps/frontend/src/stores/

documentStore.ts      # map + past/future + 편집 액션 + buildSnapshot
editorUiStore.ts
viewportStore.ts
interactionStore.ts
autosaveStore.ts
cloudStore.ts
authStore.ts
aiSettingsStore.ts
index.ts
```

간단한 예시 (실제 액션):

```ts
// documentStore 사용 예
const addChildNode = useDocumentStore((s) => s.addChildNode);
const undo = useDocumentStore((s) => s.undo);

addChildNode(selectedId);   // 자식 추가 — past push + 자동저장 트리거

// 검색 결과 클릭 흐름
useDocumentStore.getState().expandAncestors(nodeId);
useInteractionStore.getState().setSearchHitId(nodeId);
useViewportStore.getState().requestCenterNode(nodeId, 100);
```

---

## 8. 왜 Store를 나누는가

만약 하나의 Store에 모든 걸 넣으면 다음 일이 벌어진다.

```text
zoom 변경
→ 전체 state 변경
→ 전체 rerender
→ drag 중 성능 저하
→ 저장 상태와 UI 상태 혼선
```

반대로 분리하면 아래처럼 된다.

```text
zoom 변경
→ viewportStore만 변경
→ document rerender 없음
```

즉 Store 분리는 단지 코드 스타일 문제가 아니라  
**성능, 유지보수성, 협업 확장성의 핵심**이다.

---

## 9. 대형 에디터와의 비교

대형 에디터들도 본질적으로 비슷한 구조를 가진다.

### Figma 계열

```text
Document / Viewport / Selection / Interaction / History
```

### Excalidraw 계열

```text
elements / appState / history
```

easymindmap도 같은 원칙을 따르되, 마인드맵 특성(레이아웃·저장 배지·서버
연결·AI 설정)을 고려해 **코어 5 + 연동 3 의 8-스토어** 구조를 가져간다.

---

## 10. 상태별 저장/복구 기준

| Store | 서버 저장 | 새로고침 복구 | Undo/Redo 대상 | 비고 |
|---|---|---:|---:|---|
| documentStore.map | O (스냅샷) | O (서버 맵 다시 열기) | O | past/future 는 세션 한정 |
| editorUiStore | layoutType·spacingX/Y 만 스냅샷 포함 | 테마만 localStorage | X (단, undo 엔트리에 layout 동봉) | |
| viewportStore | X | X | X | |
| interactionStore | X | X | X | |
| autosaveStore | X | X | X | 배지 전용 |
| cloudStore | X (연결 정보) | **X — 의도적 비영속** | X | 새로고침 시 링크 해제 (덮어쓰기 사고 방지) |
| authStore | 세션 (localStorage) | O | X | |
| aiSettingsStore | localStorage | O | X | |

---

## 11. 다른 핵심 엔진과의 관계

### 11.1 documentStore와 Undo/Redo

Undo/Redo는 사실상 아래 의미다.

```text
documentStore 이전 스냅샷으로 되돌리기 (past/future — 같은 스토어 안)
```

별도 History Store 는 없다 — `12-history-undo-redo.md`.

---

### 11.2 documentStore와 Layout Engine

Layout Engine은 문서 원본(map)을 받아 노드 위치·크기·edge path 계산
결과(`LaidOutNode[]`)를 만든다.

```text
documentStore = 원본
Layout Engine = 계산기 (computeLayout)
```

---

### 11.3 documentStore와 Autosave

```text
documentStore 변경 감지
→ 자동저장 대기 (주기·안전 시점)
→ buildSnapshot() (normalizeMapForSnapshot)
→ PUT /maps/:id/document
```

즉 Autosave는 문서를 직접 소유하지 않는다.

---

### 11.4 documentStore와 AI 기능

AI mindmap 생성도 결국은 아래와 같다.

```text
AI 결과 (emm 코드블록)
→ MindNode 트리 변환
→ documentStore 삽입 (set 1회 = undo 1단계)
→ Layout 계산 → 자동저장
```

즉 AI도 별도 예외가 아니라 documentStore 파이프라인에 들어오는 입력원 중 하나이다.

---

## 12. 향후 Collaboration 확장과의 관계 (계획 — 협업 V1)

향후 협업 기능이 들어가더라도 스토어 분리 원칙은 유지한다.

- documentStore → 동기화 대상
- editorUi/viewport/interaction → 로컬 전용
- autosave/cloud → 로컬 저장·연결 관리

현재는 **단일 세션 편집 잠금**(`map_edit_locks`)으로 동시 편집 자체를
차단한다 — `14-save.md` §5.3.

---

## 13. 최종 요약

```text
documentStore
= Mindmap 문서(map) + 되돌리기(past/future)

editorUiStore
= 테마 / 레이아웃 / 패널 / 표시 토글 (layoutType·spacing 은 스냅샷 v2 포함)

viewportStore
= zoom / pan / fit·center 요청

interactionStore
= selectedId / searchHitId / multiSelectedIds / editingNodeId

autosaveStore + cloudStore
= 저장 배지 + 서버 맵 연결 정보

authStore / aiSettingsStore
= 로그인 세션 / AI 설정
```

그리고 가장 중요한 원칙은 아래 한 줄이다.

```text
저장의 중심은 documentStore.map (+ 스냅샷 v2 의 레이아웃·간격)
```

---

## 14. 함께 읽을 문서

1. `docs/03-editor-core/history/12-history-undo-redo.md` — past/future·HISTORY_LIMIT·setHistoryPaused
2. `docs/03-editor-core/save/14-save.md` — 주기 자동저장·로컬 초안·무변경 스킵·편집 잠금 (§0 에 결론 정리)
3. `docs/03-editor-core/layout/08-layout.md` — 레이아웃 엔진·간격
4. `docs/90-architecture/frontend-architecture.md` — 프런트 전체 구조
5. `docs/05-implementation/state-management.md` — Zustand + 얇은 fetch 래퍼 전략
6. `docs/04-extensions/emm-spec.md` — MindNode/SampleMap 모델의 단일 원본

---

## 15. 한 줄 최종 결론

> easymindmap Editor의 상태관리는  
> **문서 상태(document)** 와  
> **화면/UI 상태(editorUi, viewport, interaction)** 와  
> **저장·연동 상태(autosave, cloud, auth, aiSettings)** 를 분리하는  
> **코어 5 + 연동 3 의 8-스토어 구조**를 기준으로 한다.
