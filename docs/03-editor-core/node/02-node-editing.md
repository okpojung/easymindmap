# 02. Node Editing
## NODE_EDITING
- 문서 버전: v1.0
- 작성일: 2026-04-05

### 1. 기능 목적
- 사용자가 마인드맵의 노드를 생성, 수정, 삭제, 이동, 복제, 접기/펼치기 하여 맵의 구조와 내용을 실시간으로 편집할 수 있도록 한다.
- NODE_EDITING은 마인드맵 편집의 가장 핵심적인 기능으로, 다른 대부분의 기능(NODE_CONTENT, NODE_STYLE, LAYOUT, HISTORY_UNDO_REDO, SAVE, MAP COLLABORATION)의 기반이 된다.
- 단순 텍스트 수정만이 아니라, 트리 구조 변경과 부모-자식 관계 변경까지 포함하는 “구조 편집 기능”으로 정의한다.

### 2. 기능 범위
- 포함:
  - 루트 노드 생성 규칙
  - 일반 노드 추가
  - 형제 노드 추가
  - 자식 노드 추가
  - 노드 제목 수정
  - 노드 순서 변경
  - 부모 변경(재배치 / 드래그 이동)
  - 노드 삭제
  - 서브트리 삭제
  - 노드 복제
  - 접기 / 펼치기
  - 다중 선택 상태에서 일괄 이동 또는 삭제(후속 단계 일부 포함)
  - 수동 위치 조정이 허용되는 레이아웃에서의 노드 좌표 수정
- 제외:
  - 노드 내부의 상세 본문(note, code block, checklist 등) 편집 → NODE_CONTENT
  - 노드 색상, 폰트, 테두리, 아이콘 등 시각 스타일 편집 → NODE_STYLE / NODE_INDICATOR
  - 자동 정렬 알고리즘 자체 → LAYOUT
  - 칸반형 카드 편집 → KANBAN
  - AI가 노드 구조를 자동 생성/수정하는 흐름 → AI / AI_WORKFLOW
  - 번역 결과를 노드 텍스트에 반영하는 기능 → NODE_TRANSLATION

### 3. 세부 기능 목록
| 기능ID | 기능명 | 설명 | 주요 동작 |
|---|---|---|---|
| NE-001 | 루트 노드 생성 | 새 맵 생성 시 최초 루트 노드를 생성 | 새 맵 생성, 기본 제목 부여 |
| NE-002 | 자식 노드 추가 | 선택된 노드 아래에 자식 노드 추가 | Enter/Tab/버튼/컨텍스트 메뉴 |
| NE-003 | 형제 노드 추가 | 선택된 노드와 같은 부모 아래 형제 노드 추가 | 단축키, 메뉴, 툴바 |
| NE-004 | 노드 제목 편집 | 노드의 기본 텍스트(label/title) 수정 | 더블클릭, Enter, 인라인 편집 |
| NE-005 | 노드 삭제 | 단일 노드 또는 서브트리 삭제 | Delete, 메뉴 |
| NE-006 | 노드 이동 | 부모 변경 또는 형제 순서 변경 | Drag & Drop, 키보드 이동 |
| NE-007 | 노드 순서 변경 | 같은 부모 아래 정렬 순서 변경 | 앞/뒤 이동, drag reorder |
| NE-008 | 서브트리 이동 | 노드와 모든 자식을 함께 다른 위치로 이동 | 드래그, 붙여넣기, 구조 변경 |
| NE-009 | 노드 복제 | 노드 또는 서브트리 복사 | Duplicate, copy/paste |
| NE-010 | 접기/펼치기 | 하위 자식 표시/숨김 | collapse/expand toggle |
| NE-011 | 다중 선택 편집 | 여러 노드를 동시에 이동/삭제/정렬 | 다중 선택 + 명령 수행 |
| NE-012 | 수동 위치 보정 | 자유배치 또는 허용된 레이아웃에서 노드 좌표 수정 | drag to manual position |
| NE-013 | 인라인 생성 흐름 | 새 노드 생성 후 즉시 제목 입력 상태 진입 | create → focus → edit |
| NE-014 | 편집 취소/확정 | 편집 중 ESC/blur/Enter 처리 | 임시값 폐기/저장 |
| NE-015 | 구조 무결성 검증 | 순환참조, 루트 훼손, 금지 이동 차단 | 사전 검증 후 반영 |

### 4. 기능 정의 (What)
- NODE_EDITING은 노드 단위의 구조 편집 기능이다.
- 사용자는 노드를 추가하거나 삭제할 수 있고, 특정 노드를 다른 노드의 자식으로 옮기거나 같은 레벨의 다른 위치로 정렬할 수 있다.
- 노드는 제목(label)을 직접 수정할 수 있으며, 생성 직후 곧바로 입력 가능한 상태가 되어야 한다.
- 노드 이동 시 단순한 화면상의 이동이 아니라, 내부적으로는 parent_id, order_index, path, depth, manual position 등의 데이터가 함께 갱신될 수 있다.
- 사용자가 하나의 노드를 수정하면 해당 노드에 종속된 하위 서브트리의 구조/좌표/표시 상태가 함께 영향을 받을 수 있다.
- NODE_EDITING은 “문서형 편집”이 아니라 “구조형 편집”이며, 저장 모델과 렌더링 모델 사이의 정합성을 유지해야 한다.

### 5. 동작 방식 (How)

#### 5.1 사용자 동작
- 사용자는 노드를 클릭하여 선택한다.
- 선택된 노드에서 다음 동작을 수행할 수 있다.
  - 자식 노드 추가
  - 형제 노드 추가
  - 제목 편집
  - 드래그로 위치 이동
  - Delete로 삭제
  - 복제
  - 접기/펼치기
- 더블클릭 또는 Enter 입력 시 노드 텍스트 편집 모드로 진입한다.
- 새 노드 생성 시 기본적으로 편집 모드가 자동 시작된다.
- 드래그 앤 드롭 시 시스템은 “같은 부모 내 순서 변경”인지, “부모 변경”인지, “금지된 구조 변경”인지를 판별한다.

#### 5.2 시스템 처리
- 노드 추가 시:
  - 새 node_id 생성
  - parent_id 결정
  - order_index 계산
  - 기본 title 부여(예: “새 노드”)
  - 생성 시각 / 수정 시각 기록
  - 필요 시 기본 layout/style 상속
- 노드 제목 수정 시:
  - 입력값 trim 처리
  - 허용 길이 검증
  - 저장 후 autosave 대상 등록
  - undo/redo 이력 기록
- 노드 이동 시:
  - 대상 부모 검증
  - 자기 자신 또는 자기 하위 노드 밑으로 이동 금지
  - parent_id, path, depth, order_index 갱신
  - 하위 subtree path 일괄 갱신
  - partial relayout 수행
- 노드 삭제 시:
  - 삭제 대상이 루트인지 확인
  - 단일 삭제인지 subtree 삭제인지 규칙 적용
  - 관련 edge / selection / collapse 상태 정리
  - undo 복구 가능 상태로 이력 저장
- 접기/펼치기 시:
  - collapsed 상태만 변경
  - 실제 데이터 삭제는 일어나지 않음
  - 렌더링 시 하위 노드 표시 여부만 달라짐

#### 5.3 결과 표시
- 새 노드가 추가되면 즉시 캔버스에 반영되고 포커스가 새 노드에 이동한다.
- 편집 결과는 실시간 저장 대기 상태 또는 저장 완료 상태로 표시된다.
- 이동/삭제/복제 결과는 시각적으로 즉시 반영되어야 한다.
- 충돌 또는 금지 규칙 위반 시 사용자가 이해할 수 있는 메시지를 보여줘야 한다.
- 협업 중이면 다른 사용자에게도 구조 변경이 실시간 동기화되어야 한다.

### 6. 규칙 (Rule)

#### 6.1 기본 구조 규칙
- 하나의 맵에는 최소 1개의 루트 노드가 존재해야 한다.
- 루트 노드는 삭제할 수 없다. 단, 맵 전체 삭제는 MAP 기능에서 별도 처리한다.
- 일반 노드는 반드시 하나의 parent를 가진다.
- 하나의 노드는 동시에 두 부모를 가질 수 없다.
- 트리 구조는 항상 비순환 구조여야 한다.

#### 6.2 생성 규칙
- 새 맵 생성 시 루트 노드는 자동 생성한다.
- 자식 노드 추가 시 부모의 기본 layout/style 정책을 상속한다.
- 형제 노드 추가는 루트가 아닌 노드에서만 가능하다. 루트에서 형제 추가를 호출하면 정책에 따라
  - 금지하거나
  - 같은 루트 레벨 개념이 없는 경우 자식 추가로 대체하지 않고 명시적으로 차단한다.
- 새 노드 생성 직후 제목 편집 상태로 진입한다.

#### 6.3 제목 편집 규칙
- 노드 제목은 빈 문자열 저장을 허용하지 않는다.
- 사용자가 아무 글자도 입력하지 않고 편집 종료하면
  - 새로 생성된 노드라면 자동 삭제하거나
  - 기존 노드라면 이전 제목 유지
  중 하나로 정책을 고정해야 한다.
- MVP에서는 다음 정책을 권장한다.
  - 기존 노드: 빈 값 입력 시 이전 값 유지
  - 신규 노드: 빈 값 상태로 편집 종료 시 노드 생성 취소
- 제목 최대 길이는 별도 시스템 설정값을 따른다. 기본 권장값은 200자 내외이다.
- 줄바꿈 허용 여부는 NODE_CONTENT와 구분하여 정의한다.
  - NODE_EDITING의 기본 title은 단문 중심
  - 장문 설명은 NODE_CONTENT(note)로 분리

#### 6.4 이동 규칙
- 노드는 자기 자신 밑으로 이동할 수 없다.
- 노드는 자신의 하위 자손 밑으로 이동할 수 없다.
- 이동 시 부모 변경과 순서 변경을 명확히 구분한다.
- 같은 부모 아래 reorder는 구조 변경이 아닌 순서 변경으로 처리한다.
- 레이아웃이 자동 정렬형일 경우 드래그는 구조 이동 우선이다.
- 자유배치형 또는 수동보정 허용 상태에서는 drag 결과가 manualX/manualY 변경으로 기록될 수 있다.
- subtree 이동 시 자식 전체가 함께 이동한다.
- 이동 후 partial relayout만 수행하고 전체 relayout은 최소화한다.

#### 6.5 삭제 규칙
- 루트 노드는 삭제 금지이다.
- 부모 노드 삭제 시 하위 자식 전체도 함께 삭제하는 “subtree delete”를 기본 정책으로 한다.
- 삭제 전 확인창 표시 여부는 설정 또는 사용자 경험 정책에 따른다.
- 협업 중 삭제는 다른 사용자의 선택 상태/편집 상태와 충돌할 수 있으므로 서버 기준 최종 검증이 필요하다.

#### 6.6 복제 규칙
- 복제는 기본적으로 선택 노드와 그 하위 subtree를 함께 복제한다.
- 복제된 노드는 새 node_id를 가져야 한다.
- created_by, created_at, updated_at 등 메타데이터는 새 값으로 기록한다.
- 복제 시 댓글, 버전이력, 협업 잠금 등 운영 메타까지 복제할지 여부는 별도 정책이 필요하다.
- MVP에서는 “구조/텍스트/스타일만 복제, 운영 메타는 복제하지 않음”을 권장한다.

#### 6.7 접기/펼치기 규칙
- collapsed=true는 자식 표시만 숨기는 상태이다.
- 접힌 노드의 하위 데이터는 메모리/DB에서 유지된다.
- 접힌 상태에서도 검색 결과나 선택 이동 시 자동 펼침 여부를 정책으로 정해야 한다.
- 검색/포커스 이동으로 하위 노드를 보여줘야 하는 경우, 조상 노드는 자동 펼침 가능하다.

#### 6.8 이력 및 저장 규칙
- 모든 구조 변경은 undo/redo 단위로 기록되어야 한다.
- 노드 추가, 삭제, 이동, 제목 수정은 SAVE 대상이다.
- 복합 동작(예: 이동 + relayout + selection 변경)은 하나의 transaction으로 묶어야 한다.
- autosave는 너무 자주 서버를 호출하지 않도록 debounce 또는 batch 전략을 사용한다.

#### 6.9 협업 규칙
- 같은 노드를 두 사용자가 동시에 수정하면 충돌 정책이 필요하다.
- 제목 수정은 last-write-wins를 기본으로 하되, 협업 UI에서 충돌 알림을 보여줄 수 있다.
- 구조 이동/삭제는 텍스트 수정보다 충돌 영향이 크므로 서버 검증 우선 처리한다.
- 이미 다른 사용자가 삭제한 노드를 현재 사용자가 수정하려 하면 수정은 거부된다.

### 7. 예외 / 경계 (Edge Case)

#### 7.1 빈 값 / 누락 값
- 새 노드 생성 후 제목을 입력하지 않고 ESC 또는 blur
- 기존 노드 제목을 모두 지우고 저장 시도
- parent_id 없이 일반 노드 생성 요청이 들어온 경우
- 이동 대상 노드 ID 또는 드롭 대상 ID가 누락된 경우

#### 7.2 최소값 / 최대값
- 제목 길이 최대치 초과
- 한 부모 아래 자식 수가 시스템 허용치를 초과
- 매우 깊은 depth의 트리 생성 시도
- 한 번에 복제하는 subtree 크기가 지나치게 큰 경우

#### 7.3 중복 상황
- 동일 부모 아래 동일 제목 노드가 여러 개 생성되는 경우
- 복제 직후 같은 위치에 연속 복제가 발생하는 경우
- 단축키 연타로 같은 노드가 중복 생성되는 경우

#### 7.4 권한 없음
- viewer가 노드 생성/수정/삭제/이동 시도
- editor가 허용되지 않은 맵 영역 또는 잠금 상태 노드 수정 시도
- 비로그인 사용자가 personal map의 노드 편집 시도

#### 7.5 존재하지 않음 / 삭제됨
- 이미 삭제된 node_id를 수정 요청
- 협업 중 다른 사용자가 지운 노드를 현재 사용자가 계속 편집
- 드래그 도중 대상 부모가 삭제됨
- 새로고침 전 오래된 클라이언트 상태로 저장 요청

#### 7.6 충돌 상황
- 두 사용자가 동시에 같은 노드 제목 수정
- 한 사용자는 이동, 다른 사용자는 삭제 수행
- 한 사용자는 부모 변경, 다른 사용자는 같은 노드를 복제
- 버전 복원 직후 현재 편집 세션과 구조 충돌 발생

#### 7.7 네트워크 / 시스템 장애
- 제목 수정 후 autosave 전에 네트워크 끊김
- 이동 후 서버 저장 실패
- 실시간 협업 이벤트 수신 지연으로 화면 구조가 잠시 어긋남
- 부분 relayout 계산 중 예외 발생

#### 7.8 기능상 금지 대상
- 루트 노드 삭제 금지
- 자기 자신 밑으로 이동 금지
- 자기 하위 자손 밑으로 이동 금지
- 잠금 상태 노드 편집 금지
- publish viewer 화면에서 편집 금지

### 8. 권한 규칙
- creator:
  - 모든 노드 생성/수정/삭제/이동 가능
  - 루트 보호 규칙 외에는 전체 편집 가능
  - 협업 권한 정책 설정 가능
- editor:
  - 허용된 맵에서 노드 생성/수정/이동 가능
  - 맵 소유자 정책에 따라 삭제 허용 범위 제한 가능
  - 일부 관리성 기능(예: 전체 구조 초기화)은 불가
- viewer:
  - 노드 편집 불가
  - 접기/펼치기는 “개인 뷰 상태”로만 허용 가능
  - 저장을 수반하는 구조 변경은 모두 금지

### 9. DB 영향
- 관련 테이블:
  - maps
  - map_nodes
  - map_node_relations 또는 map_nodes 내부 parent/path 컬럼
  - map_node_view_state (개인별 접힘 상태를 분리 저장하는 경우)
  - map_history / map_operations / audit_logs
- 생성/수정/삭제 컬럼 예시:
  - map_nodes.node_id
  - map_nodes.map_id
  - map_nodes.parent_id
  - map_nodes.path
  - map_nodes.depth
  - map_nodes.order_index
  - map_nodes.title
  - map_nodes.collapsed
  - map_nodes.manual_x
  - map_nodes.manual_y
  - map_nodes.computed_x
  - map_nodes.computed_y
  - map_nodes.layout_type (subtree override 지원 시)
  - map_nodes.created_at
  - map_nodes.updated_at
  - map_nodes.deleted_at (soft delete 사용 시)
  - map_nodes.created_by
  - map_nodes.updated_by

#### DB 처리 원칙
- 저장 모델은 flat 구조를 기본으로 하되 parent_id + path + order_index 기반으로 subtree 조회를 지원한다.
- 노드 이동 시 path와 depth 재계산이 필요할 수 있다.
- soft delete 사용 여부는 VERSION_HISTORY / 복구 정책과 함께 결정한다.
- 실시간 저장 중에도 트리 무결성(parent 존재 여부, 순환 방지)이 DB/서버에서 최종 검증되어야 한다.

### 10. API 영향
- 필요 API:
  - POST /maps/{mapId}/nodes
  - PATCH /maps/{mapId}/nodes/{nodeId}
  - DELETE /maps/{mapId}/nodes/{nodeId}
  - POST /maps/{mapId}/nodes/{nodeId}/duplicate
  - POST /maps/{mapId}/nodes/{nodeId}/move
  - POST /maps/{mapId}/nodes/{nodeId}/collapse
  - POST /maps/{mapId}/operations/batch
- 주요 요청/응답 개요:

#### 10.1 노드 생성
- 요청:
  - parent_id
  - position(optional)
  - title(optional)
- 응답:
  - 생성된 node object
  - 적용된 기본값
  - 후속 relayout 필요 여부

#### 10.2 노드 수정
- 요청:
  - title
  - manual_x/manual_y
  - collapsed
- 응답:
  - 수정된 node
  - updated_at
  - revision/version

#### 10.3 노드 이동
- 요청:
  - target_parent_id
  - target_order_index
  - move_mode(reorder / reparent)
- 응답:
  - 변경된 node
  - 영향 받은 subtree summary
  - changed nodes list 또는 revision id

#### 10.4 노드 삭제
- 요청:
  - delete_mode(subtree)
- 응답:
  - deleted node ids
  - 영향 받은 selection / layout summary

#### 10.5 배치 명령
- 여러 편집 명령을 트랜잭션으로 묶어 전송할 수 있어야 한다.
- 협업/undo/redo를 위해 operation 기반 API를 고려할 수 있다.

### 11. 연관 기능
- MAP
- NODE_CONTENT
- NODE_STYLE
- LAYOUT
- CANVAS
- SELECTION
- HISTORY_UNDO_REDO
- VERSION_HISTORY
- SAVE
- SEARCH
- AI
- MAP COLLABORATION
- PUBLISH_SHARE
- SETTINGS

### 12. 예시 시나리오

#### 시나리오 1: 자식 노드 추가
- 사용자가 “Ubuntu 설치” 노드를 선택한다.
- Tab 또는 “자식 추가” 버튼을 누른다.
- 시스템은 해당 노드의 자식으로 새 노드를 만든다.
- 새 노드는 “새 노드” 상태로 생성되고 즉시 입력 커서가 들어간다.
- 사용자가 “Apache 설치”라고 입력하고 Enter를 누르면 저장된다.

#### 시나리오 2: 서브트리 이동
- 사용자가 “SSL 설정” 노드를 드래그하여 “Apache 설치”의 자식으로 옮긴다.
- 시스템은 해당 노드가 자기 자손 밑으로 이동하는지 검증한다.
- 문제가 없으면 parent_id와 path를 갱신하고 부분 relayout을 수행한다.
- 화면에서 “SSL 설정”과 그 하위 노드들이 새 위치로 이동한다.
- 해당 변경은 undo 1회로 원복 가능해야 한다.

#### 시나리오 3: 빈 제목으로 생성 취소
- 사용자가 새 노드를 추가했지만 아무 글자도 입력하지 않고 ESC를 누른다.
- 시스템은 신규 노드가 아직 유효한 제목을 갖지 않았음을 확인한다.
- 해당 신규 노드는 생성 취소되고 화면에서 사라진다.
- 기존 노드를 비운 경우에는 삭제하지 않고 이전 제목을 유지한다.

#### 시나리오 4: 협업 중 삭제 충돌
- 사용자 A가 어떤 노드를 편집 중이다.
- 동시에 사용자 B가 그 노드를 포함한 상위 서브트리를 삭제한다.
- 서버는 삭제를 반영하고 사용자 A에게 “편집 대상 노드가 삭제되었다”는 상태를 전달한다.
- 사용자 A의 편집 입력은 더 이상 저장되지 않으며, UI는 안전하게 편집 모드를 종료한다.

### 13. 구현 우선순위
- MVP 포함:
  - 노드 생성
  - 자식/형제 추가
  - 제목 수정
  - 삭제
  - 이동(reparent + reorder)
  - 접기/펼치기
  - undo/redo 연동
  - autosave 연동
- 2차 단계:
  - subtree 복제
  - 다중 선택 일괄 편집
  - 수동 위치 보정 고도화
  - 협업 충돌 가시화
  - operation batch API 고도화
- 의존 기능:
  - CANVAS
  - SELECTION
  - SAVE
  - HISTORY_UNDO_REDO
  - LAYOUT
- 후속 연계:
  - MAP COLLABORATION
  - VERSION_HISTORY
  - AI_WORKFLOW

---

### 14. 다중 가지 추가 (Bulk Branch Insert) 상세 명세

> **관련 문서**: `docs/03-editor-core/node/02-node-editing.md`, `docs/03-editor-core/node/02-node-editing.md §5`  
> **내부 기능 키**: `bulkInsertBranches`  
> **단축키**: `Ctrl + Space`

#### 14.1 입력 문법 — 들여쓰기 계층 방식

다중 가지 추가의 유일하게 지원되는 공식 입력 방식은 **들여쓰기(공백 기반) 계층 표현**이다. 쉼표/탭 구분자 방식은 사용하지 않는다.

**기본 규칙**
- 한 줄 = 노드 1개
- 빈 줄은 무시한다
- 줄 앞의 들여쓰기 수준으로 부모-자식 관계를 결정한다
- 탭(`\t`) 1개는 공백 2칸으로 자동 변환(normalize)한다

**들여쓰기 규칙**

| 공백 수 | 상대 깊이 |
|--------|---------|
| 0 | 기준 노드(targetNode)의 직계 자식 (depth +1) |
| 2 | depth +2 |
| 4 | depth +3 |
| n×2 | depth +(n+1) |

- 공백은 **2칸 단위**를 기본으로 한다.
- 갑자기 깊이가 2단계 이상 올라가는 경우(de-indent)는 허용되며, 해당 상위 노드의 자식으로 배치된다.
- 1칸 이상 증가하면 하위 레벨로 인정하는 완화형 파싱을 적용한다.

**입력 예시**

```
주제A
 상세A-1
  상세A-1-1
 상세A-2
주제B
```

생성 결과:
- 기준노드
  - 주제A
    - 상세A-1
      - 상세A-1-1
    - 상세A-2
  - 주제B

**입력 제한 정책**
- 1회 최대 200줄
- 최대 계층 10레벨
- 한 줄 최대 200자
- 텍스트 없는 들여쓰기 줄은 차단
- 최대 노드 수 초과 시 차단

#### 14.2 파싱 중간 구조 타입

입력 텍스트를 파싱한 결과를 다음 구조로 변환한다.

```typescript
type ParsedBulkLine = {
  raw: string;
  text: string;
  indent: number;
  level: number;
  lineNumber: number;
};
```

#### 14.3 스택 기반 트리 생성 알고리즘 (의사코드)

입력 라인을 순회하면서 스택을 이용해 부모-자식 관계를 결정한다.

```typescript
const stack: { level: number; nodeId: string }[] = [];
stack.push({ level: -1, nodeId: targetNodeId });

for (const line of parsedLines) {
  while (stack.length > 0 && stack[stack.length - 1].level >= line.level) {
    stack.pop();
  }

  const parent = stack[stack.length - 1];
  const newNode = createNodeDraft({
    parentId: parent.nodeId,
    text: line.text,
  });

  stack.push({ level: line.level, nodeId: newNode.id });
}
```

**전체 처리 흐름**
1. 줄 단위 분리
2. 빈 줄 제거
3. 각 줄의 앞 공백 수 계산
4. indent → level 변환
5. 스택을 이용해 부모 결정
6. 생성 예정 노드 배열 작성
7. 한 번에 트랜잭션으로 저장

#### 14.4 미리보기 API 명세

입력 텍스트를 실제 저장하지 않고 파싱 결과(트리 구조)만 반환하는 미리보기 API를 제공한다.

**요청**

```
POST /maps/{mapId}/nodes/{targetNodeId}/bulk-insert/preview
Content-Type: application/json

{
  "text": "내용\n 상세내용\n내용2",
  "indentMode": "space"
}
```

**응답**

```json
{
  "success": true,
  "tree": [
    {
      "text": "내용",
      "children": [
        { "text": "상세내용", "children": [] }
      ]
    },
    {
      "text": "내용2",
      "children": []
    }
  ]
}
```

**실제 삽입 API**

```
POST /maps/{mapId}/nodes/{targetNodeId}/bulk-insert
Content-Type: application/json

{
  "text": "내용\n 상세내용\n내용2",
  "indentMode": "space",
  "preview": false
}
```

응답:

```json
{
  "success": true,
  "createdCount": 3,
  "createdNodeIds": ["n101", "n102", "n103"]
}
```

#### 14.5 DB 저장 방식

여러 노드를 한 번에 추가하므로 반드시 **트랜잭션**으로 저장한다.

저장 순서:
1. bulk insert 요청 생성
2. 파싱/검증
3. 노드 draft 배열 생성
4. `orderIndex` 계산
5. DB 트랜잭션 시작
6. nodes 일괄 insert
7. revision/event log 저장
8. commit

revision 로그 예시:

```json
{
  "type": "bulk_insert_branches",
  "targetNodeId": "node_100",
  "createdCount": 8
}
```

#### 14.6 생성 후 UX 규칙

- 생성 완료 후 첫 번째 생성 노드를 선택하고 전체 생성 노드를 2초간 강조 표시한다.
- 기준 노드가 접혀 있으면 자동 펼침한다.
- 생성된 하위 부모들도 자동 펼침한다.
- **Undo 1회로 전체 생성된 노드가 일괄 삭제**되어야 한다 (12개 노드가 생성되었더라도 `Ctrl + Z` 한 번에 전체 삭제).

---

### 15. 노드 생성 시 스타일 상속 규칙

> **관련 문서**: `docs/03-editor-core/node/02-node-editing.md §2`, `docs/03-editor-core/node/02-node-editing.md §5.2`  
> **내부 키**: `inheritNodeStyleOnCreate`

#### 15.1 상속 정책 개요

형제 노드 생성, 자식 노드 생성, 다중 자식 노드 생성 및 다중 가지 추가 시, **새로 생성되는 노드는 기준 노드의 도형(shape)과 도형 내부 색상(fillColor)을 기본 상속**한다.

상속은 **생성 시점에만** 적용되며, 생성 후 각 노드는 독립적으로 스타일을 수정할 수 있다.

#### 15.2 상속 대상 속성 (MVP)

```typescript
type NodeStyle = {
  shape: NodeShape;     // rectangle, rounded-rectangle, ellipse, diamond, capsule 등
  fillColor: string;    // 도형 내부 색상 (예: "#FFE699")
};

// 노드 생성 로직
newNode.style.shape = baseNode.style.shape;
newNode.style.fillColor = baseNode.style.fillColor;
```

#### 15.3 기준 노드 정의

| 생성 유형 | 기준 노드 |
|----------|---------|
| 형제 노드 생성 (NODE-01, NODE-02) | 현재 선택 노드 자신 |
| 자식 노드 생성 (NODE-03, NODE-04) | 부모가 되는 현재 선택 노드 |
| 다중 가지 추가 (bulkInsertBranches) | 삽입 기준(target) 노드 |

#### 15.4 폰트 크기 상속 규칙

폰트 크기는 부모를 그대로 상속하는 것이 아니라, **새 노드의 실제 레벨(depth)에 따라 자동 계산**한다.

기본 레벨별 폰트 크기:

| 레벨 | 폰트 크기 |
|------|---------|
| Main Topic (root) | 18pt |
| Level 1 | 16pt |
| Level 2 | 15pt |
| Level 3 | 14pt |
| Level 4 | 13pt |
| Level 5 이하 | 12pt |

적용 규칙:
- **형제 노드 생성 시**: 동일 레벨 폰트 크기 적용
- **자식 노드 생성 시**: 하위 레벨(level+1) 폰트 크기 적용
- **다중 가지 추가 시**: 생성된 각 노드의 실제 레벨에 맞는 폰트 크기 적용

#### 15.5 기능 목록 추가 항목

| ID | 기능명 | 설명 | 단축키 |
|----|-------|------|--------|
| NODE-04A | Inherit Node Shape & Fill on Create | 형제/자식/다중 생성 시 기준 노드의 도형 및 내부 색상을 상속 | 자동 적용 |

#### 15.6 확장 설계 포인트

나중에 상속 범위를 옵션화할 수 있다.

MVP 범위:
- shape
- fillColor

확장 단계:
- borderColor까지 상속
- fontStyle까지 상속
- tag/marker까지 상속

---

### 16. 협업 충돌 처리 규칙 (Node Editing 관점)

> **관련 문서**: `docs/03-editor-core/node/02-node-editing.md §6.9`

NODE_EDITING 관점에서 협업 충돌이 발생하는 상황과 처리 정책은 다음과 같다.

#### 16.1 텍스트 수정 충돌 — Last-Write-Wins (LWW)

같은 노드의 **제목(title/text) 수정**이 두 사용자에서 동시에 발생한 경우:

- **기본 정책**: Last-Write-Wins (마지막 저장 우선)
- 서버 수신 시각 기준으로 나중에 도착한 값이 최종값이 된다.
- 협업 UI에서 충돌 알림(예: "다른 사용자가 이 노드를 수정했습니다")을 표시할 수 있다.
- 충돌 알림은 toast 또는 노드 인디케이터로 표시한다.

```
사용자 A: "Apache 설치" 입력 → t=100ms에 서버 도착
사용자 B: "Apache 2.4 설치" 입력 → t=150ms에 서버 도착
→ 최종값: "Apache 2.4 설치" (B의 값 적용)
→ 사용자 A에게 변경 알림 표시
```

#### 16.2 구조 이동/삭제 충돌 — 서버 검증 우선 (Server-First)

**노드 이동, 삭제, 부모 변경** 등 구조 변경은 텍스트 수정보다 영향 범위가 크므로 서버 검증을 우선한다.

- 클라이언트는 변경 의도를 서버에 전송한다.
- 서버는 현재 구조 상태를 기준으로 유효성을 검증한다.
- 서버 승인 후 클라이언트에 최종 상태를 반영한다.
- 서버 거부 시 클라이언트는 변경 전 상태로 롤백한다.

| 충돌 유형 | 처리 정책 |
|---------|---------|
| 두 사용자가 동시에 같은 노드 제목 수정 | LWW — 마지막 저장 우선 |
| 한 사용자 이동 + 다른 사용자 삭제 | 서버 검증 우선 — 먼저 도착한 구조 변경 적용, 나중 요청 거부 또는 재평가 |
| 한 사용자 부모 변경 + 다른 사용자 복제 | 서버 검증 우선 — 복제 시점의 구조 기준으로 처리 |
| 이미 삭제된 노드를 현재 사용자가 수정 시도 | 수정 거부 — "편집 대상 노드가 삭제되었습니다" 알림 표시 |
| 버전 복원 직후 편집 세션 구조 충돌 | 서버 기준 최신 상태로 클라이언트 동기화 |

#### 16.3 다중 가지 추가 시 협업 충돌

다중 가지 추가(bulkInsertBranches)는 트랜잭션으로 처리되므로:

- 트랜잭션 전체가 성공하거나 전체가 실패한다.
- 삽입 도중 대상 targetNode가 다른 사용자에 의해 삭제된 경우, 전체 bulk insert를 거부하고 사용자에게 오류 메시지를 표시한다.
- 배경 이미지 스타일 수정과 같은 단순 스타일 변경은 LWW로 처리한다.

---

### 17. Typography 시스템 설계

> **관련 문서**: `docs/03-editor-core/node/02-node-editing.md §3(폰트 섹션)`, `docs/03-editor-core/node/02-node-editing.md §15`  
> 노드 생성 시 폰트 크기 적용 규칙과 연계하여 맵 전체 타이포그래피 시스템을 정의한다.

#### 17.1 Typography 계층 구조

맵의 텍스트 스타일은 아래 4개의 계층으로 설계한다.

```
Map Theme (맵 전체 스타일)
        │
        ├─ Typography (폰트 규칙)
        │
        ├─ Level Style (레벨별 기본 스타일)
        │
        └─ Node Override (개별 노드 예외 스타일)
```

스타일 우선순위:

```
Node Override
    ↓
Level Style
    ↓
Map Theme
    ↓
System Default
```

렌더링 시 적용 예시:

```typescript
resolvedFontFamily = node.override.fontFamily ?? map.typography.fontFamily;
resolvedFontSize   = node.override.fontSize   ?? getLevelFontSize(node.level);
```

#### 17.2 맵 단위 Typography 데이터 구조

```typescript
type MapTypographySettings = {
  fontFamily: string;
  fontFallbacks: string[];
  levelFontSizes: {
    root: number;    // 기본 18
    level1: number;  // 기본 16
    level2: number;  // 기본 15
    level3: number;  // 기본 14
    level4: number;  // 기본 13
    level5Plus: number; // 기본 12
  };
  levelFontWeights: {
    root: number;    // Bold
    level1: number;  // SemiBold
    level2: number;  // Medium
    level3: number;  // Regular
    level4: number;  // Regular
    level5Plus: number; // Regular
  };
  lineHeight: number;
};
```

#### 17.3 노드 단위 텍스트 스타일 오버라이드

특정 노드에만 예외 스타일을 적용하는 경우 다음 타입을 사용한다.

```typescript
type NodeTextStyleOverride = {
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: number;
  italic?: boolean;
  underline?: boolean;
  color?: string;
};
```

MVP 허용 범위:
- `bold`, `italic`, `underline`, `textColor`

확장 단계:
- `fontFamily` override
- `fontSize` override

#### 17.4 레벨별 폰트 스타일 기본값

| Level | Font Size | Font Weight |
|-------|-----------|-------------|
| Root (Main Topic) | 18pt | Bold |
| Level 1 | 16pt | SemiBold |
| Level 2 | 15pt | Medium |
| Level 3 | 14pt | Regular |
| Level 4 | 13pt | Regular |
| Level 5+ | 12pt | Regular |

#### 17.5 폰트 패밀리 정책

- **기본 폰트**: `Pretendard`
- **Fallback**: `Noto Sans KR → Malgun Gothic → Arial → sans-serif`
- MVP에서는 **맵 전체 폰트 패밀리**만 변경 가능하다.
- 노드별 폰트 패밀리 override는 2차 확장에서 지원한다.

#### 17.6 Map Settings > Typography UI 구성

```
Map Settings
    └─ Typography
         ├─ Font Family (맵 전체)
         ├─ Line Height
         ├─ Letter Spacing
         └─ Level Font Size (레벨별 수정 가능)
              ├─ Main Topic: 18
              ├─ Level 1: 16
              ├─ Level 2: 15
              ├─ Level 3: 14
              ├─ Level 4: 13
              └─ Level 5+: 12
```

#### 17.7 Export 시 Typography 처리

**Markdown Export**

폰트 정보를 frontmatter metadata로 보존한다.

```yaml
---
fontFamily: Pretendard
levelFontSizes:
  root: 18
  level1: 16
  level2: 15
  level3: 14
  level4: 13
  level5Plus: 12
---
```

**HTML Export**

레벨별 CSS 클래스를 생성하여 폰트를 적용한다.

```css
.node.level-root { font-size: 18pt; font-family: 'Pretendard', 'Noto Sans KR', sans-serif; }
.node.level-1    { font-size: 16pt; }
.node.level-2    { font-size: 15pt; }
.node.level-3    { font-size: 14pt; }
.node.level-4    { font-size: 13pt; }
.node.level-5    { font-size: 12pt; }
```

#### 17.8 MVP 구현 범위

| 구분 | 기능 | 포함 여부 |
|------|------|----------|
| MVP | 폰트 패밀리 (맵 전체) | ✔ |
| MVP | 레벨별 폰트 크기 | ✔ |
| MVP | 레벨별 폰트 굵기 | ✔ |
| MVP | Bold / Italic / Underline (노드 단위) | ✔ |
| MVP | 텍스트 색상 (노드 단위) | ✔ |
| 2단계 | 노드별 폰트 패밀리 override | ◻ |
| 2단계 | 노드별 폰트 크기 override | ◻ |
| 3단계 | subtree 단위 스타일 일괄 적용 | ◻ |
