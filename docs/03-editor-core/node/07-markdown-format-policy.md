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

## 4. Node Content 수집 규칙 (Content Aggregation)

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

## 5. 공백 및 포맷 처리 규칙

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

## 6. 리스트 처리 규칙

```md
- 항목1
- 항목2
```

👉 Node Content로 포함

---

### 옵션 (향후 확장)

* 리스트 → 자동 자식 Node 변환 가능 (옵션)

---

## 7. 코드 블록 처리

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

## 8. 스타일 관련 정책 (중요)

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

## 9. 예외 / 경계 (Edge Case)

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

## 10. Import 처리 흐름

```pseudo
Markdown 입력
 → 파싱 (Tokenizer)
 → AST 생성
 → Node Tree 생성
 → Content 매핑
 → Mindmap Model 변환
```

---

## 11. Export 정책

### 11.1 Simple Mode

* 구조만 export
* 스타일 제외

---

### 11.2 Full Mode

* Node 스타일 포함
* Layout 정보 포함

---

## 12. 확장 기능 (Future)

* Markdown ↔ Mindmap Round-trip 지원
* AI 자동 생성 지원
* 협업 diff 기반 Markdown 생성

---

## 13. 연관 기능

* NODE_CONTENT
* NODE_STYLE
* LAYOUT
* IMPORT
* EXPORT
* AI

```

---
