# easymindmap — 전체 기능 명세서

**최종 업데이트:** 2026-04-26
**변경 이력:**
- 2026-04-26 —  기능 인덱스 + 마스터 기능표(Full Table) 중심의 명세 문서
---

# easymindmap — Functional Specification

---

## 1. 기능 문서 INDEX

### 01. MAP

→ ../03-editor-core/map/01-map.md

### 02. NODE EDITING

→ ../03-editor-core/node/02-node-editing.md

### 03. NODE INDICATOR

→ ../03-editor-core/node/03-node-indicator.md

### 04. NODE CONTENT

→ ../03-editor-core/node/04-node-content.md

### 05. NODE STYLE

→ ../03-editor-core/node/05-node-style.md

### 06. NODE RENDERING

→ ../03-editor-core/node/06-node-rendering.md

### 07. MARKDOWN FORMAT POLICY

→ ../03-editor-core/node/07-markdown-format-policy.md

### 08. LAYOUT

→ ../03-editor-core/layout/08-layout.md

### 09. KANBAN

→ ../03-editor-core/canvas/09-kanban.md

### 10. CANVAS

→ ../03-editor-core/canvas/10-canvas.md

### 11. SELECTION

→ ../03-editor-core/canvas/11-selection.md

### 12. HISTORY UNDO REDO

→ ../03-editor-core/history/12-history-undo-redo.md

### 13. VERSION HISTORY

→ ../03-editor-core/history/13-version-history.md

### 14. SAVE

→ ../03-editor-core/save/14-save.md

### 15. TAG

→ ../03-editor-core/search/15-tag.md

### 16. SEARCH

→ ../03-editor-core/search/16-search.md

### 17. KEYBOARD SHORTCUTS

→ ../03-editor-core/search/17-keyboard-shortcuts.md

### 18. AI

→ ../04-extensions/ai/18-ai.md

### 19. AI WORKFLOW

→ ../04-extensions/ai/19-ai-workflow.md

### 20. EXPORT

→ ../04-extensions/import-export/20-export.md

### 21. IMPORT

→ ../04-extensions/import-export/21-import.md

### 22. DASHBOARD

→ ../04-extensions/dashboard/22-dashboard.md

### 23. NODE TRANSLATION

→ ../04-extensions/translation/23-node-translation.md

### 24. CHAT TRANSLATION

→ ../04-extensions/translation/24-chat-translation.md

### 25. MAP COLLABORATION

→ ../04-extensions/collaboration/25-map-collaboration.md

### 26. REALTIME CHAT

→ ../04-extensions/collaboration/26-realtime-chat.md

### 27. PUBLISH SHARE

→ ../04-extensions/publish/27-publish-share.md

### 28. WBS

→ ../04-extensions/project/28-wbs.md

### 29. RESOURCE

→ ../04-extensions/project/29-resource.md

### 30. OBSIDIAN INTEGRATION

→ ../04-extensions/integrations/30-obsidian-integration.md

### 31. REDMINE INTEGRATION

→ ../04-extensions/integrations/31-redmine-integration.md

### 32. SETTINGS

→ ../04-extensions/settings/32-settings.md

---

## 2. 전체 기능 목록 (Master Table)
### 📑 프로젝트 기능 명세서 (전체 리스트)

| No  | 그룹          | 기능ID        | 기능명                    | 설명                               | 주요 동작 단계                                                                                         |
|-----|-------------|-------------|------------------------|----------------------------------|--------------------------------------------------------------------------------------------------|
| 1   | MAP         | MAP-01      | Map 생성                 | 새 마인드맵 문서 생성                     | 1. 맵 이름·설명·유형 입력2. map_id 생성3. root node 자동 생성4. 기본 layout 적용5. 편집 화면 진입                         |
| 2   | MAP         | MAP-02      | Map 조회                 | 기존 맵 열기                          | 1. 목록에서 맵 선택2. 기본 정보·Node 데이터 조회3. 저장 구조 → 편집 구조 변환4. layout 계산 후 canvas 표시                      |
| 3   | MAP         | MAP-03      | Map 수정                 | 맵 이름·설명·기본 설정 변경                 | 1. 수정 내용 입력2. 권한 검증3. 저장4. 즉시 화면 반영                                                              |
| 4   | MAP         | MAP-04      | Map 삭제                 | 맵 soft delete 처리                 | 1. 삭제 요청2. 권한 확인3. is_deleted=true 처리4. 목록에서 숨김                                                  |
| 5   | MAP         | MAP-05      | Map 유형 설정              | personal / collaborative 맵 유형 지정 | 1. map_type 선택2. 권한 구조에 영향 적용3. 협업 기능 활성 여부 결정                                                   |
| 6   | MAP         | MAP-06      | Map 복제                 | 기존 맵 전체 복사                       | 1. 복제 요청2. 원본 맵·노드 전체 데이터 복사3. 새 map_id 생성4. 복제 맵 편집 화면 진입                                       |
| 7   | MAP         | MAP-07      | Map 기본 설정              | 기본 레이아웃·스타일 설정                   | 1. 기본값 입력2. maps.layout_config 저장3. 신규 노드 생성 시 기본값으로 적용                                          |
| 8   | NODE 편집     | NE-001      | 루트 노드 생성               | 새 맵 생성 시 최초 루트 노드 자동 생성          | 1. 맵 생성 트리거2. root node 자동 INSERT3. 기본 제목 부여4. 편집 모드 자동 진입                                       |
| 9   | NODE 편집     | NE-002      | 자식 노드 추가               | 선택된 노드 아래에 자식 노드 추가              | 1. 부모 노드 선택2. Tab/Enter/버튼/인디케이터 클릭3. 자식 node 생성4. 편집 모드 자동 진입                                   |
| 10  | NODE 편집     | NE-003      | 형제 노드 추가               | 선택된 노드와 같은 부모 아래 형제 노드 추가        | 1. 노드 선택2. 단축키/메뉴 실행3. 형제 노드 생성4. 편집 모드 자동 진입                                                    |
| 11  | NODE 편집     | NE-004      | 노드 제목 편집               | 노드 기본 텍스트 수정                     | 1. 더블클릭 또는 Enter로 진입2. 텍스트 입력3. Enter/blur → 저장4. autosave 대상 등록                                 |
| 12  | NODE 편집     | NE-005      | 노드 삭제                  | 단일 노드 또는 서브트리 삭제                 | 1. 노드 선택2. Delete/메뉴 실행3. root 여부 확인(루트 금지)4. 서브트리 포함 삭제5. undo 이력 저장                            |
| 13  | NODE 편집     | NE-006      | 노드 이동                  | 부모 변경 또는 형제 순서 변경                | 1. 드래그 또는 키보드 이동2. 대상 부모 검증(순환참조 금지)3. parent_id·path·depth·order_index 갱신4. partial relayout 수행 |
| 14  | NODE 편집     | NE-007      | 노드 순서 변경               | 같은 부모 아래 정렬 순서 변경                | 1. 노드 선택2. 앞/뒤 이동 또는 drag reorder3. order_index 재계산4. 렌더링 즉시 반영                                  |
| 15  | NODE 편집     | NE-008      | 서브트리 이동                | 노드와 모든 자식을 함께 다른 위치로 이동          | 1. 노드 드래그2. 자손 여부 검증3. parent_id·path·depth 일괄 갱신4. 서브트리 path 재계산5. partial relayout             |
| 16  | NODE 편집     | NE-009      | 노드 복제                  | 노드 또는 서브트리 복사                    | 1. Duplicate/copy 실행2. 새 node_id 생성3. 구조·텍스트·스타일 복사4. 운영 메타 제외5. 복제 위치에 삽입                       |
| 17  | NODE 편집     | NE-010      | 접기/펼치기                 | 하위 자식 노드 표시/숨김 토글                | 1. 접기/펼치기 버튼 클릭2. collapsed 상태 변경3. 실제 데이터 유지4. 렌더링 반영                                           |
| 18  | NODE 편집     | NE-011      | 다중 선택 편집               | 여러 노드를 동시에 이동·삭제·정렬              | 1. Ctrl+클릭 또는 영역 선택2. 일괄 명령 실행3. 각 노드에 동일 동작 적용4. 결과 즉시 렌더링                                      |
| 19  | NODE 편집     | NE-012      | 수동 위치 보정               | 자유배치 레이아웃에서 좌표 수동 수정             | 1. freeform 레이아웃 확인2. 노드 drag3. manualX/manualY 저장4. auto layout 개입 없음                           |
| 20  | NODE 편집     | NE-013      | 인라인 생성 흐름              | 생성 후 즉시 텍스트 입력 상태 진입             | 1. 노드 생성 트리거2. 화면에 즉시 렌더링3. 자동 포커스 이동4. 커서 활성화                                                   |
| 21  | NODE 편집     | NE-014      | 편집 취소/확정               | 편집 중 ESC·blur·Enter 처리           | 1. 편집 종료 이벤트 감지2. Enter/blur → 값 저장3. ESC → 취소 (이전 값 유지)                                         |
| 22  | NODE 편집     | NE-015      | 구조 무결성 검증              | 순환참조·루트 훼손 사전 차단                 | 1. 이동/삭제 전 검증 수행2. 자기 자신·자손 아래 이동 금지3. 루트 삭제 금지4. 위반 시 오류 메시지 표시                                 |
| 23  | NODE 인디케이터  | NODE-13     | 노드 추가 인디케이터            | 선택 노드 4방향에 + 버튼 표시               | 1. 노드 싱글 클릭2. 4방향 황금색 + 버튼 표시3. 원하는 방향 버튼 클릭4. 노드 생성 및 편집 모드 진입                                  |
| 24  | NODE 인디케이터  | NODE-IND-01 | 부모 노드 추가 (상↑)          | 선택 노드와 기존 부모 사이에 새 노드 삽입         | 1. 상(↑) + 버튼 클릭2. 선택 노드와 부모 사이에 새 노드 삽입3. 서브트리 재배치4. 편집 모드 진입                                    |
| 25  | NODE 인디케이터  | NODE-IND-02 | 자식 노드 추가 (하↓)          | 마지막 자식 위치에 새 노드 추가               | 1. 하(↓) + 버튼 클릭2. 마지막 자식으로 새 노드 생성3. 편집 모드 자동 진입                                                 |
| 26  | NODE 인디케이터  | NODE-IND-03 | 형제 이전 추가 (좌←)          | 선택 노드 바로 앞(이전 순서)에 형제 삽입         | 1. 좌(←) + 버튼 클릭2. 이전 위치에 형제 노드 생성3. order_index 재계산4. 편집 모드 진입                                   |
| 27  | NODE 인디케이터  | NODE-IND-04 | 형제 다음 추가 (우→)          | 선택 노드 바로 뒤(다음 순서)에 형제 삽입         | 1. 우(→) + 버튼 클릭2. 다음 위치에 형제 노드 생성3. order_index 재계산4. 편집 모드 진입                                   |
| 28  | NODE 인디케이터  | NODE-14     | 번역 상태 인디케이터            | 번역 상태를 텍스트 우측 아이콘 표시             | 1. 번역 상태 판단2. 상태별 아이콘 표시 (🔤/🔴/⛔ 등)3. 클릭 시 원문 팝오버 표시4. 완료 시 자동 갱신                               |
| 29  | NODE 인디케이터  | NODE-15     | 인디케이터 설정               | 인디케이터 표시 여부 사용자 제어               | 1. 설정 패널 토글2. PATCH /users/me/ui-preferences 저장3. 전역 즉시 적용                                       |
| 30  | NODE 인디케이터  | NODE-16     | 콘텐츠 존재 인디케이터           | 노트·링크·첨부파일 존재 아이콘 상시 표시          | 1. 데이터 존재 확인2. 조건부 아이콘(≡, 🔗, 📎, ▶) 렌더링3. 데이터 없으면 미표시                                           |
| 31  | NODE 인디케이터  | NODE-17     | WBS 일정 인디케이터           | 날짜배지·진척률바·담당자 표시                 | 1. WBS 모드 활성화 확인2. 일정·리소스 데이터 조회3. 배지·바 렌더링4. 클릭 시 팝오버 오픈                                        |
| 32  | NODE 인디케이터  | WFLOW-03/04 | AI Workflow 상태         | executable step 실행 상태 배지 표시      | 1. stepState 값 조회2. 상태별 색상 배지 표시3. 콘텐츠 인디케이터 좌측 배치                                               |
| 33  | NODE 인디케이터  | COLLAB-IND  | 협업 인디케이터               | 타인 편집 중 잠금 표시                    | 1. 협업 맵 확인2. scope 밖 노드 dim 처리3. 타인 편집 노드 테두리+이름 표시4. 5초 후 자동 해제                                 |
| 34  | NODE 콘텐츠    | NC-01       | 콘텐츠 입력                 | markdown 텍스트 입력 및 저장             | 1. 노드 편집 모드 진입2. markdown 입력3. raw 저장 및 autosave 등록                                              |
| 35  | NODE 콘텐츠    | NC-02       | code node              | 실행형 콘텐츠 표현 (node_type=code)      | 1. node_type=code 지정2. 코드 입력3. 전용 UI 렌더링 (monospace 등)                                           |
| 36  | NODE 콘텐츠    | NC-03       | note 필드                | 노드 상세 설명 입력                      | 1. note 패널 열기2. 텍스트 입력3. node_notes.content 저장4. 패널에 표시                                          |
| 37  | NODE 콘텐츠    | NC-04       | autosave               | 편집 후 자동 저장 (debounce)            | 1. 편집 이벤트 발생2. debounce 타이머 시작3. 일정 시간 후 저장 API 호출4. 상태 표시                                       |
| 38  | NODE 콘텐츠    | NC-05       | 생성 출처 추적               | AI/사용자 생성 구분 메타 기록               | 1. 생성 시 출처 판단2. ai_jobs 또는 revision 메타 기록3. 출처 정보 제공                                             |
| 39  | NODE 콘텐츠    | NC-06       | 줄바꿈 지원                 | Enter 입력으로 수동 줄바꿈 지원             | 1. Enter 키 입력2. raw text에 줄바꿈 저장3. 렌더링 시 pre-wrap 반영                                             |
| 40  | NODE 콘텐츠    | NC-07       | 리스트 지원                 | markdown 리스트를 콘텐츠로 유지            | 1. markdown list 입력2. raw 저장3. 렌더링 시 서식 반영                                                       |
| 41  | NODE 콘텐츠    | NC-08       | 코드 언어 확장               | code_language 컬럼 추가              | 1. 코드 노드 언어 선택2. 컬럼 저장3. syntax highlight 적용                                                     |
| 42  | NODE 스타일    | NS-01       | 텍스트 색상                 | 노드 글자 색 변경                       | 1. color picker 열기2. 색상 선택3. style_json.textColor 저장                                             |
| 43  | NODE 스타일    | NS-02       | 배경 색상                  | 노드 배경 색 변경                       | 1. palette 열기2. 색상 선택3. backgroundColor 저장                                                       |
| 44  | NODE 스타일    | NS-03       | 폰트 스타일                 | bold·italic·underline·size 변경    | 1. 툴바 스타일 선택2. 스타일 속성 저장3. 즉시 반영                                                                 |
| 45  | NODE 스타일    | NS-04       | border                 | 테두리 색상·반지름 스타일                   | 1. border 설정 UI 열기2. 스타일 선택 및 저장                                                                 |
| 46  | NODE 스타일    | NS-05       | 아이콘                    | 노드에 상태 아이콘 (emoji/icon) 추가       | 1. 아이콘 picker 열기2. emoji/icon 선택3. 노드 내 아이콘 표시                                                   |
| 47  | NODE 스타일    | NS-06       | 강조                     | 중요 노드 하이라이트 강조                   | 1. 강조 설정 선택2. highlight 스타일 적용3. 시각적 구분                                                          |
| 48  | NODE 스타일    | IMG-01      | 이미지 패널 열기              | 노드 배경 이미지 삽입·변경·삭제 패널            | 1. 노드 선택2. 이미지 패널 버튼 클릭3. 패널 표시                                                                  |
| 49  | NODE 스타일    | IMG-02      | Preset 이미지 삽입          | 시스템 라이브러리 이미지 배경 적용              | 1. preset 탭 선택2. 이미지 선택3. backgroundImage 저장                                                     |
| 50  | NODE 스타일    | IMG-03      | 사용자 이미지 업로드            | PC 이미지 파일 업로드 배경 적용              | 1. 파일 선택2. 검증 수행3. 서버 업로드4. backgroundImage 저장                                                   |
| 51  | NODE 스타일    | IMG-04      | 배경 이미지 교체              | 기존 배경 이미지를 다른 이미지로 교체            | 1. 이미지 패널 열기2. 새 이미지 선택3. 덮어쓰기 저장                                                                |
| 52  | NODE 스타일    | IMG-05      | 배경 이미지 제거              | 노드 배경 이미지 삭제                     | 1. 제거 버튼 클릭2. mode=none 저장3. 렌더링 제거                                                              |
| 53  | NODE 스타일    | IMG-06      | 이미지 Fit 모드             | 배치 방식 변경 (cover/contain 등)       | 1. fit 모드 선택2. backgroundImage.fit 저장3. 재렌더링                                                     |
| 54  | NODE 스타일    | IMG-07      | 이미지 위치                 | 이미지 정렬 위치 변경                     | 1. position 선택2. style 저장3. 재렌더링                                                                 |
| 55  | NODE 스타일    | IMG-08      | 오버레이 스타일               | 배경 이미지 위 오버레이 색상 조정              | 1. 색상·투명도 설정2. overlayColor/Opacity 저장                                                           |
| 56  | NODE 스타일    | IMG-09      | 이미지 위 텍스트              | 배경 이미지 위에 텍스트 입력·편집              | 1. 레이어 순서 렌더링2. 인라인 편집3. clipping 처리                                                             |
| 57  | NODE 스타일    | IMG-10      | 텍스트 대비 보정              | 배경 이미지 위 텍스트 가독성 자동 보정           | 1. 이미지 밝기 분석2. 텍스트 색상 자동 보정                                                                      |
| 58  | NODE 스타일    | IMG-11      | 배경 이미지 렌더링             | 편집기 캔버스 렌더링                      | 1. url 확인2. SVG clipPath 등으로 클리핑3. 순서대로 렌더링                                                      |
| 59  | NODE 스타일    | IMG-12      | 배경 이미지 저장              | 배경 이미지 상태를 DB 저장                 | 1. PATCH 호출2. style_json 저장3. autosave 연동                                                        |
| 60  | NODE 스타일    | IMG-13      | 이미지 Undo/Redo          | 이미지 관련 동작 취소/재실행                 | 1. 이벤트 발생2. history stack 기록3. 복원 처리                                                             |
| 61  | NODE 스타일    | IMG-14      | HTML Export 이미지        | HTML 내보내기 시 이미지 유지               | 1. HTML export 실행2. 이미지 자산 포함3. CSS 인라인 표현                                                       |
| 62  | NODE 스타일    | IMG-15      | Markdown Export        | Markdown 내보내기 시 이미지 메타 보존        | 1. export 실행2. 주석 또는 sidecar JSON 저장                                                             |
| 63  | NODE 스타일    | IMG-16      | 업로드 이미지 검증             | 이미지 형식·용량 검증                     | 1. MIME/확장자 검증2. 크기 확인 (최대 10MB)3. 업로드 진행                                                        |
| 64  | NODE 스타일    | IMG-17      | Preset 카테고리 필터         | 카테고리별 조회·필터링                     | 1. 카테고리 선택2. API 호출3. 목록 표시                                                                      |
| 65  | NODE 스타일    | IMG-18      | 노드 크기 반응               | 노드 크기 변경 시 이미지 재배치               | 1. 크기 변경 감지2. fit 기준 재렌더링3. 텍스트 재조정                                                              |
| 66  | NODE 스타일    | IMG-19      | 복사/붙여넣기 이미지            | 노드 복사 시 배경 이미지 스타일 포함            | 1. 노드 복사2. 스타일 포함 여부 판단3. 붙여넣기 적용                                                                |
| 67  | NODE 스타일    | IMG-20      | 신규 노드 상속 정책            | 형제·자식 생성 시 이미지 상속 제어             | 1. 생성 트리거2. 상속 정책 확인 (기본: 미상속)                                                                   |
| 68  | NODE 렌더링    | NR-01       | markdown 렌더링           | markdown content 화면 렌더링          | 1. node_type 확인2. text 파싱3. 서식 렌더링 및 표시                                                          |
| 69  | NODE 렌더링    | NR-02       | code 렌더링               | code node 화면 표시                  | 1. node_type 확인2. monospace font 표시3. copy 버튼 제공                                                 |
| 70  | NODE 렌더링    | NR-03       | 자동 크기                  | content 기반 자동 크기 계산              | 1. 길이·구조 분석2. 예상 줄 수 반영3. width/height 계산 (max 제한)                                               |
| 71  | NODE 렌더링    | NR-04       | 줄바꿈 처리                 | 유형별 줄바꿈 정책 적용                    | 1. node_type 확인2. pre-wrap 적용3. 수동 줄바꿈 보존                                                        |
| 72  | NODE 렌더링    | NR-05       | overflow 제어            | 기준 초과 시 collapse 제공              | 1. overflow 판정2. collapse 상태 표시3. 더보기/expand 제공                                                  |
| 73  | NODE 렌더링    | NR-06       | zoom 대응                | zoom 레벨 기반 LOD 제어                | 1. zoom 감지2. 레벨별 정보량(축약/구조 중심) 조정                                                                |
| 74  | NODE 렌더링    | NR-07       | 첨부/링크 표시               | 링크·첨부 아이콘 인라인 표시                 | 1. 데이터 확인2. 아이콘 렌더링3. 클릭 시 패널 오픈                                                                 |
| 75  | NODE 렌더링    | NR-08       | preview/edit 전환        | view mode ↔ edit mode 전환         | 1. 더블클릭 → edit (raw)2. blur/Enter → preview (rendered)                                           |
| 76  | MD 포맷       | MDP-01      | Heading Parse          | Markdown Heading을 Node Level 변환  | 1. # 기호 인식2. Level 결정3. 부모-자식 관계 결정                                                              |
| 77  | MD 포맷       | MDP-02      | List Parse             | Markdown 리스트 유지 정책               | 1. 리스트 감지2. 모드별(document/outline) 변환 처리                                                          |
| 78  | MD 포맷       | MDP-03      | Document Mode          | 문서형 Markdown import (기본)         | 1. 파일 선택2. heading만 구조화3. 본문은 콘텐츠로 포함                                                            |
| 79  | MD 포맷       | MDP-04      | Outline Mode           | 아웃라인형 Markdown import            | 1. 모드 선택2. 리스트 항목을 자식 node로 변환                                                                   |
| 80  | LAYOUT      | LT-01       | 레이아웃 타입 선택             | 15종 레이아웃 중 선택 및 전환               | 1. 툴바 선택2. layoutType 업데이트3. 엔진 재계산 및 애니메이션                                                      |
| 81  | LAYOUT      | LT-02       | Subtree 레이아웃           | 특정 노드 이하 독립 레이아웃 지정              | 1. 우클릭 메뉴2. 해당 node.layoutType 저장3. Subtree만 독립 적용                                               |
| 82  | LAYOUT      | LT-03       | Auto Layout 엔진         | 2-Pass 알고리즘 좌표 계산                | 1. Measure Pass (Bottom-up)2. Arrange Pass (Top-down)3. 좌표 업데이트                                  |
| 83  | LAYOUT      | LT-04       | Freeform 수동 배치         | drag & drop으로 위치 수동 지정           | 1. 노드 drag2. manualPosition 저장3. 엔진 개입 차단                                                        |
| 84  | LAYOUT      | LT-05       | Auto ↔ Freeform 전환     | 모드 간 전환 정책 및 좌표 보존               | 1. auto→free: 좌표 복사2. free→auto: manualPosition=null                                             |
| 85  | LAYOUT      | LT-06       | Kanban 레이아웃            | 보드형 3-depth 구조 레이아웃              | 1. layoutType=kanban2. depth별(board/col/card) 구조 적용                                              |
| 86  | LAYOUT      | LT-07       | 전환 애니메이션               | 레이아웃 전환 시 부드러운 이동                | 1. 타입 변경2. 좌표 계산3. CSS transition 적용                                                             |
| 87  | LAYOUT      | LT-08       | 레이아웃 상속                | 하위 노드가 부모 타입을 기본 상속              | 1. 새 노드 생성2. 부모 layoutType 복사 및 저장                                                               |
| 88  | LAYOUT      | LT-09       | 루트 레이아웃 결정             | 루트 타입이 전체 맵 기본값                  | 1. 루트 타입 변경2. 전체 relayout 트리거                                                                    |
| 89  | LAYOUT      | LT-10       | 간격/방향 설정               | 노드 간격(gap)·방향 설정                 | 1. 값 입력2. maps.layout_config 저장3. 엔진 반영                                                          |
| 90  | KANBAN      | KB-01       | Kanban 보드 생성           | 새 맵/기존 맵에서 보드 생성                 | 1. layoutType=kanban2. board 노드 생성3. 초기 컬럼 자동 생성                                                 |
| 91  | KANBAN      | KB-02       | 초기 컬럼 구성               | 기본 컬럼(Todo/Doing/Done) 구성        | 1. 보드 생성 트리거2. depth 1 노드 3개 INSERT                                                              |
| 92  | KANBAN      | KB-03       | 컬럼 추가                  | 보드에 새 컬럼 추가                      | 1. 버튼 클릭2. 컬럼명 입력3. column node 생성                                                               |
| 93  | KANBAN      | KB-04       | 컬럼 삭제                  | 컬럼 및 하위 카드 일괄 삭제                 | 1. 메뉴 클릭2. 확인 다이얼로그3. cascade 삭제                                                                 |
| 94  | KANBAN      | KB-05       | 컬럼 순서 변경               | drag & drop으로 컬럼 순서 변경           | 1. 헤더 drag2. order_index 재계산3. autosave                                                          |
| 95  | KANBAN      | KB-06       | 카드 추가                  | 컬럼 내 새 카드 추가                     | 1. 버튼 클릭2. card node(depth 2) 생성3. 편집 모드 진입                                                      |
| 96  | KANBAN      | KB-07       | 카드 수정                  | 카드 content 인라인 편집                | 1. 클릭2. 인라인 편집3. blur/Enter → 저장                                                                 |
| 97  | KANBAN      | KB-08       | 카드 삭제                  | 카드 삭제                            | 1. 우클릭/Delete2. 확인 및 삭제                                                                          |
| 98  | KANBAN      | KB-09       | 카드 순서 변경               | 컬럼 내 카드 순서 변경                    | 1. 카드 drag2. 위치 drop3. order_index 재계산                                                           |
| 99  | KANBAN      | KB-10       | 카드 컬럼 간 이동             | 카드를 타 컬럼으로 이동                    | 1. 카드 drag2. 타 컬럼 drop3. parent_id 변경 및 재계산                                                      |
| 100 | KANBAN      | KB-11       | 3레벨 제한 검증              | depth 3 이상 생성 차단                 | 1. 생성 시도2. depth 계산3. 초과 시 오류 메시지                                                                |
| 101 | KANBAN      | KB-12       | Markdown Export        | 보드 구조를 Markdown 변환               | 1. export 요청2. 구조 파싱(H1, H2, List)3. .md 다운로드                                                    |
| 102 | KANBAN      | KB-13       | HTML Export            | 보드 UI 유지 standalone HTML         | 1. export 요청2. 레이아웃 유지 HTML 생성                                                                   |
| 103 | CANVAS      | CANVAS-01   | Zoom In/Out            | 캔버스 확대·축소                        | 1. 휠/버튼 조작2. zoom 값 변경3. 커서 기준 pan 보정                                                            |
| 104 | CANVAS      | CANVAS-02   | Fit Screen             | 전체 맵을 화면에 맞추기                    | 1. world bounds 계산2. zoom/pan 자동 조정                                                              |
| 105 | CANVAS      | CANVAS-03   | Pan Canvas             | 캔버스 드래그 이동                       | 1. 빈 공간 drag2. panX/panY 변경                                                                      |
| 106 | CANVAS      | CANVAS-04   | Center Node            | 선택 노드를 화면 중앙 배치                  | 1. 노드 선택2. panX/Y 계산3. 뷰포트 이동                                                                    |
| 107 | CANVAS      | CANVAS-05   | 100% View              | 줌 레벨 100% 초기화                    | 1. zoom=1.0 설정2. pan 중앙 조정                                                                       |
| 108 | CANVAS      | CANVAS-06   | Fullscreen Mode        | 전체 화면 모드 전환                      | 1. Fullscreen API 호출2. 편집 UI 전체 화면 표시                                                            |
| 109 | CANVAS      | CANVAS-07   | Focus Node View        | 선택 노드 집중 보기 (주변 dim)             | 1. 노드 선택2. Focus 활성화3. 주변 opacity 저하                                                             |
| 110 | CANVAS      | CANVAS-08   | Minimap                | 전체 맵 축소 미니맵 표시                   | 1. 미니맵 렌더링2. 뷰포트 범위 표시3. 클릭/drag 이동                                                              |
| 111 | CANVAS      | CANVAS-09   | Status Bar             | 줌 레벨·노드 수 상태 표시                  | 1. 실시간 데이터 집계2. 상태바 갱신                                                                           |
| 112 | 선택          | SEL-01      | Single Select          | 단일 노드 선택                         | 1. 클릭2. 하이라이트 및 UI 활성화                                                                           |
| 113 | 선택          | SEL-02      | Multi Select           | 여러 노드 동시 선택                      | 1. Ctrl+클릭2. 선택 상태 토글                                                                            |
| 114 | 선택          | SEL-03      | Subtree Select         | 노드 및 하위 노드 일괄 선택                 | 1. 단축키/메뉴 실행2. 전체 하위 노드 선택 상태                                                                    |
| 115 | 선택          | SEL-04      | Area Select            | 드래그 영역 내 노드 일괄 선택                | 1. 빈 캔버스 drag2. 사각형 표시3. 영역 내 노드 선택                                                              |
| 116 | 선택          | SEL-05      | Select All             | 전체 노드 선택                         | 1. Ctrl+A2. 모든 노드 선택                                                                             |
| 117 | 선택          | SEL-06      | Deselect All           | 모든 선택 해제                         | 1. ESC/빈 공간 클릭2. 해제                                                                              |
| 118 | 선택          | SEL-07      | Range Select           | 범위 내 노드 선택                       | 1. 첫 노드 선택2. Shift+클릭으로 끝 지정                                                                     |
| 119 | 선택          | SEL-08      | Toggle Select          | 특정 노드 선택 토글                      | 1. Ctrl+클릭2. 선택 상태 반전                                                                            |
| 120 | 히스토리        | HISTORY-01  | Undo                   | 마지막 작업 취소                        | 1. Ctrl+Z/버튼2. 스택 이벤트 추출 및 복원                                                                    |
| 121 | 히스토리        | HISTORY-02  | Redo                   | 취소된 작업 재실행                       | 1. Ctrl+Y/Shift+Z2. redo 스택 복원                                                                   |
| 122 | 히스토리        | HISTORY-03  | Transaction            | 복합 동작을 하나로 묶음                    | 1. 작업 시작 선언2. 세부 동작 수행3. 통합 기록                                                                   |
| 123 | 히스토리        | HISTORY-04  | Coalescing             | 연속 텍스트 입력 합산                     | 1. 입력 이벤트2. debounce 적용3. 통합 항목 기록                                                               |
| 124 | 히스토리        | HISTORY-05  | Stack 상태 표시            | undo/redo 가능 여부 UI 표시            | 1. 스택 상태 감지2. 버튼 활성/비활성 제어                                                                       |
| 125 | 히스토리        | HISTORY-06  | 히스토리 초기화               | 히스토리 스택 전체 초기화                   | 1. 특정 이벤트 발생2. stack clear                                                                       |
| 126 | 버전 히스토리     | VH-01       | 자동 revision 생성         | 편집 중 버전 자동 저장                    | 1. 이벤트 감지2. map_revisions 스냅샷 저장                                                                 |
| 127 | 버전 히스토리     | VH-02       | 버전 히스토리 패널             | 저장된 버전 목록 표시                     | 1. 패널 오픈2. 목록 로딩 및 표시                                                                            |
| 128 | 버전 히스토리     | VH-03       | 버전 상세 조회               | 버전 변경 내용 조회                      | 1. 버전 선택2. 상세 데이터 로딩                                                                             |
| 129 | 버전 히스토리     | VH-04       | 버전 미리보기                | 버전 상태 읽기 전용 미리보기                 | 1. 미리보기 클릭2. 임시 렌더링                                                                              |
| 130 | 버전 히스토리     | VH-05       | 버전 롤백 (Restore)        | 특정 버전으로 맵 전체 복원                  | 1. Restore 클릭2. 확인3. 데이터 덮어쓰기                                                                    |
| 131 | 버전 히스토리     | VH-06       | 작성자/시각 표시              | 버전별 작성자·시각 표시                    | 1. 목록 조회2. 메타 정보 표시                                                                              |
| 132 | 저장          | SAVE-01     | 자동 저장                  | 편집 후 debounce 자동 저장              | 1. 타이머 리셋2. 만료 시 API 호출                                                                          |
| 133 | 저장          | SAVE-02     | 저장 상태 표시               | 저장 중·완료·실패 UI 표시                 | 1. 상태별 텍스트/아이콘 표시                                                                                |
| 134 | 저장          | SAVE-03     | 멱등성 보장                 | 중복 저장 방지                         | 1. 상태 비교2. 변경 없을 시 스킵                                                                            |
| 135 | 저장          | SAVE-04     | 충돌 해소                  | 서버·클라이언트 충돌 처리                   | 1. 버전 비교2. 충돌 정책(LWW 등) 적용                                                                       |
| 136 | 저장          | SAVE-05     | 자동 재시도                 | 저장 실패 시 지수 백오프 재시도               | 1. 실패 감지2. 지수 백오프 기반 재시도                                                                         |
| 137 | 저장          | SAVE-06     | localStorage 백업        | 장애 시 로컬 임시 저장                    | 1. 네트워크 오류 감지2. localStorage 저장                                                                  |
| 138 | 저장          | SAVE-07     | Undo/Redo 연동           | 히스토리 결과도 autosave                | 1. 히스토리 실행2. 변경 감지 및 저장                                                                          |
| 139 | 태그          | TAG-01      | 태그 추가                  | 노드에 태그 연결                        | 1. 태그 입력2. node_tags 저장3. 배지 표시                                                                  |
| 140 | 태그          | TAG-02      | 태그 제거                  | 노드에서 태그 연결 해제                    | 1. 배지 클릭2. 레코드 삭제                                                                                |
| 141 | 태그          | TAG-03      | 태그 탐색기                 | 전체 태그 목록 및 노드 관리                 | 1. 패널 열기2. 목록 및 연결 노드 표시                                                                         |
| 142 | 태그          | TAG-04      | 태그 필터                  | 특정 태그 노드 강조·필터링                  | 1. 태그 선택2. 보유 노드 강조/나머지 dim                                                                      |
| 143 | 태그          | TAG-05      | 태그 생성                  | 새 태그 생성                          | 1. 이름 입력2. 생성 및 색상 부여                                                                            |
| 144 | 태그          | TAG-06      | 태그 수정                  | 태그 이름·색상 변경                      | 1. 수정2. 저장 및 전역 반영                                                                               |
| 145 | 태그          | TAG-07      | 태그 삭제                  | 태그 전체 삭제 및 연결 해제                 | 1. 삭제 요청2. 모든 연결 cascade 삭제                                                                      |
| 146 | 태그          | TAG-08      | 태그 색상                  | 태그별 고유 색상 지정                     | 1. picker 선택2. tags.color 저장                                                                     |
| 147 | 검색          | SEARCH-01   | 텍스트 검색                 | 맵 내 텍스트 검색                       | 1. 검색창 열기2. 텍스트 입력 및 강조                                                                          |
| 148 | 검색          | SEARCH-02   | 태그 검색                  | 태그 기반 노드 검색                      | 1. 태그 모드 전환2. 검색 및 결과 표시                                                                         |
| 149 | 검색          | SEARCH-03   | 결과 하이라이트               | 검색 결과 노드 시각적 강조                  | 1. 일치 텍스트 부분 색상 표시                                                                               |
| 150 | 검색          | SEARCH-04   | 결과 이동                  | 검색 결과 간 순서 이동                    | 1. 이동 버튼 클릭2. 뷰포트 이동                                                                             |
| 151 | 검색          | SEARCH-05   | 검색 닫기                  | 검색 종료 및 하이라이트 해제                 | 1. ESC/닫기2. 하이라이트 제거                                                                             |
| 152 | 단축키         | KS-01       | 노드 편집 단축키              | 노드 추가·삭제·편집·복제·복붙 키보드 조작           | 1. 단축키 입력2. 해당 노드 동작 실행3. 즉시 반영                                                               |
| 153 | 단축키         | KS-02       | 노드 선택 단축키              | 단일·다중·범위·전체 선택 키보드 조작                | 1. 단축키 입력2. 선택 상태 변경3. UI 업데이트                                                                |
| 154 | 단축키         | KS-03       | 캔버스 조작 단축키             | 줌·팬·전체보기·포커스 등 뷰포트 조작               | 1. 단축키 입력2. 뷰포트 변환3. 즉시 적용                                                                    |
| 155 | 단축키         | KS-04       | 히스토리 단축키               | Undo / Redo                       | 1. Ctrl+Z / Ctrl+Y 입력2. 히스토리 스택 조작3. 상태 복원                                                   |
| 156 | 단축키         | KS-05       | 검색·기타 단축키              | 검색 패널 열기, 도움말 팝업 토글                 | 1. 단축키 입력2. 패널/팝업 활성화3. 내용 표시                                                                 |
| 157 | 단축키         | KS-06       | Kanban 단축키 규칙          | Kanban 레이아웃 depth별 단축키 동작 차이       | 1. depth 확인2. depth별 동작 분기3. 실행                                                                |
| 158 | 단축키         | KS-07       | 단축키 도움말 팝업             | ? / Ctrl+/ — 전체 단축키 목록 팝업 표시       | 1. 단축키 입력2. 팝업 렌더링3. 내용 표시                                                                    |
| 159 | 단축키         | KS-08       | 커스텀 단축키                | 사용자 키바인딩 변경 (설정 화면에서 관리)           | 1. 설정 화면 진입2. 바인딩 입력3. 저장 및 적용                                                                |
| 160 | AI          | AI-01       | Generate Mindmap       | 주제 입력으로 자동 생성                    | 1. 주제 입력2. AI 요청 및 수신3. 맵 적용                                                                     |
| 161 | AI          | AI-02       | Expand Node            | 하위 아이디어 자동 확장                    | 1. 노드 선택2. 확장 요청3. 자식 생성                                                                         |
| 162 | AI          | AI-03       | Thread Summarize       | 댓글 스레드 AI 요약                     | 1. 스레드 선택2. 요약 분석 및 텍스트 생성                                                                       |
| 163 | AI          | AI-04       | Task Extraction        | 태스크 자동 추출                        | 1. 분석 요청2. 텍스트 분석3. 태스크 목록 반환                                                                    |
| 164 | AI          | AI-05       | Task Node Gen          | 추출된 태스크를 노드로 생성                  | 1. 결과 확인2. 적용 클릭 및 삽입                                                                            |
| 165 | AI 워크플로우    | WFLOW-01    | Workflow Generate      | AI Workflow 노드 구조 자동 생성          | 1. 요청 입력2. step 노드 설계 및 생성                                                                       |
| 166 | AI 워크플로우    | WFLOW-02    | Step Node 구조           | 단계별 step node 정의                 | 1. 순서 정의2. 실행 조건·내용 저장                                                                           |
| 167 | AI 워크플로우    | WFLOW-03    | Step Status            | 실행 상태 추적                         | 1. 트리거2. stepState 변경 및 UI 갱신                                                                    |
| 168 | AI 워크플로우    | WFLOW-04    | Step Progress          | 실행 진행 상태 표시                      | 1. 배지 표시2. 진행률 시각화                                                                               |
| 169 | AI 워크플로우    | WFLOW-05    | Error Input            | 오류 시 사용자 입력 요청                   | 1. blocked 감지2. 입력 필드 활성화 및 재시도                                                                  |
| 170 | AI 워크플로우    | WFLOW-06    | AI Resolution          | 오류 자동 해결 시도                      | 1. blocked 감지2. AI 분석 및 재시도                                                                      |
| 171 | AI 워크플로우    | WFLOW-07    | Cleanup                | 완료 후 임시 데이터 정리                   | 1. 상태 확인2. 임시 데이터 삭제                                                                             |
| 172 | AI 워크플로우    | WFLOW-08    | Structured Note        | 결과를 구조화된 노트로 저장                  | 1. 결과 수신2. 파싱 및 node_notes 저장                                                                    |
| 173 | AI 워크플로우    | WFLOW-09    | Code Block             | 결과 코드 블록 렌더링 지원                  | 1. 코드 감지2. 언어 식별 및 UI 렌더링                                                                        |
| 174 | AI 워크플로우    | WFLOW-10    | Copy Button            | 코드 블록 복사 버튼 제공                   | 1. 버튼 표시2. 클립보드 복사                                                                               |
| 175 | AI 워크플로우    | WFLOW-11    | Solo-only AI           | 개인 맵에서만 사용 허용                    | 1. map_type 확인2. personal 여부 검증                                                                  |
| 176 | AI 워크플로우    | WFLOW-12    | Collab Restriction     | 협업 맵에서 사용 제한                     | 1. 협업 맵 감지2. UI 비활성화 안내                                                                          |
| 177 | 내보내기        | EXPORT-01   | Export Markdown        | 맵을 Markdown 내보내기                 | 1. 모드 선택2. 변환 및 다운로드                                                                             |
| 178 | 내보내기        | EXPORT-02   | Export HTML            | 맵을 standalone HTML 내보내기          | 1. HTML 생성2. 다운로드                                                                                |
| 179 | 가져오기        | IMPORT-01   | Import Markdown        | Markdown 파일을 맵으로 가져오기            | 1. 파일 선택2. 파싱 및 트리 생성                                                                            |
| 180 | 가져오기        | IMPORT-02   | Outline Mode           | 아웃라인 모드 import                   | 1. 모드 선택2. 리스트를 자식 노드로 변환                                                                        |
| 181 | 가져오기        | IMPORT-03   | Document Mode          | 문서 모드 import (기본)                | 1. 모드 적용2. 본문/리스트를 콘텐츠로 유지                                                                       |
| 182 | 가져오기        | IMPORT-04   | Import Preview         | import 전 파싱 결과 미리보기              | 1. 파일 선택2. 미리보기 표시 및 확인                                                                          |
| 183 | 대시보드        | DASH-01     | Dashboard Mode         | 대시보드 모드 활성화                      | 1. 모드 전환2. 대시보드 형태 표시                                                                            |
| 184 | 대시보드        | DASH-02     | Auto Refresh           | 외부 데이터 주기적 갱신                    | 1. 활성화2. interval마다 API 호출                                                                       |
| 185 | 대시보드        | DASH-03     | Change Highlight       | 갱신 시 변경 항목 강조                    | 1. 갱신 완료2. 비교 및 하이라이트 표시                                                                         |
| 186 | 대시보드        | DASH-04     | Refresh Interval       | 자동 갱신 간격 설정                      | 1. 값 입력 및 저장2. 반영                                                                                |
| 187 | 대시보드        | DASH-05     | External Update API    | 외부 업데이트 API                      | 1. API 호출2. 인증 및 데이터 갱신                                                                          |
| 188 | 번역          | TRANS-01    | Auto Translate         | 노드 텍스트 자동 번역                     | 1. 언어 설정 감지2. API 요청 및 저장                                                                        |
| 189 | 번역          | TRANS-02    | Translation Cache      | 번역 결과 캐시 저장                      | 1. 완료 후 키 기반 캐시 저장                                                                               |
| 190 | 번역          | TRANS-03    | Cache Invalidation     | 원문 변경 시 캐시 무효화                   | 1. 변경 감지2. 해시 무효화 및 재번역 트리거                                                                      |
| 191 | 번역          | TRANS-04    | Skeleton UI            | 번역 대기 중 Skeleton 표시              | 1. 요청 중 Skeleton 표시2. 완료 시 fadeIn 교체                                                             |
| 192 | 번역          | TRANS-05    | Original Toggle        | 번역본에서 원문 토글 조회                   | 1. 아이콘 클릭2. 원문 팝오버 표시                                                                            |
| 193 | 번역          | TRANS-06    | Batch Translate        | 여러 노드 일괄 번역                      | 1. 다중 선택2. 순차 처리 및 갱신                                                                            |
| 194 | 번역          | TRANS-07    | Translation Broadcast  | WebSocket 실시간 전파                 | 1. 완료 이벤트 발행2. 클라이언트 전파 및 갱신                                                                     |
| 195 | 번역          | TRANS-08    | Live Chat Translate    | 채팅 메시지 실시간 번역                    | 1. 메시지 수신2. 감지 및 번역 표시                                                                           |
| 196 | 번역          | TRANS-09    | Language-group Cache   | 언어 그룹별 캐시 공유                     | 1. 그룹 분류2. 캐시 공유 및 히트율 향상                                                                        |
| 197 | 번역          | TRANS-10    | Short Message Guard    | 짧은 메시지 번역 skip                   | 1. 길이 측정2. 임계값 미만 시 skip                                                                         |
| 198 | 번역          | TRANS-11    | Original + Translation | 원문과 번역문 동시 표시                    | 1. 동시 렌더링2. 비교 가능                                                                                |
| 199 | 협업          | COLLAB-01   | 맵 초대                   | 다른 사용자를 협업자 초대                   | 1. 이메일 입력2. 역할 선택3. 발송                                                                           |
| 200 | 협업          | COLLAB-02   | 권한 변경                  | 협업자 역할 변경                        | 1. 목록 확인2. 업데이트 및 적용                                                                             |
| 201 | 협업          | COLLAB-03   | 협업자 제거                 | 협업자 목록에서 삭제                      | 1. 선택2. 레코드 삭제 및 차단                                                                              |
| 202 | 협업          | COLLAB-04   | 실시간 동기화                | 동시 편집 실시간 반영                     | 1. WebSocket 이벤트 브로드캐스트                                                                          |
| 203 | 협업          | COLLAB-05   | LWW 충돌 정책              | 동시 편집 충돌 처리 (나중 승리)              | 1. 시각 기준 나중 값 적용 및 알림                                                                            |
| 204 | 협업          | COLLAB-06   | 변경 수신 및 반영             | 타인 변경 로컬 상태 적용                   | 1. 이벤트 수신2. store 및 렌더링 갱신                                                                       |
| 205 | 협업          | COLLAB-07   | 커서 공유                  | 다른 사용자 커서 위치 표시                  | 1. presence 이벤트 발행2. 아이콘 표시                                                                      |
| 206 | 협업          | COLLAB-08   | Soft Lock              | 편집 중인 노드 잠금 표시                   | 1. 시작 이벤트 발행2. 타 사용자 화면에 잠금 표시                                                                   |
| 207 | 협업          | COLLAB-09   | Lock 해제                | 편집 완료 후 잠금 자동 해제                 | 1. 완료 이벤트 발행2. 표시 해제                                                                             |
| 208 | 협업          | COLLAB-10   | Node Thread            | 노드에 댓글 스레드 추가                    | 1. 패널 열기2. 댓글 저장 및 알림                                                                            |
| 209 | 협업          | COLLAB-11   | Thread Reply           | 스레드에 답글 추가                       | 1. 답글 입력2. 저장 및 알림                                                                               |
| 210 | 협업          | COLLAB-12   | Thread Resolve         | 스레드 해결 완료 처리                     | 1. Resolve 클릭2. 상태 변경 및 표시                                                                       |
| 211 | 협업          | COLLAB-13   | Thread Mention         | @멘션 사용자 태그                       | 1. @입력 및 선택2. 알림 발송                                                                              |
| 212 | 협업          | COLLAB-14   | AI Thread Summary      | 스레드 내용 AI 요약                     | 1. 요약 버튼 클릭2. 분석 및 상단 표시                                                                         |
| 213 | 협업          | COLLAB-15   | AI Task Extraction     | 스레드에서 태스크 추출                     | 1. 분석 요청2. 결과 노드 생성                                                                              |
| 214 | 협업          | COLLAB-16   | 접속자 목록                 | 현재 접속자 실시간 표시                    | 1. presence 연결 및 수신2. 아바타 표시                                                                     |
| 215 | 협업          | COLLAB-17   | 접속자 수 표시               | 현재 동시 접속자 수 표시                   | 1. 집계 및 툴바 표시                                                                                    |
| 216 | 채팅          | CHAT-01     | 맵 채팅 패널                | 실시간 채팅 패널 열기                     | 1. 버튼 클릭2. 내역 로딩                                                                                 |
| 217 | 채팅          | CHAT-02     | 메시지 전송                 | 채팅 입력 및 전송                       | 1. 입력 및 전송2. 패널 표시                                                                               |
| 218 | 채팅          | CHAT-03     | 이전 메시지 로딩              | 스크롤 up 시 페이징 로딩                  | 1. 스크롤 감지2. API 호출 및 추가                                                                          |
| 219 | 채팅          | CHAT-04     | 전송 대상 지정               | 특정 사용자 지정 메시지                    | 1. 수신자 선택2. 해당 사용자에게만 표시                                                                         |
| 220 | 채팅          | CHAT-05     | @멘션                    | 채팅에서 특정 사용자 멘션                   | 1. @사용자 입력2. 알림 전송                                                                               |
| 221 | 채팅          | CHAT-06     | 미확인 @멘션 표시             | 읽지 않은 멘션 알림 배지                   | 1. 배지 표시2. 확인 시 해제                                                                               |
| 222 | 채팅          | CHAT-07     | 1:1 DM                 | 특정 사용자와 다이렉트 메시지                 | 1. 사용자 선택2. 전용 패널 메시지 전송                                                                         |
| 223 | 공유/게시       | PUBL-01     | 맵 게시                   | 외부 읽기 전용 공개                      | 1. 범위 선택2. URL 생성                                                                                |
| 224 | 공유/게시       | PUBL-02     | 게시 취소                  | 비공개 전환                           | 1. unpublish 선택2. URL 비활성화                                                                       |
| 225 | 공유/게시       | PUBL-03     | 공개 뷰 렌더링               | 읽기 전용 viewer 표시                  | 1. URL 접근2. viewer 렌더링                                                                           |
| 226 | 공유/게시       | PUBL-04     | 공유 링크 복사               | URL 클립보드 복사                      | 1. 버튼 클릭2. 클립보드 저장                                                                               |
| 227 | WBS         | WBS-01      | WBS 모드 전환              | WBS 보기 모드 활성화                    | 1. 토글 활성화2. 인디케이터 표시                                                                             |
| 228 | WBS         | WBS-02      | 일정 설정                  | 시작일·종료일 설정                       | 1. DatePicker 선택2. node_schedules 저장                                                             |
| 229 | WBS         | WBS-03      | 마일스톤 설정                | 노드 마일스톤 지정                       | 1. 토글 활성화2. ◆ 마커 표시                                                                              |
| 230 | WBS         | WBS-04      | 진척률 설정                 | 완료율 0~100% 입력                    | 1. 슬라이더 조정2. progress 저장                                                                         |
| 231 | WBS         | WBS-05      | WBS 인디케이터              | 일정·진척률 등 렌더링                     | 1. 데이터 확인2. 상태별 색상 표시                                                                            |
| 232 | 리소스         | RES-01      | 리소스 할당 패널              | 담당자 할당 패널 열기                     | 1. 패널 오픈2. 목록 표시                                                                                 |
| 233 | 리소스         | RES-02      | 담당자 검색/추가              | 검색 후 노드 추가                       | 1. 사용자 검색2. 선택 및 아바타 표시                                                                          |
| 234 | 리소스         | RES-03      | 역할 지정                  | 담당자 역할 지정                        | 1. 역할 선택 및 저장                                                                                    |
| 235 | 리소스         | RES-04      | 공수 입력                  | 예상 공수 입력                         | 1. 숫자 입력 및 저장                                                                                    |
| 236 | 리소스         | RES-05      | 아바타 인디케이터              | 노드에 담당자 아바타 표시                   | 1. 조건부 아바타 렌더링                                                                                   |
| 237 | Obsidian 연동 | OBS-01      | Obsidian 가져오기          | vault 파일을 맵으로 import             | 1. 파일 선택2. 파싱 및 적용                                                                               |
| 238 | Obsidian 연동 | OBS-02      | 맵 내보내기                 | 맵을 Obsidian vault 내보내기           | 1. .md 변환 및 저장                                                                                   |
| 239 | Obsidian 연동 | OBS-03      | Vault 연결 설정            | vault 경로 연결 설정                   | 1. 경로 입력 및 테스트                                                                                   |
| 240 | Obsidian 연동 | OBS-04      | 변경 감지 동기화              | 파일 변경 시 맵 자동 업데이트                | 1. 변경 감지 및 파싱                                                                                    |
| 241 | Obsidian 연동 | OBS-05      | Wikilink 처리            | Obsidian [[파일명]] 처리              | 1. 링크 감지 및 연결                                                                                    |
| 242 | Redmine 연동  | RDMN-01     | Redmine 연동 설정          | URL·API Key 설정                   | 1. 설정 저장 및 테스트                                                                                   |
| 243 | Redmine 연동  | RDMN-02     | Pull 동기화               | Issue 데이터를 맵으로 가져오기              | 1. API 호출 및 생성                                                                                   |
| 244 | Redmine 연동  | RDMN-03     | Push 동기화               | 맵 노드를 Issue로 내보내기                | 1. 변환 및 Redmine 생성                                                                               |
| 245 | Redmine 연동  | RDMN-04     | 노드 생성→Issue 생성         | 생성 시 자동 Issue 생성                 | 1. 이벤트 감지 및 API 호출                                                                               |
| 246 | Redmine 연동  | RDMN-05     | 노드 수정→Issue 업데이트       | 수정 시 자동 Issue 업데이트               | 1. 변경 감지 및 PATCH 호출                                                                              |
| 247 | Redmine 연동  | RDMN-06     | 노드 삭제→Issue 삭제         | 삭제 시 자동 Issue 삭제                 | 1. 삭제 이벤트 감지 및 API 호출                                                                            |
| 248 | Redmine 연동  | RDMN-07     | 동기화 상태 인디케이터           | sync_status 아이콘 표시               | 1. 상태별 아이콘 표시                                                                                    |
| 249 | Redmine 연동  | RDMN-08     | Redmine Plugin 탭       | 관리 전용 탭                          | 1. 탭 선택 및 관리                                                                                     |
| 250 | 설정          | SETT-01     | 프로필 설정                 | 프로필 정보 수정                        | 1. 정보 수정 및 저장                                                                                    |
| 251 | 설정          | SETT-02     | 테마 설정                  | 라이트·다크 테마 선택                     | 1. 테마 저장 및 적용                                                                                    |
| 252 | 설정          | SETT-03     | 언어/번역 설정               | UI 언어 및 기본 설정                    | 1. 언어 변경 및 저장                                                                                    |
| 253 | 설정          | SETT-04     | 기본 레이아웃 설정             | 신규 맵 기본 레이아웃                     | 1. 타입 선택 및 저장                                                                                    |
| 254 | 설정          | SETT-05     | UI 표시 설정               | 인디케이터 등 표시 설정                    | 1. 토글 저장 및 적용                                                                                    |
| 255 | 설정          | SETT-06     | 맵별 설정 오버라이드            | 개별 맵 설정 덮어쓰기                     | 1. 개별 저장 및 적용                                                                                    |
| 256 | 설정          | SETT-07     | API Key 관리             | 연동용 API Key 관리                   | 1. 암호화 저장 및 사용                                                                                   |
