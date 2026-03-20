# easymindmap — 제품 로드맵

> 문서 버전: v1.0

---

## 전체 로드맵 요약

```
MVP  ──── 편집기 코어 / 자동저장 / AI 생성 / Export
V1   ──── 협업 / 공유 / 버전 히스토리 / Diff Viewer
V2   ──── 다국어 자동 번역
V3   ──── 대시보드 맵 / 라이브 데이터 노드
```

---

## MVP — 핵심 편집기

**목표**: 단일 사용자 마인드맵 편집기 완성

### 기능 목록

| 기능 | 설명 |
|------|------|
| 회원가입 / 로그인 | JWT 인증 |
| 맵 CRUD | 생성 / 목록 / 삭제 |
| 노드 편집 | 생성 / 수정 / 삭제 / 이동 |
| 레이아웃 | 방사형, 트리, 계층형, 프로세스, 자유배치 |
| 스타일 | 색상, 폰트, 도형 |
| 자동 저장 | 편집 중 실시간 DB 저장 (debounce) |
| Undo/Redo | 클라이언트 히스토리 |
| 노드 접기/펼치기 | collapsed |
| Export | Markdown, Standalone HTML |
| AI 맵 생성 | 프롬프트 → 자동 맵 생성 |
| 퍼블리시 | 공개 URL 생성 |

### 핵심 기술 결정

```
Frontend : React + TypeScript + Zustand (5-store)
Backend  : NestJS + PostgreSQL + Redis
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
| **Diff Viewer** | 버전 간 변경 내용 시각화 |
| 태그 | 노드 태그 추가 / 필터 / 검색 |
| 노드 노트 | 노드별 메모 |
| 노드 링크 | URL 첨부 |
| 노드 첨부파일 | 파일 첨부 |
| 노드 배경이미지 | 이미지 배경 |

### Diff Viewer 상세

```
두 버전(revision) 비교 시:
  + 추가된 노드: 초록색 표시
  - 삭제된 노드: 빨간색 표시
  * 변경된 노드: 노란색 표시

활용:
  "누가 언제 어떤 노드를 추가/삭제/변경했는지"
  맵 위에서 시각적으로 확인 가능
  → 협업 도구로서의 완성도 크게 향상
```

### 실시간 협업 구조

```
Phase 1 (V1): Lightweight Realtime
  presence / cursor / patch broadcast

Phase 2 (V2+): CRDT
  Yjs adapter / optimistic merge
```

---

## V2 — 다국어 자동 번역

**목표**: 글로벌 협업 지원

### 기능 목록

| 기능 | 설명 |
|------|------|
| 노드 작성 언어 감지 | text_lang 자동 설정 |
| 자동 번역 | 열람자 언어로 노드 텍스트 자동 번역 |
| 번역 캐시 | DeepL + Redis 기반 고속 캐시 |
| 원문 토글 | 번역본 ↔ 원문 전환 |
| 번역 실패 처리 | 원문 표시 + 실패 아이콘 |

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
→ 강력한 차별화 기능
```

> 상세 설계: [docs/features/multilingual-translation.md](../features/multilingual-translation.md)

---

## V3 — 대시보드 맵

**목표**: Mindmap + Dashboard 통합

### 기능 목록

| 기능 | 설명 |
|------|------|
| 대시보드 모드 | 맵을 Read-only 대시보드로 전환 |
| 자동 리프레시 | 설정 주기로 화면 자동 갱신 |
| 외부 값 갱신 | 외부 API로 노드 텍스트 업데이트 |
| 변경 하이라이트 | 값 변경 시 flash animation |
| data-live 노드 | 외부 갱신 전용 노드 타입 |

### 구현 방식 (단순함이 핵심)

```
복잡한 SQL 바인딩 불필요.

외부 시스템: PATCH /nodes/:id (기존 API 그대로)
대시보드 맵: 변경 감지 → 변경 노드만 화면 업데이트
```

**갱신 방식 3단계 전환 경로:**

```
V3 MVP   : Polling (setInterval → GET /maps/:id/snapshot)
           구현 쉬움, 기존 API 재사용

V3 확장  : Redis Pub/Sub
           nodes UPDATE 시 Redis PUBLISH
           → WS Gateway SUBSCRIBE → 변경 즉시 Push
           트래픽 90%+ 절감 (변경 있을 때만 전송)

V3+      : WebSocket Push 고도화
           협업 WS 서버와 통합,
           dashboard:refresh 이벤트로 단일 채널 관리
```

### 활용 사례

```
매출 대시보드    (ERP 연동)
프로젝트 현황   (GitHub/Jira 연동)
IT 인프라 상태  (모니터링 시스템 연동)
```

> 상세 설계: [docs/features/dashboard-map.md](../features/dashboard-map.md)

---

## 기능 우선순위 매트릭스

| 기능 | 제품 가치 | 구현 난이도 | 단계 |
|------|-----------|-------------|------|
| 편집기 코어 | 매우 높음 | 높음 | MVP |
| 자동 저장 | 매우 높음 | 중간 | MVP |
| AI 맵 생성 | 높음 | 중간 | MVP |
| Export (MD/HTML) | 높음 | 중간 | MVP |
| 실시간 협업 | 높음 | 높음 | V1 |
| 버전 히스토리 | 높음 | 중간 | V1 |
| **Diff Viewer** | 높음 | 중간 | V1 |
| **다국어 번역** | **매우 높음** | **중상** | **V2** |
| **대시보드 맵** | **높음** | **낮음** | **V3** |
| 빌링 | 중간 | 중간 | V3 |

---

## 최종 제품 포지셔닝

```
easymindmap =

  XMind (강력한 편집기)
  + Notion (팀 협업 / 워크스페이스)
  + ChatGPT (AI 생성)
  + 다국어 지원 (Thinkwise 이상)
  + 대시보드 (거의 없는 조합)
```
