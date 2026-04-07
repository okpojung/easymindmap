# 05. Node Style
## NODE_STYLE

* 문서 버전: v1.0
* 작성일: 2026-04-06

---

### 1. 기능 목적

* 노드의 **시각적 표현(UI/UX)**을 담당
* 콘텐츠(markdown)와 스타일을 분리하여 유지보수성과 확장성 확보

---

### 2. 기능 범위

* 포함:

  * 색상
  * 폰트
  * 배경
  * border
  * icon
  * 상태 표시
* 제외:

  * 콘텐츠 (NODE_CONTENT)
  * 위치 (LAYOUT)

---

### 3. 세부 기능 목록

| 기능ID  | 기능명    | 설명        | 주요 동작        |
| ----- | ------ | --------- | ------------ |
| NS-01 | 텍스트 색상 | 글자 색 변경   | color picker |
| NS-02 | 배경 색상  | 노드 배경     | palette      |
| NS-03 | 폰트 스타일 | bold/size | toolbar      |
| NS-04 | border | 테두리 스타일   | radius       |
| NS-05 | 아이콘    | 상태 아이콘    | emoji/icon   |
| NS-06 | 강조     | highlight | 중요 표시        |

---

### 4. 기능 정의 (What)

```json
{
  "style": {
    "textColor": "#333",
    "backgroundColor": "#fff",
    "fontSize": 14,
    "fontWeight": "bold",
    "borderRadius": 8,
    "borderColor": "#ddd"
  }
}
```

---

### 5. 동작 방식 (How)

#### 사용자

* 스타일 메뉴 선택
* 색상/폰트 변경

#### 시스템

* style state 저장
* 즉시 UI 반영
* autosave

---

### 6. 규칙 (Rule)

#### 6.1 분리 규칙

* 콘텐츠 ≠ 스타일
* markdown에는 색상 포함하지 않음

#### 6.2 상속 규칙

* 부모 스타일 → 자식 기본 상속
* override 가능

#### 6.3 우선순위

* node style > theme

---

### 7. 예외 / 경계

* 색상 없음 → default 적용
* 잘못된 값 → fallback
* viewer 수정 금지

---

### 8. 권한 규칙

| 역할      | 권한    |
| ------- | ----- |
| creator | 전체    |
| editor  | 변경 가능 |
| viewer  | 읽기    |

---

### 9. DB 영향

* nodes.style (JSON)

---

### 10. API 영향

* PATCH /nodes/{id}/style

---

### 11. 연관 기능

* NODE_CONTENT
* LAYOUT
* THEME
* EXPORT

---

### 12. 예시

* 중요 노드 → 빨간색
* 완료 노드 → 회색
* 루트 노드 → 강조 스타일

---

### 13. 구현 우선순위

#### MVP

* 색상
* 배경

#### 2단계

* 폰트
* border

#### 3단계

* theme 시스템

```
```
