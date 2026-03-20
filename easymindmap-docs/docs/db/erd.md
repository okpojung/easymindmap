# easymindmap — PostgreSQL ERD

> DB: PostgreSQL 16  
> 문서 버전: v1.0

---

## 1. 상위 구조

```
users
 └── workspace_members
      └── workspaces
           └── maps
                ├── nodes
                │    ├── node_notes         (1:1)
                │    ├── node_links         (1:N)
                │    ├── node_attachments   (1:N)
                │    ├── node_media         (1:1)
                │    ├── node_tags          (N:N → tags)
                │    └── node_translations  (1:N, 번역 캐시)
                ├── node_order             (형제 순서)
                ├── edges                  (확장 연결선)
                ├── map_revisions          (버전 히스토리)
                ├── map_permissions        (공유 권한)
                ├── exports                (export 작업)
                ├── published_maps         (퍼블리시)
                ├── ai_jobs                (AI 작업)
                ├── translation_jobs       (번역 작업 큐)
                ├── presence_sessions      (실시간 접속)
                └── audit_logs            (감사 로그)

tags
 └── node_tags
```

---

## 2. 관계 정의

### users ↔ workspaces
- 한 사용자는 여러 워크스페이스에 속할 수 있음
- 연결 테이블: `workspace_members`
- 역할: `owner / admin / member / viewer`

### workspaces ↔ maps
- 1:N — 하나의 워크스페이스에 여러 맵

### maps ↔ nodes
- 1:N — 하나의 맵에 여러 노드
- 노드는 `parent_id` self-reference로 트리 구조 형성

### nodes ↔ tags
- N:N — 연결 테이블: `node_tags`

### nodes ↔ node_notes
- 1:1 (UNIQUE 제약)

### nodes ↔ node_links
- 1:N

### nodes ↔ node_attachments
- 1:N

### nodes ↔ node_media
- 1:1 (UNIQUE 제약) — 노드 배경이미지

### nodes ↔ node_translations
- 1:N — 언어별 번역 캐시 저장
- `source_text_hash` 불일치 시 캐시 무효

### maps ↔ map_revisions
- 1:N — 서버 버전 히스토리 (Undo/Redo와 별개)

### maps ↔ map_permissions
- 1:N — 공유 링크 / 사용자별 권한

---

## 3. ERD 텍스트 다이어그램

```
[users]
  id             PK
  email          UNIQUE
  display_name
  locale
  timezone
  status

[workspaces]
  id             PK
  owner_id       FK → users.id
  name
  slug           UNIQUE
  plan

[workspace_members]
  workspace_id   FK → workspaces.id
  user_id        FK → users.id
  role
  PK(workspace_id, user_id)

[maps]
  id                         PK
  workspace_id               FK → workspaces.id
  root_node_id               FK → nodes.id  (nullable)
  title
  default_layout_type
  edge_policy
  view_mode                  ← 'edit' | 'dashboard'
  refresh_interval_seconds   ← Dashboard 갱신 주기 (초, 0=off)
  current_version
  created_by                 FK → users.id
  updated_by                 FK → users.id

[nodes]
  id                 PK
  map_id             FK → maps.id
  parent_id          FK → nodes.id  (nullable, self-ref)
  node_type          ← 'text' | 'data-live' | 'formula'
  text
  text_lang          ← 작성 언어 코드 ('ko', 'en', 'ja' ...)
  text_hash          ← 번역 캐시 무효화 키
  data_source        ← V3 예약: { "type": "api", "url": "..." } (JSONB, nullable)
  refresh_policy     ← V3 예약: 'polling' | 'push' | 'manual' (nullable)
  layout_type        ← subtree override용 (NULL=상속)
  shape_type
  fill_color
  border_color
  text_color
  collapsed
  manual_x           ← freeform 전용
  manual_y           ← freeform 전용
  position_mode      ← 'auto' | 'manual'
  has_note           ← indicator 최적화 캐시
  link_count
  attachment_count
  has_media
  tag_count
  created_by         FK → users.id
  updated_by         FK → users.id

[tags]
  id               PK
  workspace_id     FK → workspaces.id
  name
  normalized_name
  color
  UNIQUE(workspace_id, normalized_name)

[node_tags]
  node_id  FK → nodes.id
  tag_id   FK → tags.id
  PK(node_id, tag_id)

[node_notes]
  id          PK
  node_id     FK → nodes.id  UNIQUE

[node_links]
  id          PK
  node_id     FK → nodes.id
  title
  url
  sort_order

[node_attachments]
  id             PK
  node_id        FK → nodes.id
  storage_key
  original_name
  mime_type
  file_size

[node_media]
  id             PK
  node_id        FK → nodes.id  UNIQUE
  storage_key
  mime_type
  file_size

[node_translations]
  id                PK
  node_id           FK → nodes.id
  target_lang
  translated_text
  source_text_hash  ← nodes.text_hash 와 일치해야 유효
  model_version
  UNIQUE(node_id, target_lang)

[map_revisions]
  id                  PK
  map_id              FK → maps.id
  version             BIGINT
  actor_id            FK → users.id
  summary
  patch_json          JSONB
  inverse_patch_json  JSONB
  UNIQUE(map_id, version)

[map_permissions]
  id           PK
  map_id       FK → maps.id
  user_id      FK → users.id  (nullable)
  role
  share_token  UNIQUE  (nullable, 링크 공유용)
  expires_at

[exports]
  id            PK
  map_id        FK → maps.id
  requested_by  FK → users.id
  export_type   ← markdown | html | snapshot
  status        ← queued | processing | completed | failed
  storage_key

[published_maps]
  id            PK
  map_id        FK → maps.id
  published_by  FK → users.id
  slug          UNIQUE
  visibility    ← public | unlisted | private
  storage_key
  is_active

[ai_jobs]
  id            PK
  map_id        FK → maps.id
  node_id       FK → nodes.id  (nullable)
  requested_by  FK → users.id
  job_type      ← generate | expand | summarize | tag-suggest | cleanup
  status
  result_json   JSONB

[translation_jobs]
  id            PK
  node_id       FK → nodes.id
  source_lang
  target_lang
  status

[presence_sessions]
  id           PK
  map_id       FK → maps.id
  user_id      FK → users.id
  session_id
  status       ← active | idle | disconnected
  last_seen_at

[audit_logs]
  id            PK
  workspace_id  FK → workspaces.id  (nullable)
  map_id        FK → maps.id        (nullable)
  actor_id      FK → users.id       (nullable)
  action_type
  target_type
  target_id
  metadata      JSONB
```

---

## 4. 설계 포인트

### ① layout_type은 node 단위 override
- `maps.default_layout_type` = 맵 전체 기본값
- `nodes.layout_type` = 해당 subtree override (NULL이면 상속)
- subtree 단위 레이아웃 전환을 위해 필수

### ② manual_x / manual_y는 freeform 전용
- 자동 레이아웃 계산값(`computedX/Y`)은 DB에 저장하지 않음
- `position_mode = 'manual'`인 경우에만 `manual_x/y` 사용

### ③ node_translations는 캐시 테이블
- 원문 진실은 항상 `nodes.text`
- `source_text_hash != nodes.text_hash`이면 번역 캐시 무효 → 재번역

### ④ map_revisions는 Undo/Redo와 구분
- **Undo/Redo**: 클라이언트 메모리 히스토리 (빠른 편집 UX)
- **map_revisions**: 서버 영속 버전 (Diff Viewer / 복구 / 감사)

### ⑤ view_mode + refresh_interval_seconds
- `view_mode = 'dashboard'` → Read-only 표시 + 자동 리프레시 활성화
- `refresh_interval_seconds = 0` → 자동 리프레시 off
- 외부 시스템이 `nodes.text`를 직접 UPDATE → 클라이언트 polling으로 감지

### ⑥ node_type 예약 컬럼 (V3 대비)
- 현재: `'text'` (일반 노드)
- V3: `'data-live'` (외부 갱신 전용 노드, 사용자 직접 편집 불가)
- V3+: `'formula'` (다른 노드 참조 계산)
