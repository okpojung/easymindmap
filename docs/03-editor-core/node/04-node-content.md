# 04. Node Content
## NODE_CONTENT

* 문서 버전: v3.1
* 작성일: 2026-04-06
* 최종 업데이트: 2026-05-07
* 수정 내용:

  * v3.1 — 구현 우선순위 수정: note / 링크 / 첨부파일 MVP로 상향 (roadmap.md v1.6 동기화)
  * v3.0 — title 필드 제거 (content 단일 구조로 통합), markdown 정송 반영, 수동 줄바꾸 지원 추가, 리스트 표현 지원 명확화, NODE_RENDERING 문서 참조 추가

---

### 1. 기능 목적

* 노드의 **의미적 콘텐츠(텍스트, 코드, 설명)**를 저장하고 표현하는 핵심 기능
* markdown 기반 문서 표현과 code 기반 실행형 콘텐츠를 동시에 지원
* AI 생성 콘텐츠 및 향후 agent/MCP 확장을 위한 구조 제공

---

### 2. 기능 범위

* 포함:

  * markdown 기반 텍스트 입력 및 저장
  * code node (명령/스크립트 표현)
  * note(확장 설명) 지원
  * AI 생성 콘텐츠 저장
  * 수동 줄바꿈 및 리스트 표현 지원
  * autosave

* 제외:

  * 스타일 (→ NODE_STYLE)
  * 위치 (→ LAYOUT)
  * 렌더링 방식 (→ NODE_RENDERING)

---

### 3. 세부 기능 목록

| 기능ID  | 기능명         | 설명             | 주요 동작       |
| ----- | ----------- | -------------- | ----------- |
| NC-01 | 콘텐츠 입력      | `nodes.text` 기반 입력 | 클릭 → 입력     |
| NC-02 | code node   | 실행형 콘텐츠        | code UI     |
| NC-03 | note 필드     | 상세 설명          | expand      |
| NC-04 | autosave    | 자동 저장          | debounce    |
| NC-05 | 생성 출처 추적   | AI/사용자 구분(메타)      | ai_jobs/revision 메타    |
| NC-06 | 줄바꿈 지원      | 수동/자동 줄바꿈      | Enter       |
| NC-07 | 리스트 지원      | markdown list(node 내부 유지)  | render      |
| NC-08 | 코드 언어 확장 | V2 `code_language` 확장 검토 | schema 확장 |

---

### 4. 기능 정의 (What)

NODE_CONTENT는 노드의 “본문 데이터” 저장/해석 기준을 정의한다.

#### 4.1 저장 모델 (schema.sql 기준)

- 기본 본문: `nodes.text`
- 본문 유형: `nodes.node_type`
- 확장 설명(note): `node_notes.content` (1:1)
- 링크: `node_links`
- 첨부파일: `node_attachments`
- 오디오/비디오: `node_media`

#### 4.2 본문 규칙

- `nodes.text`는 Markdown raw text로 저장한다.
- 렌더링 시 Markdown 파서가 뷰 텍스트/HTML로 해석한다.
- 리스트는 child node로 강제 변환하지 않고, 기본적으로 node 내부 Markdown list로 유지한다.
- 수동 줄바꿈은 raw text 그대로 저장한다.
- note는 `nodes` 컬럼에 넣지 않고 `node_notes` 테이블에 분리 저장한다.

#### 4.3 node_type 규칙

- 기본값: `text` (`schema.sql` 기준)
- 현재 확정 타입: `text`, `data-live`
- 문서 확장 타입: `code` (MVP 문서 허용)
- `image-card` 등 추가 타입은 후속 버전에서 확장한다.

#### 4.4 code node 정책

- MVP에서 `node_type='code'`는 문서 설계상 허용한다.
- 물리 DB에 `code_language` 컬럼이 아직 없으면, 언어 정보는 `style_json`/metadata로 보류한다.
- V2에서는 `nodes.code_language VARCHAR(30)` 추가를 권장한다.

#### 4.5 source 추적 정책

- AI/사용자 생성 구분은 노드 단일 컬럼보다 `ai_jobs` + revision/patch 메타로 추적한다.
- 노드 본체에 `source` 컬럼 강제를 기본 정책으로 두지 않는다.

---

### 5. 동작 방식 (How)

#### 5.1 사용자 동작

* 노드 클릭 → 입력
* Enter → 줄바꿈
* markdown 문법 입력
* 리스트 입력 가능
* code node 선택 시 코드 입력

---

#### 5.2 시스템 처리

* 입력 내용을 `nodes.text`로 저장
* 타입 정보는 `nodes.node_type`로 관리
* markdown 파싱은 렌더링 단계에서 수행
* autosave debounce 적용

---

#### 5.3 표시 방식

* View Mode → markdown 렌더링
* Edit Mode → raw markdown 표시

※ 렌더링 상세 규칙은 `06-node-rendering.md` 참조

---

### 6. 규칙 (Rule)

---

#### 6.1 본문/타입 규칙

```txt
nodes.text: markdown raw text
nodes.node_type: 'text' | 'data-live' (현재 DB 기준)
문서 확장: 'code' (MVP 문서 허용)
```

---

#### 6.2 콘텐츠 구조 규칙

* node 본문은 `nodes.text` 단일 원문으로 관리한다.
* title 별도 컬럼은 사용하지 않는다.
* heading/첫 줄 강조는 저장 구조가 아니라 렌더링 표현 규칙이다.

---

#### 6.3 줄바꿈 규칙

* 사용자는 Enter를 통해 수동 줄바꿈을 입력할 수 있다
* 자동 줄바꿈과 수동 줄바꿈은 함께 적용된다
* 수동 줄바꿈은 반드시 유지된다

예:

```txt
서울시장애인직업재활시설
협회
```

---

#### 6.4 리스트 규칙

* markdown 리스트를 지원한다
* 리스트는 node 내부 표현이며 child node와는 별개이다

예:

```md
- 장애인보호작업장
- 주간재활시설
- 노인복지사업
```

---

#### 6.5 code node 규칙

* 실행형 콘텐츠는 code 타입 사용
* language 지정 권장
* markdown 내부 code block과 구분

---

#### 6.6 우선순위 규칙

* 사용자 수정 > AI 생성
* AI 자동 overwrite 금지

---

#### 6.7 길이 제한

* title 없음
* content: 10,000자
* note: 50,000자

---

### 7. Markdown 정책 (요약)

* CommonMark 기반
* 일부 GFM 지원
* 색상/배경 → NODE_STYLE에서 처리
* HTML → 제한

※ 상세 정책은 `07-markdown-format-policy.md` 참조

---

### 8. 예외 / 경계 (Edge Case)

* `nodes.text` 비어있음 → 최소 노드 표시
* 공백만 입력 → 저장 제한 가능
* 매우 긴 텍스트 → 렌더링에서 collapse 처리
* 긴 URL → 줄바꿈 처리
* code 길이 과다 → scroll 또는 접힘

---

### 9. 권한 규칙

| 역할      | 권한    |
| ------- | ----- |
| creator | 전체    |
| editor  | 수정 가능 |
| viewer  | 읽기    |

---

### 10. DB 영향

* `nodes.text`
* `nodes.node_type`
* `node_notes.content`
* `node_links`, `node_attachments`, `node_media`

---

### 11. API 영향

* `PATCH /nodes/{id}` (본문/타입 갱신)
* `PATCH /nodes/{id}/note` (note 분리 저장)
* `GET /nodes/{id}` / `GET /maps/{mapId}/document`

---

### 12. 연관 기능

* NODE_STYLE
* NODE_RENDERING (`06-node-rendering.md`)
* SAVE
* VERSION_HISTORY
* AI_WORKFLOW
* EXPORT

---

### 13. 예시 시나리오

#### 시나리오 1

간단 텍스트 입력 → 한 줄 노드

#### 시나리오 2

markdown 리스트 입력 → 내부 리스트 렌더링

#### 시나리오 3

Enter로 줄바꿈 → 2줄 표시

#### 시나리오 4

AI 생성 → `ai_jobs`/revision 메타와 연계 저장

---

### 14. 구현 우선순위

#### MVP

* markdown 입력
* 줄바꾸 지원
* 리스트 지원
* code node 기본
* **note 확장** (structured note: paragraph / code_block / table / checklist — v1.1에서 warning·tip 폐기, table 추가; code_block은 언어 라벨(lang) 표기)
* **노드 링크** (URL 첨부, `node_links` 테이블)
* **노드 첨부파일** (파일 첨부, Supabase Storage, `node_attachments` 테이블)

#### 2단계

* syntax highlight

#### 3단계

* AI diff
* execution 연계

---

### 15. 노트 문단 리치 붙여넣기 (MVS 구현 — 2026-07)

웹 기사 등에서 복사한 내용(클립보드 `text/html`)을 **문단(paragraph) 노트
블록에 사진+서식째 붙여넣기**할 수 있다.

- 저장 모델: `NoteBlock.html`(선택 필드)에 정리된 HTML 저장, `NoteBlock.text`
  에는 같은 내용의 일반 텍스트를 함께 저장 (검색·하위호환용).
- 정리 규칙(`sanitizeRichHtml`, 화이트리스트 방식):
  - 허용 태그: p/div/span/br/b/strong/i/em/u/s/mark/a/img/figure/ul/ol/li/
    h1~h6/blockquote/pre/code/table 계열 — 그 외 태그는 벗기고 내용만 유지
  - 통째 제거: script/style/iframe/object/embed/form/입력류/미디어류
  - 속성: `style`/`class`/`on*` 전부 제거. `a[href]`는 http(s)만
    (`target=_blank rel=noopener`), `img[src]`는 http(s)·`data:image` base64만
    (`loading=lazy referrerpolicy=no-referrer`)
- 편집 UX: 붙여넣으면 텍스트영역 아래에 "서식·이미지 포함" 배지 + 미리보기
  표시. 텍스트영역을 직접 수정하면 html은 버리고 일반 텍스트로 돌아간다.
  "서식 제거" 버튼으로 수동 제거 가능.
- 표시: 에디터 노트 뷰어 팝업(NoteViewerPopover)과 HTML 내보내기 뷰어의
  상세 패널 모두 리치 HTML을 렌더링 (`img { max-width:100% }`).
- [서버 연결 예정] `node_notes.html_json`(또는 blocks JSON의 html 필드)로
  저장. 서버에서도 저장 전 동일 정책으로 재-sanitize 한다.

### 16. 노드 본문 Markdown 표 렌더링 (MVS 구현 — 2026-07)

노드 **본문 텍스트**에 Markdown 표가 들어 있으면 파이프 원문 대신 실제
표로 그린다 (markmap 스타일 — 향후 Markdown 파일 가져오기 대비).

- 감지: 파이프(`|`) 행 바로 다음 줄이 구분선 행(각 셀 `:?--:?`)이면 표.
  노드당 첫 번째 표 하나만 표로 그리고 나머지 텍스트는 그대로 표시.
- 측정·그리기 일치: `mdTable.ts`의 `layoutMdTable()`을 `sizeNodeForText()`
  (노드 크기 계산)와 `NodeRenderer`(그리기)가 공유 — 셀 글자 = 본문−2pt
  (최소 10), 행 높이 = 셀 글자+10, 열 폭 = 최장 셀 폭+12 (최소 26).
  표 폭이 노드 최대 폭(maxW)보다 크면 노드가 표 폭만큼 늘어난다.
- 표 스타일: 첫 행 = 헤더(굵게 + 연한 배경), 격자선은 노드 테두리색.
- 구분선 없는 파이프 텍스트(예: `항목 | 값` 한 줄)는 표로 취급하지 않는다.
- HTML 내보내기 뷰어도 동일 규칙으로 표를 그린다 (에디터 좌표 모드).

#### 16.1 표 감지 규칙 완화 (2026-07 후속)

MD 구분선 행(`|---|`)은 **선택 사항**이다. 노트 표 블록과 같은 단순 파이프
문법도 지원한다: **파이프 행이 2줄 이상 연속**이고 첫 행(헤더)이 2칸
이상이면 표로 그린다 (줄=행, `|`=열, 첫 행=헤더). 구분선 행이 있으면
건너뛴다. 파이프가 든 한 줄짜리 텍스트는 표로 취급하지 않는다.

### 17. UI 조정 가이드 — 노트 입력창 행 수 (2026-07)

노트 블록 입력창(문단/코드/표)의 높이는 **행 수 상수 하나로 조절**한다.

- 파일: `apps/frontend/src/editor/inspector-panels/NoteTagTab.tsx`
- 위치: 파일 상단의 `NOTE_INPUT_ROWS` 상수

```ts
const NOTE_INPUT_ROWS: Record<string, number> = {
  paragraph: 15,   // 문단
  code_block: 15,  // 코드
  table: 15,       // 표
};
```

행 길이를 바꾸고 싶으면 위 숫자만 수정하면 된다 (체크리스트는 한 줄
input이라 해당 없음). 2026-07에 5/9/6행 → 모두 15행으로 통일.
[서버 연결 예정] 사용자별 선호 행 수는 users.ui_preferences_json으로
이관 검토.


---

## MVS 구현 — 리치 붙여넣기 사진 위치 보존 (2026-07)

- **증상**: 뉴스 기사 등을 복사해 노트 문단에 붙여넣으면 사진이 원문
  위치(문단 사이)가 아니라 다른 곳(주로 맨 아래)에 나타났다.
- **원인**: 뉴스 사이트는 이미지 지연 로딩(lazy-load)을 써서, 복사된
  HTML의 본문 위치 `<img>`는 1×1 투명 GIF 자리표시자(src)이고 실제
  주소는 `data-src` 등에 있다. sanitize가 자리표시자를 그대로
  살리거나 버려 그 위치의 사진이 사라지고, 실제 주소를 가진 다른
  위치의 이미지만 남아 순서가 달라 보였다.
- **수정** (`sanitizeRichHtml.resolveLazyImgSrc`): src가 없거나 극소
  data:gif 자리표시자면 `data-src`/`data-lazy-src`/`data-original`/
  `data-lazy`/`data-url` → `srcset`(첫 항목) 순으로 실제 주소를 찾아
  **원래 위치에 복원**한다. 노드 사진 붙여넣기(clipboardImage)의
  text/html 경로도 같은 폴백으로 자리표시자를 건너뛰고 첫 실제
  이미지를 쓴다.
- 검증: 붙여넣기 이벤트 시뮬레이션 E2E(e2e38) — 문단1 → (자리표시자
  이미지) → 문단2 구조가 문단1 → 실제 이미지 → 문단2로 위치·순서
  보존됨을 편집 미리보기·노트 팝업 양쪽에서 확인.

### 2차 수정 — 실제 기사에서도 여전히 "사진이 마지막" (2026-07)

위 수정 후에도 실제 네이버 기사(`span.end_photo_org` >
`div.nv-image-lazyload-wrapper` > `img._LAZY_LOADING`) 복사에서 사진이
마지막에 표시된다는 재현이 있었다. 남은 원인은 두 가지였다:

1. **노드 텍스트 편집창(더블클릭)에 기사를 붙여넣는 경로**:
   `extractClipboardImage`가 기사 속 첫 이미지를 노드 사진
   (`node.image` — 항상 **텍스트 아래** 표시)으로 빼낸다. 즉 노드에서는
   사진이 텍스트 아래(마지막)에 표시된다.
   → 한때 "이미지+본문이면 문단 노트에 원위치째 보관"으로 바꿨으나,
   **사용자 피드백(2026-07)으로 원래대로 되돌림**: 편집 중 붙여넣기는
   텍스트 = 입력창, 사진 = 노드 사진. 노트는 만들지 않는다.
   노드 안 사진은 텍스트 아래 1장이 사양이다.
2. **숨은 중복 이미지**: lazy-load 구현에 따라 같은 주소의 이미지가
   숨김 상태로 한 번 더 복사되어(로드된 본 이미지 + 숨은 자리표시자)
   뒤쪽에 사진이 또 나타난 것처럼 보였다.
   → 수정(유지): `sanitizeRichHtml`이 한 번의 붙여넣기 안에서 **같은
   주소의 이미지는 첫 위치만** 살린다 (기사에서 같은 사진을 두 번 싣는
   일은 없어 안전).

정리(3차 확장 — 아래 §노드 인라인 사진): 이제 **노드에 붙여넣는 경로도
사진이 원문 위치**에 들어간다. 선택+붙여넣기(ThinkWise식 하위 노드
생성)와 편집 중 붙여넣기 모두 기사(text/html)의 사진을 텍스트 중간
원래 자리(`images[]`, afterLine 앵커)에 배치한다. 노트 문단 블록 직접
붙여넣기는 종전대로 HTML 원문 순서 그대로다.

## MVS 구현 — 노드 인라인 사진 (텍스트 중간 원문 위치) (2026-07)

"노드에는 왜 사진이 항상 마지막인가"의 구조적 원인(노드 = 텍스트
문자열 + 사진 1장 슬롯)을 해소한 확장:

- **데이터**: `MindNode.images?: NodeInlineImage[]` —
  `{ src, w, h, afterLine }`. `afterLine` = 사진 앞에 오는 노드 텍스트
  **논리 줄(\n 기준)** 수 (0 = 맨 앞, 줄 수 이상 = 맨 뒤).
  `images`가 있으면 레거시 `image`(단일, 텍스트 아래)는 무시된다.
- **추출**(`utils/articleContent.ts` `extractArticleContent`): sanitize를
  통과한 기사 HTML을 한 번 걸으며 블록 요소·`<br>`로 줄을 끊고, 이미지를
  만나면 "그 시점까지의 줄 수"를 afterLine으로 기록 — 텍스트와 사진
  위치가 항상 일치한다 (text/plain과 줄을 맞추는 방식은 어긋나기 쉬움).
  크기는 `probeArticleImages`가 실측(실패 시 400×300 유지).
- **측정·렌더**: `sizeNodeForText`가 각 사진의 (노드 폭 축소 높이 +
  위아래 3px)만큼 박스를 키우고, `layoutInlineImages`가
  afterLine(논리 줄) → `_manualStarts`(래핑 줄 시작) 매핑으로 각 줄과
  사진 밴드의 세로 위치를 계산한다. NodeRenderer·HTML 뷰어(drawNode)가
  같은 규칙으로 그린다 (에디터·뷰어 파리티).
- **붙여넣기 경로**:
  - 선택+Ctrl+V(하위 노드 생성): 기사 텍스트 전체 = 노드 텍스트,
    사진들 = `images[]` 원문 위치.
  - 편집(더블클릭) 중: 기사 텍스트는 커서 위치에 삽입되고 사진은
    (커서 앞 줄 수만큼 이동한 afterLine으로) 대기 목록에 쌓였다가
    **저장(Enter) 시 반영**, Esc 취소 시 폐기.
- **제거**: 노드 선택 상태에서 각 사진 우상단 ✕ = 그 사진만 제거.
- **연동**: HTML 내보내기(뷰어 동일 배치·맵 메타데이터 포함), MD
  내보내기(제목 아래 순서대로 `![]()` — markdown-export.md §노드 인라인
  사진), 아웃라인(사진 목록 표시), 칸반(첫 사진 = 썸네일), 불러오기
  라운드트립(importMapFile).
- **알려진 한계**: afterLine은 줄 수 앵커라서 나중에 노드 텍스트의
  줄을 추가·삭제하면 사진 위치가 원문과 어긋날 수 있다 — ✕로 제거 후
  다시 붙여넣으면 된다. 노드 폭 계산은 텍스트 기준이라 사진은 항상
  노드 폭에 맞춰 축소된다.
- 검증: E2E e2e40 (원문 순서 좌표 검증 · 박스 내 배치 · ✕ 개별 제거 ·
  편집 저장/취소 · 뷰어 파리티) + e2e39 갱신.

- 검증: E2E(e2e39) — 네이버 기사 마크업 구조(요약 strong ·
  end_photo_org/lazyload-wrapper 래퍼 · 로드된 이미지+숨은 중복 ·
  1px gif 자리표시자+data-src · img_desc 캡션 · `<br><br>` 문단)를
  그대로 재현. 노트 문단 경로는 사진1 → 문단1 → 문단2 → 사진2 →
  문단3 순서 유지·중복 1장 정리·자리표시자 복원, 노드 경로는 텍스트
  전체 + 노드 사진 첨부를 확인.
  ※ 원 기사 URL은 컨테이너 네트워크 정책(외부 사이트 차단)으로 직접
  접근이 불가해, 알려진 네이버 뉴스 DOM 구조를 충실히 재현해 검증했다.
