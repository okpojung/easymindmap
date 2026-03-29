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

### 1. users (Supabase Auth 연동)

> Supabase Auth를 사용하면 `auth.users` 테이블이 자동 생성됨.  
> 아래 `public.users`는 추가 프로필 정보를 저장하는 확장 테이블.

```sql
CREATE TABLE public.users (
  id            UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name  VARCHAR(100),
  preferred_language  VARCHAR(10) DEFAULT 'ko',
  default_layout_type VARCHAR(50) DEFAULT 'radial-bidirectional',
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
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
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id             UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  title                VARCHAR(255) NOT NULL DEFAULT 'Untitled',
  default_layout_type  VARCHAR(50) DEFAULT 'radial-bidirectional',
  deleted_at           TIMESTAMPTZ,   -- soft delete
  created_at           TIMESTAMPTZ DEFAULT NOW(),
  updated_at           TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_maps_owner_id ON public.maps(owner_id);
CREATE INDEX idx_maps_deleted_at ON public.maps(deleted_at);
```

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
  order_index      INTEGER NOT NULL DEFAULT 0,

  -- 레이아웃
  layout_type      VARCHAR(50) NOT NULL DEFAULT 'radial-bidirectional',
  collapsed        BOOLEAN NOT NULL DEFAULT FALSE,

  -- 도형 & 스타일
  shape_type       VARCHAR(50) NOT NULL DEFAULT 'rounded-rectangle',
  style            JSONB NOT NULL DEFAULT '{}',

  -- 부가 요소
  tags             UUID[] NOT NULL DEFAULT '{}',
  hyperlink_ids    UUID[] NOT NULL DEFAULT '{}',
  attachment_ids   UUID[] NOT NULL DEFAULT '{}',
  multimedia_id    UUID,

  -- 자유배치
  manual_position  JSONB,   -- { x: number, y: number }

  -- 캐시
  size             JSONB,   -- { width: number, height: number }

  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_nodes_map_id ON public.nodes(map_id);
CREATE INDEX idx_nodes_parent_id ON public.nodes(parent_id);
CREATE INDEX idx_nodes_map_order ON public.nodes(map_id, order_index);
```

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

---

### 4. revisions

```sql
CREATE TABLE public.revisions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  map_id       UUID NOT NULL REFERENCES public.maps(id) ON DELETE CASCADE,
  change_type  VARCHAR(20) NOT NULL CHECK (change_type IN ('snapshot', 'patch')),
  data         JSONB NOT NULL,
  created_by   UUID REFERENCES public.users(id),
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_revisions_map_id ON public.revisions(map_id);
CREATE INDEX idx_revisions_created_at ON public.revisions(map_id, created_at DESC);

-- 오래된 patch 자동 정리 (30일 초과 patch 삭제, snapshot은 유지)
-- Supabase pg_cron 또는 Edge Function으로 스케줄 실행
```

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

```sql
CREATE TABLE public.tags (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id    UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  name        VARCHAR(50) NOT NULL,
  color       VARCHAR(7) NOT NULL DEFAULT '#888888',  -- hex
  created_at  TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(owner_id, name)
);

CREATE INDEX idx_tags_owner_id ON public.tags(owner_id);
```

---

### 7. ai_requests

```sql
CREATE TABLE public.ai_requests (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES public.users(id),
  map_id           UUID REFERENCES public.maps(id),
  prompt           TEXT NOT NULL,
  result_markdown  TEXT,
  model            VARCHAR(100),   -- 'gpt-4o', 'claude-3-5-sonnet' 등
  tokens_used      INTEGER,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_ai_requests_user_id ON public.ai_requests(user_id);
```

---

## Row Level Security (RLS) 정책

Supabase는 RLS로 사용자별 데이터 격리를 자동으로 처리.

```sql
-- maps 테이블 RLS
ALTER TABLE public.maps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users can view own maps"
  ON public.maps FOR SELECT
  USING (auth.uid() = owner_id AND deleted_at IS NULL);

CREATE POLICY "users can insert own maps"
  ON public.maps FOR INSERT
  WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "users can update own maps"
  ON public.maps FOR UPDATE
  USING (auth.uid() = owner_id);

CREATE POLICY "users can delete own maps"
  ON public.maps FOR DELETE
  USING (auth.uid() = owner_id);

-- nodes 테이블 RLS (map 소유자만 접근)
ALTER TABLE public.nodes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users can manage nodes of own maps"
  ON public.nodes FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.maps
      WHERE maps.id = nodes.map_id
        AND maps.owner_id = auth.uid()
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
    ├── public.revisions
    └── public.published_maps

public.users
    │ 1:N
    └── public.tags

public.nodes.tags[] → public.tags.id (배열 참조)
```

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
