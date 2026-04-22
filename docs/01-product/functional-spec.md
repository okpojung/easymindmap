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

| 그룹 | 기능ID | 기능명 | 설명 | 주요 동작 | 단계 |
|------|--------|--------|------|-----------|------|

| MAP | MAP-01 | Create Map | 새로운 Mindmap 생성 | Root Node 생성 | MVP |
| MAP | MAP-02 | Open Map | 기존 Map 열기 | DB에서 Node Tree 로딩 | MVP |
| MAP | MAP-03 | Rename Map | Map 이름 변경 | Title 수정 | MVP |
| MAP | MAP-04 | Delete Map | Map 삭제 | Map + Node Tree 삭제 | MVP |
| MAP | MAP-05 | Map List | Map 목록 조회 | 사용자 Map 리스트 | MVP |

| NODE | NODE-01 | Create Sibling Node-after | 형제 Node 생성(다음) | Shift + Space | MVP |
| NODE | NODE-02 | Create Sibling Node-before | 형제 Node 생성(이전) | Shift + Ctrl + Space | MVP |
| NODE | NODE-03 | Create Child Node | 자식 Node 생성 | Space | MVP |
| NODE | NODE-04 | Create Child Node (multi) | 자식 Node 다중 생성 | Ctrl + Space | MVP |
| NODE | NODE-05 | Edit Node Text | Node 텍스트 편집 | Double Click | MVP |
| NODE | NODE-06 | Delete Node | Node 삭제 | Delete | MVP |
| NODE | NODE-07 | Move Node | Node 이동 | Drag | MVP |
| NODE | NODE-08 | Copy Node | Node 복사 | Ctrl+C | MVP |
| NODE | NODE-09 | Paste Node | Node 붙여넣기 | Ctrl+V | MVP |
| NODE | NODE-10 | Duplicate Node | Node 복제 | Ctrl+D | MVP |
| NODE | NODE-11 | Collapse Node | Node 접기 | Click | MVP |
| NODE | NODE-12 | Expand Node | Node 펼치기 | Click | MVP |

| NODE-IND | IND-01 | Add Parent Node | 부모 노드 삽입 | Indicator 클릭 | MVP |
| NODE-IND | IND-02 | Add Child Node | 자식 노드 추가 | Indicator 클릭 | MVP |
| NODE-IND | IND-03 | Add Sibling Before | 이전 형제 생성 | Indicator 클릭 | MVP |
| NODE-IND | IND-04 | Add Sibling After | 다음 형제 생성 | Indicator 클릭 | MVP |
| NODE-IND | IND-05 | Indicator Toggle | 인디케이터 ON/OFF | 설정 | MVP |

| CONTENT | NC-01 | Text Input | 텍스트 입력 | 키보드 | MVP |
| CONTENT | NC-02 | Manual Line Break | 수동 줄바꿈 | Enter | MVP |
| CONTENT | NC-03 | Auto Wrap | 자동 줄바꿈 | width 기준 | MVP |
| CONTENT | NC-04 | Note Content | 노트 입력 | 별도 패널 | MVP |
| CONTENT | NC-05 | List Content | 리스트 구조 | markdown | MVP |
| CONTENT | NC-06 | Code Block | 코드블럭 | ``` | MVP |

| STYLE | NS-01 | Text Color | 글자 색상 | UI 선택 | MVP |
| STYLE | NS-02 | Background Color | 배경 색상 | UI 선택 | MVP |
| STYLE | NS-03 | Font Style | bold/size | toolbar | MVP |
| STYLE | NS-04 | Border | 테두리 | UI | MVP |
| STYLE | NS-05 | Icon | 아이콘 | emoji | MVP |

| RENDER | NR-01 | Markdown Render | markdown 렌더링 | parser | MVP |
| RENDER | NR-02 | Code Render | 코드 렌더링 | monospace | MVP |
| RENDER | NR-03 | Auto Size | 자동 크기 | content 기반 | MVP |
| RENDER | NR-04 | Overflow Control | overflow 처리 | ellipsis | MVP |
| RENDER | NR-05 | Zoom LOD | zoom 대응 | scale | MVP |

| MD | MDP-01 | Heading Parse | # → depth | parser | MVP |
| MD | MDP-02 | List Parse | list 처리 | parser | MVP |
| MD | MDP-03 | Document Mode | 문서형 변환 | import | MVP |
| MD | MDP-04 | Outline Mode | 아웃라인 변환 | import | MVP |

| LAYOUT | LAY-01 | Change Layout | 전체 변경 | 메뉴 | MVP |
| LAYOUT | LAY-02 | Subtree Layout | 부분 변경 | 메뉴 | MVP |
| LAYOUT | LAY-03 | Auto Layout | 자동 배치 | 버튼 | MVP |

| KANBAN | KAN-01 | Add Column | 컬럼 생성 | UI | MVP |
| KANBAN | KAN-02 | Add Card | 카드 생성 | UI | MVP |
| KANBAN | KAN-03 | Move Card | 카드 이동 | Drag | MVP |

| CANVAS | CAN-01 | Zoom In | 확대 | Ctrl + = | MVP |
| CANVAS | CAN-02 | Zoom Out | 축소 | Ctrl + - | MVP |
| CANVAS | CAN-03 | Pan | 이동 | Drag | MVP |
| CANVAS | CAN-04 | Center Node | 중앙 이동 | Ctrl+Enter | MVP |

| SELECT | SEL-01 | Single Select | 단일 선택 | Click | MVP |
| SELECT | SEL-02 | Multi Select | 다중 선택 | Shift | MVP |
| SELECT | SEL-03 | Area Select | 영역 선택 | Drag | MVP |

| HISTORY | HIS-01 | Undo | 되돌리기 | Ctrl+Z | MVP |
| HISTORY | HIS-02 | Redo | 복원 | Ctrl+Y | MVP |

| VERSION | VH-01 | Snapshot | 버전 생성 | autosave | V1 |
| VERSION | VH-02 | Restore | 복원 | 버튼 | V1 |

| SAVE | SAVE-01 | Auto Save | 자동 저장 | debounce | MVP |
| SAVE | SAVE-02 | Manual Save | 수동 저장 | 버튼 | MVP |

| TAG | TAG-01 | Add Tag | 태그 추가 | UI | MVP |
| TAG | TAG-02 | Filter Tag | 태그 필터 | UI | MVP |

| SEARCH | SRCH-01 | Text Search | 텍스트 검색 | 입력 | MVP |
| SEARCH | SRCH-02 | Highlight | 강조 표시 | UI | MVP |

| KEY | KEY-01 | Shortcut | 단축키 실행 | 키보드 | MVP |

| AI | AI-01 | Generate Map | AI 생성 | Prompt | MVP |
| AI | AI-02 | Expand Node | 노드 확장 | 버튼 | MVP |

| AI-WF | WF-01 | Workflow Generate | 단계 생성 | AI | V1.5 |
| AI-WF | WF-02 | Step Execute | 단계 실행 | UI | V1.5 |

| EXPORT | EXP-01 | Export Markdown | md 저장 | 파일 | MVP |
| EXPORT | EXP-02 | Export HTML | html 저장 | 파일 | MVP |

| IMPORT | IMP-01 | Import Markdown | md 읽기 | parser | MVP |

| DASH | DASH-01 | Dashboard View | 대시보드 | read-only | V3 |

| TRANS | TRANS-01 | Node Translate | 노드 번역 | API | V2 |
| TRANS | TRANS-02 | Chat Translate | 채팅 번역 | API | V2 |

| COLLAB | COL-01 | Invite | 초대 | UI | V1 |
| COLLAB | COL-02 | Sync | 실시간 동기화 | WS | V1 |

| CHAT | CHAT-01 | Send Message | 채팅 | Enter | V2 |
| CHAT | CHAT-02 | Mention | 멘션 | @ | V2 |

| SHARE | PUB-01 | Publish | 공개 | URL | MVP |
| SHARE | PUB-02 | Share | 공유 | 링크 | MVP |

| WBS | WBS-01 | Schedule | 일정 | 날짜 | V1 |

| RESOURCE | RES-01 | Assign | 담당자 | UI | V1 |

| OBS | OBS-01 | Obsidian Sync | vault 연동 | API | V1 |

| REDMINE | RED-01 | Issue Sync | 이슈 연동 | API | V1 |

| SETTINGS | SET-01 | Theme | 테마 | UI | MVP |
| SETTINGS | SET-02 | Language | 언어 | 설정 | MVP |
