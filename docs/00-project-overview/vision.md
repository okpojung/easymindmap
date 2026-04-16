# easymindmap — Vision

**최종 업데이트:** 2026-04-16 (cross-ref 갱신)

## 제품명 및 서비스

| 항목 | 내용 |
|------|------|
| 제품명 | easymindmap |
| 서비스 도메인 | mindmap.ai.kr |
| 제품 유형 | 웹 기반 AI 실행형 절차 마인드맵 플랫폼 |

---

## 제품 목표

웹 브라우저에서 마인드맵을 작성하고,
AI를 이용해 자동 생성·확장·실행형 절차화하며,
작성된 맵을 Markdown 및 Standalone HTML 형태로 Export/Publish할 수 있는 서비스.

> "마인드맵 작성 → AI 확장 → 실행형 절차 정제 → 웹 퍼블리싱" 전 과정을 하나의 툴에서 처리한다.

### 확장 포지셔닝

easymindmap은 단순한 아이디어 정리 도구가 아니라,
**AI를 활용하여 실제 작업 절차를 생성하고 실행하며 정제하는 도구**이다.

| 기존 정의 | 확장 정의 |
|---|---|
| Mindmap 기반 아이디어 정리 도구 | AI 기반 실행형 절차 관리 도구 (AI-powered Executable Workflow Tool) |

---

## 핵심 가치 제안

1. **웹 기반 Mindmap Editor** — 설치 없이 브라우저에서 즉시 사용
2. **15종 레이아웃** — 방사형(3종) / 트리(4종) / 계층형(2종) / 진행트리(4종) / 자유배치 / **Kanban 보드형** 지원
3. **노드 배경 이미지** — preset 또는 직접 업로드, fit/position/overlay 설정 (`NodeBackgroundImage` 타입)
4. **AI 기반 자동 생성** — 질문 하나로 마인드맵 초안 생성 (AI-01), 선택 노드 AI 확장 (AI-02); 협업 중(2명 이상)에는 AI 기능 비활성
5. **AI 실행형 절차 (Workflow)** — step 기반 절차 생성 + 오류 해결 + 최종 정제 → runbook 완성 (V1.5); solo 편집 모드 전용 (WFLOW-01~12)
6. **Note Code Block** — paragraph / code_block / warning / tip / checklist 블록 구조, 언어별 syntax highlight + Copy 버튼
7. **실시간 자동 저장** — 편집 중 항상 DB에 보존 (patch 기반, 텍스트/스타일 800ms debounce / 구조 변경 0ms 즉시)
8. **Standalone HTML Export** — 단일 HTML 파일로 웹서버에 그대로 퍼블리싱 / Publish URL 생성 (`/p/{publishId}`)
9. **WBS 모드 + Redmine 연동** — 노드에 시작일·종료일·마일스톤·진척률 설정(WBS-01~05), Redmine 이슈 양방향 동기화 + BullMQ 비동기 처리 + AES-256-GCM 암호화 (RDMN-01~08, V1)
10. **실시간 협업** — 다중 사용자 동시 편집, Presence·커서 공유·Soft Lock(5초 TTL), scope 기반 편집 범위 제한, 맵 단위 실시간 채팅 (COLLAB-01~17, V1~V3)
11. **다국어 자동 번역** — 열람자 언어로 노드 텍스트 자동 번역(DeepL 1차 / LLM fallback), 채팅 메시지 실시간 번역, 3단계 번역 정책 계층 (TRANS-01~11, V2)
12. **대시보드 모드** — 외부 데이터 연동 live 대시보드, Polling → Redis Pub/Sub Push 진화 경로, Flash 하이라이트 (DASH-01~05, V3)
13. **Obsidian 연동** — Obsidian Vault ↔ easymindmap Markdown 양방향 동기화, Wikilink/callout/태그 처리 (OBS-01~05, V1 이후)
14. **사용자 설정** — 테마(라이트/다크/시스템), 기본 레이아웃, 번역 언어, UI 표시 환경설정, 대시보드 API Key 관리 (SETT-01~07)

---

## 타겟 사용자

### Primary — 개인 생산성

- 개인 지식 관리 사용자 (PKM)
- 기획자 / 연구자 / 학생

### Secondary — 기술 실무자 (AI Workflow 핵심 타겟)

- 개발자 / DevOps 엔지니어 / 시스템 관리자
- DBA / TA / 운영 담당자
- 기술 문서 작성자
- IT 온보딩 담당자

### Tertiary — 팀 협업

- 팀 협업 사용자 (V1 이후)
- 교육 기관

---

## Key Differentiators

### 기존 Mindmap 도구 (XMind, MindMeister, Miro)
- 정적 정보 구조화
- 아이디어 정리 중심
- AI 생성 = 1회성 구조 생성

### easymindmap
- 구조 생성 + **실행 지원**
- step 기반 진행 + 오류 해결 통합
- 절차 정제(cleanup) → 재사용 가능한 runbook (SOP)
- note 내 code block (paragraph/code_block/warning/tip/checklist) + copy 기능
- 다국어 자동 번역 (협업 차별화) — DeepL + LLM fallback, 3단계 정책 계층
- Kanban 보드형 레이아웃 (업무 관리 통합, 3레벨 제한)
- WBS 모드 + Redmine 연동 (프로젝트 관리 통합, BullMQ 비동기 + AES-256-GCM)
- Obsidian 연동 (PKM 도구 ↔ Markdown 양방향 동기화, Wikilink/callout 처리)
- scope 기반 협업 편집 범위 제한 (level / node scope)
- 대시보드 모드 → 외부 시스템 데이터 실시간 시각화 (V3)

---

## 참조 프로젝트

| 참조 | 활용 포인트 |
|------|------------|
| [my-mind](https://github.com/ondras/my-mind) | 웹 기반 편집기 구조 참고 |
| [WiseMapping](https://github.com/wisemapping/wisemapping-open-source) | React + SVG 렌더링 / 편집기 분리 구조 |
| [Markmap](https://github.com/markmap/markmap) | Markdown → Mindmap / Standalone HTML export |
| [markmap-mcp-server](https://github.com/jinzcdev/markmap-mcp-server) | AI → Mindmap 생성 파이프라인 |
| [Excalidraw](https://github.com/excalidraw/excalidraw) | 실시간 협업 구조 참고 (V1) |
| [Obsidian](https://obsidian.md) | Vault 연동 / Markdown 양방향 동기화 파이프라인 참고 |
| [Redmine](https://www.redmine.org) | 이슈 관리 연동 / WBS 프로젝트 관리 참고 |

---

## 성공 기준

| Metric | Target | 단계 |
|--------|--------|------|
| Daily Active Users | 1,000 | MVP |
| Map Created | 500 / day | MVP |
| AI Mindmap Generation | 200 / day | MVP |
| AI Workflow 생성 수 | 100 / day | V1.5 |
| Workflow Cleanup 완료율 | 70% 이상 | V1.5 |
| Export 완료율 | 90% 이상 | MVP |
| Obsidian 연동 Import/Export 수 | 100 / week | V1 |
| Redmine 연동 맵 수 | 50 / week | V1 |
| 협업 맵 생성 수 | 50 / week | V1 |
| 다국어 번역 노드 수 | 10,000 / day | V2 |
| 대시보드 모드 맵 수 | 30 / week | V3 |
