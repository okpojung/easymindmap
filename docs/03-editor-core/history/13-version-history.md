# 13. Version History
## VERSION_HISTORY

* 문서 버전: v1.0
* 작성일: 2026-04-15
* 참조: `docs/02-domain/db-schema.md § map_revisions`, `docs/03-editor-core/save/14-save.md`, `docs/03-editor-core/history/12-history-undo-redo.md`

---

### 1. 기능 목적

* 맵의 편집 이력을 **서버에 영구 저장**하여 과거 버전 조회 및 복원을 제공하는 기능
* autosave가 서버에 patch를 저장할 때마다 `map_revisions`에 1 row씩 자동 누적
* 버전 히스토리 패널에서 타임라인 형태로 과거 편집 내역 탐색
* 특정 시점 버전으로 롤백(Restore) 가능
* 클라이언트 Undo/Redo(세션 한정)와 달리 **영구적·서버 기반 버전 관리** 제공

---

### 2. 기능 범위

* 포함:

  * autosave 저장 시 자동 revision 생성
  * 버전 히스토리 패널 (타임라인 목록 조회)
  * 특정 버전 미리보기 (read-only)
  * 특정 버전으로 롤백(Restore)
  * 작성자 / 저장 시각 표시
  * 버전 번호(version) 기반 순서 관리

* 제외:

  * 클라이언트 Undo/Redo (→ HISTORY, `12-history-undo-redo.md`)
  * 협업 충돌 해소 (→ COLLABORATION)
  * 삭제된 맵 복구 (→ MAP 휴지통 정책)

---

### 3. 세부 기능 목록

| 기능ID  | 기능명             | 설명                            | 단계  |
| ----- | --------------- | ----------------------------- | --- |
| VH-01 | 자동 revision 생성  | autosave 저장 시마다 map_revisions에 1 row 생성 | MVP |
| VH-02 | 버전 히스토리 패널     | 타임라인 형태 버전 목록 조회              | V1  |
| VH-03 | 버전 상세 조회        | 특정 버전의 patch_json 내역 확인       | V1  |
| VH-04 | 버전 미리보기         | 특정 버전 맵 read-only 렌더링         | V1  |
| VH-05 | 버전 롤백 (Restore) | 특정 버전으로 현재 맵 상태 복원            | V1  |
| VH-06 | 작성자 / 시각 표시     | 각 revision의 created_by / created_at 표시 | V1  |

---

### 4. 기능 정의 (What)

#### 4.1 map_revisions 테이블

```sql
CREATE TABLE public.map_revisions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  map_id      UUID NOT NULL REFERENCES public.maps(id) ON DELETE CASCADE,
  version     INT  NOT NULL,           -- 맵별 단조 증가 버전 번호
  patch_json  JSONB NOT NULL,          -- 이 revision에서 변경된 NodePatch[] 목록
  client_id   VARCHAR(100),            -- 저장을 요청한 클라이언트 탭 ID
  patch_id    VARCHAR(200) UNIQUE,     -- 멱등성 키 (Undo/Redo 재저장 시 새 ID 필수)
  created_by  UUID REFERENCES public.users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_map_revisions_map_id
  ON public.map_revisions(map_id, version DESC);
```

#### 4.2 NodePatch 종류 (patch_json에 저장되는 단위)

```typescript
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

#### 4.3 revision 생성 흐름

```
사용자 편집
    │
    ▼
Document Store 상태 변경
    │
    ▼
autosaveStore.markDirty(patch)
    │
    ▼
PATCH /maps/{mapId}/document
    │
    ├─ patchId 중복 검사 (Redis SET NX)
    ├─ baseVersion 비교 (409 Conflict 처리)
    ├─ 각 patch 적용 (nodes UPDATE/INSERT/DELETE)
    ├─ maps.current_version + 1
    └─ map_revisions INSERT (version, patch_json, client_id, patch_id, created_by)
```

#### 4.4 버전 히스토리 패널 구조

```text
┌──────────────────────────────────────────────┐
│  버전 이력          [닫기 ✕]                  │
├──────────────────────────────────────────────┤
│  ● v42  2026-04-15 14:32  홍길동              │
│    └─ 노드 3개 수정, 레이아웃 변경              │
│                                              │
│  ○ v41  2026-04-15 14:28  홍길동              │
│    └─ 텍스트 수정                             │
│                                              │
│  ○ v38  2026-04-15 13:51  김철수              │
│    └─ 노드 추가                               │
│                                              │
│  ○ v35  2026-04-14 09:12  홍길동              │
│    └─ 초기 생성                               │
│                           [이 버전으로 복원]   │
└──────────────────────────────────────────────┘
```

#### 4.5 patch_id 생성 규칙 (Undo/Redo 후 재저장 시)

```typescript
let counter = 0;
function generatePatchId(type: 'normal' | 'undo' | 'redo' = 'normal'): string {
  counter++;
  const suffix = type !== 'normal' ? `_${type}` : '';
  return `p_${Date.now()}_${counter.toString().padStart(3, '0')}${suffix}`;
}

// Undo 실행 후 autosave
autosaveStore.markDirty({
  patchId: generatePatchId('undo'),   // p_1744721234567_001_undo
  patches: inversePatches,
});
```

---

### 5. 동작 방식 (How)

#### 5.1 사용자 동작

| 동작                        | 결과                               |
| ------------------------- | -------------------------------- |
| 맵 편집 후 autosave 발생        | map_revisions에 revision 자동 생성    |
| 히스토리 패널 열기 (좌측 사이드바)      | 버전 목록 조회 (최신순)                   |
| 특정 버전 클릭                  | 해당 버전 정보 표시 (작성자/시각/변경 요약)       |
| `[미리보기]` 버튼                | 해당 버전 맵 read-only 렌더링           |
| `[이 버전으로 복원]` 버튼           | 해당 버전으로 현재 맵 롤백 (새 revision 생성)  |
| 미리보기 종료                   | 현재 버전으로 복귀                      |

---

#### 5.2 시스템 처리

**버전 목록 조회:**

```
GET /maps/{mapId}/revisions?limit=50&cursor={version}
  → map_revisions WHERE map_id = ? ORDER BY version DESC
  → 버전 번호, created_at, created_by, patch_json 요약 반환
```

**버전 미리보기:**

```
GET /maps/{mapId}/revisions/{version}
  → 해당 version까지의 patch를 순차 적용하여 맵 상태 재구성
  → read-only Document Store에 주입 → 캔버스 렌더링
```

**버전 롤백(Restore):**

```
POST /maps/{mapId}/revisions/{version}/restore
  → 해당 version의 맵 상태 계산
  → 현재 버전과의 diff → inverse patch 생성
  → 새 revision으로 저장 (롤백 이력도 기록)
  → maps.current_version + 1
```

---

#### 5.3 표시 방식

* 히스토리 패널: 좌측 사이드바 또는 별도 슬라이드 패널
* 버전 목록: 최신순, 작성자 아바타 / 시각 / 변경 요약 표시
* 현재 버전: `●` 표시, 과거 버전: `○` 표시
* 미리보기 상태: 상단 배너 "v41 버전 미리보기 중 — 현재 편집 불가"
* 롤백 후: autosave 트리거, 히스토리 패널 갱신

---

### 6. 규칙 (Rule)

---

#### 6.1 revision 생성 규칙

* autosave 1회 = revision 1개 생성
* version은 맵별로 단조 증가 (1, 2, 3, ...)
* `patch_id UNIQUE` 제약: 동일 patchId 중복 저장 차단 (멱등성 보장)
* Undo/Redo 후 저장도 새 revision 생성 (새 patchId 사용)

---

#### 6.2 버전 번호 규칙

* `maps.current_version`이 항상 최신 버전 번호를 가진다
* 신규 편집 저장 시: `current_version + 1`
* 롤백 저장 시: 역시 `current_version + 1` (롤백도 새 revision)
* 과거 revision의 version 번호는 불변

---

#### 6.3 롤백 규칙

* 롤백은 과거 버전을 "덮어쓰기"가 아닌 **새 revision으로 추가**
* 롤백 후 히스토리는 보존됨 (롤백 전 버전들 삭제 안 함)
* 롤백 실행도 autosave와 동일하게 `PATCH /maps/{mapId}/document`로 처리

---

#### 6.4 미리보기 규칙

* 미리보기 중 편집 불가 (read-only 모드)
* 미리보기 캔버스는 현재 편집 캔버스와 분리된 별도 Document Store 인스턴스 사용
* 미리보기 종료 시 현재 편집 상태 복귀 (현재 버전 유지)

---

#### 6.5 버전 보존 정책

* 기본: 무제한 보존 (DB 용량 한도 내)
* 향후 확장: 오래된 revision 자동 압축 정책 (30일 이상 patch → snapshot으로 병합)

---

#### 6.6 History Store와의 역할 구분

* Undo/Redo(History Store): 세션 내 빠른 취소·복원, 클라이언트 전용
* Version History(map_revisions): 영구 이력, 서버 저장, 장기 롤백
* 두 기능은 독립적으로 동작하며 서로 호출하지 않는다

---

### 7. 협업 시 버전 관리

* 협업 중 여러 사용자의 편집은 각각 별도 revision으로 저장
* `created_by` 필드로 작성자 구분
* `baseVersion` 충돌 시 서버가 409 Conflict 반환 → 클라이언트가 최신 버전 재동기화 후 재시도
* 버전 히스토리 패널에서 협업자별 편집 이력 시각적으로 구분 가능

---

### 8. 예외 / 경계 (Edge Case)

* **버전 히스토리가 없는 새 맵**: 패널에 "아직 저장된 버전이 없습니다" 표시
* **revision 수 매우 많음 (1000+)**: 페이지네이션(cursor 기반) 조회
* **롤백 중 네트워크 오류**: 현재 버전 유지, 오류 메시지 표시 후 재시도
* **미리보기 중 다른 사용자가 편집**: 미리보기는 고정 스냅샷 — 실시간 갱신 없음
* **baseVersion 충돌 (409)**: autosave 엔진이 최신 version pull 후 재시도
* **patch_id 중복**: Redis SET NX로 서버단 차단, 200 OK 반환 (멱등성)
* **삭제된 맵의 revision**: `maps.id ON DELETE CASCADE`로 자동 삭제

---

### 9. 권한 규칙

| 역할      | 권한                               |
| ------- | -------------------------------- |
| creator | 버전 목록 조회 / 미리보기 / 롤백 전체 가능      |
| editor  | 버전 목록 조회 / 미리보기 가능, 롤백은 정책에 따라  |
| viewer  | 현재 버전만 읽기 가능, 히스토리 패널 미접근       |

---

### 10. DB 영향

* `map_revisions` — 핵심 테이블 (version, patch_json, patch_id, created_by, created_at)
* `maps.current_version` — 최신 버전 번호 관리
* 인덱스: `idx_map_revisions_map_id (map_id, version DESC)` — 버전 목록 조회 성능

---

### 11. API 영향

* `PATCH /maps/{mapId}/document` — autosave 저장 (revision 자동 생성)
* `GET /maps/{mapId}/revisions` — 버전 목록 조회 (페이지네이션)
* `GET /maps/{mapId}/revisions/{version}` — 특정 버전 상태 조회
* `POST /maps/{mapId}/revisions/{version}/restore` — 특정 버전으로 롤백

---

### 12. 연관 기능

* HISTORY (`12-history-undo-redo.md` — 클라이언트 Undo/Redo와 역할 구분)
* SAVE / AUTOSAVE (`14-save.md` — revision 생성 트리거)
* COLLABORATION (협업자별 revision 구분, 충돌 해소)
* MAP (`01-map.md` — maps.current_version 필드)
* NODE_EDITING (`02-node-editing.md` — 편집 → patch → revision 흐름)

---

### 13. 예시 시나리오

#### 시나리오 1 — 자동 revision 생성

1. 사용자: `기능 정의` 노드 텍스트 수정
2. autosave debounce 후 `PATCH /maps/{mapId}/document` 호출
3. 서버: patch 적용 → `current_version + 1` → `map_revisions` INSERT
4. 버전 히스토리 패널에 새 항목 추가

#### 시나리오 2 — 버전 히스토리 패널 조회

1. 사용자: 좌측 사이드바 > "버전 이력" 클릭
2. 시스템: `GET /maps/{mapId}/revisions` → 최신 50개 버전 목록 반환
3. 패널에 버전번호 / 작성자 / 시각 / 변경 요약 표시

#### 시나리오 3 — 특정 버전 미리보기

1. 사용자: v38 항목 클릭 > `[미리보기]`
2. 시스템: v38까지의 patch 순차 적용 → read-only Document Store 구성
3. 캔버스에 "v38 버전 미리보기 중" 배너 표시, 편집 비활성
4. 사용자: `[닫기]` → 현재 버전(v42)으로 복귀

#### 시나리오 4 — 3일 전 버전으로 롤백

1. 사용자: v20 항목 선택 > `[이 버전으로 복원]`
2. 시스템: v20 상태 재구성 → 현재(v42)와의 diff → inverse patch 생성
3. `POST /maps/{mapId}/revisions/20/restore` 호출
4. 서버: inverse patch 적용 → `current_version = 43` → revision 43 생성
5. 클라이언트: 현재 Document Store 교체, History Store 초기화

#### 시나리오 5 — Undo 후 autosave로 새 revision 생성

1. 사용자: 노드 삭제 → autosave → revision 42 생성
2. 사용자: `Ctrl+Z` (Undo) → 노드 복원
3. autosave: 새 patchId `p_xxx_undo` 생성 → `PATCH` 호출
4. 서버: 복원 patch 적용 → revision 43 생성

---

### 14. 구현 우선순위

#### MVP

* autosave 저장 시 map_revisions 자동 생성 (VH-01)
* patch_id UNIQUE 멱등성 보장

#### V1

* 버전 히스토리 패널 UI (VH-02)
* 버전 상세 조회 (VH-03)
* 버전 미리보기 (VH-04)
* 버전 롤백 (VH-05)
* 작성자 / 시각 표시 (VH-06)

#### 후순위

* 오래된 revision 자동 압축 (snapshot 병합)
* 버전별 변경 요약 자동 생성 (diff label)
* 협업자별 버전 필터링
* 버전 간 diff 시각화 (변경된 노드 하이라이트)

---
