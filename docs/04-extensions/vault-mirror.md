# vault 미러 — DB 정본 + 파일 미러 (C안)

> **이 문서가 정하는 것**: `map_documents.doc`(정본)를 사람이 읽을 수 있는
> `.md` 파일 트리로 계속 내보내는 규칙. 파일 경로 · 첨부 파일명 · 위키링크
> 문법 · 덮어쓰기 안전장치.
>
> **정하지 않는 것**: 파일 → DB 역방향 동기화. **이번 범위 밖이다**(§9).
>
> 작성: 2026-08-20 · 결정: C안(DB 정본 + 파일 미러), 2026-08-20

---

## 1. 왜 하는가

easymindmap 은 마인드맵 앱이면서 개인·팀 지식 저장소(KMS)로 쓰인다.
KMS 사용자가 보는 질문은 하나다 — **10년 뒤에도 읽히는가.**

Obsidian 이 이긴 이유는 기능이 아니라 **당신 폴더에 있는 그냥 `.md` 파일**
이라는 점이다. 회사가 망해도 노트가 남는다.

세 갈래 중 C 를 골랐다.

| | 구조 | 대가 |
|---|---|---|
| A | DB 정본만 | "당신 서버가 죽으면?" 에 답이 없다 |
| B | 파일 정본 | 협업·동시편집이 훨씬 어려워진다 |
| **C** | **DB 정본 + 파일 미러** | 동기화 규칙을 지켜야 한다 |

정본은 `map_documents.doc` 그대로다. **협업·버전 히스토리·검색은 아무것도
바뀌지 않는다.** vault 는 그 위에 얹는 단방향 출력이다.

부수 효과: 기능 목록 28번(OBSIDIAN_INTEGRATION)이 "연동"이 아니라
**"같은 폴더를 본다"** 로 해결된다.

---

## 2. 범위 — 셀프호스트 전용이다

vault 는 파일시스템이 있어야 한다. 클라우드 SaaS 사용자에게는 그들의
디스크가 없다.

| 배포 | vault |
|---|---|
| **Docker 셀프호스트** | ✅ 볼륨에 미러. 이 문서의 대상 |
| 클라우드(mindmap.ai.kr) | ❌ 대신 "vault 통째로 ZIP 내려받기" |

> 이것이 Docker 셀프호스트를 쓸 진짜 이유가 된다. "마인드맵 앱을 도커로
> 띄운다" 가 아니라 **"내 지식 저장소를 내 NAS 에 둔다"** 다.

---

## 3. 폴더 구조

```
/data/vault/
├─ .easymindmap-vault          ← 마커 파일 (§7)
├─ README.md                   ← 자동 생성. "이 폴더는 …" 경고
├─ 연구/
│  └─ RAG 증분 인덱싱.md
├─ 회의/
│  └─ 2026-08-20 협업 설계.md
├─ .attachments/
│  ├─ 3f7a2b91c4d05e68.png
│  └─ a02c5518fe93b7d1.pdf
└─ .trash/
   └─ 옛 메모.md
```

`map_folders` 트리를 그대로 디렉터리로, `maps.title` 을 파일명으로 쓴다.
`folder_id IS NULL`(홈)은 vault 루트다.

### 3.1 파일명 정규화 — 그냥 제목을 쓸 수 없다

| 문제 | 규칙 |
|---|---|
| 파일시스템 금지문자 `/ \ : * ? " < > \|` | `-` 로 치환 |
| Windows 예약어 (`CON` `PRN` `AUX` `NUL` `COM1`…) | 뒤에 `_` 를 붙인다 |
| 앞뒤 공백 · 끝의 `.` | 없앤다 (Windows 가 거부한다) |
| 255바이트 상한 | UTF-8 기준으로 자른다. **글자 중간에서 자르지 마라** |
| 빈 제목 | `Untitled-<map_id 앞 8자>.md` |
| **같은 폴더 내 제목 중복** | `maps` 에 unique 제약이 없다. 뒤에 `-<map_id 앞 8자>` 를 붙인다 |
| **한글 정규화** | **반드시 NFC.** macOS 는 NFD 로 쓰는 경로가 있어 자모가 분리돼 보이고, Git 에서 같은 파일이 둘로 보인다 |

### 3.2 이름이 바뀌면

제목 변경 · 폴더 이동은 **옛 파일을 지우고 새 경로에 쓴다**(rename 이 아니라
delete + write). rename 을 쓰면 대소문자만 바뀐 경우 일부 파일시스템에서
실패한다.

옛 경로는 `vault_files` 표(§8)로 추적한다. 추적하지 않으면 제목을 바꿀
때마다 **유령 파일이 쌓인다.**

### 3.3 삭제

`maps.deleted_at` 은 soft delete 다. vault 도 같게 한다 — 파일을
`.trash/` 로 옮긴다. **지우지 않는다.** 복원했는데 파일이 없으면 사용자는
데이터를 잃었다고 생각한다.

---

## 4. 첨부 파일명 — 내용 해시

```
.attachments/<sha256 앞 16자>.<ext>
예: .attachments/3f7a2b91c4d05e68.png
```

**ZIP 내보내기의 `files/img-1.png` 와 다른 규칙이다.** 이유:

- ZIP 은 맵 하나만 담는다. 1번부터 세도 충돌하지 않는다
- vault 는 **모든 맵이 한 폴더를 공유한다.** `img-1.png` 는 즉시 충돌한다
- 같은 사진이 열 개 맵에 있어도 **한 벌만 저장**된다(내용 해시의 이점)

원본 파일명은 파일명에 넣지 않는다 — 금지문자·길이·중복 문제를 다시
겪는다. 대신 **마크다운 alt 텍스트로 남긴다.**

```markdown
![설계 초안.png](.attachments/3f7a2b91c4d05e68.png)
```

### 4.1 고아 첨부

맵에서 사진을 지워도 `.attachments/` 파일은 남는다. 다른 맵이 같은 해시를
참조할 수 있기 때문이다(`attachments.map_id` 가 `ON DELETE SET NULL` 인
것과 같은 이유).

**정리는 자동으로 하지 않는다.** 참조 수를 세어 0 인 것을 지우는 작업은
경합이 있고, 잘못하면 살아 있는 사진을 지운다. `.trash/` 처럼 명시적
"정리" 메뉴로 둔다.

---

## 5. 위키링크

### 5.1 문법

```markdown
[[RAG 증분 인덱싱]]              맵 전체를 가리킨다
[[RAG 증분 인덱싱#병합 전략]]     그 맵의 노드를 가리킨다
```

Obsidian 문법 그대로다. **EMM 은 노드를 헤딩으로 내보내므로 `#노드제목` 이
그대로 Obsidian 의 헤딩 링크와 맞는다.** 별도 변환이 필요 없다.

### 5.2 표기는 제목, 해석은 UUID

제목 기반 링크만 쓰면 제목이 바뀔 때 전부 깨진다. UUID 만 쓰면 Obsidian 에서
안 열리고 사람이 못 읽는다. **둘 다 쓴다.**

```markdown
본문:      [[RAG 증분 인덱싱#병합 전략]]

메타 주석:  { "links": [
             { "text": "RAG 증분 인덱싱#병합 전략",
               "mapId": "a1b2c3d4-…", "nodeId": "n-…" } ] }
```

- **Obsidian** 은 본문만 본다 → 제목으로 정상 동작
- **easymindmap** 은 메타의 `mapId` 로 정확히 해석 → 제목이 바뀌어도 안 깨진다
- 제목이 바뀌면 **미러가 그 맵을 가리키는 다른 파일들도 다시 쓴다**

### 5.3 역링크(backlink)

파일에는 쓰지 않는다. `map_links` 표(§8)에 있으니 화면이 질의하면 된다.
파일에 역링크 절을 자동 삽입하면 **A 를 고칠 때마다 B 파일이 바뀌어**
Git diff 가 폭발한다.

### 5.4 링크가 가리키는 맵이 없으면

지우지 않는다. 본문 표기를 그대로 두고 메타의 `mapId` 만 `null` 로 둔다.
Obsidian 은 "존재하지 않는 노트" 로 표시하는데, 그게 맞는 표현이다.

---

## 6. 언제 쓰는가

자동저장마다 쓰지 않는다. 손을 멈출 때마다 디스크에 수 MB 를 쓰게 된다.

```
저장 완료 → BullMQ 'vault-mirror' 큐에 map_id 적재 (같은 맵은 합친다)
          → 워커가 5초 뒤 처리
```

`export`·`ai-generate` 큐가 이미 있으니 그 옆에 붙인다.

**실패해도 사용자를 막지 않는다.** 정본은 DB 에 있다. 실패는 로그와 상태
표시로만 알리고 재시도한다.

---

## 7. 덮어쓰기 안전장치 — 가장 위험한 부분

단방향이라는 말은 **vault 폴더를 우리가 마음대로 덮어쓴다**는 뜻이다.
사용자가 Obsidian 으로 그 파일을 고쳤다면 **그 편집이 사라진다.**

세 겹으로 막는다.

**① 알린다.** vault 루트에 `README.md` 를 자동 생성한다.

```markdown
# 이 폴더는 easymindmap 이 자동으로 만듭니다

`.md` 파일을 직접 고치지 마세요. 다음 동기화 때 덮어쓰입니다.
편집은 easymindmap 에서 하세요.
```

**② 확인한다.** 파일을 쓸 때마다 그 내용의 해시를 `vault_files` 에 적어
둔다. 다음에 쓰기 전에 **디스크의 현재 해시와 비교**한다.

**③ 덮어쓰지 않는다.** 해시가 다르면(= 우리가 쓴 뒤 누군가 고쳤다면)

```
RAG 증분 인덱싱.md              ← 사용자가 고친 것. 그대로 둔다
RAG 증분 인덱싱.conflict.md     ← 우리가 쓰려던 것을 여기에
```

**사용자가 쓴 것을 우리가 지우지 않는다.** 27번 §4 ②(고아를 지우지 않고
뿌리로 올린다)와 같은 원칙이다.

> `.easymindmap-vault` 마커 파일이 없는 디렉터리에는 **아무것도 쓰지
> 않는다.** 사용자가 볼륨 경로를 잘못 지정했을 때 남의 폴더를 덮어쓰는
> 사고를 막는다.

---

## 8. DB 영향

```sql
-- 파일 하나의 현재 상태
CREATE TABLE IF NOT EXISTS public.vault_files (
    map_id        UUID PRIMARY KEY REFERENCES public.maps(id) ON DELETE CASCADE,
    rel_path      TEXT NOT NULL,     -- '연구/RAG 증분 인덱싱.md' (NFC)
    content_hash  CHAR(64) NOT NULL, -- 우리가 마지막에 쓴 내용의 sha256
    written_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 맵 사이의 링크 (역링크 질의용)
CREATE TABLE IF NOT EXISTS public.map_links (
    src_map_id   UUID NOT NULL REFERENCES public.maps(id) ON DELETE CASCADE,
    src_node_id  TEXT NOT NULL,
    dst_map_id   UUID REFERENCES public.maps(id) ON DELETE SET NULL,
    dst_node_id  TEXT,
    link_text    TEXT NOT NULL,      -- 원문 표기 (대상이 사라져도 남는다)
    PRIMARY KEY (src_map_id, src_node_id, link_text)
);

CREATE INDEX IF NOT EXISTS idx_map_links_dst ON public.map_links(dst_map_id);
```

`vault_files.rel_path` 가 있어야 §3.2 의 "옛 파일 지우기" 가 가능하다.
`dst_map_id` 가 `SET NULL` 인 이유는 §5.4 다.

---

## 9. 하지 않는 것 — 이번 범위 밖

- **파일 → DB 역방향 동기화.** 양방향 동기화는 CRDT 만큼 어려운 문제다.
  §7 의 `.conflict.md` 는 충돌을 **보여 주기만** 하고 합치지 않는다.
- **`.attachments/` 자동 정리** (§4.1)
- **클라우드 배포의 vault** (§2)
- **Obsidian 플러그인.** 폴더를 여는 것만으로 되므로 당장 필요 없다

---

## 10. 아직 정하지 않은 것 — 정직하게

- **리치 노트 HTML 속 `<img>` 의 data URL.** 28번 §3.5 셋째 줄이 이것을
  "아직 못 옮긴 곳" 으로 남겨 두었다(`serverImages.ts` 가 `image`·`images`
  만 훑기 때문). 그대로 두면 **vault 의 `.md` 에 base64 가 들어간다** —
  이 문서 §1 의 전제가 그 파일에서만 깨진다. 되돌리기·토큰 붙이기를 노트
  HTML 까지 넓히는 슬라이스가 vault 미러의 **선행 조건**이다.
- **협업맵의 vault 경로.** 지금 규칙은 소유자 기준이다. 여러 사람이 편집하는
  맵을 누구의 폴더 구조로 쓸 것인가.
- **`.md` 파일 하나가 아주 클 때.** 노드 1만 개짜리 맵은 마크다운이
  수 MB 가 된다. 쪼갤 것인가, 그대로 둘 것인가.
- **`vault-mirror` 큐의 지연 시간.** 5초는 추정이다. 큰 맵에서 재어 보고 정한다.
- **첨부 해시 길이.** 16자(64비트)면 충돌 확률은 무시할 만하지만, 백만 개를
  넘기면 다시 계산해야 한다.

---

## 11. 연관

| 무엇 | 문서 |
|---|---|
| 사진을 문서 밖으로 (vault 의 전제) | `collaboration/28-sync-prework-plan.md` §3 |
| 파일 하나로 온전히 | `content-permanence.md` §7.1 |
| EMM 포맷 | `emm-spec.md` · `markdown-export.md` |
| 셀프호스트 배포 | `../90-architecture/selfhost-docker.md` (예정) |
| 용어 | `../00-project-overview/glossary.md` |
