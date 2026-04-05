# easymindmap — PostgreSQL ERD (통합판)

- **DB**: PostgreSQL 16 (Supabase Self-hosted on ESXi VM-03)
- **문서 버전**: v3.1
- **최종 결정일**: 2026-03-30

---

## 변경 이력

| 버전 | 날짜 | 내용 |
|---|---|---|
| v1.0 | — | 초기 설계 |
| v2.0 | — | Map Properties 레벨별 설계 반영 (`map_themes` 신규, `nodes` 변경) |
| v2.1 | — | `users` 테이블 휴대폰 번호 컬럼 추가 |
| v3.0 | 2026-03-29 | `ltree` extension 채택 → `nodes.path` LTREE 컬럼 + GIST/BTREE 인덱스 추가<br>`nodes.order_index` INT → FLOAT (중간 삽입 O(1))<br>`nodes.depth` 컬럼 추가 (앱단 계산, `ltree nlevel()-1`)<br>`nodes.manual_position` JSONB (`{ x, y }`) → `manual_x/manual_y` 대체<br>`nodes.size_cache` JSONB 추가 (렌더링 캐시)<br>`nodes.style_json` JSONB 내 `backgroundImage` 키로 배경이미지 통합 (MVP)<br>`maps.deleted_at` soft-delete 추가 (30일 휴지통)<br>`published_maps`, `ai_jobs`, `node_translations`, `field_registry` 테이블 추가<br>`map_revisions` 관계 명시 / 전체 인덱스 목록 갱신 |
| v3.1 | 2026-03-30 | 다국어 번역 V2 스키마 반영<br>`users`: `secondary_languages`, `skip_english_translation` 추가<br>`maps`: `translation_policy_json` JSONB 추가<br>`nodes`: `translation_mode`, `translation_override`, `author_preferred_language` 추가<br>`node_translations`: `idx_node_translations_node_id` 인덱스 추가<br>번역 정책 3단계 계층 설계 포인트 추가 |
| v3.2 | 2026-03-31 | 정합성 보완 수정<br>`tags`: `workspace_id` 추가 (개인↔워크스페이스 공유 태그 분리)<br>`nodes.layout_type`: NOT NULL → NULL 허용 (부모 상속 의미 명확화)<br>`nodes.background_image_*`: 3개 전용 컬럼 분리 (`background_image_path`, `_fit`, `_opacity`) — `style_json`에서 분리<br>`node_media.media_type`: CHECK(`'audio'`, `'video'`) 제약 추가 (이미지 혼용 방지)<br>`maps.view_mode`: `'kanban'` 값 추가<br>RLS: workspace_members 기반 공유 접근 정책 추가 (editor/viewer 역할 분리) |

---

## 1. 전체 관계 트리

```
auth.users  (Supabase Auth 자동 생성)
 └── public.users  (프로필 확장)
      ├── workspaces  (1:N)
      │    ├── workspace_members  (N:N ↔ users)
      │    └── maps  (1:N)
      │         ├── map_revisions     (1:N, 버전 히스토리)
      │         ├── published_maps    (1:N, 공개 스냅샷)
      │         ├── exports           (1:N, 내보내기 작업)
      │         └── nodes             (1:N)
      │              ├── node_notes        (1:1)
      │              ├── node_links        (1:N)
      │              ├── node_attachments  (1:N)
      │              ├── node_media        (1:1)
      │              ├── node_tags         (N:N ↔ tags)
      │              └── node_translations (1:N, 다국어)
      ├── tags     (1:N)
      └── ai_jobs  (1:N)

field_registry  (독립 테이블 — 대시보드 필드 메타)
```

---

## 2. 핵심 테이블 상세

### 2.1 `public.users`

| 컬럼 | 타입 | 제약 / 기본값 | 설명 |
|---|---|---|---|
| `id` | UUID | PK, FK → `auth.users(id)` ON DELETE CASCADE | Supabase Auth 연동 |
| `display_name` | VARCHAR(100) | | 표시 이름 |
| `preferred_language` | VARCHAR(10) | DEFAULT `'ko'` | 기본 언어 |
| `secondary_languages` | VARCHAR(20)[] | DEFAULT `'{}'` | **[V2]** 2차 언어 배열 (최대 3개) |
| `skip_english_translation` | BOOLEAN | DEFAULT `TRUE` | **[V2]** 영어 번역 생략 여부 |
| `default_layout_type` | VARCHAR(50) | DEFAULT `'radial-bidirectional'` | 기본 레이아웃 |
| `ui_preferences_json` | JSONB | NULL | UI 표시 설정 (`showTranslationIndicator` 등) |
| `created_at` | TIMESTAMPTZ | | |
| `updated_at` | TIMESTAMPTZ | | |

> - `auth.users` 생성 시 `handle_new_user()` 트리거로 자동 INSERT
> - 이메일/비밀번호는 `auth.users`에 있으며 `public.users`에는 없음

---

### 2.2 `public.workspaces`

| 컬럼 | 타입 | 제약 / 기본값 | 설명 |
|---|---|---|---|
| `id` | UUID | PK | |
| `owner_id` | UUID | FK → `users(id)` ON DELETE CASCADE | |
| `name` | VARCHAR(255) | | |
| `created_at` | TIMESTAMPTZ | | |
| `updated_at` | TIMESTAMPTZ | | |

#### `public.workspace_members` (N:N 연결 테이블)

| 컬럼 | 타입 | 제약 / 기본값 | 설명 |
|---|---|---|---|
| `workspace_id` | UUID | PK (복합), FK → `workspaces(id)` ON DELETE CASCADE | |
| `user_id` | UUID | PK (복합), FK → `users(id)` ON DELETE CASCADE | |
| `role` | VARCHAR(20) | DEFAULT `'editor'` | `'owner'` \| `'editor'` \| `'viewer'` |
| `joined_at` | TIMESTAMPTZ | | |

---

### 2.3 `public.maps`

| 컬럼 | 타입 | 제약 / 기본값 | 설명 |
|---|---|---|---|
| `id` | UUID | PK | |
| `owner_id` | UUID | FK → `users(id)` ON DELETE CASCADE | |
| `workspace_id` | UUID | FK → `workspaces(id)` ON DELETE SET NULL, nullable | 워크스페이스 삭제 시 맵은 유지 |
| `title` | VARCHAR(255) | DEFAULT `'Untitled'` | |
| `default_layout_type` | VARCHAR(50) | DEFAULT `'radial-bidirectional'` | |
| `view_mode` | VARCHAR(20) | DEFAULT `'edit'` | `'edit'` \| `'dashboard'` |
| `refresh_interval_seconds` | INT | DEFAULT `0` | 0: off, Dashboard 갱신 주기 |
| `current_version` | INT | DEFAULT `0` | |
| `translation_policy_json` | JSONB | NULL | **[V2]** 맵별 번역 정책. NULL = 사용자 기본 설정 따름<br>구조: `{ skipLanguages: string[], skipEnglish: boolean \| null }` |
| `deleted_at` | TIMESTAMPTZ | NULL | soft-delete: NULL=활성, NOT NULL=삭제됨 |
| `created_at` | TIMESTAMPTZ | | |
| `updated_at` | TIMESTAMPTZ | | |

**인덱스**

| 인덱스명 | 컬럼 / 조건 |
|---|---|
| `idx_maps_owner_id` | `(owner_id)` |
| `idx_maps_workspace_id` | `(workspace_id)` |
| `idx_maps_deleted_at` | `(deleted_at) WHERE deleted_at IS NULL` — 활성 맵 필터 최적화 |

**삭제 정책**

| 단계 | 동작 |
|---|---|
| Soft-delete | `deleted_at = NOW()` 설정 → 30일간 휴지통 보관 |
| 복구 | `UPDATE maps SET deleted_at = NULL WHERE id = $1` (30일 이내) |
| 영구 삭제 | `DELETE FROM maps WHERE deleted_at < NOW() - INTERVAL '30 days'` (배치) |
| 노드 cascade | maps 삭제 → nodes `ON DELETE CASCADE` 자동 삭제 |

---

### 2.4 `public.map_revisions`

| 컬럼 | 타입 | 제약 / 기본값 | 설명 |
|---|---|---|---|
| `id` | UUID | PK | |
| `map_id` | UUID | FK → `maps(id)` ON DELETE CASCADE | |
| `version` | INT | NOT NULL | |
| `patch_json` | JSONB | NOT NULL | `NodePatch[]` 배열 |
| `client_id` | VARCHAR(100) | | 작성 클라이언트 식별자 |
| `patch_id` | VARCHAR(200) | UNIQUE | idempotency key |
| `created_by` | UUID | FK → `users(id)` | |
| `created_at` | TIMESTAMPTZ | | |

**인덱스**

| 인덱스명 | 컬럼 |
|---|---|
| `idx_map_revisions_map_id` | `(map_id, version DESC)` |

> 서버 영속 버전 히스토리 — 클라이언트 메모리 Undo/Redo와 별개

---

### 2.5 `public.nodes` ★ 핵심 테이블

| 컬럼 | 타입 | 제약 / 기본값 | 설명 |
|---|---|---|---|
| `id` | UUID | PK | |
| **소속** | | | |
| `map_id` | UUID | FK → `maps(id)` ON DELETE CASCADE | |
| `parent_id` | UUID | FK → `nodes(id)` ON DELETE CASCADE, nullable | self-reference |
| **콘텐츠** | | | |
| `text` | TEXT | DEFAULT `''` | |
| `node_type` | VARCHAR(30) | DEFAULT `'text'` | `'text'` \| `'data-live'` |
| **다국어** | | | |
| `text_lang` | VARCHAR(20) | | 작성 언어 코드 (`'ko'`, `'en'`, `'ja'`) |
| `text_hash` | VARCHAR(128) | | SHA-256[:16], 번역 캐시 무효화 키 |
| `translation_mode` | VARCHAR(10) | DEFAULT `'auto'` | **[V2]** `'auto'` \| `'skip'`, 저장 시 서버 자동 결정 |
| `translation_override` | VARCHAR(10) | NULL | **[V2]** `'force_on'` \| `'force_off'` \| NULL — 편집자 수동 설정 |
| `author_preferred_language` | VARCHAR(20) | NULL | **[V2]** 작성 시점 작성자 기본 언어 스냅샷 |
| **트리 구조** | | | |
| `depth` | INT | DEFAULT `0` | 앱단 계산 (`ltree nlevel(path) - 1`) |
| `order_index` | FLOAT | DEFAULT `0.0` | **[v3.0]** 중간 삽입 O(1), 기존 INT에서 변경 |
| `path` | LTREE | NOT NULL | **[v3.0]** 예: `root.n_a1b2c3d4.n_e5f6a7b8` |
| **레이아웃** | | | |
| `layout_type` | VARCHAR(50) | **NULL 허용** | **[v3.1]** `NULL` = 부모 레이아웃 상속. 루트 노드는 앱단에서 `'radial-bidirectional'` 기본값 보장. kebab-case 저장. kanban 시 depth 0=board, 1=column, 2=card, 3+ 금지 |
| `collapsed` | BOOLEAN | DEFAULT `FALSE` | |
| **도형 & 스타일** | | | |
| `shape_type` | VARCHAR(50) | DEFAULT `'rounded-rectangle'` | `'rounded-rectangle'` \| `'rectangle'` \| `'ellipse'` \| `'pill'` \| `'diamond'` \| `'parallelogram'` \| `'none'` |
| `style_json` | JSONB | DEFAULT `'{}'` | `NodeStyle` 저장. |
| **배경 이미지** | | | |
| `background_image_path` | VARCHAR(500) | NULL | **[v3.1]** Supabase Storage 경로. NULL = 배경 이미지 없음. node_media(오디오/비디오)와 역할 분리 |
| `background_image_fit` | VARCHAR(20) | DEFAULT `'cover'` | `'cover'` \| `'contain'` \| `'stretch'` \| `'original'` |
| `background_image_opacity` | NUMERIC(3,2) | DEFAULT `1.0` | 0.00~1.00, 텍스트 가독성을 위한 오버레이 불투명도 |
| **자유배치** | | | |
| `manual_position` | JSONB | NULL | **[v3.0]** `{ x: number, y: number }`, freeform 전용 |
| **캐시** | | | |
| `size_cache` | JSONB | NULL | **[v3.0]** `{ width: number, height: number }`, 렌더링 최적화 캐시 |
| `created_at` | TIMESTAMPTZ | | |
| `updated_at` | TIMESTAMPTZ | | |

**인덱스**

| 인덱스명 | 컬럼 / 조건 | 비고 |
|---|---|---|
| `idx_nodes_map_id` | `(map_id)` | |
| `idx_nodes_parent_id` | `(parent_id)` | |
| `idx_nodes_map_order` | `(map_id, order_index)` | |
| `idx_nodes_path_gist` | `(path) USING GIST` | **[v3.0]** subtree `<@` 조회 최적화 O(log n) |
| `idx_nodes_path_btree` | `(path) USING BTREE` | **[v3.0]** exact match / ORDER BY |
| `idx_nodes_translation_skip` | `(map_id, translation_mode) WHERE translation_mode = 'skip'` | **[V2]** |

**ltree path 규칙**

```
Root 노드:    root
하위 노드:    parent.path || '.' || 'n_' || replace(left(id::text, 8), '-', '')

예시:
  root
  root.n_a1b2c3d4
  root.n_a1b2c3d4.n_e5f6a7b8

subtree 전체 조회:
  SELECT * FROM nodes WHERE path <@ $node_path

subtree 이동:
  UPDATE nodes SET path = replace(path::text, old_prefix, new_prefix)::ltree
```

---

### 2.6 `public.tags` / `public.node_tags`

#### `public.tags`

> **[v3.1 수정]** `workspace_id` 컬럼 추가 — 워크스페이스 공유 태그 지원

| 컬럼 | 타입 | 제약 / 기본값 | 설명 |
|---|---|---|---|
| `id` | UUID | PK | |
| `owner_id` | UUID | FK → `users(id)` ON DELETE CASCADE | 생성자 (개인 태그 소유자) |
| `workspace_id` | UUID | FK → `workspaces(id)` ON DELETE CASCADE, NULLABLE | NULL = 개인 태그, NOT NULL = 워크스페이스 공유 태그 |
| `name` | VARCHAR(50) | UNIQUE (owner_id, name), UNIQUE (workspace_id, name) | |
| `color` | VARCHAR(7) | DEFAULT `'#888888'` | |
| `created_at` | TIMESTAMPTZ | | |

**태그 소유 단위 정책**
- `workspace_id IS NULL` → 개인 태그: 생성자만 사용 가능
- `workspace_id IS NOT NULL` → 워크스페이스 공유 태그: 멤버 전원 사용 가능, UNIQUE(workspace_id, name)으로 중복 방지

#### `public.node_tags` (N:N 연결 테이블)

| 컬럼 | 타입 | 제약 | 설명 |
|---|---|---|---|
| `node_id` | UUID | PK (복합), FK → `nodes(id)` ON DELETE CASCADE | |
| `tag_id` | UUID | PK (복합), FK → `tags(id)` ON DELETE CASCADE | |
| `created_at` | TIMESTAMPTZ | | |

---

### 2.7 노드 부가 정보 테이블

| 테이블 | 관계 | 주요 컬럼 | 비고 |
|---|---|---|---|
| `node_notes` | 1:1 | `node_id` UNIQUE FK, `content` TEXT, `updated_at` | |
| `node_links` | 1:N | `node_id` FK, `url` TEXT, `label` VARCHAR(255) | |
| `node_attachments` | 1:N | `node_id` FK, `storage_path`, `filename`, `mime_type`, `file_size_bytes` | |
| `node_media` | 1:1 | `node_id` UNIQUE FK, `storage_path`, `media_type` DEFAULT `'image'` | Indicator 표시용 오디오/비디오. 배경 이미지는 `nodes.style_json.backgroundImage`에 저장 |

---

### 2.8 `public.published_maps`

| 컬럼 | 타입 | 제약 / 기본값 | 설명 |
|---|---|---|---|
| `id` | UUID | PK | |
| `map_id` | UUID | FK → `maps(id)` ON DELETE CASCADE | |
| `publish_id` | VARCHAR(20) | UNIQUE | 공개 URL 식별자 (nanoid) |
| `storage_path` | VARCHAR(500) | | HTML 스냅샷 저장 경로 (Supabase Storage) |
| `published_at` | TIMESTAMPTZ | | |
| `unpublished_at` | TIMESTAMPTZ | NULL | NULL=활성, NOT NULL=비활성화됨 |

**인덱스**

| 인덱스명 | 컬럼 |
|---|---|
| `idx_published_maps_publish_id` | `(publish_id)` |

> - 공개 URL: `https://app.mindmap.ai.kr/published/{publish_id}`
> - 비활성화: `unpublished_at = NOW()` → 해당 URL 접근 불가 (404)

---

### 2.9 `public.exports`

| 컬럼 | 타입 | 제약 / 기본값 | 설명 |
|---|---|---|---|
| `id` | UUID | PK | |
| `map_id` | UUID | FK → `maps(id)` ON DELETE CASCADE | |
| `user_id` | UUID | FK → `users(id)` | |
| `format` | VARCHAR(20) | | `'markdown'` \| `'html'` \| `'pdf'` \| `'png'` |
| `status` | VARCHAR(20) | DEFAULT `'pending'` | `'pending'` \| `'processing'` \| `'done'` \| `'error'` |
| `storage_path` | VARCHAR(500) | | 완료 시 결과 파일 경로 |
| `created_at` | TIMESTAMPTZ | | |

---

### 2.10 `public.ai_jobs`

| 컬럼 | 타입 | 제약 / 기본값 | 설명 |
|---|---|---|---|
| `id` | UUID | PK | |
| `user_id` | UUID | FK → `users(id)` | |
| `map_id` | UUID | FK → `maps(id)`, nullable | |
| `job_type` | VARCHAR(30) | | `'generate'` \| `'expand'` \| `'summarize'` |
| `prompt` | TEXT | | |
| `result_markdown` | TEXT | | |
| `model` | VARCHAR(100) | | |
| `tokens_used` | INT | | |
| `status` | VARCHAR(20) | DEFAULT `'pending'` | |
| `created_at` | TIMESTAMPTZ | | |

---

### 2.11 `public.node_translations`

| 컬럼 | 타입 | 제약 / 기본값 | 설명 |
|---|---|---|---|
| `id` | UUID | PK | |
| `node_id` | UUID | FK → `nodes(id)` ON DELETE CASCADE | |
| `target_lang` | VARCHAR(20) | UNIQUE (node_id, target_lang) | |
| `translated_text` | TEXT | | |
| `source_text_hash` | VARCHAR(128) | | 번역 소스 text_hash — 변경 시 무효화 |
| `model_version` | VARCHAR(60) | | |
| `created_at` | TIMESTAMPTZ | | |
| `updated_at` | TIMESTAMPTZ | | |

**인덱스**

| 인덱스명 | 컬럼 |
|---|---|
| `idx_node_translations_node_id` | `(node_id)` — **[V2]** 노드별 번역 일괄 조회 최적화 |

---

### 2.12 `public.field_registry` (대시보드 필드 메타)

| 컬럼 | 타입 | 제약 / 기본값 | 설명 |
|---|---|---|---|
| `id` | UUID | PK | |
| `entity_type` | VARCHAR(50) | | `'node'` \| `'map'` \| `'user'` |
| `field_key` | VARCHAR(100) | | |
| `label_ko` | VARCHAR(200) | | |
| `table_name` | VARCHAR(100) | | |
| `column_name` | VARCHAR(200) | | |
| `data_type` | VARCHAR(50) | | |
| `is_editable` | BOOLEAN | DEFAULT `TRUE` | |
| `is_json_path` | BOOLEAN | DEFAULT `FALSE` | |
| `json_path` | VARCHAR(200) | | JSONB 내 경로 (예: `'style_json.fillColor'`) |
| `display_order` | INT | DEFAULT `0` | |
| `description` | TEXT | | |

---

## 3. 관계 정의

| 관계 | 카디널리티 | FK / 삭제 정책 | 비고 |
|---|---|---|---|
| `auth.users` → `public.users` | 1:1 | 트리거 `handle_new_user` 자동 동기화 | |
| `users` ↔ `workspaces` | N:N | `workspace_members` 연결 테이블 | role: `'owner'` \| `'editor'` \| `'viewer'` |
| `workspaces` → `maps` | 1:N | `workspace_id` FK, **ON DELETE SET NULL** | 워크스페이스 삭제 시 맵은 유지 |
| `maps` → `nodes` | 1:N | `map_id` FK, **ON DELETE CASCADE** | 맵 삭제 시 전체 노드 cascade |
| `nodes` → `nodes` | self-ref | `parent_id` FK, **ON DELETE CASCADE** | 부모 삭제 시 자식 전체 cascade |
| `maps` → `map_revisions` | 1:N | ON DELETE CASCADE | 서버 영속 패치 히스토리 |
| `maps` → `published_maps` | 1:N | ON DELETE CASCADE | 한 맵에 여러 공개 링크 히스토리 |
| `maps` → `exports` | 1:N | ON DELETE CASCADE | export 작업 이력 |
| `nodes` → `node_notes` | 1:1 | `node_id` UNIQUE | |
| `nodes` → `node_links` | 1:N | ON DELETE CASCADE | |
| `nodes` → `node_attachments` | 1:N | ON DELETE CASCADE | |
| `nodes` → `node_media` | 1:1 | `node_id` UNIQUE | Indicator 표시용 오디오/비디오 |
| `nodes` ↔ `tags` | N:N | `node_tags` 연결 테이블 | |
| `nodes` → `node_translations` | 1:N | (`node_id` + `target_lang`) UNIQUE | |
| `users` → `ai_jobs` | 1:N | | |

---

## 4. 인덱스 전체 목록

| 테이블 | 인덱스명 | 컬럼 / 조건 |
|---|---|---|
| `maps` | `idx_maps_owner_id` | `(owner_id)` |
| `maps` | `idx_maps_workspace_id` | `(workspace_id)` |
| `maps` | `idx_maps_deleted_at` | `(deleted_at) WHERE deleted_at IS NULL` |
| `map_revisions` | `idx_map_revisions_map_id` | `(map_id, version DESC)` |
| `nodes` | `idx_nodes_map_id` | `(map_id)` |
| `nodes` | `idx_nodes_parent_id` | `(parent_id)` |
| `nodes` | `idx_nodes_map_order` | `(map_id, order_index)` |
| `nodes` | `idx_nodes_path_gist` | `(path) USING GIST` — ltree `<@` 연산자 |
| `nodes` | `idx_nodes_path_btree` | `(path) USING BTREE` |
| `nodes` | `idx_nodes_translation_skip` | `(map_id, translation_mode) WHERE translation_mode = 'skip'` |
| `node_translations` | `idx_node_translations_node_id` | `(node_id)` |
| `published_maps` | `idx_published_maps_publish_id` | `(publish_id)` |

---

## 5. RLS (Row Level Security) 정책 요약

| 테이블 | 정책 |
|---|---|
| `maps` | **SELECT / ALL**: `owner_id = auth.uid() AND deleted_at IS NULL` |
| `maps` | **SELECT**: `workspace_members`에 속한 사용자 (role 무관) |
| `nodes` | **SELECT / ALL**: 해당 map의 owner 또는 workspace member |
| `published_maps` | **SELECT (공개)**: 누구나 (`unpublished_at IS NULL` 조건) |
| `published_maps` | **ALL**: map owner만 |

---

## 6. 주요 설계 포인트

### ① ltree path (v3.0)

- UUID 하이픈 제거 → `'n_'` + 첫 8자 형태로 ltree 레이블 생성
- GIST 인덱스로 `<@`, `@>`, `~` 연산자 O(log n) 성능
- 노드 이동 시 path 일괄 UPDATE (`move_node_subtree` PostgreSQL 함수 사용)
- `depth = nlevel(path) - 1` (ltree nlevel은 1-based)

### ② order_index FLOAT (v3.0)

- 새 노드를 두 노드 사이에 삽입: `order = (prev + next) / 2`
- 정수 충돌 없이 O(1) 삽입 가능
- 값이 너무 가까워지면 주기적으로 `1.0, 2.0, 3.0…` 재정규화

### ③ manual_position JSONB (v3.0)

- freeform 레이아웃 전용
- 형태: `{ "x": 120.5, "y": 340.0 }`
- 프론트엔드 접근: `node.manual_position?.x`, `node.manual_position?.y`

### ④ backgroundImage 저장 위치

- **MVP**: `nodes.style_json` 내 `backgroundImage` 키로 통합 저장
- **확장**: `nodes.background_image_json` JSONB 별도 컬럼 분리 가능
- 타입 정의: `docs/02-domain/node-model.md` `NodeBackgroundImage` 참조

### ⑤ maps soft-delete + 30일 휴지통

- `deleted_at IS NOT NULL` → 사용자에게 숨김, RLS에서 필터
- 클라이언트 Undo 창(5~10초): 즉시 삭제 취소 가능
- 대량 삭제 시 경고 모달 표시 (`docs/02-domain/node-hierarchy-storage-strategy.md` 참조)

### ⑥ node_media vs backgroundImage 구분

| 항목 | 저장 위치 | 용도 |
|---|---|---|
| `node_media` | `node_media` 테이블 (1:1) | Indicator에 표시되는 오디오/비디오 재생 파일 |
| `backgroundImage` | `nodes.style_json` 내 키 | 노드 도형 배경에 깔리는 이미지 스타일 |

### ⑦ map_revisions vs 클라이언트 Undo/Redo

| 항목 | 위치 | 특징 |
|---|---|---|
| Undo/Redo | 클라이언트 메모리 | 빠른 편집 UX, 세션 종료 시 소멸 |
| map_revisions | 서버 DB | 영속 버전 — Diff Viewer / 복구 / 감사 로그 |

### ⑧ layoutType kebab-case 표준화 (v3.0)

- DB 저장값: kebab-case 영문 소문자 (예: `'radial-bidirectional'`)
- BL 코드 ↔ DB 저장값 전체 매핑: `docs/02-domain/node-model.md` 참조
- kanban 특수 규칙: depth 0 = board, depth 1 = column, depth 2 = card, depth 3+ 금지

### ⑨ 번역 정책 3단계 계층 (V2)

| 레벨 | 적용 범위 | 컬럼 / 필드 | 설명 |
|---|---|---|---|
| **레벨 1** (사용자) | 모든 맵 기본값 | `users.preferred_language`<br>`users.secondary_languages`<br>`users.skip_english_translation` | 가입/설정 화면에서 한 번 설정 |
| **레벨 2** (맵) | 특정 맵 | `maps.translation_policy_json` | NULL이면 사용자 기본 설정 따름<br>예: `{ "skipLanguages": ["ja"], "skipEnglish": true }` |
| **레벨 3** (노드) | 개별 노드 | `nodes.translation_override` | `'force_on'`: 강제 번역 (모든 설정 무시)<br>`'force_off'`: 강제 번역 금지 (모든 열람자 원문)<br>`null`: 상위 정책 따름 (기본) |

> **우선순위**: 레벨 3 (노드) > 레벨 2 (맵) > 레벨 1 (사용자)
>
> 결정 알고리즘(`shouldTranslate`): `docs/04-extensions/multilingual-translation.md § 3` 참조

---

## [v3.3 추가] 협업맵 관련 테이블

> **변경 이력 추가**: v3.3 | 2026-04-05 | 협업맵 스키마 반영
> - `maps`: `is_collaborative` BOOLEAN, `collab_owner_id` UUID 추가
> - `nodes`: `created_by` UUID 추가 (수정/삭제 권한 판단)
> - `map_collaborators` 신규 (role: creator/editor, scope_type: full/level/node)
> - `map_ownership_history` 신규 (creator 이양 이력 감사 로그)

### `public.map_collaborators`

| 컬럼 | 타입 | 설명 |
|---|---|---|
| `id` | UUID PK | |
| `map_id` | UUID FK → maps | |
| `user_id` | UUID FK → users | |
| `role` | VARCHAR(20) | `'creator'` \| `'editor'` |
| `scope_type` | VARCHAR(20) | `'full'`(creator전용) \| `'level'` \| `'node'` |
| `scope_level` | INT NULL | scope_type='level' 시 depth 기준값 |
| `scope_node_id` | UUID NULL FK → nodes | scope_type='node' 시 기준 노드 |
| `invited_by` | UUID FK → users | 초대한 creator |
| `invite_token` | VARCHAR(120) UNIQUE NULL | 수락 링크 토큰 (7일 만료) |
| `status` | VARCHAR(20) | `pending`\|`active`\|`rejected`\|`removed` |

**핵심 제약**:
- `UNIQUE (map_id, user_id)`
- `UNIQUE (map_id) WHERE role='creator' AND status='active'` — creator 1명 강제
- Trigger: editor에게 full scope 배정 방지

### `public.map_ownership_history`

| 컬럼 | 타입 | 설명 |
|---|---|---|
| `id` | UUID PK | |
| `map_id` | UUID FK → maps | |
| `from_user_id` | UUID FK → users | 이양한 creator |
| `to_user_id` | UUID FK → users | 이양받은 editor |
| `transferred_at` | TIMESTAMPTZ | |
| `note` | TEXT NULL | 이양 사유 |
