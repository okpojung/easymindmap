# easymindmap — DB Schema (Supabase PostgreSQL)

## Supabase 사용 결정 배경

| 항목 | 별도 PostgreSQL | **Supabase** |
|------|----------------|--------------|
| DB | 직접 설치/관리 | PostgreSQL (동일 엔진) |
| 인증 | NestJS JWT 직접 구현 | **Auth 내장** → 구현 공수 제거 |
| 파일 저장 | MinIO VM 별도 | **Storage 내장** → VM6 제거 |
| 실시간 | WebSocket 서버 별도 | **Realtime 내장** → Phase 3 준비 완료 |
| VM 수 | VM4 + VM5 + VM6 = 3대 | **0대** (Supabase Self-hosted (ESXi VM)) |
| 초기 비용 | VM 운영비 | **Free tier로 시작** |
| RLS | 직접 구현 | **Row Level Security 내장** |

**결론**: VM4(PostgreSQL) + VM6(MinIO)를 Supabase로 대체. VM5(Redis)만 유지.

---

## 변경된 서버 구조

```
기존:  VM1(Nginx) + VM2(Frontend) + VM3(NestJS) + VM4(PG) + VM5(Redis) + VM6(MinIO)
변경:  VM1(Nginx) + VM2(Frontend) + VM3(NestJS) + VM5(Redis) + [Supabase Cloud]
```

### [변경 주석]
- 위의 "Supabase Cloud" 표기는 초기 설명 단계의 표현이다.
- 현재 저장소의 최신 아키텍처 문맥은 **Supabase Self-hosted (ESXi VM)** 기준으로 더 많이 정리되어 있다.
- 따라서 실제 구현/운영 기준은 다음처럼 이해하는 것이 맞다.

```
권장 최종 해석:
VM1(Nginx) + VM2(App) + VM3(Supabase Self-hosted) + VM4(Redis) + VM5(Worker)
```

- 즉, 이 문서의 상단 배경 설명은 "Supabase로 통합한다"는 취지는 유지하되,
  실제 배포 형태는 Self-hosted 기준으로 읽어야 한다.

---

## Supabase 프로젝트 설정

```
Project URL: https://xxxxxxxxxxxx.supabase.co
Anon Key:    eyJ...  (공개 가능, RLS로 보호)
Service Key: eyJ...  (서버에서만 사용, 절대 클라이언트 노출 금지)
```

### NestJS 연결 설정
```typescript
// .env
SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
SUPABASE_SERVICE_KEY=eyJ...   // 서버 전용
DATABASE_URL=postgresql://postgres:[password]@db.xxxxxxxxxxxx.supabase.co:5432/postgres
```

---

## 테이블 DDL

> **필수 Extension**: `nodes.path` 컬럼(LTREE 타입)을 사용하기 위해 ltree 확장이 활성화되어야 한다.
>
> ```sql
> -- PostgreSQL ltree 확장 활성화 (1회, Supabase 대시보드 또는 마이그레이션에서 실행)
> CREATE EXTENSION IF NOT EXISTS ltree;
> ```
>
> GIST 인덱스(`idx_nodes_path_gist`)는 이 확장이 활성화된 후에만 생성 가능하다.

### 1. users (Supabase Auth 연동)

> Supabase Auth를 사용하면 `auth.users` 테이블이 자동 생성됨.  
> 아래 `public.users`는 추가 프로필 정보를 저장하는 확장 테이블.

```sql
CREATE TABLE public.users (
  id                      UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name            VARCHAR(100),
  preferred_language      VARCHAR(10)  DEFAULT 'ko',
  default_layout_type     VARCHAR(50)  DEFAULT 'radial-bidirectional',

  -- 다국어 번역 설정 (V2)
  secondary_languages     TEXT[]       NOT NULL DEFAULT '{}',  -- 최대 3개 언어 코드
  skip_english_translation BOOLEAN     NOT NULL DEFAULT TRUE,  -- 영어 번역 건너뜀

  -- UI 표시 환경설정 (JSON, V2)
  ui_preferences_json     JSONB        NOT NULL DEFAULT '{"showTranslationIndicator":true,"showTranslationOverrideIcon":true,"showTagBadge":true}',

  created_at              TIMESTAMPTZ  DEFAULT NOW(),
  updated_at              TIMESTAMPTZ  DEFAULT NOW()
);

-- auth.users 생성 시 자동으로 public.users row 생성하는 트리거
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id)
  VALUES (NEW.id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
```

---

### 2. maps

```sql
CREATE TABLE public.maps (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id                  UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  workspace_id              UUID REFERENCES public.workspaces(id) ON DELETE SET NULL,
  title                     VARCHAR(255) NOT NULL DEFAULT 'Untitled',
  default_layout_type       VARCHAR(50)  NOT NULL DEFAULT 'radial-bidirectional',
  view_mode                 VARCHAR(20)  NOT NULL DEFAULT 'edit',  -- 'edit' | 'dashboard' | 'kanban'
  -- ⚠️ 'kanban'은 nodes.layout_type 기반 kanban 레이아웃을 사용하는 맵의 보기 모드
  --    kanban 맵은 depth 0=board / 1=column / 2=card 규칙을 따름 (db-schema.md §3 kanban 규칙)
  refresh_interval_seconds  INT          NOT NULL DEFAULT 0,       -- 0: off
  current_version           INT          NOT NULL DEFAULT 0,

  -- 번역 정책 (V2, 맵 단위 오버라이드)
  -- null: 사용자 기본 설정 따름 / 설정 시 해당 맵의 번역 정책 재정의
  -- 예: {"mode":"off"} | {"allowedTargetLanguages":["ko","ja"]}
  translation_policy_json   JSONB,

  deleted_at                TIMESTAMPTZ,  -- soft delete
  created_at                TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_maps_owner_id ON public.maps(owner_id);
CREATE INDEX idx_maps_workspace_id ON public.maps(workspace_id);
CREATE INDEX idx_maps_deleted_at ON public.maps(deleted_at) WHERE deleted_at IS NULL;
```

### [변경 주석]
- 기존 문서에는 maps 테이블이 `owner_id`, `title`, `default_layout_type`, `deleted_at` 정도로만 설명되어 있었음.
- 최신 schema.sql 기준으로는 아래 항목이 추가 반영되어야 함:
  - workspace_id
  - view_mode
  - refresh_interval_seconds
  - current_version
- 특히 `current_version`은 patch 기반 autosave / 충돌 처리의 핵심 필드이므로 문서에서 빠지면 안 된다.
- `translation_policy_json` (V2): 맵 단위 번역 정책 오버라이드. null이면 사용자 기본 설정을 따른다.

---

### 2-1. workspaces / workspace_members

```sql
CREATE TABLE public.workspaces (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id    UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  name        VARCHAR(255) NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.workspace_members (
  workspace_id  UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  role          VARCHAR(20) NOT NULL DEFAULT 'editor', -- 'owner' | 'editor' | 'viewer'
  joined_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (workspace_id, user_id)
);
```

### [변경 주석]
- 기존 문서에는 workspace 관련 설명이 없었지만,
  최신 schema.sql에는 workspaces / workspace_members 구조가 포함되어 있다.
- 협업 기능(V1+)까지 고려하면 이 테이블은 더 이상 선택사항이 아니라
  기본 도메인 구조에 포함되는 편이 맞다.

---

### 3. nodes

```sql
CREATE TABLE public.nodes (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  map_id           UUID NOT NULL REFERENCES public.maps(id) ON DELETE CASCADE,
  parent_id        UUID REFERENCES public.nodes(id) ON DELETE CASCADE,

  -- 콘텐츠
  text             TEXT NOT NULL DEFAULT '',
  note             TEXT,

  -- 트리 구조
  depth            INTEGER NOT NULL DEFAULT 0,
  -- order_index: FLOAT 채택 — 중간 삽입 O(1) (예: 1.0↔2.0 사이 → 1.5)
  -- 재정규화 트리거: |prev - next| < 0.001 이면 renormalizeOrderIndex() 실행
  -- 자세한 정책: docs/02-domain/node-hierarchy-storage-strategy.md § order_index 전략
  order_index      FLOAT NOT NULL DEFAULT 0.0,
  -- path: ltree 계층 경로 (예: 'root.n_a1b2.n_c3d4')
  -- DB에만 존재하며 서버 서브트리 쿼리 전용 (path <@ $target)
  -- 클라이언트 childIds는 이 경로가 아닌 parent_id 역전으로 구성
  path             LTREE NOT NULL DEFAULT 'root',

  -- 레이아웃
  -- NULL = 부모 노드 layout_type 상속 (서브트리 변경 UX를 위해 NULL 허용)
  -- 루트 노드는 애플리케이션 레이어에서 기본값 'radial-bidirectional' 보장
  -- NOT NULL을 쓰면 "부모 상속" 상태를 DEFAULT 값과 구분할 수 없음
  layout_type      VARCHAR(50) NULL,
  collapsed        BOOLEAN NOT NULL DEFAULT FALSE,

  -- 도형 & 스타일
  shape_type       VARCHAR(50) NOT NULL DEFAULT 'rounded-rectangle',
  style_json       JSONB NOT NULL DEFAULT '{}',

  -- 노드 타입 (V3 대시보드 대비)
  node_type        VARCHAR(30) NOT NULL DEFAULT 'text',  -- 'text' | 'data-live'

  -- 다국어 번역 (V2)
  text_lang                 VARCHAR(20),   -- 원문 언어 코드 (ISO 639-1)
  text_hash                 VARCHAR(128),  -- 원문 해시 (번역 캐시 유효성 검증)
  translation_mode          VARCHAR(20)  NOT NULL DEFAULT 'auto',  -- 'auto' | 'manual'
  translation_override      VARCHAR(20),   -- null | 'force_on' | 'force_off'
  author_preferred_language VARCHAR(10),   -- 작성자 선호 언어 (번역 건너뜀 여부 결정)

  -- 노드 배경 이미지 (IMG-01~09, node_media와 역할 구분)
  -- node_media = 오디오/비디오 인디케이터, background_image = 노드 도형 배경
  background_image_path    VARCHAR(500),              -- Supabase Storage 경로 (NULL = 배경 없음)
  background_image_fit     VARCHAR(20) DEFAULT 'cover',  -- 'cover' | 'contain' | 'stretch' | 'original'
  background_image_opacity NUMERIC(3,2) DEFAULT 1.0,    -- 0.00 ~ 1.00 (오버레이 불투명도)

  -- 자유배치
  manual_position  JSONB,   -- { x: number, y: number }

  -- 캐시
  size_cache       JSONB,   -- { width: number, height: number }

  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_nodes_map_id      ON public.nodes(map_id);
CREATE INDEX idx_nodes_parent_id   ON public.nodes(parent_id);
CREATE INDEX idx_nodes_map_order   ON public.nodes(map_id, order_index);
-- ltree GIST 인덱스: 서브트리 조회 (path <@ $target) 최적화
CREATE INDEX idx_nodes_path_gist   ON public.nodes USING GIST (path);
-- ltree BTREE 인덱스: 정확한 경로 매칭 및 정렬
CREATE INDEX idx_nodes_path_btree  ON public.nodes(path);
-- 번역 스킵 인덱스: translation_mode='auto' & translation_override IS NULL 조회 최적화 (V2)
CREATE INDEX idx_nodes_translation_skip
  ON public.nodes(map_id, translation_mode, translation_override)
  WHERE translation_mode = 'auto' AND translation_override IS NULL;
```
### Kanban Layout 사용 시 depth 규칙
Kanban layout에서는 nodes.depth를 다음처럼 제한적으로 해석한다.

- depth 0: board
- depth 1: column
- depth 2: card
- depth 3 이상 금지
 
#### style JSONB 구조 예시
```json
{
  "fillColor": "#FFE08A",
  "borderColor": "#D9A400",
  "textColor": "#333333",
  "fontSize": 16,
  "fontWeight": 500,
  "fontStyle": "normal",
  "borderWidth": 1,
  "borderStyle": "solid",
  "backgroundImage": null,
  "backgroundImageOpacity": 1.0
}
```

### [변경 주석]
- 기존 문서의 nodes 정의에는 아래 "배열/단일 FK" 필드가 직접 들어 있었음:
  - tags UUID[]
  - hyperlink_ids UUID[]
  - attachment_ids UUID[]
  - multimedia_id UUID
- 최신 schema.sql 기준에서는 이 구조를 **정규화 관계 테이블 방식**으로 변경한다.
- 따라서 nodes 본문에서는 위 필드를 제거하고,
  아래 별도 테이블(node_tags, node_links, node_attachments, node_media)로 설명해야 한다.
- 또한 style 컬럼명도 기존 `style` 대신 최신 schema.sql 기준으로 `style_json`으로 맞춘다.
- size 컬럼도 `size` 대신 `size_cache`로 맞춘다.
- **V2 번역 컬럼 추가**: `translation_mode`, `translation_override`, `author_preferred_language`
  - `translation_mode`: 'auto'(기본) | 'manual' — 노드별 번역 동작 방식
  - `translation_override`: null(기본) | 'force_on' | 'force_off' — 편집자 강제 재정의
  - `author_preferred_language`: 작성자 선호 언어 — 영어 원문 번역 건너뜀 여부 판단에 사용
  - 3-레벨 번역 정책: node.translation_override > map.translation_policy_json > user(preferred_language, secondary_languages)

---

### 3-1. node_notes

```sql
CREATE TABLE public.node_notes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  node_id     UUID NOT NULL UNIQUE REFERENCES public.nodes(id) ON DELETE CASCADE,
  content     TEXT NOT NULL DEFAULT '',
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### [변경 주석]
- 기존 문서/기존 노드 모델에는 `nodes.note` 설명이 있었음.
- 최신 schema.sql에는 `node_notes` 별도 테이블도 존재한다.
- 즉, 현재 설계에는 note가 "nodes.note 컬럼"과 "node_notes 테이블" 양쪽 흔적이 공존한다.
- 구현 착수 전 반드시 아래 둘 중 하나를 최종 기준으로 확정하는 것이 좋다.
  1. 짧은 노트만 허용 → nodes.note 단일 컬럼
  2. 별도 관리/확장성 우선 → node_notes 테이블
- 이 문서에서는 최신 schema.sql에 맞추어 node_notes도 함께 명시한다.

---

### 3-2. node_tags

```sql
CREATE TABLE public.node_tags (
  node_id     UUID NOT NULL REFERENCES public.nodes(id) ON DELETE CASCADE,
  tag_id      UUID NOT NULL REFERENCES public.tags(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (node_id, tag_id)
);
```

### 3-3. node_links

```sql
CREATE TABLE public.node_links (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  node_id    UUID NOT NULL REFERENCES public.nodes(id) ON DELETE CASCADE,
  url        TEXT NOT NULL,
  label      VARCHAR(255),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### 3-4. node_attachments

```sql
CREATE TABLE public.node_attachments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  node_id         UUID NOT NULL REFERENCES public.nodes(id) ON DELETE CASCADE,
  storage_path    VARCHAR(500) NOT NULL,
  filename        VARCHAR(255) NOT NULL,
  mime_type       VARCHAR(100),
  file_size_bytes INT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### 3-5. node_media

```sql
CREATE TABLE public.node_media (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  node_id         UUID NOT NULL UNIQUE REFERENCES public.nodes(id) ON DELETE CASCADE,
  storage_path    VARCHAR(500) NOT NULL,
  -- 'audio' | 'video' 만 허용 — 이미지 배경은 nodes.background_image_path 사용
  -- ⚠️ 'image'를 기본값으로 쓰면 node_background_image 기능과 역할 혼용됨
  media_type      VARCHAR(20) NOT NULL CHECK (media_type IN ('audio', 'video')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### [변경 주석]
- node의 부가요소(tag/link/attachment/media)는 이제 nodes 테이블 본문에 넣지 않고 별도 정규화 테이블로 분리한다.
- 이유:
  - 검색/필터링/통계 처리 쉬움
  - 다중 링크/다중 첨부 자연스럽게 지원
  - node indicator UI와 실제 저장 구조 분리 가능
- 프론트엔드에서는 응답 조립 시 다시 NodeObject에 합쳐서 쓸 수 있다.
- **⚠️ node_media 역할 명확화 (v3.1)**: `media_type`을 `'audio' | 'video'`만 허용하도록 CHECK 제약 추가.
  - 이미지 배경(`background_image`)은 nodes 테이블의 `background_image_path` 컬럼으로 분리 저장.
  - node_media = 오디오/비디오 인디케이터(▶), background_image = 노드 도형 배경 렌더링 — 역할이 완전히 다름.
  - 참고: `docs/03-editor-core/node-background-image.md` § 정합성 보완

---

### 4. revisions → map_revisions

```sql
CREATE TABLE public.map_revisions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  map_id      UUID NOT NULL REFERENCES public.maps(id) ON DELETE CASCADE,
  version     INT  NOT NULL,
  patch_json  JSONB NOT NULL,
  client_id   VARCHAR(100),
  patch_id    VARCHAR(200) UNIQUE,
  created_by  UUID REFERENCES public.users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_map_revisions_map_id ON public.map_revisions(map_id, version DESC);
```

### [변경 주석]
- 기존 문서에는 `revisions` 테이블과 `change_type = snapshot | patch` 구조가 설명돼 있었음.
- 최신 autosave / backend 문맥은 **snapshot 중심이 아니라 patch 중심**이므로,
  최신 schema.sql 기준의 `map_revisions` 구조로 맞추는 것이 더 정확하다.
- 핵심 변경점:
  - revisions → map_revisions
  - snapshot/patch 혼합 설명 → patch_json + version 중심 구조
  - patch_id(unique)로 멱등성(idempotency) 보장

---

### 5. published_maps

```sql
CREATE TABLE public.published_maps (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  map_id          UUID NOT NULL REFERENCES public.maps(id) ON DELETE CASCADE,
  publish_id      VARCHAR(20) UNIQUE NOT NULL,  -- URL slug (랜덤 8~12자)
  storage_path    VARCHAR(500),                 -- Supabase Storage 경로
  published_at    TIMESTAMPTZ DEFAULT NOW(),
  unpublished_at  TIMESTAMPTZ
);

CREATE INDEX idx_published_maps_publish_id ON public.published_maps(publish_id);
```

---

### 6. tags

> **[v3.1 수정]** workspace 협업 시 태그 공유를 지원하기 위해 `workspace_id` 컬럼 추가.
> - `workspace_id = NULL` : 개인 태그 (워크스페이스 없이 사용하는 사용자)
> - `workspace_id = UUID` : 워크스페이스 공유 태그 (멤버 모두 사용 가능)
> - UNIQUE 제약도 `(workspace_id, name)` 기준으로 변경하여 워크스페이스별 중복 방지

```sql
CREATE TABLE public.tags (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- 생성자 (ON DELETE CASCADE: 사용자 탈퇴 시 개인 태그 삭제)
  owner_id      UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  -- 워크스페이스 태그 (NULL = 개인 태그, NOT NULL = 워크스페이스 공유 태그)
  workspace_id  UUID REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name          VARCHAR(50) NOT NULL,
  color         VARCHAR(7) NOT NULL DEFAULT '#888888',  -- hex
  created_at    TIMESTAMPTZ DEFAULT NOW(),

  -- workspace_id 기준 중복 방지
  --   개인 태그 (workspace_id IS NULL): owner_id + name 조합 유일
  --   워크스페이스 태그: workspace_id + name 조합 유일
  UNIQUE(owner_id, name),
  UNIQUE(workspace_id, name)
);

CREATE INDEX idx_tags_owner_id      ON public.tags(owner_id);
CREATE INDEX idx_tags_workspace_id  ON public.tags(workspace_id) WHERE workspace_id IS NOT NULL;
```

---

### 7. exports

```sql
CREATE TABLE public.exports (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  map_id        UUID NOT NULL REFERENCES public.maps(id) ON DELETE CASCADE,
  user_id       UUID REFERENCES public.users(id),
  format        VARCHAR(20) NOT NULL,  -- 'markdown' | 'html'
  status        VARCHAR(20) NOT NULL DEFAULT 'pending',
  storage_path  VARCHAR(500),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### [변경 주석]
- 기존 문서에는 exports 테이블 설명이 없었지만,
  최신 schema.sql에는 export 작업 이력 관리용 exports 테이블이 추가되어 있다.
- export가 즉시 다운로드형에서 background job형으로 커질 가능성을 생각하면
  이 테이블은 문서에 반드시 반영하는 편이 맞다.

---

### 8. ai_requests / ai_jobs

```sql
CREATE TABLE public.ai_jobs (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES public.users(id),
  map_id           UUID REFERENCES public.maps(id),
  job_type         VARCHAR(30) NOT NULL,   -- 'generate' | 'expand' | 'summarize'
  prompt           TEXT NOT NULL,
  result_markdown  TEXT,
  model            VARCHAR(100),
  tokens_used      INTEGER,
  status           VARCHAR(20) NOT NULL DEFAULT 'pending',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### [변경 주석]
- 기존 문서에는 `ai_requests` 테이블로 설명했으나,
  최신 schema.sql은 작업 큐/비동기 처리 관점을 반영한 `ai_jobs` 형태다.
- Worker/BullMQ 구조와 더 잘 맞는 것은 ai_jobs 쪽이다.
- 따라서 최신 구현 기준 설명은 ai_jobs로 통일하는 것이 좋다.

---

### 9. node_translations (V2)

```sql
CREATE TABLE public.node_translations (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  node_id           UUID NOT NULL REFERENCES public.nodes(id) ON DELETE CASCADE,
  target_lang       VARCHAR(20) NOT NULL,
  translated_text   TEXT NOT NULL,
  source_text_hash  VARCHAR(128) NOT NULL,
  model_version     VARCHAR(60),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (node_id, target_lang)
);
```

---

### 10. field_registry (V3)

```sql
CREATE TABLE public.field_registry (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type     VARCHAR(50)  NOT NULL,
  field_key       VARCHAR(100) NOT NULL,
  label_ko        VARCHAR(200) NOT NULL,
  table_name      VARCHAR(100) NOT NULL,
  column_name     VARCHAR(200) NOT NULL,
  data_type       VARCHAR(50)  NOT NULL,
  is_editable     BOOLEAN NOT NULL DEFAULT TRUE,
  is_json_path    BOOLEAN NOT NULL DEFAULT FALSE,
  json_path       VARCHAR(200),
  display_order   INT NOT NULL DEFAULT 0,
  description     TEXT
);
```

---

### [설계 노트] map_themes 테이블 미포함 사유

> 다른 검토 문서에서 `map_themes` 테이블이 언급되었으나, 현재 easymindmap MVP/V1 설계 범위에는 포함되지 않습니다.

| 항목 | 내용 |
|------|------|
| **제외 사유** | 노드 스타일은 `nodes.style_json` JSONB 컬럼에 개별 저장. 맵 전체 테마는 현재 구현 범위 외 (V2+ 후보) |
| **현재 대안** | 사용자가 개별 노드 색상/폰트/도형을 직접 설정. 루트→자식 스타일 상속 규칙으로 일관성 유지 |
| **향후 확장** | V2 이후 `map_themes` 테이블 추가 검토 가능: `{id, name, stylePresets: JSONB, isPublic, ownerId}` |

---

## Row Level Security (RLS) 정책

Supabase는 RLS로 사용자별 데이터 격리를 자동으로 처리.

```sql
-- maps 테이블 RLS
ALTER TABLE public.maps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users can view own maps"
  ON public.maps FOR SELECT
  USING (auth.uid() = owner_id AND deleted_at IS NULL);

-- 워크스페이스 멤버도 maps 조회 가능 (V1 협업)
CREATE POLICY "workspace members can view maps"
  ON public.maps FOR SELECT
  USING (
    deleted_at IS NULL AND
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = maps.workspace_id
        AND wm.user_id = auth.uid()
    )
  );

CREATE POLICY "users can insert own maps"
  ON public.maps FOR INSERT
  WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "users can update own maps"
  ON public.maps FOR UPDATE
  USING (auth.uid() = owner_id);

-- 워크스페이스 editor 역할은 맵 업데이트 가능
CREATE POLICY "workspace editors can update maps"
  ON public.maps FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = maps.workspace_id
        AND wm.user_id = auth.uid()
        AND wm.role IN ('owner', 'editor')
    )
  );

CREATE POLICY "users can delete own maps"
  ON public.maps FOR DELETE
  USING (auth.uid() = owner_id);

-- nodes 테이블 RLS (소유자 + 워크스페이스 멤버 접근)
-- ⚠️ MVP에서는 소유자 전용으로 시작, V1 협업 활성화 시 아래 두 정책 추가
ALTER TABLE public.nodes ENABLE ROW LEVEL SECURITY;

-- 소유자: 모든 조작 허용
CREATE POLICY "map owners can manage all nodes"
  ON public.nodes FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.maps
      WHERE maps.id = nodes.map_id
        AND maps.owner_id = auth.uid()
    )
  );

-- 워크스페이스 editor: 노드 읽기 + 쓰기 허용 (V1)
CREATE POLICY "workspace editors can manage nodes"
  ON public.nodes FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.maps m
      JOIN public.workspace_members wm ON wm.workspace_id = m.workspace_id
      WHERE m.id = nodes.map_id
        AND wm.user_id = auth.uid()
        AND wm.role IN ('owner', 'editor')
    )
  );

-- 워크스페이스 viewer: 노드 읽기만 허용 (V1)
CREATE POLICY "workspace viewers can read nodes"
  ON public.nodes FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.maps m
      JOIN public.workspace_members wm ON wm.workspace_id = m.workspace_id
      WHERE m.id = nodes.map_id
        AND wm.user_id = auth.uid()
        AND wm.role = 'viewer'
    )
  );

-- published_maps는 퍼블리시된 항목을 누구나 읽기 가능
ALTER TABLE public.published_maps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "published maps are publicly readable"
  ON public.published_maps FOR SELECT
  USING (unpublished_at IS NULL);

CREATE POLICY "owners can manage publish"
  ON public.published_maps FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.maps
      WHERE maps.id = published_maps.map_id
        AND maps.owner_id = auth.uid()
    )
  );
```

---

## Supabase Storage 버킷

```
버킷명: published-maps
접근: Public (퍼블리시된 HTML 파일은 공개)

버킷명: attachments  
접근: Private (RLS로 소유자만 접근)
```

### [변경 주석]
- 최신 schema.sql/구현 문맥에서는 아래 버킷까지 함께 고려하는 편이 자연스럽다.
  - uploads
  - attachments
  - exports
  - published
  - media
- 위의 본문은 초기 축약 설명으로 두고,
  실제 구현 시에는 버킷 설계를 env-spec / backend-architecture와 함께 맞춰야 한다.

---

## Supabase Realtime (Phase 3 대비)

```sql
-- nodes 테이블에 Realtime 활성화
ALTER PUBLICATION supabase_realtime ADD TABLE public.nodes;
ALTER PUBLICATION supabase_realtime ADD TABLE public.maps;
```

Phase 3에서 실시간 협업 구현 시 Supabase Realtime을 활용하면  
별도 WebSocket 서버 없이 노드 변경 이벤트를 구독/브로드캐스트 가능.

---

## ERD 요약

```
auth.users (Supabase 관리)
    │ 1:1
public.users (프로필 확장)
    │ 1:N
public.maps
    │ 1:N
    ├── public.nodes (트리 구조, self-join)
    ├── public.map_revisions
    ├── public.exports
    └── public.published_maps

public.users
    │ 1:N
    └── public.tags

public.nodes
    ├── public.node_tags
    ├── public.node_links
    ├── public.node_attachments
    ├── public.node_media
    └── public.node_notes
```

### [변경 주석]
- 기존 ERD 요약의 `public.nodes.tags[] → public.tags.id (배열 참조)` 설명은 최신 구조와 맞지 않는다.
- 최신 구조는 node_tags를 통한 N:N 관계로 이해해야 한다.

---

## 주요 쿼리 패턴

### 맵 전체 로딩 (노드 포함)
```sql
SELECT * FROM public.nodes
WHERE map_id = $1
ORDER BY depth ASC, order_index ASC;
```

### 노드 일괄 upsert (Autosave)
```sql
INSERT INTO public.nodes (id, map_id, parent_id, text, ...)
VALUES (...)
ON CONFLICT (id) DO UPDATE SET
  text = EXCLUDED.text,
  updated_at = NOW();
```

### Soft delete 맵 조회 (삭제된 것 제외)
```sql
SELECT * FROM public.maps
WHERE owner_id = auth.uid()
  AND deleted_at IS NULL
ORDER BY updated_at DESC;
```

### [변경 주석]
- autosave가 patch 기반으로 가더라도,
  실제 내부 처리에서 일부 node upsert 패턴은 여전히 유효하다.
- 다만 문서상 API 설명은 snapshot 중심보다 patch/version 중심으로 함께 기술하는 것이 정확하다.
