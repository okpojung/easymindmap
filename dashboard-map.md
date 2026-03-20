# easymindmap — 대시보드 맵 기능 설계

> 적용 단계: V3  
> 핵심 개념: Mindmap + Dashboard

---

## 1. 기능 개요

맵을 **Read-only 대시보드**로 설정하면, 외부 시스템이 노드의 텍스트 값을 변경했을 때 설정된 주기에 따라 **맵이 자동으로 화면을 리프레시**하여 항상 최신 값을 표시하는 기능.

```
[매출액]──[2026년]──[32,000,000]
                        │
               외부 시스템이
               nodes.text 를 33,500,000 으로 UPDATE
                        │
               설정된 주기(예: 30초)로 화면 리프레시
                        │
               [매출액]──[2026년]──[33,500,000]
               (변경된 노드 flash highlight)
```

---

## 2. 구현 개념

### 핵심 아이디어

```
복잡한 SQL 바인딩 / 외부 DB 직접 연결 불필요.

노드 텍스트는 이미 DB(nodes.text)에 저장되어 있음.
외부 시스템이 기존 API로 nodes.text를 UPDATE하면,
대시보드 맵은 polling으로 변경 감지 → 화면 업데이트.
```

### 동작 흐름

```
외부 시스템
    → PATCH /nodes/:nodeId  (기존 API 그대로)
    → nodes.text 업데이트

대시보드 맵 (클라이언트)
    → setInterval (refresh_interval_seconds)
    → GET /maps/:id/snapshot
    → 이전 값과 diff
    → 변경된 노드만 텍스트 업데이트 + flash animation
```

---

## 3. 데이터 모델

기존 `maps` 테이블에 컬럼 2개만 추가 (이미 schema.sql에 포함):

```sql
maps.view_mode                VARCHAR(20)  DEFAULT 'edit'
-- 'edit'      : 일반 편집 모드
-- 'dashboard' : Read-only + 자동 리프레시 모드

maps.refresh_interval_seconds INT          DEFAULT 0
-- 0: 자동 리프레시 off
-- 30, 60, 300 등: 갱신 주기 (초 단위)
```

---

## 4. API

### 대시보드 리프레시용 경량 API

```
GET /maps/:mapId/snapshot
```

응답 (변경 감지에 필요한 최소 필드만):

```json
{
  "mapVersion": 145,
  "nodes": [
    { "id": "node-uuid-1", "text": "33,500,000", "updatedAt": "2026-03-16T14:32:05Z" },
    { "id": "node-uuid-2", "text": "AI 전략",    "updatedAt": "2026-03-10T09:00:00Z" }
  ]
}
```

### 외부 시스템의 노드 값 변경 방법

```
방법 1: 기존 REST API (권장)
  PATCH /nodes/:nodeId
  Authorization: Bearer {api_token}
  Body: { "text": "33,500,000" }

방법 2: 대시보드 전용 배치 API
  PATCH /maps/:mapId/data
  Body: {
    "nodes": [
      { "id": "node-uuid-1", "text": "33,500,000" },
      { "id": "node-uuid-2", "text": "28,900,000" }
    ]
  }
```

---

## 5. 프론트엔드 구현

### Auto Refresh 로직

```typescript
// Dashboard 모드 진입 시
useEffect(() => {
  if (viewMode !== 'dashboard' || refreshInterval === 0) return;

  const refreshMap = async () => {
    const snapshot = await fetchSnapshot(mapId);

    snapshot.nodes.forEach(newNode => {
      const current = documentStore.getNode(newNode.id);
      if (current && current.text !== newNode.text) {
        // 변경된 노드만 업데이트
        documentStore.updateNodeText(newNode.id, newNode.text);
        // 시각적 변경 표시
        triggerFlashHighlight(newNode.id);
      }
    });
  };

  const timer = setInterval(refreshMap, refreshInterval * 1000);
  return () => clearInterval(timer);

}, [viewMode, refreshInterval, mapId]);
```

### 변경 노드 Flash Animation

```css
/* 값이 변경된 노드에 일시적으로 적용 */
.node-flash-highlight {
  animation: flash 1.5s ease-out;
}

@keyframes flash {
  0%   { background-color: #fffde7; border-color: #f9a825; }
  50%  { background-color: #fff9c4; }
  100% { background-color: inherit; border-color: inherit; }
}
```

---

## 6. Dashboard 모드 UI

```
┌─────────────────────────────────────────────────────────┐
│  매출 현황 대시보드          [🔄 30초 갱신]              │
│                             마지막 갱신: 14:32:05        │
├─────────────────────────────────────────────────────────┤
│                                                         │
│              [매출액]                                   │
│             /        \                                  │
│         [2026년]    [2025년]                            │
│            │              │                            │
│      [33,500,000]    [28,900,000]                       │
│       ↑ flash highlight                                 │
│                                                         │
└─────────────────────────────────────────────────────────┘

헤더 상태 표시:
  🔄 30초 갱신     → 자동 리프레시 활성
  ✅ 14:32:05     → 마지막 성공 갱신 시각
  ⚠️ 연결 오류    → 갱신 실패 경고
```

### Dashboard 모드 설정 UI

```
맵 설정 > 보기 모드
  ○ 편집 모드 (기본)
  ● 대시보드 모드
      갱신 주기: [30초 ▾]
                  끄기 / 10초 / 30초 / 1분 / 5분 / 10분
```

---

## 7. node_type 활용 (V3 이후 확장 대비)

현재는 `node_type = 'text'`로 모든 노드 동일.
V3에서 대시보드 노드를 명확히 구분하려면:

```
node_type = 'data-live'
  → 외부 갱신 전용 노드
  → 사용자가 직접 편집 불가 (UI에서 edit 비활성화)
  → 노드에 🔗 아이콘으로 외부 연결 표시
```

현재 schema.sql에 `node_type VARCHAR(30)` 컬럼이 예약되어 있음.

---

## 8. V2: Polling → Redis Pub/Sub → WebSocket Push 업그레이드 경로

### 단계별 전환

```
V3 MVP:  Polling (setInterval)
  - 구현 쉬움 / 기존 API 재사용
  - 단점: 사용자 수 × 갱신 주기만큼 API 호출 발생

V3 확장: Redis Pub/Sub + WebSocket Push
  - 변경이 있을 때만 Push → 트래픽 90% 이상 절감
  - 협업 기능 구현 시 WS 서버가 이미 있으므로 자연스럽게 전환
```

### 트래픽 비교

```
[Polling 방식]
대시보드 사용자 500명 × 30초 주기
→ 500 × 2 req/min = 1,000 req/min (변경 없어도 항상 발생)

[Redis Pub/Sub + Push 방식]
변경 발생 시에만 500명에게 Push
→ 변경 빈도에 비례 (변경 없으면 0 req)
→ 평균 90~95% 트래픽 절감
```

### Redis Pub/Sub 구조 (V3 확장)

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

### WebSocket 이벤트 (V3 확장)

```json
{
  "event": "dashboard:refresh",
  "mapId": "map-uuid",
  "changedNodes": [
    { "id": "node-uuid-1", "text": "33,500,000", "updatedAt": "2026-03-16T14:32:05Z" }
  ]
}
```

---

## 9. 활용 사례

### 매출 대시보드

```
매출 현황
 ├── 오늘 매출         → 외부 ERP/POS 시스템이 실시간 업데이트
 ├── 이번달 매출
 └── 목표 달성률
```

### 프로젝트 진행 현황

```
프로젝트 Alpha
 ├── 전체 진행률       → Jira/GitHub API 연동
 ├── 오픈 이슈         
 └── 완료 Task
```

### IT 인프라 상태

```
서버 상태
 ├── CPU 사용률        → 모니터링 시스템 연동
 ├── Memory
 └── Disk
```

---

## 10. 난이도 평가

| 항목 | 난이도 |
|------|--------|
| view_mode / refresh_interval DB 컬럼 | 매우 낮음 (이미 설계 완료) |
| GET /maps/:id/snapshot API | 낮음 |
| setInterval polling 로직 | 낮음 |
| diff 감지 + 화면 업데이트 | 낮음 |
| flash highlight animation | 낮음 |
| Dashboard 모드 설정 UI | 낮음 |
| 전체 | **낮음~중간** |

---

## 11. 구현 순서 권장

```
Step 1: maps.view_mode, maps.refresh_interval_seconds 활성화 (이미 schema에 있음)
Step 2: GET /maps/:id/snapshot API 구현
Step 3: 대시보드 모드 설정 UI
Step 4: 클라이언트 setInterval + diff + 화면 업데이트
Step 5: flash highlight animation
Step 6: 마지막 갱신 시각 표시
Step 7: node_type='data-live' 분리 (V3 이후)
Step 8: WebSocket Push 전환 (협업 기능 구현 후)
```

---

## 12. 전략적 가치

```
기존 mindmap 도구:  정적 텍스트만 가능

easymindmap:
  Mindmap + Dashboard = 살아있는 데이터 맵

유사한 제품:
  Notion database  → 표 형태 (맵 형태 없음)
  Obsidian graph   → 정적 (실시간 갱신 없음)

easymindmap의 차별화:
  맵 구조 + 실시간 데이터 = 거의 없는 조합
```
