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
| NC-01 | 콘텐츠 입력      | markdown 기반 입력 | 클릭 → 입력     |
| NC-02 | code node   | 실행형 콘텐츠        | code UI     |
| NC-03 | note 필드     | 상세 설명          | expand      |
| NC-04 | autosave    | 자동 저장          | debounce    |
| NC-05 | source 추적   | AI/사용자 구분      | metadata    |
| NC-06 | 줄바꿈 지원      | 수동/자동 줄바꿈      | Enter       |
| NC-07 | 리스트 지원      | markdown list  | render      |
| NC-08 | language 지정 | code 언어        | bash/python |

---

### 4. 기능 정의 (What)

* node는 **단일 content 필드만 가진다**
* 별도의 title 필드는 존재하지 않는다
* node에 표시되는 모든 정보는 content 내부 markdown 또는 code로 표현된다

#### markdown node

```json
{
  "content": "## 에버그린복지재단\n- 산하시설\n- 운영법인",
  "content_type": "markdown",
  "source": "user"
}
```

#### code node

```json
{
  "content": "sudo apt install apache2 -y",
  "content_type": "code",
  "code_language": "bash",
  "source": "ai"
}
```

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

* 입력 내용을 content로 저장
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

#### 6.1 콘텐츠 타입 규칙

```txt
content_type:
  - markdown
  - code
```

---

#### 6.2 source 규칙

```txt
source:
  - user
  - ai
```

---

#### 6.3 콘텐츠 구조 규칙

* node는 content 하나만 가진다
* title은 별도 저장하지 않는다
* heading 또는 첫 줄은 렌더링 시 강조될 수 있다 (UI 표현)

---

#### 6.4 줄바꿈 규칙

* 사용자는 Enter를 통해 수동 줄바꿈을 입력할 수 있다
* 자동 줄바꿈과 수동 줄바꿈은 함께 적용된다
* 수동 줄바꿈은 반드시 유지된다

예:

```txt
서울시장애인직업재활시설
협회
```

---

#### 6.5 리스트 규칙

* markdown 리스트를 지원한다
* 리스트는 node 내부 표현이며 child node와는 별개이다

예:

```md
- 장애인보호작업장
- 주간재활시설
- 노인복지사업
```

---

#### 6.6 code node 규칙

* 실행형 콘텐츠는 code 타입 사용
* language 지정 권장
* markdown 내부 code block과 구분

---

#### 6.7 우선순위 규칙

* 사용자 수정 > AI 생성
* AI 자동 overwrite 금지

---

#### 6.8 길이 제한

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

* content 없음 → 최소 노드 표시
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

* nodes.content
* nodes.content_type
* nodes.source
* nodes.code_language
* nodes.note

---

### 11. API 영향

* PATCH /nodes/{id}/content
* GET /nodes/{id}

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

AI 생성 → source=ai 저장

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
