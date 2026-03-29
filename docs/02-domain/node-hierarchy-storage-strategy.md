# Node Hierarchy Storage Strategy

## 목적
마인드맵의 계층 구조를 효율적으로 저장/조회하기 위한 전략 정의

## 설계 원칙
- Flat 구조 저장
- Tree는 렌더링 시 생성
- subtree 조작 최적화

## 테이블 구조
CREATE TABLE nodes (
    id UUID PRIMARY KEY,
    map_id UUID NOT NULL,
    parent_id UUID NULL,
    order_index INT NOT NULL,
    depth INT NOT NULL,
    path TEXT NOT NULL,
    text TEXT,
    created_at TIMESTAMP,
    updated_at TIMESTAMP
);

## 핵심 전략
- path 기반 subtree 처리
- prefix 검색 활용

## 결론
Flat + Path + Tree 변환
