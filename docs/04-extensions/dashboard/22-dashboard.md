# 22. Dashboard
## DASHBOARD

* 문서 버전: v1.0
* 작성일: 2026-04-16
* 참조: `docs/01-product/functional-spec.md § DASHBOARD`, `docs/02-domain/db-schema.md § maps`

---

### 1. 기능 목적

* 맵을 **Read-only 대시보드 모드로 전환**하여 외부 시스템 데이터를 실시간 시각화하는 기능 (V3)
* 외부 API가 노드 값을 업데이트하면 설정 주기로 화면을 자동 리프레시
* 변경된 노드를 Flash 애니메이션으로 강조하여 변화를 즉시 인지

---

### 2. 기능 범위

* 포함:
  * Dashboard 모드 전환 (DASH-01)
  * 자동 갱신 Polling (DASH-02)
  * 변경 노드 Flash 하이라이트 (DASH-03)
  * 갱신 주기 설정 (DASH-04)
  * 외부 노드 업데이트 API (DASH-05)

* 제외:
  * 편집 기능 (Dashboard 모드에서 비활성)
  * 실시간 WebSocket Push (→ V3 확장)
  * 사용자 직접 데이터 입력 UI

---

### 3. 세부 기능 목록

| 기능ID    | 기능명                   | 설명                                     | 주요 동작            |
| ------- | --------------------- | --------------------------------------- | ---------------- |
| DASH-01 | Dashboard Mode        | 맵을 Read-only 대시보드 모드로 전환                | view_mode 변경     |
| DASH-02 | Auto Refresh          | 설정 주기로 노드 값 자동 갱신 (polling)            | setInterval      |
| DASH-03 | Change Highlight      | 변경된 노드 flash animation 표시              | 노드 강조 효과         |
| DASH-04 | Refresh Interval      | 갱신 주기 설정 (off/10초/30초/1분/5분/10분)      | 설정 UI            |
| DASH-05 | External Update API   | 외부 시스템에서 노드 값 일괄 업데이트                  | `PATCH /maps/:id/data` |

---

### 4. 기능 정의 (What)

#### 4.1 Dashboard 모드 DB 설정

```sql
-- maps 테이블 관련 컬럼
maps.view_mode                VARCHAR(20)  DEFAULT 'edit'
  -- 'edit' | 'dashboard' | 'kanban' | 'wbs'

maps.refresh_interval_seconds INT          DEFAULT 0
  -- 0: off, 10, 30, 60, 300, 600 (초 단위)
```

#### 4.2 갱신 주기 옵션

| 선택지   | 값(초) |
| ----- | ---- |
| OFF   | 0    |
| 10초   | 10   |
| 30초   | 30   |
| 1분    | 60   |
| 5분    | 300  |
| 10분   | 600  |

#### 4.3 외부 업데이트 API 요청 구조

```typescript
// PATCH /maps/{mapId}/data
interface ExternalDataUpdate {
  updates: {
    nodeId: string;
    text?: string;           // 노드 텍스트 값
    style?: Partial<NodeStyle>; // 스타일 (색상 등)
  }[];
  apiKey: string;            // 맵별 API Key (별도 발급)
}
```

#### 4.4 Dashboard 모드 UI

```text
┌────────────────────────────────────────────────────────────┐
│  [대시보드 모드]  마지막 갱신: 12:34:56  [수동 갱신 ⟳]  [편집 모드] │
├────────────────────────────────────────────────────────────┤
│                                                            │
│           [Server Load]          [DB Connections]          │
│              78%                      124                  │
│           (flash!)                                         │
│                                                            │
└────────────────────────────────────────────────────────────┘
```

---

### 5. 동작 방식 (How)

#### 5.1 사용자 동작

* 상단 메뉴 > `보기` > `대시보드 모드` 전환
* 갱신 주기 설정 (기어 아이콘 > `갱신 주기`)
* Dashboard 모드 진입 → 편집 기능 비활성, 자동 갱신 시작
* 변경 노드: 2초간 Flash 애니메이션 표시
* `[편집 모드]` 버튼으로 언제든 편집 모드 복귀

#### 5.2 Auto Refresh 처리 흐름

```
setInterval(refreshInterval * 1000)
    │
    ▼
GET /maps/{mapId}/document?since={lastVersion}
    │
    ▼
변경 노드 diff 계산
    │
    ├─ 변경 있음 → Document Store 업데이트
    │             → Flash 애니메이션 트리거
    │
    └─ 변경 없음 → 무시
```

#### 5.3 외부 시스템 연동 흐름

```
외부 시스템 (모니터링/CI/ERP 등)
    │
    ▼ (주기적 또는 이벤트 기반)
PATCH /maps/{mapId}/data
  { updates: [{ nodeId, text }], apiKey }
    │
    ▼
API Key 검증 → nodes.text UPDATE
    │
    ▼
maps.current_version + 1
    │
    ▼
Dashboard Auto Refresh Polling에서 변경 감지 → Flash
```

---

### 6. 규칙 (Rule)

* Dashboard 모드: 편집 기능 전체 비활성 (노드 추가/수정/삭제 불가)
* 갱신 주기 최소: 10초 (서버 과부하 방지)
* Flash 애니메이션: 2초간 배경색 변화 후 원상 복귀
* 외부 API: 맵별 고유 API Key 발급 (Map Settings에서 관리)
* API Key는 환경변수 또는 암호화 저장 (`AES-256`)

---

### 7. 예외 / 경계 (Edge Case)

* **polling 실패**: 재시도 3회 후 갱신 중지 + 오류 배너 표시
* **외부 API Key 오류**: 401 Unauthorized 반환
* **1000+ 노드 대형 맵**: diff 방식으로 변경 노드만 전송 (전체 재로딩 방지)
* **편집 모드 복귀 중 데이터 변경**: 변경 사항 덮어쓰기 경고

---

### 8. 권한 규칙

| 역할      | Dashboard 모드 전환 | 갱신 주기 설정 | 외부 API 사용 |
| ------- | -------------- | --------- | ---------- |
| creator | ✅              | ✅         | ✅          |
| editor  | ❌              | ❌         | ❌          |
| viewer  | ❌              | ❌         | ❌          |

---

### 9. DB 영향

* `maps.view_mode` — 'dashboard' 설정
* `maps.refresh_interval_seconds` — 갱신 주기
* `nodes.text` — 외부 API로 업데이트되는 값

---

### 10. API 영향

* `PATCH /maps/{mapId}/view-mode` — Dashboard 모드 전환
* `PATCH /maps/{mapId}/refresh-interval` — 갱신 주기 설정
* `PATCH /maps/{mapId}/data` — 외부 노드 값 업데이트 (인증: API Key)
* `GET /maps/{mapId}/api-key` — API Key 조회

---

### 11. 연관 기능

* WBS (`28-wbs.md`)
* SAVE (`docs/03-editor-core/save/14-save.md`)
* PUBLISH_SHARE (`27-publish-share.md`)

---

### 12. 구현 우선순위

#### MVP (V3)
* DASH-01 Dashboard 모드 전환
* DASH-02 Auto Refresh Polling
* DASH-03 Flash 애니메이션
* DASH-04 갱신 주기 설정

#### 2단계 (V3 확장)
* DASH-05 외부 업데이트 API + API Key 발급
* Redis Pub/Sub + WebSocket Push (트래픽 절감)
