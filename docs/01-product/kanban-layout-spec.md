# easymindmap — Kanban Layout 기능 명세서

문서 버전: v1.0  
상태: Draft  
작성일: 2026-03-30

---

## 1. 개요

Kanban Layout은 기존 mindmap/tree 계열 layout과 별도로 동작하는 **보드형 레이아웃**이다.

- 업무 흐름을 단계별로 시각화
- activity를 카드 형태로 관리
- 최대 3레벨 구조만 허용

---

## 2. 구조 정의

Level 구조:

- Level 1: 보드 제목
- Level 2: 컬럼 (좌 → 우)
- Level 3: 카드 (컬럼 내부)

Level 4 이상은 생성 불가

---

## 3. 예시

```
프로젝트 A
 ├ 분석
 │  ├ 요구사항 정리
 │  ├ 인터뷰
 ├ 설계
 │  ├ 화면 설계
 ├ 코딩
 └ 테스트
```

UI:

```
[분석]   [설계]   [코딩]   [테스트]
 카드    카드     카드     카드
```

---

## 4. 생성 규칙

### Map 생성

Kanban 선택 시:

```
보드 제목
 ├ 컬럼1
 ├ 컬럼2
 ├ 컬럼3
```

---

## 5. 동작 규칙

### 허용

- 컬럼 추가 / 삭제 / 이동
- 카드 추가 / 수정 / 삭제
- 카드 컬럼 간 이동

### 금지

- Level 4 생성
- 카드 아래 자식 생성

---

## 6. LayoutType 추가

```
| 'kanban'
```

---

## 7. Layout 엔진

- Level1: 상단 제목
- Level2: 가로 컬럼
- Level3: 세로 카드

Edge 없음 (board UI)

---

## 8. 데이터 규칙

- depth 0 = board
- depth 1 = column
- depth 2 = card

---

## 9. Export

### Markdown

```
# 프로젝트 A
## 분석
- 요구사항
```

---

## 10. 핵심 요약

```
Level1 = 보드
Level2 = 컬럼
Level3 = 카드
Level4 금지
```
-------------------------
좋습니다.
이건 기존 트리/방사형 계열과는 **별도 엔진으로 취급하는 Kanban Layout**으로 정의하는 게 맞습니다.

아래처럼 바로 `docs/01-product`나 `docs/03-editor-core`에 넣을 수 있는 수준의 **기능 문서 초안**으로 정리하겠습니다.

---

# easymindmap — Kanban Layout 기능 명세서

문서 버전: v1.0
상태: Draft
프로젝트: easymindmap
작성일: 2026-03-30

---

## 1. 개요

Kanban Layout은 기존 mindmap/tree 계열 layout과 별도로 동작하는 **보드형 레이아웃**이다.

이 레이아웃은 일반적인 방사형/트리형처럼 무한 계층을 전개하는 구조가 아니라,
**딱 3레벨까지만 허용되는 고정 구조형 레이아웃**으로 정의한다.

Kanban Layout의 목적은 다음과 같다.

* 업무 흐름을 단계별 보드 형태로 시각화
* 각 단계별 activity를 카드처럼 관리
* 마인드맵이 아닌 kanban board처럼 사용할 수 있는 별도 작업 모드 제공

즉, 이 기능은 “mindmap 내부의 또 하나의 layout”이라기보다
**easymindmap 안에서 지원하는 별도 보드형 문서 구조**에 가깝다.

---

## 2. 핵심 정의

Kanban Layout에서는 계층 구조를 아래처럼 고정한다.

### Level 구조

```text
Level 1 = 주제(보드 제목)
Level 2 = 컬럼(Column)
Level 3 = Activity(Card)
```

예시:

```text
프로젝트 A
 ├ 분석
 │  ├ 요구사항 정리
 │  ├ 인터뷰
 │  └ 경쟁사 조사
 ├ 설계
 │  ├ 화면 설계
 │  └ DB 설계
 ├ 코딩
 │  ├ API 개발
 │  └ 프론트엔드 구현
 ├ 테스트
 │  └ 통합 테스트
 └ Deploy
    └ 운영 반영
```

화면에서는 위 트리를 아래처럼 표현한다.

```text
[ 프로젝트 A ]

[분석]   [설계]   [코딩]   [테스트]   [Deploy]
  카드      카드      카드      카드       카드
  카드      카드      카드
  카드
```

---

## 3. 구조 규칙

## 3.1 Level 1

Level 1은 **Kanban 전체 주제**이다.

예:

* 프로젝트 A
* 고객사 구축 일정
* 제품 개발 보드

규칙:

* Kanban Map에는 Level 1 노드가 1개만 존재
* 이 노드는 보드의 최상위 제목 역할
* 실제 화면에서는 상단 제목 영역으로 표시 가능

---

## 3.2 Level 2

Level 2는 **Kanban Column**이다.

예:

* 분석
* 설계
* 코딩
* 테스트
* Deploy

규칙:

* Level 2는 왼쪽 → 오른쪽 순서로 배치
* 사용자가 직접 원하는 컬럼명을 정의
* 컬럼 순서 변경 가능
* 컬럼 수는 가변
* 최소 1개 이상 생성 가능

즉, Kanban Layout에서 실질적인 가로축 구조는 Level 2가 담당한다.

---

## 3.3 Level 3

Level 3는 각 컬럼 하위의 **Activity/Card**이다.

예:

* 요구사항 정리
* API 설계
* 화면 테스트
* 운영 배포 체크

규칙:

* Level 3는 해당 Level 2 컬럼 내부에서 위 → 아래로 카드 형태 배치
* 각 카드는 activity/task 단위
* 컬럼 간 drag & drop 이동 가능하도록 확장 가능
* Kanban에서 실제 작업 항목은 모두 Level 3에 위치

---

## 3.4 Level 제한

Kanban Layout은 **오직 3레벨까지만 허용**한다.

즉:

* Level 1: 주제
* Level 2: 컬럼
* Level 3: activity

그 이하 Level 4 이상은 생성 불가

### 금지 예시

```text
프로젝트 A
 └ 분석
    └ 요구사항 정리
       └ 세부항목
```

위 구조에서 `세부항목`은 Level 4이므로 허용하지 않는다.

---

## 4. Map 생성 규칙

## 4.1 새 Map 생성 시 Layout 선택

새 Map 생성 화면에서 기존 layout들과 별도로 아래 옵션을 제공한다.

```text
Map Type / Layout
- Mindmap
- Kanban
```

또는

```text
기본 레이아웃 선택
- 방사형
- 트리형
- 계층형
- 진행트리
- 자유배치형
- Kanban
```

---

## 4.2 Kanban 선택 시 초기 생성 규칙

사용자가 새 Map 생성 시 `Kanban`을 선택하면,
시스템은 기본적으로 아래 구조를 생성할 수 있다.

### 기본 예시

```text
새 Kanban 보드
 ├ Todo
 ├ Doing
 └ Done
```

또는 사용자가 생성 시 직접 컬럼명을 입력하도록 할 수 있다.

### 사용자 정의 생성 예시

입력:

```text
보드 제목: 프로젝트 A
컬럼: 분석, 설계, 코딩, 테스트, Deploy
```

자동 생성 결과:

```text
프로젝트 A
 ├ 분석
 ├ 설계
 ├ 코딩
 ├ 테스트
 └ Deploy
```

---

## 5. UI/UX 정의

## 5.1 Kanban 화면 구조

Kanban Layout은 일반 mindmap canvas와 다르게 보드형 UI를 가진다.

권장 구조:

```text
┌──────────────────────────────────────────────┐
│ 보드 제목: 프로젝트 A                         │
├────────────┬────────────┬────────────┬───────┤
│ 분석       │ 설계       │ 코딩       │ 테스트 │
│ ─────────  │ ─────────  │ ─────────  │ ───── │
│ 카드1      │ 카드1      │ 카드1      │ 카드1 │
│ 카드2      │ 카드2      │ 카드2      │       │
│ 카드3      │            │ 카드3      │       │
└────────────┴────────────┴────────────┴───────┘
```

---

## 5.2 표시 규칙

### Level 1 표시

* 보드 상단 제목으로 표시
* 일반 노드처럼 캔버스 중앙 배치하지 않음

### Level 2 표시

* 각 컬럼 헤더로 표시
* 가로 방향 정렬
* 컬럼 너비는 일정하거나 사용자 조절 가능

### Level 3 표시

* 카드 UI로 표시
* 컬럼 내부 세로 정렬
* 카드 높이는 텍스트 양에 따라 가변 가능

---

## 5.3 편집 규칙

### Level 1 편집

* 보드 제목 수정 가능

### Level 2 편집

* 컬럼명 수정 가능
* 컬럼 추가 가능
* 컬럼 삭제 가능
* 컬럼 순서 변경 가능

### Level 3 편집

* 카드 추가 가능
* 카드 수정 가능
* 카드 삭제 가능
* 카드 순서 변경 가능
* 카드 다른 컬럼으로 이동 가능

---

## 6. 노드 생성 규칙

Kanban Layout에서는 일반 Node 생성 규칙을 그대로 쓰면 안 되고,
레벨별로 제한된 생성 규칙을 둬야 한다.

## 6.1 Level 1에서 생성

Level 1에서는 **Level 2 컬럼만 생성 가능**

즉:

* 자식 생성 = 컬럼 추가
* 형제 생성 = 불가 또는 의미 없음

---

## 6.2 Level 2에서 생성

Level 2에서는 **Level 3 activity만 생성 가능**

즉:

* 자식 생성 = 카드 추가
* 형제 생성 = 컬럼 추가와는 구분 필요

권장 정책:

* 컬럼 헤더에서 `+ 컬럼`
* 컬럼 내부에서 `+ 카드`

---

## 6.3 Level 3에서 생성

Level 3에서는 하위 생성 금지

즉:

* 자식 노드 생성 불가
* Level 4 생성 불가
* 형제 카드 추가만 허용 가능

---

## 7. 동작 제한 규칙

Kanban Layout은 별도 구조이므로 기존 mindmap 기능 중 일부를 제한해야 한다.

## 7.1 제한 기능

다음 기능은 Kanban에서 비활성화 또는 다르게 동작해야 한다.

* 방사형/트리형 subtree layout 변경
* Level 4 이상 자식 생성
* 자유배치 drag
* 부모-자식 edge 시각화
* radial/tree edge 정책

---

## 7.2 유지 가능한 기능

다음 기능은 Kanban에서도 유지 가능하다.

* 노드 텍스트 편집
* tag
* note
* hyperlink
* attachment
* media
* autosave
* undo/redo
* markdown export
* html export
* AI 생성

---

## 8. Layout 엔진 정의

Kanban Layout은 기존 layout engine의 radial/tree/hierarchy/process/freeform 전략과 별도인
**독립 strategy**로 구현한다.

예:

```typescript
type LayoutType =
  | 'radial-bidirectional'
  | 'radial-right'
  | 'radial-left'
  | 'tree-up'
  | 'tree-down'
  | 'tree-right'
  | 'tree-left'
  | 'hierarchy-right'
  | 'hierarchy-left'
  | 'process-tree-right'
  | 'process-tree-left'
  | 'process-tree-right-a'
  | 'process-tree-right-b'
  | 'freeform'
  | 'kanban';
```

---

## 8.1 Kanban Layout 계산 규칙

### Level 1

* 화면 상단 제목 영역 고정

### Level 2

* 컬럼을 좌→우로 배치
* 각 컬럼 width 계산
* 컬럼 간 gap 적용

### Level 3

* 각 컬럼 내부에서 위→아래 카드 정렬
* 카드 간 vertical gap 적용
* 카드 높이 합에 따라 컬럼 높이 결정

---

## 8.2 Edge 정책

Kanban Layout은 일반적인 부모-자식 연결선 표시를 기본적으로 사용하지 않는다.

즉:

* edge 렌더링 생략 가능
* 필요 시 내부 논리 관계만 유지
* 화면에서는 board/card 구조로만 표시

### 결론

Kanban Layout은 **edge-less board layout**을 기본으로 한다.

---

## 9. 데이터 모델 반영

Kanban은 별도 테이블을 추가하지 않고 기존 Node 구조를 사용해도 된다.
다만 아래 규칙을 추가해야 한다.

## 9.1 Node depth 규칙

* depth 0 = 보드 제목
* depth 1 = 컬럼
* depth 2 = 카드
* depth 3 이상 = 금지

---

## 9.2 검증 규칙

저장 시 아래 검증 필요:

1. root는 1개만 존재
2. root의 자식은 컬럼으로 취급
3. 컬럼의 자식은 카드로 취급
4. 카드의 자식은 허용하지 않음

---

## 9.3 nodeType 확장 권장

더 명확한 처리를 위해 nodeType 또는 role을 둘 수 있다.

예:

```typescript
type KanbanNodeRole =
  | 'board'
  | 'column'
  | 'card';
```

또는 style/layout metadata에 저장

```json
{
  "layoutType": "kanban",
  "kanbanRole": "column"
}
```

---

## 10. 생성/이동 검증 규칙

## 10.1 허용

* board 아래에 column 생성
* column 아래에 card 생성
* column 순서 이동
* card 순서 이동
* card를 다른 column으로 이동

## 10.2 금지

* card 아래에 자식 생성
* board 아래에 card 직접 생성
* column 아래에 column 생성
* depth 3 이상 생성

---

## 11. Export 규칙

## 11.1 Markdown Export

Kanban도 Markdown으로 export 가능해야 한다.

예시:

```markdown
# 프로젝트 A

## 분석
- 요구사항 정리
- 인터뷰
- 경쟁사 조사

## 설계
- 화면 설계
- DB 설계

## 코딩
- API 개발
- 프론트엔드 구현
```

즉:

* Level 1 → `#`
* Level 2 → `##`
* Level 3 → list item 또는 `###` 중 정책 선택

권장:

* Column = `##`
* Card = `-`

---

## 11.2 HTML Export

HTML export 시 보드 UI를 유지하는 것이 좋다.

즉 standalone HTML에서:

* 컬럼 좌→우 표시
* 카드 세로 표시
* drag는 없어도 됨
* 읽기 전용 보드 뷰 유지

---

## 12. AI 생성 규칙

Kanban Layout에서도 AI 생성 지원 가능

예:

입력:

```text
신규 서비스 개발 Kanban 보드 만들어줘
컬럼은 분석, 설계, 코딩, 테스트, deploy
```

출력:

* Level 1: 신규 서비스 개발
* Level 2: 분석 / 설계 / 코딩 / 테스트 / deploy
* Level 3: 각 컬럼별 activity 카드들

AI 생성 시에도 **3레벨 제한**을 반드시 적용해야 한다.

---

## 13. UX 권장사항

### 권장

* 카드 drag & drop
* 컬럼 추가 버튼
* 카드 추가 버튼
* 컬럼별 카드 개수 표시
* 컬럼별 색상 지정 가능

### 후순위

* 카드 담당자
* 카드 due date
* checklist
* swimlane
* WIP limit

---

## 14. MVP 범위

Kanban Layout MVP에는 아래만 포함한다.

### 포함

* 새 Map 생성 시 Kanban 선택
* Level 1 보드 제목
* Level 2 사용자 정의 컬럼
* Level 3 카드 추가/수정/삭제
* 3레벨 제한 검증
* 카드 순서 변경
* 컬럼 순서 변경
* Markdown export
* HTML export
* autosave
* undo/redo

### 제외

* swimlane
* assignee
* due date
* checklist
* automation
* WIP limit
* dependency line
* Level 4 이상 확장

---

## 15. 최종 정의

Kanban Layout은 easymindmap의 기존 tree/radial 계열과는 별도로 동작하는 **보드형 전용 레이아웃**이다.

핵심 규칙은 다음과 같다.

```text
Level 1 = 보드 제목
Level 2 = 좌→우 컬럼
Level 3 = 컬럼 내부 activity 카드
Level 4 이상 금지
```

즉, Kanban Layout은 일반 mindmap의 자유로운 다계층 구조가 아니라
**엄격히 3레벨로 제한된 업무 흐름형 보드 구조**로 설계한다.

---