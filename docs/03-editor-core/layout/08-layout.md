# 08. Layout
## LAYOUT

* 문서 버전: v1.0
* 작성일: 2026-04-14

---

### 1. 기능 목적

* 마인드맵의 **노드 배치 방식(레이아웃)**을 정의하고 제어하는 핵심 기능
* 15가지 레이아웃 타입을 지원하며, 루트 노드 또는 Subtree 단위로 독립 적용 가능
* 자동 배치(Auto Layout)와 수동 배치(Freeform)를 혼용할 수 있는 구조 제공
* Kanban 보드형 레이아웃은 별도 Depth 제한 정책을 따른다

---

### 2. 기능 범위

* 포함:

  * 15가지 레이아웃 타입 선택 및 전환
  * 루트 레이아웃 / Subtree 레이아웃 독립 적용
  * Auto Layout 엔진에 의한 좌표 자동 계산
  * Freeform 수동 배치 (drag & drop)
  * Auto ↔ Freeform 전환 정책
  * Kanban 보드형 레이아웃 (depth 제한)
  * 레이아웃 전환 시 애니메이션

* 제외:

  * 노드 스타일 (→ NODE_STYLE)
  * 노드 콘텐츠 (→ NODE_CONTENT)
  * 캔버스 뷰포트 (→ CANVAS)
  * 히스토리/Undo (→ HISTORY)

---

### 3. 세부 기능 목록

| 기능ID  | 기능명                | 설명                          | 주요 동작              |
| ----- | ------------------ | --------------------------- | ------------------ |
| LT-01 | 레이아웃 타입 선택         | 15종 레이아웃 선택                 | 툴바 드롭다운            |
| LT-02 | Subtree 레이아웃 override | 특정 노드 이하 독립 레이아웃 지정         | 노드 컨텍스트 메뉴         |
| LT-03 | Auto Layout 엔진     | 좌표 자동 계산 및 렌더링              | 노드 추가/삭제/이동 시 재계산  |
| LT-04 | Freeform 수동 배치     | drag & drop으로 노드 위치 수동 지정   | manualPosition 저장  |
| LT-05 | Auto ↔ Freeform 전환 | 두 모드 간 전환 정책 및 좌표 보존        | layoutType 변경      |
| LT-06 | Kanban 레이아웃        | 보드형 3-depth 구조              | column/card 관리     |
| LT-07 | 레이아웃 전환 애니메이션      | 전환 시 부드러운 위치 이동             | CSS transition      |
| LT-08 | 레이아웃 상속            | 하위 노드가 부모 layoutType 상속     | 노드 생성 시 자동 적용      |
| LT-09 | 루트 노드 레이아웃 결정      | 루트의 layoutType이 전체 기본 레이아웃  | 맵 전체 레이아웃 기준       |
| LT-10 | 레이아웃 간격/방향 설정      | 노드 간격(gap), 방향(direction) 설정 | layout_config JSONB |

---

### 4. 기능 정의 (What)

#### 4.1 LayoutType 목록

```typescript
type LayoutType =
  | 'radial-bidirectional'   // BL-RD-BI  방사형 양쪽 (기본값)
  | 'radial-right'           // BL-RD-R   방사형 오른쪽
  | 'radial-left'            // BL-RD-L   방사형 왼쪽
  | 'tree-up'                // BL-TR-U   트리형 위
  | 'tree-down'              // BL-TR-D   트리형 아래
  | 'tree-right'             // BL-TR-R   트리형 오른쪽
  | 'tree-left'              // BL-TR-L   트리형 왼쪽
  | 'hierarchy-right'        // BL-HR-R   계층형 오른쪽
  | 'hierarchy-left'         // BL-HR-L   계층형 왼쪽
  | 'process-tree-right'     // BL-PR-R   진행트리 오른쪽
  | 'process-tree-left'      // BL-PR-L   진행트리 왼쪽
  | 'process-tree-right-a'   // BL-PR-RA  진행트리 오른쪽A (버블형)
  | 'process-tree-right-b'   // BL-PR-RB  진행트리 오른쪽B (타임라인형)
  | 'freeform'               // BL-FR     자유배치
  | 'kanban';                // BL-KB     Kanban 보드형
```

#### 4.2 LayoutType ↔ BL 코드 매핑표

| BL 코드   | DB 저장값 (layoutType)    | 한국어 명칭             | 기본값 |
| ------- | ---------------------- | ------------------ | --- |
| BL-RD-BI | `radial-bidirectional` | 방사형 양쪽             | ✅   |
| BL-RD-R  | `radial-right`         | 방사형 오른쪽            |     |
| BL-RD-L  | `radial-left`          | 방사형 왼쪽             |     |
| BL-TR-U  | `tree-up`              | 트리형 위              |     |
| BL-TR-D  | `tree-down`            | 트리형 아래             |     |
| BL-TR-R  | `tree-right`           | 트리형 오른쪽            |     |
| BL-TR-L  | `tree-left`            | 트리형 왼쪽             |     |
| BL-HR-R  | `hierarchy-right`      | 계층형 오른쪽            |     |
| BL-HR-L  | `hierarchy-left`       | 계층형 왼쪽             |     |
| BL-PR-R  | `process-tree-right`   | 진행트리 오른쪽           |     |
| BL-PR-L  | `process-tree-left`    | 진행트리 왼쪽            |     |
| BL-PR-RA | `process-tree-right-a` | 진행트리 오른쪽A (버블형)    |     |
| BL-PR-RB | `process-tree-right-b` | 진행트리 오른쪽B (타임라인형)  |     |
| BL-FR    | `freeform`             | 자유배치               |     |
| BL-KB    | `kanban`               | Kanban 보드형         |     |

#### 4.3 NodeObject 레이아웃 관련 필드

```typescript
type NodeObject = {
  id: string;
  parentId: string | null;
  depth: number;

  // 레이아웃 타입 — 이 노드 이하 Subtree 전체의 전개 방식 결정
  layoutType: LayoutType;

  // Freeform 전용 수동 좌표 (auto layout에서는 null)
  manualPosition: { x: number; y: number } | null;

  // 접힘 상태 (자식 노드 숨김 여부)
  collapsed: boolean;

  // 클라이언트 전용 계산 좌표 (DB 저장 안 함)
  computedX?: number;
  computedY?: number;
};
```

#### 4.4 맵 레이아웃 설정 (maps 테이블)

```json
{
  "default_layout_type": "radial-bidirectional",
  "layout_config": {
    "nodeSpacing": 40,
    "levelSpacing": 120,
    "direction": "auto"
  }
}
```

---

### 5. 동작 방식 (How)

#### 5.1 사용자 동작

* 툴바 > 레이아웃 드롭다운에서 15종 중 선택
* 특정 노드 우클릭 > "이 노드부터 레이아웃 변경" → Subtree override
* Freeform 모드에서 노드 drag & drop → 좌표 수동 저장
* 레이아웃 전환 시 노드 위치 애니메이션 재배치

---

#### 5.2 시스템 처리

* 루트 노드의 `layoutType`이 전체 맵의 기본 레이아웃 기준
* 하위 노드에서 다른 `layoutType` 지정 시 해당 Subtree만 독립 적용
* 새 노드 생성 시 별도 override 없으면 **부모 노드의 `layoutType` 상속(복사)**
* 레이아웃 변경 시 Layout Engine이 전체 좌표 재계산 → `computedX/Y` 업데이트
* `freeform`으로 전환 시: 현재 `computedX/Y` → `manualPosition`에 복사 저장
* auto layout으로 전환 시: `manualPosition = null` → Layout Engine 재계산

---

#### 5.3 표시 방식

* Auto Layout: Layout Engine이 계산한 `computedX/Y` 기준으로 렌더링
* Freeform: `manualPosition` 기준으로 렌더링
* 레이아웃 전환 시 CSS transition 애니메이션 적용 (기본 200ms)

---

### 6. 규칙 (Rule)

---

#### 6.1 레이아웃 타입 규칙

* DB `nodes.layout_type` 컬럼은 `NOT NULL`이며 항상 구체적인 값을 저장한다
* 허용 값은 `chk_nodes_layout_type` CHECK 제약으로 관리된다
* 기본값은 `'radial-bidirectional'`이다

---

#### 6.2 상속 규칙

* 새 노드 생성 시 부모 노드의 `layoutType` 값을 복사하여 저장한다
* 명시적 override가 없으면 부모의 레이아웃을 따른다

---

#### 6.3 Subtree override 규칙

* 특정 노드에 다른 `layoutType`을 지정하면 해당 노드 이하 Subtree 전체에 적용된다
* 상위 노드의 레이아웃 변경이 있어도 override된 Subtree는 유지된다

---

#### 6.4 루트 노드 레이아웃 규칙

* 루트 노드의 `layoutType`이 전체 맵의 기본 레이아웃을 결정한다
* 루트 노드의 `layoutType` 변경 시 즉시 전체 relayout이 트리거된다

---

#### 6.5 Freeform 규칙

* `layoutType = 'freeform'`일 때만 `manualPosition`이 유효하다
* auto layout 모드에서는 `manualPosition = null`이어야 한다
* auto layout 중 노드 drag 발생 시: 해당 노드만 `freeform`으로 전환 + `manualPosition` 저장
* 부모 노드의 `layoutType` 변경 시 자식 노드의 `manualPosition`은 유지된다 (수동 좌표 보존)

---

#### 6.6 Kanban 레이아웃 규칙

* `layoutType = 'kanban'`일 경우 depth 의미는 고정된다:

  | depth | 역할     |
  | ----- | ------ |
  | 0     | board  |
  | 1     | column |
  | 2     | card   |
  | 3+    | 허용 안 함 |

* `chk_nodes_kanban_depth` CHECK 제약에 의해 depth는 0~2까지만 허용된다
* Kanban은 일반 Subtree 확장 구조가 아닌 3-depth 제한 보드형 구조로 동작한다
* Kanban 노드는 `KanbanNodeRole` (`'board' | 'column' | 'card'`) metadata를 가질 수 있다

---

#### 6.7 Auto ↔ Freeform 전환 정책

| 상황               | 처리                                                |
| ---------------- | ------------------------------------------------- |
| auto → freeform  | 전환 시점의 `computedX/Y`를 `manualPosition`에 복사하여 저장  |
| freeform → auto  | `manualPosition = null` 초기화, Layout Engine 재계산   |
| auto 중 drag      | 해당 노드만 `freeform`으로 전환 + `manualPosition` 저장     |
| 부모 layoutType 변경 | 자식 노드 `manualPosition` 유지 (수동 지정 좌표 보존)          |

---

#### 6.8 레이아웃 간격 설정 규칙

* `maps.layout_config` JSONB 컬럼에 저장된다
* 기본 간격:

  | 항목           | 기본값  | 설명      |
  | ------------ | ---- | ------- |
  | nodeSpacing  | 40px | 형제 노드 간격 |
  | levelSpacing | 120px | 계층 간격   |

---

#### 6.9 collapsed 규칙

* `collapsed = true`이면 자식 노드는 렌더링하지 않는다
* 루트 노드는 `collapsed` 불가 (비활성화)
* collapsed된 노드는 자식 존재 여부를 indicator로 표시한다

---

### 7. 레이아웃 타입별 특성

#### 7.1 Radial 계열 (방사형)

| 타입                    | 방향            | 특징              |
| --------------------- | ------------- | --------------- |
| `radial-bidirectional` | 루트 중심 양방향     | 기본값, 균형 배치      |
| `radial-right`         | 루트 중심 오른쪽만    | 좌측 여백 활용        |
| `radial-left`          | 루트 중심 왼쪽만     | 우측 여백 활용        |

* 루트 노드를 중심으로 자식 노드가 방사형으로 배치된다
* depth가 깊어질수록 반지름이 증가한다

---

#### 7.2 Tree 계열 (트리형)

| 타입           | 방향   | 특징              |
| ------------ | ---- | --------------- |
| `tree-up`    | 위 방향 | 루트가 아래, 자식이 위   |
| `tree-down`  | 아래 방향 | 루트가 위, 자식이 아래 (일반 트리) |
| `tree-right` | 오른쪽  | 루트가 왼쪽, 자식이 오른쪽 |
| `tree-left`  | 왼쪽   | 루트가 오른쪽, 자식이 왼쪽 |

* 단방향 전개 구조
* 형제 노드는 수직(좌우 방향) 또는 수평(상하 방향) 나열

---

#### 7.3 Hierarchy 계열 (계층형)

| 타입                | 방향    | 특징                |
| ----------------- | ----- | ----------------- |
| `hierarchy-right` | 오른쪽   | 들여쓰기 계층 강조, org-chart 유사 |
| `hierarchy-left`  | 왼쪽    | 들여쓰기 계층 강조        |

* Tree와 유사하나 형제 노드 정렬 방식이 다르다
* 부모-자식 관계를 시각적으로 강조하는 들여쓰기 구조

---

#### 7.4 Process Tree 계열 (진행트리형)

| 타입                      | 방향          | 특징            |
| ----------------------- | ----------- | ------------- |
| `process-tree-right`    | 오른쪽         | 프로세스 흐름 강조    |
| `process-tree-left`     | 왼쪽          | 프로세스 흐름 강조    |
| `process-tree-right-a`  | 오른쪽 (버블형)   | 노드를 버블 형태로 표시 |
| `process-tree-right-b`  | 오른쪽 (타임라인형) | 시간 흐름 강조      |

* 순차적 프로세스, 업무 흐름 표현에 적합
* 노드 간 연결선이 화살표 형태로 표시될 수 있다

---

#### 7.5 Freeform (자유배치)

* 노드 위치를 drag & drop으로 자유롭게 지정
* `manualPosition: { x, y }`에 좌표 저장
* Layout Engine이 개입하지 않음
* 전체 또는 특정 Subtree 단위로 적용 가능

---

#### 7.6 Kanban (칸반 보드형)

```
board (depth 0)
 ├─ column A (depth 1)
 │   ├─ card 1 (depth 2)
 │   └─ card 2 (depth 2)
 └─ column B (depth 1)
     ├─ card 3 (depth 2)
     └─ card 4 (depth 2)
```

* depth 0: 보드 (하나의 맵에 1개)
* depth 1: 칸반 컬럼 (TO DO, IN PROGRESS, DONE 등)
* depth 2: 카드 (업무 항목)
* depth 3 이상: 생성 불가

---

### 8. 예외 / 경계 (Edge Case)

* **Kanban에서 depth 3+ 생성 시도**: DB CHECK 제약에 의해 거부 → 오류 메시지 표시
* **레이아웃 전환 중 노드 추가**: 전환 완료 후 신규 노드 배치 계산
* **Freeform에서 노드 삭제 후 재배치**: 삭제된 노드 좌표는 무관, 나머지 노드 위치 유지
* **Subtree override + 부모 레이아웃 변경**: override된 Subtree의 `layoutType`은 유지
* **매우 많은 노드 (1000+)**: Auto Layout 성능 최적화 필요 (가상화, 지연 계산)
* **루트 노드 collapsed 시도**: 무시 (루트는 collapse 불가)
* **단일 노드 맵 (자식 없음)**: 레이아웃 방향 무관, 루트 노드만 중앙 표시
* **circular 참조**: DB `parent_id` 제약으로 방지

---

### 9. 권한 규칙

| 역할      | 권한                  |
| ------- | ------------------- |
| creator | 전체 (레이아웃 타입 변경, 저장) |
| editor  | 레이아웃 변경 가능          |
| viewer  | 읽기 전용               |

---

### 10. DB 영향

* `nodes.layout_type` — VARCHAR(50) NOT NULL, CHECK 제약 적용
* `nodes.manual_position_x` — FLOAT NULL (freeform 전용)
* `nodes.manual_position_y` — FLOAT NULL (freeform 전용)
* `nodes.collapsed` — BOOLEAN DEFAULT FALSE
* `maps.default_layout_type` — VARCHAR(50) NOT NULL DEFAULT 'radial-bidirectional'
* `maps.layout_config` — JSONB NULL (nodeSpacing, levelSpacing 등)
* `users.default_layout_type` — VARCHAR(50) DEFAULT 'radial-bidirectional' (사용자 기본값)

DB 제약:

```sql
-- 허용된 layoutType 값만 저장
CONSTRAINT chk_nodes_layout_type
  CHECK (layout_type IN (
    'radial-bidirectional','radial-right','radial-left',
    'tree-up','tree-down','tree-right','tree-left',
    'hierarchy-right','hierarchy-left',
    'process-tree-right','process-tree-left',
    'process-tree-right-a','process-tree-right-b',
    'freeform','kanban'
  )),

-- Kanban depth 제한
CONSTRAINT chk_nodes_kanban_depth
  CHECK (layout_type != 'kanban' OR depth BETWEEN 0 AND 2)
```

---

### 11. API 영향

* `PATCH /nodes/{id}/layout` — 특정 노드의 layoutType 변경
* `PATCH /nodes/{id}/position` — freeform 좌표 저장 (manualPosition)
* `PATCH /maps/{id}/layout` — 맵 기본 레이아웃 및 layout_config 변경
* `GET /maps/{id}` — 전체 노드 layoutType 및 manualPosition 포함 반환

---

### 12. 연관 기능

* NODE_CONTENT
* NODE_STYLE
* CANVAS
* HISTORY
* SAVE
* KANBAN (→ kanban 레이아웃 상세)
* WBS (→ wbs 레이아웃 연계)

---

### 13. 예시 시나리오

#### 시나리오 1 — 레이아웃 전체 변경

1. 사용자: 툴바 > 레이아웃 드롭다운 > `tree-down` 선택
2. 시스템: 루트 노드의 `layoutType = 'tree-down'`으로 업데이트
3. Layout Engine: 전체 노드 좌표 재계산
4. 렌더링: 애니메이션으로 노드 위치 이동

#### 시나리오 2 — Subtree override

1. 사용자: 특정 노드 우클릭 > "이 노드부터 레이아웃: hierarchy-right"
2. 시스템: 해당 노드의 `layoutType = 'hierarchy-right'`으로 저장
3. Layout Engine: 해당 Subtree만 `hierarchy-right` 기준으로 재계산
4. 나머지 Subtree: 기존 레이아웃 유지

#### 시나리오 3 — Freeform 전환 후 drag

1. 사용자: `radial-bidirectional` → `freeform` 전환
2. 시스템: 현재 `computedX/Y` → `manualPosition`에 복사
3. 사용자: 노드 drag → 새 위치로 이동
4. 시스템: `manualPosition` 업데이트, autosave

#### 시나리오 4 — Kanban 구성

1. 사용자: 루트 노드 레이아웃 > `kanban` 선택
2. 시스템: 루트 = board (depth 0), 자식 = column (depth 1), 손자 = card (depth 2)
3. 사용자: depth 3 노드 생성 시도
4. 시스템: 거부 (CHECK 제약 위반 오류 표시)

#### 시나리오 5 — auto layout 중 단일 노드 drag

1. 사용자: `tree-right` 모드에서 특정 노드 drag
2. 시스템: 해당 노드만 `layoutType = 'freeform'`으로 전환
3. `manualPosition` 저장
4. 나머지 노드: `tree-right` auto layout 유지

---

### 14. 구현 우선순위

#### MVP

* `radial-bidirectional` Auto Layout 구현
* Freeform drag & drop 및 `manualPosition` 저장
* 레이아웃 타입 전환 (전체 맵)
* Kanban 기본 구현 (3-depth 제한)

#### 2단계

* 나머지 14종 레이아웃 타입 구현
* Subtree override
* 레이아웃 전환 애니메이션
* layout_config (간격/방향) 설정 UI

#### 3단계

* 대용량 노드 성능 최적화 (가상화)
* process-tree-right-a/b 버블형/타임라인형 특수 렌더링
* WBS 연계 레이아웃

---
