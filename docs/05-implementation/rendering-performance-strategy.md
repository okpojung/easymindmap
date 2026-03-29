# Rendering Performance Strategy

## 목적

대규모 노드 렌더링 최적화

## 전략

* Viewport Culling
* Partial Layout
* Dirty Rendering

## Viewport Culling

현재 화면(viewport)에 포함된 노드만 렌더링

## Partial Relayout

변경된 subtree만 재계산

## Dirty Rendering

변경된 노드만 렌더링

## Debounced Autosave

* typing: 500~1000ms debounce
* drag: 종료 시 저장
* 구조 변경: 즉시 저장

## 좌표 처리 전략

computed + offset 방식

## 렌더링 방식

* 초기: SVG
* 확장: Canvas

## 목표

* 1000 nodes → 60fps

## 결론

Culling + Partial Layout + Debounced Autosave
