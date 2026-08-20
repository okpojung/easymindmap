# 22. 맵 파일 메타데이터 (Map File Metadata)

* 문서 버전: v1.1
* 작성일: 2026-07-16
* 최종 업데이트: 2026-08-20 — **메타 주석의 사진은 `files/` 상대 경로**
  (사진 바이트를 base64 로 담지 않는다, B16 ② D-5)
* 구현: `src/export/mapMeta.ts` · `src/export/exportMarkdown.ts` ·
  `src/export/exportHtml.ts` · `src/utils/importMapFile.ts`
* 관련: `20-export.md` (내보내기), `21-import.md` (가져오기)

---

## 1. 목적

내보낸 HTML/MD 파일이 **EasyMindMap 생성 파일임을 표시**하고, 본문
(뷰어/Markdown)만으로는 담을 수 없는 **원본 맵 전체**를 함께 실어
'새 맵 > MD/HTML 파일 불러오기'에서 **편집 가능한 맵으로 복원**할 수
있게 한다.

---

## 2. 메타데이터가 담는 정보 (MapFileMeta)

```typescript
interface MapFileMeta {
  format: 'easymindmap-map'; // 파일 형식 식별자 (필수 — 이 값이 없으면 무시)
  version: 1;                // 메타데이터 스키마 버전
  generator: 'EasyMindMap';  // 생성기 표시
  exportedAt: string;        // 내보낸 시각 (ISO 8601 UTC) — 언제 만들어졌는지
  title: string;             // 맵 제목 (디코드 없이 읽는 요약)
  nodeCount: number;         // 전체 노드 수 (루트 포함)
  editor?: {                 // 내보낼 당시의 에디터 상태 — 불러올 때 복원
    layoutType?: LayoutType; //   맵 전체 레이아웃 (방사형·양쪽, 시간배치 …)
    spacingX?: number;       //   가로 간격 배율
    spacingY?: number;       //   세로 간격 배율
  };
  map: SampleMap;            // ★ 원본 맵 전체 (아래 3절)
}
```

### 2.1 `map`(SampleMap)에 담기는 것 — 노드별 전체 속성

| 분류 | 필드 | 내용 |
|---|---|---|
| 구조 | `title` / `root` / `branches[].children…` | 맵 제목, 중심 주제, 전체 트리 |
| 텍스트 | `text` (여러 줄 그대로) · `textAlign` | 인라인 마커(`**` `==` 등) 포함 |
| 스타일 | `style` (도형·채움/테두리/글자색·테두리 굵기/스타일(이중선 포함)·굵게/기울임/취소선/하이라이트) | 스타일 탭 전체 |
| 크기 | `sizeW` / `sizeH` | 크기 조절 핸들로 정한 수동 크기 |
| 아이콘 | `icon` · `iconSide` | 노드 아이콘과 위치 |
| 태그 | `tag` / `tags[]` | 태그 칩 |
| 링크 | `links[] {url, label}` | 하이퍼링크 |
| 노트 | `notes[] {type, text, checked, lang, html}` | 문단(리치 HTML 포함)/코드/표/체크리스트 |
| 첨부 | `attachments[] {name, kind, url}` | 파일/오디오/비디오 |
| 사진 | `image {src, w, h}` · `images[] {src, afterLine…}` | 붙여넣은 사진. `src` 는 **본문과 같은 `files/img-N.png` 상대 경로**(ZIP 으로 함께 담긴다) 또는 외부 URL — `images[]` 는 인라인 사진 위치(afterLine) 보존. **사진 바이트를 base64 로 담지 않는다** (2026-08-20, 아래 §3.3) |
| 배치 | `side` (left/right) · `layoutType`(서브트리 오버라이드) · `edgeType` · `collapsed` | 좌/우 배치, 노드별 레이아웃, 접힘 상태 |
| 색 | `colorKey` | 브랜치 색 계열 |
| 맵 설정 | `settings.levelFonts` · `settings.levelLayouts` | 레벨별 폰트(크기·글꼴)·레벨별 레이아웃 |

즉 **에디터에서 만든 모든 것**이 담긴다 — 본문/뷰어에 안 보이는 것도
메타데이터에는 있다.

---

## 3. 파일별 저장 위치·형식

### 3.1 HTML

```html
<!-- EasyMindMap 생성 파일 · 제목: … · 내보낸 시각: … -->
<script type="application/json" id="easymindmap-map">{MapFileMeta JSON}</script>
```

- 본문 JSON의 `<`는 `<`로 이스케이프 — 노드 텍스트가 블록을 깨뜨릴
  수 없다.
- 뷰어 데이터(`window.__MINDMAP__`)와 별개 — 뷰어 데이터는 표시용으로
  일부 속성이 빠져 있어, 복원은 반드시 이 메타데이터를 쓴다.

### 3.2 MD

파일 끝에 HTML 주석 블록 — 일반 에디터/뷰어에서는 접혀 보이고,
머리말은 디코드 없이 읽을 수 있다:

```markdown
<!--
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
EasyMindMap 맵 파일 메타데이터
제목: 2026 제품 로드맵
노드 수: 32
내보낸 시각: 2026. 7. 16. 오후 3:24:00 (2026-07-16T06:24:00.000Z)
형식: easymindmap-map v1 · 생성기: EasyMindMap

이 주석은 EasyMindMap이 다시 불러올 때 스타일·노트·사진·태그·맵
설정을 복원하는 데 씁니다 — 지우면 구조·텍스트만 불러와집니다.
위 본문(견출·리스트)은 자유롭게 수정해도 됩니다.

easymindmap:v1:
eyJmb3JtYXQiOiJlYXN5bWluZG1hcC1tYXAiLCJ2ZXJzaW9uIjoxLCJnZW5lcmF0b3IiOiJFYXN5TWluZE1hcCIsImV4cG9y…
(100자마다 줄바꿈)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-->
```

- 데이터부는 **UTF-8 JSON의 base64** — 본문의 어떤 내용도 주석을 깨뜨릴
  수 없고, `easymindmap:v1:` 토큰만 찾으므로 줄바꿈 형식은 자유
  (v1 초기의 한 줄 형식 파일도 그대로 불러와진다).

---

### 3.3 ★ 메타 주석에 사진 바이트를 담지 않는다 (2026-08-20, B16 ② D-5)

예전에는 본문을 `![](files/img-1.png)` 로 내보내면서 **메타 주석에는 같은
사진을 base64 로 한 번 더** 넣었다. 사진 한 장짜리 맵의 `.md` 가 사진
바이트를 두 벌 들고 다닌 셈이다.

이 제품은 지식 저장소로 쓰이고 `.md` 는 vault 에 미러된다. 거기에 base64
가 박히면

* Obsidian 이 파일 하나 여는 데 몇 초 걸리고,
* Git 이 커밋마다 사진을 통째로 다시 저장하며,
* CRDT 업데이트 로그에는 **영원히** 남는다 (`27-sync-model.md` §3).

그래서 메타 주석의 사진 `src` 는 **본문이 가리키는 그 경로**를 쓴다
(`withPackagedImagePaths` — `serialize.ts`). `files/` 로 담지 못하는 사진
(외부 https URL 등)은 그대로 URL 로 남는다.

**따라오는 결과**: 사진이 있는 맵은 항상 ZIP 으로 나가고, **ZIP 에서 `.md`
만 꺼내 열면 사진이 복원되지 않는다** — `files/` 가 함께 있어야 한다.
첨부(≤2MB)의 인라인은 **그대로 둔다**(아래 §4) — 첨부는 개수가 적고,
단일 `.md` 하나로 복원되는 것이 이득이다.

> 릴리스 전이라 **버전 분기를 두지 않고 `v1` 을 재정의**했다. 지금까지
> 만들어진 `.md` 는 전부 테스트용이다.

## 4. 불러오기 동작 (importMapFile.ts)

| 파일 | 판별 | 동작 |
|---|---|---|
| EasyMindMap HTML | `#easymindmap-map` 스크립트 존재 (확장자 + 내용 감지) | 메타데이터의 원본 맵·레이아웃·간격 그대로 복원 |
| EasyMindMap MD | `easymindmap:v1:` 토큰 존재 | **본문 파싱 결과가 구조·텍스트의 기준** (에디터에서 고친 것 반영) + 텍스트(한 줄 기준)가 같은 노드는 메타데이터의 속성 복원 · 맵 설정은 항상 메타데이터 |
| 일반 MD | 토큰 없음 | 구조 파싱만 (`importMarkdown.ts`) |
| 일반 HTML | 메타데이터 없음 | 거부 (안내 메시지) |

### ZIP 불러오기 · 첨부 복원 (2026-07 추가)

- **ZIP을 직접 불러올 수 있다** — '새 맵 > MD/HTML/ZIP 파일 불러오기'.
  ZIP 안의 .html(우선)/.md를 파싱하고, `files/…`의 실제 파일을 첨부에
  **data URL로 재연결**한다 (`parseZipMapFile` / zip.ts `parseZip` —
  STORE는 물론 다른 도구로 재압축된 deflate도 DecompressionStream으로
  해제).
- **작은 첨부(≤2MB)는 내보낼 때 메타데이터에 data URL로 인라인**
  (`INLINE_ATTACHMENT_LIMIT`) — ZIP 없이 단일 .md/.html 파일만
  불러와도 첨부까지 복원된다. 큰 첨부는 ZIP의 files/로만 담기며
  ZIP 불러오기에서 재연결된다.
- 첨부 URL 우선순위(불러오기): 이미 살아있는 data:/http(s) URL은
  그대로 두고, blob:(원 세션 한정)·빈 URL만 files/에서 재연결한다.
- **사진(`files/img-N.png`)은 첨부와 다른 문으로 되잇는다** (2026-08-20,
  B16 ② D-6, `relinkImages`): 바이트를 `File` 로 감싸
  `attachmentUrlForFile(f, { preferServer: true })` 에 넘긴다 →
  **로그인이면 서버 첨부 저장소로 올라가고 문서에는 주소만** 남는다.
  게스트는 서버가 없으므로 지금처럼 data URL 이다.
  · 이걸 빼면 붙여넣기 쪽 앞문을 잠가도 **불러오기라는 뒷문으로 base64 가
    계속 문서에 들어온다** — 내보냈다 다시 여는 것만으로 원상복귀된다.
  · 사진이 여러 장이면 올리는 동안 진행률 한 줄을 띄운다(`uploadStore`).
  · **한 장이 실패하면 그 장만 data URL 로 남기고 넘어간다** —
    사진 한 장 때문에 불러오기 전체를 취소하지 않는다.

### 버전 정책

`version`이 올라가면 필드 추가는 하위 호환(무시)으로, 의미 변경은
`decodeMetaBase64`/`parseMetaJson`에서 버전 분기로 처리한다.
`format !== 'easymindmap-map'`이면 메타데이터로 취급하지 않는다.
