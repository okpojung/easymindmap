# EasyMindMap Docs

EasyMindMap 문서는 아래와 같은 구조로 구성됩니다.

```text
docs/
├─ 00-project-overview/
├─ 01-product/
├─ 02-domain/
│
├─ 03-editor-core/        👈 핵심 기능 (대부분의 핵심 편집 기능)
│  ├─ map/
│  │  └─ 01-map.md
│  ├─ node/
│  │  ├─ 02-node-editing.md
│  │  ├─ 03-node-indicator.md
│  │  ├─ 04-node-content.md
│  │  ├─ 05-node-style.md
│  │  ├─ 06-node-rendering.md
│  │  └─ 07-markdown-format-policy.md
│  ├─ layout/
│  │  └─ 08-layout.md
│  ├─ canvas/
│  │  ├─ 09-kanban.md
│  │  ├─ 10-canvas.md
│  │  └─ 11-selection.md
│  ├─ history/
│  │  ├─ 12-history-undo-redo.md
│  │  └─ 13-version-history.md
│  ├─ save/
│  │  └─ 14-save.md
│  ├─ search/
│  │  ├─ 15-tag.md
│  │  ├─ 16-search.md
│  │  └─ 17-keyboard-shortcuts.md
│
├─ 04-extensions/         👈 확장 기능 (AI / 협업 / 외부 연동)
│  ├─ ai/
│  │  ├─ 18-ai.md
│  │  └─ 19-ai-workflow.md
│  ├─ import-export/
│  │  ├─ 20-export.md
│  │  └─ 21-import.md
│  ├─ dashboard/
│  │  └─ 22-dashboard.md
│  ├─ translation/
│  │  ├─ 23-node-translation.md
│  │  └─ 24-chat-translation.md
│  ├─ collaboration/
│  │  ├─ 25-map-collaboration.md
│  │  └─ 26-realtime-chat.md
│  ├─ publish/
│  │  └─ 27-publish-share.md
│  ├─ project/
│  │  ├─ 28-wbs.md
│  │  └─ 29-resource.md
│  ├─ integrations/
│  │  ├─ 30-obsidian-integration.md
│  │  └─ 31-redmine-integration.md
│  └─ settings/
│     └─ 32-settings.md
├─ 05-implementation/
├─ assets/
```

## 빠른 가이드

- **00~02**: 프로젝트 개요, 제품 기획, 도메인 모델
- **03-editor-core**: 맵/노드/레이아웃/히스토리/저장/검색 등 편집기 핵심 기능
- **04-extensions**: AI, 번역, 협업, 퍼블리시, 외부 연동 등 확장 기능
- **05-implementation**: 아키텍처, API, 인프라, 개발 규약
- **assets**: 문서 내 이미지/첨부 파일 리소스
