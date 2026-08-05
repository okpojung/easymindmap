# 14. Save
## SAVE

* 문서 버전: v2.2
* 작성일: 2026-04-16
* 최종 업데이트: 2026-08-04
* 변경 이력:
  * v2.2 — 유실이 재발해(2026-08-05) **서버 가드**를 마지막 방어선으로 추가(§7.2) + 프런트 가드를 '가지 0개면 자동저장 안 함'으로 강화.
  * v2.1 — 자동저장 유실 가드 4중(§7.1) 신설: 실사용 보고(저장한 맵이 재로그인 후 '중심 주제만' 남는 유실)의 원인 = 맵 전환 레이스 수정.
  * v2.0 — 실제 구현 기준 현행화: Patch 저장 → **전체 스냅샷 `PUT /maps/:id/document`**, 800ms 이원화 → **1500ms 단일 디바운스**, patchId/Redis 멱등성·baseVersion 3단계 충돌·재시도/backoff·localStorage 백업 → 미채택/미구현으로 강등, 충돌 = **단일 세션 편집 잠금(map_edit_locks)**, 무변경 스킵 + buildSnapshot 정규화 절 신설, §12 를 실제 서버 7단계로 재작성.
  * v1.1 — NodePatch op 명칭을 api-spec.md v2.3 기준(`add`/`update`/`delete`/`move`)으로 통일 (CON-001 정합성 보정)
* 참조: `docs/01-product/functional-spec.md § SAVE`, `docs/03-editor-core/history/12-history-undo-redo.md`, `docs/03-editor-core/history/13-version-history.md`

---

### 1. 기능 목적

* 사용자 편집 내용을 **전체 문서 스냅샷으로 자동 저장(Autosave)** 하는 기능
* 편집 중 브라우저 종료·네트워크 오류 발생 시 데이터 손실 최소화
* 프런트 문서 모델(이미지·노트·스타일을 통째로 담은 스냅샷) 그대로를 `PUT /maps/:id/document` 로 저장 — patch 분해 없이 단순·견고
* 1500ms 단일 디바운스 + 서버 측 무변경 스킵으로 성능과 안전성 확보

> 원안의 "Patch 기반 변경분 전송" 설계는 **미채택** — 스냅샷 방식이
> 프런트 모델과 1:1 이라 채택했다. patch 경로는 정규화 노드(협업용)
> 설계로만 남아 있다.

---

### 2. 기능 범위

* 포함:
  * 스냅샷 자동 저장 (1500ms 디바운스)
  * **명시적 저장** — ☁ 저장 버튼 · 맵 닫기 · **다른 이름으로 저장**(map-save-as) — `keepVersion: true` 로 버전 이력 생성
  * 저장 상태 배지 (saved / saving / dirty / error)
  * 무변경 저장 스킵 (서버 jsonb 등가 비교 → `unchanged: true`)
  * 단일 세션 편집 잠금 (`map_edit_locks`) 기반 충돌 차단
  * Undo/Redo 실행 후 자동 저장 연동 (동일 스냅샷 경로)

* 제외:
  * 버전 이력 관리 (→ VERSION_HISTORY, `13-version-history.md`)
  * Undo/Redo 히스토리 (→ HISTORY)
  * 자동 재시도 / 오프라인 큐 / localStorage 백업 [미구현 — 백로그]

---

### 3. 세부 기능 목록

| 기능ID   | 기능명              | 설명                              | 상태          |
| ------- | ---------------- | ------------------------------- | -------------- |
| SAVE-01 | 자동 저장 (Autosave) | 문서 변경 1500ms 후 전체 스냅샷 PUT       | 구현됨  |
| SAVE-02 | 저장 상태 표시         | 툴바 배지 saved/saving/dirty/error | 구현됨       |
| SAVE-03 | 무변경 스킵           | 서버 jsonb 등가 비교 → 변경 없으면 아무것도 쓰지 않음 (`unchanged`)             | 구현됨   |
| SAVE-04 | 충돌 차단            | 단일 세션 편집 잠금 — 타 세션 PUT 409, 열람은 읽기 전용        | 구현됨 (e2e93) |
| SAVE-05 | 명시적 저장           | ☁ 저장·맵 닫기·다른 이름 저장 → `keepVersion: true`    | 구현됨      |
| SAVE-06 | 자동 재시도 / localStorage 백업  | 네트워크 오류 시 backoff 재시도·로컬 백업       | [미구현 — 백로그]         |
| SAVE-07 | Undo/Redo 저장 연동  | Undo/Redo 실행 결과도 동일 디바운스 저장   | 구현됨   |

---

### 4. 기능 정의 (What)

#### 4.1 저장 전략

| 변경 유형                | 저장 타이밍        |
| -------------------- | ------------- |
| **모든 문서 변경** (텍스트·스타일·구조·레이아웃 등 구분 없음) | **1500ms 단일 디바운스** |

> 원안의 "텍스트 800ms / 구조 변경 0ms 즉시" 이원화는 미채택 — 스냅샷
> 방식에서는 어떤 변경이든 최종 상태 하나만 보내면 되므로 단일
> 디바운스로 충분하다.

#### 4.2 저장 요청 구조 (실제)

```typescript
// PUT /maps/{mapId}/document
interface SaveDocumentRequest {
  doc: SampleMap;          // buildSnapshot() 결과 — 전체 문서 스냅샷
  title?: string;          // 맵 제목
  keepVersion?: boolean;   // true = 명시적 저장 → map_document_versions 에 버전 생성
  editSession?: string;    // 편집 세션 키 — 편집 잠금(map_edit_locks) 식별자
}

// 응답
interface SaveDocumentResponse {
  unchanged?: boolean;     // 무변경 스킵 시 true (아무것도 쓰지 않았음)
  // ... 저장 결과 메타
}
```

#### 4.3 buildSnapshot 정규화 (신설)

저장 스냅샷과 로드 결과는 **같은 정규형**이어야 무변경 비교가 성립한다.

* 새 맵/불러온 맵은 `edgeType`·`children` 기본값이 빠진 채 저장돼, 다시
  열면(로드 정규화) 같은 내용인데 jsonb 가 달라 보이는 문제가 있었다
* → `buildSnapshot()` 이 로드와 같은 정규화
  (`normalizeMapForSnapshot` = cloneMap)를 거쳐 저장한다 (e2e90)
* 스냅샷 v2 에는 문서 외에 **editorUi 의 `layoutType`·`spacingX/Y`** 도
  포함된다 — 서버에서 다시 열 때 레이아웃 복원 (e2e85 [3])

> 원안의 patchId 생성 규칙(`p_{timestamp}_{counter}`)은 patch 경로 전용
> 설계로 미사용.

---

### 5. 동작 방식 (How)

#### 5.1 사용자 동작

* 편집 발생 시 자동 저장 (별도 동작 불필요)
* 툴바 배지에서 저장 상태 실시간 확인
* ☁ 저장 / 맵 닫기 / 다른 이름으로 저장 = 명시적 저장 (버전 생성)
* 저장 오류 시 배지가 error 로 — 다음 편집/저장 시 다시 시도

---

#### 5.2 시스템 처리 흐름

```
사용자 편집
    │
    ▼
documentStore 즉시 메모리 반영 (+ past 스택 push)
    │
    ▼
saveState = 'dirty' → 1500ms 디바운스
    │
    ▼
buildSnapshot() (normalizeMapForSnapshot 정규화)
    │
    ▼
PUT /maps/{mapId}/document { doc, title, editSession }   ← 자동저장은 keepVersion 없음
    ├─ 소유권·편집 잠금 확인
    ├─ jsonb 등가 비교 → 같으면 unchanged (쓰기 없음)
    └─ map_documents upsert
    │
    ▼
saveState = 'saved' (실패 시 'error')
```

---

#### 5.3 충돌 차단 — 단일 세션 편집 잠금

> 원안의 "baseVersion 3단계 해소(rebase → 사용자 선택 → localStorage
> 백업)"는 미채택. 충돌을 **사후 해소가 아니라 사전 차단**한다.

* 저장 시 `map_edit_locks` 에 편집 세션 잠금 1행 (TTL **60초**, 하트비트 **25초** 갱신)
* 다른 세션(브라우저)이 같은 맵을 열면: 🔒 **읽기 전용** (배너 상시 + 토스트, 서버 링크 없음 → 다른 이름 저장만 유도)
* 다른 세션 키로 직접 PUT: **409** "다른 세션(브라우저)에서 편집 중"
* 잠금 세션이 맵을 닫으면 잠금 해제 → 다른 세션이 편집권 획득 (e2e93)
* **모든 저장 요청은 자기 세션 키(`editSessionKey()`)를 실어야 한다.**
  키 없이 보낸 PUT 은 서버가 "다른 세션이 편집 중"으로 보고 409 로
  거절한다 — 자기 잠금에 자기 저장이 막힌다 (§7.3)

---

#### 5.4 재시도 전략 — 짧은 backoff 2회 (2026-08-05)

* 자동저장 실패 시 **1초 → 3초** 로 최대 2회 자동 재시도한다
  (`useCloudAutosave.RETRY_DELAYS`)
* 재시도가 남아 있는 동안 배지는 `retrying`(= "저장 실패 — 재시도 중…"),
  다 쓰고도 실패하면 `error`(= "저장 실패 — ☁ 저장을 눌러 주세요")
* 맵을 닫거나 다른 맵으로 전환하면(`suppressCloudAutosave`) 예약된
  재시도는 취소한다 — 이전 맵의 재시도가 새 문서를 덮어쓰지 않도록
* 그래도 실패하면 다음 문서 변경·명시적 ☁ 저장에서 다시 PUT 한다

> 이전에는 재시도가 **없는데도** 배지가 "재시도 중"이라고 말했다.
> 사용자는 기다리면 저장될 줄 알고 기다렸고, 실제로는 아무 일도
> 일어나지 않았다. 문구를 사실로 만들었다.

---

#### 5.5 저장 상태 배지 (실제 5종)

| 상태 (`autosaveStore.saveState`) | 의미                    |
| ---------- | --------------------- |
| `saved`       | 저장 완료 (기본)  |
| `saving`      | PUT 진행 중             |
| `dirty`      | 변경 있음 — 디바운스 대기 중         |
| `retrying`      | 실패 — **재시도 예약됨** (1초/3초)  |
| `error`      | 재시도까지 소진 — 손으로 ☁ 저장 필요        |

* 표시는 툴바 배지 하나 — `autosaveStore` 는 이 배지용 `saveState` 1개만 관리한다
* 실패 배지에는 서버가 준 실제 사유를 `title`(툴팁)로 붙인다 — 다음
  보고에서 "왜 실패했는지"를 바로 알 수 있게

---

### 6. 규칙 (Rule)

#### 6.1 저장 타이밍
* 모든 문서 변경 = 1500ms 단일 디바운스 (즉시 저장 유형 구분 없음)
* 명시적 저장(☁·맵 닫기·다른 이름 저장)은 즉시 + `keepVersion: true`

#### 6.2 무변경 스킵
* 서버가 현재 문서와 새 문서를 **jsonb 등가**로 비교 (키 순서 무관)
* keepVersion 이면 **마지막 버전의 doc·title 과도** 비교
* 둘 다 같으면 아무것도 쓰지 않고 `unchanged: true` — 문서·버전·`maps.updated_at` 모두 그대로
* 명시적 저장 버튼은 이때 "변경된 내용이 없어 그대로 두었습니다" 안내 (e2e90)

#### 6.3 멱등성
* patchId/Redis 기반 멱등성은 미사용 — 스냅샷 PUT 은 그 자체로 멱등이고, 무변경 스킵이 중복 쓰기를 막는다

#### 6.4 권한 규칙

* 현재: **소유자 단독** — 소유자의 편집 세션만 저장 가능 (타 사용자 404, 타 세션 409/읽기 전용)
* (계획 — 협업 V1) editor/viewer 역할 구분

---

### 7. 예외 / 경계 (Edge Case)

* **다른 세션 동시 편집**: 편집 잠금으로 사전 차단 (§5.3) — 읽기 전용 세션의 ☁ 저장은 새 맵(사본) 저장 대화상자
* **저장 실패**: 1초·3초 자동 재시도(배지 retrying) → 그래도 실패하면 배지 error + 손으로 ☁ 저장 안내
* **무변경 저장/닫기**: unchanged 스킵 (§6.2)
* **오프라인 큐 누적 → 온라인 복귀 순차 전송**: [미구현 — 백로그]
* **`beforeunload` 즉시 flush**: [미구현 — 백로그] — 디바운스 창(1.5초) 안에 탭을 닫으면 마지막 변경이 유실될 수 있다
* **localStorage 임시 백업 + 복구 버튼**: [미구현 — 백로그]

#### 7.1 자동저장 유실 가드 4중 (2026-08-04 실사용 보고)

증상: 저장해 둔 맵(예: AI 답변으로 만든 맵)이 재로그인 후 **'문서 없음'
/중심 주제만** 남는 유실. 재구성한 경로 — ① 편집으로 디바운스 타이머
예약 → ② 맵 닫기·웹AI 새 맵(detach)으로 문서 전환 → ③ 그 사이 진행
중이던 doSave 응답이 **무조건 link() 로 이전 맵 연결을 부활**시키고 →
④ 예약돼 있던 rerun 이 부활한 연결로 **전환 후의 문서(플레이스홀더)를
이전 맵에 저장**. `useCloudAutosave.ts` 에 4중 가드로 봉쇄:

1. **suppressCloudAutosave 가 예약도 취소** — skip 플래그만 세우던 것을
   `clearTimeout(timer)` + `rerun=false` 까지. 전환 직전 예약분이 전환
   후 문서를 쏘지 못한다.
2. **빈 문서·'문서 없음' 플레이스홀더는 자동저장 거부** (doSave 최후
   방어선). 맵을 정말 비우려면 수동 ☁ 저장.
3. **doSave 시작 시 mapId 캡처** — 응답 후 `cloudMapId === mapId` 일
   때만 link/에러 표시/rerun. 닫은 맵의 연결이 부활하지 않는다.
4. **subscribe 에서 skip 소모를 연결 검사보다 먼저** — 미연결 상태의
   변경이 skip 을 소모하지 않아 플래그가 남던 잔존 버그 제거.

검증: e2e96 [3] — 서버 맵 편집(타이머 예약) 직후 웹AI 새 맵 전환,
이전 맵의 `map_documents` 내용·updated_at 무변화 확인.

#### 7.2 서버 가드 — 자동저장은 내용을 지울 수 없다 (2026-08-05)

프런트 가드 4중을 넣은 뒤에도 같은 유실이 재발했다(맵이 1노드·287B로
남음). 클라이언트에서 막는 한 새로운 전환 경로가 생길 때마다 구멍이
날 수 있으므로, **서버가 마지막으로 막는다**:

```
PUT /maps/:id/document
  keepVersion=false(자동저장) AND 새 doc 의 map.branches 가 0개
  AND 기존 doc 의 map.branches 가 1개 이상
    → 쓰지 않고 { unchanged: true } 반환 + 경고 로그
```

**명시 저장(`keepVersion=true` — ☁ 저장·맵 닫기)은 통과시킨다.** 그건
사용자의 뜻이고 히스토리 버전이 남아 되돌릴 수 있다. 반면 자동저장은
버전을 남기지 않아 되돌릴 수단이 없다 — 그래서 "내용이 사라지는
방향"의 자동저장만 거부한다.

프런트도 같은 기준으로 강화했다: `useCloudAutosave` 가 **가지 0개
문서면 요청 자체를 보내지 않는다**(이전에는 제목이 '문서 없음'인
경우만 막아, 제목은 남고 가지만 빈 중간 상태가 통과했다).

검증: `guard5.mjs` — ①자동저장 빈 문서 → 4노드 294B 그대로 ②명시
저장 빈 문서 → 1노드 150B 반영 ③자동저장 내용 있음 → 정상 저장.

복구 안내: 자동저장은 히스토리 버전을 만들지 않으므로, 유실된 맵도
**명시 저장 시점의 버전이 히스토리에 남아 있을 가능성이 높다** —
히스토리 패널에서 해당 버전을 "새 탭으로" 열어 복구한다.

#### 7.3 자동저장이 자기 잠금에 막혀 전부 409 (2026-08-05, 수정)

증상은 "되돌리기(Ctrl+Z) 중 우상단에 **저장 실패** 배지가 뜬다"였다.
재현해 보니 되돌리기와는 무관했고, **자동저장 PUT 이 예외 없이 409**
로 거절되고 있었다.

원인: 맵을 열면 그 탭이 편집 잠금을 획득한다(§5.3). 그런데
`useCloudAutosave.doSave()` 만 `cloudApi.saveDocument()` 에 **편집 세션
키를 넘기지 않았다**. 서버는 키 없는 요청을 "잠금을 쥔 세션과 다른
세션"으로 판정해 409 로 막았다 — 자기가 쥔 잠금에 자기 저장이 막힌
꼴이다. 명시 저장(`saveCurrentMap`·`saveNewMap`)은 처음부터 키를 싣고
있었기 때문에 **☁ 저장만은 잘 되는** 것이 증상을 오래 가렸다.

수정: 세션 키 함수를 `services/cloud/editSession.ts` 로 분리하고
(mapSession → useCloudAutosave 방향의 import 순환을 피하려고),
자동저장도 `saveDocument(mapId, snapshot(), title, false, editSessionKey())`
로 키를 싣는다.

검증: e2e102 [5] — 편집·되돌리기 뒤 배지가 `saved` 로 끝나고
`/document` 409 가 0건.

> 참고: 되돌리기를 **문서를 연 시점보다 더 뒤로** 밀면 가지 0개
> 상태가 되고, 그때는 §7.2 가드가 자동저장을 보내지 않아 배지가
> `dirty` 로 남는다 — 의도된 동작이다(내용을 지우는 방향의 자동저장
> 금지). 그 상태를 서버에도 반영하려면 명시 ☁ 저장을 쓴다.

---

### 8. DB 영향

* `map_documents` — 현재 문서 스냅샷 (upsert 대상)
* `maps.title` / `maps.updated_at` — 저장 시 갱신 (무변경이면 그대로)
* `map_document_versions` — keepVersion 저장 시 버전 INSERT (`13-version-history.md`)
* `map_edit_locks` — 편집 세션 잠금 (TTL 60초)

---

### 9. API 영향

* `PUT /maps/{mapId}/document` — 저장 핵심 엔드포인트 (자동저장·명시적 저장 공통)

---

### 10. 연관 기능

* VERSION_HISTORY (`13-version-history.md`)
* HISTORY (`12-history-undo-redo.md`)
* NODE_EDITING (`02-node-editing.md`)
* 문서함 (`document-library.md` — 첫 저장 대화상자·이름 규칙)

---

### 11. 구현 상태

#### 구현됨

* 1500ms 디바운스 스냅샷 자동저장 (e2e-cloud2)
* 명시적 저장 3경로 (☁·맵 닫기·다른 이름 저장) + keepVersion
* 상태 배지 5종 (retrying 포함)
* 무변경 스킵 + buildSnapshot 정규화 (e2e90)
* 단일 세션 편집 잠금 (e2e93) — 자동저장도 세션 키를 싣는다 (e2e102 [5])
* 저장 실패 자동 재시도 1초/3초 2회 (§5.4)

#### [미구현 — 백로그]

* 긴 backoff·무한 재시도 (지금은 2회로 끝난다)
* localStorage 임시 백업 + 복구
* `beforeunload` 즉시 flush / 오프라인 큐

---

### 12. 서버 저장 처리 세부 단계 (실제)

`PUT /maps/{mapId}/document` 수신 시 서버는 아래 7단계를 수행한다.

```
PUT /maps/{mapId}/document { doc, title, keepVersion, editSession }
        │
        ▼
1. 소유권 확인 — 소유자가 아니면 404
        │
        ▼
2. 편집 잠금 확인 (map_edit_locks)
   다른 세션이 유효 잠금 보유 → 409 "다른 세션(브라우저)에서 편집 중"
   내 세션이면 잠금 생성/하트비트 갱신 (TTL 60초)
        │
        ▼
3. jsonb 등가 비교 (키 순서 무관)
   현재 문서와 동일 + (keepVersion 이면) 마지막 버전과도 동일
   → 아무것도 쓰지 않고 { unchanged: true } 반환
        │
        ▼
4. 저장 쿼터 확인 — 초과 시 거부 (413 계열 안내)
        │
        ▼
5. map_documents upsert (전체 스냅샷)
        │
        ▼
6. maps.title / updated_at 갱신
        │
        ▼
7. keepVersion: true 이면 map_document_versions INSERT
   (version = MAX(version)+1, layout_type·node_count·attach_bytes·attach_count 기록)
```

> 원안의 서버 단계(Redis SET NX 멱등성 → baseVersion 409 → patch 적용 →
> orderIndex 재정규화 → Redis 스냅샷 캐시 무효화 → WebSocket 협업
> 브로드캐스트)는 정규화 노드/협업 경로 설계로, 문서 저장 경로에서는
> 쓰지 않는다. 협업 V1 설계 시 재검토한다.

---

### 13. 저장 상태 전체 표시 목록 (실제)

| 상태         | 표시                          |
| ---------- | --------------------------- |
| `saved`       | 저장 완료 배지      |
| `saving`      | 저장 중 배지               |
| `dirty`      | 변경 있음 (디바운스 대기) 배지        |
| `retrying`      | "저장 실패 — 재시도 중…" 배지 (실패 사유 툴팁) |
| `error`      | "저장 실패 — ☁ 저장을 눌러 주세요" 배지 (실패 사유 툴팁) |

> 원안의 Offline / Conflict 표시는 해당 기능(오프라인 큐·충돌 해소)이
> 미채택/미구현이라 존재하지 않는다. 충돌은 읽기 전용 배너(🔒)로
> 사전에 안내된다. Retrying 은 2026-08-05 에 실제 재시도와 함께 생겼다
> (그 전에는 재시도가 없는데 `error` 배지가 "재시도 중"이라고 말했다).
