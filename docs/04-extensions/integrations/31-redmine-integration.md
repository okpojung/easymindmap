# 31. Redmine Integration
## REDMINE_INTEGRATION

* 문서 버전: v1.0
* 작성일: 2026-04-16
* 참조: `docs/01-product/functional-spec.md § RDMN`, `docs/04-extensions/redmine-integration-plan.md`, `docs/02-domain/db-schema.md § redmine_project_maps`

---

### 1. 기능 목적

* easymindmap WBS 맵과 **Redmine 프로젝트 이슈를 양방향 동기화**하는 기능
* 노드 생성/수정/삭제 → Redmine 이슈 자동 반영
* Redmine 이슈 변경 → 맵 노드 자동 업데이트
* Redmine 플러그인 탭으로 Redmine 내에서 WBS 맵 직접 접근

---

### 2. 기능 범위

* 포함:
  * Redmine 연동 설정 (RDMN-01)
  * Pull 동기화 (RDMN-02): Redmine Issues → 맵 노드
  * Push 동기화 (RDMN-03): 맵 노드 → Redmine Issues
  * 노드 생성 시 Issue 자동 생성 (RDMN-04)
  * 노드 수정 시 Issue 업데이트 (RDMN-05)
  * 노드 삭제 시 Issue 삭제 (RDMN-06)
  * 동기화 상태 인디케이터 (RDMN-07)
  * Redmine Plugin 탭 임베드 (RDMN-08)

* 제외:
  * Redmine Wiki 동기화 (후순위)
  * Redmine Time Entry 동기화 (후순위)

---

### 3. 세부 기능 목록

| 기능ID     | 기능명                 | 설명                                     | 주요 동작          |
| -------- | ------------------- | --------------------------------------- | -------------- |
| RDMN-01  | Redmine 연동 설정       | URL/API Key/프로젝트 ID 설정                  | 설정 UI + 암호화 저장  |
| RDMN-02  | Pull 동기화            | Redmine Issues → 맵 노드 일괄 가져오기           | 수동/자동 Pull     |
| RDMN-03  | Push 동기화            | 맵 노드 → Redmine Issues 일괄 반영             | 수동/자동 Push     |
| RDMN-04  | 노드 생성 → Issue 생성   | 노드 추가 시 Redmine Issue 자동 생성 (비동기)       | BullMQ Job     |
| RDMN-05  | 노드 수정 → Issue 업데이트 | 텍스트/일정/담당자 변경 → Issue PATCH             | BullMQ Job     |
| RDMN-06  | 노드 삭제 → Issue 삭제   | 노드 삭제 → Redmine Issue DELETE             | BullMQ Job     |
| RDMN-07  | 동기화 상태 인디케이터       | ⟳/⚠/✕ 아이콘으로 sync_status 표시             | 노드 인디케이터       |
| RDMN-08  | Redmine Plugin 탭    | Redmine 프로젝트 내 WBS 맵 탭 임베드              | iframe 임베드     |

---

### 4. 기능 정의 (What)

#### 4.1 redmine_project_maps 테이블

```sql
CREATE TABLE public.redmine_project_maps (
  id                         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  map_id                     UUID        NOT NULL UNIQUE REFERENCES public.maps(id) ON DELETE CASCADE,
  redmine_base_url           VARCHAR(500) NOT NULL,    -- 예: https://redmine.example.com
  redmine_project_id         INTEGER     NOT NULL,     -- Redmine project.id
  redmine_api_key_encrypted  TEXT        NOT NULL,     -- AES-256 암호화 저장
  sync_mode                  VARCHAR(20) NOT NULL DEFAULT 'manual',
  -- 'manual': 수동 동기화
  -- 'auto': 노드 변경 시 자동 동기화
  last_synced_at             TIMESTAMPTZ,
  created_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

#### 4.2 nodes 동기화 컬럼

```sql
-- nodes 테이블 Redmine 연동 컬럼
redmine_issue_id INTEGER      DEFAULT NULL,   -- Redmine issue.id
sync_status      VARCHAR(20)  DEFAULT NULL
  CHECK (sync_status IN ('synced', 'pending', 'error', 'failed'))
```

#### 4.3 redmine_sync_log 테이블

```sql
CREATE TABLE public.redmine_sync_log (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  map_id        UUID NOT NULL REFERENCES public.maps(id) ON DELETE CASCADE,
  node_id       UUID REFERENCES public.nodes(id) ON DELETE SET NULL,
  action        VARCHAR(20) NOT NULL,  -- 'create' | 'update' | 'delete' | 'pull'
  redmine_issue_id INTEGER,
  status        VARCHAR(20) NOT NULL,  -- 'success' | 'error'
  error_message TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

#### 4.4 동기화 상태 인디케이터

| sync_status | 아이콘 | 설명           |
| ----------- | ---- | ------------ |
| synced      | ✓    | 동기화 완료       |
| pending     | ⟳    | 동기화 대기 중     |
| error       | ⚠    | 동기화 오류 (재시도 중) |
| failed      | ✕    | 최종 실패        |
| NULL        | -    | Redmine 연동 안 됨 |

#### 4.5 노드 ↔ Redmine Issue 필드 매핑

| 맵 노드 필드              | Redmine Issue 필드    |
| --------------------- | ------------------- |
| `node.text`           | `issue.subject`     |
| `node_schedule.start_date` | `issue.start_date` |
| `node_schedule.end_date`   | `issue.due_date`   |
| `node_schedule.progress`   | `issue.done_ratio` |
| `node_resources` (assignee) | `issue.assigned_to` |
| `node.note`           | `issue.description` |

---

### 5. 동작 방식 (How)

#### 5.1 사용자 동작

* 맵 Settings > `Redmine 연동` > URL/API Key/프로젝트 ID 입력
* `[연결 테스트]` → Redmine API 응답 확인
* `[Pull]` → Redmine Issues → 맵 노드로 일괄 가져오기
* `[Push]` → 맵 노드 → Redmine Issues 반영
* 노드 우클릭 > `Redmine 이슈 열기` → Redmine 이슈 페이지로 이동

#### 5.2 노드 생성 → Issue 자동 생성 흐름 (RDMN-04)

```
사용자 노드 생성
    │
    ▼
nodes INSERT (redmine_issue_id = NULL, sync_status = 'pending')
    │
    ▼
BullMQ Job enqueue: CreateRedmineIssueJob
  { nodeId, mapId }
    │
    ▼
Worker: POST {redmine_base_url}/issues.json
  { issue: { project_id, subject, ... } }
    │
    ▼
성공: nodes.redmine_issue_id = issueId, sync_status = 'synced'
실패: sync_status = 'error' → 재시도 (Exponential Backoff, 최대 3회)
최종 실패: sync_status = 'failed' + redmine_sync_log INSERT
```

#### 5.3 Pull 동기화 흐름 (RDMN-02)

```
POST /maps/{mapId}/redmine/sync { direction: 'pull' }
    │
    ▼
GET {redmine_base_url}/projects/{projectId}/issues.json
  (limit 100, offset 0, ...)
    │
    ▼
각 이슈 처리:
  - redmine_issue_id 기준 노드 조회
  - 존재 → UPDATE (텍스트/일정/담당자)
  - 미존재 → INSERT (신규 노드 생성)
    │
    ▼
sync_status = 'synced', last_synced_at 갱신
```

---

### 6. 규칙 (Rule)

* API Key: AES-256 암호화 저장 (`redmine_api_key_encrypted`)
* BullMQ Job 재시도: 최대 3회, Exponential Backoff (1s, 2s, 4s)
* 최종 실패: `sync_status = 'failed'`, `redmine_sync_log` 기록
* Pull 동기화: 최대 200개 이슈/1회 (페이지네이션)
* Redmine Plugin 탭 임베드: `<iframe src="https://easymindmap.com/embed/map/{mapId}" />`

---

### 7. 예외 / 경계 (Edge Case)

* **Redmine 서버 접근 불가**: `sync_status = 'error'` + 인디케이터 ⚠ 표시
* **API Key 만료/오류**: 401 → 연동 설정 화면으로 안내
* **Redmine Issue 삭제 후 Pull**: 노드에서 `redmine_issue_id = NULL` 처리
* **네트워크 오류 중 Push**: BullMQ 큐에 저장 → 복구 후 재시도

---

### 8. 권한 규칙

| 역할      | Redmine 연동 설정 | Push/Pull | 인디케이터 조회 |
| ------- | ------------- | --------- | --------- |
| creator | ✅             | ✅         | ✅         |
| editor  | ❌             | ✅         | ✅         |
| viewer  | ❌             | ❌         | ✅         |

---

### 9. DB 영향

* `redmine_project_maps` — 연동 설정
* `nodes.redmine_issue_id`, `nodes.sync_status` — 동기화 상태
* `redmine_sync_log` — 동기화 이력

---

### 10. API 영향

* `POST /maps/{mapId}/redmine/connect` — 연동 설정
* `POST /maps/{mapId}/redmine/sync` — 수동 Push/Pull
* `GET /maps/{mapId}/redmine/status` — 연동 상태 조회
* `GET /maps/{mapId}/redmine/logs` — 동기화 이력 조회

---

### 11. 연관 기능

* WBS (`28-wbs.md`)
* RESOURCE (`29-resource.md`)
* SAVE (`docs/03-editor-core/save/14-save.md`)

---

### 12. 구현 우선순위

#### MVP (V1)
* RDMN-01 연동 설정 + AES-256 암호화
* RDMN-02 Pull 동기화
* RDMN-03 Push 동기화
* RDMN-04~06 노드 변경 → Issue 자동 반영 (BullMQ)
* RDMN-07 동기화 상태 인디케이터

#### 2단계 (V1)
* RDMN-08 Redmine Plugin 탭 임베드
* 자동 동기화 모드 (`sync_mode = 'auto'`)

---

### 13. Tracker → Node 색상 매핑

Redmine Issue의 tracker 유형에 따라 노드 배경색을 자동으로 지정한다 (Pull 전용).

```typescript
const TRACKER_COLOR_MAP: Record<string, string> = {
  'Bug':       '#EF4444',  // red-500
  'Feature':   '#3B82F6',  // blue-500
  'Task':      '#F59E0B',  // amber-500
  'Epic':      '#8B5CF6',  // violet-500
  'Milestone': '#7B2D8B',  // purple-700
};
```

* 매핑되지 않는 tracker는 기본 노드 색상 유지
* 색상 값은 `style_json.fillColor` 컬럼에 저장 (Pull only, 사용자가 덮어쓰기 가능)

---

### 14. WBS 상태 판별 로직 (getWbsStatus)

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
  'done':     '#22C55E',   // green-500  — 완료
  'on-track': '#3B82F6',   // blue-500   — 진행중(정상)
  'delayed':  '#EF4444',   // red-500    — 지연
  'upcoming': '#9CA3AF',   // gray-400   — 예정
  'no-date':  'transparent',             // 날짜 미설정(배지 미표시)
};
```

---

### 15. NodeWbsIndicator 컴포넌트 계층

WBS 모드에서 노드에 일정·진척·리소스·동기화 상태를 표시하는 컴포넌트 구조:

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

#### 인디케이터 배치 예시

```
┌──────────────────────────────────────┐
│ ◆  [노드 텍스트]             ⟳/⚠/✕  │
│    (마일스톤 시 ◆ 오버레이)  (sync)  │
├──────────────────────────────────────┤
│ 📅  04/01 ~ 04/30              🟢    │
│ ▓▓▓▓▓░░░░░░  50%                    │
│ 👤 홍길동  👤 김철수                 │
└──────────────────────────────────────┘
```

#### 요소별 인터랙션

| 요소 | 클릭 동작 |
| --- | --- |
| 날짜 배지 | DatePicker 팝오버 (시작일/종료일 + 마일스톤 토글) |
| 진척률 바 | 0~100 슬라이더 팝오버 |
| 리소스 아바타 | 리소스 할당 패널 오픈 |
| ⚠ 오류 아이콘 | 동기화 오류 상세 + 재시도 버튼 |
| ✕ 실패 아이콘 | 수동 처리 가이드 패널 |

---

### 16. API Key 암호화 — AES-256-GCM

```
저장 방식: AES-256-GCM 암호화 (인증 암호화 모드)
암호화 키: 환경변수 REDMINE_ENCRYPTION_KEY (256-bit)
저장 위치: redmine_project_maps.api_key_encrypted
복호화:    NestJS Backend에서만 수행, 클라이언트에 절대 노출 금지
마스킹:    GET 응답 시 '*****' 처리
```

> GCM 모드를 사용하므로 복호화 시 무결성 검증(인증 태그)이 자동으로 수행된다.  
> 저장 형식: `base64(iv) + '.' + base64(authTag) + '.' + base64(ciphertext)`

---

### 17. RLS 정책

신규 테이블 전체에 Row Level Security를 적용한다.

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

### 18. 동기화 상태 머신 (sync_status)

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
                      자동 재시도 (최대 3회, 지수 백오프: 1s → 2s → 4s)
                           │
                    3회 모두 실패
                           ▼
                        'failed'
                    (수동 처리 필요, ✕ 아이콘 표시)
```

* `pending` → Worker가 Redmine API 호출 시작
* `error` → 일시적 실패, 자동 재시도 대기 (⚠ 아이콘)
* `failed` → 최종 실패, 수동 처리 필요 (✕ 아이콘)
* `synced` → 정상 동기화 완료 (아이콘 없음)

---

### 19. 구현 단계 (Phase 1~3 상세)

#### Phase 1: WBS Standalone (Redmine 없이)

**목표**: WBS 모드 자체 기능 완성

1. `maps.view_mode = 'wbs'` 지원 및 모드 전환 UI
2. `node_schedule` 테이블 + API (`GET/POST/PATCH/DELETE /nodes/:id/schedule`)
3. `NodeWbsIndicator` 컴포넌트 (날짜 배지/마일스톤/진척률 바/상태 색상)
4. `node_resources` 테이블 + API
5. 리소스 할당 패널 UI (WBS · Kanban 공통)
6. 리소스 아바타 인디케이터 (WBS · Kanban 공통)

#### Phase 2: Redmine 연동 기본 (Basic)

**목표**: Redmine Issue ↔ Node 동기화

1. `redmine_project_maps` 테이블 + 연동 설정 UI
2. API Key AES-256-GCM 암호화 저장
3. Pull 동기화: Redmine Issues → Nodes 일괄 가져오기
4. Push 동기화: 노드 수정 → Redmine Issue PATCH (BullMQ Worker)
5. `redmine_sync_log` 기록 + 동기화 상태 조회 API
6. `sync_status` 인디케이터 (⟳/⚠/✕) UI

#### Phase 3: Redmine Plugin + 자동 Issue 생성

**목표**: Redmine과 seamless 통합

1. 노드 생성 시 Redmine Issue 자동 생성 (`auto_create_issues = true`)
2. Redmine Plugin (`easymindmap_wbs`) 개발
3. 인증 토큰 교환 API (`/api/redmine/auth/token-exchange`)
4. iframe 임베드 + 부모↔iframe 메시지 브릿지
5. Redmine 사용자 목록 조회 연동 (리소스 할당 시 사용)
6. 트리 구조 양방향 동기화 (`parent_issue_id` ↔ `parent_id`)
