# easymindmap — 전체 기능 명세서

**최종 업데이트:** 2026-04-17
**출처:** 기능정의테이블 + docs/features 문서 통합 정리
**변경 이력:**
- 2026-04-17 — main 브랜치 동기화 확인(문서 반영 커밋 체인 유지)
- 2026-04-17 — main 반영 확인: EDGE-07~09, KANBAN 상세 참조, PUBLISH/SHARE 권한(scope) 항목 유지
- 2026-04-17 — 반영 재확인: KANBAN 상세 참조(`docs/03-editor-core/canvas/09-kanban.md`), PUBLISH/SHARE 권한 문구, EDGE-07~09(재라우팅/오프셋/전환) 유지
- 2026-04-16 — KANBAN/WBS 참조 경로 정정, Publish/Share 권한 표현을 COLLAB scope 정책과 정합화
- 2026-04-16 — CHAT-06(미확인 @멘션), CHAT-07(1:1 DM V3) 추가
- 2026-04-16 — NODE STYLE(NS), NODE BG IMAGE(IMG), NODE RENDERING(NR), EDGE POLICY, VERSION HISTORY(VH), PUBLISH/SHARE(PUBL), SETTINGS(SETT), IMPORT(IMPORT), OBSIDIAN(OBS) 기능군 추가; 목차 및 기능 수 요약 갱신
- 2026-04-16 — 참조 문서 경로 정정 (map-model.md, node-model.md → domain-models.md; prd.md → vision.md + mvp-scope.md), 로드맵 단계 정렬 수정, 기능 수 요약 갱신
- 2026-03-31 — Kanban 레이아웃 기능 ID 추가, node-background-image 반영, P0-A~C 수정사항 통합

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
## 전체 기능 목록 (FULL)

| NO  | 그룹       | 기능ID     | 기능명                        | 설명                           | 주요 동작                  | 단계   |
|-----|----------|-----------|------------------------------|-------------------------------|--------------------------|------|

| 1   | MAP      | MAP-01    | Create Map                   | 새로운 Mindmap 생성               | Root Node 생성             | MVP  |
| 2   | MAP      | MAP-02    | Open Map                     | 기존 Map 열기                    | DB에서 Node Tree 로딩       | MVP  |
| 3   | MAP      | MAP-03    | Rename Map                   | Map 이름 변경                    | Title 수정                 | MVP  |
| 4   | MAP      | MAP-04    | Delete Map                   | Map 삭제                        | Map + Node Tree 삭제      | MVP  |
| 5   | MAP      | MAP-05    | Map List                     | Map 목록 조회                    | 사용자 Map 리스트             | MVP  |

| 6   | NODE     | NODE-01   | Create Sibling Node-after    | 형제 Node 생성(다음)               | Shift + Space             | MVP  |
| 7   | NODE     | NODE-02   | Create Sibling Node-before   | 형제 Node 생성(이전)               | Shift + Ctrl + Space      | MVP  |
| 8   | NODE     | NODE-03   | Create Child Node            | 자식 Node 생성                   | Space                     | MVP  |
| 9   | NODE     | NODE-04   | Create Child Node (multi)    | 자식 Node 다중 생성                | Ctrl + Space              | MVP  |
| 10  | NODE     | NODE-05   | Edit Node Text               | Node 텍스트 편집                  | Double Click               | MVP  |
| 11  | NODE     | NODE-06   | Delete Node                  | Node 삭제                        | Delete                    | MVP  |
| 12  | NODE     | NODE-07   | Move Node                    | Node 이동                        | Drag                      | MVP  |
| 13  | NODE     | NODE-08   | Copy Node                    | Node 복사                        | Ctrl+C                    | MVP  |
| 14  | NODE     | NODE-09   | Paste Node                   | Node 붙여넣기                    | Ctrl+V                    | MVP  |
| 15  | NODE     | NODE-10   | Duplicate Node               | Node 복제                        | Ctrl+D                    | MVP  |
| 16  | NODE     | NODE-11   | Collapse Node                | Node 접기                        | Click                     | MVP  |
| 17  | NODE     | NODE-12   | Expand Node                  | Node 펼치기                      | Click                     | MVP  |

| 18  | NODE-IND | IND-01    | Add Parent Node              | 부모 노드 삽입                    | Indicator 클릭              | MVP  |
| 19  | NODE-IND | IND-02    | Add Child Node               | 자식 노드 추가                    | Indicator 클릭              | MVP  |
| 20  | NODE-IND | IND-03    | Add Sibling Before           | 이전 형제 생성                    | Indicator 클릭              | MVP  |
| 21  | NODE-IND | IND-04    | Add Sibling After            | 다음 형제 생성                    | Indicator 클릭              | MVP  |
| 22  | NODE-IND | IND-05    | Indicator Toggle             | 인디케이터 ON/OFF                 | 설정                        | MVP  |

| 23  | CONTENT  | NC-01     | Text Input                   | 텍스트 입력                       | 키보드                       | MVP  |
| 24  | CONTENT  | NC-02     | Manual Line Break            | 수동 줄바꿈                       | Enter                      | MVP  |
| 25  | CONTENT  | NC-03     | Auto Wrap                    | 자동 줄바꿈                       | width 기준                  | MVP  |
| 26  | CONTENT  | NC-04     | Note Content                 | 노트 입력                         | 별도 패널                    | MVP  |
| 27  | CONTENT  | NC-05     | List Content                 | 리스트 구조                       | markdown                   | MVP  |
| 28  | CONTENT  | NC-06     | Code Block                   | 코드블럭                          | ```                        | MVP  |

| 29  | STYLE    | NS-01     | Text Color                   | 글자 색상                         | UI 선택                     | MVP  |
| 30  | STYLE    | NS-02     | Background Color             | 배경 색상                         | UI 선택                     | MVP  |
| 31  | STYLE    | NS-03     | Font Style                   | bold/size                       | toolbar                   | MVP  |
| 32  | STYLE    | NS-04     | Border                       | 테두리                            | UI                         | MVP  |
| 33  | STYLE    | NS-05     | Icon                         | 아이콘                            | emoji                      | MVP  |

| 34  | RENDER   | NR-01     | Markdown Render              | markdown 렌더링                  | parser                    | MVP  |
| 35  | RENDER   | NR-02     | Code Render                  | 코드 렌더링                       | monospace                  | MVP  |
| 36  | RENDER   | NR-03     | Auto Size                    | 자동 크기                         | content 기반               | MVP  |
| 37  | RENDER   | NR-04     | Overflow Control             | overflow 처리                    | ellipsis                   | MVP  |
| 38  | RENDER   | NR-05     | Zoom LOD                     | zoom 대응                        | scale                      | MVP  |

| 39  | MD       | MDP-01    | Heading Parse                | # → depth                       | parser                    | MVP  |
| 40  | MD       | MDP-02    | List Parse                   | list 처리                         | parser                    | MVP  |
| 41  | MD       | MDP-03    | Document Mode                | 문서형 변환                        | import                    | MVP  |
| 42  | MD       | MDP-04    | Outline Mode                 | 아웃라인 변환                       | import                    | MVP  |

| 43  | LAYOUT   | LAY-01    | Change Layout                | 전체 변경                          | 메뉴                        | MVP  |
| 44  | LAYOUT   | LAY-02    | Subtree Layout               | 부분 변경                          | 메뉴                        | MVP  |
| 45  | LAYOUT   | LAY-03    | Auto Layout                  | 자동 배치                          | 버튼                        | MVP  |

| 46  | KANBAN   | KAN-01    | Add Column                   | 컬럼 생성                          | UI                         | MVP  |
| 47  | KANBAN   | KAN-02    | Add Card                     | 카드 생성                          | UI                         | MVP  |
| 48  | KANBAN   | KAN-03    | Move Card                    | 카드 이동                          | Drag                       | MVP  |

| 49  | CANVAS   | CAN-01    | Zoom In                      | 확대                              | Ctrl + =                  | MVP  |
| 50  | CANVAS   | CAN-02    | Zoom Out                     | 축소                              | Ctrl + -                  | MVP  |
| 51  | CANVAS   | CAN-03    | Pan                          | 이동                              | Drag                       | MVP  |
| 52  | CANVAS   | CAN-04    | Center Node                  | 중앙 이동                          | Ctrl+Enter                | MVP  |

| 53  | SELECT   | SEL-01    | Single Select                | 단일 선택                          | Click                      | MVP  |
| 54  | SELECT   | SEL-02    | Multi Select                 | 다중 선택                          | Shift                      | MVP  |
| 55  | SELECT   | SEL-03    | Area Select                  | 영역 선택                          | Drag                       | MVP  |

| 56  | HISTORY  | HIS-01    | Undo                         | 되돌리기                           | Ctrl+Z                    | MVP  |
| 57  | HISTORY  | HIS-02    | Redo                         | 복원                              | Ctrl+Y                    | MVP  |

| 58  | VERSION  | VH-01     | Snapshot                     | 버전 생성                          | autosave                  | V1   |
| 59  | VERSION  | VH-02     | Restore                      | 복원                              | 버튼                        | V1   |

| 60  | SAVE     | SAVE-01   | Auto Save                    | 자동 저장                          | debounce                  | MVP  |
| 61  | SAVE     | SAVE-02   | Manual Save                  | 수동 저장                          | 버튼                        | MVP  |

| 62  | TAG      | TAG-01    | Add Tag                      | 태그 추가                          | UI                         | MVP  |
| 63  | TAG      | TAG-02    | Filter Tag                   | 태그 필터                          | UI                         | MVP  |

| 64  | SEARCH   | SRCH-01   | Text Search                  | 텍스트 검색                        | 입력                        | MVP  |
| 65  | SEARCH   | SRCH-02   | Highlight                    | 강조 표시                          | UI                         | MVP  |

| 66  | KEYBOARD | KS-01     | 노드 편집 단축키               | 노드 추가·삭제·편집·복제·복붙 키보드 조작  | 단축키 입력                   | MVP  |
| 67  | KEYBOARD | KS-02     | 노드 선택 단축키               | 단일·다중·범위·전체 선택 키보드 조작      | 단축키 입력                   | MVP  |
| 68  | KEYBOARD | KS-03     | 캔버스 조작 단축키              | 줌·팬·전체보기·포커스 등 뷰포트 조작     | 단축키 입력                   | MVP  |
| 69  | KEYBOARD | KS-04     | 히스토리 단축키                | Undo / Redo                       | Ctrl+Z / Ctrl+Y           | MVP  |
| 70  | KEYBOARD | KS-05     | 검색·기타 단축키               | 검색 패널 열기, 도움말 팝업 토글          | 단축키 입력                   | MVP  |
| 71  | KEYBOARD | KS-06     | Kanban 단축키 규칙             | Kanban 레이아웃 depth별 단축키 동작 차이  | depth별 분기                 | MVP  |
| 72  | KEYBOARD | KS-07     | 단축키 도움말 팝업              | ? / Ctrl+/ — 전체 단축키 목록 팝업 표시  | 팝업 열기                    | V1   |
| 73  | KEYBOARD | KS-08     | 커스텀 단축키                  | 사용자 키바인딩 변경 (설정 화면에서 관리)  | 설정 화면                    | V3   |

| 74  | AI       | AI-01     | Generate Map                 | AI 생성                           | Prompt                    | MVP  |
| 75  | AI       | AI-02     | Expand Node                  | 노드 확장                          | 버튼                        | MVP  |

| 76  | AI-WF    | WF-01     | Workflow Generate            | 단계 생성                          | AI                         | V1.5 |
| 77  | AI-WF    | WF-02     | Step Execute                 | 단계 실행                          | UI                         | V1.5 |

| 78  | EXPORT   | EXP-01    | Export Markdown              | md 저장                           | 파일                        | MVP  |
| 79  | EXPORT   | EXP-02    | Export HTML                  | html 저장                         | 파일                        | MVP  |

| 80  | IMPORT   | IMP-01    | Import Markdown              | md 읽기                           | parser                    | MVP  |

| 81  | DASH     | DASH-01   | Dashboard View               | 대시보드                           | read-only                 | V3   |

| 82  | TRANS    | TRANS-01  | Node Translate               | 노드 번역                          | API                        | V2   |
| 83  | TRANS    | TRANS-02  | Chat Translate               | 채팅 번역 (그룹 채팅 + DM 공통 적용)   | API                        | V2   |

| 84  | COLLAB   | COL-01    | Invite                       | 초대                              | UI                         | V1   |
| 85  | COLLAB   | COL-02    | Sync                         | 실시간 동기화                        | WS                         | V1   |

| 86  | CHAT     | CHAT-01   | Send Message                 | 채팅                              | Enter                      | V2   |
| 87  | CHAT     | CHAT-02   | Mention                      | 멘션                              | @                          | V2   |

| 88  | SHARE    | PUB-01    | Publish                      | 공개                              | URL                        | MVP  |
| 89  | SHARE    | PUB-02    | Share                        | 공유                              | 링크                        | MVP  |

| 90  | WBS      | WBS-01    | Schedule                     | 일정                              | 날짜                        | V1   |

| 91  | RESOURCE | RES-01    | Assign                       | 담당자                             | UI                         | V1   |

| 92  | OBS      | OBS-01    | Obsidian Sync                | vault 연동                        | API                        | V1   |

| 93  | REDMINE  | RED-01    | Issue Sync                   | 이슈 연동                          | API                        | V1   |

| 94  | SETTINGS | SET-01    | Theme                        | 테마                              | UI                         | MVP  |
| 95  | SETTINGS | SET-02    | Language                     | 언어                              | 설정                        | MVP  |
