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
