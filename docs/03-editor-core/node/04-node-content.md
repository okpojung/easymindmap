# 04. Node Content
## NODE_CONTENT

* 문서 버전: v3.0
* 작성일: 2026-04-06
* 수정 내용:

  * title 필드 제거 (content 단일 구조로 통합)
  * markdown 정책 반영
  * 수동 줄바꿈 지원 추가
  * 리스트 표현 지원 명확화
  * NODE_RENDERING 문서 참조 추가

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
* 줄바꿈 지원
* 리스트 지원
* code node 기본

#### 2단계

* syntax highlight
* note 확장

#### 3단계

* AI diff
* execution 연계

---
