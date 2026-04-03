# Collaboration & Concurrency Strategy

## 목적

협업 및 동시성 처리 전략 정의

## Phase 1

* Last Write Wins

## Phase 2

* Node Lock

## Phase 3

* CRDT (Yjs)

## 구조

Client ↔ WebSocket ↔ Server

## Optimistic UI Updates

* UI 먼저 반영
* 서버 실패 시 rollback

## Version Shadowing

* 변경 이력 관리
* 충돌 감지 보조

## 동기화 흐름

UI → Local → Server → Broadcast

## 충돌 처리

* text: LWW 또는 merge
* position: 최신 drag 기준

## 상태 분리

* Document Store / UI Store 분리

## 결론

단계적 확장 전략

---

## AI Usage Restriction in Collaboration

> 관련 PRD: `docs/01-product/AI-Executable-Workflow-PRD.md` §10.8

### Rule

동시 접속자 수 ≥ 2인 협업 상태에서는 AI 기능을 사용할 수 없다.

```
접속자 수 = 1  →  AI 기능 사용 가능
접속자 수 ≥ 2  →  AI 기능 비활성화
```

### 적용 대상

| 기능 | 제한 여부 |
|---|:---:|
| AI Generate (POST /ai/generate) | ✅ 제한 |
| AI Expand (POST /ai/expand) | ✅ 제한 |
| AI Workflow Generate (POST /ai/workflow/generate) | ✅ 제한 |
| AI Workflow Resolve (POST /ai/workflow/resolve) | ✅ 제한 |
| AI Workflow Cleanup (POST /ai/workflow/cleanup) | ✅ 제한 |
| 일반 편집 (노드 추가/수정/삭제) | ❌ 제한 없음 |

### 서버 정책

협업 상태에서 AI API 호출 시:
```json
HTTP 403 Forbidden
{
  "error": "AI_UNAVAILABLE_IN_COLLABORATION",
  "message": "협업 중에는 AI 자동 생성/확장 기능을 사용할 수 없습니다.",
  "statusCode": 403
}
```

### UI 정책

- 협업 상태에서는 AI 버튼 disabled 처리
- 안내 메시지 표시: "협업 중에는 AI 자동 생성/확장 기능을 사용할 수 없습니다."
- 접속자가 1명으로 줄어들면 AI 버튼 자동 활성화
