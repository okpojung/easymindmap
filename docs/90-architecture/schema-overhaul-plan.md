# 스키마 정비 계획 — DB 초기화와 함께 한 번에

> **왜 묶는가**: 아래 변경들은 전부 **기존 데이터가 있으면 어렵고, 없으면
> 쉽다.** DB 를 초기화하기로 한 지금이 유일하게 싼 시점이다. 나중에 유료
> 사용자가 생긴 뒤에는 각각이 별도 마이그레이션 프로젝트가 된다.
>
> **범위**: 스키마 변경 + 그에 딸린 최소한의 서버 로직. UI 는 별도.
>
> 작성: 2026-09-02 · **A·B·C 구현 2026-09-04** (PR — 스키마 정비 A; 델타는
> `apps/api/database/deltas/2026-09-04-schema-overhaul-abc.sql`, 검증 e2e197).
> D 와 §6 의 초기화는 사용자가 서버에서 한다.

---

## 0. 선행 확인 — 이미 끝난 것

| | 상태 |
|---|---|
| Step A 순환 판정 일원화 | ✅ 완료. `wouldCreateCycle` 이 유일 판정. `MAX_DEPTH` 도 보존됨 |
| Step B `buildTreeFromFlat` | ✅ 완료. `findOrphans` 사용 |
| D-1~D-6 이미지 외부화 | ✅ 완료 (#316 · #317 · #319) |

**따라서 이 계획서가 협업(CRDT) 착수 전 마지막 남은 코어 작업이다.**

---

## 1. 무엇을 바꾸는가 — 네 덩어리

| # | 변경 | 성격 | 지금 안 하면 | 상태 |
|---|---|---|---|---|
| **A** | `maps.owner_id` CASCADE 제거 | **파괴적** | 협업 켜는 순간 데이터 손실 버그가 실재화된다 | ✅ 2026-09-04 (RESTRICT + 탈퇴 흐름) |
| **B** | 버전 보관 컬럼 추가 | 가산 | 나중에 백필이 필요해진다 | ✅ 2026-09-04 (컬럼·인덱스만) |
| **C** | 소유권 이전 테이블 | 가산 | A 의 해법이 없다 | ✅ 2026-09-04 (표·인덱스만) |
| **D** | 첨부 저장 경로 분리 | 인프라 | 첨부가 차면 API 서버가 죽는다 | ☐ 운영 작업 — 사용자 |

**A 가 이 계획의 이유다.** 나머지는 A 를 고치려면 어차피 필요하거나, 같은 초기화 창에서 처리하는 편이 싼 것들이다.

---

## 2. A — 개설자 탈퇴 시 협업맵이 사라지는 문제

### 2.1 현상 (확인됨, 2026-09-02)

```
account.service.ts:407   DELETE FROM public.users
        ↓ CASCADE
      maps
        ↓ CASCADE
      map_documents · map_document_versions · nodes · map_members · attachments
```

**탈퇴 버튼 하나로 다른 참여자의 작업까지 사라진다.** 되돌릴 방법이 없다.

지금은 협업 사용자가 없어 실제 피해가 없다. **협업 기능을 켜는 순간
실재하는 사고가 된다.**

### 2.2 두 층으로 막는다

| 층 | 무엇 | 역할 |
|---|---|---|
| **DB** | `maps.owner_id` → `ON DELETE RESTRICT` | 마지막 방벽. 앱이 틀려도 막는다 |
| **앱** | `account.service.ts` 탈퇴 전 검사 | 사용자에게 **이유를 설명**하는 층 |

**둘 다 한다.** 역할이 다르다 — `move_node_subtree.sql` 의 ltree 판정을
`wouldCreateCycle` 도입 후에도 남겨 둔 것과 같은 논리다.

```sql
ALTER TABLE public.maps
  DROP CONSTRAINT IF EXISTS maps_owner_id_fkey;

ALTER TABLE public.maps
  ADD CONSTRAINT maps_owner_id_fkey
  FOREIGN KEY (owner_id) REFERENCES public.users(id)
  ON DELETE RESTRICT;
```

> ⚠️ `RESTRICT` 로 바꾸면 **단독맵(kind='solo')만 가진 사용자도 탈퇴가 막힌다.**
> 그래서 앱 층에서 단독맵을 먼저 지운 뒤 `users` 를 지우는 순서가 필요하다.
> §2.3 참조.

### 2.3 탈퇴 흐름

```
탈퇴 요청
  │
  ├─ 내가 개설자인 협업맵(kind='collab')이 있는가?
  │    있음 → 막는다. 목록을 보여주고 소유권 이전을 안내한다
  │    없음 → 계속
  │
  ├─ 단독맵을 먼저 삭제 (앱이 명시적으로)
  ├─ 다른 맵의 map_members 에서 나를 제거
  └─ DELETE FROM users
```

구현(2026-09-04): `DELETE /account` 가 **409** `{code:'OWNS_COLLAB_MAPS', message,
collabMaps, memberTotal}` 로 답하고, `GET /account/delete-preview` 가 `blocked` 와
같은 목록을 미리 준다. **휴지통의 협업맵은 막지 않는다** — 참여자는 이미 열 수
없고(map-access 가 `deleted_at` 을 본다), 영구 삭제 API 가 없는 지금 막으면
그 사용자는 탈퇴할 길이 없다. `map_members` 델타가 없는 서버에서는 참여자
수를 null 로 주되 **막기는 막는다**(더 적게 들여보내는 쪽).

"협업맵" 은 `kind='collab'` **또는 `map_members` 행이 있는** 활성 맵이다 —
`PATCH /maps/:id` 로 kind 를 solo 로 되돌려도 참여자는 남고 map-access 는
kind 를 보지 않는다(Codex 리뷰 P1). 단독맵 삭제(②)는 같은 판정으로
(`휴지통 OR (kind <> 'collab' AND 참여자 없음)`) **좁혀서** 지운다. `owner_id = 나` 전체를 지우면 ①이 빠진 날 협업맵을 앱이
손수 지우는 셈이라 RESTRICT 가 방벽 구실을 못 한다 — 검증에서 실제로 확인했다
(§2.4).

막을 때 보여줄 것:

```
함께 쓰는 맵 3개의 개설자입니다.
탈퇴하면 참여자 5명의 작업도 함께 사라집니다.
먼저 소유권을 넘기거나 맵을 삭제해 주세요.

 · 2027 사업계획   (참여자 4명)   [소유권 넘기기]
 · 팀 회고         (참여자 2명)   [소유권 넘기기]
 · 제품 로드맵     (참여자 1명)   [소유권 넘기기]
```

> **여기서 C(소유권 이전)가 그대로 쓰인다.** 두 기능이 하나로 이어진다.

### 2.4 되돌려 깨뜨리기

- `RESTRICT` 만 넣고 앱 층을 안 고치면 **탈퇴가 아무 설명 없이 500 에러**가 된다
- 단독맵 삭제 순서를 빠뜨리면 **모든 사용자가 탈퇴 불가**가 된다
- `map_members` 정리를 빠뜨리면 참여자로 있는 맵 때문에 막힌다 —
  개설자가 아닌 참여는 막을 이유가 없다

실측 (2026-09-04, 빌드된 코드를 한 줄씩 빼고 돌렸다):

| 뺀 것 | 결과 |
|---|---|
| ② 단독맵 선삭제 | 단독맵만 가진 사용자도 **409 `MAPS_REMAIN`** — RESTRICT 가 막았다(모든 사용자 탈퇴 불가) |
| ② + 외래키 오류(23503)→409 변환 | **500** Internal server error |
| ① 협업맵 검사 (②는 좁힌 그대로) | **409 `MAPS_REMAIN`**, 협업맵·계정 그대로 — DB 가 마지막 방벽이었다 |
| ① + ②를 `owner_id = 나` 전체 삭제로 | **200** — 협업맵이 참여자와 함께 사라졌다. ②를 좁혀야 하는 이유 |

`map_members` 정리는 `users` 의 CASCADE 로도 지워지지만 앱이 명시적으로 먼저
지운다 — 순서를 읽는 사람이 "참여는 막지 않는다" 를 코드에서 보게 하기 위해서다.

---

## 3. B — 버전 보관 컬럼

근거: [`../03-editor-core/history/13a-version-retention.md`](../03-editor-core/history/13a-version-retention.md)

```sql
ALTER TABLE public.plan_quotas
  ADD COLUMN IF NOT EXISTS version_days INTEGER,   -- NULL = 무제한
  ADD COLUMN IF NOT EXISTS max_pinned   INTEGER;

UPDATE public.plan_quotas SET version_days =   7, max_pinned =   3 WHERE plan = 'free';
UPDATE public.plan_quotas SET version_days =  90, max_pinned =  20 WHERE plan = 'basic';
UPDATE public.plan_quotas SET version_days = 365, max_pinned =  50 WHERE plan = 'pro';
UPDATE public.plan_quotas SET version_days = 365, max_pinned = 100 WHERE plan = 'team';

ALTER TABLE public.map_document_versions
  ADD COLUMN IF NOT EXISTS pinned    BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS label     TEXT,
  ADD COLUMN IF NOT EXISTS pinned_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS pinned_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_versions_prune
  ON public.map_document_versions(map_id, created_at DESC)
  WHERE pinned = FALSE;
```

**부분 인덱스(`WHERE pinned = FALSE`)가 핵심이다.** 정리 대상만 인덱스에
들어가므로 영구보관이 늘어도 정리 질의가 느려지지 않는다.

`pinned_by` 가 `SET NULL` 인 이유: 별표를 붙인 사람이 탈퇴해도 **그 표시는
남아야 한다.** 누가 붙였는지만 모르게 된다.

> **✅ 워커는 2026-09-06 에 붙었다** — 13a §2.2-1 · e2e212. 아래는 그때의 결정.
>
> **정리 워커(`version-prune` 큐)는 이번 범위 밖이다.** 컬럼만 만들어 두고,
> 정리 로직은 UI 와 함께 별도 작업으로 한다. 컬럼이 없으면 아무것도 시작
> 못 하지만, 컬럼만 있고 워커가 없어도 아무 문제가 없다.

---

## 4. C — 소유권 이전

```sql
CREATE TABLE IF NOT EXISTS public.map_ownership_transfers (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    map_id      UUID NOT NULL REFERENCES public.maps(id) ON DELETE CASCADE,
    from_user   UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    to_user     UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    status      TEXT NOT NULL DEFAULT 'pending',   -- pending · accepted · declined · expired
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    responded_at TIMESTAMPTZ,
    expires_at  TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '14 days'
);

-- 한 맵에 열린 제안은 하나만
CREATE UNIQUE INDEX IF NOT EXISTS idx_transfer_one_open
  ON public.map_ownership_transfers(map_id)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_transfer_to_user
  ON public.map_ownership_transfers(to_user, status);
```

**`map_id` 는 CASCADE 가 맞다.** 맵이 사라지면 그 맵의 이전 제안도 의미가 없다.
A 에서 문제가 된 것은 `maps.owner_id → users` 였지 이쪽이 아니다.

부분 유니크 인덱스로 **동시에 여러 제안이 열리는 것**을 DB 층에서 막는다
(13a-version-retention.md §8 미결 항목 중 하나를 여기서 해소).

### 4.1 수락 시 용량 검사

```
받는 사람 사용량 + (최신 버전 + 첨부 + 영구보관)  ≤  받는 사람 한도
```

**제안 시와 수락 시 두 번 검사한다.** 그 사이 다른 파일을 올렸을 수 있다.
최종 판정은 수락 시점이다.

---

## 5. D — 첨부 저장 경로 분리

근거: [`infra-architecture.md`](infra-architecture.md) §18.7 ①②

스키마 변경은 없다. **운영 작업**이지만 같은 정비 창에서 처리한다 —
첨부 디렉터리를 옮기려면 어차피 서비스를 잠깐 멈춰야 하고, 데이터가
비어 있는 지금이 이관 비용 0 이다.

```
현재   STORAGE_LOCAL_DIR = ./data/attachments   → VM-02 OS 디스크(50GB)
목표   HNG1-NFS (47.6TB 여유) 마운트
```

> **✅ dev 는 이미 이 구성이다 (2026-09-05 em-dev 에서 실측).** 유료 API
> 컨테이너가 `STORAGE_LOCAL_DIR=/data/emm-attachments` 로 NFS 마운트
> (`/mnt/nas/emm-files`, nfs4, 48T 중 1% 사용)를 보고 있고 `u/`·`tmp/`·`p/`
> 가 거기 있다(1.0G). 위 "현재" 줄은 계획을 쓸 때의 짐작이었고 실제와
> 달랐다 — 유료 `deploy.md` §2.1 이 2026-08-19 에 화면에서 확인한 값이
> 맞다. **dev 에서 D 는 할 일이 없다.** 운영 서버를 세울 때 같은 두 칸
> (Persistent Storage + `STORAGE_LOCAL_DIR`)만 맞추면 된다.

지금은 첨부가 차면 **API 서버가 통째로 죽는다.** 로그도 못 쓰고 Docker 도
못 돈다.

NFS 마운트 확인 → `STORAGE_LOCAL_DIR` 변경 → 기존 첨부 rsync → 재기동.
`.11` · `.12` 에도 `HNG1-NFS` 가 마운트돼 있는지 먼저 확인한다
(vSphere → 각 호스트 → [데이터스토어] 탭).

> `storage.service.ts` 머리 주석이 이미 NFS 마운트를 상정하고 있다 —
> "드라이버는 디렉터리가 SSD 인지 NFS 인지 구분하지 않는다".
> **코드 변경 없이 환경변수와 마운트만으로 된다.**

---

## 6. 실행 순서

```
1  [준비]   현재 DB 덤프를 받아 둔다 (버리기로 했어도 받는다)
2  [준비]   첨부 디렉터리 현황 기록: 파일 수 · 총 크기
3  [정지]   Coolify 에서 API 정지

4  [D]      NFS 마운트 + STORAGE_LOCAL_DIR 변경          §5 참조
5  [초기화] maps · map_documents · map_document_versions ·
            nodes · map_members · attachments · 첨부 파일 삭제
6  [A]      maps.owner_id → RESTRICT
7  [B]      plan_quotas · map_document_versions 컬럼 추가
8  [C]      map_ownership_transfers 생성
9  [검증]   apply-schema.mjs 로 전체 스키마 재적용이 깨끗하게 통과하는가

10 [기동]   API 재시작
11 [A-앱]   account.service.ts 탈퇴 흐름 수정 + 배포
12 [검증]   §7 체크리스트
```

**11 을 마지막에 두는 이유**: `RESTRICT` 만 먼저 들어가면 탈퇴가 500 에러가
된다. 스키마와 앱이 같은 배포에 들어가야 한다면 6·11 을 한 배포로 묶는다.

---

## 7. 검증 체크리스트

```
A  개설자 탈퇴                                        (e2e197, 2026-09-04)
   ☑ 협업맵 개설자로 탈퇴 시도 → 목록과 함께 막힌다 (500 이 아니라 안내)   409
   ☑ 단독맵만 가진 사용자 → 정상 탈퇴된다
   ☑ 협업맵에 참여자로만 있는 사용자 → 정상 탈퇴되고 map_members 에서 빠진다
   ☑ DB 에서 직접 DELETE FROM users 시도 → RESTRICT 로 막힌다   23503 maps_owner_id_fkey

B  버전 보관
   ☑ plan_quotas 4행에 version_days · max_pinned 가 들어갔다
   ☑ 새 버전의 pinned 기본값이 false 다
   ☑ pinned_by 사용자를 지워도 그 버전이 남는다 (SET NULL)

C  소유권 이전
   ☑ 같은 맵에 두 번째 pending 제안 → 유니크 인덱스가 막는다   23505
   ☑ 맵을 지우면 그 맵의 제안도 사라진다

D  첨부
   ☐ df -h 로 마운트 확인. Filesystem 이 NFS 다
   ☐ 사진 붙여넣기 → 새 경로에 파일이 생긴다
   ☐ mountpoint -q 검사가 디스크 알림에 들어갔다   infra §16.2
   ☐ ZIP·HTML 내보내기가 서버 없이 열린다          content-permanence §7.1

전체
   ☑ 기존 e2e 회귀 없음 (smoke 40/40 · e2e197 27/27)
   ☑ apply-schema.mjs 를 빈 DB 에 돌려 한 번에 통과한다 (145건 · CI 방식 psql ON_ERROR_STOP 도 통과)
   ☑ 델타 SQL 두 번 실행해도 오류 없음 · 델타 미적용 DB 에서도 탈퇴·맵 열기가 죽지 않는다
```

D 는 사용자가 서버에서 확인한다(코드 변경 없음).

---

## 8. 이번 범위 밖

- **`version-prune` 워커** — 컬럼만 만든다. 정리 로직은 UI 와 함께
- **소유권 이전 API·UI** — 테이블만 만든다
- **CRDT / Yjs** — 유료 모듈, 별도 저장소
- **vault 미러 테이블**(`vault_files` · `map_links`) — 설계 단계.
  구현 착수 시 같은 방식으로 추가한다

---

## 9. 정해진 것 · 아직 정하지 않은 것

### 9.1 정해진 것

- **A 는 `RESTRICT` 다** (2026-09-04 구현). `SET NULL` 이면 탈퇴는 되지만
  주인 없는 맵이 남고, 그 맵의 요금제 기준이 사라진다
  (13a-version-retention.md §4.5 는 개설자 요금제를 따른다). "탈퇴를 막는
  것이 강하다" 는 반론은 앱 층이 답한다 — 막되 **이유와 맵 목록을 함께**
  보여 주고(409), 휴지통에 넣은 협업맵은 막지 않는다. 소유권 이전 UI(C)가
  붙으면 그 목록에 [소유권 넘기기] 가 들어간다.

### 9.2 아직 정하지 않은 것

- **이전 제안 만료 14일**이 적절한가.
- **협업맵을 개설자가 삭제할 때** 참여자에게 알릴 것인가.
