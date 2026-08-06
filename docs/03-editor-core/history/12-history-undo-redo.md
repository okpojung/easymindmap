# 12. History / Undo-Redo
## HISTORY

* 문서 버전: v2.0
* 작성일: 2026-04-15
* 최종 업데이트: 2026-08-04 — 실제 구현(전체 맵 스냅샷 · documentStore 내부 past/future · HISTORY_LIMIT 99 · setHistoryPaused) 기준으로 현행화. Command/patch·Transaction·Coalescing 설계는 "설계 초안(미채택)"으로 강등, §16 은 스냅샷 PUT + 편집 잠금 흐름으로 재작성.
* 참조: `docs/01-product/functional-spec.md § HISTORY`, `docs/03-editor-core/save/14-save.md`, `docs/03-editor-core/history/13-version-history.md`

---

### 1. 기능 목적

* 사용자가 수행한 편집 작업을 기록하고, **Undo(취소) / Redo(복원)** 을 제공하는 기능
* 실수로 수행한 편집을 빠르게 되돌리거나, 취소한 작업을 다시 복원할 수 있게 한다
* **전체 맵 스냅샷 저장** 방식 — 편집이 스프레드 기반 불변 갱신이라 변경된 가지 외에는 이전 스냅샷과 **구조를 공유**하므로 메모리 실비용은 "변경분"에 그친다
* 별도 History Store 없이 **documentStore 내부의 `past` / `future` 스택**으로 관리한다

> **현재 구현 노트 (2026-07)**: `documentStore`의 `past/future`가
> `{ map, layout }` 엔트리를 담는다.
> `layout`(editorUiStore의 전체 레이아웃)을 맵과 함께 기록/복원하는
> 이유: 칸반 전환처럼 "맵 + 레이아웃"이 한 동작으로 바뀌는 편집을
> Ctrl+Z 한 번으로 화면까지 되돌리기 위해서다. **규칙**: 맵과
> 레이아웃을 함께 바꾸는 코드는 반드시 맵 변경(`updateNodeLayoutType`
> 등)을 먼저, `setLayoutType`을 나중에 호출한다 — 히스토리 구독이
> "이전 레이아웃"을 스냅샷에 담을 수 있도록 (레이아웃 탭·맵 설정 1레벨
> 셀렉트 적용됨, e2e66).
>
> **되돌리기 ↔ 히스토리 분리 (2026-07-31 사용자 최종 결정)**:
> 둘은 **별개 기능**이다.
>
> * **되돌리기(undo/redo)** = **이 편집 세션 한정** (메모리 내 —
>   새로고침·세션 종료 시 사라짐). 한도 `HISTORY_LIMIT = 99` —
>   단계 카운터를 두 자리(-99)로 표시하기 위한 상한. 툴바 되돌리기·
>   다시 실행 버튼 사이의 카운터(`data-testid="undo-depth"`)는
>   `future.length` — 최신 상태 0, undo마다 -1씩, redo로 복귀, 새 편집
>   시 0 (future가 비워지는 표준 규칙, e2e67).
> * **히스토리(저장 버전 이력)** = 명시적 저장 시점의 문서 스냅샷을
>   `map_document_versions`에 보관하는 기능 — 구현됨(B8),
>   `13-version-history.md` 참조. 특정 시점 복귀는 현재 맵을 덮어쓰지
>   않고 **새 맵(`제목_history_YYMMDD_HHMM`) + 브라우저 새 탭**으로
>   연다.
>
> **메모리**: 스냅샷은 map 객체 참조를 저장하고, 편집은 스프레드 기반
> 불변 갱신이라 변경된 가지 외에는 **이전 스냅샷과 구조를 공유**한다 —
> 99단계여도 실비용은 "99번의 변경분"이지 99개의 전체 복사본이 아니다
> (전체 교체는 불러오기/새 맵 정도).

---

### 2. 기능 범위

* 포함:

  * Undo — 가장 최근 작업 취소 (`Ctrl+Z`)
  * Redo — 취소한 작업 복원 (`Ctrl+Y` / `Ctrl+Shift+Z`)
  * 2-Stack 구조 관리 (`past` / `future`)
  * **한 번의 `set()` = 1 undo 단계** — 별도 트랜잭션 API 없이, 여러 노드를 한 번의 상태 갱신으로 바꾸면 자연히 1단계가 된다 (다중 가지 추가, 일괄 삭제 등)
  * `setHistoryPaused` — 드래그·슬라이더 등 연속 변경 중 히스토리 기록을 일시 중지해 1단계로 합산 (e2e71: 색상 드래그 전체 = undo 1단계)
  * 툴바 Undo/Redo 버튼 활성/비활성 + 단계 카운터(`undo-depth`) 연동
  * Undo/Redo 실행 후 자동저장(주기·안전 시점 스냅샷 저장) 자동 트리거

* 제외:

  * 서버 버전 이력 (→ VERSION_HISTORY, `13-version-history.md`)
  * 선택/viewport/zoom 상태 변경 (히스토리 제외 대상)
  * 협업 충돌 해소 (→ COLLABORATION — 계획)
  * 영구 저장 (→ SAVE)
  * ~~Transaction API·Coalescing·entry label~~ — **설계 초안(미채택)**, §4 참조

---

### 3. 세부 기능 목록

| 기능ID      | 기능명            | 설명                             | 단축키                             |
| ---------- | -------------- | ------------------------------ | -------------------------------- |
| HISTORY-01 | Undo           | 가장 최근 편집 작업 취소                 | `Ctrl+Z` / `Cmd+Z`               |
| HISTORY-02 | Redo           | 취소한 작업 복원                      | `Ctrl+Y` / `Ctrl+Shift+Z` / `Cmd+Shift+Z` |
| HISTORY-03 | 1-set 1단계     | 한 번의 `set()`으로 묶인 변경 = 1 undo 단계 | 내부 처리                            |
| HISTORY-04 | 연속 변경 합산     | `setHistoryPaused`로 드래그·슬라이더 연속 변경을 1단계로 | 내부 처리                            |
| HISTORY-05 | Stack 상태 표시   | 툴바 버튼 활성/비활성 + 고정 툴팁 + 단계 카운터(`undo-depth`) | UI 연동                            |
| HISTORY-06 | 히스토리 초기화      | **계정 경계 전환 시에만**(로그아웃→재로그인 등 세션 전환 리셋) 스택 클리어 — 맵 닫기/재열기로는 유지 (e2e79 [5], e2e85 [4]) | 내부 처리                            |

---

### 4. 기능 정의 (What)

#### 4.1 실제 구조 — documentStore 내부 past/future

```typescript
// apps/frontend/src/stores/documentStore.ts (발췌)
const HISTORY_LIMIT = 99;

type HistoryEntry = {
  map: SampleMap;          // 편집 직전의 전체 맵 스냅샷 (구조 공유)
  layout: EditorLayout;    // 당시의 editorUi 레이아웃 (칸반 전환 등 복원용)
};

// documentStore 상태의 일부
{
  past: HistoryEntry[];    // undo 스택 (최대 99)
  future: HistoryEntry[];  // redo 스택

  undo: () => void;
  redo: () => void;
}

// 히스토리 일시 중지 — 드래그/슬라이더 연속 변경을 1단계로
export function setHistoryPaused(v: boolean): void;
```

* 엔트리 타입은 이 `{ map, layout }` **1개뿐**이다.
* label·timestamp·meta·operation 목록은 없다 — 툴바 툴팁은 고정 문구, 단계 표시는 카운터가 담당한다.

#### 4.2 설계 초안 (미채택) — Command/patch 기반 History Store

> 아래 4.2~4.5 의 원안(독립 HistoryStore + HistoryEntry(undo/redo 연산
> 목록) + HistoryOperation 9종 + HistoryActionType + HistoryTransaction)
> 은 **채택되지 않았다**. 스냅샷 + 구조 공유 방식이 더 단순하면서
> 메모리 실비용이 낮아, patch 역연산 체계는 도입하지 않았다.
> 한 줄 요약: *"역연산 가능한 Command patch를 쌓는 독립 History Store"*
> 설계였으나, 실제 구현은 documentStore 내부 전체 스냅샷 2-스택이다.

---

### 5. 동작 방식 (How)

#### 5.1 사용자 동작

| 입력                            | 결과                                  |
| ----------------------------- | ----------------------------------- |
| `Ctrl+Z` / `Cmd+Z`            | `past`에서 pop → 스냅샷으로 맵·레이아웃 교체      |
| `Ctrl+Y` / `Ctrl+Shift+Z`     | `future`에서 shift → 스냅샷 재적용          |
| 노드 생성/삭제/이동/텍스트 수정 등         | `past`에 현재 스냅샷 push, `future` 초기화     |
| 툴바 Undo 버튼 클릭                 | `Ctrl+Z`와 동일                        |
| 툴바 Redo 버튼 클릭                 | `Ctrl+Y`와 동일                        |

---

#### 5.2 시스템 처리 — 2-Stack 흐름

```
새 편집 발생 (documentStore set):
  past.push({ map: 이전 map, layout: 이전 layout })  (99 초과분은 앞에서 제거)
  future = []                      ← 새 작업 시 redo 초기화

Undo 실행:
  entry = past.pop()
  현재 {map, layout} 을 future 맨 앞에 push
  map ← entry.map, layout ← entry.layout   (전체 스냅샷 교체)
  → 문서가 바뀌었으므로 자동저장 대기(미저장 편집 +1) — 주기·안전 시점에 발사

Redo 실행:
  entry = future.shift()
  현재 {map, layout} 을 past 에 push
  map ← entry.map, layout ← entry.layout
  → 자동저장 트리거
```

---

#### 5.3 표시 방식

* 툴바 Undo 버튼: `past.length > 0`이면 활성화
* 툴바 Redo 버튼: `future.length > 0`이면 활성화
* 툴팁: **고정 문구**("되돌리기"/"다시 실행") — entry label 은 없다
* 두 버튼 사이 **단계 카운터**(`data-testid="undo-depth"`) = `-future.length` (최신 0, undo마다 -1, 최대 -99)

---

### 6. 규칙 (Rule)

---

#### 6.1 스냅샷 저장 원칙

* 역연산 Command/Patch 저장 ❌ (설계 초안 — 미채택)
* **전체 맵 스냅샷 저장** ✅ — 불변 갱신의 구조 공유로 메모리 실비용은 변경분뿐
* 스냅샷에는 `layout`(editorUi 레이아웃)을 함께 담아 칸반 전환 등도 한 번에 되돌린다

---

#### 6.2 2-Stack 규칙

| 상황          | past           | future         |
| ----------- | -------------- | -------------- |
| 새 작업 수행     | push           | 초기화 (`[]`)    |
| Undo 실행     | pop            | 앞에 push        |
| Redo 실행     | push           | shift          |
| 히스토리 초기화 (계정 경계 전환) | `[]`           | `[]`           |

---

#### 6.3 1-set = 1단계 규칙 (Transaction 대체)

별도 Transaction API 는 없다. **한 번의 `set()` 호출로 반영된 변경이 곧
1 undo 단계**다. 여러 노드를 한 단계로 묶고 싶으면 하나의 액션에서 한 번에
갱신한다.

대표 예:

* 다중 가지 추가 (`Ctrl+Space`) — 한 번의 set 으로 전부 삽입
* 러버밴드 다중 선택 후 일괄 삭제 (`deleteNodesBulk`, e2e68)
* 템플릿 적용 / import 결과 반영
* 칸반 전환 (맵 + 레이아웃 동시 — `{map, layout}` 엔트리)

---

#### 6.4 연속 변경 합산 규칙 (Coalescing 대체)

원안의 Coalescing(중간값 병합) 대신 **`setHistoryPaused`** 를 쓴다.

| 작업 유형      | 처리 방식                          |
| ---------- | ------------------------------ |
| 색상 슬라이더 드래그 | 첫 변경만 기록, 이후 `setHistoryPaused(true)` — 드래그 전체 = 1단계 (e2e71) |
| 노드 드래그 이동  | 같은 방식으로 드래그 중 기록 억제, 종료 시 1단계   |
| 텍스트 편집     | 편집 커밋 시점에 1회 반영 (타이핑 중간값은 draft) |
| 노드 생성/삭제   | 매 set 마다 개별 단계                 |

---

#### 6.5 히스토리 일시 중지 규칙

* Undo/Redo 적용 자체와 드래그 중간값이 새 히스토리 단계를 만들면 스택이 꼬인다
* `setHistoryPaused(true)` 구간에서는 문서 변경은 반영하되 `past` push 를 하지 않는다

---

#### 6.6 HISTORY_LIMIT 규칙

* 상한: **`HISTORY_LIMIT = 99`** — 단계 카운터를 두 자리(-99)로 표시하기 위한 값
* 초과 시 가장 오래된 항목(`past` 맨 앞) 제거

---

#### 6.7 되돌리기 포함 / 제외 대상 (2026-08-06 확정)

**기준 한 줄: "다시 만들어야 하는 것"은 포함, "다시 보면 되는 것"은 제외.**
저장·히스토리와 **같은 규칙**을 쓴다 (14-save.md §0.3).

| 포함 대상 (문서 변경) | 제외 대상 |
| --------------- | -------------- |
| 노드 생성 / 삭제 / 이동 | 선택 상태 변경 · hover |
| 노드 텍스트 수정 | viewport pan · zoom |
| 노트(모든 블록) · 첨부 · 링크 · 사진 | 패널 열기/닫기 |
| 스타일 변경(색·굵기·테두리·도형·글자 크기) | 검색 입력 중간값 |
| 아이콘 · 태그 · 정렬(노드 안 텍스트) · 노드 크기 | 저장 상태 배지 |
| **좌우**(`side` — 방사형·양쪽의 배치) | 아웃라인/칸반 보기 전환 |
| 레이아웃 변경 (맵·레이아웃 동시 스냅샷) | **collapse / expand (접기·펴기)** |
| paste / 템플릿 적용 / import · 맵 설정 · 맵 이름 | |

> **접기/펴기가 제외로 바뀌었다** (2026-08-06). 예전에는 포함이라 99단계가
> 접기/펴기로 채워져 **정작 되돌리고 싶은 편집이 밀려났다.**
> `documentStore` 의 `asViewOnly()` 로 감싼 액션(`toggleCollapse`·
> `setCollapsed`·`collapseAll`·`expandAll`·`expandAncestors`)은 되돌리기·
> 자동저장·로컬 초안 구독이 모두 건너뛴다. 접힘 값 자체는 문서에 남아
> 다른 편집이 저장될 때 함께 올라간다. 검증 e2e111.
>
> **좌우(`side`)는 포함**이다 — 사용자가 드래그로 정한 배치라 잃으면
> 다시 만들어야 한다.

##### 알려진 차이 [미구현]

되돌리기 스냅샷은 전역 **레이아웃**은 함께 복원하지만 **간격**
(`spacingX`·`spacingY`)은 복원하지 않는다. 서버 저장·로컬 초안에는 둘 다
들어간다.

---

#### 6.7-1 "이 상태를 최신으로 확정" (2026-08-06)

되돌리기로 -5 까지 간 뒤 **아무 편집이나 하면** 다시 실행 5단계가 버려지고
그 지점이 새 0 이 된다(표준 동작 — 아래 6.2 의 `future: []`). 그런데
**편집할 것은 없고 확정만 하고 싶을 때** 방법이 "맵을 닫았다 열기"뿐이었다.

이제 **되돌리기 단계 배지(`-5`)를 누르면** 그 상태가 최신(0)이 된다
(`documentStore.commitCurrentAsLatest` — `future` 를 비운다. 문서 내용은
건드리지 않는다). 검증 e2e110 [8].

---

#### 6.8 Undo/Redo 후 자동저장 규칙

* Undo/Redo 실행 결과도 문서 변경이므로 **자동저장 대상**
* 별도 patchId 같은 것은 없다 — 다른 편집과 동일하게 주기·안전 시점에
  `PUT /maps/:id/document` 로 **전체 스냅샷**이 저장된다
* Undo 로 저장 직전 상태와 같아졌다면 서버의 jsonb 등가 비교로
  `unchanged` 처리된다 (`14-save.md` 참조)

---

#### 6.9 삭제 Undo 규칙

* 삭제 직전의 전체 맵 스냅샷이 `past`에 남아 있으므로, 단일 노드든
  subtree 전체든 **Ctrl+Z 한 번으로 통째로 복원**된다 (e2e79 [5]:
  맵 닫기 후에도 Ctrl+Z 로 30노드 완전 복구)
* 별도 subtree snapshot 로직이 필요 없다 — 스냅샷 방식의 장점

---

### 7. 히스토리 동작 예시

```typescript
// 텍스트 수정: "AI" → "Artificial Intelligence"
// past 에 { map: 수정 전 맵, layout: 현재 레이아웃 } 1개가 push 된다.
// Ctrl+Z → 그 스냅샷으로 map 전체 교체 → "AI" 복원.

// 칸반 전환:
// updateNodeLayoutType(맵 변경) → setLayoutType(레이아웃 변경) 순서 —
// 히스토리 구독이 "이전 레이아웃"을 스냅샷에 담는다.
// Ctrl+Z 한 번으로 맵과 화면 레이아웃이 함께 복원 (e2e66).
```

> 원안의 entry 별 `{undo: [...], redo: [...]}` 연산 예시는 미채택 설계라 삭제했다.

---

### 8. past/future vs map_document_versions 구분

| 구분          | past/future (클라이언트)      | map_document_versions (서버 DB)          |
| ----------- | -------------------------- | ------------------------------ |
| 저장 위치       | 브라우저 메모리 (documentStore)         | PostgreSQL (`public.map_document_versions`) |
| 지속성         | 세션 한정 (새로고침 시 초기화)         | 영구 저장                          |
| 목적          | `Ctrl+Z / Y` 편집 취소·복원      | 저장 시점 버전 이력 조회·복원 (히스토리 패널)     |
| 저장 단위       | 한 번의 set() = 스냅샷 1개        | **명시적 저장(keepVersion)** 1회 = 문서 스냅샷 1 row |
| 최대 보존       | 99개 (HISTORY_LIMIT)                    | 무제한 (DB 용량 한도)                 |
| 접근 주체       | 클라이언트 전용 — API 없음          | `GET /maps/:id/versions` 로 조회             |
| 사용 시나리오     | "방금 전 텍스트 편집 취소"           | "3일 전 저장본을 새 탭으로 열기"                |

---

### 9. 예외 / 경계 (Edge Case)

* **past 비어있는데 Undo 시도**: 동작 없음 (Undo 버튼 비활성 상태)
* **future 비어있는데 Redo 시도**: 동작 없음 (Redo 버튼 비활성 상태)
* **새 작업 후 Redo**: `future` 초기화 → Redo 불가
* **HISTORY_LIMIT 초과**: 가장 오래된 항목 자동 제거 (Undo 불가 범위 확대)
* **드래그/슬라이더 중간값**: `setHistoryPaused` 로 기록 억제 — 마지막 값만 1단계
* **AI 생성 작업**: 맵에 반영되는 set 이 곧 1단계 — Ctrl+Z 로 통째 취소
* **맵 닫기/재열기**: 스택 유지 (초기화는 계정 경계 전환 시에만)
* **저장 실패 후 Undo**: 로컬 스냅샷 복원은 완료, 저장 오류는 상태 배지(error)로 별도 표시

---

### 10. 권한 규칙

현재는 **단독 편집(소유자 단독)** 모델이라 별도 권한 구분이 없다.

* (계획 — 협업 V1) 협업맵에서는 되돌리기·히스토리 복원을 **맵 개설자(owner)만** 사용 (2026-08-03 결정, `13-version-history.md` 참조)

---

### 11. DB 영향

* past/future 는 **DB에 저장하지 않는다** (클라이언트 전용)
* Undo/Redo 실행 결과는 자동저장을 통해 `map_documents`(현재 문서)에 반영되고, 이후 명시적 저장 시 `map_document_versions`에 버전이 남는다

관련 DB 테이블:

```sql
-- 명시적 저장(keepVersion) 시에만 쌓이는 문서 스냅샷 버전
CREATE TABLE public.map_document_versions (
  map_id       UUID NOT NULL REFERENCES public.maps(id) ON DELETE CASCADE,
  version      INT  NOT NULL,           -- MAX(version)+1 채번
  title        TEXT,
  doc          JSONB NOT NULL,          -- 전체 문서 스냅샷
  created_by   UUID REFERENCES public.users(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  layout_type  TEXT,
  node_count   INT,
  attach_bytes BIGINT,
  attach_count INT,
  UNIQUE (map_id, version)
);
```

> 원안의 `map_revisions`(patch_json·patch_id) DDL 은 정규화 노드/협업
> 경로용 설계로, 문서 저장 경로에서는 쓰지 않는다.

---

### 12. API 영향

* past/future 자체는 API 없음 (클라이언트 전용)
* Undo/Redo 실행 후 자동저장이 트리거하는 API:
  * `PUT /maps/{mapId}/document` — 전체 문서 스냅샷 저장 (`{doc, title, keepVersion, editSession}`) — 다른 편집과 동일한 경로

---

### 13. 연관 기능

* NODE_EDITING (`02-node-editing.md` — 편집 set 이 히스토리 push 트리거)
* SAVE / AUTOSAVE (`14-save.md` — Undo/Redo 후 스냅샷 자동저장 연동)
* VERSION_HISTORY (`13-version-history.md` — 서버 버전 이력과 역할 구분)
* LAYOUT (`08-layout.md` — 레이아웃 변경 Undo, `{map, layout}` 엔트리)
* SELECTION (`11-selection.md` — 선택 상태는 히스토리 제외)

---

### 14. 예시 시나리오

#### 시나리오 1 — 노드 삭제 후 Undo

1. 사용자: `기능 정의` 노드 `Delete`
2. 시스템: 삭제 직전 스냅샷을 `past`에 push, 삭제 반영
3. 주기·안전 시점에 자동저장 (전체 스냅샷 PUT)
4. 사용자: `Ctrl+Z`
5. 시스템: `past.pop()` → 스냅샷으로 맵 교체 (subtree 포함 통째 복원)
6. `future`에 entry push, 카운터 -1 표시
7. 자동저장 트리거 (복원 결과 저장 — 직전 저장본과 같으면 서버가 unchanged 처리)

#### 시나리오 2 — 다중 가지 추가 = 1단계

1. 사용자: `Ctrl+Space` → 여러 줄 입력
2. 시스템: 입력 완료 시 **한 번의 set** 으로 전체 노드 삽입 → `past`에 1개 push
3. 사용자: `Ctrl+Z` → 전체 생성 노드 일괄 취소

#### 시나리오 3 — 색상 드래그 합산

1. 사용자: 색상 슬라이더 드래그 (input 이벤트 수십 발)
2. 시스템: 첫 변경만 `past`에 기록, 이후 `setHistoryPaused(true)`
3. 드래그 종료 → `setHistoryPaused(false)`
4. 사용자: `Ctrl+Z` → **드래그 전 색으로 한 번에** 복원 (e2e71)

#### 시나리오 4 — Undo 후 새 작업

1. 사용자: 노드 A 생성 → 노드 B 생성
2. `Ctrl+Z` → 노드 B 삭제됨 (`future`에 스냅샷)
3. 사용자: 노드 C 생성
4. 시스템: `future` 초기화 → 노드 B Redo 불가, 카운터 0

---

### 15. 구현 상태

#### 구현됨 (MVS)

* 전체 편집에 대한 Undo/Redo (스냅샷 방식이라 연산 종류 구분 불필요)
* `{map, layout}` 엔트리 — 칸반/레이아웃 전환 복원 (e2e66)
* 툴바 버튼 상태 + 단계 카운터 (e2e67)
* `setHistoryPaused` 연속 변경 합산 (e2e71)
* `HISTORY_LIMIT = 99`
* 일괄 삭제 1단계 (`deleteNodesBulk`, e2e68)
* 계정 경계 전환 시 스택 리셋 (e2e85)

#### 미구현 — 백로그

* entry label 기반 툴팁 ("Undo 텍스트 수정" 등)
* 협업맵 owner 한정 undo (협업 V1 과 함께)

---

### 16. 되돌리기와 서버 저장의 연동 흐름 (14-save.md · 13-version-history.md 연동)

> **현행 구현 기준.** 원안의 "Command patch → PATCH /nodes →
> map_revisions 누적, baseVersion 충돌 rebase" 흐름은 미채택 설계다 —
> 실제는 **저장 = 전체 스냅샷 PUT, 충돌 = 단일 세션 편집 잠금**이다.

#### 16.1 전체 아키텍처 흐름

```
사용자 편집
    │
    ▼
documentStore set()
    ├─── past.push({map, layout})        ← 클라이언트 Undo 스택 (세션 한정, 99)
    └─── map 상태 변경
              │
              ▼
          주기·안전 시점 자동저장
              │
              ▼
          PUT /maps/{mapId}/document { doc, title, editSession }
              │  (서버: 편집 잠금 확인 → jsonb 등가 비교 → 변경 시 upsert)
              ▼
          map_documents 갱신 (자동저장은 버전을 남기지 않는다)

Ctrl+Z (Undo) 실행 시에도 동일:
  past.pop() → 스냅샷으로 맵 교체 → 같은 자동저장 경로로 PUT
```

#### 16.2 핵심 규칙

1. **Undo/Redo 는 서버를 직접 건드리지 않는다.** 로컬 스냅샷 교체 후
   일반 자동저장 경로(PUT 스냅샷)를 탈 뿐이다.
2. **Ctrl+Z 는 서버 버전을 rollback 하지 않는다.** `map_documents` 의
   현재 문서가 Undo 결과로 덮어써질 뿐이고, `map_document_versions` 의
   과거 버전은 그대로 남는다.
3. **버전 복원(히스토리 패널)과 Undo/Redo 는 독립적이다.** 버전 복원은
   현재 맵을 건드리지 않고 **새 맵(`제목_history_YYMMDD_HHMM`)을 만들어
   브라우저 새 탭**에서 연다 — 현재 탭의 past/future 는 그대로다.
4. **충돌은 버전 비교가 아니라 편집 잠금으로 막는다.**
   `map_edit_locks`(TTL 60초·하트비트 25초) — 다른 세션이 잠근 맵에
   PUT 하면 409, 열면 읽기 전용 (e2e93, `14-save.md` §5.3).

#### 16.3 두 시스템 비교 — 아키텍처 흐름 요약

| 구분              | past/future (클라이언트)            | map_document_versions (서버 DB)                      |
| --------------- | --------------------------------- | ------------------------------------------ |
| 저장 위치           | 브라우저 메모리 (documentStore)               | PostgreSQL         |
| 지속성             | 세션 한정 (새로고침 시 초기화)               | 영구 저장                      |
| 목적              | `Ctrl+Z / Y` 편집 취소·복원 (즉각 반응)    | 저장 시점별 버전 조회·새 탭 복원                  |
| 저장 단위           | set() 1회 = 스냅샷 1개              | 명시적 저장 1회 = 문서 스냅샷 1 row            |
| 최대 보존           | 99개 (HISTORY_LIMIT)          | 무제한 (DB 용량 한도)                             |
| Undo 발생 시       | past.pop() → 스냅샷 교체      | 영향 없음 (다음 명시적 저장 때 새 버전)  |
| 버전 복원 발생 시      | 영향 없음 (새 탭에서 새 맵으로 열림)                | 새 맵 생성 + 복원본 저장              |

#### 16.4 연동 시나리오 — Undo 후 저장

1. 사용자: `기능 정의` 노드 삭제 → 자동저장으로 `map_documents` 갱신
2. 사용자: `Ctrl+Z` → 로컬 스냅샷 복원
3. 자동저장 시점에 → 서버가 jsonb 등가 비교 — 삭제 전 저장본과 같으면 `unchanged: true`
4. 이후 ☁ 저장(keepVersion) 시에만 `map_document_versions`에 버전이 남는다

#### 16.5 연동 시나리오 — 버전 복원은 새 맵 + 새 탭

1. 사용자: 히스토리 패널에서 v1 `[새 탭으로]` 클릭
2. 클라이언트: `GET /maps/{mapId}/versions/1` 로 doc 조회 → **새 맵 생성** 후 그 문서로 저장
3. 새 맵이 브라우저 새 탭(`?map=<id>`)에서 열린다 — 제목 `원제목_history_YYMMDD_HHMM`
4. **현재 탭의 맵·past/future 는 그대로** — 롤백에 따른 스택 초기화가 필요 없다 (e2e80)

> 원안의 "restore 엔드포인트 호출 후 clearHistory + baseVersion 갱신"
> 코드는 미채택 — restore 엔드포인트 자체가 없다.

#### 16.6 참조 문서

* `docs/03-editor-core/history/13-version-history.md` — 버전 이력 패널, 새 탭 복원 규칙
* `docs/03-editor-core/save/14-save.md` — 스냅샷 저장 파이프라인, 무변경 스킵, 편집 잠금
* `docs/02-domain/db-schema.md` — 서버 테이블 DDL

---

### 17. Undo/Redo 적용 범위

#### Undo/Redo 대상

스냅샷 방식이므로 **documentStore set() 을 거치는 모든 문서 변경**이 대상이다.

* 노드 생성 / 삭제 (단일·subtree·일괄)
* 노드 텍스트 수정, 이동, 순서 변경
* layoutType 변경 (맵 레이아웃 포함 — `{map, layout}`)
* 스타일 변경 (색상, 폰트, 테두리, 아이콘 등)
* 사진/첨부/링크/노트 변경
* import·템플릿 적용
* AI 생성 결과 적용

#### Undo/Redo 제외 대상

* 선택 상태, viewport pan/zoom, 패널 열기/닫기
* 검색 입력 중간값, 저장 상태 배지
* (계획) 협업 presence·채팅 등

---

### 18. 일괄 변경 규칙 (구 Transaction Rule)

> 원안의 `beginTransaction/commitTransaction` API 는 **미채택**.
> 같은 목표(여러 연산 = Undo 1단계)를 "한 번의 set() = 1단계" 원칙으로
> 달성한다.

| 작업 | 1단계 보장 방식 |
|---|---|
| subtree 이동 | 하나의 set 에서 처리 |
| layout 변경 (전체 맵 또는 subtree) | 하나의 set (+ `{map, layout}` 엔트리) |
| import / 템플릿 적용 | 결과 맵을 한 번에 교체 |
| AI 노드 트리 삽입 | 하나의 set |
| paste (서브트리 붙여넣기) | 하나의 set |
| 러버밴드 일괄 삭제 | `deleteNodesBulk` 1회 (e2e68) |
| 드래그·슬라이더 연속 변경 | `setHistoryPaused` (§6.4) |

---
