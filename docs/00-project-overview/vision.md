# easymindmap — Vision

**최종 업데이트:** 2026-03-31

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
2. **15종 레이아웃** — 방사형 / 트리 / 계층형 / 진행트리 / 자유배치 / **Kanban 보드형** 지원
3. **노드 배경 이미지** — preset 또는 직접 업로드, fit/overlay 설정
4. **AI 기반 자동 생성** — 질문 하나로 마인드맵 초안 생성
5. **AI 실행형 절차 (Workflow)** — step 기반 절차 생성 + 오류 해결 + 최종 정제 → runbook 완성
6. **Note Code Block** — 명령어 code block + copy 버튼, 실행 정확도 향상
7. **실시간 자동 저장** — 편집 중 항상 DB에 보존 (patch 기반)
8. **Standalone HTML Export** — 단일 HTML 파일로 웹서버에 그대로 퍼블리싱
9. **다국어 자동 번역** — 열람자 언어로 노드 텍스트 자동 번역 (V2)
10. **대시보드 모드** — 외부 데이터 연동 live 대시보드 (V3)

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
- 절차 정제(cleanup) → 재사용 가능한 runbook
- note 내 code block + copy 기능
- 다국어 자동 번역 (협업 차별화)
- Kanban 보드형 레이아웃 (업무 관리 통합)

---

## 참조 프로젝트

| 참조 | 활용 포인트 |
|------|------------|
| [my-mind](https://github.com/ondras/my-mind) | 웹 기반 편집기 구조 참고 |
| [WiseMapping](https://github.com/wisemapping/wisemapping-open-source) | React + SVG 렌더링 / 편집기 분리 구조 |
| [Markmap](https://github.com/markmap/markmap) | Markdown → Mindmap / Standalone HTML export |
| [markmap-mcp-server](https://github.com/jinzcdev/markmap-mcp-server) | AI → Mindmap 생성 파이프라인 |
| [Excalidraw](https://github.com/excalidraw/excalidraw) | 실시간 협업 구조 참고 (V1) |

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
