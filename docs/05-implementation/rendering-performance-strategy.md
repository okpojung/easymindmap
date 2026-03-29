# Rendering Performance Strategy

## 목적
대규모 노드 렌더링 최적화

## 전략
- Viewport Culling

## 6. Large Map Loading Strategy

대규모 맵(1000~10000 nodes)을 위한 로딩 전략

---

### 초기 로딩

- root + depth 2~3 까지만 로딩
- 나머지는 collapsed 상태 유지

---

### Lazy Expansion

노드 expand 시:

- 해당 subtree만 서버에서 fetch
- children count 기반 indicator 표시 가능

---

### Partial Fetch API

GET /maps/{mapId}/nodes?parentId=xxx

---

### Indicator Summary 활용

노드에 다음 정보만 포함:

{
  childCount: 12,
  hasMore: true
}

---

### 캐싱 전략

- 이미 로딩된 subtree는 메모리 캐싱
- 필요 시 eviction 정책 적용


- Partial Layout
- Dirty Rendering

## 렌더링 방식
- 초기: SVG
- 확장: Canvas

## 목표
- 1000 nodes → 60fps

## 결론
Culling + Partial Layout 중심 설계
