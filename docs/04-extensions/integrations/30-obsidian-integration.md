# 30. Obsidian Integration
## OBSIDIAN_INTEGRATION

* 문서 버전: v1.0
* 작성일: 2026-04-16
* 참조: `docs/04-extensions/import-export/20-export.md`, `docs/04-extensions/import-export/21-import.md`

---

### 1. 기능 목적

* easymindmap과 **Obsidian Vault 간 Markdown 기반 양방향 동기화**를 지원하는 기능
* Obsidian에서 작성한 노트를 마인드맵으로 가져오고, 마인드맵을 Obsidian 노트로 내보내기
* Obsidian 플러그인 또는 Vault 폴더 연동으로 파일 기반 동기화

---

### 2. 기능 범위

* 포함:
  * Obsidian → easymindmap: Markdown 가져오기 (OBS-01)
  * easymindmap → Obsidian: Markdown 내보내기 (OBS-02)
  * Vault 폴더 연결 설정 (OBS-03)
  * 변경 감지 및 동기화 (OBS-04, 후순위)
  * Wikilink 처리 (OBS-05, 후순위)

* 제외:
  * 실시간 파일 감시 (파일 시스템 이벤트 기반, MVP 제외)
  * Obsidian 플러그인 직접 개발 (후순위)
  * Obsidian Dataview 호환 (후순위)

---

### 3. 세부 기능 목록

| 기능ID    | 기능명             | 설명                                 | 주요 동작         |
| ------- | --------------- | ---------------------------------- | ------------- |
| OBS-01  | Obsidian → 맵   | Obsidian Markdown 파일을 맵으로 가져오기     | 파일 선택 가져오기    |
| OBS-02  | 맵 → Obsidian   | 맵을 Obsidian 호환 Markdown으로 내보내기     | Markdown 내보내기 |
| OBS-03  | Vault 연결 설정    | Obsidian Vault 경로 / API 연결 설정       | 설정 UI         |
| OBS-04  | 변경 감지 동기화     | Vault 파일 변경 → 자동 맵 업데이트 (후순위)     | Polling/Watch  |
| OBS-05  | Wikilink 처리    | `[[링크]]` → 노드 연결 또는 하이퍼링크로 변환 (후순위) | 링크 변환         |

---

### 4. 기능 정의 (What)

#### 4.1 Obsidian Markdown 호환 형식

```markdown
# 프로젝트 계획 (Root 노드)

## 1단계: 요구사항 (Depth 1)
### 기능 요구사항 (Depth 2)
### 비기능 요구사항 (Depth 2)

## 2단계: 설계 (Depth 1)
### DB 설계 (Depth 2)
### API 설계 (Depth 2)

> [!NOTE] 노드 Note 표시
> 상세 내용은 여기에 작성

```bash
# 코드 블록도 note로 가져오기
npm install
```

```

#### 4.2 Obsidian 전용 요소 처리

| Obsidian 요소        | easymindmap 처리                          |
| ------------------ | --------------------------------------- |
| `[[Wikilink]]`     | 하이퍼링크 또는 노드 연결 (OBS-05)                |
| `#태그`             | 태그 자동 생성 및 할당                           |
| `> [!NOTE]` callout | 노드 Note로 변환                            |
| frontmatter (YAML) | 맵 메타데이터로 파싱 (제목, 날짜)                   |
| `- [ ] checklist`  | Note 체크리스트 블록으로 변환                      |

#### 4.3 Vault 연결 방식 (OBS-03)

* **수동 파일 업로드**: Obsidian에서 `.md` 파일 내보내기 → easymindmap 가져오기 UI
* **Vault API 연결** (후순위): Obsidian Local REST API 플러그인 경유

---

### 5. 동작 방식 (How)

#### 5.1 가져오기 (OBS-01)

```
Obsidian Vault에서 Markdown 파일 선택 또는 내보내기
    │
    ▼
easymindmap > 가져오기 > Markdown 파일 선택
    │
    ▼
파싱 (헤딩 구조 + Obsidian 전용 요소 처리)
    │
    ▼
미리보기 → 확정 → 노드 트리 생성
```

#### 5.2 내보내기 (OBS-02)

```
맵 > 내보내기 > Markdown
    │
    ▼
노드 트리 → Obsidian 호환 Markdown 변환
  - 헤딩 계층 구조
  - Note → `> [!NOTE]` callout
  - 태그 → `#태그` inline
    │
    ▼
.md 파일 다운로드 → Obsidian Vault에 저장
```

---

### 6. 규칙 (Rule)

* 지원 형식: Obsidian Flavored Markdown (CommonMark 기반)
* Wikilink는 MVP에서 하이퍼링크로 변환 (노드 연결은 2단계)
* frontmatter의 `title` 필드 → Root 노드 text로 사용
* 내보내기 시 태그는 `#tagName` inline 표기
* 코드 블록 언어 정보 보존 (```bash, ```python 등)

---

### 7. 예외 / 경계 (Edge Case)

* **깊이 초과 헤딩 (H7+)**: depth 5로 flat 처리
* **Wikilink 순환 참조**: 경고 메시지, 링크만 텍스트로 변환
* **frontmatter 파싱 실패**: frontmatter 무시, 나머지 내용 처리

---

### 8. 권한 규칙

| 역할      | 가져오기 | 내보내기 |
| ------- | ----- | ----- |
| creator | ✅     | ✅     |
| editor  | ✅     | ✅     |
| viewer  | ❌     | ✅     |

---

### 9. DB 영향

* `nodes` — 가져온 노드 트리
* `node_notes` — Obsidian callout/코드 블록 저장
* `tags` — Obsidian `#태그` 자동 생성

---

### 10. API 영향

* `POST /maps/{mapId}/import` — Obsidian Markdown 가져오기 (기존 Import API 공유)
* `POST /maps/{mapId}/export?format=obsidian` — Obsidian 호환 Markdown 내보내기

---

### 11. 연관 기능

* IMPORT (`21-import.md`)
* EXPORT (`20-export.md`)
* TAG (`docs/03-editor-core/search/15-tag.md`)

---

### 12. 구현 우선순위

#### MVP
* OBS-01 파일 가져오기 (IMPORT 기능 확장)
* OBS-02 Obsidian 호환 Markdown 내보내기

#### 2단계
* OBS-03 Vault API 연결 설정
* OBS-05 Wikilink 노드 연결 변환

#### 3단계
* OBS-04 변경 감지 자동 동기화
