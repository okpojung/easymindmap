# Node Hierarchy Storage Strategy

## 목적

마인드맵의 계층 구조를 효율적으로 저장/조회하기 위한 전략 정의

## 설계 원칙

* Flat 구조 저장
* Tree는 렌더링 시 생성
* subtree 조작 최적화

## 테이블 구조

CREATE TABLE nodes (
id UUID PRIMARY KEY,
map_id UUID NOT NULL,
parent_id UUID NULL,
order_index NUMERIC NOT NULL,
depth INT NOT NULL,
path TEXT NOT NULL,
text TEXT,
created_at TIMESTAMP,
updated_at TIMESTAMP
);

## 핵심 전략

* path 기반 subtree 처리
* prefix 검색 활용

## Path 기반 조회 전략

PostgreSQL의 ltree 또는 text path를 활용하여
재귀 쿼리 없이 subtree 조회 가능

예:
WHERE path <@ 'root.node1'

장점:

* recursive query 제거
* 성능 향상
* subtree 전체 조회 최적화

## order_index 전략

기존:

* INTEGER

개선:

* NUMERIC / FLOAT

이유:
중간 삽입 시 reorder 방지

예:
1, 2 사이 → 1.5

## 계층 최적화 필드

### path

* subtree 조회 최적화

### depth

* 레벨 계산

### order_index

* 형제 노드 순서

## Node 이동 시 Path 갱신 규칙

노드 이동 시:

* 대상 노드 path 변경
* 모든 하위 노드 path 함께 변경

반드시 transaction으로 처리

## 좌표계 저장 기준

* computedX/Y → 자동 계산
* manualX/Y → 사용자 drag 위치

## 결론

Flat + Path + Tree 변환 + Batch Update
