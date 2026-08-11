# easymindmap — Vision

**최종 업데이트:** 2026-08-09 (운영 도메인 계획 — easymindmap.org)

## 제품명 및 서비스

| 항목 | 내용 |
|------|------|
| 제품명 | easymindmap |
| 서비스 도메인 | **easymindmap.org** (운영) — 아래 "서비스 도메인 계획" 참조<br>`mindmap.ai.kr` 은 포워드 |
| 제품 유형 | 웹 기반 AI 마인드맵 편집기 (목표: AI 실행형 절차 플랫폼) |

---

## 서비스 도메인 계획 (2026-08-09 결정) ★

**운영 주도메인은 `easymindmap.org`** 다. 제품명과 도메인을 일치시켜,
받는 사람이 메일·링크만 보고도 어느 서비스인지 알 수 있게 한다.

**적용 시점 = 운영 구축 때다.** 지금 도는 개발 서버는
`dev.mindmap.ai.kr` 을 그대로 쓴다 (아래 "환경별 도메인").

이 표가 **도메인의 단일 기준**이다. 다른 문서에 적힌 URL 예시가 이 표와
어긋나면 이 표가 맞다.

| 용도 | 운영 도메인 | 상태 |
|---|---|---|
| **홈페이지**(소개·가격·문의) | `www.easymindmap.org` | **결정** |
| **앱**(로그인 화면·에디터) | `web.easymindmap.org` | **결정** |
| API | `api.easymindmap.org` (제안) | 미정 |
| 인증(GoTrue) | `auth.easymindmap.org` (제안) | 미정 |
| 퍼블리시된 맵 | `web.easymindmap.org/p/{publishId}` (제안) | 미정 |
| 메일 발신 | `noreply@easymindmap.org` (제안) | 미정 |

### 기존 `mindmap.ai.kr` 은 **포워드**한다

```
web.mindmap.ai.kr  →  web.easymindmap.org
www.mindmap.ai.kr  →  www.easymindmap.org
```

버리지 않고 넘겨 주는 이유: 이미 나간 링크·북마크·검색 결과가 끊기지
않게 하기 위해서다. **301(영구 이동)** 으로 넘겨야 검색 순위도 새 도메인
으로 옮겨 간다(302 는 옮겨 가지 않는다).

### 환경별 도메인 — 개발은 지금 그대로 (2026-08-09 확정)

**개발 서버는 `mindmap.ai.kr` 을 계속 쓴다.** 운영을 새로 구축할 때
위 표의 `easymindmap.org` 를 적용한다. 사용자 확정 사항이다.

| 환경 | 앱(로그인·에디터) | API | 인증 |
|---|---|---|---|
| **개발** (지금) | `dev.mindmap.ai.kr` | `api-dev.mindmap.ai.kr` | `auth-dev.mindmap.ai.kr` |
| **운영** (구축 시) | **`web.easymindmap.org`** | 위 표 참조 | 위 표 참조 |

개발 주소를 함께 옮기지 않는 이유: 배포·인증·CORS 를 한꺼번에 갈아야
해서, 운영 전환에서 무엇이 깨졌는지 가려낼 수 없게 된다. **바뀐 것이
하나일 때만 원인을 짚을 수 있다.** 개발은 그대로 두고 운영만 새로
세운 뒤, 운영이 자리를 잡으면 그때 개발도 옮길지 정한다.

> 그때까지 개발 서버에서는 인증 메일도 `dev` 환경 설정을 그대로 쓴다.
> 발신 주소를 `noreply@easymindmap.org` 로 먼저 바꿔도 무방하다 —
> 도메인만 다를 뿐 흐름은 같고, 운영 전환 때 그 부분은 손대지 않아도
> 된다.

### 도메인을 옮길 때 **함께 바꿔야 하는 설정** ⚠️

도메인만 바꾸면 화면은 떠도 **로그인·저장이 안 된다.** 아래를 한 묶음으로
본다 (하나라도 빠지면 브라우저에서만 조용히 실패한다).

| 어디 | 무엇 | 안 바꾸면 |
|---|---|---|
| api 환경변수 | `CORS_ORIGIN` 에 새 앱 주소 추가 | 브라우저에서만 API 호출이 전부 막힌다 (서버는 정상으로 보인다) |
| frontend **빌드** 변수 | `VITE_API_URL` = 새 API 주소 | 앱이 옛 API 를 부른다 — **빌드 시점에 구워지므로 재빌드 필수** |
| GoTrue | `GOTRUE_SITE_URL` · 리디렉트 허용 목록 | 가입·비밀번호 재설정 메일의 링크가 옛 주소로 간다 |
| frontend 빌드 변수 | `VITE_SUPABASE_URL` = 새 인증 주소 | 로그인 자체가 안 된다 |
| api 환경변수 | `SMTP_FROM` = `noreply@easymindmap.org` | 인증 메일이 엉뚱한 도메인에서 온 것처럼 보인다 → 스팸 신고 |
| DNS·프록시 | 새 호스트 A 레코드 + 인증서 | |
| 메일 도메인 | 새 도메인에 **SPF·DKIM·DMARC** | 인증번호 메일이 스팸함으로 간다 |

> 메일 발신 도메인은 **앱 도메인과 같아야** 한다. 가입 인증번호가
> 낯선 도메인에서 오면 사용자가 스팸으로 신고하고, 신고가 쌓이면 그
> 계정에서 나가는 **모든 메일**의 도달률이 떨어진다
> (auth-session-ui.md §11.4).

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
2. **9종 레이아웃** — 방사형(2종) / 트리(2종) / 계층형 / 진행트리 / 시간배치(타임라인) / 자유배치 / **Kanban 보드형** 지원
3. **노드 배경 이미지** — preset 또는 직접 업로드, fit/position/overlay 설정 (`NodeBackgroundImage` 타입, **V1**)
4. **AI 기반 자동 생성** — 질문 하나로 마인드맵 초안 생성 (AI-01), 선택 노드 AI 확장 (AI-02); 협업 중(2명 이상)에는 AI 기능 비활성
5. **AI 실행형 절차 (Workflow)** — step 기반 절차 생성 + 오류 해결 + 최종 정제 → runbook 완성 (V1.5); solo 편집 모드 전용 (WFLOW-01~12)
6. **Note Code Block** — paragraph / code_block / table / checklist 블록 구조, 언어별 syntax highlight + Copy 버튼
7. **자동 저장** — 편집은 **브라우저(IndexedDB)에 즉시** 보관되고, 서버에는 **주기(기본 5분)·미저장 편집 50개·탭 전환/창 닫기** 시점에 스냅샷으로 올라간다. 히스토리 버전은 **☁ 저장·맵 닫기에서만** + 단일 세션 편집 잠금 (2026-08-06 개편)
8. **Standalone HTML Export** — 단일 HTML 파일로 웹서버에 그대로 퍼블리싱 / Publish URL 생성(계획 — V1)
9. **WBS 모드 + Redmine 연동** — 노드에 시작일·종료일·마일스톤·진척률 설정(WBS-01~05), Redmine 이슈 양방향 동기화 + BullMQ 비동기 처리 + AES-256-GCM 암호화 (RDMN-01~08, V1)
10. **실시간 협업** — 다중 사용자 동시 편집, Presence·커서 공유·Soft Lock(5초 TTL), scope 기반 편집 범위 제한, 맵 단위 실시간 채팅 (COLLAB-01~17, V1~V3)
11. **다국어 자동 번역** — 열람자 언어로 노드 텍스트 자동 번역(DeepL 1차 / LLM fallback), 채팅 메시지 실시간 번역, 3단계 번역 정책 계층 (TRANS-01~11, V2)
12. **대시보드 모드** — 외부 데이터 연동 live 대시보드, Polling → Redis Pub/Sub Push 진화 경로, Flash 하이라이트 (DASH-01~05, V3)
13. **Obsidian 연동** — Obsidian Vault ↔ easymindmap Markdown 양방향 동기화, Wikilink/callout/태그 처리 (OBS-01~05, V1 이후)
14. **사용자 설정** — 테마(라이트/다크)는 구현 완료; 기본 레이아웃, 번역 언어, UI 표시 환경설정, 대시보드 API Key 관리는 준비 중 (SETT-01~07, V1~)

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
- note 내 code block (paragraph/code_block/table/checklist) + copy 기능
- 다국어 자동 번역 (협업 차별화) — DeepL + LLM fallback, 3단계 정책 계층
- Kanban 보드형 레이아웃 (업무 관리 통합 — 깊은 서브트리는 중첩 카드)
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
