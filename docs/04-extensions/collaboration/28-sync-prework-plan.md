# 28. 선행 작업 실행 계획 — 협업을 켜기 전에 코어에서 끝낼 것

> **이 문서가 정하는 것**: [`27-sync-model.md`](./27-sync-model.md) §10 이 "먼저"라고
> 적어 둔 공개 코어 작업 셋이 **지금 코드에서 어디까지 와 있는지**, 그리고
> **어떤 순서로 무엇을 고치는지**.
>
> **정하지 않는 것**: Y.Doc 매핑·게이트웨이·물질화. 그건 유료 모듈이고
> 설계는 `27-sync-model.md` 에 이미 있다.
>
> 작성: 2026-08-20 · 근거: `main` 브랜치 실제 코드 확인

---

## 0. 요약 — 문서와 코드가 두 군데 어긋나 있다

| §10 항목 | 그 문서의 기재 | **코드 확인 (2026-08-20)** |
|---|---|---|
| 1. `kind='collab'` 이면 편집 잠금 비켜 주기 | 완료 | ✅ 사실 — `maps.service.ts:47 isCollabMap()`, 호출 4곳 |
| 2. 이미지를 문서 밖으로 | "크다" | 🟡 **읽는 쪽 둘은 끝났다.** 쓰는 쪽만 남았다 |
| 3. 순환 판정 함수를 꺼내 쓸 수 있게 | 미착수 | 🟡 **함수는 있다. 쓰는 데가 없다** — 규칙이 **세 벌** |

**§10 의 순서(1→2→3)를 3→2 로 뒤집는다.** 근거는 §3.3.

---

## 1. 항목 1 — 편집 잠금 (완료 확인)

`isCollabMap()` 판정이 **저장·열기·하트비트·해제** 네 곳에 다 들어가 있다.

```
maps.service.ts:492   저장
maps.service.ts:855   열기 (협업맵에는 editLock 을 아예 주지 않는다)
maps.service.ts:980   하트비트
maps.service.ts:995   해제
```

`create-map.dto.ts` 의 `MAP_KINDS = ['solo','collab']` 로 값이 좁혀져 있고,
`pro.contract.ts:48` 이 `{ id: 'collab' }` 로 기능 자리를 잡고 있다.

> **더 손댈 것 없다.** 이 절은 회귀 확인용으로만 남긴다.

---

## 2. 항목 3 — 순환 판정: 지금 규칙이 **세 벌**이다

### 2.1 현황

`27-sync-model.md` §4 가 "규칙을 두 벌로 만들지 않는다"고 적었는데,
`tree-rules.ts` 를 만들면서 **오히려 한 벌이 늘었다.**

| | 위치 | 방식 | 호출부 |
|---|---|---|---|
| ① | `documentStore.ts:405 isSelfOrDescendant` | 중첩 `children` 재귀 | **925 · 962** — 실제로 도는 것 |
| ② | `move_node_subtree.sql` | ltree `new_base_path <@ old_path` | `NodeService.moveNodeSubtree()` |
| ③ | `tree-rules.ts wouldCreateCycle` | `parentOf` 사슬 | **없다** |

`findOrphans` 도 호출부가 없고, §4 ② 가 정한 **"부모 잃은 노드는 지우지
말고 뿌리로 올린다"** 는 코드 어디에도 없다.

> 함수를 만든 것으로 이 항목이 끝났다고 보면 안 된다. **쓰이지 않는 규칙은
> 규칙이 아니다.** 지금은 ③ 이 옳고 ① 이 도는 상태라, 협업 모듈이 ③ 을
> 부르기 시작하면 **화면과 협업이 서로 다른 판정을 하게 된다.**

### 2.2 단순 치환이 안 되는 이유 셋

**① 모델이 다르다.** `documentStore` 는 중첩 `children` 트리를 들고 있고
`wouldCreateCycle` 은 `parentOf` 콜백을 받는다. 어댑터가 필요하다.

**② 깊이 가드가 딸려 있다.** `documentStore.ts:962` 부근은 순환만 보는 것이
아니라 `MAX_DEPTH = 50` 도 함께 본다(970 · 988). 순환만 갈아끼우면
**깊이 제한이 조용히 빠진다** — 화면이 안 깨지므로 알아채기 어렵다.

**③ 비용.** `findParentId()` 는 부를 때마다 트리를 통째로 훑는다(O(n)).
그대로 `parentOf` 로 넘기면 이동 한 번이 O(n²) 가 된다. 1만 노드에서
드래그가 눈에 띄게 멈춘다.
→ **이동 직전에 `Map<id, parentId>` 인덱스를 한 번 만들어** 넘긴다.

### 2.3 할 일

```
A-1  documentStore 에 buildParentIndex(map): Map<string,string|null> 추가
A-2  moveNodeRelative(962) · 925 의 isSelfOrDescendant 를
     wouldCreateCycle(idx.get, nodeId, targetId) 로 교체
     — MAX_DEPTH 검사는 **그대로 둔다** (순환과 별개 규칙이다)
A-3  isSelfOrDescendant 를 지운다. 남겨 두면 다음 사람이 그걸 부른다
A-4  move_node_subtree.sql 의 ltree 판정은 **그대로 둔다**
     — DB 는 마지막 방벽이다. 앱이 틀려도 DB 가 막아야 한다.
       주석에 "판정 원본은 packages/emm-parser/src/tree-rules.ts" 를 적는다
A-5  packages/emm-parser 에 buildTreeFromFlat() 를 만든다
     평평한 { id, parentId, order } 목록 → 중첩 MindNode 트리.
     뿌리에 닿지 못하는 노드는 findOrphans 로 찾아 **뿌리로 올린다**(지우지 않는다).
     유료 물질화(§6)가 이 함수를 부른다 — 규칙을 두 벌로 만들지 않기 위함이다.

  ※ documentStore 는 중첩 children 모델이라 고아가 구조적으로 생기지 않는다.
     repairOrphans 를 거기 두지 않는다
```

> **A-5 가 왜 여기인가** (2026-08-20 정정): 처음에는 `documentStore` 에
> `repairOrphans` 를 두려 했다. 그런데 **거기는 중첩 `children` 모델이라
> 고아가 구조적으로 생기지 않는다** — 부모가 없는 노드를 표현할 방법 자체가
> 없다.
>
> 고아는 **평평한 것을 중첩으로 다시 짜는 그 지점**에서 생긴다. 협업 CRDT 는
> `{ id, parentId, order }` 로 평평하게 들고 있고(§3), 정본은 중첩 트리다(§6).
> A 가 부모를 지우고 B 가 그 밑에 자식을 더한 상태를 중첩으로 짜려 하면
> **그 자식이 갈 곳이 없다.**
>
> 물질화 구현은 유료 모듈이지만 **트리 모양 규칙은 공개 코어에 한 벌만
> 둔다**(§9). 그래서 이 함수가 그 경계다.

### 2.4 되돌려 깨뜨리기 (테스트가 잡아야 할 것)

- `wouldCreateCycle` 로 바꾸면서 **MAX_DEPTH 검사를 같이 지우면** 50단계
  넘는 이동이 통과한다 → 레이아웃이 화면 밖으로 나간다
- **인덱스를 이동 후에 만들면** 이미 옮긴 트리를 보고 판정한다 → 순환을 못 막는다
- `parentOf` 가 모르는 노드에 `null` 을 돌려주면(`undefined` 가 아니라)
  `wouldCreateCycle` 이 "뿌리에 닿았다"로 오판한다 → **둘을 구분해서 돌려준다**

---

## 3. 항목 2 — 이미지를 문서 밖으로: **읽는 쪽은 이미 끝났다**

### 3.1 현황

```
✅ 슬라이스 1 (2026-08-16)  export/serverImages.ts
   내보내기 직전에 서버 사진을 되받아 data URL 로 되돌린다
   → 내보낸 ZIP·HTML 이 서버 없이도 열린다 (content-permanence.md §7.1)

✅ 슬라이스 2 (2026-08-16)  utils/imageSrc.ts
   화면이 {API}/v1/attachments/<id> 를 그릴 수 있게 토큰 URL 을 붙인다
   → 토큰은 문서에 저장하지 않는다 (만료되면 사진이 전부 깨진다)

❌ 슬라이스 3            쓰는 쪽 — 아직 data URL 을 만든다
   utils/clipboardImage.ts  probeAndApply → { src: dataUrl }
   utils/embedImage.ts      fetchImageAsDataUrl → data URL
```

`serverImages.ts` 머리에 **"읽는 쪽을 쓰는 쪽보다 먼저 깐다"** 고 적혀 있다.
순서가 의도된 것이고, 지금이 슬라이스 3 차례다.

### 3.2 배관은 이미 있다 — 새로 깔 것이 없다

| 있는 것 | 위치 |
|---|---|
| 첨부 업로드 (진행률 포함) | `utils/attachmentFile.ts attachFileWithProgress()` |
| 큰 파일 조각 업로드 | `services/cloud/chunkUpload.ts uploadInChunks()` |
| 조각 경로 진입 기준 8MB | `attachmentFile.ts CHUNK_ROUTE_MIN` |
| 맵 내장 한도 10MB | `attachmentFile.ts EMBED_TOTAL_LIMIT` |
| 업로드 진행 표시 | `stores/uploadStore.ts` |
| 서버 첨부 API | `apps/api/src/attachments/` |

**남은 일은 배관 놓기가 아니라 기존 배관에 잇는 것이다.**

### 3.3 그래서 순서를 3 → 2 로 뒤집는다

| | 항목 3 | 항목 2 |
|---|---|---|
| 크기 | 반나절~하루 | 며칠 |
| 위험 | 낮다 (순수 함수 교체) | **높다 — 문서 데이터 형식이 바뀐다** |
| 협업 착수를 막는가 | **막는다** (유료 모듈이 이 함수를 부른다) | 막는다 |

둘 다 막지만 **3 이 짧다.** 짧고 막는 것을 먼저 치운다.

### 3.4 할 일

```
D-1  POST /v1/attachments/from-url — 서버가 원격 사진을 내려받는다
     (SSRF 방어 필수: 사설 대역 차단 · 리다이렉트 상한 · Content-Type 확인)
D-2  clipboardImage.probeAndApply → attachmentUrlForFile() 로
D-3  embedImage 호출부 → D-1 로
D-4  일괄 마이그레이션 코드를 만들지 않는다
     (DB 맵 데이터를 초기화하므로 옮길 옛 문서가 없다 — 2026-08-20 결정)
D-5  메타 주석에서 data URL 을 없앤다 (쓰는 쪽만)
D-6  ZIP 불러오기가 사진을 문서 안으로 되돌리지 않게 한다
```

### 3.5 base64 가 남는 곳 — 의도된 예외 (2026-08-20 결정)

"지식 저장소에 base64 를 두지 않는다"가 규칙이다. 다음 둘은 지식
저장소가 아니라 **배달 형식**과 **임시 상태**이므로 예외로 둔다.

| 곳 | 왜 예외인가 |
|---|---|
| `export/exportHtml.ts` | 단일 파일 HTML. 빼면 `.html` + `_files/` 폴더가 되어 "파일 하나로 온전히"가 깨진다 (content-permanence.md §7.1) |
| 게스트(비로그인) 경로 | 서버가 없다. 이 문서는 서버·vault·CRDT 어디에도 닿지 않고 브라우저 안에서만 산다 |

> **일관성을 이유로 이 둘을 고치지 마라.** 형식마다 관습이 다른 것은
> 불일치가 아니다. `.md` 가 외부 파일을 참조하는 것과 단일 HTML 이
> 인라인하는 것은 같은 층위의 관습이다.

### 3.6 되돌려 깨뜨리기

- D-6 을 빠뜨리면 D-2·D-3 으로 앞문을 잠가도 **ZIP 불러오기라는 뒷문으로
  base64 가 계속 들어온다**
- exportHtml 을 "일관성" 이라며 고치면 파일이 폴더가 된다.
  **회귀 테스트에 안 걸린다** — 파일은 정상 생성되고, 사진이 안 보이는 것은
  사람이 열어 봐야 안다
- 게스트 경로를 막으면 로그인 없이 사진을 못 붙인다 → 첫 사용 경험이 깨진다

---

## 4. 순서 정리

```
Step A  (0.5~1일)  순환 판정 한 벌로            → §2.3 A-1~A-4
Step B  (1일)      findOrphans 를 쓰는 수리 함수 → §2.3 A-5
Step C  (완료)     옛 문서 이관 — 하지 않는다    → §3.4 D-4 (2026-08-20 결정)
Step D  (2~3일)    이미지 쓰는 쪽 서버 경유      → §3.4 D-1~D-6

────── 여기까지가 공개 코어. 이 다음이 유료 모듈 ──────

        Y.Doc 매핑 → 게이트웨이 → 물질화 → awareness → Soft Lock 표시 → UI
```

**A·B 는 협업을 안 하기로 해도 버리는 일이 되지 않는다.** D 도 마찬가지다
(자동저장이 빨라지고 버전 히스토리가 같은 사진을 스냅샷마다 복사하지 않는다).
순서를 이렇게 잡은 이유가 그것이다.

---

## 5. 아직 정하지 않은 것 — 정직하게

- **게스트 문서의 사진.** 게스트는 서버가 없으므로 data URL 로 남는다
  (§3.5 의 의도된 예외). 나중에 로그인하면 그 문서의 사진을 옮길 것인가 —
  정하지 않았다.
- **`raisedToRoot` 를 사용자에게 어떻게 알리는가.** `buildTreeFromFlat` 은
  뿌리로 올린 id 를 돌려주지만, 그것을 **화면에 어떻게 보여 줄지**는 정하지
  않았다. 조용히 넘기면 사용자는 "왜 이 가지가 갑자기 최상위에 있지" 를
  알 수 없다. 알림·배지·저장 기록 중 무엇으로 할지 정해야 한다.
  (함수는 코어, **보여 주는 것은 유료 물질화 쪽**이다.)
