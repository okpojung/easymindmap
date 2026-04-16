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

---

## Auto Refresh 진화 경로 (V2 → V3)

### 단계별 전환 전략

| 단계       | 방식                          | 특징                                      |
| -------- | --------------------------- | --------------------------------------- |
| V3 MVP   | Polling (`setInterval`)     | 구현 쉬움 / 기존 API 재사용 / 항상 요청 발생           |
| V3 확장    | Redis Pub/Sub + WebSocket Push | 변경 시에만 Push → 트래픽 90% 이상 절감           |

### 트래픽 비교

**Polling 방식**

```
대시보드 사용자 500명 × 30초 주기
→ 500 × 2 req/min = 1,000 req/min
  (변경이 없어도 항상 발생)
```

**Redis Pub/Sub + Push 방식**

```
변경 발생 시에만 500명에게 Push
→ 변경 빈도에 비례 (변경 없으면 0 req)
→ 평균 90~95% 트래픽 절감
```

### Redis Pub/Sub 채널 구조 (V3 확장)

* 채널명 형식: `dashboard:{mapId}`
* Payload 형태:

```json
{
  "changedNodes": [
    { "id": "node-uuid-1", "text": "33,500,000", "updatedAt": "2026-03-16T14:32:05Z" }
  ]
}
```

**처리 흐름**

```
외부 시스템: PATCH /nodes/:nodeId
        │
        ▼
Backend: nodes.text UPDATE
        │
        ▼
Redis PUBLISH  channel: dashboard:{mapId}
        payload: { changedNodes: [{id, text, updatedAt}] }
        │
        ▼
WS Gateway: SUBSCRIBE dashboard:{mapId}
        │
        ▼
dashboard:refresh 이벤트 → 해당 맵 클라이언트 전체에 Push
        │
        ▼
Client: 변경 노드만 즉시 업데이트 + flash animation
```

**WebSocket 이벤트 구조**

```json
{
  "event": "dashboard:refresh",
  "mapId": "map-uuid",
  "changedNodes": [
    { "id": "node-uuid-1", "text": "33,500,000", "updatedAt": "2026-03-16T14:32:05Z" }
  ]
}
```

### Flash Animation CSS Keyframe 상세

```css
/* 값이 변경된 노드에 일시적으로 적용 */
.node-flash-highlight {
  animation: flash 1.5s ease-out;
}

@keyframes flash {
  0%   { background-color: #fffde7; border-color: #f9a825; }  /* 노란 배경 */
  50%  { background-color: #fff9c4; }                          /* 연한 색   */
  100% { background-color: inherit; border-color: inherit; }   /* 원상 복귀 */
}
```

### node_type 확장 계획 (V3)

* 현재: `node_type = 'text'` (모든 노드 동일)
* V3 추가 예정: `node_type = 'data-live'`
  * 외부 갱신 전용 노드
  * 사용자가 직접 편집 불가 (UI에서 edit 비활성화)
  * 노드에 아이콘으로 외부 연결 표시
* `schema.sql`에 `node_type VARCHAR(30)` 컬럼이 예약되어 있음

---

## 대시보드 웹앱 메타데이터 아키텍처

### 개요

마인드맵 각 노드에 연결된 DB 데이터를 별도 웹 애플리케이션에서 직접 조회·수정하면 대시보드에 실시간 반영되는 기능. 조회(READ)와 수정(UPDATE)만 허용하며, 추가(INSERT)·삭제(DELETE)는 금지한다.

### field_registry 테이블 스키마

편집 가능 필드를 추가·제거할 때 이 테이블만 수정하면 웹앱 코드 변경 없이 자동 반영된다.

```sql
CREATE TABLE field_registry (
  id              UUID PRIMARY KEY,
  entity_type     VARCHAR(50)  NOT NULL,   -- 'node', 'mindmap', 'node_style' 등
  field_key       VARCHAR(100) NOT NULL,   -- 'text', 'style.fillColor', 'note'
  label_ko        VARCHAR(200) NOT NULL,   -- '노드 텍스트' (UI 표시용 한글명)
  table_name      VARCHAR(100) NOT NULL,   -- 실제 DB 테이블명 (nodes, node_notes 등)
  column_name     VARCHAR(200) NOT NULL,   -- 'text', 'style_json->fillColor' 등
  data_type       VARCHAR(50)  NOT NULL,   -- 'string', 'color', 'number', 'boolean', 'text'
  is_editable     BOOLEAN NOT NULL DEFAULT TRUE,
  is_json_path    BOOLEAN NOT NULL DEFAULT FALSE,  -- JSONB 컬럼 내 경로 여부
  json_path       VARCHAR(200) NULL,       -- is_json_path=true일 때 경로 (예: fillColor)
  display_order   INT NOT NULL DEFAULT 0,
  description     TEXT NULL
);
```

| 컬럼             | 설명                                              |
| -------------- | ----------------------------------------------- |
| `entity_type`  | 엔티티 종류 (`node`, `mindmap`, `node_style` 등)     |
| `field_key`    | 필드 식별자 (`text`, `style.fillColor`, `note` 등)   |
| `label_ko`     | UI 표시용 한글 레이블                                   |
| `table_name`   | 실제 DB 테이블명                                      |
| `column_name`  | DB 컬럼명 (JSONB 경로 포함 가능)                         |
| `data_type`    | 데이터 타입 (`string`, `color`, `number`, `boolean`, `text`) |
| `is_editable`  | 수정 허용 여부                                        |
| `is_json_path` | JSONB 컬럼 내 경로 여부                                |
| `json_path`    | JSONB 경로명 (예: `fillColor`)                      |
| `display_order`| UI 표시 순서                                        |

### JSONB 필드 업데이트 처리 방식

`is_json_path = true`인 필드는 JSONB 컬럼 내부 경로를 대상으로 부분 업데이트한다.

* 예시: `column_name = 'style_json'`, `json_path = 'fillColor'`
  → SQL 상 `style_json->>'fillColor'` 경로만 선택적으로 UPDATE
* DB 정보 패널 표시: `수정 컬럼 = style_json → fillColor`

백엔드 처리 분기:

```java
if (fieldMeta.isJsonPath()) {
    // JSONB 필드 업데이트 (예: style_json -> 'fillColor')
    nodeRepo.updateJsonField(nodeId, fieldMeta.getColumnName(), fieldMeta.getJsonPath(), value);
} else {
    nodeRepo.updateField(nodeId, fieldMeta.getColumnName(), value);
}
```

### Schema API 엔드포인트

웹앱 초기화 시 1회 호출하여 편집 가능 필드 목록을 캐싱한다.

```
GET /api/dashboard/schema/node-fields
```

**응답 예시**

```json
{
  "entity": "node",
  "fields": [
    {
      "key": "text",
      "label": "노드 텍스트",
      "table": "nodes",
      "column": "text",
      "dataType": "string",
      "editable": true,
      "description": "마인드맵에 표시되는 노드 본문"
    },
    {
      "key": "style.fillColor",
      "label": "배경색",
      "table": "nodes",
      "column": "style_json",
      "dataType": "color",
      "isJsonPath": true,
      "jsonPath": "fillColor",
      "editable": true,
      "description": "노드 도형 내부 색상"
    }
  ]
}
```

### API 응답 `_meta` 필드 구조

노드 목록 조회 시 각 노드에 `_meta` 블록을 포함하여 어느 DB 레코드인지 명시한다.

```
GET /api/dashboard/maps/{mapId}/nodes
```

```json
[
  {
    "id": "node_abc123",
    "text": "AI",
    "collapsed": false,
    "layoutType": "radial",
    "style": {
      "fillColor": "#FFE08A",
      "borderColor": "#D9A400"
    },
    "_meta": {
      "table": "nodes",
      "pk": "node_abc123",
      "pkColumn": "id",
      "editableFields": ["text", "collapsed", "style.fillColor", "style.borderColor", "layout_type", "order_index"]
    }
  }
]
```

| `_meta` 필드      | 설명                       |
| --------------- | ------------------------ |
| `table`         | 해당 노드가 저장된 DB 테이블        |
| `pk`            | 해당 레코드의 PK 값             |
| `pkColumn`      | PK 컬럼명                   |
| `editableFields`| 수정 가능한 필드 키 목록           |

### 대시보드 웹앱 UI 컴포넌트 구조

```
DashboardWebApp
  ├─ MapSelector           -- 맵 선택 드롭다운
  ├─ NodeListPanel         -- 노드 목록 (트리/플랫)
  │    └─ NodeListItem     -- 노드 클릭 시 우측 패널 활성화
  └─ NodeEditPanel         -- 우측 편집 패널
       ├─ DbInfoSection    -- DB 테이블/컬럼/PK 정보 표시
       └─ FieldEditor[]    -- field_registry 기반 동적 생성
            ├─ StringField
            ├─ ColorField
            ├─ BooleanField
            └─ NumberField
```

### DB Info Panel 표시 항목

사용자가 노드를 선택하면 오른쪽 사이드 패널(`DbInfoSection`)에 아래 항목을 표시한다.

**일반 필드**

| 표시 항목   | 예시 값          |
| ------- | ------------- |
| 노드 ID   | `node_abc123` |
| DB 테이블  | `nodes`       |
| PK 컬럼   | `id = node_abc123` |
| 수정 컬럼   | `text`        |
| 데이터 타입  | `string`      |
| 현재 값    | `"AI"`        |

**JSONB 경로 필드 (예: 배경색)**

| 표시 항목   | 예시 값                      |
| ------- | ------------------------- |
| DB 테이블  | `nodes`                   |
| 수정 컬럼   | `style_json → fillColor`  |
| 데이터 타입  | `color`                   |
| 현재 값    | `"#FFE08A"`               |
