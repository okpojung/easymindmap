# 07. Markdown Format Policy
- 문서 버전: v1.0
- 작성일: 2026-04-08

---

## 1. 목적 (Purpose)

Markdown 문서를 기반으로 Mindmap을 생성하기 위한
**표준 파싱 및 렌더링 정책**을 정의한다.

이 문서는 다음을 명확히 한다:

- Markdown → Mindmap 구조 변환 규칙
- Heading 기반 Node 생성 정책
- Node 내용(Content) 수집 규칙
- 스타일/레이아웃 분리 원칙

---

## 2. 기본 원칙 (Core Principles)

### 2.1 구조와 스타일의 완전 분리

- Markdown은 **구조 정의 용도**
- Mindmap은 **스타일 및 시각 표현 담당**

| 항목 | Markdown | Mindmap |
|------|----------|---------|
| 역할 | 구조 정의 | 시각 표현 |
| Heading | Level 정의 | 글자 크기 영향 없음 |
| 스타일 | 제한적 | 완전 제어 |

---

### 2.2 Heading = Node Level

Markdown Heading은 다음과 같이 변환된다:

| Markdown | 의미 | Mindmap |
|----------|------|---------|
| #        | H1   | Root Node |
| ##       | H2   | Level 1 |
| ###      | H3   | Level 2 |
| ####     | H4   | Level 3 |
| #####    | H5   | Level 4 |
| ######   | H6   | Level 5 |

---

### 2.3 글자 크기 정책

- ❌ Heading에 따른 글자 크기 변경 없음
- ✅ 모든 텍스트는 Map/Node Style 정책을 따른다

우선순위:

1. Node 개별 스타일
2. Subtree override
3. Map 기본 스타일

---

### 2.4 문서형 Markdown vs 아웃라인형 Markdown

#### 문서형 Markdown

- 문단, 리스트, 코드블럭, 인용문 등을 하나의 node 본문 안에서 유지한다.
- 기본 import 대상 형식이다.

#### 아웃라인형 Markdown

- Heading 계층(`#`, `##`, `###` ...)을 node 계층으로 변환한다.
- 본문 문단/리스트는 해당 heading node의 내부 콘텐츠로 유지한다.

### 2.5 리스트 정책

- 기본 정책: Markdown list는 child node로 자동 분해하지 않는다.
- 옵션 import 모드에서만 “리스트 → 자식 노드 변환”을 허용한다.
- export 기본값도 node 내부 list 유지다.

### 2.6 `#` 기호 처리 정책

- 줄 시작 후 공백 규칙을 만족하는 경우만 heading으로 해석한다.
- 예:
  - `# 제목` → heading
  - `C#`, `#태그`, `가격 #1` → heading 아님
- import parser는 CommonMark heading 규칙을 기본 준수한다.

---

## 3. Node 생성 규칙 (Node Creation Rule)

### 3.1 기본 생성 규칙

- Heading이 나오면 새로운 Node 생성
- Heading 레벨에 따라 부모/자식 관계 결정

---

### 3.2 부모 결정 알고리즘

```pseudo
현재 Heading Level = L

이전 Node 중에서
Level < L 인 가장 가까운 Node를 Parent로 설정
````

---

### 3.3 예시

```md
# 마인드맵 개발
## 목표
## 기능 정의
### 기능1
### 기능2
## DB설계
```

👉 변환 결과

```
마인드맵 개발 (Root)
 ├─ 목표
 └─ 기능 정의
 │   ├─ 기능1
 │   └─ 기능2
 └─ DB설계
```

---

## 4. Markdown 해석 유형 정의 (Document vs Outline)

Markdown은 동일한 문법을 사용하더라도 작성 목적에 따라 두 가지 유형으로 구분된다.

- 문서형(Document Markdown)
- 아웃라인형(Outline Markdown)

이 구분은 Import 시 Node Tree 생성 방식에 직접적인 영향을 준다.

---

### 4.1 유형별 Import 기준 요약

- 문서형: Heading만 트리 구조로 사용하고, 문단/리스트/코드는 node 내부 콘텐츠로 유지
- 아웃라인형: Heading + List Item을 구조로 해석하여 자식 node 생성
- 세부 기준은 §2.4(문서형/아웃라인형), §2.5(리스트 정책), §2.6(`#` 처리)를 우선 적용

---

### 4.3 해석 모드 (Import Mode)

Markdown Import 시 다음 모드를 지원한다.

| Mode     | 설명                          |
| -------- | ----------------------------- |
| document | 문서형 해석 (기본값)           |
| outline  | 리스트를 구조로 해석           |
| hybrid   | Heading + 일부 리스트만 구조화 |

---

### 4.4 기본 정책

- 기본 Import 모드는 `document`로 한다.
- 사용자가 명시적으로 선택한 경우에만 outline 모드를 적용한다.
- 자동 추론에 의해 모드를 변경하지 않는다.

---

## 5. Heading 기호 (`#`) 정의

### 5.1 기본 정의

- `#`는 Markdown에서 Heading(제목)을 나타내는 기호이다.
- Heading은 Node Tree 구조를 생성하는 기준이 된다.

---

### 5.2 Heading 인식 조건

다음 조건을 모두 만족할 때만 Heading으로 인정한다.

1. 라인의 시작 위치에서 등장해야 한다.
2. `#` 개수는 1개 이상 6개 이하만 허용한다.
3. `#` 뒤에는 텍스트가 존재해야 한다.
4. `#` 뒤에는 최소 1칸 공백이 있어야 한다.

허용 예:

```md
# 제목
### 기능 상세
```

---

### 5.3 Heading Level 정의

| 기호   | Level | 의미          |
| ------ | ----- | ------------- |
| #      | 1     | Root 또는 최상위 |
| ##     | 2     | 1단계 하위     |
| ###    | 3     | 2단계 하위     |
| ...    | ...   | ...           |
| ###### | 6     | 최대 depth    |

---

### 5.4 Heading 변환 규칙

- Heading은 Node로 변환된다.
- Level 차이에 따라 Parent-Child 관계가 결정된다.
- Level이 2 → 4로 점프하는 경우:
  → 중간 Level은 자동 보정하지 않고 가장 가까운 상위 Node에 연결한다.

---

### 5.5 Heading이 아닌 `#` 처리

다음 경우의 `#`는 Heading으로 해석하지 않는다.

| 경우 | 예시 | 처리 |
|---|---|---|
| 문장 중간 | `가격은 #1 정책을 따른다` | 일반 Content |
| 프로그래밍 언어 | `C#` | 일반 Content |
| 태그/해시 | `#todo` `#중요` | 일반 Content |
| escape 문자 | `\# 제목 아님` | 일반 Content |
| 코드 블록 내부 | ` ```bash\n# 주석 ``` ` | 일반 Content |
| 인라인 코드 | `` `# not heading` `` | 일반 Content |

---

### 5.6 Literal Sharp (`#` 문자) 표현

문서 작성자가 `#`를 문자 그대로 사용하고 싶을 경우 허용 방식:

- `\#`
- 인라인 코드: `` `#` ``
- 코드 블록 내부 사용

> 권장: Heading으로 오해될 수 있는 경우 반드시 escape 사용

---

### 5.7 Heading 판정 우선순위

1. Code Block 내부 → 무조건 Heading 제외
2. Inline Code 내부 → 제외
3. Escape(`\#`) → 제외
4. 라인 시작 여부 확인
5. Heading 규칙 적용

---

### 5.8 Edge Case 처리

| Case | 입력 예시 | 처리 |
|---|---|---|
| 빈 Heading | `##` | 무시 (Node 생성 안함) |
| 공백만 존재 | `##    ` | 무시 |
| 잘못된 Level Jump | `# A` → `#### B` | B는 A의 child로 처리 |
| Heading + List 혼합 | `## 기능\n- 항목` | Heading Node 생성 후 List는 규칙에 따라 처리 |

---

## 6. Node Content 수집 규칙 (Content Aggregation)

### 4.1 핵심 규칙

> **다음 동일 또는 상위 Level Heading이 나오기 전까지의 모든 내용은 현재 Node의 Content로 저장한다**

---

### 4.2 포함 대상

* 일반 텍스트
* 리스트
* 코드 블록
* 인용문
* 테이블

---

### 4.3 종료 조건

현재 Node의 Content 수집은 아래에서 종료된다:

* 같은 Level Heading 등장
* 더 높은 Level Heading 등장

---

### 4.4 예시

```md
## 목포
목포는 전라남도에 위치한다.

- 항구 도시
- 관광지

## 기능 정의
```

👉 결과

Node: "목포"

Content:

* 목포는 전라남도에 위치한다.
* 리스트 포함

---

## 7. 공백 및 포맷 처리 규칙

### 5.1 Heading 공백 허용

```md
##기능 정의   ← 허용
## 기능 정의  ← 허용
```

→ 동일하게 처리

---

### 5.2 Heading 텍스트 정리

* 앞뒤 공백 제거
* 연속 공백 → 1개로 축소

---

### 5.3 빈 Heading 처리

```md
## 
```

→ ❌ Node 생성 금지 (무시)

---

## 8. 리스트 처리 규칙

```md
- 항목1
- 항목2
```

👉 Node Content로 포함

---

### 옵션 (향후 확장)

* 리스트 → 자동 자식 Node 변환 가능 (옵션)

---

## 9. 코드 블록 처리

````md
```bash
apt install apache2
````

````

👉 Node Content에 유지

추가 UI:

- Copy 버튼 지원
- Code 스타일 유지

---

## 10. 스타일 관련 정책 (중요)

### 8.1 Markdown 스타일 무시

- ❌ Heading 크기
- ❌ Bold/Italic 기반 레벨 의미

👉 구조만 사용

---

### 8.2 허용 스타일

- inline code
- code block
- 링크

---

## 11. 예외 / 경계 (Edge Case)

(※ 아래 기준은 별도 문서와 동일 정책 적용) :contentReference[oaicite:0]{index=0}

---

### 9.1 잘못된 Heading 순서

```md
# A
### B
````

👉 처리:

* 중간 Level 자동 생성 없이
* 바로 하위 Node로 연결

---

### 9.2 Root 없는 경우

```md
## 기능
```

👉 처리:

* 가상 Root 생성

```
ROOT
 └─ 기능
```

---

### 9.3 내용만 있는 경우

```md
내용만 있음
```

👉 처리:

* 단일 Root Node 생성
* 전체 내용 Content로 저장

---

### 9.4 중복 Heading

```md
## 기능
## 기능
```

👉 허용 (별도 Node)

---

### 9.5 매우 깊은 Level

* H6 초과 → H6로 제한

---

### 9.6 대용량 Content

* Node Content 최대 길이 제한 필요

---

## 12. Import 처리 흐름

```pseudo
Markdown 입력
 → 파싱 (Tokenizer)
 → AST 생성
 → Node Tree 생성
 → Content 매핑
 → Mindmap Model 변환
```

---

## 13. Export 정책

### 11.1 Simple Mode

* 구조만 export
* 스타일 제외

---

### 11.2 Full Mode

* Node 스타일 포함
* Layout 정보 포함

---

## 14. 확장 기능 (Future)

* Markdown ↔ Mindmap Round-trip 지원
* AI 자동 생성 지원
* 협업 diff 기반 Markdown 생성

---

## 15. 연관 기능

* NODE_CONTENT
* NODE_STYLE
* LAYOUT
* IMPORT
* EXPORT
* AI
