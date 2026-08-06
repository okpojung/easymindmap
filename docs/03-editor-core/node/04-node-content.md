# 04. Node Content
## NODE_CONTENT

* 문서 버전: v3.2
* 작성일: 2026-04-06
* 최종 업데이트: 2026-08-04 — 실제 구현 기준 현행화: 저장은 문서 JSON(node.text/notes[]/links[]/attachments[]), node_type·code_language 폐기(코드=본문 펜스 패널 또는 코드 노트 블록), 편집 진입=더블클릭, 길이 제한 없음.
* 수정 내용:

  * v3.2 — 현행화 (2026-08-04)
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
  * 코드 콘텐츠 (본문 ``` 펜스 패널 / 코드 노트 블록 — 별도 노드 타입 없음)
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
| NC-01 | 콘텐츠 입력      | `node.text`(문서 JSON) 기반 입력 | 더블클릭 → 입력     |
| NC-02 | 코드 콘텐츠   | 본문 ``` 펜스 패널 또는 코드 노트 블록        | code UI     |
| NC-03 | note 필드     | 상세 설명 (`notes?: NoteBlock[]`)          | expand      |
| NC-04 | autosave    | 자동 저장          | debounce    |
| NC-05 | 생성 출처 추적   | AI/사용자 구분(메타)      | ai_jobs/revision 메타    |
| NC-06 | 줄바꿈 지원      | 수동/자동 줄바꿈      | Enter       |
| NC-07 | 리스트 지원      | markdown list(node 내부 유지)  | render      |
| NC-08 | 코드 언어 지정 | 구현됨 — 언어 목록은 `CODE_LANGUAGES` 하드코딩 | 언어 라벨 선택 |

---

### 4. 기능 정의 (What)

NODE_CONTENT는 노드의 “본문 데이터” 저장/해석 기준을 정의한다.

#### 4.1 저장 모델 (현행 — 문서 JSON)

노드 콘텐츠는 모두 **맵 전체 문서 JSON**(`PUT /maps/:id/document` → `map_documents.doc`)에 담겨 저장된다. 노드 타입의 단일 원본은 `packages/emm-parser/src/model.ts`의 `MindNode`다 (`node_type` 필드 없음).

- 기본 본문: `node.text`
- 확장 설명(note): `node.notes?: NoteBlock[]` — 4종 (`paragraph` / `code_block` / `table` / `checklist`. `warning`/`tip`은 v1.1 폐기 — 문단으로 하위호환)
- 링크: `node.links[]`
- 첨부파일/미디어: `node.attachments[]` (`kind` 필드로 구분)
- 사진: `node.image`(단일, 텍스트 아래) / `node.images[]`(인라인 사진 — afterLine 앵커)

> **[서버 연결 예정]** `nodes`/`node_notes`/`node_links`/`node_attachments`/`node_media` 정규화 테이블은 협업 단계 설계안이다. 현재는 노드 단위 API·정규화 컬럼 쓰기가 없다.

#### 4.2 본문 규칙

- `node.text`는 Markdown raw text로 저장한다.
- 렌더링 시 Markdown 파서가 뷰 텍스트/HTML로 해석한다.
- 리스트는 child node로 강제 변환하지 않고, 기본적으로 node 내부 Markdown list로 유지한다.
- 수동 줄바꿈은 raw text 그대로 저장한다.
- note는 노드의 `notes[]` 배열(NoteBlock)에 저장한다 — 문서 JSON 일부.

#### 4.3 node_type 규칙 (폐기)

- `node_type` 필드는 **폐기**되었다 — `MindNode`에 타입 필드가 없다.
- 코드·표 등은 별도 노드 타입이 아니라 **본문 내용**(``` 펜스, 파이프 표)이나 **노트 블록 종류**로 표현한다.

#### 4.4 코드 콘텐츠 정책 (현행)

- 노드 본문의 ``` 코드 펜스는 **코드 패널**로 렌더된다 — 언어 라벨·복사(⧉)·편집(✎) 팝업 제공.
- 노트의 코드는 `NoteBlock`(kind=`code_block`)으로 저장하며, 언어는 `NoteBlock.lang`에 기록한다.
- 별도 `code` 노드 타입·`nodes.code_language` 컬럼은 사용하지 않는다 (설계 초안 — 미채택).

#### 4.5 source 추적 정책

- AI/사용자 생성 구분은 노드 단일 컬럼보다 `ai_jobs` + revision/patch 메타로 추적한다.
- 노드 본체에 `source` 컬럼 강제를 기본 정책으로 두지 않는다.

---

### 5. 동작 방식 (How)

#### 5.1 사용자 동작

* 노드 **더블클릭** → 편집 진입·입력 (싱글 클릭은 선택, Enter는 형제 추가)
* Enter(편집 중) → 줄바꿈 (스마트 Enter)
* markdown 문법 입력
* 리스트 입력 가능
* 코드는 본문 ``` 펜스 또는 코드 노트 블록으로 입력 (별도 노드 타입 없음)

---

#### 5.2 시스템 처리

* 입력 내용을 `node.text`(문서 JSON)로 저장
* 노드 타입 필드는 없다 — 콘텐츠 유형은 본문 내용·노트 블록 종류로 표현
* markdown 파싱은 렌더링 단계에서 수행
* autosave debounce 적용

---

#### 5.3 표시 방식

* View Mode → markdown 렌더링
* Edit Mode → raw markdown 표시 + **라이브 미리보기 병행** (편집 textarea 뒤 동일 메트릭 미리보기 레이어 — 02-node-editing.md §18 참조)

※ 렌더링 상세 규칙은 `06-node-rendering.md` 참조

---

### 6. 규칙 (Rule)

---

#### 6.1 본문 규칙

```txt
node.text: markdown raw text (문서 JSON — MindNode)
노드 타입 필드 없음 — 코드/표는 본문 펜스·파이프 표 또는 노트 블록으로 표현
```

---

#### 6.2 콘텐츠 구조 규칙

* node 본문은 `node.text` 단일 원문으로 관리한다.
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

#### 6.5 코드 콘텐츠 규칙 (현행)

* 본문 ``` 코드 펜스 → 코드 패널 렌더 (언어 라벨·⧉ 복사·✎ 편집 팝업)
* 노트 코드 블록 → `NoteBlock` kind=`code_block`, 언어는 `NoteBlock.lang`
* 언어 목록은 `CODE_LANGUAGES` 하드코딩 (별도 code 노드 타입 없음)

---

#### 6.6 우선순위 규칙

* 사용자 수정 > AI 생성
* AI 자동 overwrite 금지

---

#### 6.7 길이 제한 (현행)

* 길이 제한을 강제하지 않는다 — content·note 모두 상한 없음.
* 예외: Markdown 불러오기 시 `NODE_A4_CHARS`(2500자) 초과 문단만 별도 규칙 적용 (07-markdown-format-policy.md 참조).

---

### 7. Markdown 정책 (요약)

* CommonMark 기반
* 일부 GFM 지원
* 색상/배경 → NODE_STYLE에서 처리
* HTML → 제한

※ 상세 정책은 `07-markdown-format-policy.md` 참조

---

### 8. 예외 / 경계 (Edge Case)

* `node.text` 비어있음 → 최소 노드 표시 (빈 값 편집 종료 시 직전 텍스트 유지)
* 공백만 입력 → 저장 제한 가능
* 매우 긴 텍스트 → 축약(collapse) 없음 — 최대 폭 내에서 줄바꿈하며 세로로 확장 (높이 상한 없음)
* 긴 URL → 줄바꿈 처리
* code 길이 과다 → 가로 스크롤 없음 — 코드 패널 폭만큼 노드 폭 확장

---

### 9. 권한 규칙

| 역할      | 권한    |
| ------- | ----- |
| creator | 전체    |
| editor  | 수정 가능 |
| viewer  | 읽기    |

---

### 10. DB 영향 (현행)

* 저장은 **맵 전체 문서 JSON 스냅샷**: `map_documents.doc` (노드의 text/notes/links/attachments/images 전부 포함)
* [서버 연결 예정] `nodes.text` / `node_notes` / `node_links` / `node_attachments` / `node_media` 정규화 테이블은 협업 단계 설계안

---

### 11. API 영향 (현행)

* `PUT /maps/:id/document` — 맵 전체 문서 스냅샷 저장 (본문·노트·링크·첨부 메타 모두 이 경로)
* `GET /maps/:id/document` — 문서 조회
* 첨부 **실파일**은 attachments API(스토리지)로 업로드/다운로드
* [서버 연결 예정] `PATCH /nodes/{id}` 등 노드 단위 API는 협업 단계 설계안

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
* 코드 콘텐츠 기본 (본문 펜스 패널 / 코드 노트 블록)
* **note 확장** (structured note: paragraph / code_block / table / checklist — v1.1에서 warning·tip 폐기, table 추가; code_block은 언어 라벨(lang) 표기)
* **노드 링크** (URL 첨부 — 메타는 문서 JSON `node.links[]`에 저장)
* **노드 첨부파일** (메타는 문서 JSON `node.attachments[]`(kind), **실파일**은 attachments API/스토리지에 저장)

#### 2단계

* syntax highlight

#### 3단계

* AI diff
* execution 연계

---

### 14.5 링크/첨부 선택 팝업 · 첨부 열기 정책 (2026-07-31 구현)

* **선택 팝업(ChooserPopover)**: 링크(🔗)/첨부(📎)/미디어(▶) 아이콘이
  2개 이상의 항목을 담고 있으면 **노드 오른쪽**에 목록이 뜬다 (노트
  아래를 가리던 위치에서 이동). **호버 항목 강조** — 배경(primarySoft)
  + 왼쪽 바 + 굵게 + ↗, 풀 URL은 커스텀 툴팁.
* **첨부 열기(openAttachment.ts)**:
  * PDF·사진·텍스트·오디오·비디오 → **새 탭에서 바로 열기**. data URL은
    Chrome이 탭 이동을 막고 blob URL은 MIME이 비면 다운로드돼 버리므로,
    **확장자 기반 MIME 보정 Blob URL**로 연다 (blob은 클릭 제스처 안에서
    빈 창을 먼저 열어 팝업 차단 회피).
  * 오피스(docx/xlsx/pptx 등 브라우저 렌더 불가) → **즉시 다운로드**.
    웹앱은 로컬 앱을 직접 실행할 수 없다 — 브라우저 다운로드의 "항상
    열기"가 차선책. 서버 저장 연결 후 Office 뷰어(공유 URL 필요) 연동
    검토. (e2e69)

### 14.6 표 복사(⧉) · HTML 표 붙여넣기 (2026-07-31 구현)

* **표 원문 위치 렌더**: 노드의 파이프 표는 코드 패널과 같은 앵커링
  규칙으로 **원문 줄 위치**에 그려진다 — 표 앞 텍스트는 위, 표 뒤
  텍스트(※ 첨부 안내 등)는 아래 (`mdTableAt` — sizeNodeForText·
  NodeRenderer·뷰어 `tAt` 동일 규칙, 코드와 함께 있는 노드는 기존처럼
  텍스트 뒤). 표 뒤 텍스트가 표 위로 올라가던 문제의 수정 (e2e74).
* **복사 버튼 통일 (2026-07-31 사용자 결정)**: 코드·표·노트 문단의
  복사 버튼은 전부 **⧉ 아이콘만** + 호버 툴팁 안내 (클릭 시 '복사됨
  ✓'). 노트 문단에도 ⧉ 추가 (마커 제거 텍스트 복사).
* **⧉ 위치 = 표 바깥 오른쪽 위 스트립 (2026-07-31)**: 표 안(머리글
  셀)에 겹쳐 그리면 마지막 열 텍스트를 가리므로, 표 위 전용 줄
  (`MD_TABLE_COPY_STRIP`=13px — mdTable.ts 상수, 사이징·렌더·뷰어
  공용)에 오른쪽 정렬로 놓는다. HTML 표(아웃라인·칸반)는 래퍼
  paddingTop 15px, 노트 표 팝업은 paddingTop 20px(뷰어 18px)로 같은
  스트립을 예약. **노트 문단** ⧉는 스트립 대신 본문 paddingRight
  30px 예약 — 첫 줄 글자가 버튼 밑으로 흐르지 않는다 (e2e77).

* **표 복사**: 노드 SVG 표·아웃라인/칸반(NodeRichText) 표·노트 표
  팝업·**뷰어**(노드 표·노트 표)의 ⧉ — `copyTable`(utils/copyTable.ts)이
  클립보드에 **text/html(`<table>`) + text/plain(TSV) 두 형식을 동시**
  기록 (ClipboardItem, 미지원 시 TSV 텍스트 폴백). HTML 표에는 셀별
  **인라인 테두리/패딩 스타일** 포함 — 웹 에디터가 style 블록은 버려도
  인라인 속성은 유지하므로 붙여넣은 표에 테두리가 보인다. 웹 에디터/워드엔
  표로, 엑셀/시트엔 셀 단위로 붙는다. 셀의 인라인 마커는 제거해 복사.
* **HTML 표 붙여넣기**: `extractArticleContent`(articleContent.ts)가
  `<table>`을 만나면 **파이프 MD 줄로 변환**(htmlTableToMdLines — 셀
  `|`는 `\|` 이스케이프, 중첩 표는 바깥만, 유효 2행 미만이면 기존 행별
  텍스트 폴백). 선택 노드 Ctrl+V·편집 중 붙여넣기(사진 없는 표 HTML은
  전용 분기) 모두 적용 — 노드 내부 저장이 파이프 MD이므로 표 격자
  렌더와 **MD 내보내기 표 형식이 자동으로 성립**한다 (e2e73).

#### 14.6-1 **엑셀 표는 "그림"으로 들어가고 있었다** (2026-08-06 보고·수정)

> *"엑셀 표를 붙여 넣으면 텍스트도 보이고 표도 보인다. 텍스트를 지우면
> 표만 남는데, 표를 더블클릭하면 아무 내용도 없고 지울 수도 없다."*

두 번 조사해도 재현하지 못하다가, 사용자가 보내 준 **MD 내보내기 파일**
에서 원인이 드러났다.

```md
##### 거래일시	적요 2026.01.06 11:36:10	일괄BZ …   ← 탭 구분 plain text
![거래일시	적요 2026.01.06 1](files/img-1.png)        ← 표를 찍은 **사진**
```

**표가 아니라 사진이었다.** 사진은 노드 텍스트가 아니라 `image` 필드라
편집창에 나오지 않는다 — 그래서 "내용이 없고 지울 수도 없는" 것으로
보였다.

##### 왜 그렇게 됐나 — 클립보드에 뭐가 담기느냐의 차이

| 복사 원본 | 클립보드 | 결과 |
| --- | --- | --- |
| **그룹웨어**(웹 페이지) | `text/html`(표) + `text/plain` | HTML 을 읽어 **MD 표** ✅ |
| **엑셀** | `text/html`(표) + `text/plain`(탭 구분) + **이미지 파일(표의 비트맵)** | ❌ |

Canvas 붙여넣기가 이렇게 돼 있었다.

```ts
const hasImgFile = files.some(f => f.type.startsWith('image/'));
const rawHtml = hasImgFile ? '' : dt.getData('text/html');  // ← 그림이 있으면 HTML 을 통째로 버린다
```

스프레드시트는 표를 복사할 때 **표의 비트맵도 함께** 넣는다. 그림이
있다는 이유만으로 HTML 을 버리니, 편집할 수 있는 표 대신 **탭 구분
텍스트 + 표 그림**이 붙었다.

##### 규칙 — **표가 있으면 그림보다 표를 우선한다**

```ts
const htmlHasTable = /<table[\s>]/i.test(rawHtmlAll);
const rawHtml = (hasImgFile && !htmlHasTable) ? '' : rawHtmlAll;
```

표로 변환됐으면 클립보드의 비트맵 사본은 **붙이지 않는다**(같은 내용이
두 벌이 된다). 진짜 스크린샷 붙여넣기(HTML 에 표가 없는 경우)는 예전
그대로 노드 사진으로 들어간다.

검증: e2e116 [1] — 표 HTML + 비트맵을 함께 담아 붙여넣고, 노드 텍스트가
파이프 표가 되고 `image`/`images` 가 비어 있음을 확인한다.

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
- 편집 UX: 붙여넣으면 텍스트영역 아래에 미리보기(사진+서식)만 깔끔하게
  표시한다 — "서식·이미지 포함" 배지·안내 문구·"서식 제거" 버튼은
  사용자 피드백(2026-07)으로 제거했다. 텍스트영역을 직접 수정하면
  html은 자연히 버려지고 일반 텍스트로 돌아간다.
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

> **콘텐츠 영구 보존(차별점)**: 붙여넣은 글·사진은 맵 파일에 내장되어
> 원본 기사 삭제·오프라인에도 보존된다 — 제품 차별점·홍보 문구·서버
> 저장소 계획은 `docs/04-extensions/content-permanence.md` 참조.

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
- **사진 다운로드 내장** (`utils/embedImage.ts` — 2026-07 사용자
  피드백 "URL 참조는 곤란"): 웹에서 붙여넣은 사진은 붙여넣는 시점에
  **원본을 다운로드해 data URL(base64)로 맵에 내장**한다 — 기사가
  삭제되거나 오프라인이어도 사진이 보존된다. 노드 인라인 사진·노드
  사진(clipboardImage)·노트 리치 html(embedRichHtmlImages) 세 경로
  모두 동일. 사진 1장 상한 2.5MB(`MAX_EMBED_BYTES`) 초과분과
  브라우저 보안(CORS)이 다운로드를 차단하는 사이트는 **원본 URL을
  유지하는 폴백**으로 동작한다(온라인 표시는 그대로).
  [서버 연결 예정] 서버가 사진을 내려받아 **첨부파일 디렉토리
  (attachments 스토리지)**에 저장하고 맵에는 경로만 저장하는 방식으로
  이관 — CORS 제약이 없어 내장 성공률 100%가 된다.
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
