# Rendering Performance Strategy

## 목적
대규모 노드 렌더링 최적화

## 전략
- Viewport Culling
- Partial Layout
- Dirty Rendering

## 렌더링 방식
- 초기: SVG
- 확장: Canvas

## 목표
- 1000 nodes → 60fps

## 결론
Culling + Partial Layout 중심 설계
