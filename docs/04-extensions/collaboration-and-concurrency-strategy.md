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
