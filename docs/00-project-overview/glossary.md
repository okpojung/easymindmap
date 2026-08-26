# 용어집 — 문서를 읽기 전에

> **이 문서가 있는 이유**: 설계 문서가 결정을 내릴 때 쓴 용어를, 그 결정을
> 읽는 사람이 모르면 **결정을 검토할 수 없다.** 특히 협업 동기화
> ([`27-sync-model.md`](../04-extensions/collaboration/27-sync-model.md))
> 는 CRDT 를 안다는 전제로 쓰여 있다.
>
> 사업계획서 요건이기도 하다 — 전문용어는 주석을, 약어는 풀네임을 병기해야 한다.
>
> 작성: 2026-08-20

---

## 1. 협업·동기화

### CRDT (Conflict-free Replicated Data Type, 충돌 없는 복제 데이터 타입)

여러 사람이 같은 데이터를 동시에 고쳐도 **어떤 순서로 합쳐지든 모두가 같은
결과에 도달하도록** 설계된 자료구조.

데이터를 "최종 값"이 아니라 **변경 조각들의 모음**으로 들고, 각 조각에
누가·언제 만들었는지를 붙인다.

```
노드 텍스트 "회의 준비"

A: 앞에 "긴급 " 삽입        B: 뒤에 " 완료" 삽입   (동시에)

LWW  → "회의 준비 완료"      A 가 친 글자가 경고 없이 사라진다
CRDT → "긴급 회의 준비 완료"  둘 다 남는다
```

**CRDT 가 보장하는 것은 "모두가 같은 결과"뿐이고, 그 결과가 사용자가 원한
것인지는 별개다.** 트리 순환·삭제된 부모 같은 의미 규칙은 우리가 지킨다
(`27-sync-model.md` §4).

### LWW (Last-Write-Wins, 마지막 쓰기 우선)

타임스탬프를 비교해 늦게 온 쪽이 이기는 충돌 해소 방식. 값 하나짜리
필드(색·접힘)에는 충분하지만 **텍스트와 트리 구조에서 진다.**
`25-map-collaboration.md` 의 원래 전제였고, `27-sync-model.md` §2 에서 버렸다.

### OT (Operational Transformation)

CRDT 이전에 쓰이던 충돌 해소 방식. 서버가 모든 히스토리를 들고 순서를
잡아야 한다. **쓰지 않기로 했다** (`27-sync-model.md` §11).

### Yjs

CRDT 를 구현한 자바스크립트 라이브러리. **CRDT 는 개념이고 Yjs 는 구현체다.**
경쟁자는 Automerge · Loro.

`Y.Map` · `Y.Text` · `Y.Array` 에 값을 넣으면 병합은 라이브러리가 한다.
개발자가 타임스탬프를 비교하지 않는다.

Automerge 대신 고른 이유는 성능이 아니라 **awareness 가 같은 라이브러리에
있다**는 점이다 (`27-sync-model.md` §2.2).

| 용어 | 뜻 |
|---|---|
| **Y.Doc** | CRDT 문서 하나. 우리는 **맵 하나 = Y.Doc 하나** |
| **update** | 변경 조각(바이너리). 이걸 WebSocket 으로 주고받는다 |
| **awareness** | 데이터가 아닌 **일시적 상태** — 접속자·커서·"○○ 편집 중". 저장되지 않고 연결이 끊기면 사라진다. Soft Lock 에 DB·Redis 가 필요 없는 이유 |
| **origin** | 그 변경을 누가 만들었는지. `UndoManager` 를 자기 origin 으로 한정해 **내가 한 것만 되돌린다** (§8) |
| **tombstone (묘비)** | 지운 조각을 실제로 지우지 않고 "삭제됨"으로 남긴 것. 늦게 도착한 옛 메시지가 지운 것을 되살리는 걸 막는다. **이미지 바이트를 CRDT 에 넣으면 안 되는 이유** (§3) |

### 물질화 (materialize)

편집 중의 `Y.Doc` 을 **기존 `map_documents.doc` JSON 스냅샷으로 변환해
저장**하는 것. CRDT 는 편집 중의 표현일 뿐이고 **정본은 그대로 `doc` 이다**
(§6). 실측 15ms / 1만 노드.

### compaction (로그 접기)

물질화한 시점 이전의 update 로그를 접어 정리하는 것. 접지 않으면 오래된
맵일수록 여는 데 오래 걸린다.

### Soft Lock

노드 단위 "○○ 편집 중" 표시. **막는 잠금이 아니다.** TTL 5초, awareness 로
흐른다.

### 편집 잠금 (`map_edit_locks`)

이것은 **진짜 막는 잠금**이다. 맵당 한 세션, TTL 60초. 단독맵(`kind='solo'`)
에서 다른 세션이 열면 읽기 전용이 된다. **협업맵(`kind='collab'`)에서는
비켜 준다** (§7, 완료).

---

## 2. 배포·오프라인
### PWA (Progressive Web App)

한 줄: 웹사이트에 설치·오프라인 기능을 붙여서 앱처럼 쓰게 만드는 웹 표준.

지금 easymindmap은 브라우저에서 mindmap.ai.kr을 열어야 쓸 수 있습니다. PWA를 적용하면 주소창 옆에 "설치" 버튼이 뜨고, 누르면 바탕화면에 아이콘이 생기며, 실행하면 주소창 없는 창으로 뜹니다. 사용자는 앱을 설치했다고 느끼지만 실체는 그대로 웹입니다.

구성 요소는 두 개뿐입니다.

① Web App Manifest — 앱 이름, 아이콘, 시작 URL, 창 모양을 적은 JSON 파일 하나. 이게 "설치" 버튼이 뜨는 조건입니다.

② Service Worker — 이게 핵심입니다. 브라우저와 네트워크 사이에 끼어드는 자바스크립트로 만든 중간 계층입니다.

[일반 웹]    브라우저 ──────────────▶ 서버      (끊기면 끝)

[PWA]        브라우저 ──▶ Service Worker ──▶ 서버
                              │
                              └─▶ 캐시 (끊기면 여기서 응답)

서버가 안 잡히면 Service Worker가 캐시에 저장해 둔 HTML·JS·CSS를 대신 내줍니다. 그래서 인터넷 없이도 앱 화면 자체는 뜹니다.

다만 중요한 한계가 있습니다. Service Worker는 "앱 껍데기"를 캐시할 뿐, 사용자의 맵 데이터를 자동으로 챙겨주지 않습니다. 맵 데이터는 별도로 브라우저 안의 저장소(IndexedDB)에 넣어야 하고, 그건 직접 만들어야 합니다. 지난번에 "PWA 씌워도 오프라인은 안 된다"고 말씀드린 게 이 부분입니다.

|PWA로 되는 것|안 되는 것|
|설치 아이콘, 전체화면 실행|	.emm 파일 더블클릭 연결|
|앱 화면 오프라인 로딩	|네이티브 메뉴바 / 트레이|
|푸시 알림	|로컬 파일 자유 접근|
|비용 거의 0, 배포·서명 불필요	|맥 App Store 등재|

### PWA (Progressive Web App)

웹앱에 **설치·오프라인** 기능을 붙이는 웹 표준. 두 부품뿐이다.

- **Web App Manifest** — 이름·아이콘·시작 URL 을 적은 JSON. "설치" 버튼이 뜨는 조건
- **Service Worker** — 브라우저와 네트워크 사이에 끼는 자바스크립트 계층.
  서버가 안 잡히면 캐시로 대신 응답한다

> **주의**: Service Worker 는 **앱 껍데기**를 캐시할 뿐, 사용자의 맵 데이터를
> 자동으로 챙기지 않는다. 오프라인 편집은 별도 로컬 저장(IndexedDB)이 필요하다.

### Electron / Tauri

웹앱을 Windows·macOS·Linux 실행 파일로 감싸는 도구. Electron 은 Chromium 을
같이 담고(120~180MB), Tauri 는 OS 웹뷰를 빌린다(8~15MB). PWA 와 달리
**`.emm` 파일 연결·네이티브 메뉴·코드 서명**이 가능하다.

### IndexedDB

브라우저 안의 데이터베이스. 로컬 우선(local-first) 저장의 자리.
PWA·Electron·Tauri 가 **같은 코드 경로**를 쓸 수 있다.

---

## 3. 이 프로젝트 고유어

### EMM (EasyMindMap Markdown)

본문 100% CommonMark/GFM + 파일 끝 메타데이터 주석 1줄.

```
<!-- easymindmap:v1:BASE64(JSON) -->
```

스펙은 [`emm-spec.md`](../04-extensions/emm-spec.md), 변환 규칙은
[`markdown-export.md`](../04-extensions/markdown-export.md).
레퍼런스 파서는 `packages/emm-parser` — **공개다.**

### open-core (오픈 코어)

코어는 공개하고 일부 기능만 유료로 두는 구조. 경계는
[`open-core-boundary.md`](../04-extensions/open-core-boundary.md).

- **이음매는 공개** — `apps/frontend/src/pro/contract.ts`, `apps/api/src/pro/`
- **알맹이는 비공개** — `okpojung/easymindmap-pro`
- 유료 모듈이 없는 배포에서는 `stub` 이 자리를 그린다
- `GET /v1/features` 가 **무엇이 켜졌고 왜 꺼졌는지**를 답한다

> 서버에 못 물었을 때 "꺼졌다"고 단정하지 않는다 — 단정하면 백엔드가 잠깐
> 죽은 것을 "유료 기능을 안 샀다"로 보여 주게 된다.

### 물질화 / 정본

`map_documents.doc` (JSONB) 이 **정본**이다. 협업맵이라고 저장 형식을 갈아
치우지 않는다 — 그러면 내보내기·버전 히스토리·문서함이 두 벌이 된다.

### ltree · `move_node_subtree`

PostgreSQL 의 계층 경로 타입. `root.n_a1b2c3d4.n_e5f6a7b8` 형태로 노드
경로를 들고, 서브트리 이동을 경로 치환 한 번으로 처리한다.
순환은 `new_base_path <@ old_path` 로 막는다.

### 트리 규칙 (`packages/emm-parser/src/tree-rules.ts`)

순환 금지·고아 판정의 **단일 원본**. 정규화 경로·협업 경로·화면이 같은
판정을 쓰게 하려고 순수 함수로 뺐다.

- `wouldCreateCycle(parentOf, nodeId, newParentId)` — 옮기면 순환이 생기는가
- `findOrphans(ids, parentOf, rootId)` — 뿌리에 닿지 못하는 노드.
  **지우지 말고 뿌리로 올리라**는 뜻이다

### 5-Store → 8-Store

에디터 상태 분리 구조. 코어 5개(document · editorUi · viewport · interaction ·
autosave) + 연동 3개(cloud · auth · aiSettings).
[`state-architecture.md`](../03-editor-core/state-architecture.md) 참조.

### 콘텐츠 영구 보존 (content permanence)

내보낸 파일 하나가 **서버 없이도 온전히 열려야 한다**는 약속.
사진을 서버 저장소로 옮기면서 내보내기가 깨지지 않게 하려고
`export/serverImages.ts` 를 **먼저** 깐 이유다.
[`content-permanence.md`](../04-extensions/content-permanence.md)

---

## 4. 함께 보면 좋은 것

| 궁금한 것 | 문서 |
|---|---|
| 협업에서 무엇으로 합치는가 | `04-extensions/collaboration/27-sync-model.md` |
| 그 전에 코어에서 뭘 끝내야 하나 | `04-extensions/collaboration/28-sync-prework-plan.md` |
| 무엇이 공개이고 무엇이 유료인가 | `04-extensions/open-core-boundary.md` |
| 상태를 왜 여러 스토어로 나눴나 | `03-editor-core/state-architecture.md` |
| EMM 이 정확히 무엇인가 | `04-extensions/emm-spec.md` |
