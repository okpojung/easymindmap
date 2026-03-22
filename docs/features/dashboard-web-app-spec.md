# 대시보드 노드 값 수정 웹 애플리케이션 설계 명세

## 1. 개요

마인드맵의 각 노드(Node)에 연결된 DB 데이터를 **별도의 웹 애플리케이션**에서 직접 조회 및 수정하면 대시보드에 실시간 반영되는 기능의 설계 명세입니다.

### 1.1 기본 원칙

| 항목 | 정책 |
|------|------|
| 허용 작업 | **조회(READ), 수정(UPDATE)** 만 허용 |
| 금지 작업 | 추가(INSERT), 삭제(DELETE) 불가 |
| 수정 단위 | 노드 단위 필드별 수정 |
| 정보 제공 | 어떤 테이블/컬럼/레코드인지 UI에서 명시적으로 표시 |

---

## 2. 아키텍처 구성

```
Dashboard Web App
  └─ ① GET /schema/node-fields   → field_registry 기반 편집 가능 필드 목록 로딩
  └─ ② GET /maps/{mapId}/nodes   → 노드 목록 + _meta(테이블/PK 정보) 포함 응답
  └─ ③ PATCH /nodes/{id}/fields/{fieldKey}  → 단일 필드 UPDATE 실행

Backend API
  └─ Schema API    : field_registry 테이블 참조
  └─ Node API      : nodes 조회 + _meta 응답 포함
  └─ Update API    : field_registry 참조 → UPDATE만 실행 (INSERT/DELETE 차단)

Database
  └─ nodes
  └─ mindmaps
  └─ field_registry  ← 핵심: 편집 가능 필드 메타정보 관리
  └─ node_notes, node_tags 등
```

---

## 3. 핵심 설계: `field_registry` 테이블

웹 앱이 "어떤 테이블의 어떤 컬럼을 수정하는지" 알 수 있도록 **메타정보를 DB에서 직접 관리**합니다.  
편집 가능 필드를 추가/제거할 때 이 테이블만 수정하면 웹 앱 코드 변경 없이 자동 반영됩니다.

### 3.1 DDL

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

### 3.2 초기 데이터 (node 엔티티 기준)

```sql
INSERT INTO field_registry (id, entity_type, field_key, label_ko, table_name, column_name, data_type, is_editable, is_json_path, json_path, display_order, description)
VALUES
  (gen_random_uuid(), 'node', 'text',            '노드 텍스트',    'nodes',      'text',        'string',  true,  false, null,          1, '마인드맵에 표시되는 노드 본문'),
  (gen_random_uuid(), 'node', 'note',            '노드 노트',      'node_notes', 'content',     'text',    true,  false, null,          2, '노드 상세 설명'),
  (gen_random_uuid(), 'node', 'style.fillColor', '배경색',        'nodes',      'style_json',  'color',   true,  true,  'fillColor',   3, '노드 도형 내부 색상'),
  (gen_random_uuid(), 'node', 'style.borderColor','테두리색',      'nodes',      'style_json',  'color',   true,  true,  'borderColor', 4, '노드 도형 테두리 색상'),
  (gen_random_uuid(), 'node', 'collapsed',       '접힘 여부',     'nodes',      'collapsed',   'boolean', true,  false, null,          5, '노드 접힘/펼침 상태'),
  (gen_random_uuid(), 'node', 'layout_type',     '레이아웃 타입', 'nodes',      'layout_type', 'string',  true,  false, null,          6, '노드 하위 레이아웃 방식'),
  (gen_random_uuid(), 'node', 'order_index',     '정렬 순서',     'nodes',      'order_index', 'number',  true,  false, null,          7, '형제 노드 간 정렬 순서');
```

---

## 4. API 명세

### 4.1 Schema Metadata API

웹 앱 초기화 시 **1회 호출**하여 편집 가능 필드 목록을 캐싱합니다.

**Request**
```
GET /api/dashboard/schema/node-fields
```

**Response**
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

---

### 4.2 노드 목록 조회 API (`_meta` 포함)

**Request**
```
GET /api/dashboard/maps/{mapId}/nodes
```

**Response** — 각 노드에 `_meta` 블록 포함하여 어느 DB 레코드인지 명시합니다.

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

---

### 4.3 단일 필드 수정 API

> **INSERT / DELETE 엔드포인트는 제공하지 않습니다.**  
> PATCH 요청만 허용하며, 백엔드에서 `field_registry.is_editable = true` 인 필드만 수정 실행합니다.

**Request**
```
PATCH /api/dashboard/nodes/{nodeId}/fields/{fieldKey}
Content-Type: application/json

{ "value": "새로운 텍스트" }
```

**Response (성공)**
```json
{
  "nodeId": "node_abc123",
  "fieldKey": "text",
  "previousValue": "AI",
  "newValue": "새로운 텍스트",
  "updatedAt": "2026-03-23T10:00:00Z"
}
```

**Response (실패 — 수정 불가 필드)**
```json
{
  "error": "FIELD_NOT_EDITABLE",
  "message": "해당 필드는 수정이 허용되지 않습니다.",
  "fieldKey": "id"
}
```

---

## 5. 백엔드 수정 로직 (Spring Boot 예시)

```java
@PatchMapping("/nodes/{nodeId}/fields/{fieldKey}")
public ResponseEntity<FieldUpdateResponse> updateNodeField(
    @PathVariable String nodeId,
    @PathVariable String fieldKey,
    @RequestBody FieldUpdateRequest request
) {
    // 1. field_registry에서 메타정보 조회
    FieldRegistry fieldMeta = fieldRegistryRepo
        .findByEntityTypeAndFieldKey("node", fieldKey)
        .orElseThrow(() -> new NotFoundException("알 수 없는 필드: " + fieldKey));

    // 2. 수정 가능 여부 검증
    if (!fieldMeta.isEditable()) {
        throw new ForbiddenException("수정 불가 필드: " + fieldKey);
    }

    // 3. JSONB 경로 여부에 따라 UPDATE 분기
    String previousValue;
    if (fieldMeta.isJsonPath()) {
        // JSONB 필드 업데이트 (예: style_json -> 'fillColor')
        previousValue = nodeRepo.getJsonFieldValue(nodeId, fieldMeta.getColumnName(), fieldMeta.getJsonPath());
        nodeRepo.updateJsonField(nodeId, fieldMeta.getColumnName(), fieldMeta.getJsonPath(), request.getValue());
    } else {
        previousValue = nodeRepo.getFieldValue(nodeId, fieldMeta.getColumnName());
        nodeRepo.updateField(nodeId, fieldMeta.getColumnName(), request.getValue());
    }

    return ResponseEntity.ok(new FieldUpdateResponse(nodeId, fieldKey, previousValue, request.getValue()));
}
```

---

## 6. 웹 앱 UI — 필드 정보 패널

사용자가 노드를 선택하면 오른쪽 사이드 패널에 아래 정보를 표시합니다.  
관리자/개발자가 **어떤 레코드/컬럼을 수정하는지 항상 확인**할 수 있습니다.

### 6.1 DB 정보 패널 표시 항목

| 표시 항목 | 예시 값 |
|-----------|---------|
| 노드 ID | `node_abc123` |
| DB 테이블 | `nodes` |
| PK 컬럼 | `id = node_abc123` |
| 수정 컬럼 | `text` |
| 데이터 타입 | `string` |
| 현재 값 | `"AI"` |

JSONB 경로 필드의 경우:

| 표시 항목 | 예시 값 |
|-----------|---------|
| DB 테이블 | `nodes` |
| 수정 컬럼 | `style_json → fillColor` |
| 데이터 타입 | `color` |
| 현재 값 | `"#FFE08A"` |

### 6.2 UI 구성 컴포넌트

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

---

## 7. 전체 흐름 요약

```
1. 웹 앱 초기화
   └─ GET /schema/node-fields
       → field_registry 테이블에서 편집 가능 필드 목록 로딩 (캐싱)

2. 맵 선택 → 노드 목록 조회
   └─ GET /maps/{mapId}/nodes
       → 각 노드에 _meta(테이블/PK/editableFields) 포함 응답

3. 사용자가 노드 선택
   └─ UI가 field_registry 기반으로 "DB 정보 패널" 표시
       (테이블명, 컬럼명, PK값 시각적으로 표시)

4. 사용자가 값 수정 후 저장
   └─ PATCH /nodes/{nodeId}/fields/{fieldKey}
       → 백엔드가 field_registry 참조 → UPDATE 실행
       → 마인드맵 대시보드에 실시간 반영
```

---

## 8. 확장 고려사항

| 항목 | 설명 |
|------|------|
| 감사 로그 | `field_update_log` 테이블에 이전값/변경값/변경자/시각 기록 |
| 권한 제어 | 필드별 수정 가능 역할(role) 관리 (`field_registry.allowed_roles`) |
| 실시간 반영 | WebSocket 또는 SSE로 대시보드에 변경 이벤트 push |
| 다중 필드 일괄 수정 | `PATCH /nodes/{nodeId}/fields` (배열 body) 지원 |
| 변경 이력 조회 | `GET /nodes/{nodeId}/fields/{fieldKey}/history` |
