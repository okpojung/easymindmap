easymindmap — PostgreSQL ERD (통합판)

DB: PostgreSQL 16 (Supabase Self-hosted on ESXi VM-03)
문서 버전: v3.0
결정일: 2026-03-29

변경 이력:
  v1.0: 초기 설계
  v2.0: Map Properties 레벨별 설계 반영 (map_themes 신규, nodes 변경)
  v2.1: users 테이블 휴대폰 번호 컬럼 추가
  v3.0: [2026-03-29] schema.sql 완전 동기화
        - ltree extension 채택 → nodes.path LTREE 컬럼 + GIST/BTREE 인덱스 추가
        - nodes.order_index INT → FLOAT (중간 삽입 O(1))
        - nodes.depth 컬럼 추가 (앱단 계산, ltree nlevel()-1)
        - nodes.manual_position JSONB ({ x, y }) → manual_x/manual_y 대체
        - nodes.size_cache JSONB 추가 (렌더링 캐시)
        - nodes.style_json JSONB 내 backgroundImage 키로 배경이미지 통합 (MVP)
        - nodes.bg_image_config_json 컬럼명 → style_json 내 backgroundImage 키 통일
        - maps.deleted_at soft-delete 추가 (30일 휴지통)
        - published_maps, ai_jobs, node_translations, field_registry 테이블 추가
        - map_revisions 관계 명시
        - 전체 인덱스 목록 갱신
  v3.1: [2026-03-30] 다국어 번역 V2 스키마 반영
        - users: secondary_languages VARCHAR(20)[], skip_english_translation BOOLEAN 추가
        - maps: translation_policy_json JSONB 추가
        - nodes: translation_mode, translation_override, author_preferred_language 추가
        - node_translations: idx_node_translations_node_id 인덱스 추가
        - idx_nodes_translation_skip 인덱스 추가
        - 번역 정책 3단계 계층 설계 포인트 추가


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

auth.users (Supabase Auth 자동 생성)
 └── public.users (프로필 확장)
      ├── workspaces (1:N)
      │    ├── workspace_members (N:N ↔ users)
      │    └── maps (1:N)
      │         ├── map_revisions    (1:N, 버전 히스토리)
      │         ├── published_maps   (1:N, 공개 스냅샷)
      │         ├── exports          (1:N, 내보내기 작업)
      │         └── nodes            (1:N)
      │              ├── node_notes        (1:1)
      │              ├── node_links        (1:N)
      │              ├── node_attachments  (1:N)
      │              ├── node_media        (1:1)
      │              ├── node_tags         (N:N ↔ tags)
      │              └── node_translations (1:N, 다국어)
      ├── tags (1:N)
      └── ai_jobs (1:N)

field_registry  (독립 테이블, 대시보드 필드 메타)


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
2. 핵심 테이블 상세
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

2.1 public.users
──────────────────
  id                          UUID PK  REFERENCES auth.users(id) ON DELETE CASCADE
  display_name                VARCHAR(100)
  preferred_language          VARCHAR(10)  DEFAULT 'ko'
  secondary_languages         VARCHAR(20)[]  DEFAULT '{}'   -- [V2 신규] 2차 언어 배열 (최대 3개)
  skip_english_translation    BOOLEAN  DEFAULT TRUE           -- [V2 신규] 영어 번역 생략 여부
  default_layout_type         VARCHAR(50)  DEFAULT 'radial-bidirectional'
  created_at                  TIMESTAMPTZ
  updated_at                  TIMESTAMPTZ

  ※ auth.users 생성 시 handle_new_user() 트리거로 자동 INSERT
  ※ 이메일/비밀번호는 auth.users에 있으며 public.users에는 없음


2.2 public.workspaces
──────────────────────
  id          UUID PK
  owner_id    UUID FK → public.users(id) ON DELETE CASCADE
  name        VARCHAR(255)
  created_at  TIMESTAMPTZ
  updated_at  TIMESTAMPTZ

public.workspace_members (N:N 연결 테이블)
  workspace_id  UUID FK → workspaces(id) ON DELETE CASCADE  }
  user_id       UUID FK → users(id) ON DELETE CASCADE       } PK (복합)
  role          VARCHAR(20) DEFAULT 'editor'  -- 'owner' | 'editor' | 'viewer'
  joined_at     TIMESTAMPTZ


2.3 public.maps
──────────────────
  id                       UUID PK
  owner_id                 UUID FK → users(id) ON DELETE CASCADE
  workspace_id             UUID FK → workspaces(id) ON DELETE SET NULL  (nullable)
  title                    VARCHAR(255) DEFAULT 'Untitled'
  default_layout_type      VARCHAR(50)  DEFAULT 'radial-bidirectional'
  view_mode                VARCHAR(20)  DEFAULT 'edit'  -- 'edit' | 'dashboard'
  refresh_interval_seconds INT          DEFAULT 0       -- 0: off, Dashboard 갱신 주기
  current_version          INT          DEFAULT 0
  translation_policy_json  JSONB  NULL                  -- [V2 신규] 맵별 번역 정책. NULL=사용자 기본 설정 따름
                                                        -- 구조: { skipLanguages: string[], skipEnglish: boolean|null }
  deleted_at               TIMESTAMPTZ  NULL            -- [soft-delete] NULL=활성, NOT NULL=삭제됨
  created_at               TIMESTAMPTZ
  updated_at               TIMESTAMPTZ

  인덱스:
    idx_maps_owner_id      ON (owner_id)
    idx_maps_workspace_id  ON (workspace_id)
    idx_maps_deleted_at    ON (deleted_at) WHERE deleted_at IS NULL  -- 활성 맵 필터 최적화

  삭제 정책:
    - Soft-delete: deleted_at = NOW() 설정 → 30일간 휴지통 보관
    - 복구:  UPDATE maps SET deleted_at = NULL WHERE id = $1  (30일 이내)
    - 영구삭제: DELETE FROM maps WHERE deleted_at < NOW() - INTERVAL '30 days' (배치)
    - 노드 cascade: maps 삭제 → nodes ON DELETE CASCADE 자동 삭제


2.4 public.map_revisions
──────────────────────────
  id          UUID PK
  map_id      UUID FK → maps(id) ON DELETE CASCADE
  version     INT  NOT NULL
  patch_json  JSONB NOT NULL   -- NodePatch[] 배열
  client_id   VARCHAR(100)     -- 어느 클라이언트가 작성했는지
  patch_id    VARCHAR(200) UNIQUE  -- idempotency key
  created_by  UUID FK → users(id)
  created_at  TIMESTAMPTZ

  인덱스:
    idx_map_revisions_map_id  ON (map_id, version DESC)

  ※ 서버 영속 버전 히스토리 (Undo/Redo 클라이언트 메모리와 별개)


2.5 public.nodes  ★ 핵심 테이블
──────────────────────────────────
  id          UUID PK

  -- 소속
  map_id      UUID FK → maps(id) ON DELETE CASCADE
  parent_id   UUID FK → nodes(id) ON DELETE CASCADE  (nullable, self-ref)

  -- 콘텐츠
  text        TEXT DEFAULT ''
  node_type   VARCHAR(30) DEFAULT 'text'   -- 'text' | 'data-live'

  -- 다국어
  text_lang                 VARCHAR(20)    -- 작성 언어 코드 ('ko', 'en', 'ja')
  text_hash                 VARCHAR(128)   -- SHA-256[:16], 번역 캐시 무효화 키
  -- [V2 신규] 번역 제어 필드
  translation_mode          VARCHAR(10)  DEFAULT 'auto'   -- 'auto'|’skip’, 저장 시 서버 자동 결정
  translation_override      VARCHAR(10)  NULL             -- 'force_on'|'force_off'|NULL, 편집자 수동 설정
  author_preferred_language VARCHAR(20)  NULL             -- 작성 시점 작성자 기본 언어 스냅샷

  -- 트리 구조 (v3.0 추가)
  depth       INT   DEFAULT 0              -- 앱단 계산 (ltree nlevel(path) - 1)
  order_index FLOAT DEFAULT 0.0           -- [v3.0 FLOAT] 중간 삽입 O(1), 기존 INT에서 변경
  path        LTREE NOT NULL              -- [v3.0 신규] 예: 'root.n_a1b2c3d4.n_e5f6a7b8'
                                          -- UUID 하이픈 제거, 첫 8자 + 'n_' prefix

  -- 레이아웃
  layout_type VARCHAR(50) DEFAULT 'radial-bidirectional'
              -- kebab-case 저장값 (docs/02-domain/node-model.md BL 코드 매핑 참조)
              -- kanban 사용 시: depth 0=board, 1=column, 2=card, 3이상 금지
  collapsed   BOOLEAN DEFAULT FALSE

  -- 도형 & 스타일
  shape_type  VARCHAR(50) DEFAULT 'rounded-rectangle'
              -- 'rounded-rectangle' | 'rectangle' | 'ellipse' | 'pill' | 'diamond' | 'parallelogram' | 'none'
  style_json  JSONB DEFAULT '{}'
              -- NodeStyle + backgroundImage 통합 저장 (MVP)
              -- 구조: { fillColor, borderColor, textColor, fontSize, ... , backgroundImage: NodeBackgroundImage }
              -- NodeBackgroundImage: { type: 'preset'|'upload', url, fit, overlayOpacity, ... }

  -- 자유배치
  manual_position JSONB  -- [v3.0] { x: number, y: number }, freeform 전용
                         -- v2.1까지 manual_x/manual_y → v3.0에서 JSONB 단일 컬럼으로 통합

  -- 캐시
  size_cache  JSONB  -- [v3.0 신규] { width: number, height: number }, 렌더링 최적화 캐시

  created_at  TIMESTAMPTZ
  updated_at  TIMESTAMPTZ

  인덱스:
    idx_nodes_map_id       ON (map_id)
    idx_nodes_parent_id    ON (parent_id)
    idx_nodes_map_order          ON (map_id, order_index)
    idx_nodes_path_gist          ON (path) USING GIST   -- [v3.0] subtree <@ 조회 최적화 O(log n)
    idx_nodes_path_btree         ON (path) USING BTREE  -- [v3.0] exact match / ORDER BY
    idx_nodes_translation_skip   ON (map_id, translation_mode) WHERE translation_mode = 'skip'  -- [V2]

  ltree path 규칙:
    - Root: 'root'
    - 하위 노드: parent.path || '.' || 'n_' || replace(left(id::text, 8), '-', '')
    - 예: root  →  root.n_a1b2c3d4  →  root.n_a1b2c3d4.n_e5f6a7b8
    - subtree 전체 조회: SELECT * FROM nodes WHERE path <@ $node_path
    - subtree 이동: UPDATE nodes SET path = replace(path::text, old_prefix, new_prefix)::ltree


2.6 public.tags / public.node_tags
────────────────────────────────────
  tags:
    id        UUID PK
    owner_id  UUID FK → users(id) ON DELETE CASCADE
    name      VARCHAR(50)
    color     VARCHAR(7)  DEFAULT '#888888'
    created_at TIMESTAMPTZ
    UNIQUE (owner_id, name)

  node_tags (N:N 연결 테이블):
    node_id   UUID FK → nodes(id) ON DELETE CASCADE  }
    tag_id    UUID FK → tags(id) ON DELETE CASCADE    } PK (복합)
    created_at TIMESTAMPTZ


2.7 노드 부가 정보 테이블
──────────────────────────
  node_notes      (1:1): node_id UNIQUE FK, content TEXT, updated_at
  node_links      (1:N): node_id FK, url TEXT, label VARCHAR(255)
  node_attachments(1:N): node_id FK, storage_path, filename, mime_type, file_size_bytes
  node_media      (1:1): node_id UNIQUE FK, storage_path, media_type DEFAULT 'image'
                          ※ node_media = Indicator에 표시되는 오디오/비디오
                          ※ 배경 이미지는 nodes.style_json.backgroundImage에 저장 (v3.0)


2.8 public.published_maps
──────────────────────────
  id             UUID PK
  map_id         UUID FK → maps(id) ON DELETE CASCADE
  publish_id     VARCHAR(20) UNIQUE   -- 공개 URL 식별자 (nanoid)
  storage_path   VARCHAR(500)         -- HTML 스냅샷 저장 경로 (Supabase Storage)
  published_at   TIMESTAMPTZ
  unpublished_at TIMESTAMPTZ  NULL    -- NULL = 활성, NOT NULL = 비활성화됨

  인덱스:
    idx_published_maps_publish_id ON (publish_id)

  공개 URL: https://app.mindmap.ai.kr/published/{publish_id}
  비활성화: unpublished_at = NOW() → 해당 URL 접근 불가 (404)


2.9 public.exports
────────────────────
  id           UUID PK
  map_id       UUID FK → maps(id) ON DELETE CASCADE
  user_id      UUID FK → users(id)
  format       VARCHAR(20)   -- 'markdown' | 'html' | 'pdf' | 'png'
  status       VARCHAR(20) DEFAULT 'pending'  -- 'pending' | 'processing' | 'done' | 'error'
  storage_path VARCHAR(500)  -- 완료 시 결과 파일 경로
  created_at   TIMESTAMPTZ


2.10 public.ai_jobs
────────────────────
  id              UUID PK
  user_id         UUID FK → users(id)
  map_id          UUID FK → maps(id)  (nullable)
  job_type        VARCHAR(30)   -- 'generate' | 'expand' | 'summarize'
  prompt          TEXT
  result_markdown TEXT
  model           VARCHAR(100)
  tokens_used     INT
  status          VARCHAR(20) DEFAULT 'pending'
  created_at      TIMESTAMPTZ


2.11 public.node_translations
──────────────────────────────
  id                UUID PK
  node_id           UUID FK → nodes(id) ON DELETE CASCADE
  target_lang       VARCHAR(20)
  translated_text   TEXT
  source_text_hash  VARCHAR(128)   -- 번역 소스 text_hash, 변경 시 무효화
  model_version     VARCHAR(60)
  created_at        TIMESTAMPTZ
  updated_at        TIMESTAMPTZ
  UNIQUE (node_id, target_lang)

  인덱스:
    idx_node_translations_node_id  ON (node_id)  -- [V2 신규] 노드별 번역 일괄 조회 최적화


2.12 public.field_registry  (대시보드 필드 메타)
──────────────────────────────────────────────
  id            UUID PK
  entity_type   VARCHAR(50)    -- 'node' | 'map' | 'user'
  field_key     VARCHAR(100)
  label_ko      VARCHAR(200)
  table_name    VARCHAR(100)
  column_name   VARCHAR(200)
  data_type     VARCHAR(50)
  is_editable   BOOLEAN DEFAULT TRUE
  is_json_path  BOOLEAN DEFAULT FALSE
  json_path     VARCHAR(200)   -- JSONB 내 경로 (예: 'style_json.fillColor')
  display_order INT    DEFAULT 0
  description   TEXT


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
3. 관계 정의
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

auth.users → public.users
  1:1, 트리거(handle_new_user)로 자동 동기화

users ↔ workspaces
  N:N (workspace_members), role: 'owner' | 'editor' | 'viewer'

workspaces → maps
  1:N (workspace_id FK, ON DELETE SET NULL — 워크스페이스 삭제 시 맵은 유지)

maps → nodes
  1:N (map_id FK, ON DELETE CASCADE — 맵 삭제 시 전체 노드 cascade)

nodes → nodes (self-reference)
  parent_id FK → nodes(id) ON DELETE CASCADE — 부모 삭제 시 자식 전체 cascade

maps → map_revisions
  1:N, 서버 영속 패치 히스토리

maps → published_maps
  1:N (한 맵에 여러 공개 링크 히스토리)

maps → exports
  1:N (export 작업 이력)

nodes → node_notes
  1:1 (node_id UNIQUE)

nodes → node_links
  1:N

nodes → node_attachments
  1:N

nodes → node_media
  1:1 (node_id UNIQUE) — Indicator 표시용 오디오/비디오

nodes ↔ tags
  N:N (node_tags 연결 테이블)

nodes → node_translations
  1:N (node_id + target_lang UNIQUE)

users → ai_jobs
  1:N


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
4. 인덱스 전체 목록
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

테이블              인덱스명                      컬럼 / 조건
──────────────────────────────────────────────────────────────
maps                idx_maps_owner_id             (owner_id)
maps                idx_maps_workspace_id         (workspace_id)
maps                idx_maps_deleted_at           (deleted_at) WHERE deleted_at IS NULL
map_revisions       idx_map_revisions_map_id      (map_id, version DESC)
nodes               idx_nodes_map_id              (map_id)
nodes               idx_nodes_parent_id           (parent_id)
nodes               idx_nodes_map_order           (map_id, order_index)
nodes               idx_nodes_path_gist           (path) USING GIST   ★ ltree <@ 연산자
nodes               idx_nodes_path_btree          (path) USING BTREE
published_maps      idx_published_maps_publish_id (publish_id)


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
5. RLS (Row Level Security) 정책 요약
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

테이블          정책
──────────────────────────────────────────────────────────────
maps            SELECT/ALL: owner_id = auth.uid() AND deleted_at IS NULL
                SELECT: workspace_members에 속한 사용자 (role 무관)
nodes           SELECT/ALL: 해당 map의 owner 또는 workspace member
published_maps  SELECT (공개): 누구나 (unpublished_at IS NULL 조건)
                ALL: map owner만


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
6. 주요 설계 포인트
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

① ltree path (v3.0)
  - UUID 하이픈 제거 → 'n_' + 첫 8자 형태로 ltree 레이블 생성
  - GIST 인덱스로 <@, @>, ~ 연산자 O(log n) 성능
  - 노드 이동 시 path 일괄 UPDATE (move_node_subtree PostgreSQL 함수 사용)
  - depth = nlevel(path) - 1  (ltree nlevel은 1-based)

② order_index FLOAT (v3.0, 기존 INT에서 변경)
  - 새 노드를 두 노드 사이에 삽입: order = (prev + next) / 2
  - 정수 충돌 없이 O(1) 삽입 가능
  - 값이 너무 가까워지면 주기적으로 1.0, 2.0, 3.0… 재정규화

③ manual_position JSONB (v3.0, 기존 manual_x/manual_y에서 변경)
  - freeform 레이아웃 전용
  - { "x": 120.5, "y": 340.0 } 형태
  - 프론트엔드: node.manual_position?.x, node.manual_position?.y

④ backgroundImage 저장 위치
  - MVP: nodes.style_json 내 backgroundImage 키로 통합 저장
  - 확장: nodes.background_image_json JSONB 별도 컬럼 분리 가능 (erd.md v2.x의 bg_image_config_json 대체)
  - 타입 정의: docs/02-domain/node-model.md NodeBackgroundImage 참조

⑤ maps soft-delete + 30일 휴지통
  - deleted_at IS NOT NULL → 사용자에게 숨김, RLS에서 필터
  - 클라이언트 Undo 창(5-10초): 즉시 삭제 취소 가능
  - 대량 삭제 시 경고 모달 표시 (docs/02-domain/node-hierarchy-storage-strategy.md 참조)

⑥ node_media vs backgroundImage 구분
  - node_media: Indicator에 표시되는 오디오/비디오 재생 파일 (1:1)
  - backgroundImage: 노드 도형 배경에 깔리는 이미지 스타일 (style_json 내)

⑦ map_revisions vs 클라이언트 Undo/Redo
  - Undo/Redo: 클라이언트 메모리 히스토리 (빠른 편집 UX, 세션 종료 시 소멸)
  - map_revisions: 서버 영속 버전 (Diff Viewer / 복구 / 감사 로그)

⑧ layoutType kebab-case 표준화 (v3.0)
  - DB 저장값: kebab-case 영문 소문자 (예: 'radial-bidirectional')
  - BL 코드 ↔ DB 저장값 전체 매핑: docs/02-domain/node-model.md 참조
  - kanban 특수 규칙: depth 0=board, depth 1=column, depth 2=card, depth 3+ 금지

⑨ 번역 정책 3단계 계층 (V2 신규)

  레벨 1 (사용자): users.preferred_language, secondary_languages, skip_english_translation
    → 모든 맵에 적용되는 기본값. 가입/설정 화면에서 한 번 설정.

  레벨 2 (맵):     maps.translation_policy_json
    → NULL이면 사용자 기본 설정 그대로 따름.
    → 특정 맵에서만 다른 정책이 필요할 때 사용.
    → 예) 일본어 학습 맵: { "skipLanguages": ["ja"], "skipEnglish": true }

  레벨 3 (노드):   nodes.translation_override
    → 'force_on': 강제 번역 (다른 모든 설정 무시)
    → 'force_off': 강제 번역 금지 (모든 열람자 원문)
    → null: 상위 정책 따름 (기본)
    → 우선순위 최상위 — 레벨 1/2보다 항상 먼저 적용

  결정 알고리즘(shouldTranslate):
    docs/04-extensions/multilingual-translation.md § 3 참조
