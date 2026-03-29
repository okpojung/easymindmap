# 🧠 easymindmap

**AI 기반 온라인 마인드맵 플랫폼**  
서비스 도메인: `mindmap.ai.kr`

---

## 🚀 프로젝트 개요

easymindmap은 단순한 마인드맵 에디터가 아니라,  
**웹 편집 + 실시간 저장 + AI 생성 + 협업 + 다국어 + 대시보드 맵**까지 통합한 차세대 플랫폼입니다.

```
AI mindmap + multilingual collaboration + real-time + export = easymindmap
```

> 👉 목표: **Think faster. Organize smarter.**

---

## ✨ 핵심 기능

| 기능 | 설명 | 단계 |
|------|------|------|
| 마인드맵 편집기 | 노드 생성/편집/이동/삭제, 다양한 레이아웃 | MVP |
| 노드 추가 인디케이터 | 4방향 +버튼으로 직관적 노드 추가 | MVP |
| 자동 저장 | patch 기반 실시간 DB 자동 저장 | MVP |
| Undo / Redo | 클라이언트 히스토리 + 서버 리비전 | MVP |
| Export | Markdown, Standalone HTML | MVP |
| AI 마인드맵 생성 | 프롬프트 → 자동 맵 생성 | MVP |
| 협업 | 실시간 다중 사용자 편집 | V1 |
| 공유 / 퍼블리시 | 공개 링크, 읽기 전용 퍼블리시 | V1 |
| 버전 히스토리 | 맵 변경 이력, Diff Viewer | V1 |
| 다국어 자동 번역 | 협업 시 각 사용자 언어로 자동 번역 | V2 |
| 대시보드 맵 | 외부 데이터 연동 + 자동 갱신 | V3 |

---

## 🏗️ 기술 스택

| 항목 | 선택 | 비고 |
|------|------|------|
| Frontend | React + TypeScript + Zustand + React Query | 5-Store 구조 |
| Backend | NestJS + TypeScript | BullMQ Worker 포함 |
| **Database** | **Supabase PostgreSQL 16 (Self-hosted)** | ESXi VM-03 |
| **Auth** | **Supabase Auth** | JWT 직접 구현 불필요 |
| **Storage** | **Supabase Storage** | MinIO 대체 |
| **Realtime** | **Supabase Realtime** | V1 협업 기반 |
| Cache / Queue | Redis 7 + BullMQ | ESXi VM-04 |
| Infra | VMware ESXi 7.0.3 + Docker Compose | VM 5대 구성 |

### 인프라 구성 (ESXi VM 5대)

```
VM-01  Edge       Nginx (TLS, Reverse Proxy, Rate Limit)
VM-02  App        Frontend + NestJS API + WS Gateway
VM-03  Supabase   PostgreSQL + Auth + Storage + Realtime (Docker Compose)
VM-04  Redis      Redis 7 (Cache, Queue, Presence)
VM-05  Worker     AI / Export / Translation Workers
```

---

## 📁 문서 구조

```
docs/
├── 00-project-overview/              # 프로젝트 방향 & 범위
│   ├── vision.md                     # 제품 비전 / 목표 / 타겟 유저
│   ├── roadmap.md                    # MVP → V1 → V2 → V3 로드맵
│   └── mvp-scope.md                  # MVP 포함/제외 범위 정의
│
├── 01-product/                       # 제품 요구사항
│   ├── prd.md                        # Product Requirement Document
│   ├── functional-spec.md            # 전체 기능 명세 (62개 기능 정의)
│   └── ui-ux-spec.md                 # 화면별 UX 명세 / 컴포넌트 / 단축키
│
├── 02-domain/                        # 데이터 모델 & DB
│   ├── node-model.md                 # NodeObject 스키마 / LayoutType / ShapeType
│   ├── map-model.md                  # Map / User / Revision / Tag 도메인 모델
│   ├── db-schema.md                  # Supabase DB 설계 설명 / RLS 정책
│   ├── schema.sql                    # Supabase PostgreSQL DDL (실행 가능)
│   └── erd.md                        # ERD 다이어그램
│
├── 03-editor-core/                   # 에디터 핵심 설계
│   ├── state-architecture.md         # Zustand 5-Store 상태관리 설계
│   ├── editor-core-design.md         # 에디터 전체 구조 설계
│   ├── command-history.md            # Undo / Redo History (Command 패턴)
│   ├── autosave-engine.md            # Autosave 엔진 (patch / 충돌 처리)
│   ├── layout-engine.md              # Layout 엔진 (2-pass / 14종 Strategy)
│   ├── layout-coordinate-algorithm.md # 노드 좌표 계산 알고리즘
│   ├── edge-policy.md                # Edge 스타일 정책 (곡선/직각)
│   ├── node-editing.md               # 노드 편집 기능 정리
│   ├── bulk-branch-insert.md         # 다중 가지 일괄 추가 (NODE-04)
│   ├── node-indicator.md             # 노드 추가 인디케이터 +버튼 설계
│   ├── tag-system.md                 # 태그 기능 명세 (TAG-01~04)
│   └── node-background-image.md      # 노드 배경 이미지 삽입
│
├── 04-extensions/                    # Export / AI / 확장 기능
│   ├── markdown-export.md            # Markdown Export 명세
│   ├── html-export.md                # Standalone HTML Export / Publish 연동
│   ├── ai-mindmap-generation.md      # AI 마인드맵 자동 생성 파이프라인
│   ├── canvas-spec.md                # Canvas 조작 상세 (CANVAS-01~08)
│   ├── multilingual-translation.md   # 다국어 자동 번역 (V2, DeepL + LLM)
│   ├── dashboard-map.md              # 대시보드 맵 기능 설계 (V3)
│   └── dashboard-web-app-spec.md     # 대시보드 노드 편집 웹앱 설계 (V3)
│
└── 05-implementation/                # 구현 가이드
    ├── system-architecture.md        # 전체 시스템 아키텍처 (Supabase 기준)
    ├── frontend-architecture.md      # 프론트엔드 (Store / Command / Render)
    ├── backend-architecture.md       # 백엔드 (Supabase 연동 패턴 / NestJS)
    ├── collaboration-engine.md       # 협업 엔진 (WS / Presence / Redis)
    ├── docker-compose-spec.md        # Docker Compose 설계 (VM별 분리)
    ├── env-spec.md                   # 환경변수 명세 (Supabase 기준)
    ├── api-spec.md                   # REST API 전체 명세
    ├── codex-task-plan.md            # AI 개발 작업 분해 (T-01 ~ T-20)
    └── coding-conventions.md         # TypeScript / Supabase / Git 컨벤션
```

---

## 🗺️ 로드맵

```
MVP  ─── 편집기 코어 / 자동저장 / AI 생성 / Export
V1   ─── 협업 / 공유 / 버전 히스토리 / Diff Viewer
V2   ─── 다국어 자동 번역 (DeepL + LLM hybrid)
V3   ─── 대시보드 맵 / 라이브 데이터 노드
```

---

## 📁 프로젝트 구조

```
apps/           # frontend / backend (개발 예정)
packages/       # shared modules (예정)
deploy/         # docker / infra
docs/           # 설계 문서 전체 (00~05 체계)
```

---

## 📘 문서 링크

### 🎯 00 — 프로젝트 방향
[vision](docs/00-project-overview/vision.md) · [roadmap](docs/00-project-overview/roadmap.md) · [mvp-scope](docs/00-project-overview/mvp-scope.md)

### 📋 01 — 제품 요구사항
[prd](docs/01-product/prd.md) · [functional-spec](docs/01-product/functional-spec.md) · [ui-ux-spec](docs/01-product/ui-ux-spec.md)

### 🗄️ 02 — 도메인 & DB
[node-model](docs/02-domain/node-model.md) · [map-model](docs/02-domain/map-model.md) · [db-schema](docs/02-domain/db-schema.md) · [schema.sql](docs/02-domain/schema.sql) · [erd](docs/02-domain/erd.md)

### ⚙️ 03 — 에디터 코어
[state-architecture](docs/03-editor-core/state-architecture.md) · [command-history](docs/03-editor-core/command-history.md) · [layout-engine](docs/03-editor-core/layout-engine.md) · [edge-policy](docs/03-editor-core/edge-policy.md) · [node-editing](docs/03-editor-core/node-editing.md) · [node-indicator](docs/03-editor-core/node-indicator.md) · [autosave-engine](docs/03-editor-core/autosave-engine.md) · [tag-system](docs/03-editor-core/tag-system.md)

### 🔌 04 — 확장 기능
[markdown-export](docs/04-extensions/markdown-export.md) · [html-export](docs/04-extensions/html-export.md) · [ai-mindmap-generation](docs/04-extensions/ai-mindmap-generation.md) · [canvas-spec](docs/04-extensions/canvas-spec.md) · [multilingual-translation](docs/04-extensions/multilingual-translation.md) · [dashboard-map](docs/04-extensions/dashboard-map.md)

### 🚀 05 — 구현 가이드
[system-architecture](docs/05-implementation/system-architecture.md) · [frontend-architecture](docs/05-implementation/frontend-architecture.md) · [backend-architecture](docs/05-implementation/backend-architecture.md) · [api-spec](docs/05-implementation/api-spec.md) · [docker-compose-spec](docs/05-implementation/docker-compose-spec.md) · [env-spec](docs/05-implementation/env-spec.md) · [codex-task-plan](docs/05-implementation/codex-task-plan.md) · [coding-conventions](docs/05-implementation/coding-conventions.md)

---

## 🎯 현재 개발 단계 (MVP 진행 중)

- [x] 프로젝트 비전 / 로드맵 확정
- [x] 전체 기능 명세 완료 (62개 기능)
- [x] DB 스키마 설계 완료 (Supabase PostgreSQL + RLS)
- [x] 인프라 설계 완료 (ESXi 5VM + Supabase Self-hosted)
- [x] Frontend UI 설계 완료 (5-Store / 화면별 명세)
- [x] Backend 아키텍처 설계 완료 (Supabase 연동 패턴)
- [x] Layout 엔진 설계 완료 (2-pass, 14종)
- [x] Autosave 엔진 설계 완료 (patch 기반)
- [x] API 명세 완료 (REST 전체)
- [x] AI 개발 Task 분해 완료 (T-01 ~ T-20)
- [ ] Frontend 개발 시작
- [ ] Backend 개발 시작
- [ ] Supabase Self-hosted 구축

---

## 🔗 참고 프로젝트

| 프로젝트 | 활용 포인트 |
|---------|------------|
| [my-mind](https://github.com/ondras/my-mind) | 웹 기반 마인드맵 에디터 참조 |
| [WiseMapping](https://github.com/wisemapping/wisemapping-open-source) | React + SVG 구조 참조 |
| [Markmap](https://github.com/markmap/markmap) | Markdown → HTML export 참조 |
| [Excalidraw](https://github.com/excalidraw/excalidraw) | 실시간 협업 구조 참조 |
| [Supabase](https://github.com/supabase/supabase) | Self-hosted DB / Auth / Storage / Realtime |

---

## 🚀 Vision

> **Think faster. Organize smarter. Build visually.**
