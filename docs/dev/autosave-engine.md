# easymindmap — Autosave Engine 개발 명세

> 문서 위치: `docs/dev/autosave-engine.md`

---

## 1. 개요

Autosave는 에디터에서 발생하는 변경 사항을 사용자 개입 없이 자동으로 DB에 저장하는 엔진입니다.

**핵심 원칙:**
- 클라이언트 Document Store 변경 → 즉시 메모리 반영
- DB 저장은 debounce 후 patch 기반 저장
- Autosave 파이프라인은 편집 파이프라인과 완전히 분리

---

## 2. 클라이언트 Autosave 흐름

```
Document Store 변경
        │
        ▼
autosaveStore.markDirty(patch)
  dirty = true
  pendingPatches.push(patch)
        │
        ▼
debounce timer 시작 (500ms~1500ms)
  - 텍스트 편집: 1500ms
  - 노드 이동/삭제/생성: 즉시(0ms)
        │
        ▼
savePendingPatches() 실행
  {
    clientId: "cli_abc123",
    patchId:  "p_1710598325_001",
    baseVersion: 128,
    timestamp: "2026-03-16T14:32:05.123Z",
    patches: [...]
  }
        │
        ▼
PATCH /maps/:id/document
        │
   ┌────┴────┐
성공           실패
   │           │
   ▼           ▼
dirty=false   pendingPatches 유지
version sync  retry backoff
              UI warning 표시
```

---

## 3. Patch 명세

### Patch 요청 body

```typescript
interface PatchRequest {
  clientId: string;       // 탭별 고유 ID (sessionStorage에 저장)
  patchId: string;        // idempotency key: "p_{timestamp}_{counter}"
  baseVersion: number;    // 클라이언트가 알고 있는 서버 버전
  timestamp: string;      // ISO 8601
  patches: NodePatch[];
}
```

### Patch 종류 (NodePatch)

```typescript
type NodePatch =
  | { op: 'updateNodeText';   nodeId: string; text: string; }
  | { op: 'createNode';       node: NodeData; }
  | { op: 'deleteNode';       nodeId: string; }
  | { op: 'moveNode';         nodeId: string; parentId: string; orderIndex: number; }
  | { op: 'updateNodeStyle';  nodeId: string; style: Partial<NodeStyle>; }
  | { op: 'updateNodeLayout'; nodeId: string; layoutType: string; }
  | { op: 'collapseNode';     nodeId: string; collapsed: boolean; }
  | { op: 'updateMapMeta';    meta: Partial<MapMeta>; }
```

---

## 4. 서버 Patch 처리

```
PATCH /maps/:id/document 수신
        │
        ▼
1. patchId 중복 검사 (Redis SET NX로 구현)
   이미 처리됨 → 200 OK 반환 (멱등성 보장)
        │
        ▼
2. baseVersion vs current_version 비교
   불일치 → 409 Conflict { currentVersion }
        │
        ▼
3. 트랜잭션 시작
   - 각 patch 적용 (nodes UPDATE/INSERT/DELETE)
   - current_version + 1
   - map_revisions INSERT (patch_json 포함)
        │
        ▼
4. Redis snapshot:{mapId} DEL (캐시 무효화)
        │
        ▼
5. WebSocket broadcast (협업 참가자)
        │
        ▼
6. 200 OK { newVersion }
```

---

## 5. 버전 충돌 처리

### 409 응답 처리 (클라이언트)

```typescript
async function handleConflict(conflict: ConflictResponse): Promise<void> {
  // 서버의 최신 버전으로 맵 재로드
  const latestMap = await fetchMap(mapId);
  documentStore.loadMap(latestMap);

  // pendingPatches 재시도
  // (이미 반영된 변경 사항이 있을 수 있으므로 diff 후 재적용)
  retryPendingPatches(latestMap.version);
}
```

---

## 6. 실패 처리 및 재시도

```typescript
const RETRY_DELAYS = [1000, 2000, 4000, 8000]; // exponential backoff

async function saveWithRetry(attempt = 0): Promise<void> {
  try {
    await apiClient.patch(`/maps/${mapId}/document`, buildPayload());
    autosaveStore.saveSuccess();
  } catch (error) {
    if (attempt < RETRY_DELAYS.length) {
      await sleep(RETRY_DELAYS[attempt]);
      return saveWithRetry(attempt + 1);
    }
    // 최종 실패
    autosaveStore.saveError();
    showSaveErrorToast();
  }
}
```

---

## 7. 저장 상태 UI

```
저장 중:   ● Saving...     (회전 아이콘)
저장 완료: ✓ Saved         (체크 아이콘, 3초 후 사라짐)
저장 실패: ⚠ Save failed   (경고 아이콘 + 재시도 버튼)
오프라인:  ⚡ Offline       (변경 내용은 로컬 보관)
```

---

## 8. 즉시 저장 vs Debounce 저장

```typescript
// 즉시 저장이 필요한 액션 (debounce 없음)
const IMMEDIATE_SAVE_OPS = [
  'createNode',
  'deleteNode',
  'moveNode',
  'updateNodeLayout',
];

// debounce 저장 (1500ms)
const DEBOUNCED_SAVE_OPS = [
  'updateNodeText',
  'updateNodeStyle',
  'collapseNode',
];
```
