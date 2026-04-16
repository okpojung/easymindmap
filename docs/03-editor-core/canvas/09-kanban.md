# 09. Kanban
## KANBAN

* 문서 버전: v1.0
* 작성일: 2026-04-14
* 참조: `docs/01-product/kanban-layout-spec.md`

---

### 1. 기능 목적

* 업무 흐름을 **단계별 보드 형태**로 시각화하는 기능
* 기존 방사형/트리형 마인드맵과 독립적으로 동작하는 **3레벨 고정 구조형 레이아웃**
* 컬럼(Column)과 카드(Card) 기반으로 activity를 관리하는 보드형 문서 구조 제공
* `layoutType = 'kanban'`을 통해 기존 Node Tree 구조를 재사용하며 별도 테이블 없이 동작

---

### 2. 기능 범위

* 포함:

  * Kanban 보드 생성 (새 맵 생성 시 선택 또는 기존 맵에서 전환)
  * 3레벨 구조 강제 (board → column → card)
  * 컬럼 추가 / 삭제 / 순서 변경
  * 카드 추가 / 수정 / 삭제 / 순서 변경
  * 카드 컬럼 간 이동 (drag & drop)
  * Markdown / HTML Export
  * AI 생성 연계
  * autosave / undo · redo

* 제외:

  * depth 4 이상 구조
  * 자유배치 drag (→ LAYOUT의 freeform)
  * Subtree layout override
  * swimlane
  * WIP limit
  * assignee / due date / checklist (→ WBS 연계 기능, 후순위)
  * edge 렌더링 (Kanban은 edge-less board)

---

### 3. 세부 기능 목록

| 기능ID  | 기능명              | 설명                          | 주요 동작           |
| ----- | ---------------- | --------------------------- | --------------- |
| KB-01 | Kanban 보드 생성     | 새 맵 생성 또는 기존 맵에서 Kanban 선택  | 맵 생성 시 layoutType 지정 |
| KB-02 | 초기 컬럼 구성         | 생성 시 기본 컬럼 (Todo/Doing/Done) | 사용자 정의 가능        |
| KB-03 | 컬럼 추가            | 보드에 컬럼 추가                   | `+ 컬럼` 버튼       |
| KB-04 | 컬럼 삭제            | 컬럼 및 하위 카드 일괄 삭제            | 확인 다이얼로그         |
| KB-05 | 컬럼 순서 변경         | 컬럼 drag & drop으로 순서 변경      | order_index 저장  |
| KB-06 | 카드 추가            | 컬럼 내 카드 추가                  | `+ 카드` 버튼       |
| KB-07 | 카드 수정            | 카드 content 편집               | 클릭 → 인라인 편집     |
| KB-08 | 카드 삭제            | 카드 삭제                       | Delete / 메뉴     |
| KB-09 | 카드 순서 변경         | 컬럼 내 카드 순서 변경               | drag & drop     |
| KB-10 | 카드 컬럼 간 이동       | 카드를 다른 컬럼으로 이동              | drag & drop     |
| KB-11 | 3레벨 제한 검증        | depth 3 이상 생성 차단            | DB CHECK + UI 검증 |
| KB-12 | Markdown Export  | Kanban 구조를 Markdown으로 export | heading + list  |
| KB-13 | HTML Export      | 보드 UI 유지 standalone HTML     | 읽기 전용 board 뷰   |

---

### 4. 기능 정의 (What)

#### 4.1 Kanban 레벨 구조

```text
Level (depth)   역할      설명
─────────────────────────────────────────────
depth 0         board     보드 제목 (맵 전체 주제)
depth 1         column    좌→우 컬럼 헤더
depth 2         card      컬럼 내 activity 카드
depth 3+        금지      생성 불가 (DB CHECK 제약)
```

#### 4.2 Kanban 구조 예시

```text
프로젝트 A           (depth 0 — board)
 ├ 분석              (depth 1 — column)
 │   ├ 요구사항 정리   (depth 2 — card)
 │   ├ 인터뷰         (depth 2 — card)
 │   └ 경쟁사 조사    (depth 2 — card)
 ├ 설계              (depth 1 — column)
 │   ├ 화면 설계      (depth 2 — card)
 │   └ DB 설계       (depth 2 — card)
 ├ 코딩              (depth 1 — column)
 │   └ API 개발      (depth 2 — card)
 └ 테스트            (depth 1 — column)
     └ 통합 테스트    (depth 2 — card)
```

UI 화면 표현:

```text
┌──────────────────────────────────────────────────────┐
│  프로젝트 A                                           │
├──────────────┬──────────────┬──────────────┬─────────┤
│   분석        │   설계        │   코딩        │  테스트  │
│ ─────────── │ ─────────── │ ─────────── │ ──────  │
│ 요구사항 정리 │ 화면 설계     │ API 개발     │ 통합테스트│
│ 인터뷰        │ DB 설계      │              │          │
│ 경쟁사 조사  │              │              │          │
│ [+ 카드]     │ [+ 카드]     │ [+ 카드]     │ [+ 카드] │
└──────────────┴──────────────┴──────────────┴─────────┘
                                             [+ 컬럼 추가]
```

#### 4.3 KanbanNodeRole 타입

```typescript
type KanbanNodeRole = 'board' | 'column' | 'card';

// nodes.style_json 또는 layout_config 내 저장 예시
{
  "layoutType": "kanban",
  "kanbanRole": "column"
}
```

#### 4.4 NodeObject 예시 (column)

```json
{
  "id": "node_col_01",
  "parentId": "node_board_01",
  "depth": 1,
  "layoutType": "kanban",
  "content": "분석",
  "content_type": "markdown",
  "order_index": 1.0
}
```

#### 4.5 NodeObject 예시 (card)

```json
{
  "id": "node_card_01",
  "parentId": "node_col_01",
  "depth": 2,
  "layoutType": "kanban",
  "content": "요구사항 정리",
  "content_type": "markdown",
  "order_index": 1.0
}
```

#### 4.6 초기 생성 구조 (기본 템플릿)

새 Kanban 보드 생성 시 시스템이 자동 생성하는 기본 구조:

```text
새 Kanban 보드        (depth 0 — board)
 ├ Todo              (depth 1 — column)
 ├ Doing             (depth 1 — column)
 └ Done              (depth 1 — column)
```

---

### 5. 동작 방식 (How)

#### 5.1 사용자 동작

* 새 맵 생성 화면 > 레이아웃 선택 > `Kanban` 선택
* 보드 제목 클릭 → 제목 수정
* 컬럼 헤더 클릭 → 컬럼명 수정
* `+ 컬럼` 버튼 클릭 → 컬럼 추가
* `+ 카드` 버튼 클릭 → 해당 컬럼에 카드 추가
* 카드 클릭 → 인라인 편집
* 카드 drag → 컬럼 내 순서 변경 또는 다른 컬럼으로 이동
* 컬럼 drag → 컬럼 순서 변경
* 카드 우클릭 > 삭제

---

#### 5.2 시스템 처리

* `layoutType = 'kanban'` 설정 시 Layout Engine이 Kanban Strategy 선택
* 노드 생성 시 depth 검증: depth 3 이상이면 생성 차단
* 카드 이동 시 `parent_id` 변경 + `order_index` 재계산
* 컬럼 순서 변경 시 형제 노드 `order_index` 재계산
* autosave debounce 적용 (편집 완료 후 저장)

---

#### 5.3 표시 방식

* depth 0 (board): 보드 상단 제목 영역으로 고정 표시
* depth 1 (column): 가로 방향으로 컬럼 헤더 나열
* depth 2 (card): 각 컬럼 내부에서 위→아래 세로 배치
* edge 미표시: 컬럼-카드 연결선 없음 (board UI 형태)
* 컬럼 너비: 균등 분배 또는 사용자 조절

---

### 6. 규칙 (Rule)

---

#### 6.1 레벨 제한 규칙

* Kanban Layout은 **최대 3레벨(depth 0~2)**만 허용한다
* depth 3 이상 생성 시도 → DB `chk_nodes_kanban_depth` CHECK 제약 위반으로 거부
* 프론트엔드에서도 `+ 카드` UI를 depth 2에서만 노출하여 예방

```sql
CONSTRAINT chk_nodes_kanban_depth
  CHECK (layout_type != 'kanban' OR depth BETWEEN 0 AND 2)
```

---

#### 6.2 생성 허용/금지 규칙

| 위치       | 허용 생성       | 금지 생성              |
| -------- | ----------- | ------------------ |
| board(0) | column(1)   | card(2) 직접 생성      |
| column(1)| card(2)     | column(1) 중첩 생성    |
| card(2)  | 형제 카드만      | 자식 생성 (depth 3) 금지 |

---

#### 6.3 이동 허용/금지 규칙

| 대상    | 허용 이동           | 금지 이동        |
| ----- | --------------- | ------------ |
| column | 형제 컬럼 간 순서 변경  | board 밖으로 이동  |
| card  | 컬럼 내 순서 변경      |              |
| card  | 다른 컬럼으로 이동      | column 레벨로 이동 |

---

#### 6.4 Edge 정책

* Kanban Layout은 **edge-less board layout**을 기본으로 한다
* 부모-자식 연결선 미표시
* 논리적 부모-자식 관계는 `parent_id`로 유지하되 렌더링에서 생략

---

#### 6.5 레이아웃 전환 제한 규칙

* Kanban 모드에서 Subtree layout override 비활성화
* 자유배치(freeform) drag 비활성화
* radial / tree / hierarchy 전환 시 구조 정합성 경고 표시

---

#### 6.6 컬럼 수 규칙

* 최소 1개 이상
* 최대 컬럼 수는 제한 없음 (UI 가로 스크롤로 대응)

---

#### 6.7 보드 제목 규칙

* depth 0 노드가 1개만 존재해야 한다
* 보드 제목 편집 가능
* 보드(depth 0) 노드 삭제 불가 (루트 노드와 동일 정책)

---

### 7. 레벨별 상세 정의

#### 7.1 Level 0 — Board

* 보드 전체의 주제/제목
* 화면 상단 고정 표시
* 맵 1개당 board 노드 1개
* 예: `프로젝트 A`, `제품 개발 보드`, `고객사 구축 일정`

---

#### 7.2 Level 1 — Column

* 업무 단계 또는 상태를 나타내는 컬럼 헤더
* 좌→우 순서로 배치 (order_index 기준)
* 컬럼명 수정 / 추가 / 삭제 / 순서 변경 가능
* 예: `Todo`, `In Progress`, `Done`, `분석`, `설계`, `코딩`

---

#### 7.3 Level 2 — Card

* 실제 업무 항목 (activity / task)
* 컬럼 내부 위→아래 세로 배치
* 카드 내 content는 markdown 기반
* 예: `요구사항 정리`, `API 개발`, `통합 테스트`

---

### 8. Export 정책

#### 8.1 Markdown Export

```markdown
# 프로젝트 A

## 분석
- 요구사항 정리
- 인터뷰
- 경쟁사 조사

## 설계
- 화면 설계
- DB 설계

## 코딩
- API 개발
```

변환 규칙:

| Kanban 레벨 | Markdown     |
| --------- | ------------ |
| board (0) | `#` (H1)     |
| column (1)| `##` (H2)    |
| card (2)  | `-` 리스트 항목  |

---

#### 8.2 HTML Export

* standalone HTML로 보드 UI 유지
* 컬럼 좌→우 표시
* 카드 세로 표시
* drag & drop 없는 읽기 전용 보드 뷰
* CSS 인라인으로 구조 표현

---

### 9. AI 생성 연계

* Kanban 생성 요청 시 AI가 3레벨 구조에 맞는 노드 트리 생성
* AI 생성 시에도 depth 3 이상 생성 금지 규칙 적용
* 생성 예시:

  ```text
  입력: "신규 서비스 개발 Kanban 보드 만들어줘. 컬럼은 분석, 설계, 코딩, 테스트"

  출력:
  - board: 신규 서비스 개발
  - column: 분석 / 설계 / 코딩 / 테스트
  - card: 각 컬럼별 activity 카드 자동 생성
  ```

---

### 10. 예외 / 경계 (Edge Case)

* **depth 3 생성 시도**: DB CHECK 제약 + 프론트 검증으로 이중 차단 → 오류 메시지 표시
* **컬럼 삭제 시 카드 존재**: 확인 다이얼로그 표시 ("이 컬럼에 카드 N개가 있습니다. 삭제하시겠습니까?")
* **컬럼이 0개인 상태**: board만 남은 빈 Kanban → `+ 컬럼 추가` 버튼만 표시
* **카드 개수 매우 많음 (50+)**: 컬럼 내 가상 스크롤 또는 접힘 처리
* **컬럼 이름 중복**: 허용 (별도 노드로 관리)
* **기존 mindmap → Kanban 전환 시**: depth 3+ 노드 존재 시 경고 표시 후 사용자 확인 필요
* **Kanban → mindmap 전환 시**: `layoutType` 변경 후 auto layout 재계산
* **board 노드 삭제 시도**: 루트 정책과 동일하게 삭제 불가 처리

---

### 11. 권한 규칙

| 역할      | 권한                             |
| ------- | ------------------------------ |
| creator | 전체 (보드/컬럼/카드 생성·수정·삭제·이동) |
| editor  | 컬럼/카드 생성·수정·삭제·이동 가능          |
| viewer  | 읽기 전용                          |

---

### 12. DB 영향

* `nodes.layout_type` — `'kanban'` 값 사용
* `nodes.depth` — 0 (board) / 1 (column) / 2 (card)
* `nodes.parent_id` — 기존 Node Tree 구조 그대로 사용
* `nodes.order_index` — 컬럼/카드 순서 저장
* `nodes.content` — 보드 제목 / 컬럼명 / 카드 내용
* `nodes.style_json` — `kanbanRole` 메타데이터 저장 가능

DB 제약:

```sql
-- Kanban depth 3 이상 금지
CONSTRAINT chk_nodes_kanban_depth
  CHECK (layout_type != 'kanban' OR depth BETWEEN 0 AND 2)
```

별도 테이블 추가 없음 — 기존 `nodes` 테이블 구조 재사용

---

### 13. API 영향

* `POST /maps` — `default_layout_type: 'kanban'`으로 Kanban 보드 생성
* `POST /nodes` — column / card 생성 (depth 검증 포함)
* `PATCH /nodes/{id}` — 카드 content 수정, 컬럼명 수정
* `PATCH /nodes/{id}/parent` — 카드 컬럼 간 이동 (`parent_id` + `order_index` 변경)
* `DELETE /nodes/{id}` — 컬럼 삭제 (하위 카드 cascade) / 카드 삭제
* `GET /maps/{id}` — 전체 Kanban 구조 반환

---

### 14. 연관 기능

* LAYOUT (`08-layout.md` — layoutType 정의)
* NODE_CONTENT (`04-node-content.md` — 카드 content)
* NODE_EDITING (`02-node-editing.md` — 인라인 편집)
* HISTORY (undo/redo)
* SAVE (autosave)
* EXPORT (Markdown/HTML export)
* AI_WORKFLOW (AI 카드 생성)
* WBS (assignee/due date 연계, 후순위)

---

### 15. 예시 시나리오

#### 시나리오 1 — Kanban 보드 신규 생성

1. 사용자: 새 맵 생성 > `Kanban` 선택 > 보드 제목 입력: "프로젝트 A"
2. 시스템: depth 0 board 노드 + depth 1 컬럼 3개 (Todo / Doing / Done) 자동 생성
3. 사용자: `+ 컬럼` 클릭 → `분석` 컬럼 추가
4. 사용자: `분석` 컬럼 내 `+ 카드` → `요구사항 정리` 카드 추가

#### 시나리오 2 — 카드 컬럼 간 이동

1. 사용자: `분석` 컬럼의 `요구사항 정리` 카드를 drag
2. `설계` 컬럼으로 drop
3. 시스템: `parent_id` = 설계 컬럼 ID로 변경, `order_index` 재계산, autosave

#### 시나리오 3 — depth 3 생성 시도 차단

1. 사용자: 카드(depth 2) 선택 후 자식 노드 추가 시도
2. 시스템: depth 3 생성 불가 오류 표시
3. `+ 카드` UI를 card 레벨에서 미표시하여 예방

#### 시나리오 4 — Markdown Export

1. 사용자: 메뉴 > Export > Markdown
2. 시스템: board → `#`, column → `##`, card → `-` 변환
3. 파일 다운로드

#### 시나리오 5 — AI 생성 연계

1. 사용자: AI 입력 "소프트웨어 개발 Kanban 보드 만들어줘"
2. AI: 3레벨 제한 준수하여 board / column / card 구조 생성
3. 시스템: depth 검증 후 저장, Kanban 보드 즉시 렌더링

---

### 16. 구현 우선순위

#### MVP

* Kanban 보드 생성 (새 맵 생성 시 선택)
* 기본 컬럼 구조 (Todo / Doing / Done)
* 컬럼/카드 추가·수정·삭제
* 카드 순서 변경 (drag & drop)
* 카드 컬럼 간 이동
* 3레벨 제한 검증 (DB + 프론트)
* Markdown Export
* autosave / undo · redo

#### 2단계

* 컬럼 순서 변경 drag & drop
* HTML Export (보드 UI 유지)
* AI 생성 연계
* 컬럼 색상 지정

#### 3단계

* WBS 연계 (assignee, due date, checklist)
* swimlane
* WIP limit
* 카드 상세 확장 뷰 (note, attachment)

---

### 17. 설계 철학 — 의도적 3레벨 구조

Kanban Layout이 3레벨만 허용하는 것은 기능 부재가 아니라 **의도적 설계 결정**이다.

easymindmap의 기존 layout(방사형, 트리형, 계층형 등)은 무한 계층 전개가 가능하다.
Kanban Layout은 이와 달리 **업무 흐름을 보드 형태로 다루는 별도 문서 구조**로 정의한다.

이 구조의 핵심 의도:

* **보드 제목(board)** → 맥락 제공 (무엇에 대한 보드인가)
* **컬럼(column)** → 업무 단계 또는 상태 구분 (가로축)
* **카드(card)** → 실제 수행 항목 (action item, activity)

3레벨 이상으로 세분화하면 Kanban 보드로서의 가독성과 실용성이 떨어진다.
세부 구조가 필요한 경우 card 내부의 `note` 또는 `checklist` 기능(후순위)을 활용하도록 유도한다.

즉, Kanban Layout은 일반 마인드맵의 자유로운 다계층 구조가 아니라
**엄격히 3레벨로 제한된 업무 흐름형 보드 구조**로 설계한다.

```text
핵심 요약:
  Level 0 (depth 0) = 보드 제목
  Level 1 (depth 1) = 좌→우 컬럼
  Level 2 (depth 2) = 컬럼 내부 activity 카드
  Level 3 이상       = 금지 (설계 의도)
```

---

### 18. 금지 구조 예시 (Anti-pattern)

아래는 Kanban Layout에서 허용하지 않는 구조의 예시이다.

```text
프로젝트 A          (depth 0 — board)     ✔ 허용
 └ 분석             (depth 1 — column)    ✔ 허용
    └ 요구사항 정리  (depth 2 — card)      ✔ 허용
       └ 세부항목   (depth 3 — 금지!)     ✗ 차단
```

`세부항목`은 depth 3이므로 Kanban Layout에서 생성이 불가하다.

이유:
* Kanban 보드의 card(depth 2)는 더 이상 분해되지 않는 최소 작업 단위로 취급한다
* 계층 분해가 필요한 경우 card 내부의 note/checklist(후순위 기능)를 사용한다
* 강제 허용 시 board UI가 mindmap 계층 구조로 퇴행하여 Kanban의 목적을 잃게 된다

---

### 19. UI 와이어프레임

Kanban 화면의 전체 레이아웃 구조 기준안이다.

```text
┌──────────────────────────────────────────────────────┐
│ 보드 제목: 프로젝트 A                                  │
├──────────────┬──────────────┬──────────────┬─────────┤
│   분석        │   설계        │   코딩        │  테스트  │
│ ──────────── │ ──────────── │ ──────────── │ ─────── │
│ 요구사항 정리 │ 화면 설계     │ API 개발      │통합 테스트│
│ 인터뷰        │ DB 설계      │              │          │
│ 경쟁사 조사   │              │              │          │
│              │              │              │          │
│ [+ 카드]     │ [+ 카드]     │ [+ 카드]     │ [+ 카드] │
└──────────────┴──────────────┴──────────────┴─────────┘
                                              [+ 컬럼 추가]
```

표시 규칙:

| 영역         | 표시 방식                              |
| ---------- | ---------------------------------- |
| 보드 제목      | 상단 전체 너비 고정 — 일반 노드처럼 캔버스 중앙 배치 안 함 |
| 컬럼 헤더      | 가로 방향 나열, 컬럼 너비 균등 또는 사용자 조절       |
| 카드         | 컬럼 내부 위→아래 세로 배치, 텍스트 양에 따라 높이 가변  |
| `+ 카드` 버튼  | 각 컬럼 하단 고정                         |
| `+ 컬럼 추가`  | 마지막 컬럼 우측 고정                       |

---

### 20. 레벨별 인터랙션 패턴

각 레벨에서 허용되는 사용자 인터랙션을 명시한다.

#### Level 0 — Board (depth 0)

| 인터랙션         | 동작                   |
| ------------ | -------------------- |
| 제목 클릭        | 인라인 텍스트 편집 진입        |
| 삭제 시도        | 불가 (루트 정책과 동일)       |
| 자식 생성 (일반)   | 컬럼(depth 1) 추가만 허용   |
| card 직접 생성   | 차단 (depth 2 직접 삽입 금지) |

#### Level 1 — Column (depth 1)

| 인터랙션         | 동작                   |
| ------------ | -------------------- |
| 헤더 클릭        | 컬럼명 인라인 편집           |
| drag & drop  | 형제 컬럼 간 순서 변경        |
| `+ 카드` 버튼    | 해당 컬럼 하단에 카드 추가      |
| 삭제           | 확인 다이얼로그 후 하위 카드 포함 삭제 |
| 자식으로 column  | 차단 (column 중첩 금지)    |

#### Level 2 — Card (depth 2)

| 인터랙션          | 동작                        |
| ------------- | ------------------------- |
| 클릭            | 인라인 텍스트 편집                |
| drag (컬럼 내)   | 카드 순서 변경                  |
| drag (컬럼 간)   | 다른 컬럼으로 이동 (`parent_id` 변경) |
| 자식 생성 시도      | 차단 (depth 3 금지)           |
| 우클릭           | 컨텍스트 메뉴 (수정 / 삭제)         |
| 형제 카드 추가      | 허용                        |

---

### 21. Edge 정책 — 설계 근거

Kanban Layout에서 부모-자식 연결선(edge)을 표시하지 않는 이유를 명시한다.

#### 결정

Kanban Layout은 **edge-less board layout**을 기본으로 한다.

#### 근거

* 일반 마인드맵의 edge는 계층 관계를 시각적으로 표현하기 위한 요소이다
* Kanban의 board → column → card 관계는 **공간적 배치**(컬럼 안에 카드가 속함)만으로 충분히 표현된다
* edge를 표시하면 보드 UI가 아닌 트리 다이어그램처럼 보여 사용자 혼란을 유발한다
* 논리적 부모-자식 관계는 `parent_id` 필드로 DB에 유지되므로 렌더링 생략이 데이터 손실을 의미하지 않는다

#### 구현 정책

* `layout_type = 'kanban'`인 경우 edge 렌더링 로직을 건너뛴다
* 필요 시 컬럼 border/카드 소속 배경색으로 관계를 시각적 대체 표현한다
* 드래그 중 drop 대상 컬럼 하이라이트로 관계를 명시한다

---
