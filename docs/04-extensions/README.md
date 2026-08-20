# Extensions

이 폴더는 easymindmap의 **확장 기능(Extensions)**을 정의합니다.

AI, 번역, 협업, 퍼블리시, 외부 연동 등 편집기 코어 위에 올라가는 모든 확장 기능이 이 레이어에서 구현됩니다.

> **최종 업데이트:** 2026-08-04
> **변경 이력:** v1.2 — 번호 없는 문서 표에 AI·가져오기 관련 5개 문서 추가, 구현 현황 배지 현행화
> v1.1 — 구형 파일명 참조(`ai-mindmap-generation.md`, `markdown-export.md`, `collaboration-and-concurrency-strategy.md` 등)를 현재 번호 체계(18~32) 기준으로 전면 교체

---

## 📌 기능 목록

| 번호 | 파일 | 기능 그룹 | 설명 | 로드맵 단계 |
|:---:|------|----------|------|:---------:|
| 18 | `ai/18-ai.md` | AI | AI 마인드맵 생성 및 노드 확장 | MVP |
| 19 | `ai/19-ai-workflow.md` | AI WORKFLOW | AI 실행형 절차 (step 기반 workflow) | V1.5 |
| 20 | `import-export/20-export.md` | EXPORT | Markdown / HTML / ZIP(첨부 패키징) 내보내기 | MVP |
| 21 | `import-export/21-import.md` | IMPORT | Markdown 가져오기 (아웃라인 / 문서 파싱) | MVP |
| 22 | `dashboard/22-dashboard.md` | DASHBOARD | 대시보드 맵 (Read-only / Auto Refresh) | V3 |
| 23 | `translation/23-node-translation.md` | TRANSLATION | 노드 다국어 자동 번역 | V2 |
| 24 | `translation/24-chat-translation.md` | TRANSLATION | 채팅 메시지 실시간 번역 | V2 |
| 25 | `collaboration/25-map-collaboration.md` | COLLAB | 협업 초대 / 동기화 / 커서 / Soft Lock / Node Thread | V1~V2 |
| 26 | `collaboration/26-realtime-chat.md` | CHAT | 실시간 채팅 (맵 채널 / 1:1 DM / @멘션) | V2~V3 |
| 27 | `collaboration/27-sync-model.md` | COLLAB | **동기화 모델 결정** — CRDT(Yjs) · 무엇을 CRDT 에 담나 · 전송 · 정본 유지 · 오픈코어 경계 (2026-08-16). **25번의 전송·충돌 전제를 대체한다** | 유료 |
| 27 | `publish/27-publish-share.md` | PUBLISH | 공개 URL 게시 및 읽기 전용 공유 | MVP |
| 28 | `project/28-wbs.md` | WBS | WBS 모드 (일정 / 마일스톤 / 진척률) | V1 |
| 29 | `project/29-resource.md` | RESOURCE | 리소스 할당 (담당자 / 역할 / 공수) | V1 |
| 30 | `integrations/30-obsidian-integration.md` | OBSIDIAN | Obsidian Vault 양방향 Markdown 동기화 | V1 |
| 31 | `integrations/31-redmine-integration.md` | REDMINE | Redmine 이슈 양방향 동기화 | V1 |
| 32 | `settings/32-settings.md` | SETTINGS | 사용자 설정 (테마 / 언어 / 레이아웃 / API Key) | MVP |

<!-- 번호 22 는 dashboard/22-dashboard.md 와 import-export/22-map-file-meta.md 두 문서에 중복 사용되고 있다 — 추후 번호 정리 필요 -->

### 번호 없는 설계 문서 (구현 순서대로 추가된 것들)

| 파일 | 설명 |
|---|---|
| `rich-node-content.md` | 리치 노드 콘텐츠 (코드·표·체크·문단) — B2, 완료 |
| `auth-session-ui.md` | 로그인 게이트 · 계정 메뉴 · 맵 세션/브라우저 탭 모델 (2026-08-02) |
| `document-library.md` | 문서함 — 폴더 · 저장 규칙 · 문서 브라우저 · 맵 유형 (2026-08-02) |
| `attachment-storage.md` | 이미지·첨부 저장소 provider + 요금제 용량 — B9 P1 구현 완료(P2~P4 설계) |
| `i18n.md` | 다국어(한국어+영어) 단계·주의사항 — B10 |
| `content-permanence.md` | 내용 영속성 규칙 |
| `vault-mirror.md` | DB 정본 + 파일 미러(C안). 셀프호스트 vault |
| `emm-spec.md`, `emm-testing-guide.md` | EMM Markdown 스펙·검증 |
| `markdown-export.md` | MD 내보내기 규칙 |
| `ai/emm-prompt-templates.md` | 웹 AI용 EMM 프롬프트 템플릿(현행 v4) |
| `ai/web-ai-clipboard.md` | 웹 AI 클립보드 연동(방법 A — 2026-08-03 구현) |
| `ai/easymindmap-copilot-gpt.md` | EasyMindMap Copilot 커스텀 GPT |
| `ai/ai-project-workspace.md` | AI 프로젝트 워크스페이스 (MVP 완료) |
| `import-export/22-map-file-meta.md` | 맵 파일 메타데이터(.md 내장 메타) |

---

## 📌 로드맵 단계별 분류

```
MVP   ── AI 생성(18) / Export(20) / Import(21) / Publish(27) / Settings(32)
V1    ── WBS(28) / Resource(29) / Obsidian(30) / Redmine(31) / Collab Phase1(25)
V1.5  ── AI Workflow(19)
V2    ── Translation(23, 24) / Chat(26) / Collab Phase2(25)
V3    ── Dashboard(22) / AI 협업 요약(18) / Chat DM(26)
```

---

## 📌 설계 방향

- Editor Core와 분리된 확장 구조
- API 기반 외부 연동 (Obsidian, Redmine)
- 단계별 점진적 기능 확장 (MVP → V3)

---

## 🚀 중요도

👉 이 폴더는 **제품 확장성과 비즈니스 성장의 핵심**입니다.
