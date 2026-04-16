# 12. History / Undo-Redo
## HISTORY

* 문서 버전: v1.0
* 작성일: 2026-04-15
* 참조: `docs/03-editor-core/command-history.md`, `docs/03-editor-core/autosave-engine.md`

---

### 1. 기능 목적

* 사용자가 수행한 편집 작업을 기록하고, **Undo(취소) / Redo(복원)** 을 제공하는 기능
* 실수로 수행한 편집을 빠르게 되돌리거나, 취소한 작업을 다시 복원할 수 있게 한다
* 전체 문서 스냅샷이 아닌 **Command(명령) 기반 patch 저장**으로 메모리 효율 확보
* Document Store와 분리된 독립 History Store로 관리하여 성능 및 유지보수성 보장

---

### 2. 기능 범위

* 포함:

  * Undo — 가장 최근 작업 취소 (`Ctrl+Z`)
  * Redo — 취소한 작업 복원 (`Ctrl+Y` / `Ctrl+Shift+Z`)
  * 2-Stack 구조 관리 (undoStack / redoStack)
  * Transaction 기반 batch 작업 묶음 (다중 가지 추가, paste, duplicate 등)
  * Coalescing — 텍스트 편집·drag 이동의 연속 작업 하나로 합산
  * 툴바 Undo/Redo 버튼 활성/비활성 상태 연동
  * Undo/Redo 실행 후 autosave 자동 트리거

* 제외:

  * 서버 버전 이력 (→ VERSION_HISTORY, `13-version-history.md`)
  * 선택/viewport/zoom 상태 변경 (히스토리 제외 대상)
  * 협업 충돌 해소 (→ COLLABORATION)
  * 영구 저장 (→ SAVE)

---

### 3. 세부 기능 목록

| 기능ID      | 기능명            | 설명                             | 단축키                             |
| ---------- | -------------- | ------------------------------ | -------------------------------- |
| HISTORY-01 | Undo           | 가장 최근 편집 작업 취소                 | `Ctrl+Z` / `Cmd+Z`               |
| HISTORY-02 | Redo           | 취소한 작업 복원                      | `Ctrl+Y` / `Ctrl+Shift+Z` / `Cmd+Shift+Z` |
| HISTORY-03 | Transaction    | 여러 연산을 1개 Undo 단위로 묶음          | 내부 처리                            |
| HISTORY-04 | Coalescing     | 연속 텍스트 입력·drag를 1개 항목으로 합산     | 내부 처리                            |
| HISTORY-05 | Stack 상태 표시   | 툴바 Undo/Redo 버튼 활성/비활성 + 툴팁    | UI 연동                            |
| HISTORY-06 | 히스토리 초기화      | 맵 재접속 시 History 스택 클리어         | 내부 처리                            |

---

### 4. 기능 정의 (What)

#### 4.1 History Store 구조

```typescript
type HistoryStore = {
  undoStack: HistoryEntry[];
  redoStack: HistoryEntry[];

  currentTransaction: HistoryTransaction | null;

  isApplyingHistory: boolean;   // 무한 루프 방지 플래그
  maxHistorySize: number;       // 기본값: 100

  pushEntry: (entry: HistoryEntry) => void;
  beginTransaction: (label?: string) => void;
  addToTransaction: (entry: HistoryEntry) => void;
  commitTransaction: () => void;
  cancelTransaction: () => void;

  undo: () => void;
  redo: () => void;
  clearHistory: () => void;
};
```

#### 4.2 HistoryEntry — 기록 단위

```typescript
type HistoryEntry = {
  id: string;
  type: HistoryActionType;
  label: string;           // UI 툴팁 표시용: "노드 생성", "텍스트 수정"
  timestamp: number;

  undo: HistoryOperation[];   // 되돌릴 연산 목록
  redo: HistoryOperation[];   // 다시 적용할 연산 목록

  meta?: {
    nodeId?: string;
    mapId?: string;
    source?: 'keyboard' | 'mouse' | 'api' | 'ai';
  };
};
```

#### 4.3 HistoryOperation — 실제 적용 명령

```typescript
type HistoryOperation =
  | { op: 'createNode';    node: NodeSnapshot; parentId: string | null; index: number }
  | { op: 'deleteNode';    nodeId: string }
  | { op: 'updateNodeText'; nodeId: string; text: string }
  | { op: 'moveNode';      nodeId: string;
      fromParentId: string | null; toParentId: string | null;
      fromIndex: number; toIndex: number;
      fromPosition?: { x: number; y: number };
      toPosition?: { x: number; y: number } }
  | { op: 'changeLayout';  nodeId: string; layoutType: string }
  | { op: 'updateStyle';   nodeId: string; style: Partial<NodeStyle> }
  | { op: 'setCollapsed';  nodeId: string; collapsed: boolean }
  | { op: 'addTag';        nodeId: string; tagId: string }
  | { op: 'removeTag';     nodeId: string; tagId: string };
```

#### 4.4 HistoryActionType

```typescript
type HistoryActionType =
  | 'createNode'
  | 'deleteNode'
  | 'editText'
  | 'moveNode'
  | 'changeLayout'
  | 'changeStyle'
  | 'collapseNode'
  | 'expandNode'
  | 'addTag'
  | 'removeTag'
  | 'pasteNodes'
  | 'duplicateNode'
  | 'multiCreateNodes'
  | 'batch';
```

#### 4.5 HistoryTransaction — batch 묶음

```typescript
type HistoryTransaction = {
  id: string;
  label: string;
  entries: HistoryEntry[];
  startedAt: number;
};
```

commit 시 내부 entries를 단일 batch HistoryEntry로 병합:

```typescript
// commitTransaction 결과
{
  id: 'tx-001',
  type: 'batch',
  label: '다중 가지 추가',
  undo: [...모든 undo 연산 역순 결합],
  redo: [...모든 redo 연산 정순 결합]
}
```

---

### 5. 동작 방식 (How)

#### 5.1 사용자 동작

| 입력                            | 결과                                  |
| ----------------------------- | ----------------------------------- |
| `Ctrl+Z` / `Cmd+Z`            | undoStack에서 pop → 역방향 연산 적용         |
| `Ctrl+Y` / `Ctrl+Shift+Z`     | redoStack에서 pop → 정방향 연산 재적용        |
| 노드 생성/삭제/이동/텍스트 수정 등         | undoStack에 push, redoStack 초기화       |
| 툴바 Undo 버튼 클릭                 | `Ctrl+Z`와 동일                        |
| 툴바 Redo 버튼 클릭                 | `Ctrl+Y`와 동일                        |

---

#### 5.2 시스템 처리 — 2-Stack 흐름

```
새 작업 발생:
  undoStack.push(newEntry)
  redoStack = []              ← 새 작업 시 redo 초기화

Undo 실행:
  entry = undoStack.pop()
  isApplyingHistory = true
  applyOperations(entry.undo)
  isApplyingHistory = false
  redoStack.push(entry)
  autosave.markDirty(inversePatches)  ← Undo 결과도 서버 저장

Redo 실행:
  entry = redoStack.pop()
  isApplyingHistory = true
  applyOperations(entry.redo)
  isApplyingHistory = false
  undoStack.push(entry)
  autosave.markDirty(patches)
```

---

#### 5.3 표시 방식

* 툴바 Undo 버튼: `undoStack.length > 0`이면 활성화
* 툴바 Redo 버튼: `redoStack.length > 0`이면 활성화
* 툴팁: 최근 entry의 `label` 표시 (예: "Undo 텍스트 수정", "Redo 노드 이동")

---

### 6. 규칙 (Rule)

---

#### 6.1 Command 기반 저장 원칙

* 전체 문서 스냅샷 저장 ❌
* 역연산 가능한 **Command/Patch** 저장 ✅
* 각 HistoryEntry는 `undo`와 `redo`가 모두 완전해야 한다

---

#### 6.2 2-Stack 규칙

| 상황          | undoStack      | redoStack      |
| ----------- | -------------- | -------------- |
| 새 작업 수행     | push           | 초기화 (`[]`)    |
| Undo 실행     | pop            | push           |
| Redo 실행     | push           | pop            |
| History 초기화 | `[]`           | `[]`           |

---

#### 6.3 Transaction 규칙

Transaction이 필요한 대표 경우:

* 다중 가지 추가 (`Ctrl+Space`)
* Paste 여러 노드
* Duplicate Subtree
* Subtree layout 변경 (하위 노드 전체)
* 여러 노드 일괄 스타일 변경

```typescript
beginTransaction('다중 가지 추가')
addToTransaction(entry1)   // 노드 A 생성
addToTransaction(entry2)   // 노드 B 생성
addToTransaction(entry3)   // 노드 C 생성
commitTransaction()
// → undoStack에 batch 1개만 push
```

---

#### 6.4 Coalescing 규칙

| 작업 유형      | 처리 방식                          |
| ---------- | ------------------------------ |
| 텍스트 편집     | 편집 시작 시 `beforeText` 저장, 편집 종료(blur/Enter/debounce) 시 1개 push |
| drag 이동    | pointermove 중간값 무시, drag end 시 1개 push |
| 노드 생성/삭제   | 매 작업마다 개별 push                 |
| paste      | 1개의 transaction으로 push          |
| layout 변경  | 개별 push                        |
| tag 추가/삭제  | 개별 push                        |

---

#### 6.5 isApplyingHistory 플래그 규칙

* Undo/Redo 실행 중 Document 변경이 새로운 HistoryEntry를 생성하면 stack이 꼬인다
* `isApplyingHistory = true` 구간에서는 새 HistoryEntry push 금지

```typescript
if (historyStore.isApplyingHistory) {
  // document 변경은 허용하되
  // 새 history entry는 생성하지 않음
  return;
}
```

---

#### 6.6 maxHistorySize 규칙

* 기본값: `100`개
* 초과 시 가장 오래된 항목(undoStack 맨 앞) 제거

```typescript
if (undoStack.length > maxHistorySize) {
  undoStack.shift();   // 가장 오래된 항목 제거
}
```

---

#### 6.7 히스토리 포함 / 제외 대상

| 포함 대상 (문서 변경) | 제외 대상 (UI 상태) |
| --------------- | -------------- |
| 노드 생성 / 삭제      | 선택 상태 변경       |
| 노드 텍스트 수정       | hover 상태       |
| 노드 이동           | viewport pan   |
| 레이아웃 변경         | zoom in/out    |
| 스타일 변경          | 패널 열기/닫기       |
| collapse/expand  | 검색 입력 중간값      |
| 태그 추가/삭제        | autosave 상태 표시 |
| paste/duplicate  |                |

---

#### 6.8 Undo/Redo 후 Autosave 규칙

* Undo/Redo 실행 결과도 문서 변경이므로 **autosave 대상**
* Undo 후 저장 시 새 `patchId` 생성 (`_undo` suffix)
* Redo 후 저장 시 새 `patchId` 생성 (`_redo` suffix)
* 기존 patchId 재사용 금지 (`map_revisions.patch_id UNIQUE` 제약)

```typescript
// Undo 실행 후 autosave
function applyUndo() {
  const inversePatches = historyStore.undo();
  autosaveStore.markDirty({
    patchId: generatePatchId('undo'),   // 항상 새 patchId
    patches: inversePatches,
  });
}
```

---

#### 6.9 삭제 Undo 규칙

* 단일 노드 삭제 Undo: 삭제 전 노드 snapshot 저장 → 복원
* **Subtree 삭제 Undo**: 루트 노드 + 재귀 하위 노드 전체 snapshot 저장 → 전체 복원
* `deleteSubtree` op를 별도로 두어 일괄 처리

```typescript
// Subtree 삭제 undo 연산
undo: subtreeSnapshot.map(node => ({
  op: 'createNode',
  node: node,
  parentId: node.parentId,
  index: node.orderIndex,
}))
```

---

### 7. 히스토리 동작 예시

#### 7.1 텍스트 수정

```typescript
// 편집 전: "AI", 편집 후: "Artificial Intelligence"
{
  type: 'editText',
  label: '텍스트 수정',
  undo: [{ op: 'updateNodeText', nodeId: 'n1', text: 'AI' }],
  redo: [{ op: 'updateNodeText', nodeId: 'n1', text: 'Artificial Intelligence' }]
}
```

#### 7.2 노드 이동

```typescript
{
  type: 'moveNode',
  label: '노드 이동',
  undo: [{ op: 'moveNode', nodeId: 'n5',
    fromParentId: 'p2', toParentId: 'p1',
    fromIndex: 0, toIndex: 3 }],
  redo: [{ op: 'moveNode', nodeId: 'n5',
    fromParentId: 'p1', toParentId: 'p2',
    fromIndex: 3, toIndex: 0 }]
}
```

#### 7.3 레이아웃 변경

```typescript
{
  type: 'changeLayout',
  label: '레이아웃 변경',
  undo: [{ op: 'changeLayout', nodeId: 'n10', layoutType: 'radial-right' }],
  redo: [{ op: 'changeLayout', nodeId: 'n10', layoutType: 'tree-down' }]
}
```

---

### 8. History Store vs map_revisions 구분

| 구분          | History Store (클라이언트)      | map_revisions (서버 DB)          |
| ----------- | -------------------------- | ------------------------------ |
| 저장 위치       | 브라우저 메모리 (Zustand)         | PostgreSQL (`public.map_revisions`) |
| 지속성         | 세션 한정 (새로고침 시 초기화)         | 영구 저장                          |
| 목적          | `Ctrl+Z / Y` 편집 취소·복원      | 버전 이력 조회, 협업 충돌 해소, 히스토리 패널     |
| 저장 단위       | 사용자 액션 단위 (Command)        | autosave 시마다 `NodePatch[]` 1 row |
| 최대 보존       | 기본 100개                    | 무제한 (DB 용량 한도)                 |
| 접근 주체       | 클라이언트 전용 — API 없음          | 서버 API 통해 버전 패널 조회             |
| 사용 시나리오     | "방금 전 텍스트 편집 취소"           | "3일 전 버전으로 롤백"                |

---

### 9. 예외 / 경계 (Edge Case)

* **undoStack 비어있는데 Undo 시도**: 동작 없음 (Undo 버튼 비활성 상태)
* **redoStack 비어있는데 Redo 시도**: 동작 없음 (Redo 버튼 비활성 상태)
* **새 작업 후 Redo**: redoStack 초기화 → Redo 불가
* **maxHistorySize 초과**: 가장 오래된 항목 자동 제거 (Undo 불가 범위 확대)
* **Transaction 중 오류**: `cancelTransaction()` 호출 → 현재 transaction 폐기
* **AI 생성 작업**: 사용자 확인 후 반영된 경우 History에 push (AI 미확인 preview는 제외)
* **협업 중 타인의 편집**: 타인 편집은 로컬 History에 포함하지 않음
* **루트 노드 삭제 시도 후 Undo**: 루트 노드 삭제 자체가 차단되므로 History 기록 없음
* **Autosave 실패 후 Undo**: Document Store 역방향 업데이트는 완료, autosave 실패는 별도 처리

---

### 10. 권한 규칙

| 역할      | 권한                        |
| ------- | ------------------------- |
| creator | Undo/Redo 전체 사용 가능        |
| editor  | Undo/Redo 사용 가능 (자신의 편집만) |
| viewer  | Undo/Redo 불가              |

---

### 11. DB 영향

* History Store는 **DB에 저장하지 않는다** (클라이언트 전용)
* Undo/Redo 실행 결과는 autosave를 통해 `map_revisions`에 간접 저장
* `map_revisions.patch_id`: Undo/Redo 후 재저장 시 새 `patchId` 생성 필수

관련 DB 테이블:

```sql
-- Undo/Redo 결과는 autosave 경유로 이 테이블에 기록됨
CREATE TABLE public.map_revisions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  map_id      UUID NOT NULL REFERENCES public.maps(id) ON DELETE CASCADE,
  version     INT  NOT NULL,
  patch_json  JSONB NOT NULL,
  client_id   VARCHAR(100),
  patch_id    VARCHAR(200) UNIQUE,    -- Undo/Redo 시 새 ID 필수
  created_by  UUID REFERENCES public.users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

---

### 12. API 영향

* History Store 자체는 API 없음 (클라이언트 전용)
* Undo/Redo 실행 후 autosave가 트리거하는 API:
  * `PATCH /maps/{mapId}/document` — 역방향 patch 서버 반영

---

### 13. 연관 기능

* NODE_EDITING (`02-node-editing.md` — 편집 작업이 History push 트리거)
* SAVE / AUTOSAVE (`14-save.md` — Undo/Redo 후 autosave 연동)
* VERSION_HISTORY (`13-version-history.md` — 서버 버전 이력과 역할 구분)
* LAYOUT (`08-layout.md` — 레이아웃 변경 Undo)
* SELECTION (`11-selection.md` — 선택 상태는 History 제외)
* COLLABORATION (협업 중 타인 편집과 History 분리)

---

### 14. 예시 시나리오

#### 시나리오 1 — 노드 삭제 후 Undo

1. 사용자: `기능 정의` 노드 `Delete`
2. 시스템: 노드 snapshot 저장 → `deleteNode` HistoryEntry push
3. autosave 트리거
4. 사용자: `Ctrl+Z`
5. 시스템: `isApplyingHistory = true`, `createNode` 연산 적용, `isApplyingHistory = false`
6. redoStack에 entry push
7. autosave 트리거 (복원 결과 서버 저장)

#### 시나리오 2 — 다중 가지 추가 Transaction

1. 사용자: `Ctrl+Space` → 여러 줄 입력
2. 시스템: `beginTransaction('다중 가지 추가')`
3. 각 노드 생성마다 `addToTransaction(entry)`
4. 입력 완료 → `commitTransaction()`
5. undoStack에 batch entry 1개 push
6. 사용자: `Ctrl+Z` → 전체 생성 노드 일괄 취소

#### 시나리오 3 — 텍스트 수정 Coalescing

1. 사용자: `목표` 노드 더블클릭 → `목표 및 방향성` 타이핑
2. 시스템: 편집 시작 시 `beforeText = '목표'` 저장, 타이핑 중 HistoryEntry push 없음
3. blur(편집 종료) 시: `editText` HistoryEntry 1개 push
4. 사용자: `Ctrl+Z` → `목표`로 복원

#### 시나리오 4 — Undo 후 새 작업

1. 사용자: 노드 A 생성 → 노드 B 생성
2. `Ctrl+Z` → 노드 B 삭제됨 (redoStack에 B 생성 entry)
3. 사용자: 노드 C 생성
4. 시스템: redoStack 초기화 → 노드 B Redo 불가
5. undoStack: [노드 A 생성, 노드 C 생성]

---

### 15. 구현 우선순위

#### MVP

* `createNode` / `deleteNode` Undo/Redo
* `editText` Undo/Redo + Coalescing
* `moveNode` Undo/Redo
* 툴바 Undo/Redo 버튼 상태 연동
* `isApplyingHistory` 플래그
* maxHistorySize 100개 제한

#### 2단계

* `changeLayout` Undo/Redo
* `setCollapsed` Undo/Redo
* `addTag / removeTag` Undo/Redo
* paste / duplicate Transaction
* drag 이동 Coalescing

#### 3단계

* Subtree 삭제 전체 복원
* 다중 가지 추가 Transaction
* AI 생성 노드 묶음 Transaction
* Subtree layout 일괄 변경 Transaction

---

### 16. Undo → 새 revision 생성 흐름 (13-version-history.md 연동)

> **⚠️ 개발 착수 전 반드시 확인해야 하는 정합성 규칙**
>
> History Store(클라이언트 Undo/Redo)와 map_revisions(서버 버전 이력)은 이름이 비슷하지만
> 목적·저장 위치·접근 방식이 완전히 다르다. 아래 흐름과 규칙을 숙지해야 한다.

#### 16.1 전체 아키텍처 흐름

```
사용자 편집
    │
    ▼
① Command 생성
    ├─── History Store.push(command)       ← 클라이언트 Undo 스택 (세션 한정)
    └─── Document Store 상태 변경
              │
              ▼
          autosaveStore.markDirty(patch)
              │
              ▼
          서버 PATCH /maps/{mapId}/document
              │
              ▼
          map_revisions에 1 row 삽입         ← 서버 버전 이력 (영구 저장)
```

Undo 실행 시에도 동일한 흐름을 따른다:

```
Ctrl+Z (Undo) 실행
    │
    ▼
② History Store.undo()
    ├─── undoStack.pop()
    ├─── isApplyingHistory = true
    ├─── applyOperations(entry.undo)       ← Document Store 역방향 업데이트
    └─── isApplyingHistory = false
              │
              ▼
          autosaveStore.markDirty({
            patchId: generatePatchId('undo'),  ← 반드시 새 patchId (_undo suffix)
            patches: inversePatches,
          })
              │
              ▼
          서버 PATCH /maps/{mapId}/document
              │
              ▼
          map_revisions에 새 revision 1 row 삽입  ← Undo 결과도 영구 이력으로 기록
```

#### 16.2 핵심 규칙

1. **History Store는 map_revisions를 직접 조회하거나 쓰지 않는다.**
   - History Store는 클라이언트 전용 상태 관리 계층이다.
   - map_revisions 접근은 항상 autosave 파이프라인을 경유한다.

2. **Ctrl+Z는 map_revisions를 rollback하는 것이 아니다.**
   - History Store의 undoStack을 pop하여 Document Store를 역방향으로 업데이트하는 것이다.
   - map_revisions는 rollback되지 않고, Undo 결과 patch가 **새 revision으로 추가**된다.

3. **버전 히스토리 패널(13-version-history.md) 롤백과 Undo/Redo는 독립적으로 동작한다.**
   - 버전 패널에서 과거 버전으로 이동하는 것은 map_revisions를 읽어서 Document Store를 교체하는 별도 작업이다.
   - 버전 롤백 실행 후에는 로컬 History Store(undoStack/redoStack)를 **초기화**한다.
   - 이후 사용자의 Ctrl+Z는 롤백 이전 상태가 아닌 롤백 이후 편집부터 취소한다.

4. **Undo 후 autosave 시 반드시 새 patchId를 생성해야 한다.**
   - `map_revisions.patch_id`에 `UNIQUE` 제약이 있으므로, 기존 patchId 재사용 시 DB 오류 발생.
   - Undo: `generatePatchId('undo')` → `p_{timestamp}_{counter}_undo`
   - Redo: `generatePatchId('redo')` → `p_{timestamp}_{counter}_redo`

#### 16.3 두 시스템 비교 — 아키텍처 흐름 요약

| 구분              | History Store (클라이언트)            | map_revisions (서버 DB)                      |
| --------------- | --------------------------------- | ------------------------------------------ |
| 저장 위치           | 브라우저 메모리 (Zustand)               | PostgreSQL (`public.map_revisions`)         |
| 지속성             | 세션 한정 (새로고침 시 초기화)               | 영구 저장 (서버 재시작 후에도 유지)                      |
| 목적              | `Ctrl+Z / Y` 편집 취소·복원 (즉각 반응)    | 버전 이력 조회, 협업 충돌 해소, 장기 롤백                  |
| 저장 단위           | 사용자 액션 단위 (Command)              | autosave 시마다 `NodePatch[]` 1 row            |
| 최대 보존           | 기본 100개 (maxHistorySize)          | 무제한 (DB 용량 한도)                             |
| 접근 주체           | 클라이언트 전용 — API 없음               | 서버 API 통해 버전 히스토리 패널 조회                    |
| Undo 발생 시       | undoStack.pop() → 역방향 연산 적용      | 역방향 patch가 새 revision으로 저장됨 (autosave 경유)  |
| 버전 롤백 발생 시      | History Store 초기화                | inverse patch → 새 revision 추가              |

#### 16.4 연동 시나리오 — Undo 후 새 revision 생성

아래는 Undo 실행이 어떻게 새 map_revision을 생성하는지 전체 흐름이다.

1. 사용자: `기능 정의` 노드 삭제
2. Document Store: 노드 삭제 반영
3. autosave: `deleteNode` patch → `PATCH /maps/{mapId}/document`
4. 서버: patch 적용 → `map_revisions` revision 42 생성
5. 사용자: `Ctrl+Z` (Undo)
6. History Store: `isApplyingHistory = true` → `createNode` 역방향 연산 적용 → `isApplyingHistory = false`
7. autosave: `patchId = generatePatchId('undo')` 새 ID 생성 → `PATCH /maps/{mapId}/document`
8. 서버: 복원 patch 적용 → `map_revisions` **revision 43 생성** (`patch_id` = `p_xxx_undo`)
9. 버전 히스토리 패널(13-version-history.md): revision 43이 목록에 추가됨

#### 16.5 연동 시나리오 — 버전 롤백 후 History Store 초기화

버전 히스토리 패널에서 롤백이 발생하면 로컬 Undo/Redo 스택을 초기화해야 한다.

```typescript
// POST /maps/{mapId}/revisions/{version}/restore 성공 후
async function handleVersionRestore(restoredVersion: number) {
  // 1. Document Store를 복원된 버전 상태로 교체
  documentStore.applyRestoredState(await fetchMapAtVersion(restoredVersion));

  // 2. History Store 초기화 — 롤백 이전 Undo/Redo 스택 무효화
  historyStore.clearHistory();

  // 3. autosave baseVersion 갱신
  autosaveStore.syncVersion(maps.current_version);
}
```

- 롤백 후 `undoStack`과 `redoStack`이 비워지므로 Undo/Redo 버튼 비활성화 상태로 전환
- 이후 사용자의 새 편집은 복원된 상태 기준으로 History에 기록 시작

#### 16.6 참조 문서

* `docs/03-editor-core/history/13-version-history.md` — 버전 이력 패널, 롤백 규칙, revision 생성 흐름
* `docs/03-editor-core/autosave-engine.md` — autosave 파이프라인, patchId 생성 규칙, IMMEDIATE_SAVE_OPS
* `docs/02-domain/db-schema.md § map_revisions` — 서버 이력 테이블 DDL
* `docs/03-editor-core/save/14-save.md` — SAVE 기능 전체 명세

---
