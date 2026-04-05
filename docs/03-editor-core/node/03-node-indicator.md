# 03. Node Indicator
## NODE_INDICATOR
- 문서 버전: v1.0
- 작성일: 2026-04-05

### 1. 기능 목적
- 사용자가 노드에 상태, 의미, 진행도, 중요도, 경고, 체크 여부 등을 빠르게 시각적으로 표현할 수 있도록 한다.
- 긴 문장을 읽지 않아도 노드의 상태를 한눈에 파악할 수 있도록 하여 맵의 가독성과 업무 효율을 높인다.
- 개인 맵, 협업 맵, 프로젝트성 맵, WBS, 업무 관리 맵 등에서 공통으로 활용 가능한 “경량 상태 표현 수단”을 제공한다.

### 2. 기능 범위
- 포함:
  - 노드에 아이콘/마커/배지/상태 표시 추가
  - 우선순위 표시
  - 진행 상태 표시
  - 완료/체크 표시
  - 경고/주의/중요 표시
  - 감정/의사결정/의미 구분용 심볼 표시
  - 노드에 여러 indicator를 동시에 부여하는 기능
  - indicator 표시 위치, 순서, 노출 정책
  - 필터/검색/요약에서 indicator 기반 활용
- 제외:
  - 노드 본문 텍스트 수정 → NODE_CONTENT
  - 폰트, 배경색, 선색, 모양 등 스타일 자체 → NODE_STYLE
  - 노드 구조 변경 → NODE_EDITING
  - 태그 기반 분류 체계 → TAG
  - 칸반 카드의 업무 상태 보드 로직 → KANBAN
  - 번역 표시 자체 → NODE_TRANSLATION

### 3. 세부 기능 목록
| 기능ID | 기능명 | 설명 | 주요 동작 |
|---|---|---|---|
| NI-001 | 기본 인디케이터 추가 | 노드에 아이콘/배지 추가 | 메뉴, 툴바, 단축 조작 |
| NI-002 | 우선순위 표시 | 높음/중간/낮음 등 중요도 표현 | priority icon/badge |
| NI-003 | 진행상태 표시 | 예정/진행중/보류/완료 등 상태 표시 | status selection |
| NI-004 | 완료 체크 표시 | 체크 완료 여부 표현 | checkbox/tick marker |
| NI-005 | 경고 표시 | 위험, 주의, 이슈, 차단 상태 표현 | warning marker |
| NI-006 | 의미 심볼 표시 | 질문, 아이디어, 결정, 참고 등 의미 구분 | semantic icons |
| NI-007 | 다중 인디케이터 지원 | 한 노드에 여러 indicator 동시 부여 | add/remove stack |
| NI-008 | 인디케이터 제거/교체 | 기존 indicator 삭제 또는 다른 값으로 변경 | replace/remove |
| NI-009 | 표시 순서 규칙 | 여러 indicator가 있을 때 렌더 순서 제어 | display priority |
| NI-010 | 필터 연동 | 특정 indicator가 있는 노드만 보기 | filter/search |
| NI-011 | 요약/집계 연동 | indicator 기준 통계/현황 집계 | count by status |
| NI-012 | 협업 동기화 | indicator 변경을 실시간 협업에 반영 | realtime sync |

### 4. 기능 정의 (What)
- NODE_INDICATOR는 노드에 부가적인 상태 정보를 “텍스트 외의 시각 요소”로 표시하는 기능이다.
- indicator는 노드 제목 자체를 바꾸지 않고, 노드의 의미를 보강하는 메타 표현 수단이다.
- indicator는 아이콘, 뱃지, 체크마크, 상태값, 우선순위값, 경고 표시 등 다양한 형태를 포함한다.
- 하나의 노드는 0개 이상의 indicator를 가질 수 있다.
- indicator는 업무 관리용일 수도 있고, 의미 구분용일 수도 있으며, 필터/검색/집계의 기준으로도 사용될 수 있다.
- indicator는 태그(tag)와 다르다.
  - tag는 검색/분류 중심의 키워드형 메타데이터
  - indicator는 빠른 시각 식별 중심의 상태/표현 메타데이터
- indicator는 스타일이 아니라 의미 데이터이므로 DB 저장 및 협업 동기화 대상이다.

### 5. 동작 방식 (How)

#### 5.1 사용자 동작
- 사용자는 노드를 선택한 뒤 인디케이터 메뉴를 연다.
- 미리 정의된 indicator 세트 중 원하는 항목을 선택한다.
- 하나의 indicator를 추가하거나, 기존 indicator를 교체하거나, 제거할 수 있다.
- 사용자는 같은 노드에 여러 종류의 indicator를 동시에 부여할 수 있다.
- 예:
  - 우선순위: 높음
  - 상태: 진행중
  - 경고: 주의
  - 완료 체크: 미완료
- 필터 패널에서 “완료된 노드만 보기”, “경고 표시 있는 노드만 보기” 같은 조건 검색이 가능할 수 있다.

#### 5.2 시스템 처리
- indicator 추가 시:
  - indicator type과 value를 검증한다.
  - 허용된 enum 값인지 확인한다.
  - 중복 허용 여부를 검사한다.
  - 노드 메타데이터에 저장한다.
  - undo/redo 이력에 기록한다.
  - autosave 및 협업 이벤트를 발생시킨다.
- indicator 변경 시:
  - 단일 선택형인지 다중 허용형인지 규칙을 적용한다.
  - 같은 type의 기존 indicator가 있으면 교체하거나 추가를 차단한다.
- indicator 제거 시:
  - 해당 indicator만 삭제하고 노드 본문이나 구조는 변경하지 않는다.
- 표시 시:
  - 렌더링 엔진은 노드 제목 앞/뒤/상단/우측 등 정해진 규칙에 따라 indicator를 배치한다.
  - 여러 indicator가 있을 경우 overflow 처리 규칙을 적용한다.

#### 5.3 결과 표시
- 노드 옆 또는 노드 내부에 indicator가 즉시 시각적으로 표시된다.
- 같은 type의 indicator는 일관된 위치와 모양으로 표시되어야 한다.
- 사용자는 텍스트를 열어보지 않아도 상태를 대략 이해할 수 있어야 한다.
- 협업 중 다른 사용자가 indicator를 바꾸면 화면에 실시간 반영된다.
- 검색/필터/요약 기능에서 indicator 기준 분류 결과가 반영된다.

### 6. 규칙 (Rule)

#### 6.1 기본 규칙
- indicator는 노드의 보조 메타정보이다.
- indicator 변경은 노드 내용(title/note) 변경이 아니다.
- indicator는 저장 대상이며 협업 동기화 대상이다.
- indicator는 미리 정의된 종류(type)와 값(value) 체계를 따라야 한다.

#### 6.2 인디케이터 타입 규칙
- indicator는 최소한 아래와 같은 타입 구분을 가질 수 있다.
  - priority
  - status
  - progress
  - check
  - warning
  - semantic
- 타입별로 값 체계가 다를 수 있다.
  - priority: high / medium / low
  - status: todo / doing / blocked / done
  - check: checked / unchecked
  - warning: warning / danger / issue
  - semantic: question / idea / decision / reference

#### 6.3 단일 선택 / 다중 선택 규칙
- 같은 타입 내 값은 기본적으로 1개만 허용한다.
  - 예: priority는 동시에 high와 low를 함께 가질 수 없다.
- 서로 다른 타입은 동시에 여러 개 허용 가능하다.
  - 예: priority=high + status=doing + warning=warning 은 가능
- semantic 타입은 정책에 따라 1개 또는 다중 허용을 정할 수 있다.
- MVP에서는 “같은 type은 1개만 허용, type 간 복수 허용”을 권장한다.

#### 6.4 표시 규칙
- indicator는 노드 레이아웃을 과도하게 깨뜨리지 않아야 한다.
- 너무 많은 indicator가 붙을 경우 축약 또는 overflow 처리 규칙이 필요하다.
- 표시 순서는 고정되어야 한다. 권장 순서 예:
  1. check
  2. priority
  3. status
  4. warning
  5. semantic
- 동일 맵 내에서는 같은 indicator type/value가 항상 같은 아이콘/배지 형태를 사용해야 한다.

#### 6.5 편집 규칙
- 사용자는 허용 권한이 있는 경우에만 indicator를 추가/수정/삭제할 수 있다.
- indicator 변경은 undo/redo 가능해야 한다.
- indicator는 배치 수정이 가능할 수 있으나, MVP에서는 노드 단건 편집 우선으로 한다.
- indicator는 텍스트 편집 모드와 충돌하지 않도록 별도 UI 트리거를 가져야 한다.

#### 6.6 필터 및 집계 규칙
- indicator는 검색과 필터의 기준이 될 수 있다.
- 상태형 indicator는 대시보드/WBS/KANBAN 등 다른 기능과 연결될 수 있다.
- 단, indicator와 업무 데이터의 진실 원천(source of truth)이 다를 경우 우선순위를 정해야 한다.
- MVP 단계에서는 indicator를 시각 상태 메타로 사용하고, 실제 업무 스케줄/리소스 관리와는 느슨하게 연결하는 것이 안전하다.

#### 6.7 협업 규칙
- 협업 중 indicator 변경은 실시간 반영되어야 한다.
- 같은 노드의 같은 indicator type을 두 사용자가 동시에 바꾸면 충돌 가능성이 있다.
- MVP에서는 last-write-wins를 기본 정책으로 한다.
- 충돌이 잦은 경우 나중에 변경 로그/알림을 보여주는 방식으로 고도화할 수 있다.

### 7. 예외 / 경계 (Edge Case)

#### 7.1 빈 값 / 누락 값
- indicator type 없이 저장 요청
- indicator value 없이 저장 요청
- 삭제 요청인데 어떤 indicator를 지울지 정보가 없음
- 클라이언트가 오래된 indicator schema로 요청을 보냄

#### 7.2 최소값 / 최대값
- 한 노드에 indicator가 지나치게 많이 붙는 경우
- 표시 가능한 너비를 초과하는 경우
- 모바일/축소 화면에서 indicator가 제목을 가리는 경우
- 필터 대상 indicator 수가 매우 많은 경우

#### 7.3 중복 상황
- 같은 type/value indicator를 같은 노드에 중복 추가
- 같은 type인데 다른 value를 연속 선택
- 빠른 더블클릭으로 같은 indicator가 두 번 반영되는 경우

#### 7.4 권한 없음
- viewer가 indicator 추가/수정/삭제 시도
- publish 전용 viewer 화면에서 indicator 편집 시도
- 편집 권한이 없는 협업 사용자가 상태 변경 시도

#### 7.5 존재하지 않음 / 삭제됨
- 이미 삭제된 노드에 indicator 수정 요청
- 정의되지 않은 indicator type을 참조
- 설정에서 제거된 indicator preset을 기존 데이터가 참조
- 맵 버전 복원 후 더 이상 없는 indicator 값을 클라이언트가 보여주는 경우

#### 7.6 충돌 상황
- 사용자 A는 priority를 high로 변경, 사용자 B는 low로 변경
- 사용자 A는 status를 done으로 변경, 사용자 B는 노드 전체를 삭제
- 사용자 A는 indicator를 제거, 사용자 B는 같은 indicator를 다른 값으로 교체
- 필터 화면이 열린 상태에서 다른 사용자가 indicator를 바꿔 필터 결과가 즉시 달라지는 경우

#### 7.7 네트워크 / 시스템 장애
- indicator 변경 후 autosave 실패
- 협업 이벤트 누락으로 다른 사용자 화면과 불일치
- 아이콘 preset 로딩 실패
- 클라이언트 렌더 오류로 indicator만 보이지 않는 경우

#### 7.8 기능상 금지 대상
- 허용되지 않은 커스텀 스크립트성 icon 삽입 금지
- 보안상 위험한 외부 리소스 URL 기반 indicator 금지
- 시스템 정의에 없는 임의 indicator 타입 저장 금지
- 잠금 상태 노드의 indicator 편집 금지

### 8. 권한 규칙
- creator:
  - 모든 indicator 추가/수정/삭제 가능
  - 맵 단위 indicator preset 정책 설정 가능
- editor:
  - 권한이 허용된 범위 내에서 indicator 추가/수정/삭제 가능
  - 시스템 또는 맵 소유자가 정한 preset만 사용 가능
- viewer:
  - indicator 조회만 가능
  - 개인 뷰용 강조 표시를 별도 제공할 수는 있으나 공용 데이터 저장은 불가

### 9. DB 영향
- 관련 테이블:
  - map_nodes
  - map_node_indicators
  - indicator_presets
  - map_history / map_operations
- 생성/수정/삭제 컬럼 예시:
  - map_node_indicators.id
  - map_node_indicators.map_id
  - map_node_indicators.node_id
  - map_node_indicators.indicator_type
  - map_node_indicators.indicator_value
  - map_node_indicators.display_order
  - map_node_indicators.created_at
  - map_node_indicators.updated_at
  - map_node_indicators.created_by
  - map_node_indicators.updated_by

#### DB 처리 원칙
- indicator는 노드의 다중 메타정보이므로 별도 정규화 테이블로 관리하는 것이 유리하다.
- 단순 체크 여부 정도만 저장할 경우 map_nodes 내부 컬럼화도 가능하지만,
  확장성을 고려하면 별도 테이블이 더 적합하다.
- 같은 node_id + indicator_type 조합의 unique 제약을 둘지 여부는 정책에 따라 결정한다.
- “같은 type은 1개만 허용” 정책이면 unique(node_id, indicator_type)가 유효하다.
- type별 다중 허용이 필요한 경우 unique 정책을 완화해야 한다.

### 10. API 영향
- 필요 API:
  - POST /maps/{mapId}/nodes/{nodeId}/indicators
  - PATCH /maps/{mapId}/nodes/{nodeId}/indicators/{indicatorId}
  - DELETE /maps/{mapId}/nodes/{nodeId}/indicators/{indicatorId}
  - GET /maps/{mapId}/indicator-presets
  - POST /maps/{mapId}/nodes/indicators/batch
- 주요 요청/응답 개요:

#### 10.1 인디케이터 추가
- 요청:
  - indicator_type
  - indicator_value
- 응답:
  - created indicator object
  - node summary
  - revision/version

#### 10.2 인디케이터 변경
- 요청:
  - indicator_value
  - display_order(optional)
- 응답:
  - updated indicator object
  - updated_at
  - revision/version

#### 10.3 인디케이터 삭제
- 요청:
  - indicatorId
- 응답:
  - deleted indicator id
  - node summary

#### 10.4 배치 수정
- 요청:
  - node_ids[]
  - operation(add/update/remove)
  - indicator_type
  - indicator_value
- 응답:
  - affected node count
  - changed indicator summary

### 11. 연관 기능
- NODE_EDITING
- NODE_CONTENT
- NODE_STYLE
- TAG
- SEARCH
- DASHBOARD
- WBS
- KANBAN
- HISTORY_UNDO_REDO
- SAVE
- MAP COLLABORATION
- SETTINGS

### 12. 예시 시나리오

#### 시나리오 1: 업무 상태 표시
- 사용자가 “DB 설계” 노드를 선택한다.
- 상태 indicator에서 “진행중”을 선택한다.
- 노드 옆에 진행중 배지가 보인다.
- 다른 협업 사용자도 같은 상태를 즉시 본다.

#### 시나리오 2: 우선순위와 경고 동시 표시
- 사용자가 “보안 점검” 노드에 priority=high, warning=warning 을 추가한다.
- 노드 옆에 높은 우선순위 표시와 경고 표시가 함께 보인다.
- 사용자는 긴 설명을 읽지 않아도 중요한 위험 항목임을 즉시 알 수 있다.

#### 시나리오 3: 완료 체크 처리
- 사용자가 작업을 끝낸 뒤 체크 indicator를 완료로 바꾼다.
- 노드에 완료 표시가 보이고, 필터에서 “완료 항목 제외”를 하면 화면에서 숨길 수 있다.

#### 시나리오 4: 중복 추가 차단
- 사용자가 이미 priority=high 가 있는 노드에 다시 priority=low 를 추가하려 한다.
- 시스템은 같은 type 중복 추가가 아니라 값 교체로 처리하거나, 정책에 따라 기존 값을 바꾸겠냐고 안내한다.
- 결과적으로 priority type은 하나만 유지된다.

### 13. 구현 우선순위
- MVP 포함:
  - 기본 indicator preset 제공
  - 노드별 indicator 추가/삭제
  - 같은 type 단일값 정책
  - 우선순위 / 상태 / 체크 / 경고 정도의 핵심 indicator 지원
  - 저장 / undo / 협업 동기화 연동
- 2차 단계:
  - 배치 수정
  - 사용자 정의 indicator preset
  - indicator 기반 필터/요약 고도화
  - 대시보드/WBS/KANBAN과 심화 연동
  - indicator 표시 커스터마이징
- 의존 기능:
  - NODE_EDITING
  - SAVE
  - HISTORY_UNDO_REDO
  - MAP COLLABORATION
- 후속 연계:
  - SEARCH
  - DASHBOARD
  - WBS
  - SETTINGS
