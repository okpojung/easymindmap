# Domain Model

> 최종 업데이트: 2026-08-04 — 문서 링크를 실제 파일 구성에 맞게 정리하고,
> 저장 구조가 **스냅샷·정규화 두 경로 병행**임을 명시.

이 폴더는 easymindmap의 **핵심 데이터 구조 및 도메인 모델**을 정의합니다.

마인드맵의 모든 데이터 구조는 이 레이어를 기준으로 설계되며,
Editor, API, DB, 협업 기능은 이 모델을 기반으로 동작합니다.

---

## 📌 주요 문서

### 🧩 Node / Map 구조

- **domain-models.md**
  - 노드/맵 도메인 모델 통합 문서 (구 node-model.md + map-model.md)
  - NodeObject·MapObject·LayoutType·ShapeType 등 타입 정의

---

### 🗄️ DB 및 저장 구조

- **db-schema.md**
  - 전체 DB 구조 설명 (ERD 요약 포함 — [ERD 요약](db-schema.md#erd-요약),
    [ERD — 전체 구조 요약](db-schema.md#erd--전체-구조-요약))
- **schema.sql**
  - **설계본**(구현 전 설계 문서). **실물 스키마 단일 원본은
    `apps/api/database/schema.sql`** 이다 — `npm run db:apply` 로 적용.

---

### 🌳 계층 구조 핵심

- **node-hierarchy-storage-strategy.md ⭐**
  - parent_id + path 기반 계층 저장 전략
  - subtree 이동/삭제 알고리즘 핵심 문서

---

## 📌 설계 원칙

- 저장: **Flat 구조**
- 렌더링: **Tree 구조**
- 계층 처리: **path 기반**
- 성능: subtree 단위 처리
- 저장 경로: **두 경로 병행** — 문서 스냅샷(`map_documents` JSONB, 현재
  프런트가 사용하는 경로)과 정규화 flat(`nodes` ltree, 협업·세밀 동기화용)이
  나란히 존재한다.

---

## 📌 참고 관계

- Editor Core → 이 Domain Model을 기반으로 동작
- API → 이 구조 그대로 전달
- Collaboration → node 단위로 동기화

---

## 🚀 중요도

👉 이 폴더는 **전체 시스템의 기준 설계 (Single Source of Truth)** 입니다.
   (단, 실물 DB 스키마의 단일 원본은 `apps/api/database/schema.sql`)
