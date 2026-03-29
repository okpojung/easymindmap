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

## 4. 계층 최적화 필드 (Hierarchy Optimization Fields)

대규모 맵 및 subtree 이동 성능 최적화를 위해 아래 필드를 추가한다.

### path
- 형식: "root.node1.node5"
- PostgreSQL ltree 또는 문자열 기반 path
- subtree 조회 및 이동 최적화에 사용

### depth
- 루트 기준 깊이 (0,1,2...)
- 정렬 및 레벨 스타일 계산에 사용

### order_index
- 형제 노드 간 순서
- UI 렌더링 순서 및 drag reorder 기준

---

## 5. 설계 원칙

- Document Store의 기준은 항상 `id` 기반 정규화 구조를 유지한다
- path/depth는 성능 최적화 필드이며 상태의 진실(Source of Truth)은 아니다
- subtree 이동 시 path는 반드시 batch update 처리한다
