easymindmap — Autosave Engine 개발 명세

문서 위치: docs/03-editor-core/autosave-engine.md
버전: v2.0
결정일: 2026-03-29

> **[v2.0 주요 변경 2026-03-29]**
> - 디바운스 타이밍 표준화: 텍스트/스타일 **800 ms**, 구조 변경 **즉시(0 ms)** (기존 1500 ms → 800 ms)
> - 버전 충돌 해소 정책 강화 (단순 reload → 3단계 전략)
> - 맵 공유/권한 모델 섹션 신규 추가


1. 개요
=======
Autosave는 에디터에서 발생하는 변경 사항을 사용자 개입 없이 자동으로 DB에 저장하는 엔진입니다.
핵심 원칙:

- 클라이언트 Document Store 변경 → 즉시 메모리 반영
- DB 저장은 debounce 후 patch 기반 저장
- Autosave 파이프라인은 편집 파이프라인과 완전히 분리


2. 클라이언트 Autosave 흐름
==========================
Document Store 변경
        │
        ▼
autosaveStore.markDirty(patch)
  dirty = true
  pendingPatches.push(patch)
        │
        ▼
debounce timer 시작 (액션 유형에 따라 결정)
  - 텍스트/스타일 변경: 800ms   ← [v2.0 확정]
  - 구조 변경(생성/삭제/이동/레이아웃): 즉시(0ms)
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


3. Patch 명세
=============
Patch 요청 body

```typescript
interface PatchRequest {
  clientId: string;       // 탭별 고유 ID (sessionStorage에 저장)
  patchId: string;        // idempotency key: "p_{timestamp}_{counter}"
  baseVersion: number;    // 클라이언트가 알고 있는 서버 버전
  timestamp: string;      // ISO 8601
  patches: NodePatch[];
}
```

Patch 종류 (NodePatch)

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


4. 서버 Patch 처리
==================
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


5. 버전 충돌 처리 (강화판 v2.0)
================================

## 5.1 충돌 발생 조건

```
클라이언트 baseVersion ≠ 서버 current_version
```

원인: 다른 탭/협업자가 먼저 저장해서 서버 버전이 앞서 올라간 경우

## 5.2 3단계 충돌 해소 전략

### 단계 1 — 자동 Rebase (무손실 우선)

```typescript
async function handleConflict(conflict: ConflictResponse): Promise<void> {
  // 1. 서버 최신 상태 로드
  const latestMap = await fetchMap(mapId);
  const serverVersion = latestMap.version;

  // 2. pendingPatches 를 최신 버전 기준으로 Rebase 시도
  const rebasedPatches = rebasePatches(pendingPatches, latestMap.nodes);

  if (rebasedPatches.conflicts.length === 0) {
    // 충돌 없음 → 자동으로 재전송
    await savePatchesAt(serverVersion, rebasedPatches.patches);
    documentStore.applyRemoteState(latestMap);
  } else {
    // 충돌 존재 → 단계 2로 진입
    await handleMergeConflict(latestMap, rebasedPatches.conflicts);
  }
}
```

### 단계 2 — 사용자 선택 (충돌 있을 때)

충돌이 감지되면 다음 중 하나를 사용자에게 선택하게 한다:

| 선택지 | 동작 | 설명 |
|--------|------|------|
| **내 변경 유지** | `overwrite` | 내 pendingPatches 강제 적용 (다른 사람 편집 덮어씀) |
| **서버 버전 수락** | `discard` | 서버 최신 상태로 복원, 내 변경 폐기 |
| **나중에 결정** | `defer` | 충돌 상태 로컬 보관, 에디터 계속 사용 |

```typescript
// 충돌 UI 토스트/모달 표시
showConflictDialog({
  message: '다른 곳에서 이 맵을 수정했습니다.',
  options: ['내 변경 유지', '서버 버전 수락', '나중에 결정'],
  onSelect: (choice) => resolveConflict(choice, latestMap),
});
```

### 단계 3 — Fallback (자동 해소 실패)

```typescript
// 자동 재시도가 모두 실패한 경우
// pendingPatches를 localStorage에 임시 보관
localStorage.setItem(`conflict_backup_${mapId}`, JSON.stringify(pendingPatches));
autosaveStore.saveError();
showSaveErrorToast({ withRecoveryButton: true });
// "복구하기" 버튼 → 사용자가 수동으로 재시도
```

## 5.3 Rebase 규칙 (자동 병합)

| 패치 유형 | 자동 병합 가능 여부 | 충돌 조건 |
|-----------|-------------------|-----------|
| `updateNodeText` | ✅ (다른 노드) | 동일 nodeId의 text 변경이 겹치면 충돌 |
| `updateNodeStyle` | ✅ (다른 노드 or 다른 스타일 키) | 동일 nodeId + key 겹치면 충돌 |
| `createNode` | ✅ 항상 가능 | (새 nodeId는 유일) |
| `deleteNode` | ⚠️ 확인 필요 | 이미 삭제된 노드를 삭제하려 할 때 → 무시 처리 |
| `moveNode` | ⚠️ 확인 필요 | 동일 노드를 양쪽에서 이동했으면 충돌 |
| `updateNodeLayout` | ✅ (다른 노드) | 동일 노드는 충돌 |


6. 실패 처리 및 재시도
======================

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


7. 저장 상태 UI
===============
저장 중:   ● Saving...     (회전 아이콘)
저장 완료: ✓ Saved         (체크 아이콘, 3초 후 사라짐)
저장 실패: ⚠ Save failed   (경고 아이콘 + 재시도 버튼)
오프라인:  ⚡ Offline       (변경 내용은 로컬 보관)
충돌 감지: ⚡ Conflict      (충돌 해소 다이얼로그 표시)


8. 즉시 저장 vs Debounce 저장 (v2.0 확정 정책)
================================================

> **[확정 2026-03-29]** 디바운스 시간: 텍스트/스타일 **800 ms**, 구조 변경 **즉시(0 ms)**
> 근거: 1500 ms는 사용자가 멈췄다고 느끼기에 너무 길고, 500 ms는 DB 왕복 부하 증가.
>        800 ms는 빠른 타이핑 패턴과 서버 부하 사이의 균형점.

```typescript
// 즉시 저장이 필요한 액션 (debounce 없음 = 0ms)
// 구조 변경은 데이터 무결성이 중요하므로 즉시 저장
const IMMEDIATE_SAVE_OPS: NodePatch['op'][] = [
  'createNode',       // 노드 생성
  'deleteNode',       // 노드 삭제
  'moveNode',         // 노드 이동 (드래그 완료 시)
  'updateNodeLayout', // 레이아웃 타입 변경
];

// debounce 저장 (800ms)
// 텍스트/스타일 변경은 타이핑 중 과도한 요청 방지
const DEBOUNCED_SAVE_OPS: NodePatch['op'][] = [
  'updateNodeText',   // 텍스트 편집 (타이핑 중)
  'updateNodeStyle',  // 스타일 변경 (색상/폰트/도형)
  'collapseNode',     // 접기/펼치기
  'updateMapMeta',    // 맵 메타 변경 (제목 등)
];

// 디바운스 상수
const DEBOUNCE_MS = {
  TEXT_STYLE: 800,   // 텍스트/스타일 변경
  IMMEDIATE: 0,      // 구조 변경
} as const;
```

디바운스 타이머 병합 규칙:
- 동일 nodeId에 대한 `updateNodeText` 패치가 800ms 내에 여러 번 발생하면 → 마지막 값만 전송
- 서로 다른 nodeId의 패치는 독립적으로 관리됨
- `IMMEDIATE_SAVE_OPS`가 발생하면 현재 대기 중인 DEBOUNCED 패치도 함께 즉시 플러시


9. 맵 공유 및 권한 모델
========================

## 9.1 권한 유형

| 권한 | 설명 | 편집 가능 | Autosave 작동 |
|------|------|-----------|--------------|
| `owner` | 맵 소유자 | ✅ | ✅ |
| `editor` | 워크스페이스 멤버 중 편집자 | ✅ | ✅ |
| `viewer` | 읽기 전용 (워크스페이스 멤버) | ❌ | ❌ |
| `public_read` | 공개 링크 열람자 (publish URL) | ❌ | ❌ |

권한 저장 위치:
- 워크스페이스 멤버: `public.workspace_members.role` (`'editor'` | `'viewer'`)
- 공개 맵: `public.published_maps` 테이블에 `publish_id` 기록

## 9.2 공유 URL 종류

| 유형 | URL 형식 | 접근 권한 | 특징 |
|------|----------|-----------|------|
| **편집 URL** | `/maps/{mapId}` | 인증 필요 (owner/editor) | Autosave 활성화 |
| **공개 보기 URL** | `/published/{publishId}` | 비인증 공개 | 읽기 전용, Autosave 없음 |
| **워크스페이스 공유** | `/workspaces/{id}/maps` | 워크스페이스 멤버 | role에 따라 편집/열람 |

## 9.3 공개 URL 가시성 정책

```
맵 소유자가 "공개 링크 생성" 버튼을 누르면:
  → published_maps 레코드 생성 (publish_id = nanoid(20))
  → 공개 URL: https://app.mindmap.ai.kr/published/{publish_id}
  → 이 URL은 누구나 접근 가능 (로그인 불필요)
  → 맵 내용은 read-only 스냅샷으로 제공

"링크 비활성화" 버튼:
  → published_maps.unpublished_at = NOW() 업데이트
  → 해당 publish_id URL은 더 이상 접근 불가 (404 반환)
```

## 9.4 권한별 Autosave 동작

```typescript
// 에디터 초기화 시 권한 확인
const { permission } = useMapPermission(mapId);

// permission === 'viewer' 또는 'public_read'이면
// Autosave 엔진 자체를 비활성화
if (permission === 'viewer' || permission === 'public_read') {
  autosaveStore.disable();  // markDirty 호출 시 no-op
  editor.setReadOnly(true); // 편집 UI 비활성화
}
```

## 9.5 협업 중 Autosave 동작

다중 사용자가 같은 맵을 동시 편집할 때:
1. 각 클라이언트는 독립적인 `clientId`를 가짐
2. 서버는 `patchId`로 중복 저장 방지 (멱등성)
3. WebSocket으로 다른 참가자에게 변경사항 broadcast
4. 버전 충돌 시 5절의 3단계 전략 적용

실시간 협업 상태 표시 (UI):
- 현재 편집 중인 사용자 커서: `CollabCursor` 컴포넌트
- 다른 사용자의 선택 노드: `CollabSelection` 컴포넌트 (하이라이트)
- 협업 참가자 목록: 에디터 우상단 아바타 표시
