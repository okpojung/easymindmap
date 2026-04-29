# 14. Save
## SAVE

* 문서 버전: v1.0
* 작성일: 2026-04-16
* 참조: `docs/01-product/functional-spec.md § SAVE`, `docs/03-editor-core/history/12-history-undo-redo.md`, `docs/03-editor-core/history/13-version-history.md`

---

### 1. 기능 목적

* 사용자 편집 내용을 **Patch 기반으로 자동 저장(Autosave)** 하는 기능
* 편집 중 브라우저 종료·네트워크 오류 발생 시 데이터 손실 방지
* 전체 문서 저장이 아닌 변경된 부분만 전송하여 네트워크 효율 최적화
* Debounce + 즉시 저장 혼용 전략으로 성능과 안전성 동시 확보

---

### 2. 기능 범위

* 포함:
  * Patch 기반 자동 저장 (Debounce / 즉시 저장)
  * 저장 상태 표시 (Saving... / Saved / Error)
  * patchId 기반 멱등성 보장 (중복 저장 방지)
  * baseVersion 충돌 감지 및 3단계 해소 전략
  * 네트워크 오류 시 자동 재시도 (Exponential Backoff)
  * localStorage 임시 백업 (최후 안전망)
  * Undo/Redo 실행 후 자동 저장 연동

* 제외:
  * 수동 저장 버튼 (현재 정책: autosave 전용)
  * 버전 이력 관리 (→ VERSION_HISTORY)
  * Undo/Redo 히스토리 (→ HISTORY)

---

### 3. 세부 기능 목록

| 기능ID   | 기능명              | 설명                              | 주요 동작          |
| ------- | ---------------- | ------------------------------- | -------------- |
| SAVE-01 | 자동 저장 (Autosave) | 편집 발생 시 자동으로 서버에 patch 저장       | Debounce / 즉시  |
| SAVE-02 | 저장 상태 표시         | Status Bar에 Saving.../Saved/Error 표시 | UI 상태 반영       |
| SAVE-03 | 멱등성 보장           | 동일 patchId 중복 저장 차단             | Redis SET NX   |
| SAVE-04 | 충돌 해소            | baseVersion 불일치 시 3단계 해소        | 409 Conflict 처리 |
| SAVE-05 | 자동 재시도           | 네트워크 오류 시 Exponential Backoff    | 최대 4회 재시도      |
| SAVE-06 | localStorage 백업  | 재시도 실패 시 로컬 임시 저장 + 복구 버튼       | 최후 안전망         |
| SAVE-07 | Undo/Redo 저장 연동  | Undo/Redo 실행 결과도 autosave 트리거   | 새 patchId 생성   |

---

### 4. 기능 정의 (What)

#### 4.1 Debounce 저장 전략

| 변경 유형                | 저장 타이밍        | 이유                  |
| -------------------- | ------------- | ------------------- |
| 텍스트 수정 / 스타일 변경      | 800ms debounce | 타이핑 중 매 키마다 저장 방지   |
| 구조 변경 (생성/삭제/이동)     | 0ms 즉시        | 데이터 손실 위험           |
| Layout 변경            | 0ms 즉시        | 즉시 반영 필요            |
| 다중 노드 일괄 변경 (bulk)   | 0ms 즉시        | 트랜잭션 단위로 일괄 처리      |

#### 4.2 Patch 요청 구조

```typescript
interface PatchRequest {
  clientId: string;      // 탭별 고유 ID (sessionStorage)
  patchId: string;       // 멱등성 키: "p_{timestamp}_{counter}"
  baseVersion: number;   // 클라이언트가 알고 있는 서버 버전
  timestamp: string;     // ISO 8601
  patches: NodePatch[];
}

type NodePatch =
  | { op: 'updateNodeText';   nodeId: string; text: string }
  | { op: 'createNode';       node: NodeData }
  | { op: 'deleteNode';       nodeId: string }
  | { op: 'moveNode';         nodeId: string; parentId: string; orderIndex: number }
  | { op: 'updateNodeStyle';  nodeId: string; style: Partial<NodeStyle> }
  | { op: 'updateNodeLayout'; nodeId: string; layoutType: string }
  | { op: 'collapseNode';     nodeId: string; collapsed: boolean }
  | { op: 'updateMapMeta';    meta: Partial<MapMeta> };
```

#### 4.3 patchId 생성 규칙

```typescript
let counter = 0;
function generatePatchId(type: 'normal' | 'undo' | 'redo' = 'normal'): string {
  counter++;
  const suffix = type !== 'normal' ? `_${type}` : '';
  return `p_${Date.now()}_${counter.toString().padStart(3, '0')}${suffix}`;
}
```

---

### 5. 동작 방식 (How)

#### 5.1 사용자 동작

* 편집 발생 시 자동 저장 (별도 동작 불필요)
* Status Bar에서 저장 상태 실시간 확인 가능
* 저장 오류 발생 시 배너 + `[임시저장 복구]` 버튼 표시

---

#### 5.2 시스템 처리 흐름

```
사용자 편집
    │
    ▼
Document Store 즉시 메모리 반영
    │
    ▼
autosaveStore.markDirty(patch)
    ├─ 구조 변경 → 즉시 flush
    └─ 텍스트/스타일 → 800ms debounce
    │
    ▼
PATCH /maps/{mapId}/nodes
    ├─ 1. patchId 중복 검사 (Redis SET NX)
    ├─ 2. baseVersion 비교 → 불일치 시 409
    ├─ 3. 각 patch 적용 (nodes 테이블)
    ├─ 4. maps.current_version + 1
    └─ 5. map_revisions INSERT
```

---

#### 5.3 충돌 해소 3단계 전략

| 단계  | 처리 방식                                         |
| --- | --------------------------------------------- |
| 1단계 | 자동 rebase — 최신 버전 pull 후 patch 재적용            |
| 2단계 | 자동 rebase 실패 → 사용자 선택 (내 변경 유지 / 서버 채택 / 나중에) |
| 3단계 | 해소 불가 → localStorage 백업 + 복구 버튼              |

---

#### 5.4 재시도 전략

```
1차 실패 → 1초 대기 → 재시도
2차 실패 → 2초 대기 → 재시도
3차 실패 → 4초 대기 → 재시도
4차 실패 → 8초 대기 → 재시도
5차 실패 → Error 상태 + localStorage 백업
```

---

#### 5.5 Status Bar 표시

| 상태         | 표시                    |
| ---------- | --------------------- |
| 저장 중       | `Saving...` (spinner) |
| 저장 완료      | `Saved` ✓             |
| 재시도 중      | `Retrying...`         |
| 최종 오류      | `⚠ Save Error`        |

---

### 6. 규칙 (Rule)

#### 6.1 즉시 저장 대상
* 노드 생성 / 삭제 / 이동
* Layout 변경 / Bulk 변경

#### 6.2 Debounce 대상
* 텍스트 수정 (800ms)
* 스타일 변경 (800ms)

#### 6.3 멱등성 규칙
* 동일 `patchId` 재전송 시 200 OK 반환 (재처리 없음)
* Undo/Redo 후 저장 시 반드시 새 `patchId` 생성

#### 6.4 권한 규칙

| 역할          | Autosave |
| ----------- | -------- |
| owner       | ✅        |
| editor      | ✅        |
| viewer      | ❌        |
| public_read | ❌        |

---

### 7. 예외 / 경계 (Edge Case)

* **오프라인 상태**: 재시도 큐에 patch 누적 → 온라인 복귀 시 순차 전송
* **다중 탭 동시 편집**: `clientId` + `baseVersion`으로 충돌 감지 후 해소 전략 적용
* **새로고침 직전 미저장**: `beforeunload` 이벤트에서 즉시 flush 시도
* **viewer 편집 시도**: 권한 체크로 API 호출 전 차단
* **대용량 patch (100+ 노드)**: 분할 전송 처리

---

### 8. DB 영향

* `nodes` — patch 적용 대상
* `maps.current_version` — 저장마다 +1 증가
* `map_revisions` — patch_json 영구 저장

---

### 9. API 영향

* `PATCH /maps/{mapId}/nodes` — autosave 핵심 엔드포인트

---

### 10. 연관 기능

* VERSION_HISTORY (`13-version-history.md`)
* HISTORY (`12-history-undo-redo.md`)
* NODE_EDITING (`02-node-editing.md`)
* COLLABORATION (`25-map-collaboration.md`)

---

### 11. 구현 우선순위

#### MVP
* 구조 변경 즉시 저장 / 텍스트 debounce 저장
* patchId 멱등성 / Status Bar 표시
* 네트워크 오류 재시도 (4회)

#### 2단계
* baseVersion 충돌 해소 3단계
* localStorage 임시 백업 + 복구 버튼

#### 3단계
* 오프라인 큐 / 다중 탭 고도화

---

### 12. 서버 저장 처리 세부 단계

#### 12.1 전체 처리 순서

`autosave-engine.md`에서 정의된 서버 측 전체 처리 흐름은 다음과 같다.

```
PATCH /maps/{mapId}/nodes 수신
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
   - moveNode 패치: orderIndex 삽입 전 gap 검사 → [12.2 참조]
   - current_version + 1
   - map_revisions INSERT (patch_json 포함)
        │
        ▼
4. Redis snapshot:{mapId} DEL (캐시 무효화) → [12.3 참조]
        │
        ▼
5. WebSocket broadcast (협업 참가자) → [12.4 참조]
        │
        ▼
6. 200 OK { newVersion }
```

---

#### 12.2 orderIndex 재정규화 트리거

`moveNode` 패치를 적용할 때, 삽입 위치 앞뒤 노드의 `orderIndex` 간격이 너무 좁아지면 재정규화를 수행한 뒤 재삽입한다.

```
moveNode 패치 처리 시:
  prev_order = 삽입 위치 직전 노드의 orderIndex
  next_order = 삽입 위치 직후 노드의 orderIndex

  if |prev_order - next_order| < 0.001:
    → renormalizeOrderIndex() 실행 (전체 형제 노드 orderIndex 재부여)
    → 재정규화 완료 후 moveNode 재삽입
  else:
    → 일반 삽입
```

* 트리거 조건: `|prev_order - next_order| < 0.001`
* 재정규화 함수: `renormalizeOrderIndex(parentId)` — 해당 부모의 모든 자식에 균등 간격 부여
* 세부 정책: `node-hierarchy-storage-strategy.md § 재정규화` 참조

---

#### 12.3 Redis 스냅샷 캐시 무효화

서버에 patch가 성공적으로 적용되면, 즉시 Redis에 저장된 맵 스냅샷 캐시를 삭제하여 오래된 스냅샷이 클라이언트에게 제공되는 것을 방지한다.

```
캐시 키: snapshot:{mapId}
무효화 시점: map_revisions INSERT 직후
무효화 방식: Redis DEL snapshot:{mapId}
```

| 상황                   | 처리 방식                                    |
| -------------------- | ---------------------------------------- |
| 정상 저장 완료             | `DEL snapshot:{mapId}` 즉시 실행            |
| 트랜잭션 롤백 시            | DEL 실행 안 함 (patch 미적용이므로 캐시 유효)          |
| 공개 맵 (`published_maps`) | 별도 캐시 키 관리 필요 (`snapshot:published:{publishId}`) |

다음 조회 시 캐시 MISS → DB에서 최신 상태 재로드 → Redis에 재캐시.

---

#### 12.4 WebSocket 협업 브로드캐스트

patch 저장 완료 후, 같은 맵을 열고 있는 **다른 협업 참가자**에게 변경 사항을 실시간으로 전파한다.

```
브로드캐스트 대상: 동일 mapId의 WebSocket 연결 중인 모든 클라이언트 (요청자 제외)
브로드캐스트 시점: Redis DEL 직후 (step 4 완료 후)
```

브로드캐스트 페이로드 예시:

```typescript
{
  type: 'patch',
  mapId: 'map_xyz',
  newVersion: 129,
  patches: [...NodePatch[]],
  clientId: 'cli_abc123',    // 원본 요청자 clientId (수신자 식별용)
  patchId: 'p_1710598325_001'
}
```

수신 클라이언트 처리:
1. `clientId`가 자신이면 무시 (자신의 patch 반영은 이미 완료)
2. `newVersion`과 로컬 `baseVersion` 비교
3. 정상 → Document Store에 patch 적용 + `baseVersion` 갱신
4. 버전 불일치 → 전체 맵 재로드

협업 UI 연동:
* 다른 사용자의 변경이 수신되면 해당 노드에 잠깐 하이라이트 표시
* 실시간 협업 커서: `CollabCursor` 컴포넌트
* 협업 참가자 목록: 에디터 우상단 아바타

---

### 13. 저장 상태 전체 표시 목록

| 상태         | 표시                          |
| ---------- | --------------------------- |
| 저장 중       | `● Saving...` (회전 아이콘)      |
| 저장 완료      | `✓ Saved` (3초 후 사라짐)        |
| 재시도 중      | `Retrying...`               |
| 최종 오류      | `⚠ Save failed` (재시도 버튼 포함) |
| 오프라인       | `⚡ Offline` (로컬 보관 중)       |
| 충돌 감지      | `⚡ Conflict` (충돌 해소 다이얼로그)  |
