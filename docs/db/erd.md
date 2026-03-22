# easymindmap — PostgreSQL ERD

> DB: PostgreSQL 16  
> 문서 버전: v2.1  
> 변경 이력:
> - v1.0: 초기 설계
> - v2.0: Map Properties 레벨별 설계 반영 (map_themes 신규, nodes 변경)
> - v2.1: users 테이블 휴대폰 번호 컬럼 추가

---

## 1. 전체 구조

```
users  ← [v2.1] phone_country_code, phone_number, phone_verified 추가
 └── workspace_members
      └── workspaces
           ├── map_themes              [v2.0 신규] 테마 프리셋
           └── maps
                ├── (map_themes FK)    [v2.0] theme_id → map_themes.id
                ├── map_config_json    [v2.0] Typography/Shape/Layout 레벨별 설정
                └── nodes
                     ├── level                [v2.0] 레벨 캐시
                     ├── layout_type (14종)   [v2.0] CHECK 확장
                     ├── style_override_json  [v2.0] 노드 예외 스타일
                     ├── bg_image_config_json [v2.0] 배경이미지 설정
                     ├── node_notes         (1:1)
                     ├── node_links         (1:N)
                     ├── node_attachments   (1:N)
                     ├── node_media         (1:1, 재생 미디어)
                     └── node_tags          (N:N → tags)
```

---

## 2. 변경 이력 요약

| 버전 | 테이블 | 변경 | 내용 |
|------|--------|------|------|
| v2.1 | `users` | **변경** | `phone_country_code`, `phone_number`, `phone_verified` 추가 |
| v2.0 | `map_themes` | **신규** | Typography/Shape/Layout 레벨별 프리셋 저장 |
| v2.0 | `maps` | **변경** | `theme_id` UUID FK화, `map_config_json JSONB` 추가 |
| v2.0 | `nodes` | **변경** | `layout_type` CHECK 3종→14종, `style_override_json` 추가, `level` 캐시 추가, `bg_image_config_json` 추가 |
| 유지 | 나머지 | **유지** | node_notes, tags, node_tags, node_links, node_attachments, node_media |

---

## 3. 관계 정의

### users ↔ workspaces
- 한 사용자는 여러 워크스페이스에 속할 수 있음
- 연결 테이블: `workspace_members` (role: owner/admin/member/viewer)

### workspaces ↔ map_themes [v2.0 신규]
- 1:N — 워크스페이스별 테마 프리셋 관리
- `is_system=TRUE`인 테마는 시스템 기본 테마

### workspaces ↔ maps
- 1:N — 하나의 워크스페이스에 여러 맵

### map_themes ↔ maps [v2.0 변경]
- 1:N — 하나의 테마를 여러 맵이 공유 가능
- `maps.theme_id NULL` → 시스템 DEFAULT_MAP_CONFIG 사용

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
- 1:1 (UNIQUE 제약) — 오디오/비디오 재생 미디어
- 배경 이미지(`bg_image_*`)와 구분: node_media는 Indicator에 표시되는 재생 파일

### maps ↔ map_revisions
- 1:N — 서버 영속 버전 히스토리 (Undo/Redo 클라이언트 메모리와 별개)

---

## 4. 핵심 테이블 상세

### 4.0 users [v2.1 변경]

```
[users]
  id                  PK
  email               UNIQUE
  password_hash       NULL 허용 (OAuth 사용 시)
  display_name
  locale
  timezone
  avatar_url

  phone_country_code  ← [v2.1] E.164 국가코드 (예: '82', '1', '81')
  phone_number        ← [v2.1] 로컬 번호 숫자만 (예: '01012345678')
  phone_verified      ← [v2.1] 본인인증 여부 (BOOLEAN, DEFAULT FALSE)

  status              active / suspended / deleted
```

**휴대폰 번호 저장 설계 (E.164 국제 표준):**

| 항목 | 설명 | 예시 |
|------|------|------|
| `phone_country_code` | 국가코드 숫자만, `+` 없이 저장 | `82` (한국), `1` (미국) |
| `phone_number` | 로컬 번호 숫자만, 선행 0 포함 | `01012345678` |
| `phone_verified` | 본인인증 완료 여부 | `FALSE` (기본) |

**실제 발신 번호 변환 (앱 레이어):**
```
e164 = '+' || country_code || substr(phone_number, 2)

예) 한국: '82' + '1012345678' → +821012345678
    미국: '1'  + '2125551234' → +12125551234
    일본: '81' + '9012345678' → +819012345678
```

**UNIQUE 제약:** `(phone_country_code, phone_number)` — 둘 다 NULL이면 중복 허용 (전화번호 미입력 사용자)

---

### 4.1 map_themes [v2.0 신규]

```
[map_themes]
  id             PK
  workspace_id   FK → workspaces.id
  name           VARCHAR(100)
  config_json    JSONB           ← MapConfig 전체 구조
  is_system      BOOLEAN         ← 시스템 기본 테마 여부
  created_by     FK → users.id
```

**config_json 구조:**
```json
{
  "map": {
    "defaultLayout": "Radial-Bidirectional",
    "canvasBackground": "#ffffff",
    "nodeSpacingH": 60,
    "nodeSpacingV": 30
  },
  "typography": {
    "fontFamily": "Pretendard",
    "fontFallbacks": ["Noto Sans KR", "Arial", "sans-serif"],
    "lineHeight": 1.3,
    "levels": {
      "root":   { "fontSize": 18, "fontWeight": "bold" },
      "level1": { "fontSize": 16, "fontWeight": "semibold" },
      "level2": { "fontSize": 15, "fontWeight": "medium" },
      "level3": { "fontSize": 14, "fontWeight": "regular" },
      "level4": { "fontSize": 13, "fontWeight": "regular" },
      "level5": { "fontSize": 12, "fontWeight": "regular" }
    }
  },
  "shape": {
    "borderWidth": 1.5,
    "levels": {
      "root":   { "shape": "rounded-rectangle", "fillColor": "#4A90D9", "borderColor": "#2C5F8A" },
      "level1": { "shape": "rounded-rectangle", "fillColor": "#7EC8A4", "borderColor": "#4A9B72" },
      "level2": { "shape": "capsule",           "fillColor": "#F5E6A3", "borderColor": "#C9B84A" },
      "level3": { "shape": "capsule",           "fillColor": "#f0f0f0", "borderColor": "#cccccc" },
      "level4": { "shape": "none", "fillColor": "transparent", "borderColor": "transparent" },
      "level5": { "shape": "none", "fillColor": "transparent", "borderColor": "transparent" }
    }
  },
  "layout": {
    "levels": {
      "root":   "Radial-Bidirectional",
      "level1": "Radial-Right",
      "level2": "Tree-Right",
      "level3": "Tree-Right",
      "level4": "Tree-Right",
      "level5": "Tree-Right"
    }
  }
}
```

### 4.2 maps [v2.0 변경]

```
[maps]
  id                       PK
  workspace_id             FK → workspaces.id
  theme_id                 FK → map_themes.id  (NULL=시스템 기본)
  title
  description
  root_node_id             FK → nodes.id  (nullable)
  map_config_json          JSONB    ← [v2.0 신규] MapConfig 구조
  edge_policy              ← 'layout-based' (방사형=curve, 나머지=tree)
  view_mode                ← 'edit' | 'dashboard'
  refresh_interval_seconds ← Dashboard 갱신 주기
  created_by               FK → users.id
  updated_by               FK → users.id
  current_version
```

### 4.3 nodes [v2.0 변경]

```
[nodes]
  id                   PK
  map_id               FK → maps.id
  parent_id            FK → nodes.id  (nullable, self-ref)
  node_type            ← 'text' | 'data-live' | 'formula'
  text
  text_lang
  text_hash            ← 번역 캐시 무효화 키

  layout_type          ← NULL=상속 | 14종 중 하나 [v2.0 CHECK 확장]
                          Radial-Bidirectional / Radial-Right / Radial-Left
                          Tree-Up / Tree-Down / Tree-Right / Tree-Left
                          Hierarchy-Right / Hierarchy-Left
                          ProcessTree-Right / ProcessTree-Left
                          ProcessTree-Right-A / ProcessTree-Right-B
                          Freeform

  level                ← [v2.0 신규] 레벨 캐시 (0=Root, 1=Level1...)
                          style 계산 시 MIN(level, 5) 적용

  style_override_json  ← [v2.0 신규] NodeStyleOverride JSONB
                          NULL이면 레벨 기반 기본값 사용
                          { fontFamily, fontSize, fontWeight, italic, underline,
                            textColor, shape, fillColor, borderColor, borderWidth,
                            layoutType }

  collapsed
  manual_x / manual_y  ← freeform 전용
  position_mode        ← 'auto' | 'manual'

  bg_image_mode        ← [v2.0] 'none' | 'preset' | 'upload'
  bg_media_id          ← [v2.0] node_media.id 소프트 참조
  bg_image_config_json ← [v2.0] { fit, position, overlayOpacity }

  has_note / link_count / attachment_count / has_media / tag_count
                       ← Indicator 요약 캐시
  created_by / updated_by
```

---

## 5. Style Resolution 우선순위

```
nodes.style_override_json[prop]
    ↓ NULL이면
maps.map_config_json.levels[level][prop]
    ↓ NULL이면
map_themes.config_json.levels[level][prop]
    ↓ NULL이면
DEFAULT_MAP_CONFIG.levels[level][prop]   ← 시스템 하드코딩 기본값
```

> `effectiveLevel = MIN(nodes.level, 5)` — level5 이상은 level5 설정 통일

---

## 6. Branch Layout 14종 (nodes.layout_type CHECK 대상)

| 코드 | 영문명 | 그룹 |
|------|--------|------|
| BL-RD-BI | Radial-Bidirectional | 방사형 |
| BL-RD-R | Radial-Right | 방사형 |
| BL-RD-L | Radial-Left | 방사형 |
| BL-TR-U | Tree-Up | 트리형 |
| BL-TR-D | Tree-Down | 트리형 |
| BL-TR-R | Tree-Right | 트리형 |
| BL-TR-L | Tree-Left | 트리형 |
| BL-HR-R | Hierarchy-Right | 계층형 |
| BL-HR-L | Hierarchy-Left | 계층형 |
| BL-PR-R | ProcessTree-Right | 진행트리 |
| BL-PR-L | ProcessTree-Left | 진행트리 |
| BL-PR-RA | ProcessTree-Right-A | 진행트리 |
| BL-PR-RB | ProcessTree-Right-B | 진행트리 |
| BL-FR | Freeform | 자유배치형 |

> `NULL` 허용 — NULL이면 부모 노드 layoutType 상속 → maps 기본 Layout 순서로 결정

---

## 7. 설계 포인트

### ① 전화번호 E.164 분리 저장 (v2.1)
- 국가코드와 로컬 번호를 분리 저장하여 국가별 포맷 유연 대응
- 발신 변환: `'+' || country_code || substr(phone_number, 2)`
- 전화번호 미입력 사용자: 두 컬럼 모두 NULL (UNIQUE 중복 허용)

### ② layout_type은 node 단위 override
- `maps.map_config_json.layout.levels` = 맵 전체 레벨별 기본값
- `nodes.layout_type` = 해당 subtree override (NULL이면 상속)

### ③ level 캐시 컬럼
- 트리 순회 없이 레벨 기반 스타일 즉시 계산 가능
- 노드 이동(parent 변경) 시 해당 subtree 전체 level 재계산 필요
- `MIN(level, 5)` 적용: level 5 이상은 level5 설정으로 통일

### ④ style_override_json은 예외값만 저장
- 기본값과 동일한 속성은 저장하지 않음 → Markdown 파일도 깔끔하게 유지
- NULL이면 Style Resolution 계층에서 상위값 사용

### ⑤ node_media vs bg_image 구분
- `node_media`: 노드 Indicator에 표시되는 오디오/비디오 재생 파일 (1:1)
- `bg_image_*`: 노드 도형 배경에 깔리는 이미지 스타일 속성 (nodes 테이블 내 컬럼)

### ⑥ map_revisions는 Undo/Redo와 구분
- Undo/Redo: 클라이언트 메모리 히스토리 (빠른 편집 UX)
- map_revisions: 서버 영속 버전 (Diff Viewer / 복구 / 감사)
