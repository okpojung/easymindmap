# 28. WBS
## WBS

* 문서 버전: v1.0
* 작성일: 2026-04-16
* 참조: `docs/01-product/functional-spec.md § WBS`, `docs/02-domain/db-schema.md § node_schedule`

---

### 1. 기능 목적

* 맵을 **WBS 모드로 전환하여 노드에 일정·마일스톤·진척률을 시각화**하는 기능
* Redmine 연동을 통해 이슈 기반 프로젝트 관리와 마인드맵 구조 연결
* 노드 기반 WBS로 작업 분해 구조(Work Breakdown Structure) 직관적 관리

---

### 2. 기능 범위

* 포함:
  * WBS 모드 전환 (WBS-01)
  * 시작일/종료일 설정 (WBS-02)
  * 마일스톤 설정 (WBS-03)
  * 진척률 설정 (WBS-04)
  * WBS 인디케이터 표시 (WBS-05)

* 제외:
  * Gantt 차트 뷰 (후순위)
  * 자동 일정 계산 (Critical Path, 후순위)
  * 리소스 할당 (→ `29-resource.md`)
  * Redmine 연동 (→ `31-redmine-integration.md`)

---

### 3. 세부 기능 목록

| 기능ID   | 기능명           | 설명                               | 주요 동작           |
| ------ | ------------- | -------------------------------- | --------------- |
| WBS-01 | WBS 모드 전환     | 맵을 WBS 모드로 전환 (`view_mode = 'wbs'`) | 메뉴 선택       |
| WBS-02 | 일정 설정         | 노드에 시작일/종료일 설정                   | 날짜 피커          |
| WBS-03 | 마일스톤 설정       | 노드를 마일스톤으로 지정 (단일 날짜)            | 마일스톤 토글        |
| WBS-04 | 진척률 설정        | 0~100% 진척률 입력                    | 슬라이더/직접 입력     |
| WBS-05 | WBS 인디케이터     | 날짜 배지·마일스톤 마커·진척률 바·상태 색상 표시    | 노드 하단 인디케이터    |

---

### 4. 기능 정의 (What)

#### 4.1 node_schedule 테이블

```sql
CREATE TABLE public.node_schedule (
  node_id       UUID     PRIMARY KEY REFERENCES public.nodes(id) ON DELETE CASCADE,
  start_date    DATE     DEFAULT NULL,
  end_date      DATE     DEFAULT NULL,
  is_milestone  BOOLEAN  NOT NULL DEFAULT FALSE,
  progress      SMALLINT DEFAULT 0
                CHECK (progress BETWEEN 0 AND 100),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

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
```

#### 4.2 WBS 인디케이터 표시

```text
노드:  "API 서버 구축"
인디케이터:
  [📅 2026-04-01 ~ 2026-04-15]  [진척률: ████████░░ 80%]  [⚡ 마일스톤]
```

#### 4.3 WbsStatus 색상 코딩

| 상태       | 조건                              | 색상           |
| -------- | ------------------------------- | ------------ |
| 완료       | progress = 100                  | 초록 (#10B981) |
| 진행 중     | progress > 0, end_date >= today | 파랑 (#3B82F6) |
| 지연       | end_date < today, progress < 100 | 빨강 (#EF4444) |
| 미시작      | progress = 0, start_date > today | 회색 (#9CA3AF) |
| 마일스톤 완료  | is_milestone = true, progress = 100 | 별 (#F59E0B) |

#### 4.4 WBS 패널 (Right Panel)

```text
┌─────────────────────────────────┐
│  WBS 설정                        │
├─────────────────────────────────┤
│  시작일: [ 2026-04-01 📅 ]        │
│  종료일: [ 2026-04-15 📅 ]        │
│  진척률: [████████░░] 80%  [입력] │
│  □ 마일스톤으로 지정               │
├─────────────────────────────────┤
│  Redmine 이슈 #1234 [연결 해제]   │
└─────────────────────────────────┘
```

---

### 5. 동작 방식 (How)

#### 5.1 사용자 동작

* 상단 메뉴 > `보기` > `WBS 모드` 전환
* 노드 선택 → Right Panel > `WBS` 탭 표시
* 시작일/종료일 날짜 피커에서 선택
* 진척률 슬라이더 조절 또는 숫자 직접 입력 (0~100)
* 마일스톤 체크박스 선택 → 단일 날짜 자동 처리

#### 5.2 WBS 데이터 저장 흐름

```
사용자 WBS 값 변경
    │
    ▼
Right Panel → PATCH /nodes/{nodeId}/schedule
  { start_date, end_date, is_milestone, progress }
    │
    ▼
node_schedule UPSERT
    │
    ▼
Auto Save 트리거 (즉시 저장)
    │
    ▼
WBS 인디케이터 즉시 갱신
```

#### 5.3 WbsStatus 계산

```typescript
function calcWbsStatus(schedule: NodeSchedule): WbsStatus {
  const today = new Date();
  if (schedule.progress === 100) return 'done';
  if (schedule.is_milestone && schedule.progress === 100) return 'milestone_done';
  if (schedule.end_date && schedule.end_date < today && schedule.progress < 100)
    return 'delayed';
  if (schedule.progress > 0) return 'in_progress';
  return 'not_started';
}
```

---

### 6. 규칙 (Rule)

* WBS 모드: `maps.view_mode = 'wbs'` 설정
* 마일스톤: `start_date = end_date` 또는 단일 날짜만 설정
* 진척률 범위: 0 ~ 100 (SMALLINT CHECK)
* 종료일은 시작일 이후여야 함 (`chk_wbs_date_order`)
* WBS 비활성 노드: `node_schedule` row 없음 (NULL 컬럼 낭비 없음)

---

### 7. 예외 / 경계 (Edge Case)

* **종료일 < 시작일 입력**: 유효성 검사로 차단, 오류 메시지
* **마일스톤에 기간 설정 시도**: 자동으로 start_date = end_date 처리
* **Redmine 연동 중 일정 변경**: Redmine 이슈 자동 업데이트 트리거 (→ `31-redmine-integration.md`)

---

### 8. 권한 규칙

| 역할      | WBS 모드 전환 | WBS 설정 편집 | WBS 조회 |
| ------- | ---------- | ---------- | ------ |
| creator | ✅          | ✅          | ✅      |
| editor  | ❌          | ✅          | ✅      |
| viewer  | ❌          | ❌          | ✅      |

---

### 9. DB 영향

* `node_schedule` — WBS 일정 정보 (1:1 optional)
* `maps.view_mode` — 'wbs' 설정

---

### 10. API 영향

* `PATCH /maps/{mapId}/view-mode` — WBS 모드 전환
* `PUT /nodes/{nodeId}/schedule` — WBS 일정 설정
* `DELETE /nodes/{nodeId}/schedule` — WBS 일정 삭제
* `GET /maps/{mapId}/wbs` — 맵 전체 WBS 요약 조회

---

### 11. 연관 기능

* RESOURCE (`29-resource.md`)
* REDMINE_INTEGRATION (`31-redmine-integration.md`)
* SAVE (`docs/03-editor-core/save/14-save.md`)

---

### 12. 구현 우선순위

#### MVP (V1)
* WBS-01 WBS 모드 전환
* WBS-02 시작일/종료일 설정
* WBS-03 마일스톤 설정
* WBS-04 진척률 설정
* WBS-05 WBS 인디케이터 표시

#### 2단계
* Gantt 차트 뷰
* 부모 노드 진척률 자동 계산 (자식 평균)
