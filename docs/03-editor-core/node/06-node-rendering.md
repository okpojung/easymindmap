# 06. Node Rendering
## NODE_RENDERING

* 문서 버전: v1.0
* 작성일: 2026-04-06

---

### 1. 기능 목적

* 노드 콘텐츠를 화면에 **가독성 있게 표시**
* markdown 기반 콘텐츠를 **구조적으로 렌더링**
* mindmap 특성에 맞게 **공간 효율 + 가독성 + 성능** 확보

---

### 2. 기능 범위

* 포함:

  * markdown 렌더링
  * code node 렌더링
  * node 크기 자동 조정
  * 줄바꿈 처리
  * overflow 처리
  * zoom 대응
* 제외:

  * 콘텐츠 편집 (NODE_CONTENT)
  * 스타일 (NODE_STYLE)
  * 위치 계산 (LAYOUT)

---

### 3. 세부 기능 목록

| 기능ID  | 기능명          | 설명            | 주요 동작      |
| ----- | ------------ | ------------- | ---------- |
| NR-01 | markdown 렌더링 | 텍스트 포맷 적용     | parser     |
| NR-02 | code 렌더링     | 코드 블록 표시      | highlight  |
| NR-03 | 자동 크기        | 내용 기반 resize  | dynamic    |
| NR-04 | 줄바꿈 처리       | 텍스트 wrap      | word-break |
| NR-05 | overflow 제어  | max-height 처리 | collapse   |
| NR-06 | zoom 대응      | 확대/축소         | scale      |
| NR-07 | preview 모드   | 렌더링 vs raw    | edit/view  |

---

### 4. 기능 정의 (What)

* node는 **content 하나만 가진다**
* title은 별도 저장하지 않고 **content에서 파생**

---

### 5. 동작 방식 (How)

#### 5.1 렌더링 구조

```txt
[Node Container]
 ├─ Title 영역 (derived)
 └─ Content 영역
```

---

#### 5.2 title 추출 규칙

| 조건                  | 처리              |
| ------------------- | --------------- |
| markdown heading 존재 | heading 사용      |
| heading 없음          | 첫 줄 사용          |
| code node           | 첫 줄 or 자동 label |

---

#### 5.3 markdown node 렌더링

```md
## Apache 설치
설명 내용
```

👉 표시

* Title: Apache 설치
* Content: 설명 내용

---

#### 5.4 code node 렌더링

```bash
sudo apt install apache2
```

👉 표시

* Title: "명령어" (또는 첫 줄)
* Content: code block UI

---

### 6. 규칙 (Rule)

#### 6.1 node 구조 규칙

* node는 단일 content 필드만 사용
* title은 derived 값

---

#### 6.2 크기 규칙

* width: 자동 또는 제한 (예: 200~400px)
* height: content 기반 자동 증가

---

#### 6.3 줄바꿈 규칙

* word-break: break-word
* 긴 문자열 자동 줄바꿈

---

#### 6.4 overflow 규칙

* 일정 길이 초과 시:

  * collapse 처리
  * "..." 표시
  * expand 가능

---

#### 6.5 zoom 규칙

* zoom level에 따라:

  * 텍스트 생략 가능
  * 아이콘만 표시 가능

---

#### 6.6 code node 규칙

* monospace font
* copy 버튼 표시
* syntax highlight (2단계)

---

### 7. 예외 / 경계 (Edge Case)

* content 없음 → placeholder 표시
* 매우 긴 텍스트 → collapse
* 매우 긴 코드 → scroll 처리
* 특수문자 깨짐 → escape 처리

---

### 8. 성능 규칙

* viewport 밖 노드 렌더링 제외 (culling)
* 긴 markdown lazy render
* syntax highlight 지연 적용

---

### 9. 권한 규칙

* viewer: 렌더링만
* editor: edit mode 전환 가능

---

### 10. 연관 기능

* NODE_CONTENT
* NODE_STYLE
* LAYOUT
* CANVAS

---

### 11. 예시 시나리오

#### 시나리오 1

긴 문서 → 자동 줄바꿈 + collapse

#### 시나리오 2

코드 노드 → copy 버튼 표시

---

### 12. 구현 우선순위

#### MVP

* 기본 markdown 렌더링
* auto resize

#### 2단계

* collapse/expand
* code highlight

#### 3단계

* zoom 기반 표시 최적화

```
```
