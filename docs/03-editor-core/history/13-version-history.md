# 13. Version History
## VERSION_HISTORY

* 문서 버전: v2.0
* 작성일: 2026-04-15
* 최종 업데이트: 2026-08-04
* 변경 이력:
  * v2.0 — 실제 구현(`map_document_versions` 문서 스냅샷 · 명시적 저장에서만 버전 생성 · MAX(version)+1 · 새 맵+새 탭 복원 · restore 엔드포인트 없음) 기준으로 본문 현행화. patch/`map_revisions` 기반 원안은 "정규화 노드 경로 전용 — 문서 저장 경로와 무관"으로 강등.
  * v1.1 — NodePatch op 명칭을 api-spec.md v2.3 기준으로 통일; Diff Viewer 기능 ID(VH-07) 및 명세 추가 (CON-001 정합성 보정)
* 참조: `docs/02-domain/db-schema.md`, `docs/03-editor-core/save/14-save.md`, `docs/03-editor-core/history/12-history-undo-redo.md`

---

### 0. 구현 상태 (2026-08-02 — B8 완료)

> **문서 스냅샷 경로로 구현했다.** patch 기반 `map_revisions`(정규화
> 노드·협업용)와 별개로, 저장 시점의 **전체 문서 스냅샷**을
> `map_document_versions` 에 쌓는다 — 프런트가 이미지·노트·스타일을
> 통째로 담은 스냅샷을 저장하는 구조이기 때문이다.

| 항목 | 구현 |
|---|---|
| 테이블 | `public.map_document_versions` (map_id, version, title, doc, created_by, created_at, layout_type, node_count, attach_bytes, attach_count · UNIQUE(map_id,version) · RLS 소유자 한정) |
| 버전 생성 시점 | **명시적 저장에서만** — `PUT /maps/:id/document` 의 `keepVersion: true`. ☁ 저장·맵 닫기가 이 값을 보낸다. **자동저장은 버전을 남기지 않는다**(2026-08-06 사용자 결정으로 재확인 — 히스토리는 *내가 매듭지은 시점*이라는 뜻을 지킨다) — 스냅샷에 이미지가 data URL 로 들어가 매 저장마다 쌓으면 용량이 급증하기 때문 |
| 조회 | `GET /maps/:id/versions` (메타만 — version·title·createdAt·bytes 등) · `GET /maps/:id/versions/:version` (doc 포함) |
| 복원 | 현재 맵을 덮어쓰지 않는다 — 새 맵 생성 후 그 문서로 저장하고, **브라우저 새 탭**(`?map=<id>`)에서 연다(2026-08-02 탭 모델 — 지금 편집 중인 맵을 밀어내지 않는다). 제목 = **`원제목_history_YYMMDD_HHMM`** (같은 날 여러 번 복원해도 구분되도록 분까지) |
| UI | 좌측 **히스토리** 패널 — 저장일시 목록 + 각 항목 "새 탭으로". 서버 미연결이면 안내만 표시 |
| 검증 | API 7단언(version-api-test) + e2e80 7단언 · e2e89(버전 상세) · e2e90(무변경 스킵) |

VH-04(미리보기)·VH-07(Diff Viewer)는 미구현 — 오픈 후 수요를 보고 결정.

### 1. 기능 목적

> **확정 설계 (2026-07-31 사용자 결정 → 2026-08-02 구현 완료)**: 좌측
> '히스토리' 메뉴가 이 기능의 자리다. 규칙:
> ① **명시적 저장(☁ 저장·맵 닫기)할 때마다 저장일시별 버전** 생성
> ② 특정 시점 복원은 현재 맵을 덮어쓰지 않고 **새 맵
> (`제목_history_YYMMDD_HHMM`)** 으로 만들어 **브라우저 새 탭**에서 연다
> ③ 클라이언트 되돌리기(Ctrl+Z, 세션 한정 99단계)와는 완전히 별개.

* 맵의 저장 시점 문서를 **서버에 영구 보관**하여 과거 버전 조회 및 복원을 제공하는 기능
* **명시적 저장(keepVersion)** 시에만 `map_document_versions`에 1 row 씩 누적 — 자동저장은 버전을 만들지 않는다
* 히스토리 패널에서 저장일시 목록으로 과거 저장본 탐색
* 특정 시점 버전을 **새 맵 + 새 탭**으로 복원 가능
* 클라이언트 Undo/Redo(세션 한정)와 달리 **영구적·서버 기반 버전 관리** 제공

---

### 2. 기능 범위

* 포함:

  * 명시적 저장 시 버전 생성 (자동저장 제외)
  * 히스토리 패널 (저장일시 목록 조회)
  * 특정 버전을 새 맵으로 복원 ([새 탭으로])
  * 버전별 상세(레이아웃·노드 수·문서 크기·첨부 개수·용량) 표시
  * 버전 번호(version, MAX+1) 기반 순서 관리

* 제외:

  * 클라이언트 Undo/Redo (→ HISTORY, `12-history-undo-redo.md`)
  * 협업 충돌 해소 (→ COLLABORATION — 계획)
  * 삭제된 맵 복구 (→ MAP 휴지통 정책)
  * 버전 미리보기·Diff Viewer [미구현 — 백로그]

---

### 3. 세부 기능 목록

| 기능ID  | 기능명             | 설명                            | 상태  |
| ----- | --------------- | ----------------------------- | --- |
| VH-01 | 버전 생성  | **명시적 저장(keepVersion)에서만** map_document_versions에 1 row 생성 — 자동저장 제외, 무변경 저장도 제외 | 구현됨 |
| VH-02 | 히스토리 패널     | 저장일시 목록 조회 (최신순)              | 구현됨  |
| VH-03 | 버전 상세 조회        | 버전별 doc 조회 + 레이아웃·노드 수·첨부 상세 표시       | 구현됨  |
| VH-04 | 버전 미리보기         | 특정 버전 맵 read-only 렌더링         | [미구현 — 백로그]  |
| VH-05 | 버전 복원 | 특정 버전을 **새 맵 + 새 탭**으로 열기 ([새 탭으로])            | 구현됨  |
| VH-06 | 저장 시각 표시     | 각 버전의 저장일시·v번호 표시 (단독맵은 작성자 = 소유자) | 구현됨  |
| VH-07 | Diff Viewer           | 두 버전 간 변경 노드 시각화 (추가/삭제/변경 하이라이트) | [미구현 — 백로그] |

---

### 4. 기능 정의 (What)

#### 4.1 map_document_versions 테이블

```sql
CREATE TABLE public.map_document_versions (
  map_id       UUID NOT NULL REFERENCES public.maps(id) ON DELETE CASCADE,
  version      INT  NOT NULL,           -- 맵별 MAX(version)+1 채번
  title        TEXT,                    -- 저장 시점의 맵 제목
  doc          JSONB NOT NULL,          -- 전체 문서 스냅샷
  created_by   UUID REFERENCES public.users(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  layout_type  TEXT,                    -- 버전 상세 표시용 (2026-08-03)
  node_count   INT,
  attach_bytes BIGINT,
  attach_count INT,
  UNIQUE (map_id, version)
);
```

#### 4.2 NodePatch (설계 초안 — 정규화 노드 경로 전용)

> 아래 patch 체계는 **정규화 노드 경로(`map_revisions`·협업용) 전용
> 설계로, 현재 문서 저장 경로와 무관하다.** 문서 저장은 patch 가 아니라
> 전체 스냅샷(doc JSONB)이다.

```typescript
// (설계 초안 — 미사용) op 명칭은 api-spec.md v2.3 기준 4종
type NodePatch =
  | { op: 'add';    nodeId: string; data: { parentId: string; text: string; orderIndex: number; layoutType?: string } }
  | { op: 'update'; nodeId: string; data: Partial<Pick<NodeObject, 'text' | 'collapsed' | 'layoutType' | 'style' | 'backgroundImage' | 'manualPosition'>> }
  | { op: 'delete'; nodeId: string }
  | { op: 'move';   nodeId: string; data: { parentId: string; orderIndex: number } };
```

#### 4.3 버전 생성 흐름 (실제)

```
사용자: ☁ 저장 또는 맵 닫기
    │
    ▼
buildSnapshot() — 로드와 같은 정규화(normalizeMapForSnapshot)
    │
    ▼
PUT /maps/{mapId}/document { doc, title, keepVersion: true, editSession }
    │
    ├─ 편집 잠금(map_edit_locks) 확인 — 타 세션이면 409
    ├─ 현재 문서·마지막 버전과 jsonb 등가 비교 → 같으면 unchanged (버전 없음)
    ├─ map_documents upsert + maps.title 갱신
    └─ map_document_versions INSERT (version = MAX(version)+1,
       layout_type·node_count·attach_bytes·attach_count 함께 기록)
```

> 원안의 "autosave 마다 map_revisions INSERT (patchId 중복 검사 ·
> baseVersion 409)" 흐름은 문서 저장 경로에서 쓰지 않는다.

#### 4.4 히스토리 패널 구조 (실제)

```text
┌──────────────────────────────────────────────┐
│  히스토리                                     │
├──────────────────────────────────────────────┤
│  2026-08-03 14:32  · v3                       │
│  프로젝트 계획 — 트리·오른쪽                    │
│  42노드 · 380KB · 첨부 2개 · 3.1MB   [새 탭으로] │
│                                              │
│  2026-08-03 11:05  · v2                       │
│  프로젝트 계획 — 방사형·양쪽                    │
│  40노드 · 355KB                     [새 탭으로] │
│                                              │
│  2026-08-02 18:20  · v1                       │
│  프로젝트 계획                                 │
│  11노드 · 24KB                      [새 탭으로] │
└──────────────────────────────────────────────┘
```

* 각 항목: 저장일시 + v번호 · 제목 + 레이아웃 · N노드 · 문서 크기 · 첨부 N개 · 용량 + `[새 탭으로]` 버튼
* 컬럼 도입 이전 버전은 상세가 null 이라 있는 항목만 표시
* 서버 미연결이면 목록 없이 안내만 표시 (e2e68 [4], e2e80 [1])

#### 4.5 patch_id 생성 규칙 (설계 초안 — 정규화 노드 경로 전용)

> `generatePatchId`/`_undo`/`_redo` suffix 규칙은 patch 저장 경로 전용
> 설계로, 문서 저장 경로와 무관하다. 문서 저장에는 멱등성 키가 없고,
> 대신 서버가 jsonb 등가 비교로 무변경 저장을 스킵한다.

#### 4.6 Diff Viewer (VH-07) [미구현 — 백로그]

두 버전 사이의 노드 변경을 색상(추가=초록/삭제=빨강/변경=노랑)으로
비교하는 기능. 구현 시 `GET /maps/{mapId}/versions/{version}` 2회 조회 후
클라이언트에서 diff 하는 방향 — 오픈 후 수요를 보고 결정한다.

---

### 5. 동작 방식 (How)

#### 5.1 사용자 동작

| 동작                        | 결과                               |
| ------------------------- | -------------------------------- |
| ☁ 저장 / 맵 닫기        | keepVersion 저장 → 버전 1개 생성 (무변경이면 스킵)    |
| 편집 후 자동저장(주기·안전 시점)만 발생 | **버전 생성 없음** (e2e80 [4]·e2e110 [5]) |
| 히스토리 패널 열기 (좌측 사이드바)      | 저장일시 목록 조회 (최신순)                   |
| `[새 탭으로]` 버튼           | 해당 버전으로 **새 맵** 생성 → 브라우저 새 탭에서 열림 (현재 탭 유지)  |

#### 5.2 시스템 처리

**버전 목록 조회:**

```
GET /maps/{mapId}/versions
  → map_document_versions WHERE map_id = ? ORDER BY version DESC
  → 메타만 반환 (version, title, createdAt, bytes, layoutType, nodeCount, attachBytes, attachCount — doc 미포함)
```

**버전 복원 ([새 탭으로]) — 전용 restore 엔드포인트 없음, 클라이언트 조합:**

```
GET /maps/{mapId}/versions/{version}   → doc 포함 응답
  → 클라이언트: 새 맵 생성 (제목 = 원제목_history_YYMMDD_HHMM)
  → 그 새 맵에 doc 저장
  → window.open('?map=<newId>') — 브라우저 새 탭에서 열기
```

#### 5.3 표시 방식

* 히스토리 패널: 좌측 사이드바, 최신순 목록 (§4.4)
* (미래 표기 — VH-04 구현 시) 현재/과거 버전 ●/○ 구분, "미리보기 중 — 편집 불가" 배너
* 복원 후: 새 탭에 복원본, 현재 탭의 목록에는 원본과 복원본 맵이 각각 존재

---

### 6. 규칙 (Rule)

---

#### 6.1 버전 생성 규칙

* **명시적 저장(keepVersion) 1회 = 버전 1개** — 자동저장은 버전을 만들지 않는다
* **무변경 저장은 버전을 만들지 않는다** — 서버가 현재 문서·마지막 버전과 jsonb 등가 비교 후 `unchanged: true` 반환 (아래 "무변경 저장" 절)
* 버전이 하나도 없는 레거시 맵은 첫 버전을 남긴다

---

#### 6.2 버전 번호 규칙

* version 은 맵별 단조 증가 — INSERT 시 **`MAX(version)+1`** 채번
* `UNIQUE(map_id, version)` 제약
* 과거 버전의 version 번호는 불변
* (`maps.current_version` 컬럼 기반 관리는 정규화 노드 경로 설계 — 문서 저장 경로에서는 쓰지 않는다)

---

#### 6.3 복원 규칙

* 복원은 현재 맵 "덮어쓰기"가 아닌 **새 맵 생성** — 원본 맵과 그 버전 이력은 그대로 보존
* 새 맵 제목 = `원제목_history_YYMMDD_HHMM` (분까지 — 같은 날 여러 번 복원해도 구분)
* 새 맵은 **브라우저 새 탭**(`?map=<id>`)에서 열린다 — 현재 편집 중인 탭을 밀어내지 않는다
* 현재 탭의 undo 스택(past/future)도 영향 없음

---

#### 6.4 미리보기 규칙 [미구현 — 백로그]

* (구현 시) 미리보기 중 편집 불가 (read-only), 별도 상태로 렌더링, 종료 시 현재 편집 상태 복귀

---

#### 6.5 버전 보존 정책

* 기본: 무제한 보존 (DB 용량 한도 내)
* 향후 확장: 오래된 버전 자동 정리 정책 [미구현 — 백로그]

---

#### 6.6 되돌리기(past/future)와의 역할 구분

* Undo/Redo(documentStore past/future): 세션 내 빠른 취소·복원, 클라이언트 전용, 99단계
* Version History(map_document_versions): 영구 이력, 서버 저장, 새 탭 복원
* 두 기능은 독립적으로 동작하며 서로 호출하지 않는다

---

### 7. 협업 시 버전 관리 (계획 — 협업 V1)

* 현재는 단일 세션 편집 잠금(§8)으로 동시 편집 자체가 없다
* (계획) 협업 V1 에서 `created_by` 로 작성자를 구분하고, 되돌리기·복원은 맵 개설자(owner)만 사용 (문서 말미 정책 참조)

---

### 8. 예외 / 경계 (Edge Case)

* **버전이 없는 새 맵**: 패널에 "아직 저장된 버전이 없습니다" 표시
* **서버 미연결**: 패널에 안내만 표시 (가짜 목록 없음)
* **동시 편집 시도**: baseVersion 비교·Redis 멱등성이 아니라 **단일 세션 편집 잠금**(`map_edit_locks`, TTL 60초·하트비트 25초)으로 차단 — 타 세션의 PUT 은 **409** "다른 세션(브라우저)에서 편집 중", 잠긴 맵을 열면 **읽기 전용 안내**(🔒 배너 + 사본 저장 유도) (e2e93)
* **무변경 저장**: jsonb 등가 비교로 스킵 — 버전·`maps.updated_at` 모두 그대로 (e2e90)
* **삭제된 맵의 버전**: `map_id ON DELETE CASCADE`로 자동 삭제
* **없는 버전 조회**: 404 · **타 사용자 접근**: 404 (version-api-test)

---

### 9. 권한 규칙

* 현재: **소유자 단독** — RLS 로 소유자만 목록 조회·버전 조회·복원 가능 (타 사용자는 404)
* (계획 — 협업 V1) 참여자 조회 허용 여부·복원 owner 한정은 문서 말미 정책 참조

---

### 10. DB 영향

* `map_documents` — 현재 문서 (자동저장·명시적 저장 공통 반영 대상)
* `map_document_versions` — 버전 이력 (version, title, doc, created_by, created_at, layout_type, node_count, attach_bytes, attach_count)
* 인덱스/제약: `UNIQUE(map_id, version)` — 버전 목록은 version DESC 조회

---

### 11. API 영향

* `PUT /maps/{mapId}/document` — 저장 (keepVersion: true 일 때만 버전 생성)
* `GET /maps/{mapId}/versions` — 버전 목록 조회 (메타만)
* `GET /maps/{mapId}/versions/{version}` — 특정 버전 doc 조회
* 전용 restore 엔드포인트는 **없다** — 복원은 클라이언트가 조회+새 맵 생성으로 조합

---

### 12. 연관 기능

* HISTORY (`12-history-undo-redo.md` — 클라이언트 Undo/Redo와 역할 구분)
* SAVE (`14-save.md` — keepVersion·무변경 스킵·편집 잠금)
* MAP / 문서함 (`document-library.md` — 복원본 맵이 문서함에 나타남)

---

### 13. 예시 시나리오

#### 시나리오 1 — 명시적 저장 시 버전 생성

1. 사용자: 노드 편집 → 주기·안전 시점 자동저장 여러 번 발생 (버전 없음)
2. 사용자: ☁ 저장 클릭
3. 서버: 잠금 확인 → jsonb 비교(변경 있음) → `map_documents` 갱신 → `map_document_versions`에 v(MAX+1) INSERT
4. 히스토리 패널에 새 항목이 맨 위에 추가

#### 시나리오 2 — 히스토리 패널 조회

1. 사용자: 좌측 사이드바 > "히스토리" 클릭
2. 시스템: `GET /maps/{mapId}/versions` → 최신순 목록 (doc 미포함 메타)
3. 패널에 저장일시 + v번호 · 제목 + 레이아웃 · N노드 · 크기 · 첨부 표시

#### 시나리오 3 — 과거 버전 복원 (새 탭)

1. 사용자: v1 항목의 `[새 탭으로]` 클릭
2. 시스템: `GET /maps/{mapId}/versions/1` → doc 수신 → 새 맵 생성(`제목_history_YYMMDD_HHMM`) + doc 저장
3. 브라우저 새 탭(`?map=<newId>`)에서 복원본이 열림 — 현재 탭의 맵은 최신 그대로 (e2e80 [5])
4. 문서함·히스토리 목록에 원본과 복원본이 각각 존재

#### 시나리오 4 — 조회만 하고 닫기 (무변경 스킵)

1. 사용자: 서버맵을 열어 **조회만** 하고 맵 닫기 (keepVersion 저장 발생)
2. 서버: jsonb 등가 비교 — 현재 문서·마지막 버전과 동일 → `unchanged: true`
3. 버전 생성 없음 + `maps.updated_at` 그대로 (문서함 정렬 불변, e2e90)

---

### 14. 구현 우선순위

#### 구현됨 (B8·2026-08 배치)

* 명시적 저장 시 버전 생성 (VH-01) + 무변경 스킵
* 히스토리 패널 UI (VH-02)
* 버전 상세 조회·표시 (VH-03, VH-06)
* 새 탭 복원 (VH-05)

#### 후순위 [미구현 — 백로그]

* 버전 미리보기 (VH-04)
* Diff Viewer (VH-07)
* 오래된 버전 자동 정리
* 협업자별 버전 필터링 (협업 V1)

---


## 협업맵 권한 정책 (2026-08-03 결정 — 협업 V1에서 적용)

- **되돌리기(undo)와 히스토리(버전 복원)는 맵 개설자(owner)만** 사용할 수
  있다. 협업 참여자의 편집을 다른 참여자가 통째로 되돌리는 사고를 막기
  위한 정책이며, 협업 기능(V1, 실시간 공동 편집) 구현 시 UI 비활성 +
  API 권한 검사 양쪽에 적용한다. 단독맵은 제한 없음.

## 버전 상세 정보 (2026-08-03 — ThinkWise 편집 이력 참고)

저장 시점에 `map_document_versions` 에 **layout_type · node_count ·
attach_bytes · attach_count** 를 함께 기록하고, 히스토리 패널이 각 버전
아래에 "레이아웃 · N노드 · 문서 크기 · 첨부 N개 · 크기" 로 보여준다.

- **attach_count** = 문서의 attachments 항목 전부(내장·서버·세션 한정 blob)
- **attach_bytes** = 내장(data URL, base64→원본 환산) + 서버 저장소 합.
  blob: 첨부는 크기를 알 수 없어 개수에만 잡힌다.
- 컬럼 도입 이전 버전은 상세가 null 이라 있는 항목만 표시.

## 무변경 저장은 히스토리를 만들지 않는다 (2026-08-03 결정)

서버맵을 **조회만 하고 맵 닫기** 해도 버전이 생기던 문제의 수정.
`PUT /maps/:id/document` 는 저장 전에

1. 현재 문서와 새 문서를 **jsonb 등가**로 비교하고 (키 순서 무관),
2. keepVersion 이면 **마지막 버전의 doc·title** 과도 비교해서,

둘 다 같으면 아무것도 쓰지 않고 `unchanged: true` 를 돌려준다 —
문서·히스토리·`maps.updated_at` 모두 그대로라 문서함 정렬도 흔들리지
않는다. 명시적 저장 버튼은 이때 "변경된 내용이 없어 그대로 두었습니다"
안내를 띄운다. 버전이 하나도 없는 레거시 맵은 첫 버전을 남긴다.

전제: 저장 스냅샷과 로드 결과가 **같은 정규형**이어야 한다. 새 맵/불러온
맵은 edgeType·children 기본값이 빠진 채 저장돼, 다시 열면(로드 정규화)
같은 내용인데 문서가 달라 보였다 → `buildSnapshot()` 이 로드와 같은
정규화(normalizeMapForSnapshot = cloneMap)를 거쳐 저장한다.

## 저장한 자리 — 기기·브라우저·IP (2026-08-09 사용자 요청)

> "맵의 히스토리 정보에 실행한 Platform(Windows 11··, Android V14, iOS…),
> 브라우저 종류, IP Address 정보도 같이 기록하고 보여 주었으면 한다."

버전을 만들 때 `map_document_versions` 에 **client_platform ·
client_browser · client_ip** 를 함께 남기고, 히스토리 패널의 각 버전 아래에
`🖥 Windows 11 · Chrome 126 · 203.0.113.9` 로 보여준다.

### 누가 무엇을 정하는가 (이게 핵심이다)

| 값 | 정하는 쪽 | 이유 |
|---|---|---|
| **IP** | **서버만** | 클라이언트가 보낸 값은 위조할 수 있다. `main.ts` 의 `trust proxy: 1` 덕에 `req.ip` 는 **프록시가 붙인 실제 클라이언트 IP** 다. 몸통(body)으로 `client.ip` 를 보내면 전역 `forbidNonWhitelisted` 에 걸려 **400** 이다 |
| **플랫폼·브라우저** | **클라이언트 우선**, 없으면 서버가 UA 추정 | **User-Agent 문자열로는 Windows 10 과 11 을 구분할 수 없다** — 둘 다 `Windows NT 10.0` 이다(호환성 때문에 고정). 실제 버전은 브라우저의 **User-Agent Client Hints**(`navigator.userAgentData.getHighEntropyValues`)로만 알 수 있고, 이건 스크립트에서만 물어볼 수 있다 |

- 프런트: `utils/clientInfo.ts` — Client Hints 로 `platformVersion` 을 받아
  **13 이상이면 Windows 11**, 1~12 면 Windows 10 으로 적는다(MS 문서 기준).
  브랜드 목록에서 위장 항목(`Not)A;Brand`)과 엔진(`Chromium`)을 걷어내
  사용자가 아는 이름(`Chrome 126` · `Edge 126`)을 고른다.
  Client Hints 가 없는 브라우저(사파리·파이어폭스)는 UA 로 추정한다.
- 값은 `apiClient.saveDocument()` 가 **자동으로** 붙인다 — 저장 경로가
  여러 곳이라 호출부마다 넘기면 빠뜨린다. 세션당 한 번만 조회해 캐시한다.
- 서버: UA 로 추정할 때도 **파생 브라우저를 먼저** 본다(Edge/Opera/
  Samsung/Whale 를 Chrome 으로 오독하지 않는다). macOS 의 UA 버전은
  `10_15_7` 에 얼어 있어 버전을 붙이지 않는다 — 모르는 것을 아는 척하지
  않는다.

### 스키마가 아직 없는 서버에서도 동작한다

새 컬럼을 **무조건** SELECT/INSERT 하면 델타 SQL 미적용 서버에서 목록도
저장도 통째로 503 이 된다(2026-08-08 검색 기능에서 실제로 겪었다).
`hasVersionClientCols()` 가 `information_schema` 로 컬럼 유무를 보고
**있을 때만** 컬럼을 넣는다. 캐시는 **1분 양방향** — 델타를 적용하면
재기동 없이 곧 붙고, 컬럼이 사라진 DB(롤백본)에서도 스스로 물러선다.

### 개인정보

본인 소유 맵의 이력에만 남고 RLS 로 본인만 조회한다. 맵을 지우면
`ON DELETE CASCADE` 로 함께 사라진다. 패널 하단에 "내 계정의 맵
이력에만 남고 다른 사람에게는 보이지 않습니다"를 항상 적어 둔다.

### 2차 수정 (2026-08-09) — 내부 IP · 위장 브랜드

실제 dev 서버에서 두 가지가 드러났다.

1. **IP 가 전부 내부 주소(192.168.x.x)** — PC 도 휴대폰도 같았다.
   `trust proxy` 를 **1단계**로 뒀는데 실제 배포는 nginx → Traefik **두
   단계**라, 한 단계만 벗기면 nginx 의 내부 IP 에서 멈춘다. 단계 수를
   사람이 세어 맞추는 방식은 프록시가 하나 늘거나 줄면 조용히 틀린다 →
   **"사설망 주소는 전부 우리 프록시"**(loopback/linklocal/uniquelocal)로
   바꿨다. 몇 단계든 벗겨 내고 처음 만나는 공인 IP 에서 멈춘다.
   배포마다 다르면 `TRUST_PROXY` 환경변수로 덮어쓴다.
   (레이트 리밋도 같은 값을 쓴다 — rate-limit.md §4.3)
2. **브라우저 이름이 `Not;A=Brand 8`** — 크로미움이 목록에 일부러 끼워
   넣는 **위장(GREASE) 항목**이 그대로 저장됐다. **구두점이 실행할 때마다
   달라진다**(`Not)A;Brand` · `Not;A=Brand` · `Not_A Brand` · `Not/A(Brand` …).
   구두점을 나열해 걸러내니 `=` 조합에서 샜다 → **글자·숫자만 남겨**
   `not`+`brand` 가 있으면 위장으로 본다.

### 3차 (2026-08-09) — 남은 것은 **서버 설정**이다

`trust proxy` 를 고친 뒤에도 IP 가 `192.168.0.74` 그대로였다.
`/v1/health/ip` 가 원인을 정확히 짚어 줬다.

```
remoteAddress : ::ffff:10.0.1.6      ← 우리 앞 프록시(Traefik)
xForwardedFor : 192.168.0.74        ← 항목이 **하나**, 그것도 사설
```

우리 앞 프록시가 "접속자는 192.168.0.74"라고 적어 보냈고, 그 값이 **서로
다른 기기·외부망에서도 같았다**. 그 주소는 **도커 컨테이너가 아니었다**
(전수 조회 결과 없음) — 도커 밖, 다른 장비에서 도는 NPM 이다.
가장 유력한 원인은 **Traefik 이 남이 붙인 `X-Forwarded-*` 를 버리는 기본
동작**이다(신뢰하지 않는 상대의 헤더는 지우고 자기가 다시 쓴다).
조치는 runbook §6.4 참조 — `forwardedHeaders.trustedIPs` 에 NPM 대역.
**해결 확인**: 그 두 줄을 넣고 프록시를 재시작하자 `xForwardedFor` 가
`"203.0.113.9, 192.168.0.74"` 두 항목이 되고 기록되는 IP 가 진짜
접속자 주소가 됐다. 앱 코드는 처음부터 옳았고, 고칠 자리는 프록시였다. 즉 진짜 접속자 IP 는 **우리 API 에 닿기
전에 이미 사라진 것**이다 — 애플리케이션 코드로는 복구할 수 없다(없는
정보를 벗겨 낼 수는 없다). 고칠 자리는 그 앞의 리버스 프록시·포트 공개
설정이다: **dev-server-runbook.md §6.4** 에 판별 절차와 조치를 적어 뒀다.

그래서 `hint` 를 이 경우에 맞게 고쳤다 — 예전 문구는 "TRUST_PROXY 를
조정하세요"라고 해서, **고칠 수 없는 곳을 고치라고 안내**하고 있었다.

**확인 창구**: `GET /v1/health/ip` — 서버가 내 IP 를 무엇으로 보는지
(사슬·헤더·trustProxy 포함) 그대로 돌려주고, 무엇을 고쳐야 하는지
`hint` 로 알려 준다. 자기 요청의 헤더만 되돌려 준다.

검증: E2E e2e134
