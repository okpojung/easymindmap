# 04. Node Content

## NODE_CONTENT

* 문서 버전: v2.0
* 작성일: 2026-04-06
* 수정 내용:

  * content_type 구조 정리 (ai 제거, markdown/code로 통합)
  * source 필드 분리 (user / ai)
  * markdown 정책 정의 추가
  * code node 실행 확장 고려 설계 반영

---

### 1. 기능 목적

* 노드의 **의미적 콘텐츠(텍스트, 코드, 설명)**를 저장하고 표현하는 핵심 기능
* markdown 기반 문서 표현과 code 기반 실행형 콘텐츠를 동시에 지원
* AI 생성 콘텐츠 및 향후 agent/MCP 확장을 위한 구조 제공

---

### 2. 기능 범위

* 포함:

  * markdown 기반 텍스트 입력 및 렌더링
  * code node (실행 가능한 명령/스크립트)
  * note(확장 설명) 지원
  * AI 생성 콘텐츠 저장
  * 콘텐츠 자동 저장 (autosave)

* 제외:

  * 스타일 (→ NODE_STYLE)
  * 위치 (→ LAYOUT)
  * 노드 생성/삭제 (→ NODE_EDITING)

---

### 3. 세부 기능 목록

| 기능ID  | 기능명          | 설명                 | 주요 동작         |
| ----- | ------------ | ------------------ | ------------- |
| NC-01 | 콘텐츠 입력       | markdown 기반 텍스트 입력 | 클릭 → 입력 → 저장  |
| NC-02 | markdown 렌더링 | 포맷 적용 표시           | view mode     |
| NC-03 | code node    | 실행형 코드 노드          | copy / 실행 확장  |
| NC-04 | note 필드      | 상세 설명              | 접기/펼치기        |
| NC-05 | autosave     | 자동 저장              | debounce      |
| NC-06 | source 추적    | AI/사용자 구분          | metadata 저장   |
| NC-07 | language 지정  | code 언어 지정         | bash/python 등 |

---

### 4. 기능 정의 (What)

* NODE_CONTENT는 노드의 **콘텐츠 데이터 구조**를 정의한다.

#### 기본 구조

```json
{
  "title": "Apache 설치",
  "content": "## 설치\n\n설치 명령은 아래와 같다.",
  "content_type": "markdown",
  "source": "user",
  "note": null
}
```

#### code node 구조

```json
{
  "title": "설치 명령어",
  "content": "sudo apt install apache2 -y",
  "content_type": "code",
  "source": "ai",
  "code_language": "bash",
  "execution_mode": "command"
}
```

---

### 5. 동작 방식 (How)

#### 5.1 사용자 동작

* 노드 클릭 → 편집 모드 진입
* markdown 입력 또는 수정
* code node 선택 시 코드 입력
* AI 생성 결과 자동 삽입 가능

#### 5.2 시스템 처리

* 입력 내용을 상태(state)에 저장
* markdown parser 적용
* content_type에 따라 renderer 분기
* debounce 후 autosave 수행

#### 5.3 결과 표시

| 모드        | 표시 방식              |
| --------- | ------------------ |
| View Mode | markdown 렌더링 결과 표시 |
| Edit Mode | raw markdown 표시    |
| Code Node | code editor 형태 표시  |

---

### 6. 규칙 (Rule)

#### 6.1 콘텐츠 타입 규칙

```txt
content_type:
  - markdown
  - code
```

#### 6.2 source 규칙

```txt
source:
  - user
  - ai
```

#### 6.3 렌더링 규칙

* markdown → HTML 렌더링
* code → monospace + copy 버튼
* code → language 기반 syntax highlight 가능

#### 6.4 code node 규칙

* 실행 가능성을 가진 콘텐츠는 반드시 code 타입 사용
* language 지정 권장 (bash, python, sql 등)
* execution_mode는 future 확장용

#### 6.5 저장 규칙

* 500ms debounce autosave
* diff 기반 저장

#### 6.6 우선순위 규칙

* 사용자 수정 > AI 생성
* AI 결과 자동 overwrite 금지

#### 6.7 길이 제한

* title: 200자
* content: 10,000자
* note: 50,000자

---

### 7. Markdown 정책 (Format Policy)

#### 7.1 기본 기준

* CommonMark 기반
* 일부 GitHub Flavored Markdown(GFM) 지원

#### 7.2 지원 포맷

| 항목         | 지원 여부  |
| ---------- | ------ |
| 제목 (H1~H6) | 지원     |
| 굵게         | 지원     |
| 이탤릭        | 지원     |
| 취소선        | 지원     |
| 리스트        | 지원     |
| 체크리스트      | 지원     |
| 인라인 코드     | 지원     |
| 코드 블록      | 지원     |
| 링크         | 지원     |
| 표          | 제한적 지원 |

#### 7.3 미지원 또는 별도 처리

| 항목    | 처리 방식           |
| ----- | --------------- |
| 글자 색상 | NODE_STYLE에서 처리 |
| 배경 색상 | NODE_STYLE에서 처리 |
| 밑줄    | 미지원 (MVP 기준)    |
| HTML  | 제한 또는 제거        |

---

### 8. 예외 / 경계 (Edge Case)

Edge Case 기준은 프로젝트 규칙을 따른다. 

#### 8.1 빈 값

* content 없음 → title만 허용
* 공백만 입력 → 저장 금지

#### 8.2 최대 길이 초과

* content 초과 시 저장 차단

#### 8.3 권한 없음

* viewer → 수정 불가

#### 8.4 존재하지 않음

* 삭제된 노드 수정 요청 → 무시

#### 8.5 충돌

* 협업 중 동시 수정 → 마지막 저장 우선 (MVP)

#### 8.6 네트워크 오류

* autosave 실패 → retry queue
* offline → local cache

#### 8.7 보안

* script 삽입 금지
* XSS 필터 적용

---

### 9. 권한 규칙

| 역할      | 권한     |
| ------- | ------ |
| creator | 전체 수정  |
| editor  | 콘텐츠 수정 |
| viewer  | 읽기 전용  |

---

### 10. DB 영향

#### 관련 테이블

* nodes

#### 주요 컬럼

* content (TEXT)
* content_type (VARCHAR)
* source (VARCHAR)
* code_language (VARCHAR)
* execution_mode (VARCHAR)
* note (TEXT)
* updated_at

#### 권장

* JSONB 확장 가능

---

### 11. API 영향

#### 필요 API

* PATCH /nodes/{id}/content
* GET /nodes/{id}

#### 요청 예시

```json
{
  "content": "...",
  "content_type": "markdown"
}
```

---

### 12. 연관 기능

* NODE_EDITING
* NODE_STYLE
* SAVE
* VERSION_HISTORY
* AI
* AI_WORKFLOW
* EXPORT
* NODE_TRANSLATION

---

### 13. 예시 시나리오

#### 시나리오 1 (markdown 노드)

* 사용자가 설명 작성
  → markdown으로 저장
  → 렌더링 표시

#### 시나리오 2 (code node)

* 사용자가 명령어 입력
  → code node 생성
  → copy 버튼 표시

#### 시나리오 3 (AI 생성)

* AI가 노드 생성
  → source=ai 저장
  → 사용자 수정 시 source=user 변경

---

### 14. 구현 우선순위

#### MVP

* markdown 입력/렌더링
* autosave
* code node 기본 지원

#### 2단계

* syntax highlight
* note 확장

#### 3단계

* code execution (agent/MCP 연계)
* AI diff/merge

```
```

---
