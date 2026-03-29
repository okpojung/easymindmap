# easymindmap — 제품 로드맵

문서 버전: v1.1  
인프라 결정: **Supabase Self-hosted on ESXi VM-03**

---

## 전체 로드맵 요약

```
MVP  ──── 편집기 코어 / 자동저장 / AI 생성 / Export
V1   ──── 협업 / 공유 / 버전 히스토리 / Diff Viewer
V2   ──── 다국어 자동 번역 (DeepL + LLM)
V3   ──── 대시보드 맵 / 라이브 데이터 노드
```

---

## MVP — 핵심 편집기

**목표**: 단일 사용자 마인드맵 편집기 완성

### 기능 목록

| 기능 | 설명 |
|------|------|
| 회원가입 / 로그인 | Supabase Auth (이메일 + 비밀번호) |
| 맵 CRUD | 생성 / 목록 / 삭제 |
| 노드 편집 | 생성 / 수정 / 삭제 / 이동 |
| 노드 추가 인디케이터 | 4방향 +버튼 UX (NODE-13~16) |
| 레이아웃 | 방사형 / 트리 / 계층형 / 진행트리 / 자유배치 |
| 스타일 | 색상 / 폰트 / 도형 |
| 자동 저장 | Patch 기반 실시간 DB 저장 (debounce) |
| Undo / Redo | 클라이언트 히스토리 |
| 노드 접기/펼치기 | collapsed |
| Export | Markdown / Standalone HTML |
| AI 맵 생성 | 프롬프트 → 자동 맵 생성 (AI-01) |
| 퍼블리시 | Supabase Storage → 공개 URL 생성 |
| Canvas 조작 | Zoom / Pan / Fit / 100% / Fullscreen / Focus (CANVAS-01~08) |
| Tag | 노드 태그 추가 / 필터 / 검색 |
| Search | 텍스트 / 태그 기반 검색 |

### 핵심 기술 결정

```
Frontend : React + TypeScript + Zustand (5-store)
Backend  : NestJS + Supabase JS Client (Service Key)
Database : Supabase PostgreSQL 16 (Self-hosted, VM-03)
Auth     : Supabase Auth (NestJS JWT 직접 구현 제거)
Storage  : Supabase Storage (MinIO 대체)
Queue    : BullMQ + Redis (VM-04)
Layout   : 2-pass algorithm, subtree 단위, partial relayout
Edge     : 방사형 → curve-line, 나머지 → tree-line
Autosave : patch 기반 저장 (전체 문서 스냅샷 X)
Export   : Markdown serializer + Markmap 기반 HTML
```

---

## V1 — 협업 & 공유

**목표**: 팀이 함께 사용 가능한 플랫폼

### 기능 목록

| 기능 | 설명 |
|------|------|
| 워크스페이스 | 팀 단위 맵 관리 |
| 공유 링크 | 읽기 전용 / 편집 권한 공유 |
| 실시간 협업 | 동시 편집, presence, cursor 표시 |
| 버전 히스토리 | 맵 변경 이력 조회 |
| Diff Viewer | 버전 간 변경 내용 시각화 |
| 노드 노트 | 노드별 상세 메모 |
| 노드 링크 | URL 첨부 |
| 노드 첨부파일 | 파일 첨부 (Supabase Storage) |
| 노드 배경이미지 | 이미지 배경 |
| AI Node Expand | 선택 노드 하위 AI 자동 확장 (AI-02) |

### Diff Viewer 상세

두 버전(revision) 비교 시:
- `+` 추가된 노드: 초록색 표시
- `-` 삭제된 노드: 빨간색 표시
- `*` 변경된 노드: 노란색 표시

### 실시간 협업 구조

```
Phase 1 (V1): Lightweight Realtime
  ├── Supabase Realtime (DB 변경 이벤트 구독)
  ├── presence / cursor / patch broadcast
  └── WebSocket Gateway (VM-02)

Phase 2 (V2+): CRDT
  ├── Yjs adapter
  └── optimistic merge
```

> Supabase Realtime이 이미 내장되어 있어 V1 협업 기반 구현 공수가 크게 줄어듦

---

## V2 — 다국어 자동 번역

**목표**: 글로벌 협업 지원

### 기능 목록

| 기능 | 설명 |
|------|------|
| 자동 번역 | 열람자 언어로 노드 텍스트 자동 번역 (TRANS-01) |
| 번역 캐시 | DeepL + Redis 기반 고속 캐시 (TRANS-02) |
| 캐시 무효화 | 원문 변경 시 자동 재번역 (TRANS-03) |
| Skeleton UI | 번역 대기 중 표시 (TRANS-04) |
| 원문 토글 | 번역본 ↔ 원문 전환 (TRANS-05) |
| 배치 번역 | 맵 오픈 시 미캐시 노드 일괄 번역 (TRANS-06) |
| 번역 Broadcast | 완료 시 WebSocket으로 전체 열람자 업데이트 (TRANS-07) |

### 번역 엔진

```
1차: DeepL API (속도 / 비용 / 품질 균형 최적)
2차: LLM fallback (전문용어, 문맥 번역)
```

### 차별화 포인트

```
XMind / MindMeister / Miro → 다국어 자동 번역 없음
Thinkwise → 유사 기능 있으나 제한적

easymindmap: AI mindmap + multilingual collaboration
```

---

## V3 — 대시보드 맵

**목표**: Mindmap + Dashboard 통합

### 기능 목록

| 기능 | 설명 |
|------|------|
| 대시보드 모드 | 맵을 Read-only 대시보드로 전환 (DASH-01) |
| 자동 리프레시 | 설정 주기로 화면 자동 갱신 (DASH-02) |
| 변경 하이라이트 | 값 변경 시 flash animation (DASH-03) |
| 갱신 주기 설정 | off / 10초 / 30초 / 1분 / 5분 / 10분 (DASH-04) |
| 외부 값 갱신 API | PATCH /maps/:id/data (DASH-05) |

### 갱신 방식 진화 경로

```
V3 MVP   : Polling (setInterval → GET /maps/:id/snapshot)
V3 확장  : Redis Pub/Sub + WebSocket Push (트래픽 90%+ 절감)
V3+      : Supabase Realtime dashboard:refresh 채널 통합
```

### 활용 사례

```
매출 대시보드    (ERP 연동)
프로젝트 현황   (GitHub/Jira 연동)
IT 인프라 상태  (모니터링 시스템 연동)
```

---

## 기능 우선순위 매트릭스

| 기능 | 제품 가치 | 구현 난이도 | 단계 |
|------|-----------|------------|------|
| 편집기 코어 | 매우 높음 | 높음 | MVP |
| 자동 저장 | 매우 높음 | 중간 | MVP |
| AI 맵 생성 | 높음 | 중간 | MVP |
| Export (MD/HTML) | 높음 | 중간 | MVP |
| 실시간 협업 | 높음 | 높음 | V1 |
| 버전 히스토리 | 높음 | 중간 | V1 |
| Diff Viewer | 높음 | 중간 | V1 |
| 다국어 번역 | 매우 높음 | 중상 | V2 |
| 대시보드 맵 | 높음 | 낮음 | V3 |

---

## 최종 제품 포지셔닝

```
easymindmap =
  XMind (강력한 편집기)
  + Notion (팀 협업 / 워크스페이스)
  + ChatGPT (AI 생성)
  + 다국어 지원 (Thinkwise 이상)
  + 대시보드 (거의 없는 조합)
  + Supabase Self-hosted (데이터 완전 자체 소유)
```
