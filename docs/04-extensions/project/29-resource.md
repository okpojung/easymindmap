# 29. Resource
## RESOURCE

* 문서 버전: v1.0
* 작성일: 2026-04-16
* 참조: `docs/01-product/functional-spec.md § RESOURCE`, `docs/02-domain/db-schema.md § node_resources`

---

### 1. 기능 목적

* 노드(작업)에 **담당자·검토자·참관자를 할당**하는 리소스 관리 기능
* WBS 모드와 Kanban 모드 모두에서 사용 가능한 공통 리소스 구조
* Redmine 사용자 연동으로 외부 팀원도 할당 지원

---

### 2. 기능 범위

* 포함:
  * 리소스 할당 패널 (RES-01)
  * 담당자 검색/추가 (RES-02)
  * 역할 지정 (assignee/reviewer/observer) (RES-03)
  * 공수 입력 (WBS 전용) (RES-04)
  * 리소스 아바타 인디케이터 (RES-05)

* 제외:
  * 리소스 부하 분석 (후순위)
  * 팀/조직 단위 할당 (후순위)
  * 캘린더 연동 (후순위)

---

### 3. 세부 기능 목록

| 기능ID   | 기능명             | 설명                              | 주요 동작         |
| ------ | --------------- | ------------------------------- | ------------- |
| RES-01 | 리소스 할당 패널       | 노드에 사람 할당 UI (WBS·Kanban 공통)     | Right Panel   |
| RES-02 | 담당자 검색/추가       | 내부 사용자 및 Redmine 사용자 검색         | 이름 검색 자동완성    |
| RES-03 | 역할 지정           | 담당자/검토자/참관자 역할 선택              | 드롭다운 선택       |
| RES-04 | 공수 입력           | 할당 시간(h) 입력 (WBS 전용)            | 숫자 입력 (소수점 2위) |
| RES-05 | 리소스 아바타 인디케이터  | 노드 하단에 담당자 아바타 표시               | 아바타 아이콘       |

---

### 4. 기능 정의 (What)

#### 4.1 node_resources 테이블

```sql
CREATE TABLE public.node_resources (
  id                UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  node_id           UUID         NOT NULL REFERENCES public.nodes(id) ON DELETE CASCADE,

  -- 내부 사용자
  user_id           UUID         REFERENCES public.users(id) ON DELETE SET NULL,

  -- 외부 사용자 (Redmine 연동)
  redmine_user_id   INTEGER      DEFAULT NULL,
  redmine_user_name VARCHAR(100) DEFAULT NULL,  -- 캐시

  -- 역할
  role              VARCHAR(30)  NOT NULL DEFAULT 'assignee',
  -- 'assignee': 담당자 | 'reviewer': 검토자 | 'observer': 참관자

  -- WBS 전용
  allocated_hours   NUMERIC(6,2) DEFAULT NULL,

  created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_node_resource_user
    UNIQUE NULLS NOT DISTINCT (node_id, user_id, role),
  CONSTRAINT uq_node_resource_redmine_user
    UNIQUE NULLS NOT DISTINCT (node_id, redmine_user_id, role),
  CONSTRAINT chk_resource_identity CHECK (
    user_id IS NOT NULL OR redmine_user_id IS NOT NULL
  )
);
```

#### 4.2 역할 정의

| 역할        | 설명             | 아이콘 |
| --------- | -------------- | --- |
| assignee  | 담당자 (메인 책임자)   | 👤  |
| reviewer  | 검토자 (승인 권한)    | 🔍  |
| observer  | 참관자 (알림만 수신)   | 👁  |

#### 4.3 리소스 패널 UI

```text
┌─────────────────────────────────────────┐
│  리소스 할당                              │
├─────────────────────────────────────────┤
│  [+ 담당자 추가] [검색: "이름 또는 이메일"]   │
├─────────────────────────────────────────┤
│  👤 Alice Kim    [담당자 ▼]  4.5h  [✕]  │
│  🔍 Bob Lee      [검토자 ▼]   -    [✕]  │
│  👁 Charlie Park [참관자 ▼]   -    [✕]  │
├─────────────────────────────────────────┤
│  ⚙ Redmine 사용자 연동                    │
│  👤 Redmine#42 John    [담당자 ▼]  [✕] │
└─────────────────────────────────────────┘
```

#### 4.4 아바타 인디케이터

```text
노드 하단:
[Alice] [Bob] [+2]  ← 최대 3명 아바타 표시, 이후 +N으로 축약
```

#### 4.5 모드별 사용 방식

| 모드           | 사용 방식                                    |
| ------------ | ---------------------------------------- |
| WBS 모드       | Activity 담당자/검토자 할당, `allocated_hours` 입력 가능 |
| Kanban 모드    | 카드(Level 3 노드) 담당자 할당, `allocated_hours` 미사용 |
| 일반 마인드맵     | 선택적 사용 (view_mode 무관)                    |

---

### 5. 동작 방식 (How)

#### 5.1 사용자 동작

* 노드 선택 → Right Panel > `리소스` 탭
* `[+ 담당자 추가]` 클릭 → 검색창에 이름/이메일 입력
* 자동완성 목록에서 선택 → 역할 선택 (담당자/검토자/참관자)
* WBS 모드: 공수(시간) 입력
* 아바타 클릭 → 할당 해제 또는 역할 변경

#### 5.2 리소스 할당 처리 흐름

```
Right Panel > 리소스 > [+ 담당자 추가]
    │
    ▼
GET /users/search?q={name}  (내부 사용자)
  또는
GET /redmine/users?q={name}  (Redmine 사용자)
    │
    ▼
선택 → 역할 선택 → POST /nodes/{nodeId}/resources
  { userId, role, allocatedHours? }
    │
    ▼
node_resources INSERT
    │
    ▼
아바타 인디케이터 즉시 갱신
```

---

### 6. 규칙 (Rule)

* 노드당 담당자: 최대 5명 (역할 구분 없이 합산)
* `allocated_hours` 범위: 0.00 ~ 9999.99 시간
* 동일 사용자를 동일 역할로 중복 할당: UNIQUE 제약으로 차단
* `user_id` 또는 `redmine_user_id` 중 하나 필수 (`chk_resource_identity`)
* Redmine 사용자 이름은 캐시 저장 (API 호출 최소화)

---

### 7. 예외 / 경계 (Edge Case)

* **내부 사용자 탈퇴**: `user_id = NULL`로 처리 (ON DELETE SET NULL), 아바타 회색 표시
* **Redmine 연동 해제**: `redmine_user_id` 유지 (히스토리 보존), 아바타에 "연동 끊김" 표시
* **동일 역할 중복 할당 시도**: 오류 메시지 표시

---

### 8. 권한 규칙

| 역할      | 리소스 할당/변경 | 리소스 조회 |
| ------- | ---------- | ------- |
| creator | ✅          | ✅       |
| editor  | ✅          | ✅       |
| viewer  | ❌          | ✅       |

---

### 9. DB 영향

* `node_resources` — 리소스 할당 정보

---

### 10. API 영향

* `GET /nodes/{nodeId}/resources` — 리소스 목록 조회
* `POST /nodes/{nodeId}/resources` — 리소스 추가
* `PATCH /nodes/{nodeId}/resources/{resourceId}` — 역할/공수 변경
* `DELETE /nodes/{nodeId}/resources/{resourceId}` — 리소스 제거
* `GET /users/search?q={query}` — 내부 사용자 검색

---

### 11. 연관 기능

* WBS (`28-wbs.md`)
* REDMINE_INTEGRATION (`31-redmine-integration.md`)
* COLLABORATION (`25-map-collaboration.md`)

---

### 12. 구현 우선순위

#### MVP (V1)
* RES-01 리소스 할당 패널
* RES-02 담당자 검색/추가 (내부 사용자)
* RES-03 역할 지정
* RES-05 아바타 인디케이터

#### 2단계 (V1)
* RES-04 공수 입력 (WBS 모드)
* Redmine 사용자 연동 검색
