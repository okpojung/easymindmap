# Domain Model

이 폴더는 easymindmap의 **핵심 데이터 구조 및 도메인 모델**을 정의합니다.

마인드맵의 모든 데이터 구조는 이 레이어를 기준으로 설계되며,
Editor, API, DB, 협업 기능은 이 모델을 기반으로 동작합니다.

---

## 📌 주요 문서

### 🧩 Node / Map 구조

- **node-model.md**
  - 노드의 기본 구조 (text, style, children 등)
- **map-model.md**
  - 전체 마인드맵 데이터 구조 정의

---

### 🗄️ DB 및 저장 구조

- **db-schema.md**
  - 전체 DB 구조 설명
- **schema.sql**
  - 실제 DB 생성 SQL
- **erd.md**
  - ERD (Entity Relationship Diagram)

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

---

## 📌 참고 관계

- Editor Core → 이 Domain Model을 기반으로 동작
- API → 이 구조 그대로 전달
- Collaboration → node 단위로 동기화

---

## 🚀 중요도

👉 이 폴더는 **전체 시스템의 기준 설계 (Single Source of Truth)** 입니다.
