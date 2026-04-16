# easymindmap — 전체 기능 명세서

**최종 업데이트:** 2026-04-16
**출처:** 기능정의테이블 + docs/features 문서 통합 정리
**변경 이력:**
- 2026-04-16 — 참조 문서 경로 정정 (map-model.md, node-model.md → domain-models.md; prd.md → vision.md + mvp-scope.md), 로드맵 단계 정렬 수정, 기능 수 요약 갱신
- 2026-03-31 — Kanban 레이아웃 기능 ID 추가, node-background-image 반영, P0-A~C 수정사항 통합

---

## 목차

1. [MAP — 맵 관리](#1-map--맵-관리)
2. [NODE — 노드 조작](#2-node--노드-조작)
3. [LAYOUT — 레이아웃](#3-layout--레이아웃)
4. [KANBAN — Kanban 보드형 레이아웃](#4-kanban--kanban-보드형-레이아웃)
5. [CANVAS — 캔버스 조작](#5-canvas--캔버스-조작)
6. [SELECTION — 선택](#6-selection--선택)
7. [HISTORY — 실행 취소/복원](#7-history--실행-취소복원)
8. [SAVE — 저장](#8-save--저장)
9. [TAG — 태그](#9-tag--태그)
10. [SEARCH — 검색](#10-search--검색)
11. [AI — AI 기능](#11-ai--ai-기능)
12. [EXPORT — 내보내기](#12-export--내보내기)
13. [DASHBOARD — 대시보드 맵 (V3)](#13-dashboard--대시보드-맵-v3)
14. [TRANSLATION — 다국어 번역 (V2)](#14-translation--다국어-번역-v2)
15. [AI WORKFLOW — AI 실행형 절차 (V1.5)](#15-ai-workflow--ai-실행형-절차-v15)
16. [WBS — WBS 모드 (V1)](#16-wbs--wbs-모드-v1)
17. [RESOURCE — 리소스 할당 (V1)](#17-resource--리소스-할당-v1)
18. [RDMN — Redmine 연동 (V1)](#18-rdmn--redmine-연동-v1)
19. [COLLAB — 협업맵](#19-collab--협업맵)
20. [개발 단계별 로드맵](#20-개발-단계별-로드맵)

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

## 3. LAYOUT — 레이아웃

### 3-1. 레이아웃 기능

| 기능ID | 기능명 | 설명 |
|---|---|---|
| LAYOUT-01 | Change Layout | Mindmap 전체 Layout 변경 |
| LAYOUT-02 | Subtree Layout | 특정 Node 이하 Layout 변경 |
| LAYOUT-03 | Auto Layout | 자동 배치 |
| LAYOUT-04 | Layout Reset | Layout 초기화 |

### 3-2. 레이아웃 유형 정의

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

### 3-3. Kanban Layout 특수 규칙

Kanban Layout은 일반 mindmap 계열과 달리 **최대 3레벨까지만 허용**한다.

- Level 1: 보드 제목
- Level 2: 컬럼
- Level 3: 카드
- Level 4 이상 생성 불가

Kanban은 별도 보드형 레이아웃으로 동작하며, edge 렌더링은 기본적으로 사용하지 않는다.

---

## 4. KANBAN — Kanban 보드형 레이아웃

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

## 5. CANVAS — 캔버스 조작

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

## 6. SELECTION — 선택

| 기능ID | 기능명 | 설명 |
|---|---|---|
| SEL-01 | Single Select | Node 단일 선택 |
| SEL-02 | Multi Select | 여러 Node 선택 |
| SEL-03 | Subtree Select | Node 하위 전체 선택 |
| SEL-04 | Area Select | 드래그 영역 선택 |

---

## 7. HISTORY — 실행 취소/복원

| 기능ID | 기능명 | 설명 |
|---|---|---|
| HISTORY-01 | Undo | 작업 취소 |
| HISTORY-02 | Redo | 작업 복원 |

---

## 8. SAVE — 저장

| 기능ID | 기능명 | 설명 | 저장 트리거 |
|---|---|---|---|
| SAVE-01 | Auto Save | 자동 저장 | Node 생성 / Node 삭제 / Node 이동 / Text 수정 / Layout 변경 |

---

## 9. TAG — 태그

| 기능ID | 기능명 | 설명 |
|---|---|---|
| TAG-01 | Add Tag | Node에 Tag 추가 |
| TAG-02 | Remove Tag | Tag 제거 |
| TAG-03 | Tag Explorer | Tag 목록 표시 |
| TAG-04 | Tag Filter | Tag 기반 Node 필터 |

---

## 10. SEARCH — 검색

| 기능ID | 기능명 | 설명 |
|---|---|---|
| SEARCH-01 | Text Search | Node 텍스트 검색 |
| SEARCH-02 | Tag Search | Tag 기반 검색 |

---

## 11. AI — AI 기능

| 기능ID | 기능명 | 설명 |
|---|---|---|
| AI-01 | Generate Mindmap | AI 기반 Mindmap 자동 생성 |
| AI-02 | Expand Node | 선택 Node 기준 AI 자동 확장 |
| AI-03 | Thread Summarize | node thread의 핵심 논점 / 결정 / 미결정 사항 요약 |
| AI-04 | Task Extraction | 댓글에서 action item / 담당자 후보 / 기한 후보 추출 |
| AI-05 | Task Node Generation | 승인된 작업 후보를 자식 TODO 노드로 생성 |

---

## 12. EXPORT — 내보내기

| 기능ID | 기능명 | 설명 |
|---|---|---|
| EXPORT-01 | Export Markdown | Markdown 파일 생성 |
| EXPORT-02 | Export HTML | Standalone HTML 파일 생성 |

---

## 13. DASHBOARD — 대시보드 맵 (V3)

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

## 14. TRANSLATION — 다국어 번역 (V2)

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

## 15. AI WORKFLOW — AI 실행형 절차 (V1.5)

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

## 16. WBS — WBS 모드 (V1)

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

## 17. RESOURCE — 리소스 할당 (V1, WBS · Kanban 공통)

### 리소스 할당 기능

| 기능ID | 기능명 | 설명 | 적용 단계 |
|--------|--------|------|-----------|
| RES-01 | 리소스 할당 패널 | 노드에 사람 할당 UI (WBS·Kanban 공통) | V1 |
| RES-02 | 담당자 검색/추가 | 내부 사용자 및 Redmine 사용자 검색 | V1 |
| RES-03 | 역할 지정 | 담당자/검토자/참관자 역할 지정 | V1 |
| RES-04 | 공수 입력 | 할당 시간(h) 입력 (WBS 전용) | V1 |
| RES-05 | 리소스 아바타 인디케이터 | 노드에 담당자 아바타 표시 (WBS·Kanban 공통) | V1 |

---

## 18. RDMN — Redmine 연동 (V1)

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

## 19. COLLAB — 협업맵

> **상세 설계**: `docs/04-extensions/collaboration/25-map-collaboration.md`
> **실시간 채팅**: `docs/04-extensions/collaboration/26-realtime-chat.md`
> **도메인 모델**: `docs/02-domain/domain-models.md`

### 19-1. 협업맵 정의

맵 생성자(creator)가 1명 이상의 다른 사용자를 **editor로 초대**한 맵.
읽기 전용(viewer) 초대는 협업맵이 아니며 퍼블리싱 기능으로 처리.

### 19-2. 채팅 MVP 원칙

> - 채팅은 메신저가 아니라 **실시간 협업 보조 패널**이다.
> - unread count / read receipt / 메시지 상태 추적은 MVP 범위에서 제외한다.
> - 대신 presence, 새 메시지 점 표시, 재접속 시 최근 30~50개 메시지 복구를 제공한다.
> - 채팅/댓글/AI 결과는 문서 편집 Undo/Redo history에 포함하지 않는다.

### 19-3. Node Thread & AI 연동 메모

- `map-room chat`: 현재 접속 협업자 간 전체 대화
- `node-thread`: 특정 `nodeId`에 연결된 문맥형 토론
- AI 결과는 **미리보기 → 사용자 승인 → 노드 note 또는 child node 반영** 순서만 허용

### 19-4. 기능 목록

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
| CHAT-01 | 맵 채팅 패널 | 우측 사이드바 채팅 패널 표시/숨기기 | V2 |
| CHAT-02 | 메시지 전송 | 텍스트 메시지 전송 (Enter 전송) | V2 |
| CHAT-03 | 이전 메시지 로딩 | 스크롤 업 시 이전 메시지 페이징 로딩 | V2 |
| CHAT-04 | 파일 첨부 | 이미지/파일 첨부 전송 (후순위) | V2 |
| CHAT-05 | @멘션 | @이름으로 특정 협업자 알림 | V2 |

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

### 19-5. Scope 규칙 요약

| scope_type | 배정 가능 역할 | 편집 범위 |
|---|---|---|
| `full` | creator 전용 (자동 배정) | 맵 전체 |
| `level` | editor만 | depth ≥ scope_level 노드 |
| `node` | editor만 | 지정 노드 + 모든 하위 노드 |

---

## 20. 개발 단계별 로드맵

| 단계 | 포함 기능 그룹 | 비고 |
|---|---|---|
| MVP | MAP, NODE, LAYOUT, KANBAN, CANVAS, SELECTION, HISTORY, SAVE, TAG, SEARCH, AI, EXPORT | 핵심 편집 기능 전체 |
| V1 | COLLAB Phase 1 (COLLAB-01~06, 16~17), WBS, RESOURCE, RDMN | 협업 초대·동기화 + WBS 모드 + Redmine 연동 |
| V1.5 | AI WORKFLOW (WFLOW-01~12) | AI 실행형 절차 (단독 편집 모드 전용) |
| V2 | TRANSLATION (TRANS-01~11), COLLAB Phase 2 (COLLAB-07~13), CHAT (CHAT-01~05) | 글로벌 다국어 협업 + 커서/Soft Lock/Node Thread |
| V3 | DASHBOARD (DASH-01~05), AI 협업 요약 (COLLAB-14~15, AI-03~05) | 대시보드 맵 + AI 협업 요약·작업 생성 |

**기능 수 요약**

| 그룹 | 기능 수 | 적용 단계 | 변경 |
|---|:---:|---|---|
| MAP | 5 | MVP | — |
| NODE (단축키) | 12 | MVP | — |
| NODE (인디케이터 +버튼) | 4 | MVP | ⭐ 신규 (NODE-IND-01~04 / NODE-13) |
| LAYOUT (기능) | 4 | MVP | — |
| LAYOUT (유형) | 15 | MVP | — |
| KANBAN | 5 | MVP | ⭐ 신규 (KANBAN-01~05) |
| CANVAS | 8 | MVP | — |
| SELECTION | 4 | MVP | — |
| HISTORY | 2 | MVP | — |
| SAVE | 1 | MVP | — |
| TAG | 4 | MVP | — |
| SEARCH | 2 | MVP | — |
| AI | 5 | MVP / V3 | ⭐ 확장 (AI-03~05 추가) |
| EXPORT | 2 | MVP | — |
| COLLAB Phase 1 | 8 | V1 | ⭐ 신규 (COLLAB-01~06, COLLAB-16~17) |
| WBS | 5 | V1 | ⭐ 신규 (WBS-01~05) |
| RESOURCE | 5 | V1 | ⭐ 신규 (RES-01~05) |
| RDMN | 8 | V1 | ⭐ 신규 (RDMN-01~08) |
| AI WORKFLOW | 12 | V1.5 | ⭐ 신규 (WFLOW-01~12) |
| TRANSLATION (V2) | 11 | V2 | ⭐ 확장 (TRANS-08~11 추가) |
| COLLAB Phase 2 + CHAT | 12 | V2 | ⭐ 신규 (COLLAB-07~13 / CHAT-01~05) |
| DASHBOARD (V3) | 5 | V3 | — |
| COLLAB AI (V3) | 5 | V3 | ⭐ 신규 (COLLAB-14~15 / AI-03~05 교차) |
| **합계** | **124+** | | |
