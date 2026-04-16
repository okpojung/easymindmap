# easymindmap — 전체 기능 명세서

**최종 업데이트:** 2026-04-16
**출처:** 기능정의테이블 + docs/features 문서 통합 정리
**변경 이력:**
- 2026-04-16 — NODE STYLE(NS), NODE BG IMAGE(IMG), NODE RENDERING(NR), EDGE POLICY, VERSION HISTORY(VH), PUBLISH/SHARE(PUBL), SETTINGS(SETT), IMPORT(IMPORT), OBSIDIAN(OBS) 기능군 추가; 목차 및 기능 수 요약 갱신
- 2026-04-16 — 참조 문서 경로 정정 (map-model.md, node-model.md → domain-models.md; prd.md → vision.md + mvp-scope.md), 로드맵 단계 정렬 수정, 기능 수 요약 갱신
- 2026-03-31 — Kanban 레이아웃 기능 ID 추가, node-background-image 반영, P0-A~C 수정사항 통합

---

## 목차

1. [MAP — 맵 관리](#1-map--맵-관리)
2. [NODE — 노드 조작](#2-node--노드-조작)
3. [NODE STYLE — 노드 스타일](#3-node-style--노드-스타일)
4. [NODE BG IMAGE — 노드 배경 이미지](#4-node-bg-image--노드-배경-이미지)
5. [NODE RENDERING — 노드 렌더링](#5-node-rendering--노드-렌더링)
6. [EDGE POLICY — 에지 정책](#6-edge-policy--에지-정책)
7. [LAYOUT — 레이아웃](#7-layout--레이아웃)
8. [KANBAN — Kanban 보드형 레이아웃](#8-kanban--kanban-보드형-레이아웃)
9. [CANVAS — 캔버스 조작](#9-canvas--캔버스-조작)
10. [SELECTION — 선택](#10-selection--선택)
11. [HISTORY — 실행 취소/복원](#11-history--실행-취소복원)
12. [VERSION HISTORY — 버전 히스토리](#12-version-history--버전-히스토리)
13. [SAVE — 저장](#13-save--저장)
14. [TAG — 태그](#14-tag--태그)
15. [SEARCH — 검색](#15-search--검색)
16. [AI — AI 기능](#16-ai--ai-기능)
17. [EXPORT — 내보내기](#17-export--내보내기)
18. [IMPORT — 가져오기](#18-import--가져오기)
19. [PUBLISH / SHARE — 퍼블리시 / 공유](#19-publish--share--퍼블리시--공유)
20. [DASHBOARD — 대시보드 맵 (V3)](#20-dashboard--대시보드-맵-v3)
21. [TRANSLATION — 다국어 번역 (V2)](#21-translation--다국어-번역-v2)
22. [AI WORKFLOW — AI 실행형 절차 (V1.5)](#22-ai-workflow--ai-실행형-절차-v15)
23. [WBS — WBS 모드 (V1)](#23-wbs--wbs-모드-v1)
24. [RESOURCE — 리소스 할당 (V1)](#24-resource--리소스-할당-v1)
25. [RDMN — Redmine 연동 (V1)](#25-rdmn--redmine-연동-v1)
26. [OBSIDIAN — Obsidian 연동 (V1)](#26-obsidian--obsidian-연동-v1)
27. [SETTINGS — 설정](#27-settings--설정)
28. [COLLAB — 협업맵](#28-collab--협업맵)
29. [CHAT — 실시간 채팅](#29-chat--실시간-채팅)
30. [개발 단계별 로드맵](#30-개발-단계별-로드맵)

---

## 1. MAP — 맵 관리

| 기능ID | 기능명 | 설명 | 주요 동작 |
|---|---|---|---|
| MAP-01 | Create Map | 새로운 Mindmap 생성 | Root Node 생성 |
| MAP-02 | Open Map | 기존 Map 열기 | DB에서 Node Tree 로딩 |
| MAP-03 | Rename Map | Map 이름 변경 | Map Title 수정 |
| MAP-04 | Delete Map | Map 삭제 | Map + Node Tree 삭제 |
| MAP-05 | Map List | Map 목록 조회 | 사용자 Map 리스트 표시 |

---

## 2. NODE — 노드 조작

> 노드 추가 인디케이터(+ 버튼) 상세 설계: `docs/03-editor-core/node/02-node-editing.md`
> 도메인 모델 정의: `docs/02-domain/domain-models.md`
>
> **[기능ID 체계 주의]** NODE-13~16은 node-indicator 기준 기능 분류 ID로 사용됨:
> - NODE-13: 추가 인디케이터 (+ 버튼 4방향)
> - NODE-14: 번역 상태 인디케이터 (V2)
> - NODE-15: 인디케이터 ON/OFF 설정 (V2)
> - NODE-16: 콘텐츠 존재 인디케이터 (노트/Hyperlink/첨부파일/멀티미디어)
>
> 아래 표의 `NODE-IND-*` ID는 NODE-13(+버튼) 내부 4방향 동작의 세부 식별자로 사용한다.

### 2-1. 키보드/단축키 기반 노드 조작

| 기능ID | 기능명 | 설명 | 단축키 |
|---|---|---|---|
| NODE-01 | Create Sibling Node-after | 형제 Node 생성 (다음) | LShift + Space |
| NODE-02 | Create Sibling Node-before | 형제 Node 생성 (이전) | LShift + Ctrl + Space |
| NODE-03 | Create Child Node | 자식 Node 생성 | Space |
| NODE-04 | Create Child Node (multi) | 자식 Node 다중 생성 | Ctrl + Space |
| NODE-05 | Edit Node Text | Node 텍스트 편집 | Double Click |
| NODE-06 | Delete Node | Node 삭제 | Delete |
| NODE-07 | Move Node | Node Drag 이동 | Drag |
| NODE-08 | Copy Node | Node 복사 | Ctrl + C |
| NODE-09 | Paste Node | Node 붙여넣기 | Ctrl + V |
| NODE-10 | Duplicate Node | Node 복제 | Ctrl + D |
| NODE-11 | Collapse Node | Node 접기 | Click |
| NODE-12 | Expand Node | Node 펼치기 | Click |

### 2-2. 노드 추가 인디케이터 (+ 버튼 UI)

노드를 싱글 클릭하면 4방향으로 + 아이콘이 표시되며, 클릭 방향에 따라 노드를 추가한다.  
상세 설계 → `docs/03-editor-core/node/02-node-editing.md`

| 기능ID | 기능명 | 방향 | 동작 | 비고 |
|---|---|:---:|---|---|
| NODE-IND-01 | Add Parent Node (Indicator) | ⬆ 상 | 선택 노드와 기존 부모 사이에 부모 노드 중간 삽입 | Root 노드에서 비활성 |
| NODE-IND-02 | Add Child Node (Indicator) | ⬇ 하 | 선택 노드의 마지막 자식으로 자식 노드 추가 | NODE-03(Space)과 동일 동작 |
| NODE-IND-03 | Add Sibling Before (Indicator) | ⬅ 좌 | 선택 노드 바로 앞(이전)에 형제 노드 삽입 | NODE-02와 동일 동작 |
| NODE-IND-04 | Add Sibling After (Indicator) | ➡ 우 | 선택 노드 바로 뒤(다음)에 형제 노드 삽입 | NODE-01과 동일 동작 |

**인디케이터 UX 요약**

- **표시 조건:** 노드 싱글 클릭
- **숨김 조건:** 빈 캔버스 클릭 / ESC / 편집 모드 진입 / 다중 선택
- **새 노드 생성 후:**
  - → 자동으로 편집 모드 진입 (커서 활성)
  - → Enter/blur: 텍스트 확정 + Auto Save
  - → ESC: 생성 취소 (빈 노드 삭제, Undo 미반영)

**방향별 동작 다이어그램**

```
                [ + ]  ← ⬆ 부모 노드 추가
                  │
    [ + ] ─── [선택노드] ─── [ + ]
    ⬅ 형제(이전)                ➡ 형제(다음)
                  │
                [ + ]  ← ⬇ 자식 노드 추가
```

---

## 3. NODE STYLE — 노드 스타일

> 상세 설계: `docs/03-editor-core/node/05-node-style.md`

**개요**  
노드의 시각적 표현(색상·폰트·배경·border·아이콘)을 담당하며, 콘텐츠와 스타일을 분리하여 관리한다.  
부모 스타일 → 자식 기본 상속(override 가능), 협업 충돌 시 LWW 적용.

### 3-1. 노드 스타일 기능

| 기능ID | 기능명 | 설명 |
|---|---|---|
| NS-01 | 텍스트 색상 | 노드 글자 색상 변경 (color picker) |
| NS-02 | 배경 색상 | 노드 배경 색상 변경 (palette) |
| NS-03 | 폰트 스타일 | bold / font-size 설정 (toolbar) |
| NS-04 | Border | 테두리 스타일 / 반경 (radius) 설정 |
| NS-05 | 아이콘 | 상태 아이콘 / emoji 삽입 |
| NS-06 | 강조 | highlight (중요 표시) |

**스타일 상속 규칙**

- 부모 스타일 → 자식 기본 상속 (override 가능)
- Node 스타일 > Theme 전역 기본값 우선순위
- 콘텐츠(markdown)에는 색상 포함하지 않음
- 스타일 저장: `nodes.style_json` (JSONB)

---

## 4. NODE BG IMAGE — 노드 배경 이미지

> 상세 설계: `docs/03-editor-core/node/05-node-style.md § 14`

**개요**  
노드 도형 내부에 배경 이미지를 삽입하고, 그 위에 노드 텍스트를 입력·편집할 수 있는 기능.  
배경 이미지는 첨부파일이 아니라 **노드 스타일 속성**(`style_json.backgroundImage`)으로 저장한다.

| 기능ID | 기능명 | 설명 | 우선순위 |
|---|---|---|---|
| IMG-01 | Open Image Panel | 선택 노드의 이미지 삽입/변경/삭제 패널 열기 | MVP |
| IMG-02 | Insert Preset Image | 사전 정의된 이미지를 노드 배경으로 삽입 | MVP |
| IMG-03 | Upload User Image | 사용자 PC 이미지 업로드 후 노드 배경 적용 | MVP |
| IMG-04 | Replace Background Image | 기존 배경 이미지를 다른 이미지로 교체 | MVP |
| IMG-05 | Remove Background Image | 노드에 적용된 배경 이미지 제거 | MVP |
| IMG-06 | Edit Image Fit Mode | 이미지 배치 방식 변경 (cover/contain/stretch/original) | MVP 선택 |
| IMG-07 | Edit Image Position | 이미지 정렬 위치 변경 (center/top/bottom/left/right) | MVP 선택 |
| IMG-08 | Edit Overlay Style | overlay 색상/투명도 조정 | MVP 선택 |
| IMG-09 | Text Over Image | 배경 이미지 위에 노드 텍스트 입력/편집 | MVP |
| IMG-10 | Text Contrast Assist | 배경 이미지 위 텍스트 가독성 자동 대비 보정 | MVP 선택 |
| IMG-11 | Render Background Image | 편집기 Canvas에서 배경 이미지 노드 렌더링 | MVP |
| IMG-12 | Save Background Image State | 배경 이미지 관련 상태를 DB에 저장 | MVP |
| IMG-13 | Undo/Redo Image Action | 이미지 삽입/교체/삭제/스타일 변경 undo/redo | 후속 |
| IMG-14 | Export HTML With Background Image | HTML export 시 배경 이미지와 텍스트 오버레이 유지 | MVP |
| IMG-15 | Export Markdown Metadata | Markdown export 시 배경 이미지 정보를 metadata로 보존 | MVP 선택 |
| IMG-16 | Validate Upload Image | 허용 포맷·용량 검증 (PNG/JPG/WEBP, 최대 10MB) | MVP |
| IMG-17 | Preset Image Category Filter | preset 이미지를 카테고리별 조회/필터링 | 후속 |
| IMG-18 | Node Resize Reaction | 노드 크기 변경 시 이미지/텍스트 재배치 | 후속 |
| IMG-19 | Copy/Paste Image Node Style | 복사/붙여넣기 시 배경 이미지 스타일 포함 | 후속 |
| IMG-20 | Inheritance Policy On New Node | 형제/자식 생성 시 배경 이미지 상속 여부 제어 | 후속 |

**배경 이미지 / 첨부파일 구분**

| 구분 | 배경 이미지 | 첨부파일 |
|---|---|---|
| 저장 위치 | `nodes.style_json.backgroundImage` (JSONB) | `node_attachments` 테이블 |
| 표시 방식 | 노드 도형 내부 배경 렌더링 | 노드 우측 📎 아이콘 |
| 텍스트 공존 | ✅ 이미지 위에 텍스트 입력 가능 | ❌ |

---

## 5. NODE RENDERING — 노드 렌더링

> 상세 설계: `docs/03-editor-core/node/06-node-rendering.md`

**개요**  
노드 콘텐츠를 화면에 가독성 있게 렌더링한다.  
markdown / code 타입을 구분하여 자동 크기 계산, 줄바꿈, overflow, zoom LOD(정보량 제어)를 적용한다.

| 기능ID | 기능명 | 설명 |
|---|---|---|
| NR-01 | Markdown 렌더링 | markdown content 파싱 후 화면에 표시 |
| NR-02 | Code 렌더링 | code node 표시 (monospace, copy 버튼) |
| NR-03 | 자동 크기 | content 기반 auto size 계산 (min/max 제한) |
| NR-04 | 줄바꿈 처리 | markdown/code 별도 줄바꿈 정책 적용 |
| NR-05 | Overflow 제어 | 기준 초과 시 collapse → 사용자가 expand |
| NR-06 | Zoom 대응 | scale + LOD 기반 정보량 제어 |
| NR-07 | 첨부/링크 표시 | 링크/첨부 아이콘 inline 표시 |
| NR-08 | Preview/Edit 전환 | view mode(렌더링) ↔ edit mode(raw markdown) 전환 |

**Zoom LOD 정책 요약**

| zoom level | 표시 정책 |
|---|---|
| 100% 이상 | full content 표시 |
| 70%~100% | 일부 내용 축약 가능 |
| 40%~70% | 첫 줄/핵심 부분 위주 표시 |
| 40% 미만 | 텍스트 최소화, 구조 중심 표시 |

---

## 6. EDGE POLICY — 에지 정책

> 상세 설계: `docs/03-editor-core/edge-policy.md`

**개요**  
Layout 유형별 부모-자식 연결선(Edge) 스타일 및 노드 상속 규칙을 정의한다.  
Edge는 독립 속성이 아니라 **Layout의 해석 결과**로 자동 결정된다.

**핵심 정책**

```text
Radial 계열 (radial-bidirectional / radial-right / radial-left) → curve-line
나머지 모든 Layout (Tree / Hierarchy / ProcessTree / Freeform / Kanban) → tree-line
```

| 기능ID | 기능명 | 설명 |
|---|---|---|
| EDGE-01 | Layout → Edge 자동 결정 | layoutType에 따라 curve-line / tree-line 자동 선택 |
| EDGE-02 | Subtree Layout Override | 특정 노드부터 subtree 단위로 다른 Layout 적용 가능 |
| EDGE-03 | Node Layout 상속 | 자식 노드는 부모의 layoutType 기본 상속 |
| EDGE-04 | Node Style 상속 | 자식 노드 생성 시 부모 shape/fillColor/borderColor/textColor 상속 |
| EDGE-05 | Font Size Level Rule | depth별 기본 font size 적용 (Root 20px / L1 16px / L2 14px / L3+ 12px) |
| EDGE-06 | Kanban Edge 비표시 | Kanban은 정책상 tree-line이나 UI에서 edge 미표시 처리 |

---

## 7. LAYOUT — 레이아웃

### 7-1. 레이아웃 기능

| 기능ID | 기능명 | 설명 |
|---|---|---|
| LAYOUT-01 | Change Layout | Mindmap 전체 Layout 변경 |
| LAYOUT-02 | Subtree Layout | 특정 Node 이하 Layout 변경 |
| LAYOUT-03 | Auto Layout | 자동 배치 |
| LAYOUT-04 | Layout Reset | Layout 초기화 |

### 7-2. 레이아웃 유형 정의

| 그룹 | 명칭(한글) | 명칭(영문) | 아이콘 | 설명 |
|---|---|---|---|---|
| 방사형 | 방사형-양쪽 | Radial-Bidirectional | icon-radial-bi | 중심 노드를 기준으로 좌우 균형 있게 가지가 퍼지는 전통적 마인드맵 형태 |
| 방사형 | 방사형-오른쪽 | Radial-Right | icon-radial-right | 중심 또는 부모 기준으로 하위 노드가 오른쪽 중심으로 퍼지는 형태 |
| 방사형 | 방사형-왼쪽 | Radial-Left | icon-radial-left | 중심 또는 부모 기준으로 하위 노드가 왼쪽 중심으로 퍼지는 형태 |
| 트리형 | 트리형-위쪽 | Tree-Up | icon-tree-up | 부모 기준으로 하위 노드가 위쪽 방향으로 정렬되는 트리형 |
| 트리형 | 트리형-아래쪽 | Tree-Down | icon-tree-down | 부모 기준으로 하위 노드가 아래쪽 방향으로 정렬되는 기본 트리형 |
| 트리형 | 트리형-오른쪽 | Tree-Right | icon-tree-right | 부모 왼쪽, 자식 오른쪽으로 전개되는 일반적인 수평 트리 |
| 트리형 | 트리형-왼쪽 | Tree-Left | icon-tree-left | 부모 오른쪽, 자식 왼쪽으로 전개되는 수평 역방향 트리 |
| 계층형 | 계층형-오른쪽 | Hierarchy-Right | icon-hierarchy-right | 레벨 단위 정렬이 강조되는 좌→우 계층 구조. 조직도/단계형 문서에 적합 |
| 계층형 | 계층형-왼쪽 | Hierarchy-Left | icon-hierarchy-left | 레벨 단위 정렬이 강조되는 우→좌 계층 구조 |
| 진행트리 | 진행트리-오른쪽 | ProcessTree-Right | icon-process-right | 단계 흐름이 왼쪽에서 오른쪽으로 이어지는 절차형 구조 |
| 진행트리 | 진행트리-왼쪽 | ProcessTree-Left | icon-process-left | 단계 흐름이 오른쪽에서 왼쪽으로 이어지는 절차형 구조 |
| 진행트리 | 진행트리-오른쪽A | ProcessTree-Right-A | icon-process-right-a | 상단 기준선에서 각 단계 노드가 아래로 연결되는 방식 |
| 진행트리 | 진행트리-오른쪽B | ProcessTree-Right-B | icon-process-right-b | 단계 노드들이 같은 수평선상에 연속 배치되는 타임라인/로드맵형 방식 |
| 자유배치형 | 자유배치형 | Freeform | icon-freeform | 자동 정렬보다 사용자의 드래그 위치를 우선하는 방식. subtree 단위 적용 권장 |
| 보드형 | Kanban | Kanban | icon-kanban | 보드 제목(Level 1) / 컬럼(Level 2) / 카드(Level 3) 구조로 동작하는 3레벨 제한 보드형 레이아웃 |

### 7-3. Kanban Layout 특수 규칙

Kanban Layout은 일반 mindmap 계열과 달리 **최대 3레벨까지만 허용**한다.

- Level 1: 보드 제목
- Level 2: 컬럼
- Level 3: 카드
- Level 4 이상 생성 불가

Kanban은 별도 보드형 레이아웃으로 동작하며, edge 렌더링은 기본적으로 사용하지 않는다.

---

## 8. KANBAN — Kanban 보드형 레이아웃

> 상세 설계: `docs/01-product/kanban-layout-spec.md`

**개요**
Kanban은 일반 마인드맵 레이아웃과 달리 3레벨 제한 보드형 구조로 동작한다.
`layoutType = 'kanban'`을 루트 또는 서브트리에 지정하면 해당 영역이 Kanban 보드로 렌더링된다.

| 기능ID | 기능명 | 설명 |
|---|---|---|
| KANBAN-01 | Kanban View 전환 | 맵 또는 서브트리를 Kanban 레이아웃으로 전환 |
| KANBAN-02 | Add Column | board(depth 0) 아래에 컬럼(depth 1) 추가 |
| KANBAN-03 | Add Card | 컬럼(depth 1) 아래에 카드(depth 2) 추가 |
| KANBAN-04 | Move Card | 카드를 다른 컬럼으로 드래그 이동 |
| KANBAN-05 | Depth Limit Guard | depth 3 이상 노드 생성 방지 (UI 및 API 레벨) |

**Kanban 구조 규칙**

| depth | 역할 | 비고 |
|:---:|---|---|
| 0 | board | `layoutType = 'kanban'` 설정 노드 |
| 1 | column | 보드의 컬럼 |
| 2 | card | 컬럼 내 카드 |
| 3+ | — | 허용하지 않음 |

- edge 렌더링 기본 비활성 (kanban은 선 연결선 미표시)
- Kanban 내에서도 일반 노드 단축키(Space/Delete 등) 동작

---

## 9. CANVAS — 캔버스 조작

> 상세 설계: `docs/03-editor-core/canvas/`

| 기능ID | 기능명 | 설명 | 단축키 | 마우스/제스처 |
|---|---|---|---|---|
| CANVAS-01 | Zoom In | 캔버스 확대 | Ctrl + = | Ctrl + 휠 위 |
| CANVAS-02 | Zoom Out | 캔버스 축소 | Ctrl + - | Ctrl + 휠 아래 |
| CANVAS-03 | Fit Screen | 전체 맵을 화면에 맞춤 | Ctrl + Shift + F | — |
| CANVAS-04 | Pan Canvas | 손바닥 모드로 캔버스 이동 | Space + 드래그 / H | 우클릭 + 드래그 / 미들버튼 + 드래그 |
| CANVAS-05 | Center Node | 선택 노드를 화면 중앙으로 이동 (줌 유지) | Ctrl + Enter | 노드 우클릭 → 컨텍스트 메뉴 |
| CANVAS-06 | 100% View | 줌 배율을 100%로 초기화 | Ctrl + 0 | — |
| CANVAS-07 | Fullscreen Mode | 브라우저 전체화면 전환 / ESC로 종료 | F11 / ESC | — |
| CANVAS-08 | Focus Node View | 선택 노드+하위만 표시, 상위 숨김 | Alt + F | 노드 우클릭 → 컨텍스트 메뉴 |

**CANVAS-05 Center Node 설계 결정**

- Center Node는 zoom 배율을 변경하지 않는다.
- pan만 수행하여 선택 노드를 화면 중앙으로 이동.
- 노드를 중앙으로 이동하면서 100% 배율도 원할 경우,  
  Ctrl + Enter → Ctrl + 0 을 순서대로 사용하거나  
  노드 우클릭 컨텍스트 메뉴에서 "100%로 중앙 이동" 별도 옵션 제공.

---

## 10. SELECTION — 선택

| 기능ID | 기능명 | 설명 |
|---|---|---|
| SEL-01 | Single Select | Node 단일 선택 |
| SEL-02 | Multi Select | 여러 Node 선택 |
| SEL-03 | Subtree Select | Node 하위 전체 선택 |
| SEL-04 | Area Select | 드래그 영역 선택 |

---

## 11. HISTORY — 실행 취소/복원

| 기능ID | 기능명 | 설명 |
|---|---|---|
| HISTORY-01 | Undo | 작업 취소 |
| HISTORY-02 | Redo | 작업 복원 |

---

## 12. VERSION HISTORY — 버전 히스토리

> 상세 설계: `docs/03-editor-core/history/13-version-history.md`

**개요**  
맵의 편집 이력을 서버에 영구 저장하여 과거 버전 조회 및 복원을 제공한다.  
autosave 저장 시마다 `map_revisions`에 1 row 자동 누적.  
클라이언트 Undo/Redo(세션 한정)와 달리 **영구적·서버 기반 버전 관리**를 제공한다.

| 기능ID | 기능명 | 설명 | 단계 |
|---|---|---|---|
| VH-01 | 자동 revision 생성 | autosave 저장 시마다 map_revisions에 1 row 생성 | MVP |
| VH-02 | 버전 히스토리 패널 | 타임라인 형태 버전 목록 조회 | V1 |
| VH-03 | 버전 상세 조회 | 특정 버전의 patch_json 내역 확인 | V1 |
| VH-04 | 버전 미리보기 | 특정 버전 맵 read-only 렌더링 | V1 |
| VH-05 | 버전 롤백 (Restore) | 특정 버전으로 현재 맵 상태 복원 | V1 |
| VH-06 | 작성자/시각 표시 | 각 revision의 created_by / created_at 표시 | V1 |

---

## 13. SAVE — 저장

| 기능ID | 기능명 | 설명 | 저장 트리거 |
|---|---|---|---|
| SAVE-01 | Auto Save | 자동 저장 | Node 생성 / Node 삭제 / Node 이동 / Text 수정 / Layout 변경 |

---

## 14. TAG — 태그

| 기능ID | 기능명 | 설명 |
|---|---|---|
| TAG-01 | Add Tag | Node에 Tag 추가 |
| TAG-02 | Remove Tag | Tag 제거 |
| TAG-03 | Tag Explorer | Tag 목록 표시 |
| TAG-04 | Tag Filter | Tag 기반 Node 필터 |

---

## 15. SEARCH — 검색

| 기능ID | 기능명 | 설명 |
|---|---|---|
| SEARCH-01 | Text Search | Node 텍스트 검색 |
| SEARCH-02 | Tag Search | Tag 기반 검색 |

---

## 16. AI — AI 기능

| 기능ID | 기능명 | 설명 |
|---|---|---|
| AI-01 | Generate Mindmap | AI 기반 Mindmap 자동 생성 |
| AI-02 | Expand Node | 선택 Node 기준 AI 자동 확장 |
| AI-03 | Thread Summarize | node thread의 핵심 논점 / 결정 / 미결정 사항 요약 |
| AI-04 | Task Extraction | 댓글에서 action item / 담당자 후보 / 기한 후보 추출 |
| AI-05 | Task Node Generation | 승인된 작업 후보를 자식 TODO 노드로 생성 |

---

## 17. EXPORT — 내보내기

> 상세 설계: `docs/04-extensions/import-export/20-export.md`

**개요**  
마인드맵을 Markdown 또는 Standalone HTML 파일로 내보내는 기능.  
Markdown은 **Basic(기본)** 과 **Extended(확장)** 두 가지 포맷을 지원한다.

| 기능ID | 기능명 | 설명 | 단계 |
|---|---|---|---|
| EXPORT-01 | Export Markdown (Basic) | 노드 텍스트 계층 구조만 포함한 범용 Markdown 내보내기 | MVP |
| EXPORT-01E | Export Markdown (Extended) | YAML Front Matter에 맵 전체 메타 정보 포함 Markdown 내보내기 | V1 |
| EXPORT-02 | Export HTML | 맵 구조를 Standalone HTML로 내보내기 (읽기 전용 뷰어 포함) | MVP |

### 17-1. Markdown 포맷 비교

| 항목 | Basic (기본) | Extended (확장) |
|---|---|---|
| **대상** | 범용 Markdown 편집기, Notion, VS Code | Obsidian, 팀 보관, 버전 관리 |
| **YAML Front Matter** | ❌ 없음 | ✅ 맵 전체 메타 포함 |
| **포함 메타** | 노드 텍스트·태그·메모·링크 (옵션) | title, map_id, owner, layout_type, theme, node_count, tags, created_at, updated_at |
| **API 파라미터** | `exportMode: "basic"` (기본값) | `exportMode: "extended"` |
| **Import 역호환** | — | Extended 파일 Import 시 Front Matter로 맵 메타 자동 복원 |

### 17-2. Extended 포맷 출력 예시

```markdown
---
title: "AI 개념 정리"
map_id: "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
owner: "홍길동"
layout_type: "mindmap"
theme: "default"
node_count: 42
tags:
  - AI
  - 연구
created_at: "2026-04-01T09:00:00Z"
updated_at: "2026-04-16T12:30:00Z"
export_mode: "extended"
easymindmap_version: "1.2.0"
---

# AI 개념 정리

## Machine Learning
### Supervised Learning
### Unsupervised Learning

## Deep Learning
### CNN
### RNN
```

---

## 18. IMPORT — 가져오기

> 상세 설계: `docs/04-extensions/import-export/21-import.md`

**개요**  
외부 Markdown 파일을 마인드맵 노드 트리로 변환하여 가져오는 기능.  
Obsidian, Notion, VS Code 등에서 작성한 아웃라인·문서를 즉시 마인드맵화한다.

| 기능ID | 기능명 | 설명 |
|---|---|---|
| IMPORT-01 | Import Markdown | Markdown 파일을 노드 트리로 변환하여 가져오기 |
| IMPORT-02 | Outline Mode | # 헤딩 계층 구조 기반 파싱 (헤딩 → 노드 깊이) |
| IMPORT-03 | Document Mode | 헤딩 없는 단락 문서를 섹션별로 파싱 |
| IMPORT-04 | Import Preview | 변환 결과 미리보기 후 확정 |

---

## 19. PUBLISH / SHARE — 퍼블리시 / 공유

> 상세 설계: `docs/04-extensions/publish/27-publish-share.md`

**개요**  
맵을 공개 URL로 게시하거나 협업자에게 링크를 공유하는 기능.  
외부 공유, 프레젠테이션, 포트폴리오 게시 등에 활용하며 언제든 게시 취소 가능.

**Publish(게시) vs Share(공유) 구분**

| 구분 | Publish (게시) | Share (공유) |
|---|---|---|
| **대상** | 불특정 다수 (인터넷 전체) | 특정 사용자 (협업자 초대) |
| **인증** | 불필요 (Anonymous 접근) | 필요 (로그인 후 협업 참여) |
| **권한** | 읽기 전용 고정 | editor / viewer 역할 선택 |
| **URL** | `easymindmap.com/p/{publish_id}` | 이메일/링크로 초대 |
| **관련 기능** | PUBL-01~04 (이 섹션) | COLLAB-01~03 (`§ 28 COLLAB`) |

### 19-1. Publish 기능 (공개 게시)

| 기능ID | 기능명 | 설명 |
|---|---|---|
| PUBL-01 | 맵 게시 | 공개 URL(publish_id) 생성 및 게시 |
| PUBL-02 | 게시 취소 | 공개 URL 무효화 (unpublished_at 설정) |
| PUBL-03 | 공개 뷰 렌더링 | 비인증 사용자 읽기 전용 맵 표시 |
| PUBL-04 | 공유 링크 복사 | 클립보드에 공개 URL 복사 |

**공개 URL 구조**: `https://easymindmap.com/p/{publish_id}`  
**권한**: creator만 게시/취소 가능 — editor/viewer/anonymous는 읽기 전용

### 19-2. Share 기능 (협업 공유)

> 협업 초대 방식의 Share — 상세는 `§ 28 COLLAB` 참조

| 기능ID | 기능명 | 설명 |
|---|---|---|
| COLLAB-01 | 협업자 초대 | creator가 이메일/링크로 editor 초대, scope 지정 | 
| COLLAB-02 | 권한 변경 | creator가 editor의 scope를 수정 |
| COLLAB-03 | 협업자 제거 | creator가 editor를 맵에서 제거 |

---

## 20. DASHBOARD — 대시보드 맵 (V3)

> 상세 설계: `docs/04-extensions/dashboard/22-dashboard.md`

**개요**  
맵을 Read-only 대시보드 모드로 설정하면 외부 시스템이 노드 값을 변경했을 때 설정된 주기로 화면을 자동 리프레시하는 기능.

| 기능ID | 기능명 | 설명 |
|---|---|---|
| DASH-01 | Dashboard Mode | 맵을 Read-only 대시보드 모드로 전환 |
| DASH-02 | Auto Refresh | 설정 주기로 노드 값 자동 갱신 (polling) |
| DASH-03 | Change Highlight | 변경된 노드 flash animation 표시 |
| DASH-04 | Refresh Interval Setting | 갱신 주기 설정 (off / 10초 / 30초 / 1분 / 5분 / 10분) |
| DASH-05 | External Node Update API | 외부 시스템에서 노드 값 일괄 업데이트 (`PATCH /maps/:id/data`) |

**DB 변경 사항**

```sql
maps.view_mode                VARCHAR(20)  DEFAULT 'edit'   -- 'edit' | 'dashboard'
maps.refresh_interval_seconds INT          DEFAULT 0        -- 0: off, 30, 60, 300 ...
```

**진화 경로**

| 단계 | 방식 | 비고 |
|---|---|---|
| V3 MVP | setInterval Polling | — |
| V3 확장 | Redis Pub/Sub + WebSocket Push | 트래픽 90%+ 절감 |

---

## 21. TRANSLATION — 다국어 번역 (V2)

> 상세 설계 (노드 번역): `docs/04-extensions/translation/23-node-translation.md`  
> 상세 설계 (채팅 번역): `docs/04-extensions/translation/24-chat-translation.md`  
> 번역 정책 계층 (3단계): `docs/02-domain/domain-models.md § 4.3`

**개요**  
협업/공유 맵을 열 때 각 노드의 텍스트를 열람자의 언어로 자동 번역하여 표시.

**번역 정책 3단계 계층 (우선순위 높음 → 낮음)**

| 레벨 | 범위 | 필드 |
|---|---|---|
| 3 (노드) | 해당 노드만 | `NodeObject.translation_override` (`force_on`\|`force_off`\|`null`) |
| 2 (맵) | 해당 맵만 | `MapObject.translationPolicy` (`MapTranslationPolicy`) |
| 1 (사용자) | 모든 맵 | `UserObject.preferredLanguage`, `secondaryLanguages`, `skipEnglishTranslation` |

| 기능ID | 기능명 | 설명 |
|---|---|---|
| TRANS-01 | Auto Translate | 노드 텍스트를 열람자 언어로 자동 번역 |
| TRANS-02 | Translation Cache | 번역 결과 캐시 저장 및 재사용 |
| TRANS-03 | Cache Invalidation | 원문 변경 시 번역 캐시 자동 무효화 및 재번역 |
| TRANS-04 | Skeleton UI | 번역 대기 중 Skeleton 표시 |
| TRANS-05 | Original Text Toggle | 번역본 ↔ 원문 토글 버튼 |
| TRANS-06 | Batch Translate on Load | 맵 오픈 시 미캐시 노드 배치 번역 |
| TRANS-07 | Translation Broadcast | 번역 완료 시 WebSocket으로 전체 열람자 업데이트 |
| TRANS-08 | Live Chat Translate | 현재 접속 협업자 채팅 메시지를 수신자 언어로 실시간 표시 |
| TRANS-09 | Language-group Cache | 동일 채팅 메시지는 targetLang별 1회만 번역하여 fan-out |
| TRANS-10 | Short Message Guard | 매우 짧은 메시지는 감지/번역 생략 또는 원문 우선 표시 |
| TRANS-11 | Original + Translation | 채팅에서 원문 + 번역문 동시 표시 |

**번역 엔진 전략**

| 우선순위 | 엔진 | 비고 |
|:---:|---|---|
| 1차 | DeepL API | 품질 우수, 속도 빠름, 비용 저렴 |
| 2차 Fallback | LLM (OpenAI GPT 등) | DeepL 미지원 언어 및 전문 용어 처리 |

**번역 트리거 시점**

| 시점 | 트리거 여부 | 이유 |
|---|:---:|---|
| 타이핑 중 | ❌ | API 비용 방지 |
| Enter 키 / blur 이벤트 | ✅ | 번역 트리거 |

---

## 22. AI WORKFLOW — AI 실행형 절차 (V1.5)

> 상세 정의: `docs/04-extensions/ai/19-ai-workflow.md`

**개요**
사용자가 자연어로 요청한 작업을 AI가 step 기반 node tree로 구조화하고,
사용자는 각 step를 실제 실행하면서 오류를 해결하며, 최종적으로 정제된 절차 문서를 완성한다.

### 1. AI Workflow Generation

| 기능ID | 기능명 | 설명 |
|---|---|---|
| WFLOW-01 | Workflow Generate | 자연어 요청을 step 기반 node tree로 생성 |
| WFLOW-02 | Step Node 구조 | 각 step는 독립 node — node title은 요약, 상세는 note에 저장 |

---

### 2. Step Execution Model

각 node는 실행 단위이며 아래 상태를 가진다.

| 기능ID | 기능명 | 설명 |
|---|---|---|
| WFLOW-03 | Step Status | step 상태 관리 (not_started / in_progress / blocked / resolved / done) |
| WFLOW-04 | Step Progress | 현재 실행 중인 step 추적 및 표시 |

---

### 3. Error Resolution

| 기능ID | 기능명 | 설명 |
|---|---|---|
| WFLOW-05 | Error Input | 특정 step node에서 오류 내용 입력 |
| WFLOW-06 | AI Resolution | AI가 해당 step 문맥에서 해결 방법 제시 (반복 가능) |

---

### 4. Workflow Cleanup

| 기능ID | 기능명 | 설명 |
|---|---|---|
| WFLOW-07 | Cleanup | 오류 해결 과정의 중간 시도 제거, 최종 성공 방법만 node에 반영 |

---

### 5. Note Code Block

| 기능ID | 기능명 | 설명 |
|---|---|---|
| WFLOW-08 | Structured Note | note의 block 기반 구조 (paragraph / code_block / warning / checklist) |
| WFLOW-09 | Code Block | 언어 지정 code block 지원 (bash, sql, json 등) |
| WFLOW-10 | Copy Button | code block별 Copy 버튼 제공 |

---

### 6. AI Usage Policy

| 기능ID | 기능명 | 설명 |
|---|---|---|
| WFLOW-11 | Solo-only AI | 단독 편집 모드(접속자 1명)에서만 AI 기능 허용 |
| WFLOW-12 | Collab Restriction | 협업 중(2명 이상) AI 기능 비활성화 + 안내 메시지 표시 |

---

## 23. WBS — WBS 모드 (V1)

> 관련 설계: `docs/04-extensions/integrations/` (Redmine 연동)

### WBS 모드 기능

| 기능ID | 기능명 | 설명 | 적용 단계 |
|--------|--------|------|-----------|
| WBS-01 | WBS 모드 전환 | 맵을 WBS 모드로 전환 (`view_mode = 'wbs'`) | V1 |
| WBS-02 | 일정 설정 (시작/종료일) | 노드에 시작일/종료일 설정 | V1 |
| WBS-03 | 마일스톤 설정 | 노드를 마일스톤으로 지정 (단일 날짜) | V1 |
| WBS-04 | 진척률 설정 | 0~100% 진척률 입력 | V1 |
| WBS-05 | WBS 일정 인디케이터 | 날짜 배지/마일스톤 마커/진척률 바/상태 색상 표시 | V1 |

---

## 24. RESOURCE — 리소스 할당 (V1, WBS · Kanban 공통)

### 리소스 할당 기능

| 기능ID | 기능명 | 설명 | 적용 단계 |
|--------|--------|------|-----------|
| RES-01 | 리소스 할당 패널 | 노드에 사람 할당 UI (WBS·Kanban 공통) | V1 |
| RES-02 | 담당자 검색/추가 | 내부 사용자 및 Redmine 사용자 검색 | V1 |
| RES-03 | 역할 지정 | 담당자/검토자/참관자 역할 지정 | V1 |
| RES-04 | 공수 입력 | 할당 시간(h) 입력 (WBS 전용) | V1 |
| RES-05 | 리소스 아바타 인디케이터 | 노드에 담당자 아바타 표시 (WBS·Kanban 공통) | V1 |

---

## 25. RDMN — Redmine 연동 (V1)

### Redmine 연동 기능

| 기능ID | 기능명 | 설명 | 적용 단계 |
|--------|--------|------|-----------|
| RDMN-01 | Redmine 연동 설정 | URL/API Key/프로젝트 설정 | V1 |
| RDMN-02 | Pull 동기화 | Redmine Issues → Mindmap Nodes | V1 |
| RDMN-03 | Push 동기화 | Mindmap Nodes → Redmine Issues | V1 |
| RDMN-04 | 노드 생성 시 Issue 자동 생성 | 노드 추가 → Redmine Issue 자동 생성 (비동기) | V1 |
| RDMN-05 | 노드 수정 시 Issue 업데이트 | 텍스트/일정/담당자 변경 → Issue PATCH | V1 |
| RDMN-06 | 노드 삭제 시 Issue 삭제 | 노드 삭제 → Redmine Issue DELETE | V1 |
| RDMN-07 | 동기화 상태 인디케이터 | ⟳/⚠/✕ 아이콘으로 sync_status 표시 | V1 |
| RDMN-08 | Redmine Plugin 탭 | Redmine 프로젝트 내 WBS 맵 탭 임베드 | V1 |

---

## 26. OBSIDIAN — Obsidian 연동 (V1)

> 상세 설계: `docs/04-extensions/integrations/30-obsidian-integration.md`

**개요**  
easymindmap과 Obsidian Vault 간 Markdown 기반 양방향 동기화를 지원하는 기능.  
Obsidian에서 작성한 노트를 마인드맵으로 가져오고, 마인드맵을 Obsidian 노트로 내보낸다.

| 기능ID | 기능명 | 설명 | 단계 |
|---|---|---|---|
| OBS-01 | Obsidian → 맵 | Obsidian Markdown 파일을 맵으로 가져오기 | V1 |
| OBS-02 | 맵 → Obsidian | 맵을 Obsidian 호환 Markdown으로 내보내기 | V1 |
| OBS-03 | Vault 연결 설정 | Obsidian Vault 경로 / API 연결 설정 | V1 |
| OBS-04 | 변경 감지 동기화 | Vault 파일 변경 → 자동 맵 업데이트 (Polling/Watch) | 후순위 |
| OBS-05 | Wikilink 처리 | `[[링크]]` → 노드 연결 또는 하이퍼링크로 변환 | 후순위 |

---

## 27. SETTINGS — 설정

> 상세 설계: `docs/04-extensions/settings/32-settings.md`

**개요**  
사용자 개인 환경설정 및 맵별 기본값을 관리하는 기능.  
테마·언어·레이아웃·번역 등 개인화 설정으로 UX를 최적화한다.

| 기능ID | 기능명 | 설명 | 단계 |
|---|---|---|---|
| SETT-01 | 프로필 설정 | 표시 이름, 아바타 이미지 변경 | MVP |
| SETT-02 | 테마 설정 | 라이트/다크/시스템 테마 선택 | MVP |
| SETT-03 | 언어/번역 설정 | UI 언어, 번역 대상 언어 설정 (최대 3개) | V2 |
| SETT-04 | 기본 레이아웃 | 새 맵 생성 시 기본 레이아웃 타입 설정 | MVP |
| SETT-05 | UI 표시 설정 | 번역 인디케이터, 태그 배지, 단축키 표시 등 토글 | MVP |
| SETT-06 | 맵별 설정 | 맵별 번역 정책, 뷰 모드 등 오버라이드 | V2 |
| SETT-07 | API Key 관리 | Dashboard 외부 업데이트용 API Key 발급/재생성 | V3 |

---

## 28. COLLAB — 협업맵

> **상세 설계**: `docs/04-extensions/collaboration/25-map-collaboration.md`
> **실시간 채팅**: `docs/04-extensions/collaboration/26-realtime-chat.md`
> **도메인 모델**: `docs/02-domain/domain-models.md`

### 28-1. 협업맵 정의

맵 생성자(creator)가 1명 이상의 다른 사용자를 **editor로 초대**한 맵.
읽기 전용(viewer) 초대는 협업맵이 아니며 퍼블리싱 기능으로 처리.

### 28-2. 채팅 MVP 원칙

> - 채팅은 메신저가 아니라 **실시간 협업 보조 패널**이다.
> - 전체 메시지 read receipt는 MVP 범위에서 제외한다.
> - **단, @멘션 및 DM(특정 사용자 지정 메시지)은 `chat_mentions` 테이블로 추적하여 재접속 시 확인 가능하게 한다.**
> - 대신 presence, 새 메시지 점 표시, 재접속 시 최근 30~50개 메시지 복구를 제공한다.
> - 채팅/댓글/AI 결과는 문서 편집 Undo/Redo history에 포함하지 않는다.

### 28-3. Node Thread & AI 연동 메모

- `map-room chat`: 현재 접속 협업자 간 전체 대화
- `node-thread`: 특정 `nodeId`에 연결된 문맥형 토론
- AI 결과는 **미리보기 → 사용자 승인 → 노드 note 또는 child node 반영** 순서만 허용

### 28-4. 기능 목록

**Phase 1 (V1) — 협업 초대 · 동기화**

| 기능ID | 기능명 | 설명 | 개발 단계 |
|---|---|---|---|
| COLLAB-01 | 협업자 초대 | creator가 이메일/링크로 editor 초대. scope 지정 필수. | V1 |
| COLLAB-02 | 권한 변경 | creator가 editor의 scope를 수정 | V1 |
| COLLAB-03 | 협업자 제거 | creator가 editor를 맵에서 제거 | V1 |
| COLLAB-04 | 실시간 편집 동기화 | Supabase Realtime 기반 편집 내용 즉시 전파 (LWW) | V1 |
| COLLAB-05 | LWW 충돌 정책 | 마지막 쓰기 우선 (Last-Write-Wins), timestamp 비교 | V1 |
| COLLAB-06 | 변경 수신 및 반영 | 원격 편집 수신 → Document Store 반영 | V1 |
| COLLAB-16 | 접속자 목록 | 현재 맵 접속 중인 협업자 목록 표시 | V1 |
| COLLAB-17 | 접속자 수/아바타 표시 | 헤더에 접속자 아바타 표시, Bottom Status Bar 인원 수 | V1 |

> Soft Lock TTL: 5초 (비활동 시 자동 해제) | 협업자 최대 수: 20명/맵  
> 인프라: Supabase Realtime + Redis Pub/Sub (VM-04)

**Phase 2 (V2) — 커서 공유 · Soft Lock · Node Thread · 채팅**

| 기능ID | 기능명 | 설명 | 개발 단계 |
|---|---|---|---|
| COLLAB-07 | 커서 공유 | 협업자 커서 위치 실시간 표시 (이름+색상, Supabase Presence) | V2 |
| COLLAB-08 | Soft Lock | 노드 편집 시 Soft Lock 설정 (다른 사람 편집 경고, TTL 5초) | V2 |
| COLLAB-09 | Lock 해제 | 편집 완료 또는 TTL 만료 후 자동 해제 | V2 |
| COLLAB-10 | Node Thread | 노드에 댓글 스레드 추가 (`node_threads` 테이블) | V2 |
| COLLAB-11 | Thread Reply | 스레드 답글 작성 | V2 |
| COLLAB-12 | Thread Resolve | 스레드 해결 처리 | V2 |
| COLLAB-13 | Thread Mention | @멘션으로 협업자 알림 | V2 |

> 실시간 채팅(CHAT-01~07) 기능은 **§ 29 CHAT** 에 별도 정의됨.

**Phase 3 (V3) — AI 협업 요약**

| 기능ID | 기능명 | 설명 | 개발 단계 |
|---|---|---|---|
| COLLAB-14 | AI Thread 요약 | Node Thread 핵심 논점/결정/미결 사항 요약 | V3 |
| COLLAB-15 | AI 작업 노드 생성 | 승인된 태스크 후보 → 자식 TODO 노드 일괄 생성 | V3 |

**Phase 4 (V4) — 알림 · CRDT**

| 기능ID | 기능명 | 설명 | 개발 단계 |
|---|---|---|---|
| COLLAB-18 | 맵 변경 알림 | 멘션 / 다이제스트 / DND / 이메일/Push 알림 | V4 |
| COLLAB-19 | CRDT (Yjs) | Phase 3: 완전한 동시 편집 지원 | V4 |

### 28-5. Scope 규칙 요약

| scope_type | 배정 가능 역할 | 편집 범위 |
|---|---|---|
| `full` | creator 전용 (자동 배정) | 맵 전체 |
| `level` | editor만 | depth ≥ scope_level 노드 |
| `node` | editor만 | 지정 노드 + 모든 하위 노드 |

---

## 29. CHAT — 실시간 채팅

> 상세 설계: `docs/04-extensions/collaboration/26-realtime-chat.md`  
> 번역 연동: `docs/04-extensions/translation/24-chat-translation.md`

**개요**  
협업 맵 내에서 실시간으로 소통하는 채팅 기능.  
채팅은 메신저가 아니라 **실시간 협업 보조 패널**이다.  
**협업 비접속 중에도** 본인에게 수신된 멘션/DM을 재접속 시 확인할 수 있으며,  
메시지 전송 대상을 **전체 협업자** 또는 **특정 사용자(DM)** 로 지정할 수 있다.

### 29-1. 기능 목록

| 기능ID | 기능명 | 설명 | 단계 |
|---|---|---|---|
| CHAT-01 | 맵 채팅 패널 | 우측 사이드바 채팅 패널 표시/숨기기 | V2 |
| CHAT-02 | 메시지 전송 | 텍스트 메시지 전송 (Enter 전송) | V2 |
| CHAT-03 | 이전 메시지 로딩 | 스크롤 업 시 이전 메시지 Cursor pagination | V2 |
| CHAT-04 | **전송 대상 지정** | 전체 협업자 또는 특정 사용자(DM) 지정 전송 (`recipient_id`) | V2 |
| CHAT-05 | @멘션 | @이름으로 특정 협업자 알림 (`chat_mentions` 추적) | V2 |
| CHAT-06 | **오프라인 메시지 확인** | 재접속 시 본인 미읽음 멘션/DM 뱃지 표시 및 목록 확인 | V2 |
| CHAT-07 | 파일 첨부 | 이미지/파일 첨부 전송 (후순위) | V3 |

### 29-2. 핵심 설계 원칙

- 전체 메시지 read receipt는 MVP 범위에서 제외
- **@멘션 및 DM은 `chat_mentions` 테이블로 추적** → 재접속 시 확인 가능
- 채팅/댓글/AI 결과는 문서 편집 Undo/Redo history에 포함하지 않음
- Presence, 새 메시지 점 표시, 재접속 시 최근 30~50개 메시지 복구 제공

### 29-3. 전송 대상 규칙 (CHAT-04)

| recipient_id 값 | 의미 | 가시성 |
|---|---|---|
| `NULL` | 전체 공개 브로드캐스트 | 모든 협업자 조회 가능 |
| `UUID` | 특정 사용자 DM | 발신자 + 수신자만 조회 가능 (RLS) |

```sql
-- DM 가시성 RLS 정책
recipient_id IS NULL                    -- 전체 공개
OR user_id = auth.uid()                 -- 내가 보낸 DM
OR recipient_id = auth.uid()            -- 내가 받은 DM
```

### 29-4. 오프라인 메시지 확인 흐름 (CHAT-06)

```
협업 맵 재접속
    │
    ▼
GET /maps/{mapId}/chat/mentions/unread
  → chat_mentions (receiver_id=나, is_read=false) 조회
    │
    ▼
미읽음 수 > 0 → 채팅 아이콘 뱃지 표시 (🔴 N)
    │
    ▼
사용자 확인 → PATCH /maps/{mapId}/chat/mentions/read
    │
    ▼
chat_mentions.is_read = true, read_at = NOW()
→ 뱃지 수 감소/클리어
```

### 29-5. DB 구조 요약

| 테이블 | 주요 컬럼 | 용도 |
|---|---|---|
| `chat_messages` | id, map_id, user_id, **recipient_id**, content, client_msg_id, source_lang, created_at | 채팅 메시지 저장 |
| `chat_mentions` | id, map_id, message_id, sender_id, receiver_id, **mention_type**, **is_read**, read_at, created_at | @멘션/DM 수신 추적 |

- `mention_type`: `'mention'`(@멘션) / `'dm'`(DM 메시지)
- 페이지네이션: `before={cursor}&limit=50`, `recipientFilter={all|mine}`

### 29-6. API 요약

| 메서드 | 엔드포인트 | 설명 |
|---|---|---|
| GET | `/maps/{mapId}/chat/messages` | 메시지 이력 조회 (`recipientFilter` 파라미터) |
| POST | `/maps/{mapId}/chat/messages` | 메시지 전송 (`recipientId` 필드 포함) |
| GET | `/maps/{mapId}/chat/mentions/unread` | 미읽음 멘션/DM 목록 조회 |
| PATCH | `/maps/{mapId}/chat/mentions/read` | 멘션/DM 읽음 처리 |

Supabase Realtime Channel: `chat:map:{mapId}`

### 29-7. 권한 규칙

| 역할 | 채팅 전송 (전체) | DM 전송 | 채팅 읽기 | 멘션/DM 수신 확인 |
|---|---|---|---|---|
| creator | ✅ | ✅ | ✅ | ✅ |
| editor | ✅ | ✅ | ✅ | ✅ |
| viewer | ❌ | ❌ | ✅ | ✅ (수신만) |

> **RLS 정책 (DM)**  
> `chat_messages` SELECT: `recipient_id IS NULL` (전체 공개) OR `user_id = auth.uid()` (내가 보낸 DM) OR `recipient_id = auth.uid()` (내가 받은 DM)

### 29-8. 규칙 (Rule)

- 메시지 최대 길이: **2,000자**
- 이전 메시지 로딩: **50개/요청** (Cursor pagination)
- 채팅 이력: 맵 삭제 시 CASCADE 삭제
- @멘션: `@displayName` 형식, 알림 전송 + `chat_mentions` row INSERT
- DM 메시지: `recipient_id = UUID` — 발신자와 수신자만 조회/수신 가능 (RLS 필수)
- **오프라인 멘션/DM**: 재접속 시 `chat_mentions.is_read = false` 건수를 뱃지로 표시
- **미읽음 만료**: 맵 삭제 시 CASCADE, 별도 만료 정책 없음 (영구 보관)
- 패널 닫힌 상태에서 새 메시지 → 아이콘에 미읽음 뱃지 표시
- **전체 공개 메시지 미읽음**: 접속 중 패널 닫혀 있을 때만 뱃지 표시 (재접속 추적 없음)  
  → 오프라인 추적은 **멘션/DM 한정** (`chat_mentions`)

### 29-9. 예외 / 경계 (Edge Case)

| 상황 | 처리 |
|---|---|
| 빈 메시지 전송 | 전송 버튼/Enter 비활성화 |
| 메시지 길이 초과 | textarea maxLength 2000자 제한 |
| 네트워크 단절 중 전송 | 재연결 후 큐에서 전송 재시도 |
| viewer가 메시지 전송 시도 | UI + API 레벨 차단 (읽기 전용) |
| 본인에게 DM 전송 | UI + API 레벨 방지 (자기 자신 선택 불가) |
| DM 수신자가 맵에서 제거됨 | DM 메시지는 발신자만 조회 가능, `chat_mentions` row는 유지 |
| 재접속 시 대량 미읽음 | 최대 `99+` 뱃지 표시, 상세 목록은 최근 50건 우선 |
| 동시 읽음 처리 | `read_at` 최초 SET 이후 중복 PATCH 무시 (idempotent) |

### 29-10. 구현 우선순위

| 단계 | 기능 |
|---|---|
| **V2 1차 (MVP Chat)** | CHAT-01 채팅 패널, CHAT-02 메시지 전송/수신 (전체 브로드캐스트), CHAT-03 이전 메시지 로딩 |
| **V2 2차** | CHAT-05 @멘션, CHAT-04 전송 대상 지정 (DM), CHAT-06 오프라인 멘션/DM 확인, 번역 연동 (TRANS-08~11) |
| **V3** | CHAT-07 파일/이미지 첨부 |

---

## 30. 개발 단계별 로드맵

| 단계 | 포함 기능 그룹 | 비고 |
|---|---|---|
| MVP | MAP, NODE, NODE STYLE (NS-01~06), NODE BG IMAGE (IMG MVP), NODE RENDERING (NR-01~08), EDGE POLICY (EDGE-01~06), LAYOUT, KANBAN, CANVAS, SELECTION, HISTORY, VERSION HISTORY (VH-01), SAVE, TAG, SEARCH, AI, EXPORT, IMPORT, PUBLISH, SETTINGS (SETT MVP) | 핵심 편집 기능 전체 |
| V1 | COLLAB Phase 1 (COLLAB-01~06, 16~17), WBS, RESOURCE, RDMN, OBSIDIAN (OBS-01~03), VERSION HISTORY (VH-02~06) | 협업 초대·동기화 + WBS 모드 + Redmine/Obsidian 연동 + 버전 히스토리 패널 |
| V1.5 | AI WORKFLOW (WFLOW-01~12) | AI 실행형 절차 (단독 편집 모드 전용) |
| V2 | TRANSLATION (TRANS-01~11), COLLAB Phase 2 (COLLAB-07~13), CHAT (CHAT-01~06), SETTINGS (SETT-03·06) | 글로벌 다국어 협업 + 커서/Soft Lock/Node Thread + DM·오프라인 메시지 확인 |
| V3 | DASHBOARD (DASH-01~05), AI 협업 요약 (COLLAB-14~15, AI-03~05), SETTINGS (SETT-07) | 대시보드 맵 + AI 협업 요약·작업 생성 + Dashboard API Key |

**기능 수 요약**

| 그룹 | 기능 수 | 적용 단계 | 변경 |
|---|:---:|---|---|
| MAP | 5 | MVP | — |
| NODE (단축키) | 12 | MVP | — |
| NODE (인디케이터 +버튼) | 4 | MVP | ⭐ 신규 (NODE-IND-01~04 / NODE-13) |
| NODE STYLE | 6 | MVP | ⭐ 신규 (NS-01~06) |
| NODE BG IMAGE | 20 | MVP~후속 | ⭐ 신규 (IMG-01~20) |
| NODE RENDERING | 8 | MVP | ⭐ 신규 (NR-01~08) |
| EDGE POLICY | 6 | MVP | ⭐ 신규 (EDGE-01~06) |
| LAYOUT (기능) | 4 | MVP | — |
| LAYOUT (유형) | 15 | MVP | — |
| KANBAN | 5 | MVP | ⭐ 신규 (KANBAN-01~05) |
| CANVAS | 8 | MVP | — |
| SELECTION | 4 | MVP | — |
| HISTORY (Undo/Redo) | 2 | MVP | — |
| VERSION HISTORY | 6 | MVP~V1 | ⭐ 신규 (VH-01~06) |
| SAVE | 1 | MVP | — |
| TAG | 4 | MVP | — |
| SEARCH | 2 | MVP | — |
| AI | 5 | MVP / V3 | ⭐ 확장 (AI-03~05 추가) |
| EXPORT | 3 | MVP / V1 | ⭐ 확장 (EXPORT-01E: Markdown Extended 포맷 추가) |
| IMPORT | 4 | MVP | ⭐ 신규 (IMPORT-01~04) |
| PUBLISH | 4 | MVP | ⭐ 신규 (PUBL-01~04) |
| COLLAB Phase 1 | 8 | V1 | ⭐ 신규 (COLLAB-01~06, COLLAB-16~17) |
| WBS | 5 | V1 | ⭐ 신규 (WBS-01~05) |
| RESOURCE | 5 | V1 | ⭐ 신규 (RES-01~05) |
| RDMN | 8 | V1 | ⭐ 신규 (RDMN-01~08) |
| OBSIDIAN | 5 | V1~후속 | ⭐ 신규 (OBS-01~05) |
| AI WORKFLOW | 12 | V1.5 | ⭐ 신규 (WFLOW-01~12) |
| TRANSLATION (V2) | 11 | V2 | ⭐ 확장 (TRANS-08~11 추가) |
| COLLAB Phase 2 + CHAT | 14 | V2 | ⭐ 신규 (COLLAB-07~13 / CHAT-01~06) + CHAT-04·06 신규 격상 |
| SETTINGS | 7 | MVP~V3 | ⭐ 신규 (SETT-01~07) |
| DASHBOARD (V3) | 5 | V3 | — |
| COLLAB AI (V3) | 5 | V3 | ⭐ 신규 (COLLAB-14~15 / AI-03~05 교차) |
| **합계** | **212+** | | |
