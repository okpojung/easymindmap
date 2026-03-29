# Collaboration & Concurrency Strategy

## 목적
협업 및 동시성 처리 전략 정의

## Phase 1
- Last Write Wins

## Phase 2
- Node Lock

## Phase 3
- CRDT (Yjs)

## 구조
Client ↔ WebSocket ↔ CRDT ↔ Server

## 결론
단계적 확장 전략 적용

## 5. 클라이언트-서버 동기화 흐름 (CRDT 기반 확장 고려)

easymindmap은 향후 Yjs 기반 협업을 고려하여 다음 구조를 따른다.

### 기본 흐름

1. 사용자 입력 → Command 생성
2. 로컬 Document Store 즉시 반영 (Optimistic Update)
3. Autosave Queue 등록
4. 서버 전송
5. 서버 → 다른 클라이언트로 브로드캐스트
6. Remote Patch 적용

---

## 6. 충돌 처리 원칙

- 서버 상태를 기준으로 하지 않고 CRDT 병합을 기준으로 한다
- 동일 노드 수정 충돌 시:
  - text: last-writer-wins 또는 CRDT text merge
  - position: 가장 최근 drag 기준
  - structure: moveNode 충돌 시 parent 기준 reconcile

---

## 7. UI 상태와 문서 상태 분리

- Document Store → CRDT 동기화 대상
- Editor UI / Interaction Store → 로컬 전용
- 드래그 중 상태는 절대 서버로 전송하지 않음
