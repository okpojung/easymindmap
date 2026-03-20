# 🧠 easymindmap

> **AI 기반 온라인 마인드맵 플랫폼**\
> 서비스 도메인: [mindmap.ai.kr](https://mindmap.ai.kr)

------------------------------------------------------------------------

## 🚀 프로젝트 개요

easymindmap은 단순한 마인드맵 에디터가 아니라,\
**웹 편집 + 실시간 저장 + AI 생성 + 협업 + 다국어 + 대시보드 맵**까지
통합한 차세대 플랫폼입니다.

AI mindmap + multilingual collaboration + real-time + export =
easymindmap

👉 목표:\
**Think faster. Organize smarter.**

------------------------------------------------------------------------

## ✨ 핵심 기능

  기능               설명                                        단계
  ------------------ ------------------------------------------- ------
  마인드맵 편집기    노드 생성/편집/이동/삭제, 다양한 레이아웃   MVP
  자동 저장          편집 중 실시간 DB 자동 저장                 MVP
  Undo/Redo          클라이언트 히스토리 + 서버 리비전           MVP
  Export             Markdown, Standalone HTML                   MVP
  AI 마인드맵 생성   프롬프트 → 자동 맵 생성                     MVP
  협업               실시간 다중 사용자 편집                     V1
  공유/퍼블리시      공개 링크, 읽기 전용 퍼블리시               V1
  버전 히스토리      맵 변경 이력, Diff Viewer                   V1
  다국어 자동 번역   협업 시 각 사용자 언어로 자동 번역 표시     V2
  대시보드 맵        외부 데이터 연동 + 자동 갱신                V3

------------------------------------------------------------------------

## 🏗️ 기술 스택

Frontend : React + TypeScript + Zustand + React Query\
Backend : NestJS + TypeScript\
Database : PostgreSQL 16\
Cache : Redis 7\
Storage : MinIO (or NAS)\
Realtime : WebSocket Gateway\
Worker : NestJS Worker + BullMQ\
Infra : VMware ESXi + Docker Compose

------------------------------------------------------------------------

## 문서 구조

```
docs/
├── architecture/
│   └── system-architecture.md       # 전체 시스템 아키텍처
├── db/
│   ├── erd.md                       # ERD 다이어그램
│   └── schema.sql                   # PostgreSQL 스키마 (실행 가능)
├── infra/
│   ├── env-spec.md                  # 환경변수 명세
│   └── docker-compose-spec.md       # Docker Compose 설계
├── features/
│   ├── multilingual-translation.md  # 다국어 번역 기능 설계 (V2)
│   └── dashboard-map.md             # 대시보드 맵 기능 설계 (V3)
├── dev/                             ← 개발자 상세 문서
│   ├── frontend-architecture.md     # 프론트엔드 (Store / Command / Render)
│   ├── backend-architecture.md      # 백엔드 (모듈 / AI Gateway / Worker)
│   ├── layout-engine.md             # 레이아웃 엔진 (2-pass / Strategy)
│   ├── autosave-engine.md           # Autosave 엔진 (patch / 충돌 처리)
│   └── collaboration-engine.md      # 협업 엔진 (WS / Presence / Redis Pub/Sub)
└── product/
    └── roadmap.md                   # 제품 로드맵
```

---

## 로드맵 요약

```
MVP  ─── 편집기 코어 / 자동저장 / AI생성 / Export
V1   ─── 협업 / 공유 / 버전히스토리 / Diff Viewer
V2   ─── 다국어 자동 번역 (DeepL + LLM hybrid)
V3   ─── 대시보드 맵 / 라이브 데이터 노드
```

---

apps/ \# frontend / backend (예정)\
packages/ \# shared modules (예정)\
deploy/ \# docker / infra

------------------------------------------------------------------------

## 📘 Documentation

### 🧩 Development

-   Frontend UI Spec
-   Frontend Architecture
-   Backend Architecture
-   Layout Engine
-   Autosave Engine
-   Collaboration Engine

------------------------------------------------------------------------

## 🎯 현재 개발 단계 (MVP)

-   시스템 아키텍처 설계 완료\
-   DB 설계 완료\
-   Frontend UI 설계 완료\
-   Frontend 개발 시작 예정

------------------------------------------------------------------------

## 🚀 Vision

Think faster.\
Organize smarter.\
Build visually.

------------------------------------------------------------------------

## 참고 프로젝트

- [my-mind](https://github.com/ondras/my-mind) — 웹 기반 마인드맵 에디터 참조
- [WiseMapping](https://github.com/wisemapping/wisemapping-open-source) — React + SVG 구조 참조
- [Markmap](https://github.com/markmap/markmap) — Markdown → HTML export 참조
- [Excalidraw](https://github.com/excalidraw/excalidraw) — 실시간 협업 구조 참조

