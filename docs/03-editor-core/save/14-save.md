# 14. Save
## SAVE

* 문서 버전: v1.0
* 작성일: 2026-04-16
* 참조: `docs/03-editor-core/autosave-engine.md`, `docs/03-editor-core/history/12-history-undo-redo.md`

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
PATCH /maps/{mapId}/document
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

* `PATCH /maps/{mapId}/document` — autosave 핵심 엔드포인트

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
