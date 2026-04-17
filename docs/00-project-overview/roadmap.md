# easymindmap — 제품 로드맵

문서 버전: v1.4
최종 업데이트: 2026-04-16
인프라 결정: **Supabase Self-hosted on ESXi VM-03**

---

## 전체 로드맵 요약

```
MVP   ──── 편집기 코어 / Kanban / 자동저장 / AI 생성 / Export / Publish / Settings(기본)
V1    ──── 협업 초대·동기화(COLLAB-01~06) / 접속자 표시 / 공유 링크 / 버전 히스토리 / Diff Viewer
            / WBS 모드(WBS-01~05) / 리소스 할당(RES-01~05) / Redmine 연동(RDMN-01~08)
            / Obsidian 연동(OBS-01~03)
V1.5  ──── AI 실행형 절차 (AI Executable Workflow, WFLOW-01~12)
V2    ──── 커서 공유(COLLAB-07) / Soft Lock(COLLAB-08~09) / Node Thread(COLLAB-10~13)
            / 다국어 자동 번역(TRANS-01~07) / 실시간 협업 채팅(CHAT-01~06 / COLLAB-10~11)
            / 채팅 번역(TRANS-08~11)
V3    ──── AI 협업 요약·작업 생성(COLLAB-14~15 / AI-03~05) / 대시보드 맵(DASH-01~05)
            / CHAT-07 (1:1 DM) / Obsidian 변경 감지 동기화(OBS-04) / Wikilink 연결(OBS-05)
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
| 노드 추가 인디케이터 | 4방향 +버튼 UX (NODE-IND-01~04, NODE-13) |
| 레이아웃 | 방사형 / 트리 / 계층형 / 진행트리 / 자유배치 / **Kanban 보드형** (총 15종) |
| Kanban 레이아웃 | 3레벨 보드형 (board/column/card), depth 2 이하 제한 (KANBAN-01~05) |
| 노드 배경 이미지 | preset 또는 직접 업로드, fit/position/overlay 설정 |
| 노드 노트 | structured note — paragraph / code_block / warning / checklist |
| 스타일 | 색상 / 폰트 / 도형 |
| 자동 저장 | Patch 기반 실시간 DB 저장 (텍스트 800ms, 구조 변경 0ms) |
| Undo / Redo | 클라이언트 히스토리 |
| 노드 접기/펼치기 | collapsed |
| Export | Markdown / Standalone HTML |
| AI 맵 생성 | 프롬프트 → 자동 맵 생성 (AI-01) |
| AI 노드 확장 | 선택 노드 기준 AI 자동 확장 (AI-02) |
| 퍼블리시 | Supabase Storage → 공개 URL 생성 (PUBL-01~04) |
| Import | Markdown 파일 가져오기 (Obsidian 호환 포함) |
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
Layout   : 2-pass algorithm, subtree 단위, partial relayout (15종 레이아웃)
Edge     : 방사형 → curve-line (Cubic Bezier 곡선), 나머지(트리/계층/진행트리/자유배치/Kanban) → tree-line (직각선, Orthogonal Connector)
Autosave : patch 기반 저장 (텍스트/스타일 800ms, 구조 변경 0ms)
Export   : Markdown serializer + Markmap 기반 HTML
노드 깊이 : 최대 depth 50 제한 (ltree 운영 안전망)
size_cache: 클라이언트(브라우저) DOM 측정 → autosave patch로 서버 전송
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
### [V1 추가] WBS 모드 (WBS-01~05)

| 기능 | 설명 |
|------|------|
| WBS 모드 전환 | 맵을 WBS 모드로 전환 (`view_mode = 'wbs'`) |
| 일정 설정 | 노드에 시작일/종료일 설정 |
| 마일스톤 설정 | 노드를 마일스톤으로 지정 |
| 진척률 설정 | 0~100% 진척률 입력 |
| WBS 인디케이터 | 날짜 배지/마일스톤 마커/진척률 바/상태 색상 표시 |

### [V1 추가] 리소스 할당 (RES-01~05)

| 기능 | 설명 |
|------|------|
| 리소스 할당 패널 | 노드에 담당자/검토자/참관자 할당 (WBS·Kanban 공통) |
| 담당자 검색/추가 | 내부 사용자 및 Redmine 사용자 검색 |
| 리소스 아바타 인디케이터 | 노드에 담당자 아바타 표시 |

### [V1 추가] Redmine 연동 (RDMN-01~08)

| 기능 | 설명 |
|------|------|
| Redmine 연동 설정 | URL/API Key/프로젝트 설정 (AES-256-GCM 암호화) |
| Pull 동기화 | Redmine Issues → Mindmap Nodes |
| Push 동기화 | Mindmap Nodes → Redmine Issues |
| 노드 생성 시 Issue 자동 생성 | 노드 추가 → Redmine Issue 자동 생성 (BullMQ 비동기) |
| 노드 수정/삭제 시 Issue 반영 | 텍스트/일정/담당자 변경 또는 삭제 → Issue 자동 반영 |
| 동기화 상태 인디케이터 | ⟳/⚠/✕ 아이콘으로 sync_status 표시 |
| Redmine Plugin 탭 | Redmine 프로젝트 내 WBS 맵 탭 임베드 |

### [V1 추가] Obsidian 연동 (OBS-01~05)

| 기능 | 설명 |
|------|------|
| Obsidian → 맵 가져오기 | Obsidian Markdown 파일을 맵으로 가져오기 (OBS-01) |
| 맵 → Obsidian 내보내기 | 맵을 Obsidian 호환 Markdown으로 내보내기 (OBS-02) |
| Vault 연결 설정 | Obsidian Vault 경로/API 연결 설정 (OBS-03, 2단계) |
| 변경 감지 동기화 | Vault 파일 변경 → 자동 맵 업데이트 (OBS-04, 3단계) |

### [V1 추가] 협업맵 기능 항목 Phase 1 (COLLAB-01~06, COLLAB-16~17)

> 상세 설계: `docs/04-extensions/collaboration/25-map-collaboration.md`

| ID | 기능 | 설명 |
|----|------|------|
| COLLAB-01 | 맵 초대 | creator가 이메일/링크로 editor 초대. scope 지정 필수 |
| COLLAB-02 | 권한 변경 | creator가 editor의 scope를 수정 |
| COLLAB-03 | 협업자 제거 | creator가 editor를 맵에서 제거 |
| COLLAB-04 | 실시간 편집 동기화 | Supabase Realtime 기반 편집 내용 즉시 전파 |
| COLLAB-05 | LWW 충돌 정책 | 마지막 쓰기 우선 (Last-Write-Wins), timestamp 비교 |
| COLLAB-06 | 변경 수신 및 반영 | 원격 편집 수신 → Document Store 반영 |
| COLLAB-16 | 접속자 목록 | 현재 맵 접속 중인 협업자 목록 표시 |
| COLLAB-17 | 접속자 수 표시 | 헤더에 접속자 아바타 표시 |

> scope 규칙: `full`(creator 전용) / `level`(depth 기준) / `node`(특정 노드+하위)  
> Soft Lock TTL: 5초 (소스 기준, 비활동 시 자동 해제)  
> 협업자 최대 수: 20명/맵

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

## V1.5 — AI 실행형 절차 (AI Executable Workflow)

**목표**: AI를 활용하여 실제 작업 절차를 생성·실행·정제하는 기능

> 상세 정의: `docs/04-extensions/ai/19-ai-workflow.md`

### 핵심 컨셉

기존 AI mindmap 생성(1회성 구조 생성)을 넘어,  
사용자가 실제로 따라가며 실행할 수 있는 **step 기반 실행형 절차 문서**를 만드는 기능.

```
사용자 자연어 요청
  → AI가 step 기반 node tree 생성
  → 각 step 실제 실행 (명령어 copy → 터미널 실행)
  → 오류 발생 시 동일 step 문맥에서 AI 해결
  → 최종 성공 절차만 정제하여 남김
  → 재사용 가능한 runbook/playbook 완성
```

### 기능 목록

| 기능 | 설명 | 기능ID |
|------|------|--------|
| Workflow 생성 | 자연어 요청 → step node tree 자동 생성 | WFLOW-01~02 |
| Step 상태 관리 | not_started / in_progress / blocked / resolved / done | WFLOW-03~04 |
| 오류 해결 | 동일 step 문맥에서 AI에 오류 질의 및 해결 | WFLOW-05~06 |
| Workflow Cleanup | 중간 실패 이력 제거, 최종 성공 절차만 유지 | WFLOW-07 |
| Note Code Block | 언어 지정 code block + copy 버튼 | WFLOW-08~10 |
| AI 사용 정책 | 단독 편집 모드에서만 AI 기능 허용 (협업 중 비활성) | WFLOW-11~12 |

### 주요 활용 대상

```
개발자 / DevOps 엔지니어 / 시스템 관리자 / DBA / 운영 담당자
→ 서버 구축 / SSL 발급 / DB 설치 / 배포 / 장애 대응 runbook
→ 신규 개발환경 세팅 가이드 / API 개발 절차
```

### 제약 사항

- 협업 사용자 수 ≥ 2: AI Workflow 기능 전면 비활성화 (`403 FORBIDDEN`)
- 단독 편집 상태(접속자 1명)에서만 사용 가능
- 코드 실행 자체는 제품 내부에서 수행하지 않음 (사용자가 직접 터미널 실행)

---

## V2 — 협업 심화 + 다국어 자동 번역

**목표**: 글로벌 협업 지원 + 커서 공유 / Soft Lock / Node Thread 완성

### 협업 Phase 2 기능 (COLLAB-07~13)

> 상세 설계: `docs/04-extensions/collaboration/25-map-collaboration.md`

| 기능ID | 기능 | 설명 |
|--------|------|------|
| COLLAB-07 | 커서 공유 | 협업자 커서 위치 실시간 표시 (이름+색상, Supabase Presence) |
| COLLAB-08 | Soft Lock | 노드 편집 시 Soft Lock 설정 (다른 사람 편집 경고, TTL 5초) |
| COLLAB-09 | Lock 해제 | 편집 완료 또는 TTL 만료 후 자동 해제 |
| COLLAB-10 | Node Thread | 노드에 댓글 스레드 추가 (스레드 패널, `node_threads` 테이블) |
| COLLAB-11 | Thread Reply | 스레드 답글 작성 |
| COLLAB-12 | Thread Resolve | 스레드 해결 처리 |
| COLLAB-13 | Thread Mention | @멘션으로 협업자 알림 |

### 실시간 협업 채팅 (CHAT-01~06)

> 상세 설계: `docs/04-extensions/collaboration/26-realtime-chat.md`

| 기능ID | 기능 | 설명 |
|--------|------|------|
| CHAT-01 | 맵 채팅 패널 | 우측 사이드바 채팅 패널 표시/숨기기 |
| CHAT-02 | 메시지 전송 | 텍스트 메시지 전송 (Enter 전송) |
| CHAT-03 | 이전 메시지 로딩 | 스크롤 업 시 이전 메시지 페이징 로딩 |
| CHAT-04 | 파일 첨부 | 이미지/파일 첨부 전송 (후순위) |
| CHAT-05 | @멘션 | @이름으로 특정 협업자 알림 |
| CHAT-06 | 미확인 @멘션 표시 | 나중에 맵 참여 시 본인에게 온 @멘션 강조 표시 |

> 채팅 MVP 원칙: unread count / read receipt 없음. 새 메시지 점 표시 + 재접속 시 최근 30~50개 복구.

### 번역 기능 목록

> 상세 설계: `docs/04-extensions/translation/23-node-translation.md`, `docs/04-extensions/translation/24-chat-translation.md`

| 기능 | 설명 |
|------|------|
| 자동 번역 | 열람자 언어로 노드 텍스트 자동 번역 (TRANS-01) |
| 번역 캐시 | DeepL + Redis 기반 고속 캐시 (TRANS-02) |
| 캐시 무효화 | 원문 변경 시 text_hash 비교 → 자동 재번역 (TRANS-03) |
| Skeleton UI | 번역 대기 중 표시 (TRANS-04) |
| 원문 토글 | 번역본 ↔ 원문 전환 (TRANS-05) |
| 배치 번역 | 맵 오픈 시 미캐시 노드 일괄 번역, 50개 청크 단위 (TRANS-06) |
| 번역 Broadcast | 완료 시 WebSocket으로 전체 열람자 업데이트 (TRANS-07) |
| 채팅 번역 | 개인 ON/OFF + 원문/번역 동시 표시 + 언어별 캐시 fan-out (TRANS-08~11) |
| Light Notification | unread/read receipt 대신 새 메시지 점 표시 + 재접속 시 최근 N개 복구 |

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

## V3 — 대시보드 맵 + AI 협업 요약

**목표**: Mindmap + Dashboard 통합 + AI 협업 지원 심화

### AI 협업 기능 (COLLAB-14~15 / AI-03~05)

> 상세 설계: `docs/04-extensions/ai/18-ai.md`, `docs/04-extensions/collaboration/25-map-collaboration.md`

| 기능 | 설명 |
|------|------|
| AI Thread 요약 (COLLAB-14 / AI-03) | Node Thread 핵심 논점/결정/미결 사항 요약 |
| AI 작업 추출 (COLLAB-15 / AI-04) | Thread 댓글에서 Action Item·담당자·기한 후보 추출 |
| AI 작업 노드 생성 (AI-05) | 승인된 태스크 후보 → 자식 TODO 노드 일괄 생성 |

> AI 결과는 즉시 반영하지 않고 **preview → 사용자 승인 → 노드 반영** 순서만 허용.

### 대시보드 기능 목록 (DASH-01~05)

> 상세 설계: `docs/04-extensions/dashboard/22-dashboard.md`

| 기능 | 설명 |
|------|------|
| 대시보드 모드 전환 | 맵을 Read-only 대시보드로 전환 (`view_mode = 'dashboard'`, DASH-01) |
| 자동 리프레시 | 설정 주기로 화면 자동 갱신 — Polling → Redis Pub/Sub Push 진화 (DASH-02) |
| 변경 하이라이트 | 값 변경 시 1.5초 flash animation (DASH-03) |
| 갱신 주기 설정 | off / 10초 / 30초 / 1분 / 5분 / 10분 (DASH-04) |
| 외부 값 갱신 API | `PATCH /maps/:id/data` + 맵별 API Key (AES-256) 발급 (DASH-05) |

### Obsidian 연동 V3 확장

| 기능 | 설명 |
|------|------|
| 변경 감지 동기화 (OBS-04) | Vault 파일 변경 → 자동 맵 업데이트 (live sync) |
| Wikilink 노드 연결 (OBS-05) | `[[링크]]` → 노드 연결 또는 하이퍼링크 변환 |

### 갱신 방식 진화 경로

```
V3 MVP   : Polling (setInterval → GET /maps/:id/document?since={lastVersion})
V3 확장  : Redis Pub/Sub + WebSocket Push (채널: dashboard:{mapId}, 트래픽 90%+ 절감)
V3+      : Supabase Realtime dashboard:refresh 채널 통합
```

> `field_registry` 테이블로 외부 연동 가능 필드를 동적으로 관리 (코드 변경 없이 확장 가능).  
> `node_type = 'data-live'` 추가 예정 (V3): 외부 갱신 전용 노드, 사용자 직접 편집 불가.

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
| Kanban 레이아웃 | 높음 | 중간 | MVP |
| 노드 배경 이미지 | 중간 | 낮음 | MVP |
| 자동 저장 | 매우 높음 | 중간 | MVP |
| AI 맵 생성 | 높음 | 중간 | MVP |
| Export (MD/HTML) | 높음 | 중간 | MVP |
| 사용자 설정 (SETT) | 중간 | 낮음 | MVP |
| 실시간 협업 초대/동기화 | 높음 | 높음 | V1 |
| 버전 히스토리 | 높음 | 중간 | V1 |
| Diff Viewer | 높음 | 중간 | V1 |
| WBS 모드 | 높음 | 중간 | V1 |
| Redmine 연동 | 높음 | 높음 | V1 |
| Obsidian 연동 (기본) | 중간 | 중간 | V1 |
| AI 실행형 절차 (Workflow) | 매우 높음 | 높음 | V1.5 |
| 커서 공유 / Soft Lock | 높음 | 중간 | V2 |
| Node Thread | 높음 | 중간 | V2 |
| 실시간 협업 채팅 | 높음 | 중간 | V2 |
| 다국어 번역 | 매우 높음 | 중상 | V2 |
| AI 협업 요약·작업 추출 | 높음 | 중간 | V3 |
| 대시보드 맵 | 높음 | 낮음 | V3 |

---

## 최종 제품 포지셔닝

```
easymindmap =
  XMind (강력한 편집기 + 다양한 레이아웃)
  + Notion (팀 협업 / 워크스페이스)
  + ChatGPT (AI 생성 + AI 실행형 절차)
  + 다국어 지원 (Thinkwise 이상)
  + 대시보드 (거의 없는 조합)
  + Supabase Self-hosted (데이터 완전 자체 소유)
```

### 단계별 포지셔닝 진화

| 단계 | 포지셔닝 |
|------|----------|
| MVP | 웹 기반 AI 마인드맵 편집기 (개인용) |
| V1 | 팀 협업 마인드맵 플랫폼 |
| V1.5 | **AI 기반 실행형 절차 관리 도구** (runbook builder) |
| V2 | 글로벌 다국어 협업 플랫폼 |
| V3 | 마인드맵 + 라이브 대시보드 통합 플랫폼 |
