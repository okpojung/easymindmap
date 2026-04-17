# EasyMindMap AI 문서 정합성 검증 규칙서 v1.0

* 문서 버전: v1.0
* 작성일: 2026-04-17
* 적용 대상: `/docs`
* 목적: 문서 간 정합성 유지 및 AI 기반 검증 자동화

---

## 1. 목적

본 문서는 easymindmap 프로젝트의 설계 문서가 아래 항목을 만족하도록 검증하기 위한 기준을 정의한다.

* 문서 구조 완전성
* 문서 간 정합성
* 구현 반영 여부
* 설계 품질

---

## 2. 검증 대상

* 00-project-overview
* 01-product
* 02-domain
* 03-editor-core
* 04-extensions
* 05-implementation

---

## 3. 검증 레벨

### Level 1 - 문서 구조

* 필수 섹션 존재 여부

### Level 2 - 문서 간 정합성

* 기능 ↔ 도메인 ↔ 구현 일치 여부

### Level 3 - 구현 반영

* schema / API 반영 여부

### Level 4 - 설계 품질

* 모호성 / 누락 / 예외 부족

---

## 4. Severity 등급

### HIGH

* 기능 정의 ↔ DB 불일치
* 정책 충돌
* 충돌 마커 존재

### MEDIUM

* Edge Case 부족
* API 영향 누락
* 규칙 부족

### LOW

* 용어 불일치
* 변경 이력 누락

---

## 5. 문서 구조 규칙 (STR)

### STR-001

Rule 섹션 필수

### STR-002

Edge Case 섹션 필수

### STR-003

DB 영향 / API 영향 필수

---

## 6. Edge Case 규칙 (EDG)

아래 8개 유형 포함

1. 빈 값
2. 최대/최소
3. 중복
4. 권한 없음
5. 삭제됨
6. 충돌
7. 장애
8. 금지

---

## 7. 정합성 규칙 (CON)

### CON-001

기능 정의 ↔ 도메인 모델 일치

### CON-002

NODE_RENDERING은 node_type 기준

### CON-003

NODE_CONTENT 구조 일관성

### CON-004

Layout / Edge 정책 일치

---

## 8. 구현 반영 규칙 (IMP)

### IMP-001

schema.sql 반영 필수

### IMP-002

API spec 반영 필수

---

## 9. PR 규칙 (PR)

### PR-001

충돌 마커 금지

### PR-002

PR은 하나의 주제만

---

## 10. 검증 결과 형식

### Summary

* HIGH / MEDIUM / LOW 개수

### Issue

* 파일
* 규칙ID
* 문제
* 수정 제안

---

## 11. 운영 절차

1. PR 생성
2. AI 검증 실행
3. 결과 확인
4. 수정
5. merge

---

## 12. 핵심 원칙

* main은 항상 안정 상태
* PR 기반 반영
* AI는 보조, 최종 판단은 사람

---
