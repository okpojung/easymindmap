# easymindmap — Redmine 연동 및 WBS 모드 설계

| 항목 | 내용 |
| --- | --- |
| **최종 업데이트** | 2026-04-04 |
| **배치 위치** | `docs/04-extensions/redmine-integration-plan.md` |
| **관련 기능ID** | WBS-01~10 · SCHED-01~04 · RES-01~05 · RDMN-01~08 |
| **관련 문서** | `docs/02-domain/node-model.md` · `docs/02-domain/db-schema.md` · `docs/02-domain/schema.sql` · `docs/03-editor-core/node-indicator.md` · `docs/01-product/functional-spec.md` |

---

## 목차

1. [개요 및 목표](#1-개요-및-목표)
2. [WBS 모드 아키텍처](#2-wbs-모드-아키텍처)
3. [Node ↔ WBS Activity 데이터 매핑](#3-node--wbs-activity-데이터-매핑)
4. [DB 설계 — 신규 테이블](#4-db-설계--신규-테이블)
5. [NodeObject 타입 확장](#5-nodeobject-타입-확장)
6. [WBS 일정 인디케이터 (NODE-17)](#6-wbs-일정-인디케이터-node-17)
7. [리소스(사람) 할당 설계 (WBS · Kanban 공통)](#7-리소스사람-할당-설계-wbs--kanban-공통)
8. [Redmine 연동 설계](#8-redmine-연동-설계)
9. [양방향 동기화 상세](#9-양방향-동기화-상세)
10. [Redmine Plugin 구성](#10-redmine-plugin-구성)
11. [API 엔드포인트 명세](#11-api-엔드포인트-명세)
12. [인증 및 보안](#12-인증-및-보안)
13. [functional-spec.md 기능 ID 추가 목록](#13-functional-specmd-기능-id-추가-목록)
14. [구현 단계 (Phase 1~3)](#14-구현-단계-phase-13)

---

## 1. 개요 및 목표

### 1-1. 배경

easymindmap의 마인드맵은 계층적 트리 구조이므로 **WBS(Work Breakdown Structure)** 와 구조적으로 동일하다.
하나의 Node = 하나의 WBS Activity(작업 항목)로 1:1 대응되며, 이를 바탕으로 다음 두 가지 시나리오를 지원한다.

- **Standalone WBS 모드**: Redmine 없이 easymindmap 자체에서 일정(시작/종료/마일스톤)과 리소스 할당을 관리
- **Redmine 연동 WBS 모드**: Redmine Issue ↔ easymindmap Node 양방향 동기화, mindmap을 Redmine WBS의 시각 편집 UI로 활용

### 1-2. 설계 원칙

```
1. Node는 WBS Activity이다        — 1:1 대응, ID 연계
2. WBS 모드는 선택적 활성화        — view_mode = 'wbs'로 전환, 기존 mindmap 기능 유지
3. 리소스 할당은 WBS·Kanban 공통   — node_resources 테이블로 통합 관리
4. Redmine은 선택적 연동           — redmine_project_maps row 존재 여부로 자동 판단
5. 동기화는 비동기 큐 기반          — BullMQ Worker, 동기 API 호출 없음
6. Mindmap이 새 노드 생성 시       — Redmine Issue 자동 생성 (auto_create_issues = true)
```

---

## 2. WBS 모드 아키텍처

### 2-1. 모드 분류

```
maps.view_mode
├── 'edit'        → 일반 마인드맵 편집 모드 (기존)
├── 'dashboard'   → Read-only 대시보드 모드 (V3)
├── 'kanban'      → 칸반 보드 모드 (기존)
└── 'wbs'         → WBS 모드 (신규)
      │
      ├── Standalone WBS
      │     redmine_project_maps row 없음
      │     일정/마일스톤/진척률/리소스를 easymindmap 자체에서 관리
      │
      └── Redmine 연동 WBS
            redmine_project_maps row 존재
            위 기능 + Redmine Issue 양방향 동기화
```

### 2-2. WBS 모드 활성화 흐름

```
[맵 생성 또는 설정 변경]
        │
        ▼
maps.view_mode = 'wbs' 설정
        │
        ▼
WBS 인디케이터 UI 활성화
(날짜 배지 · 마일스톤 마커 · 진척률 바 · 리소스 아바타)
        │
        ├── redmine_project_maps row 없음 → Standalone WBS
        │
        └── redmine_project_maps row 존재 → Redmine 연동 WBS
              └── 최초 Pull 동기화 실행 (Redmine Issues → Nodes)
```

### 2-3. WBS 레이아웃 권장 설정

WBS 모드에서는 아래 레이아웃이 특히 어울린다.

| 레이아웃 | 적합 이유 |
| --- | --- |
| `hierarchy-right` | WBS 전통적 계층 분해 구조, 상하 관계가 명확 |
| `tree-down` | 간트 차트 연동 시 상단→하단 흐름으로 직관적 |
| `process-tree-right-b` | 타임라인형, 날짜 흐름 시각화에 적합 |

> 단, 레이아웃 제약은 두지 않는다. 사용자가 방사형으로 WBS를 구성해도 무방하다.

---

## 3. Node ↔ WBS Activity 데이터 매핑

### 3-1. Standalone WBS 매핑

| easymindmap Node 필드 | WBS Activity 개념 |
| --- | --- |
| `text` | Activity 명칭 |
| `note` | Activity 상세 설명 |
| `parentId` | 상위 Activity (WBS 분해 관계) |
| `depth` | WBS 레벨 (0=Root/전체, 1=Phase, 2=Task 등) |
| `node_schedule.start_date` | 시작일 |
| `node_schedule.end_date` | 종료일 (마일스톤은 start_date와 동일) |
| `node_schedule.is_milestone` | 마일스톤 여부 |
| `node_schedule.progress` | 진척률 (0~100%) |
| `node_resources` | 담당자/참여자 할당 |
| `tags` | Activity 분류 레이블 |

### 3-2. Redmine 연동 WBS 매핑

| Redmine Issue 필드 | easymindmap Node 필드 | 동기화 방향 |
| --- | --- | --- |
| `id` (integer) | `redmine_issue_id` | Pull only (Redmine 생성 시) |
| `subject` | `text` | ↔ 양방향 |
| `description` | `note` | ↔ 양방향 |
| `start_date` | `node_schedule.start_date` | ↔ 양방향 |
| `due_date` | `node_schedule.end_date` | ↔ 양방향 |
| `done_ratio` (0~100) | `node_schedule.progress` | ↔ 양방향 |
| `parent_issue_id` | `parent_id` | ↔ 양방향 (트리 구조 동기화) |
| `assigned_to.id` | `node_resources.redmine_user_id` | ↔ 양방향 |
| `tracker.name` | `style_json.fillColor` (tracker별 색상 매핑) | Pull only |
| `status.name` | `node_schedule.progress` 참조 또는 tag | Pull only |

#### Tracker → Node 색상 매핑 예시

```typescript
const TRACKER_COLOR_MAP: Record<string, string> = {
  'Bug':      '#EF4444',  // red
  'Feature':  '#3B82F6',  // blue
  'Task':     '#F59E0B',  // amber
  'Epic':     '#8B5CF6',  // violet
  'Milestone':'#7B2D8B',  // purple
};
```

---

## 4. DB 설계 — 신규 테이블

### 4-1. nodes 테이블 컬럼 추가

기존 `public.nodes` 테이블에 아래 2개 컬럼만 직접 추가한다.
(날짜/진척률/리소스는 별도 테이블로 분리)

```sql
ALTER TABLE public.nodes
  ADD COLUMN redmine_issue_id  INTEGER      DEFAULT NULL,
  ADD COLUMN sync_status       VARCHAR(20)  DEFAULT NULL
    CHECK (sync_status IN ('synced', 'pending', 'error', 'failed'));

-- 인덱스
CREATE INDEX idx_nodes_redmine_issue
  ON public.nodes(redmine_issue_id)
  WHERE redmine_issue_id IS NOT NULL;

CREATE INDEX idx_nodes_sync_status
  ON public.nodes(map_id, sync_status)
  WHERE sync_status IS NOT NULL;
```

### 4-2. node_schedule — 일정/마일스톤/진척률

```sql
-- WBS 일정 정보 (1:1 optional, node_id = PK)
CREATE TABLE public.node_schedule (
  node_id       UUID    PRIMARY KEY REFERENCES public.nodes(id) ON DELETE CASCADE,
  start_date    DATE    DEFAULT NULL,
  end_date      DATE    DEFAULT NULL,
  is_milestone  BOOLEAN NOT NULL DEFAULT FALSE,
  progress      SMALLINT DEFAULT 0
                CHECK (progress BETWEEN 0 AND 100),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- 유효성 제약
  CONSTRAINT chk_wbs_date_order CHECK (
    end_date IS NULL OR start_date IS NULL
    OR end_date >= start_date
  ),
  CONSTRAINT chk_milestone_single_date CHECK (
    NOT is_milestone
    OR (start_date = end_date)
    OR end_date IS NULL
  )
);

CREATE INDEX idx_node_schedule_dates
  ON public.node_schedule(start_date, end_date)
  WHERE start_date IS NOT NULL;
```

**설계 결정 이유 (별도 테이블 분리)**

| 이유 | 설명 |
| --- | --- |
| NULL 컬럼 낭비 없음 | WBS 비활성 노드는 row 자체가 없음 |
| 독립적 마이그레이션 | 날짜 스키마 변경이 nodes 테이블에 영향 없음 |
| 리소스 테이블과 일관성 | node_resources도 별도 테이블 → 설계 패턴 통일 |
| LEFT JOIN 비용 허용 | 노드 로딩 API에서 WBS 정보 포함 JOIN은 1회 |

### 4-3. node_resources — 리소스(사람) 할당 (WBS · Kanban 공통)

```sql
-- 노드에 사람(리소스)을 할당하는 테이블
-- WBS 모드: Activity 담당자 / Kanban 모드: 카드 담당자 공통 사용
CREATE TABLE public.node_resources (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  node_id           UUID        NOT NULL REFERENCES public.nodes(id) ON DELETE CASCADE,

  -- 내부 사용자 (easymindmap 계정)
  user_id           UUID        REFERENCES public.users(id) ON DELETE SET NULL,

  -- 외부 사용자 (Redmine 연동 시)
  redmine_user_id   INTEGER     DEFAULT NULL,   -- Redmine user.id
  redmine_user_name VARCHAR(100) DEFAULT NULL,  -- 캐시 (API 호출 최소화)

  -- 역할
  role              VARCHAR(30) NOT NULL DEFAULT 'assignee',
  -- 'assignee'  : 담당자 (메인 책임자)
  -- 'reviewer'  : 검토자
  -- 'observer'  : 참관자 (알림만)

  -- WBS 전용 (Kanban에서는 NULL 허용)
  allocated_hours   NUMERIC(6,2) DEFAULT NULL,  -- 할당 공수 (시간)

  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- 동일 노드에 동일 사용자를 동일 역할로 중복 할당 불가
  CONSTRAINT uq_node_resource_user
    UNIQUE NULLS NOT DISTINCT (node_id, user_id, role),
  CONSTRAINT uq_node_resource_redmine_user
    UNIQUE NULLS NOT DISTINCT (node_id, redmine_user_id, role),

  -- user_id 또는 redmine_user_id 중 하나는 반드시 있어야 함
  CONSTRAINT chk_resource_identity CHECK (
    user_id IS NOT NULL OR redmine_user_id IS NOT NULL
  )
);

CREATE INDEX idx_node_resources_node_id  ON public.node_resources(node_id);
CREATE INDEX idx_node_resources_user_id  ON public.node_resources(user_id)
  WHERE user_id IS NOT NULL;
```

**적용 범위**

| 모드 | 사용 방식 |
| --- | --- |
| WBS 모드 | Activity 담당자/검토자 할당, `allocated_hours` 입력 가능 |
| Kanban 모드 | 카드(Level 3 노드) 담당자 할당, `allocated_hours` 미사용 (NULL) |
| 일반 mindmap | 선택적 사용 가능 (view_mode 무관) |

### 4-4. redmine_project_maps — 맵 ↔ Redmine 프로젝트 연결

```sql
CREATE TABLE public.redmine_project_maps (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  map_id               UUID        NOT NULL UNIQUE REFERENCES public.maps(id) ON DELETE CASCADE,
  redmine_base_url     VARCHAR(500) NOT NULL,       -- 예: https://redmine.example.com
  redmine_project_id   INTEGER     NOT NULL,         -- Redmine project.id
  redmine_project_identifier VARCHAR(100),           -- Redmine project.identifier (slug)
  api_key_encrypted    VARCHAR(500) NOT NULL,         -- AES-256 암호화 저장 (절대 평문 보관 금지)
  sync_direction       VARCHAR(20) NOT NULL DEFAULT 'bidirectional',
    -- 'pull_only'     : Redmine → Mindmap 단방향
    -- 'push_only'     : Mindmap → Redmine 단방향
    -- 'bidirectional' : 양방향 (기본값)
  auto_create_issues   BOOLEAN     NOT NULL DEFAULT TRUE,
    -- TRUE: 노드 생성 시 Redmine Issue 자동 생성
    -- FALSE: 수동 연결만 허용
  default_tracker_id   INTEGER     DEFAULT NULL,     -- 자동 생성 Issue의 기본 tracker
  default_status_id    INTEGER     DEFAULT NULL,     -- 자동 생성 Issue의 기본 status
  last_synced_at       TIMESTAMPTZ DEFAULT NULL,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### 4-5. redmine_sync_log — 동기화 이력

```sql
CREATE TABLE public.redmine_sync_log (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  map_id            UUID        NOT NULL REFERENCES public.maps(id) ON DELETE CASCADE,
  node_id           UUID        REFERENCES public.nodes(id) ON DELETE SET NULL,
  direction         VARCHAR(10) NOT NULL,   -- 'pull' | 'push'
  action            VARCHAR(20) NOT NULL,   -- 'create' | 'update' | 'delete' | 'full_sync'
  status            VARCHAR(20) NOT NULL,   -- 'success' | 'failed'
  redmine_issue_id  INTEGER     DEFAULT NULL,
  http_status       SMALLINT    DEFAULT NULL,  -- Redmine API 응답 HTTP 코드
  error_detail      TEXT        DEFAULT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_sync_log_map_id
  ON public.redmine_sync_log(map_id, created_at DESC);

CREATE INDEX idx_sync_log_node_id
  ON public.redmine_sync_log(node_id)
  WHERE node_id IS NOT NULL;
```

### 4-6. maps.view_mode 값 추가

```sql
-- 기존: 'edit' | 'dashboard' | 'kanban'
-- 변경: 'wbs' 추가
-- maps 테이블 DDL 코멘트 수정
COMMENT ON COLUMN public.maps.view_mode IS
  '''edit'' | ''dashboard'' | ''kanban'' | ''wbs''
   wbs: WBS 모드. node_schedule·node_resources 인디케이터 활성화.
        redmine_project_maps row 존재 시 Redmine 양방향 동기화 활성화.';
```

### 4-7. ERD 추가 반영

```
public.nodes
  ├── public.node_schedule       (1:0..1 optional, WBS 일정)
  ├── public.node_resources      (1:N, WBS·Kanban 리소스 할당)
  └── (redmine_issue_id → Redmine Issue, 외부 참조)

public.maps
  └── public.redmine_project_maps (1:0..1, Redmine 연동 설정)

public.redmine_sync_log
  ├── → public.maps
  └── → public.nodes
```

---

## 5. NodeObject 타입 확장

`docs/02-domain/node-model.md`의 `NodeObject` 타입에 아래를 추가한다.

```typescript
type NodeObject = {
  // ... 기존 필드 유지 ...

  // === WBS 일정 (node_schedule 테이블 JOIN, WBS 모드에서 사용) ===
  // null = 일정 미설정 노드 (node_schedule row 없음)
  schedule: NodeSchedule | null;

  // === 리소스 할당 (node_resources 테이블 JOIN, WBS·Kanban 공통) ===
  resources: NodeResource[];   // 빈 배열 = 할당 없음

  // === Redmine 연동 ===
  redmineIssueId: number | null;   // null = 비연동
  syncStatus: 'synced' | 'pending' | 'error' | 'failed' | null;
  // null = Redmine 비연동 노드 (Standalone WBS 또는 일반 mindmap)
};

// ─────────────────────────────────────────
// WBS 일정 타입
// ─────────────────────────────────────────
type NodeSchedule = {
  startDate:    string | null;   // YYYY-MM-DD, null = 미설정
  endDate:      string | null;   // YYYY-MM-DD
  isMilestone:  boolean;         // true이면 startDate = endDate 강제
  progress:     number;          // 0~100 (기본값 0)
  updatedAt:    string;          // ISO 8601
};

// ─────────────────────────────────────────
// 리소스 할당 타입 (WBS·Kanban 공통)
// ─────────────────────────────────────────
type NodeResource = {
  id:                 string;            // UUID
  nodeId:             string;
  userId:             string | null;     // easymindmap 내부 사용자
  redmineUserId:      number | null;     // Redmine user.id
  redmineUserName:    string | null;     // 캐시된 이름
  displayName:        string;            // 화면 표시용 이름 (userId or redmineUserName)
  avatarUrl:          string | null;     // 아바타 이미지 URL
  role:               'assignee' | 'reviewer' | 'observer';
  allocatedHours:     number | null;     // WBS 전용, Kanban에서는 null
};
```

---

## 6. WBS 일정 인디케이터 (NODE-17)

`docs/03-editor-core/node-indicator.md`에 **PART 5**로 추가한다.

### 6-1. 기능 ID

| ID | 기능 | 설명 |
| --- | --- | --- |
| NODE-17 | WBS 일정 인디케이터 | WBS 모드 노드의 일정/상태 표시 (SCHED-01~04) |
| SCHED-01 | 날짜 배지 | 시작일~종료일 표시 및 편집 |
| SCHED-02 | 마일스톤 마커 | ◆ 오버레이 및 단일 날짜 표시 |
| SCHED-03 | 진척률 바 | 0~100% 시각화 및 편집 |
| SCHED-04 | 상태 색상 코딩 | 완료/진행중/지연/예정 색상 구분 |

### 6-2. 인디케이터 배치 구조

```
┌──────────────────────────────────────┐
│ ◆  [노드 텍스트]             ⟳/⚠/✕  │
│    (마일스톤 시 ◆ 오버레이)  (sync)  │
├──────────────────────────────────────┤
│ 📅  04/01 ~ 04/30              🟢    │
│ ▓▓▓▓▓░░░░░░  50%                    │
│ 👤 홍길동  👤 김철수                 │
└──────────────────────────────────────┘

마일스톤 노드:
┌──────────────────────────────────────┐
│ ◆  [마일스톤 텍스트]                 │
├──────────────────────────────────────┤
│ 📅  04/30 (단일 날짜)          🟣    │
│ 👤 홍길동                            │
└──────────────────────────────────────┘
```

### 6-3. WBS 상태 판별 로직

```typescript
type WbsStatus = 'done' | 'on-track' | 'delayed' | 'upcoming' | 'no-date';

function getWbsStatus(schedule: NodeSchedule): WbsStatus {
  if (schedule.progress === 100) return 'done';
  if (!schedule.startDate)       return 'no-date';

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const start = parseISO(schedule.startDate);
  const end   = schedule.endDate ? parseISO(schedule.endDate) : null;

  if (start > today)             return 'upcoming';
  if (end && end < today)        return 'delayed';
  return 'on-track';
}

const WBS_STATUS_COLOR: Record<WbsStatus, string> = {
  'done':     '#22C55E',  // green-500  — 완료
  'on-track': '#3B82F6',  // blue-500   — 진행중(정상)
  'delayed':  '#EF4444',  // red-500    — 지연
  'upcoming': '#9CA3AF',  // gray-400   — 예정
  'no-date':  'transparent',            — 날짜 미설정(배지 미표시)
};
```

### 6-4. 날짜 배지 표시 규칙

| 조건 | 표시 형식 | 예시 |
| --- | --- | --- |
| start와 end 모두 있음 | `MM/DD ~ MM/DD` | `04/01 ~ 04/30` |
| start만 있음 | `MM/DD ~` | `04/01 ~` |
| end만 있음 | `~ MM/DD` | `~ 04/30` |
| 마일스톤 (`isMilestone=true`) | `◆ MM/DD` | `◆ 04/30` |
| 모두 null | 배지 미표시 | — |

### 6-5. Redmine sync_status 인디케이터 (연동 시 추가 표시)

| sync_status | 아이콘 | 색상 | 위치 | 의미 |
| --- | --- | --- | --- | --- |
| `synced` | 없음 | — | — | 정상 동기화 |
| `pending` | ⟳ (회전) | `#3B82F6` | 노드 우상단 | Redmine 동기화 진행중 |
| `error` | ⚠ | `#F59E0B` | 노드 우상단 | 동기화 실패, 재시도 대기 |
| `failed` | ✕ | `#EF4444` | 노드 우상단 | 수동 처리 필요 |

### 6-6. 컴포넌트 구조

```
NodeRenderer
  ├── NodeText
  ├── NodeTagBadge
  ├── NodeContentIndicators
  ├── NodeWbsIndicator          ← [NODE-17 신규, WBS 모드에서만 렌더링]
  │    ├── MilestoneMarker      (◆ 배지, isMilestone=true 시)
  │    ├── DateBadge            (📅 날짜 범위, 클릭→DatePicker 팝오버)
  │    ├── ProgressBar          (▓░ 진척률, 클릭→슬라이더 팝오버)
  │    ├── ResourceAvatars      (👤 담당자 아바타, 최대 3개 표시 후 +N)
  │    └── SyncStatusIcon       (⟳/⚠/✕, Redmine 연동 시에만)
  └── NodeAddIndicator
```

### 6-7. 인터랙션

| 요소 | 클릭 동작 |
| --- | --- |
| 날짜 배지 | DatePicker 팝오버 (시작일/종료일 + 마일스톤 토글) |
| 진척률 바 | 0~100 슬라이더 팝오버 |
| 리소스 아바타 | 리소스 할당 패널 오픈 |
| ⚠ 오류 아이콘 | 동기화 오류 상세 + 재시도 버튼 |
| ✕ 실패 아이콘 | 수동 처리 가이드 패널 |

### 6-8. ui_preferences_json 추가 키

```json
{
  "showWbsIndicator": true,
  "showResourceAvatars": true
}
```

---

## 7. 리소스(사람) 할당 설계 (WBS · Kanban 공통)

### 7-1. 기능 ID

| ID | 기능 | 적용 모드 |
| --- | --- | --- |
| RES-01 | 리소스 할당 패널 | WBS · Kanban |
| RES-02 | 담당자 검색/추가 | WBS · Kanban |
| RES-03 | 역할 지정 (담당자/검토자/참관자) | WBS · Kanban |
| RES-04 | 공수(시간) 입력 | WBS 전용 |
| RES-05 | 리소스 아바타 인디케이터 | WBS · Kanban |

### 7-2. 리소스 할당 패널 UX

```
┌─────────────────────────────────────┐
│ 리소스 할당                          │
├─────────────────────────────────────┤
│ 🔍 담당자 검색...                   │
├─────────────────────────────────────┤
│ 현재 할당                           │
│  👤 홍길동   [담당자 ▾]  [8h]  [×]  │
│  👤 김철수   [검토자 ▾]  [ — ]  [×] │
├─────────────────────────────────────┤
│          [+ 담당자 추가]             │
└─────────────────────────────────────┘
```

- 역할 드롭다운: `담당자 / 검토자 / 참관자`
- 공수 입력: WBS 모드에서만 표시 (Kanban에서는 숨김)
- 검색 대상: easymindmap 내부 사용자 + Redmine 연동 시 Redmine 사용자 목록도 포함

### 7-3. 리소스 아바타 표시 규칙

```
할당된 사람 수  표시
─────────────  ─────────────────────────────
0명            아바타 없음
1명            👤 아바타 1개
2명            👤👤 아바타 2개
3명            👤👤👤 아바타 3개
4명 이상       👤👤 +2  (최대 2개 표시 후 나머지 숫자)
```

- 아바타는 사용자 프로필 이미지 또는 이니셜 원형 배지
- hover 시 이름+역할 tooltip 표시

### 7-4. Kanban 모드에서의 리소스 할당

Kanban 카드(depth=2 노드)에서 리소스 할당 시:
- `allocated_hours`는 입력 UI 미표시 (null 저장)
- 카드 우하단에 아바타 표시
- 리소스 필터: 특정 담당자의 카드만 표시하는 필터 기능 연동 (`RES-05`)

---

## 8. Redmine 연동 설계

### 8-1. 연동 전제 조건

- Redmine 버전: **4.0 이상** (REST API 지원)
- Redmine REST API 활성화 필요: `관리 → 설정 → API → REST API 활성화`
- API Key: Redmine 사용자 프로필에서 발급

### 8-2. 연동 설정 흐름

```
[맵 설정 화면 → Redmine 연동 탭]
        │
        ▼
① Redmine Base URL 입력
   예: https://redmine.example.com
        │
        ▼
② Redmine API Key 입력 (AES-256 암호화 후 DB 저장)
        │
        ▼
③ 프로젝트 목록 조회 (GET /projects.json)
   → 드롭다운으로 프로젝트 선택
        │
        ▼
④ 동기화 방향 선택
   [ ● 양방향 ] [ ○ Redmine→Mindmap ] [ ○ Mindmap→Redmine ]
        │
        ▼
⑤ 자동 Issue 생성 토글
   [✅ 노드 생성 시 Redmine Issue 자동 생성]
        │
        ▼
⑥ 기본 Tracker/Status 선택 (자동 생성 시 사용)
        │
        ▼
⑦ [연동 시작] → 최초 Pull 동기화 실행
   Redmine Issues → Nodes 일괄 가져오기
```

### 8-3. Issue ↔ Node 트리 구조 동기화

Redmine Issue는 `parent_id`를 지원하므로 트리 구조를 그대로 매핑한다.

```
Redmine                      easymindmap
────────                     ────────────
Project (root)            →  Root Node (맵 제목 = Project.name)
  Issue #1                →  depth-1 Node
    Issue #2 (sub)        →  depth-2 Node
      Issue #3 (sub-sub)  →  depth-3 Node
  Issue #4                →  depth-1 Node
```

**트리 동기화 알고리즘 (Pull)**:
1. `GET /projects/:id/issues?limit=100&offset=0` (페이징 처리)
2. `parent_id` 기준으로 트리 재구성 (topological sort)
3. 기존 `redmine_issue_id`가 있는 node는 UPDATE, 없으면 INSERT
4. Redmine에서 삭제된 Issue는 node를 soft-delete (collapsed=true) 처리

---

## 9. 양방향 동기화 상세

### 9-1. sync_status 상태 머신

```
          [노드 생성/수정 이벤트]
                   │
           sync_status = 'pending'
                   │
            BullMQ 큐 투입
                   │
            Worker 처리 시작
           ┌───────┴───────┐
        성공│               │실패
           ▼               ▼
       'synced'         'error'
                           │
                      자동 재시도 (최대 3회, 지수 백오프)
                           │
                    3회 모두 실패
                           ▼
                        'failed'
                    (수동 처리 필요, ✕ 아이콘 표시)
```

### 9-2. Push — 노드 생성 시 Redmine Issue 자동 생성

```
[사용자: 새 노드 생성 (텍스트 확정)]
        │
        ▼
nodes INSERT
  redmine_issue_id = NULL
  sync_status = 'pending'
        │
        ▼
BullMQ → redmine-sync-queue
  { action: 'create', nodeId, mapId }
        │
        ▼
Worker: POST /issues.json to Redmine
  {
    issue: {
      project_id: redmine_project_id,
      subject:    node.text,
      parent_issue_id: parentNode.redmine_issue_id,
      tracker_id: default_tracker_id,
      start_date: node_schedule.start_date,
      due_date:   node_schedule.end_date,
    }
  }
        │
   ┌────┴────┐
 성공│         │실패
   ▼         ▼
node UPDATE  node UPDATE
  issue_id   sync_status = 'error'
  = 반환된 ID  error 로그 기록
  sync_status UI: ⚠ 표시
  = 'synced'
```

**주의사항**: `auto_create_issues = false`이면 노드 생성 시 Redmine Issue를 생성하지 않는다.
수동으로 "Redmine에 Issue 생성" 버튼을 통해 연결할 수 있다.

### 9-3. Push — 노드 수정

```
트리거: node.text, note, node_schedule.*, node_resources.* 변경

PATCH /issues/:redmine_issue_id.json
{
  issue: {
    subject:       node.text,
    notes:         node.note,
    start_date:    node_schedule.start_date,
    due_date:      node_schedule.end_date,
    done_ratio:    node_schedule.progress,
    assigned_to_id: primaryAssignee.redmine_user_id,
  }
}
```

### 9-4. Push — 노드 삭제

```
트리거: node 삭제

DELETE /issues/:redmine_issue_id.json
→ 성공: node 삭제 진행
→ 실패: node 삭제 보류, 오류 표시 (Redmine 수동 삭제 안내)
```

**설계 정책**: Redmine Issue 삭제 실패 시에도 mindmap에서 노드는 삭제한다.
`redmine_sync_log`에 孤立 Issue 기록하여 관리자가 수동 처리.

### 9-5. Pull — Redmine → Mindmap

**트리거**: 수동 Refresh 버튼 또는 주기적 백그라운드 동기화 (선택 설정)

```
GET /projects/:id/issues.json?limit=100
        │
        ▼
변경 감지 (updated_on 비교)
        │
   ┌────┴────┐
신규│         │변경│         │삭제
   ▼         ▼              ▼
 INSERT    UPDATE          node.collapsed = true
 node      text/note/date  (soft-delete)
           progress
```

### 9-6. 충돌 처리 정책

| 상황 | 처리 방식 |
| --- | --- |
| Mindmap 수정 후 Pull 실행 | **Mindmap 우선** (last-write-wins, mindmap이 더 최신) |
| Pull 중 Redmine이 더 최신 | `updated_on` 타임스탬프 비교 후 최신 값 사용 |
| 양쪽 동시 수정 | Redmine `updated_on` > node `updated_at` 이면 Redmine 값 사용, 사용자에게 알림 |

---

## 10. Redmine Plugin 구성

### 10-1. Plugin 디렉토리 구조

```
redmine/plugins/easymindmap_wbs/
├── init.rb                    # Plugin 메타 정보 등록
├── app/
│   ├── controllers/
│   │   └── easymindmap_wbs_controller.rb   # WBS 편집 화면
│   └── views/
│       └── easymindmap_wbs/
│           └── index.html.erb              # iframe 임베드 뷰
├── config/
│   └── routes.rb              # /projects/:id/wbs_map 라우트
└── assets/
    └── javascripts/
        └── easymindmap_bridge.js           # 부모↔iframe 메시지 브릿지
```

### 10-2. Redmine 화면 통합

Redmine 프로젝트 탭에 **"WBS 맵"** 탭 추가:

```
[Redmine 프로젝트]
  탭: 개요 | 활동 | 일감 | WBS 맵 ← [신규 탭]

[WBS 맵 탭 내용]
  ┌──────────────────────────────────────────┐
  │  easymindmap WBS Editor                  │
  │  ┌────────────────────────────────────┐  │
  │  │         (iframe 임베드)            │  │
  │  │   easymindmap 편집기 로드           │  │
  │  │   (WBS 모드, Redmine 연동 활성화)   │  │
  │  └────────────────────────────────────┘  │
  └──────────────────────────────────────────┘
```

### 10-3. 인증 토큰 교환

```
[Redmine 세션 (로그인 중)]
        │
        ▼
easymindmap_wbs_controller
  → Redmine API Key 조회 (현재 사용자)
  → POST /api/redmine/auth/token-exchange
      { redmine_base_url, api_key, project_id }
        │
        ▼
NestJS Backend
  → Redmine API Key 검증 (GET /users/current.json)
  → 단기 JWT 발급 (만료: 8시간)
        │
        ▼
iframe URL에 JWT 포함하여 로드
  https://mindmap.ai.kr/embed/wbs?token=<JWT>&map_id=<UUID>
```

---

## 11. API 엔드포인트 명세

### 11-1. WBS 모드 전환

```
PATCH /api/maps/:map_id
Body: { "view_mode": "wbs" }
→ maps.view_mode = 'wbs' 설정
```

### 11-2. node_schedule CRUD

```
GET    /api/nodes/:node_id/schedule
POST   /api/nodes/:node_id/schedule
Body:  { startDate, endDate, isMilestone, progress }

PATCH  /api/nodes/:node_id/schedule
Body:  Partial<NodeSchedule>

DELETE /api/nodes/:node_id/schedule
→ node_schedule row 삭제 (일정 초기화)
```

### 11-3. node_resources CRUD

```
GET    /api/nodes/:node_id/resources
→ 해당 노드의 전체 리소스 목록 반환

POST   /api/nodes/:node_id/resources
Body:  { userId?, redmineUserId?, role, allocatedHours? }

PATCH  /api/nodes/:node_id/resources/:resource_id
Body:  { role?, allocatedHours? }

DELETE /api/nodes/:node_id/resources/:resource_id
```

### 11-4. Redmine 연동 설정

```
GET    /api/maps/:map_id/redmine-integration
→ redmine_project_maps row 반환 (api_key는 마스킹)

POST   /api/maps/:map_id/redmine-integration
Body:  { redmineBaseUrl, redmineProjectId, apiKey, syncDirection, autoCreateIssues, defaultTrackerId }

PATCH  /api/maps/:map_id/redmine-integration
Body:  Partial<위 필드>

DELETE /api/maps/:map_id/redmine-integration
→ Redmine 연동 해제 (redmine_project_maps row 삭제)
```

### 11-5. 동기화 트리거

```
POST /api/maps/:map_id/redmine-integration/sync
Body: { direction: 'pull' | 'push' | 'full' }
→ BullMQ에 full_sync Job 투입
→ 202 Accepted 즉시 반환

GET  /api/maps/:map_id/redmine-integration/sync/status
→ 최근 동기화 상태 및 로그 반환
```

### 11-6. Redmine Plugin 전용 (인증 교환)

```
POST /api/redmine/auth/token-exchange
Body: { redmineBaseUrl, apiKey, projectId }
→ Redmine API Key 검증 후 단기 JWT 반환
→ 200 OK: { token, expiresAt, mapId }
→ 401: Redmine API Key 검증 실패
```

---

## 12. 인증 및 보안

### 12-1. API Key 보안

```
저장 방식: AES-256-GCM 암호화
암호화 키: 환경변수 REDMINE_ENCRYPTION_KEY (256-bit)
저장 위치: redmine_project_maps.api_key_encrypted
복호화:    NestJS Backend에서만 수행, 클라이언트에 절대 노출 금지
마스킹:    GET 응답 시 '*****' 처리
```

### 12-2. RLS 정책 추가

```sql
-- node_schedule
ALTER TABLE public.node_schedule ENABLE ROW LEVEL SECURITY;
CREATE POLICY "map owners manage node_schedule"
  ON public.node_schedule FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.nodes n
      JOIN public.maps m ON m.id = n.map_id
      WHERE n.id = node_schedule.node_id
        AND m.owner_id = auth.uid()
    )
  );

-- node_resources
ALTER TABLE public.node_resources ENABLE ROW LEVEL SECURITY;
CREATE POLICY "map owners manage node_resources"
  ON public.node_resources FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.nodes n
      JOIN public.maps m ON m.id = n.map_id
      WHERE n.id = node_resources.node_id
        AND m.owner_id = auth.uid()
    )
  );

-- redmine_project_maps
ALTER TABLE public.redmine_project_maps ENABLE ROW LEVEL SECURITY;
CREATE POLICY "map owners manage redmine_project_maps"
  ON public.redmine_project_maps FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.maps
      WHERE maps.id = redmine_project_maps.map_id
        AND maps.owner_id = auth.uid()
    )
  );

-- redmine_sync_log (읽기 전용)
ALTER TABLE public.redmine_sync_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "map owners read sync_log"
  ON public.redmine_sync_log FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.maps
      WHERE maps.id = redmine_sync_log.map_id
        AND maps.owner_id = auth.uid()
    )
  );
```

---

## 13. functional-spec.md 기능 ID 추가 목록

`docs/01-product/functional-spec.md`에 아래 기능 그룹을 추가한다.

### 신규 섹션: 15. WBS — WBS 모드

| 기능ID | 기능명 | 설명 | 적용 단계 |
| --- | --- | --- | --- |
| WBS-01 | WBS 모드 전환 | 맵을 WBS 모드로 전환 (`view_mode = 'wbs'`) | V1 |
| WBS-02 | 일정 설정 (시작/종료일) | 노드에 시작일/종료일 설정 | V1 |
| WBS-03 | 마일스톤 설정 | 노드를 마일스톤으로 지정 (단일 날짜) | V1 |
| WBS-04 | 진척률 설정 | 0~100% 진척률 입력 | V1 |
| WBS-05 | WBS 일정 인디케이터 | 날짜 배지/마일스톤 마커/진척률 바/상태 색상 표시 | V1 |

### 신규 섹션: 16. RESOURCE — 리소스 할당 (WBS · Kanban 공통)

| 기능ID | 기능명 | 설명 | 적용 단계 |
| --- | --- | --- | --- |
| RES-01 | 리소스 할당 패널 | 노드에 사람 할당 UI (WBS·Kanban 공통) | V1 |
| RES-02 | 담당자 검색/추가 | 내부 사용자 및 Redmine 사용자 검색 | V1 |
| RES-03 | 역할 지정 | 담당자/검토자/참관자 역할 지정 | V1 |
| RES-04 | 공수 입력 | 할당 시간(h) 입력 (WBS 전용) | V1 |
| RES-05 | 리소스 아바타 인디케이터 | 노드에 담당자 아바타 표시 (WBS·Kanban 공통) | V1 |

### 신규 섹션: 17. RDMN — Redmine 연동

| 기능ID | 기능명 | 설명 | 적용 단계 |
| --- | --- | --- | --- |
| RDMN-01 | Redmine 연동 설정 | URL/API Key/프로젝트 설정 | V1 |
| RDMN-02 | Pull 동기화 | Redmine Issues → Mindmap Nodes | V1 |
| RDMN-03 | Push 동기화 | Mindmap Nodes → Redmine Issues | V1 |
| RDMN-04 | 노드 생성 시 Issue 자동 생성 | 노드 추가 → Redmine Issue 자동 생성 (비동기) | V1 |
| RDMN-05 | 노드 수정 시 Issue 업데이트 | 텍스트/일정/담당자 변경 → Issue PATCH | V1 |
| RDMN-06 | 노드 삭제 시 Issue 삭제 | 노드 삭제 → Redmine Issue DELETE | V1 |
| RDMN-07 | 동기화 상태 인디케이터 | ⟳/⚠/✕ 아이콘으로 sync_status 표시 | V1 |
| RDMN-08 | Redmine Plugin 탭 | Redmine 프로젝트 내 WBS 맵 탭 임베드 | V1 |

---

## 14. 구현 단계 (Phase 1~3)

### Phase 1: WBS Standalone (Redmine 없이)

**목표**: WBS 모드 자체 기능 완성

1. `maps.view_mode = 'wbs'` 지원 및 모드 전환 UI
2. `node_schedule` 테이블 + API (`GET/POST/PATCH/DELETE /nodes/:id/schedule`)
3. `NodeWbsIndicator` 컴포넌트 (날짜 배지/마일스톤/진척률 바/상태 색상)
4. `node_resources` 테이블 + API
5. 리소스 할당 패널 UI (WBS · Kanban 공통)
6. 리소스 아바타 인디케이터 (WBS · Kanban 공통)

### Phase 2: Redmine 연동 기본

**목표**: Redmine Issue ↔ Node 동기화

1. `redmine_project_maps` 테이블 + 연동 설정 UI
2. API Key 암호화 저장 (AES-256)
3. Pull 동기화: Redmine Issues → Nodes 일괄 가져오기
4. Push 동기화: 노드 수정 → Redmine Issue PATCH (BullMQ Worker)
5. `redmine_sync_log` 기록 + 동기화 상태 조회 API
6. `sync_status` 인디케이터 (⟳/⚠/✕) UI

### Phase 3: Redmine Plugin + 자동 Issue 생성

**목표**: Redmine과 seamless 통합

1. 노드 생성 시 Redmine Issue 자동 생성 (`auto_create_issues = true`)
2. Redmine Plugin (`easymindmap_wbs`) 개발
3. 인증 토큰 교환 API (`/api/redmine/auth/token-exchange`)
4. iframe 임베드 + 부모↔iframe 메시지 브릿지
5. Redmine 사용자 목록 조회 연동 (리소스 할당 시 사용)
6. 트리 구조 양방향 동기화 (parent_issue_id ↔ parent_id)
