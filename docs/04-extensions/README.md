# Extensions

이 폴더는 easymindmap의 **확장 기능(Extensions)**을 정의합니다.

AI, 번역, 협업, 퍼블리시, 외부 연동 등 편집기 코어 위에 올라가는 모든 확장 기능이 이 레이어에서 구현됩니다.

> **최종 업데이트:** 2026-05-07
> **변경 이력:** v1.1 — 구형 파일명 참조(`ai-mindmap-generation.md`, `markdown-export.md`, `collaboration-and-concurrency-strategy.md` 등)를 현재 번호 체계(18~32) 기준으로 전면 교체

---

## 📌 기능 목록

| 번호 | 파일 | 기능 그룹 | 설명 | 로드맵 단계 |
|:---:|------|----------|------|:---------:|
| 18 | `ai/18-ai.md` | AI | AI 마인드맵 생성 및 노드 확장 | MVP |
| 19 | `ai/19-ai-workflow.md` | AI WORKFLOW | AI 실행형 절차 (step 기반 workflow) | V1.5 |
| 20 | `import-export/20-export.md` | EXPORT | Markdown / HTML 내보내기 | MVP |
| 21 | `import-export/21-import.md` | IMPORT | Markdown 가져오기 (아웃라인 / 문서 파싱) | MVP |
| 22 | `dashboard/22-dashboard.md` | DASHBOARD | 대시보드 맵 (Read-only / Auto Refresh) | V3 |
| 23 | `translation/23-node-translation.md` | TRANSLATION | 노드 다국어 자동 번역 | V2 |
| 24 | `translation/24-chat-translation.md` | TRANSLATION | 채팅 메시지 실시간 번역 | V2 |
| 25 | `collaboration/25-map-collaboration.md` | COLLAB | 협업 초대 / 동기화 / 커서 / Soft Lock / Node Thread | V1~V2 |
| 26 | `collaboration/26-realtime-chat.md` | CHAT | 실시간 채팅 (맵 채널 / 1:1 DM / @멘션) | V2~V3 |
| 27 | `publish/27-publish-share.md` | PUBLISH | 공개 URL 게시 및 읽기 전용 공유 | MVP |
| 28 | `project/28-wbs.md` | WBS | WBS 모드 (일정 / 마일스톤 / 진척률) | V1 |
| 29 | `project/29-resource.md` | RESOURCE | 리소스 할당 (담당자 / 역할 / 공수) | V1 |
| 30 | `integrations/30-obsidian-integration.md` | OBSIDIAN | Obsidian Vault 양방향 Markdown 동기화 | V1 |
| 31 | `integrations/31-redmine-integration.md` | REDMINE | Redmine 이슈 양방향 동기화 | V1 |
| 32 | `settings/32-settings.md` | SETTINGS | 사용자 설정 (테마 / 언어 / 레이아웃 / API Key) | MVP |

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
