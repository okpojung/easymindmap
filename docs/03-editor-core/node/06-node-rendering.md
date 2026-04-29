## NODE_RENDERING
- 문서 버전: v2.0
- 작성일: 2026-04-06
- 수정 내용:
  - title/Title 영역 개념 제거
  - node는 단일 content 기반 렌더링으로 정리
  - NR-03 자동 크기 / NR-04 줄바꿈 / NR-05 overflow 정책 상세화
  - zoom 대응을 단순 scale이 아닌 LOD(Level of Detail) 개념으로 정리
  - markdown node / code node 렌더링 규칙 분리
  - 수동 줄바꿈, 리스트 표현, 가독성 정책 반영

---

### 1. 기능 목적
- 노드 콘텐츠를 화면에 가독성 있게 렌더링한다.
- markdown 및 code 타입의 콘텐츠를 일관된 정책으로 표시한다.
- 노드 내용 길이, 줄 수, 줌 레벨, 화면 밀도에 따라 적절히 축약/확장한다.
- 마인드맵의 본질인 **구조 가독성**과 문서 표현의 **내용 가독성** 사이의 균형을 유지한다.

---

### 2. 기능 범위
- 포함:
  - markdown node 렌더링
  - code node 렌더링
  - node 크기 자동 계산
  - 자동 줄바꿈 및 수동 줄바꿈 반영
  - overflow 축약/펼침
  - zoom 기반 정보량 제어(LOD)
  - 링크, 리스트, 첨부 아이콘 등 보조 요소 렌더링
- 제외:
  - 콘텐츠 수정 로직 (→ NODE_CONTENT)
  - 노드 색상/폰트/테두리 스타일 (→ NODE_STYLE)
  - 좌표 계산 및 배치 알고리즘 (→ LAYOUT)

---

### 3. 세부 기능 목록

| 기능ID | 기능명 | 설명 | 주요 동작 |
|---|---|---|---|
| NR-01 | markdown 렌더링 | markdown content 표시 | parse → render |
| NR-02 | code 렌더링 | code node 표시 | code UI |
| NR-03 | 자동 크기 | content 기반 auto size + max-size 제한 | responsive |
| NR-04 | 줄바꿈 처리 | markdown/code 별도 줄바꿈 정책 | wrap policy |
| NR-05 | overflow 제어 | 조건 기반 collapse + expand | progressive display |
| NR-06 | zoom 대응 | scale + LOD 기반 정보량 제어 | adaptive |
| NR-07 | 첨부/링크 표시 | 링크/첨부 아이콘 표시 | inline accessory |
| NR-08 | preview/edit 전환 | view mode / edit mode 전환 | rendered/raw |

---

### 4. 기능 정의 (What)
- node 본문은 **`nodes.text` 단일 필드**를 사용한다.
- 별도의 title 필드는 존재하지 않는다.
- 렌더링은 `nodes.text` 전체를 기준으로 수행한다.
- 다만 본문 내부 구조(예: 첫 heading, 첫 줄, 리스트, 링크, 코드)를 분석하여 시각적으로 강조할 수 있다.
- 즉, “제목처럼 보이는 부분”이 있을 수는 있으나, 그것은 별도 데이터 필드가 아니라 **렌더링 결과**이다.

#### 예시 1: markdown node
```json
{
  "text": "## 에버그린복지재단\n- 산하시설\n- 운영법인",
  "node_type": "text"
}
````

#### 예시 2: code node

```json
{
  "text": "sudo apt install apache2 -y",
  "node_type": "code",
  "style_json": { "codeLanguage": "bash" }
}
```

---

### 4.1 저장 모델과의 연결 규칙

- 렌더링 입력 원본은 `nodes.text` 이다.
- note는 본문 렌더 트리와 분리하며, 필요 시 보조 패널/expand UI에서 `node_notes.content`를 표시한다.
- Markdown list는 기본적으로 node 내부 렌더링 대상으로 처리한다.
- `node_type='code'`인 경우 raw code block 렌더링 정책을 우선 적용한다.
- 본문(`text`)과 스타일(`style_json`)은 분리한다.

---

### 5. 동작 방식 (How)

#### 5.1 렌더링 기본 흐름

1. node의 node_type 확인
2. text 또는 code 렌더러 선택
3. content 구조 분석
4. node width/height 계산
5. 줄바꿈 정책 적용
6. overflow 여부 판정
7. zoom level에 맞는 LOD 정책 적용
8. 최종 렌더링 수행

---

#### 5.2 node 구조 원칙

* node는 단일 content만 렌더링한다.
* 별도의 title 영역 / body 영역으로 데이터 구조를 나누지 않는다.
* 단, markdown heading 또는 첫 줄은 시각적으로 강조될 수 있다.
* 이 강조는 렌더링 규칙일 뿐, 데이터 구조 분리가 아니다.

---

#### 5.3 markdown node 렌더링

* CommonMark + 일부 GFM 정책에 따라 렌더링한다.
* heading, paragraph, list, checklist, inline code, link, table 일부를 표현할 수 있다.
* 긴 내용은 overflow 정책에 따라 일부만 노출할 수 있다.
* 수동 줄바꿈(Enter 입력)과 자동 줄바꿈을 모두 반영한다.

예:

```md
## 에버그린복지재단
- 산하시설
- 운영법인
- 복지사업
```

렌더링 예:

* 첫 heading은 상대적으로 강조
* 리스트는 bullet로 표시
* node 크기는 내용에 따라 자동 증가
* 너무 길면 접힘(collapse)

---

#### 5.4 code node 렌더링

* code node는 실행형 또는 명령형 콘텐츠를 표시하기 위한 별도 타입이다.
* markdown 안의 fenced code block과는 구분된다.
* code node는 monospace font를 사용한다.
* 기본적으로 원문 보존을 우선한다.
* 줄바꿈보다 가로 스크롤 또는 별도 펼침을 우선 고려한다.
* 향후 copy, 실행, agent/MCP 연계를 고려한 UI 확장 가능성이 있다.

예:

```bash
sudo apt install apache2 certbot python3-certbot-apache -y
```

렌더링 예:

* monospace
* code block 배경
* copy 버튼
* 긴 한 줄은 기본적으로 자동 줄바꿈하지 않음
* 필요 시 가로 스크롤 또는 접힘 표시

---

### 6. 규칙 (Rule)

---

#### 6.1 공통 렌더링 규칙

* node는 content만을 기반으로 렌더링한다.
* 렌더링은 구조 가독성을 해치지 않는 범위에서만 내용 표현을 확장한다.
* node는 문서 전체를 보여주는 카드가 아니라, **맵 구조 안에서 의미를 압축 표시하는 단위**이다.
* 따라서 “모든 내용을 항상 전부 표시”하는 것을 목표로 하지 않는다.

---

#### 6.2 NR-03 자동 크기 규칙

##### 6.2.1 목적

* 내용이 짧은 노드는 작게, 내용이 어느 정도 있는 노드는 적절히 크게 표시한다.
* 단, 노드가 무한정 커져서 레이아웃을 붕괴시키지 않도록 제한한다.

##### 6.2.2 기본 정책

* width와 height는 content를 기반으로 자동 계산한다.
* 최소 크기와 최대 크기를 가진다.
* 최대 크기를 초과하는 경우 overflow 정책으로 넘긴다.

##### 6.2.3 권장 기준

```txt
min-width: 120px
default-width-range: 160px ~ 320px
max-width: 360px ~ 420px

min-height: 40px
auto-height: content 기반 증가
max-height: overflow 정책 전환 기준으로 사용
```

##### 6.2.4 동작 순서

1. content 길이와 구조를 분석한다.
2. 예상 줄 수와 요소 수(문단, 리스트, 링크, 첨부 등)를 반영한다.
3. 적절한 width를 계산한다.
4. 해당 width에서 필요한 height를 계산한다.
5. max-height를 넘기면 overflow 상태로 전환한다.

##### 6.2.5 상세 규칙

* 짧은 단일 텍스트는 한 줄 또는 두 줄 안에서 보이도록 한다.
* 긴 단어, 긴 URL, 긴 파일명이 있어도 max-width를 넘지 않도록 한다.
* markdown node는 읽기 가독성을 위해 width를 어느 정도 넉넉히 허용한다.
* code node는 한 줄이 길더라도 width를 과도하게 늘리지 않는다.
* node 확장으로 sibling 간격이 지나치게 벌어지지 않도록 한다.

##### 6.2.6 사례

사례 A: 짧은 노드

```txt
에버그린복지재단
```

* 작고 단정한 노드
* 1줄 표시 가능
* width 최소~중간 수준

사례 B: 긴 명칭

```txt
서울시장애인직업재활시설협회
```

* 글자가 길므로 width 자동 증가
* max-width 안에서 1~2줄 처리

사례 C: 설명 포함 노드

```md
장애인보호작업장(뜰레랑스)
http://tolerance.co.kr/
2026년 1차 추가경정 예산
```

* width 자동 증가
* height도 2~4줄 수준으로 증가
* 기준 초과 시 overflow 전환

##### 6.2.7 금지 규칙

* content 길이에 따라 width가 무제한으로 커지는 방식 금지
* 특정 노드 하나가 화면 대부분을 차지하도록 확장되는 방식 금지
* zoom out 상태에서 full-size를 강제로 유지하는 방식 금지

---

#### 6.3 NR-04 줄바꿈 처리 규칙

##### 6.3.1 목적

* 정해진 node 폭 안에서 텍스트를 읽기 좋게 배치한다.
* 자동 줄바꿈과 수동 줄바꿈을 모두 지원한다.
* markdown/text와 code의 특성 차이를 반영한다.

##### 6.3.2 기본 정책

* markdown/text node는 가독성 중심 줄바꿈을 적용한다.
* code node는 원문 보존을 우선하고 자동 줄바꿈은 보조 정책으로만 사용한다.
* 사용자 수동 줄바꿈은 항상 보존한다.

##### 6.3.3 markdown/text 규칙

* 기본적으로 자동 줄바꿈을 적용한다.
* 긴 단어 또는 공백 없는 긴 문자열은 break-word 계열 정책을 적용할 수 있다.
* 수동 줄바꿈은 표시 결과에 반영한다.
* markdown 리스트는 항목 단위로 줄을 구성한다.

권장 CSS 성격:

```txt
white-space: pre-wrap 또는 normal + manual line break preserve
overflow-wrap: break-word
word-break: normal 또는 필요 시 break-word 보조
```

##### 6.3.4 code 규칙

* code는 기본적으로 한 줄 단위를 유지한다.
* 공백/들여쓰기/개행을 보존한다.
* 자동 줄바꿈은 기본 비활성 또는 옵션 처리한다.
* 긴 한 줄은 가로 스크롤 또는 overflow 접기 정책을 우선 적용한다.

권장 CSS 성격:

```txt
white-space: pre
overflow-x: auto
```

##### 6.3.5 수동 줄바꿈 규칙

* 사용자가 Enter로 입력한 줄바꿈은 렌더링에 반영한다.
* 자동 줄바꿈과 수동 줄바꿈은 함께 공존한다.
* 사용자가 의도적으로 줄을 나눈 경우, 시스템은 이를 임의로 한 줄로 합치지 않는다.

예:

```txt
서울시장애인직업재활시설
협회
```

* 사용자가 의도한 2줄 구조 유지

##### 6.3.6 리스트 규칙

* node 내부 markdown 리스트를 지원한다.
* 리스트는 별도 child node가 아니라 content 내부 표현이다.
* 목록이 짧으면 그대로 표시하고, 너무 길면 overflow 정책으로 일부 축약할 수 있다.

예:

```md
- 장애인보호작업장
- 주간재활시설
- 노인복지사업
```

##### 6.3.7 사례

사례 A: 긴 일반 문장

```txt
에버그린복지재단 산하시설 운영 현황 및 외부 연계 자료 정리
```

* node 폭 안에서 자동 줄바꿈

사례 B: 긴 URL

```txt
https://egreen.org/very/long/path/to/document/2026/final/report
```

* 박스 밖으로 튀어나가지 않도록 break-word 허용

사례 C: code node

```bash
sudo apt install apache2 certbot python3-certbot-apache -y
```

* 자동 줄바꿈보다 원문 유지 우선
* 필요 시 가로 스크롤

##### 6.3.8 금지 규칙

* markdown/text와 code를 동일한 줄바꿈 규칙으로 처리하는 방식 금지
* 사용자가 입력한 수동 줄바꿈을 제거하는 방식 금지
* 긴 URL 때문에 노드가 옆 노드를 침범하도록 방치하는 방식 금지

---

#### 6.4 NR-05 overflow 제어 규칙

##### 6.4.1 목적

* 자동 크기와 줄바꿈을 적용한 뒤에도 내용이 지나치게 많을 경우 구조 가독성을 유지한다.
* node가 문서 카드처럼 비대해지는 것을 방지한다.
* 필요한 경우 사용자가 펼쳐서 전체 내용을 볼 수 있게 한다.

##### 6.4.2 기본 정책

* overflow는 “숨김”이 아니라 “단계적 표시”다.
* 일정 기준을 넘으면 collapse 상태로 렌더링한다.
* 사용자는 expand를 통해 전체 내용을 볼 수 있다.
* expand/collapse 상태 변경 시 subtree relayout이 가능해야 한다.

##### 6.4.3 overflow 판정 기준

다음 조건 중 하나 이상 만족 시 overflow 상태로 판단할 수 있다.

```txt
- 렌더링 줄 수 > 6줄
- 계산된 높이 > 180px ~ 220px
- 리스트 항목 수 > 5개
- 첨부/링크/보조요소 포함 후 시각 밀도 과다
- code line 수 > 8줄
- 단일 code line 길이가 가로 폭 기준 초과
```

##### 6.4.4 collapse 정책

* 핵심 내용만 우선 보여준다.
* 나머지는 “...” 또는 “더보기” 표시로 축약한다.
* markdown node는 상단 의미 정보가 남도록 축약한다.
* code node는 초반 몇 줄 또는 첫 줄 중심으로 축약한다.

예:

```txt
장애인직업재활시설
이 시설은 장애인의 직업 능력 향상과 사회 적응을 지원하며...
[더보기]
```

##### 6.4.5 expand 정책

* 사용자가 클릭 또는 명령으로 전체 내용을 펼칠 수 있다.
* 펼침 후 node height가 증가할 수 있다.
* 필요 시 해당 subtree만 부분 relayout 한다.
* 전체 캔버스를 강제로 다시 layout하지 않고 partial relayout을 우선한다.

##### 6.4.6 node_type별 정책

###### markdown/text node

* 줄 수 기준 collapse 우선
* 긴 문단은 앞부분 요약 표시
* 리스트는 앞 몇 개 항목만 표시하고 나머지는 축약 가능

###### code node

* 원문 구조를 유지한다.
* 긴 코드/명령은 세로 접기 또는 가로 스크롤 중 하나를 선택
* 기본적으로 의미가 깨지는 임의 줄바꿈보다 scroll/collapse를 우선 고려한다.

##### 6.4.7 사례

사례 A: 긴 설명형 노드

```md
장애인직업재활시설

이 시설은 장애인의 직업 능력 향상과 사회 적응을 지원하며,
직무 훈련, 보호 고용, 사례 관리, 가족 상담, 복지 서비스 연계,
지역사회 네트워크 운영 등을 수행한다.
또한 연간 사업계획, 예산, 평가, 외부기관 협력 업무까지 포함한다.
```

* 처음 2~4줄만 표시
* 나머지는 더보기

사례 B: 긴 목록 노드

```md
산하시설
- 장애인보호작업장
- 주간재활시설
- 노인복지사업
- 법인사무국
- 추가시설A
- 추가시설B
```

* 처음 몇 개 항목만 표시
* `+N more` 또는 더보기 가능

사례 C: 긴 code node

```bash
find /var/log -type f -name "*.log" -mtime -30 -exec grep -H "ERROR" {} \; | sort | uniq
```

* 원문 유지
* 자동 줄바꿈보다 가로 스크롤 또는 접힘 우선

##### 6.4.8 금지 규칙

* overflow 상태인데도 전체 내용을 전부 렌더링하여 node가 비정상적으로 커지는 방식 금지
* code node를 일반 문장처럼 임의 분절하는 방식 금지
* collapse 기준이 없는 감각적 구현 금지
* expand 시 relayout 없이 겹침만 발생하는 구현 금지

---

#### 6.5 NR-03 / NR-04 / NR-05 적용 순서 규칙

세 정책은 다음 순서로 적용한다.

1. 자동 크기 후보 계산
2. 줄바꿈 적용
3. 최종 height 재계산
4. overflow 판정
5. collapse/expand 상태 반영
6. layout engine에 최종 bounding box 전달

즉:

* 자동 크기가 먼저
* 줄바꿈이 그 다음
* overflow는 마지막 안전장치

---

#### 6.6 NR-06 zoom 대응 규칙

##### 6.6.1 목적

* map zoom에 따라 node와 text가 단순 확대/축소되는 것을 넘어서,
  정보량 자체를 조절한다.
* 사용자가 zoom out 할 때는 텍스트를 읽으려는 것이 아니라 구조를 파악하려는 경우가 많으므로,
  정보 밀도를 제어한다.

##### 6.6.2 핵심 원칙

* zoom은 단순 scale이 아니다.
* zoom은 **scale + LOD(Level of Detail)** 이다.

##### 6.6.3 레벨별 정책 예시

| zoom level | 표시 정책             |
| ---------- | ----------------- |
| 100% 이상    | full content 표시   |
| 70% ~ 100% | 일부 내용 축약 가능       |
| 40% ~ 70%  | 첫 줄/핵심 부분 위주 표시   |
| 40% 미만     | 텍스트 최소화, 구조 중심 표시 |

##### 6.6.4 추가 규칙

* zoom out 시 overflow 기준을 더 엄격하게 적용할 수 있다.
* zoom in 시 생략되었던 내용은 복원 가능해야 한다.
* LOD 단계가 바뀌면 subtree relayout 또는 re-measure가 필요할 수 있다.

---

### 7. 예외 / 경계 (Edge Case)

#### 7.1 빈 내용

* content가 비어 있으면 placeholder 또는 최소 높이 노드 표시
* 완전 공백 node는 렌더링 가능하되 과도한 공간을 차지하지 않게 한다

#### 7.2 공백 없는 긴 문자열

* 긴 URL, 긴 파일명, 긴 식별자는 break-word 또는 overflow 정책 적용
* 노드 밖으로 튀어나가면 안 된다

#### 7.3 매우 긴 markdown

* 지나치게 긴 문단/리스트/표는 collapse 우선
* node 내부에서 문서 전체를 읽게 만드는 방식 금지

#### 7.4 매우 긴 code

* 자동 줄바꿈보다 원문 유지 우선
* 스크롤/접힘/전체보기 제공 가능

#### 7.5 첨부/아이콘/링크가 많은 경우

* 보조요소 때문에 content 본문이 밀려 구조가 깨지지 않게 한다
* accessory 영역이 지나치게 커지면 별도 요약 표시 고려

#### 7.6 협업 중 상태 변경

* 다른 사용자가 expand/collapse를 변경했을 때 반영 범위를 정책으로 정의해야 한다
* 개인 뷰 상태인지 문서 상태인지 별도 기능에서 정해야 한다

#### 7.7 zoom out 극단 상태

* 글자까지 무조건 축소하여 unreadable 상태로 두지 않는다
* 구조 가독성 우선 정책 적용

---

### 8. 성능 규칙

* viewport 밖 노드는 단순화 렌더링 또는 culling 적용
* 매우 긴 markdown은 lazy render 가능
* code syntax highlight는 지연 적용 가능
* expand/collapse는 전체 캔버스 full relayout보다 partial relayout 우선
* zoom 변경 시 모든 노드를 full render하지 않고 LOD 단계별 최적화 가능

---

### 9. 권한 규칙

* viewer:

  * 렌더링 결과 보기 가능
  * 허용 정책에 따라 expand/collapse 가능
* editor:

  * edit mode 전환 가능
  * 렌더링 상태 확인 가능
* creator:

  * 전체 동작 가능

---

### 10. DB 영향

직접 저장보다 상태 계산 성격이 강하다. 다만 다음 상태는 저장 여부를 정책으로 선택할 수 있다.

#### 저장 가능 상태

* is_collapsed
* preferred_render_mode
* last_expanded_at
* node_view_state (개인별 상태로 분리 가능)

#### 비저장 계산값

* measured_width
* measured_height
* visible_line_count
* overflow_detected
* lod_level

---

### 11. API 영향

기본 렌더링 자체는 프론트엔드 책임이 크지만, 다음 상태 동기화 API는 고려 가능하다.

* PATCH /nodes/{id}/view-state
* PATCH /nodes/{id}/collapse
* PATCH /nodes/{id}/expand

응답 예시:

```json
{
  "node_id": "n123",
  "is_collapsed": true
}
```

---

### 12. 연관 기능

* NODE_CONTENT
* NODE_STYLE
* LAYOUT
* CANVAS
* SAVE
* VERSION_HISTORY
* MAP COLLABORATION

---

### 13. 예시 시나리오

#### 시나리오 1: 짧은 일반 노드

내용:

```txt
에버그린복지재단
```

동작:

* width 최소~중간 수준
* 한 줄 표시
* overflow 없음

#### 시나리오 2: URL 포함 노드

내용:

```txt
https://egreen.org/very/long/path/to/report/final
```

동작:

* width는 max-width 이내로 제한
* 줄바꿈 또는 break-word 적용
* 박스 밖으로 넘치지 않음

#### 시나리오 3: 긴 설명 노드

내용:

```md
장애인직업재활시설

이 시설은 장애인의 직업 능력 향상과 사회 적응을 지원하며...
```

동작:

* auto height 증가
* 일정 줄 수 초과 시 collapse
* 사용자는 더보기로 펼침 가능

#### 시나리오 4: 리스트 노드

내용:

```md
산하시설
- 장애인보호작업장
- 주간재활시설
- 노인복지사업
- 법인사무국
- 추가시설A
```

동작:

* 리스트 항목 렌더링
* 너무 길면 일부 축약
* 전체 구조 가독성 유지

#### 시나리오 5: code node

내용:

```bash
sudo apt install apache2 certbot python3-certbot-apache -y
```

동작:

* monospace
* copy 버튼
* 자동 줄바꿈보다 원문 보존 우선
* 필요 시 가로 스크롤

#### 시나리오 6: zoom out

동작:

* 100%에서는 full content
* 70% 이하에서는 일부 내용 축약
* 40% 이하에서는 구조 중심 표시
* 사용자는 맵 구조를 더 쉽게 파악

---

### 14. 구현 우선순위

#### MVP

* markdown/code 기본 렌더링
* auto size 기본 계산
* markdown 자동 줄바꿈
* 수동 줄바꿈 반영
* overflow collapse/expand 기본 지원
* zoom 시 단순 scale + 1단계 축약

#### 2단계

* 리스트/링크/첨부 요소 정교화
* code node scroll/collapse 세분화
* partial relayout 최적화
* zoom 기반 LOD 다단계 구현

#### 3단계

* 개인별 view state
* 협업 중 collapse 상태 동기화 정책
* 고급 render profile
* 고밀도 대형 맵 렌더링 최적화

```

---

## 좌표 시스템 완전 정의

easymindmap은 세 가지 좌표계를 명확히 구분한다.

| 좌표계 | 이름 | 설명 | 저장 여부 |
|--------|------|------|-----------|
| World 좌표 | `computedX / computedY` | Layout Engine이 계산한 노드의 논리적 위치 | 런타임만 |
| Manual 좌표 | `manualPosition.x / .y` | freeform 레이아웃 전용, 사용자가 drag한 위치 | DB 저장 |
| Screen 좌표 | `screenX / screenY` | 브라우저 픽셀 좌표 (렌더링에 사용) | 매 프레임 계산 |

**World 원점 (0, 0):** 루트 노드의 중심, 캔버스 중앙이 기본 표시 기준점, Y축 아래 방향이 양수.  
**Screen 원점 (0, 0):** 브라우저 뷰포트의 좌상단, Y축 아래 방향이 양수.

### World → Screen 변환 (렌더링 시)

```
screenX = worldX × zoom + panX
screenY = worldY × zoom + panY
```

### Screen → World 역변환 (마우스 → 월드)

```
worldX = (screenX - panX) / zoom
worldY = (screenY - panY) / zoom
```

TypeScript 구현:

```typescript
interface ViewportState {
  zoom: number;   // 기본값: 1.0, 범위: 0.1 ~ 4.0
  panX: number;   // 뷰포트 X 이동량 (픽셀)
  panY: number;   // 뷰포트 Y 이동량 (픽셀)
  width: number;  // 캔버스 요소의 실제 픽셀 너비
  height: number; // 캔버스 요소의 실제 픽셀 높이
}

function worldToScreen(worldX: number, worldY: number, viewport: ViewportState) {
  return {
    x: worldX * viewport.zoom + viewport.panX,
    y: worldY * viewport.zoom + viewport.panY,
  };
}

function screenToWorld(screenX: number, screenY: number, viewport: ViewportState) {
  return {
    x: (screenX - viewport.panX) / viewport.zoom,
    y: (screenY - viewport.panY) / viewport.zoom,
  };
}
```

### CSS Transform 적용 방법

캔버스 컨테이너에 단일 `transform`을 적용하여 모든 자식 요소가 동일한 변환을 받는다.

```typescript
const canvasStyle: React.CSSProperties = {
  transform: `translate(${panX}px, ${panY}px) scale(${zoom})`,
  transformOrigin: '0 0',  // 원점 고정: 좌상단
};
```

> `transformOrigin: '0 0'`으로 설정해야 위 공식의 `panX`, `panY`가 정확히 적용된다.  
> 기본값 `transformOrigin: '50% 50%'`은 공식과 다른 offset이 필요하므로 사용하지 않는다.

---

## Zoom-to-Point 알고리즘

마우스 휠 줌 시, 커서 위치를 기준으로 줌해야 뷰포트가 자연스럽게 유지된다.

```typescript
function zoomToPoint(
  viewport: ViewportState,
  newZoom: number,
  cursorScreenX: number,
  cursorScreenY: number
): Pick<ViewportState, 'zoom' | 'panX' | 'panY'> {
  const zoomRatio = newZoom / viewport.zoom;

  return {
    zoom: newZoom,
    // 커서 위치가 변하지 않도록 pan 보정
    panX: cursorScreenX - zoomRatio * (cursorScreenX - viewport.panX),
    panY: cursorScreenY - zoomRatio * (cursorScreenY - viewport.panY),
  };
}
```

수학적 도출 (Pan 보정 계산):

```
// 줌 전 커서의 world 좌표 (불변이어야 함)
worldCursorX = (cursorScreenX - panX) / zoom

// 줌 후 같은 world 좌표가 같은 screen 위치에 있으려면:
cursorScreenX = worldCursorX * newZoom + newPanX

// 풀면:
newPanX = cursorScreenX - worldCursorX * newZoom
        = cursorScreenX - ((cursorScreenX - panX) / zoom) * newZoom
        = cursorScreenX - (newZoom / zoom) * (cursorScreenX - panX)
```

---

## Fit-to-Screen 알고리즘

전체 맵을 화면에 맞추는 알고리즘. padding 기본값 60px, scale은 X/Y 중 작은 값을 사용하며 최대 4.0으로 제한한다.

```typescript
function fitToScreen(
  worldBounds: BoundingBox,  // 전체 노드의 world 좌표 bounding box
  viewport: ViewportState,
  padding: number = 60
): Pick<ViewportState, 'zoom' | 'panX' | 'panY'> {
  const scaleX = (viewport.width  - padding * 2) / worldBounds.width;
  const scaleY = (viewport.height - padding * 2) / worldBounds.height;
  const newZoom = Math.min(scaleX, scaleY, 4.0);  // 최대 4배로 제한

  // 맵 중심이 뷰포트 중앙에 오도록 pan 계산
  const worldCenterX = worldBounds.x + worldBounds.width  / 2;
  const worldCenterY = worldBounds.y + worldBounds.height / 2;

  return {
    zoom: newZoom,
    panX: viewport.width  / 2 - worldCenterX * newZoom,
    panY: viewport.height / 2 - worldCenterY * newZoom,
  };
}
```

---

## 뷰포트 컬링 (Viewport Culling)

현재 화면(viewport)에 포함된 노드만 렌더링하여 DOM/SVG 요소 수를 최소화한다.

AABB(Axis-Aligned Bounding Box) intersection test로 노드 가시성을 판단하며, 200px margin buffer를 추가해 스크롤 시 깜빡임을 방지한다.

```typescript
function isNodeVisible(node: LayoutNode, viewport: ViewportState): boolean {
  const { zoom, panX, panY, width, height } = viewport;
  const margin = 200; // 깜빡임 방지 버퍼

  // world 좌표 → screen 좌표 변환
  const screenX = node.computedX * zoom + panX;
  const screenY = node.computedY * zoom + panY;
  const screenW = node.width * zoom;
  const screenH = node.height * zoom;

  // 뷰포트 경계와 AABB 교차 검사 (margin 포함)
  return (
    screenX + screenW >= -margin &&
    screenY + screenH >= -margin &&
    screenX <= width  + margin &&
    screenY <= height + margin
  );
}
```

- Viewport Store의 `worldBounds`를 기준으로 필터링
- margin buffer(200px)를 추가해 스크롤 시 깜빡임 방지

---

## Partial Relayout

변경된 subtree만 재계산하여 CPU 연산을 절감한다.

| 트리거 | 처리 범위 |
|--------|-----------|
| 텍스트 변경 | 해당 노드 크기 재측정 → 부모 방향으로 bounding-box 전파 |
| 구조 변경 (자식 추가/삭제) | 해당 subtree root부터 재계산 |
| 전체 맵 relayout | 최초 로드 및 레이아웃 타입 변경 시에만 실행 |

- expand/collapse 상태 변경 시에도 subtree relayout을 수행하며, 전체 캔버스 full relayout은 피한다.

---

## 렌더링 방식 비교

| 단계 | 방식 | 이유 |
|------|------|------|
| MVP | SVG (edges) + HTML (node content) | 구현 단순, CSS 스타일링 용이 |
| V2 이후 | Canvas (선택적 확장) | 10,000+ 노드 시 SVG 성능 한계 |

현재 목표: SVG + HTML 방식으로 1,000 노드 / 60fps 달성.

---

## 성능 목표치

| 지표 | 목표 |
|------|------|
| 초기 로딩 | ≤ 3초 (1,000 노드 기준) |
| 렌더링 프레임 | 60fps (1,000 노드) |
| 텍스트 편집 반응 | ≤ 16ms (1 프레임 이내) |
| 줌/팬 반응 | ≤ 16ms (CSS transform 기반) |
| Partial Relayout | ≤ 50ms (subtree 100노드 기준) |

---

## Debounce 타이밍

| 트리거 유형 | debounce 시간 | 이유 |
|-------------|---------------|------|
| 텍스트 입력 | 500–1,000ms | 타이핑 중 과도한 저장 방지 |
| 노드 drag 종료 | 즉시 (0ms) | 위치 확정 시 저장 |
| 구조 변경 (create/delete) | 즉시 (0ms) | 데이터 유실 방지 |
| 레이아웃 변경 | 즉시 (0ms) | 설정 변경 즉시 반영 |

---

## Edge Rendering Policy

### Orthogonal Edge

Radial 계열을 제외한 모든 layoutType은 orthogonal edge를 사용한다.

Orthogonal edge는 3-segment path를 기본으로 한다.

```svg
M x1,y1 L midX,y1 L midX,y2 L x2,y2
```

#### midX 계산 규칙

```text
midX = (parentAnchorX + childAnchorX) / 2
```

단, 부모와 자식의 거리가 너무 가까운 경우 선이 노드와 겹칠 수 있으므로 최소 수평 거리 기준을 둔다.

```text
minHorizontalLength = 20px
```

부모-자식 간 수평 거리가 `20px` 미만이면, edge anchor offset을 적용하여 노드 경계와 선이 겹치지 않게 한다.

### Curve Edge

Radial 계열 layoutType은 cubic bezier curve를 사용한다.

```svg
M x1,y1 C cp1x,cp1y cp2x,cp2y x2,y2
```

Control Point는 부모-자식 방향각(theta)과 거리(distance)를 기준으로 계산한다.

```text
cp1 = parentAnchor + directionVector(theta) * controlDistance
cp2 = childAnchor - directionVector(theta) * controlDistance
```

기본 controlDistance는 부모-자식 거리의 30~40% 범위에서 계산한다.

> **핵심 규칙**: SVG path 규칙을 명시적으로 정의함으로써 개발자별 구현 편차(ㄱ자/Z자/┐자 등)를 방지한다.  
> Edge path 계산값은 DB에 저장하지 않으며, 렌더링 시마다 노드 위치와 layoutType을 기준으로 재계산한다.
