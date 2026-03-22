# easymindmap — 전체 기능 명세서

> 최종 업데이트: 2026-03-23  
> 출처: 기능정의테이블 + docs/features 문서 통합 정리

---

## 목차

1. [MAP — 맵 관리](#1-map--맵-관리)
2. [NODE — 노드 조작](#2-node--노드-조작)
3. [LAYOUT — 레이아웃](#3-layout--레이아웃)
4. [CANVAS — 캔버스 조작](#4-canvas--캔버스-조작)
5. [SELECTION — 선택](#5-selection--선택)
6. [HISTORY — 실행 취소/복원](#6-history--실행-취소복원)
7. [SAVE — 저장](#7-save--저장)
8. [TAG — 태그](#8-tag--태그)
9. [SEARCH — 검색](#9-search--검색)
10. [AI — AI 기능](#10-ai--ai-기능)
11. [EXPORT — 내보내기](#11-export--내보내기)
12. [DASHBOARD — 대시보드 맵 (V3)](#12-dashboard--대시보드-맵-v3)
13. [TRANSLATION — 다국어 번역 (V2)](#13-translation--다국어-번역-v2)
14. [개발 단계별 로드맵](#14-개발-단계별-로드맵)

---

## 1. MAP — 맵 관리

| 기능ID | 기능명 | 설명 | 주요 동작 |
|--------|--------|------|-----------|
| MAP-01 | Create Map | 새로운 Mindmap 생성 | Root Node 생성 |
| MAP-02 | Open Map | 기존 Map 열기 | DB에서 Node Tree 로딩 |
| MAP-03 | Rename Map | Map 이름 변경 | Map Title 수정 |
| MAP-04 | Delete Map | Map 삭제 | Map + Node Tree 삭제 |
| MAP-05 | Map List | Map 목록 조회 | 사용자 Map 리스트 표시 |

---

## 2. NODE — 노드 조작

| 기능ID | 기능명 | 설명 | 단축키 |
|--------|--------|------|--------|
| NODE-01 | Create Sibling Node-after | 형제 Node 생성 (다음) | `LShift + Space` |
| NODE-02 | Create Sibling Node-before | 형제 Node 생성 (이전) | `LShift + Ctrl + Space` |
| NODE-03 | Create Child Node | 자식 Node 생성 | `Space` |
| NODE-04 | Create Child Node (multi) | 자식 Node 다중 생성 | `Ctrl + Space` |
| NODE-05 | Edit Node Text | Node 텍스트 편집 | `Double Click` |
| NODE-06 | Delete Node | Node 삭제 | `Delete` |
| NODE-07 | Move Node | Node Drag 이동 | `Drag` |
| NODE-08 | Copy Node | Node 복사 | `Ctrl + C` |
| NODE-09 | Paste Node | Node 붙여넣기 | `Ctrl + V` |
| NODE-10 | Duplicate Node | Node 복제 | `Ctrl + D` |
| NODE-11 | Collapse Node | Node 접기 | `Click` |
| NODE-12 | Expand Node | Node 펼치기 | `Click` |

---

## 3. LAYOUT — 레이아웃

### 3-1. 레이아웃 기능

| 기능ID | 기능명 | 설명 |
|--------|--------|------|
| LAYOUT-01 | Change Layout | Mindmap 전체 Layout 변경 |
| LAYOUT-02 | Subtree Layout | 특정 Node 이하 Layout 변경 |
| LAYOUT-03 | Auto Layout | 자동 배치 |
| LAYOUT-04 | Layout Reset | Layout 초기화 |

### 3-2. 레이아웃 유형 정의

| 그룹 | 명칭(한글) | 명칭(영문) | 아이콘 | 설명 |
|------|-----------|-----------|--------|------|
| 방사형 | 방사형-양쪽 | Radial-Bidirectional | icon-radial-bi | 중심 노드를 기준으로 좌우 균형 있게 가지가 퍼지는 전통적 마인드맵 형태 |
| 방사형 | 방사형-오른쪽 | Radial-Right | icon-radial-right | 중심 또는 부모 기준으로 하위 노드가 오른쪽 중심으로 퍼지는 형태 |
| 방사형 | 방사형-왼쪽 | Radial-Left | icon-radial-left | 중심 또는 부모 기준으로 하위 노드가 왼쪽 중심으로 퍼지는 형태 |
| 트리형 | 트리형-위쪽 | Tree-Up | icon-tree-up | 부모 기준으로 하위 노드가 위쪽 방향으로 정렬되는 트리형 |
| 트리형 | 트리형-아래쪽 | Tree-Down | icon-tree-down | 부모 기준으로 하위 노드가 아래쪽 방향으로 정렬되는 기본 트리형 |
| 트리형 | 트리형-오른쪽 | Tree-Right | icon-tree-right | 부모 왼쪽, 자식 오른쪽으로 전개되는 일반적인 수평 트리 |
| 트리형 | 트리형-왼쪽 | Tree-Left | icon-tree-left | 부모 오른쪽, 자식 왼쪽으로 전개되는 수평 역방향 트리 |
| 계층형 | 계층형-오른쪽 | Hierarchy-Right | icon-hierarchy-right | 레벨 단위 정렬이 강조되는 좌→우 계층 구조. 조직도/단계형 문서에 적합 |
| 계층형 | 계층형-왼쪽 | Hierarchy-Left | icon-hierarchy-left | 레벨 단위 정렬이 강조되는 우→좌 계층 구조 |
| 진행트리 | 진행트리-오른쪽 | ProcessTree-Right | icon-process-right | 단계 흐름이 왼쪽에서 오른쪽으로 이어지는 절차형 구조 |
| 진행트리 | 진행트리-왼쪽 | ProcessTree-Left | icon-process-left | 단계 흐름이 오른쪽에서 왼쪽으로 이어지는 절차형 구조 |
| 진행트리 | 진행트리-오른쪽A | ProcessTree-Right-A | icon-process-right-a | 상단 기준선에서 각 단계 노드가 아래로 연결되는 방식 |
| 진행트리 | 진행트리-오른쪽B | ProcessTree-Right-B | icon-process-right-b | 단계 노드들이 같은 수평선상에 연속 배치되는 타임라인/로드맵형 방식 |
| 자유배치형 | 자유배치형 | Freeform | icon-freeform | 자동 정렬보다 사용자의 드래그 위치를 우선하는 방식. subtree 단위 적용 권장 |

---

## 4. CANVAS — 캔버스 조작

| 기능ID | 기능명 | 설명 |
|--------|--------|------|
| CANVAS-01 | Zoom In | 확대 |
| CANVAS-02 | Zoom Out | 축소 |
| CANVAS-03 | Fit Screen | 전체 화면 맞춤 |
| CANVAS-04 | Pan Canvas | 캔버스 이동 |
| CANVAS-05 | Center Node | 선택 Node를 화면 중앙으로 이동 |

---

## 5. SELECTION — 선택

| 기능ID | 기능명 | 설명 |
|--------|--------|------|
| SEL-01 | Single Select | Node 단일 선택 |
| SEL-02 | Multi Select | 여러 Node 선택 |
| SEL-03 | Subtree Select | Node 하위 전체 선택 |
| SEL-04 | Area Select | 드래그 영역 선택 |

---

## 6. HISTORY — 실행 취소/복원

| 기능ID | 기능명 | 설명 |
|--------|--------|------|
| HISTORY-01 | Undo | 작업 취소 |
| HISTORY-02 | Redo | 작업 복원 |

---

## 7. SAVE — 저장

| 기능ID | 기능명 | 설명 | 저장 트리거 |
|--------|--------|------|-------------|
| SAVE-01 | Auto Save | 자동 저장 | Node 생성 / Node 삭제 / Node 이동 / Text 수정 / Layout 변경 |

---

## 8. TAG — 태그

| 기능ID | 기능명 | 설명 |
|--------|--------|------|
| TAG-01 | Add Tag | Node에 Tag 추가 |
| TAG-02 | Remove Tag | Tag 제거 |
| TAG-03 | Tag Explorer | Tag 목록 표시 |
| TAG-04 | Tag Filter | Tag 기반 Node 필터 |

---

## 9. SEARCH — 검색

| 기능ID | 기능명 | 설명 |
|--------|--------|------|
| SEARCH-01 | Text Search | Node 텍스트 검색 |
| SEARCH-02 | Tag Search | Tag 기반 검색 |

---

## 10. AI — AI 기능

| 기능ID | 기능명 | 설명 |
|--------|--------|------|
| AI-01 | Generate Mindmap | AI 기반 Mindmap 자동 생성 |
| AI-02 | Expand Node | 선택 Node 기준 AI 자동 확장 |

---

## 11. EXPORT — 내보내기

| 기능ID | 기능명 | 설명 |
|--------|--------|------|
| EXPORT-01 | Export Markdown | Markdown 파일 생성 |
| EXPORT-02 | Export HTML | Standalone HTML 파일 생성 |

---

## 12. DASHBOARD — 대시보드 맵 (V3)

> 상세 설계: [dashboard-map.md](./dashboard-map.md)

### 개요
맵을 **Read-only 대시보드 모드**로 설정하면 외부 시스템이 노드 값을 변경했을 때 설정된 주기로 화면을 자동 리프레시하는 기능.

| 기능ID | 기능명 | 설명 |
|--------|--------|------|
| DASH-01 | Dashboard Mode | 맵을 Read-only 대시보드 모드로 전환 |
| DASH-02 | Auto Refresh | 설정 주기로 노드 값 자동 갱신 (polling) |
| DASH-03 | Change Highlight | 변경된 노드 flash animation 표시 |
| DASH-04 | Refresh Interval Setting | 갱신 주기 설정 (off / 10초 / 30초 / 1분 / 5분 / 10분) |
| DASH-05 | External Node Update API | 외부 시스템에서 노드 값 일괄 업데이트 (`PATCH /maps/:id/data`) |

### DB 변경 사항
```sql
maps.view_mode                VARCHAR(20)  DEFAULT 'edit'   -- 'edit' | 'dashboard'
maps.refresh_interval_seconds INT          DEFAULT 0        -- 0: off, 30, 60, 300 ...
```

### 진화 경로
- **V3 MVP**: `setInterval` Polling
- **V3 확장**: Redis Pub/Sub + WebSocket Push (트래픽 90%+ 절감)

---

## 13. TRANSLATION — 다국어 번역 (V2)

> 상세 설계: [multilingual-translation.md](./multilingual-translation.md)

### 개요
협업/공유 맵을 열 때 각 노드의 텍스트를 열람자의 언어로 자동 번역하여 표시.

| 기능ID | 기능명 | 설명 |
|--------|--------|------|
| TRANS-01 | Auto Translate | 노드 텍스트를 열람자 언어로 자동 번역 |
| TRANS-02 | Translation Cache | 번역 결과 캐시 저장 및 재사용 |
| TRANS-03 | Cache Invalidation | 원문 변경 시 번역 캐시 자동 무효화 및 재번역 |
| TRANS-04 | Skeleton UI | 번역 대기 중 Skeleton 표시 |
| TRANS-05 | Original Text Toggle | 번역본 ↔ 원문 토글 버튼 |
| TRANS-06 | Batch Translate on Load | 맵 오픈 시 미캐시 노드 배치 번역 |
| TRANS-07 | Translation Broadcast | 번역 완료 시 WebSocket으로 전체 열람자 업데이트 |

### 번역 엔진 전략
- **1차**: DeepL API (품질 우수, 속도 빠름, 비용 저렴)
- **2차 Fallback**: LLM (OpenAI GPT 등) — DeepL 미지원 언어 및 전문 용어 처리

### 번역 트리거 시점
- 타이핑 중 → ❌ (API 비용 방지)
- `Enter` 키 / `blur` 이벤트 → ✅ 번역 트리거

---

## 14. 개발 단계별 로드맵

| 단계 | 포함 기능 그룹 | 비고 |
|------|---------------|------|
| **V1 (MVP)** | MAP, NODE, LAYOUT, CANVAS, SELECTION, HISTORY, SAVE, TAG, SEARCH, AI, EXPORT | 핵심 편집 기능 전체 |
| **V2** | TRANSLATION (다국어 번역) | 협업 차별화 기능 |
| **V3** | DASHBOARD (대시보드 맵) | Polling → WebSocket Push 진화 포함 |

---

## 기능 수 요약

| 그룹 | 기능 수 |
|------|---------|
| MAP | 5 |
| NODE | 12 |
| LAYOUT (기능) | 4 |
| LAYOUT (유형) | 14 |
| CANVAS | 5 |
| SELECTION | 4 |
| HISTORY | 2 |
| SAVE | 1 |
| TAG | 4 |
| SEARCH | 2 |
| AI | 2 |
| EXPORT | 2 |
| DASHBOARD (V3) | 5 |
| TRANSLATION (V2) | 7 |
| **합계** | **55+** |
