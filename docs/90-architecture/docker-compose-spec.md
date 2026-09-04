# easymindmap — Docker Compose 설계

문서명: `docs/05-implementation/docker-compose-spec.md`  
기준: **ESXi 7.0.3 환경, Supabase Self-hosted + VM별 분리 배포**  
결정일: 2026-03-27  
최종 업데이트: 2026-07-27

> **개정 (2026-07)**: 컨테이너 실행·배포의 **운영 주체는 Coolify** 로
> 확정 — 개발/프로덕션 서버 모두 Coolify 가 앱·DB 컨테이너를 관리하고
> GitHub 웹훅으로 자동 배포한다([`dev-server-coolify.md`](dev-server-coolify.md)).
> 이 문서의 compose 정의는 **서비스 구성(이미지·포트·환경변수)의 기준
> 스펙**으로 유지하며, Supabase Self-hosted 등 다중 컨테이너 스택은
> Coolify 의 Docker Compose 리소스로 이 정의를 그대로 사용한다.
>
> ⚠️ **IP 는 문서용 예시**(사설 `192.168.0.x` · 공인 `203.0.113.x`)이고,
> **도메인은 실제 값**이다(`*.mindmap.ai.kr`). 남아 있는 `*.example.com` 은
> 아직 정하지 않은 주소이거나 일반 예시다 — 자세한 근거는
> [`infra-architecture.md`](infra-architecture.md) 상단.

---

## 아키텍처 결정: Supabase Self-hosted

> ### ⚠️ 2026-09-04 — **전체 Supabase 스택은 띄우지 않기로 했다**
>
> 이 문서가 그리는 것은 **Supabase Self-hosted 전체 스택**(Kong 게이트웨이
> 뒤에 GoTrue·Storage·Realtime·Studio·PostgREST)이다. **그 구성은 채택하지
> 않는다** — Supabase 에 맡기려던 네 가지가 전부 다른 것으로 굴러간다.
>
> | 무엇 | 이 문서의 전제 | 실제 | 근거 |
> |---|---|---|---|
> | 인증 | Kong + GoTrue | **GoTrue 단독** (`auth-dev.mindmap.ai.kr`) | [`backend-phase1.md`](../05-implementation/backend-phase1.md) Phase 3 "경로 A" |
> | 첨부 | Supabase Storage | **로컬 디스크 + NAS NFS** (`STORAGE_LOCAL_DIR`) | [`attachment-storage.md`](../04-extensions/attachment-storage.md) |
> | DB 접근 | PostgREST | **API 가 `pg` 로 직접** (raw SQL·ltree) | [`backend-phase1.md`](../05-implementation/backend-phase1.md) "DatabaseService" |
> | 협업 | Supabase Realtime + Redis | **자체 WebSocket + CRDT(Yjs)** | [`27-sync-model.md`](../04-extensions/collaboration/27-sync-model.md) |
>
> **왜 이렇게 갈렸나.** `backend-phase1.md` 가 처음부터 이렇게 적었다 —
> *"스펙(NestJS + Supabase + Postgres 16 + ltree)의 구조를 따르되,
> **무거운 조각(Supabase 전체 스택·Redis)은 뒤로 미루고 실제로 돌아가는
> 최소 단위**부터 세웠다."* 그 뒤 각 기능이 필요해질 때마다 **더 가벼운
> 쪽**이 선택됐고(Phase 3 는 "경로 A(권장, 가벼움)"), 미뤄 둔 조각을
> 꺼낼 이유가 끝내 생기지 않았다.
>
> **이 문서는 지우지 않고 남긴다** — 전체 스택으로 돌아갈 일이 생기면
> 이것이 기준 스펙이다. 다만 **지금 구성의 근거로 읽어서는 안 된다.**
> 실제 배포 기준은 [`dev-server-coolify.md`](dev-server-coolify.md) 다.
> 아래 `supabase.example.com` 도 **끝내 만들지 않은 주소**다.


기존 설계(PostgreSQL + MinIO 직접 설치)에서 **Supabase Self-hosted**로 변경.

| 항목 | 기존 | 변경 후 |
|------|------|---------|
| PostgreSQL | VM-03 직접 설치 | **Supabase VM (내장)** |
| Object Storage | MinIO VM-07 | **Supabase Storage (내장)** |
| Auth / JWT | NestJS 직접 구현 | **Supabase Auth (내장)** |
| Realtime (협업) | WebSocket 서버 별도 | **Supabase Realtime (내장, V1 대비)** |
| VM 수 | 7대 | **5대** (Supabase VM 1대로 통합) |

---

## 1. VM 구성 (최종)

```
VM-01  Edge          Nginx (TLS, Reverse Proxy, Rate Limit)
VM-02  App           Frontend + NestJS API
VM-03  Supabase      Supabase All-in-One (Docker Compose)
VM-04  Redis         Redis 7 (Cache, Queue, Presence)
VM-05  Worker        AI / Export / Translation Workers
```

> **VM-03 Supabase** 권장 사양: 8 vCPU, 16GB RAM, 100GB SSD  
> Supabase는 내부적으로 12개 컨테이너를 Docker Compose로 실행함

---

## 2. 서비스 목록 (easymindmap 전용)

```
frontend          React 빌드 정적 파일 (VM-02)
api               NestJS REST API (VM-02)
ws-gateway        WebSocket 협업 Gateway (VM-02, V1~)
worker-core       Queue consumer / 백그라운드 작업 (VM-05)
worker-ai         AI generation / expand worker (VM-05)
worker-export     Markdown/HTML export worker (VM-05)
worker-translation 다국어 번역 worker (VM-05, V2~)
worker-redmine    Redmine 동기화 worker (VM-05, V1 WBS~, BullMQ 'redmine-sync' 큐)

--- Supabase VM-03 내부 (자동 관리) ---
supabase-db       PostgreSQL 16
supabase-auth     GoTrue (Auth)
supabase-storage  Storage API
supabase-realtime Realtime
supabase-kong     API Gateway
supabase-studio   관리 대시보드
(기타 내부 서비스)

--- VM-04 ---
redis             Redis 7
```

> **BullMQ 큐 목록**: `export`, `ai-generate`, `translation`, `redmine-sync`  
> `redmine-sync` 큐: Exponential Backoff 재시도 (1s → 2s → 4s, 최대 3회)

---

## 3. Supabase VM-03 설치 (docker-compose.yml)

```bash
# VM-03 Ubuntu 22.04 에서 실행

# 1. Docker 설치
apt update && apt install -y docker.io docker-compose-plugin

# 2. Supabase 클론
git clone --depth 1 https://github.com/supabase/supabase
mkdir /opt/supabase
cp -rf supabase/docker/* /opt/supabase/
cp supabase/docker/.env.example /opt/supabase/.env
cd /opt/supabase

# 3. 시크릿 자동 생성
sh ./utils/generate-keys.sh

# 4. .env 핵심 설정
# SUPABASE_PUBLIC_URL=https://supabase.example.com
# API_EXTERNAL_URL=https://supabase.example.com
# SITE_URL=https://example.com

# 5. MVP에서 불필요한 서비스 제거 (리소스 절감)
# docker-compose.yml에서 analytics(Logflare), imgproxy 섹션 제거

# 6. 실행
docker compose up -d
```

### MVP에서 제거할 서비스 (docker-compose.yml 수정)

```yaml
# 아래 서비스 섹션을 docker-compose.yml에서 주석 처리 또는 삭제
# - analytics (Logflare) — 운영 모니터링 도입 전까지 불필요
# - imgproxy — 이미지 리사이징 불필요 (MVP)
# 제거 시 RAM 요구량 약 4GB → 운영 가능
```

---

## 4. App VM-02 Compose

파일 경로: `deploy/vm02-app/docker-compose.yml`

```yaml
version: "3.9"

services:
  frontend:
    image: easymindmap/frontend:latest
    container_name: easymindmap-frontend
    env_file: .env
    ports:
      - "${WEB_PORT:-8080}:80"
    restart: unless-stopped

  api:
    image: easymindmap/api:latest
    container_name: easymindmap-api
    env_file: .env
    ports:
      - "${API_PORT:-3000}:3000"
    environment:
      # Supabase (VM-03)
      - SUPABASE_URL=${SUPABASE_URL}
      - SUPABASE_SERVICE_ROLE_KEY=${SUPABASE_SERVICE_ROLE_KEY}
      # Redis (VM-04)
      - REDIS_HOST=${REDIS_HOST}
      - REDIS_PORT=${REDIS_PORT:-6379}
      - REDIS_PASSWORD=${REDIS_PASSWORD}
      # AI
      - AI_PROVIDER=${AI_PROVIDER:-openai}
      - AI_API_KEY=${AI_API_KEY}
      - AI_MODEL_GENERATE=${AI_MODEL_GENERATE:-gpt-4o}
      # Translation (V2)
      - TRANSLATION_PROVIDER=${TRANSLATION_PROVIDER:-hybrid}
      - TRANSLATION_DEEPL_API_KEY=${TRANSLATION_DEEPL_API_KEY}
      # Redmine (V1 WBS)
      - REDMINE_ENCRYPTION_KEY=${REDMINE_ENCRYPTION_KEY}
      # Dashboard (V3)
      - DASHBOARD_REFRESH_CHANNEL_PREFIX=${DASHBOARD_REFRESH_CHANNEL_PREFIX:-dashboard:}
      # Collaboration
      - INVITE_TOKEN_SECRET=${INVITE_TOKEN_SECRET}
      - INVITE_TOKEN_EXPIRES_DAYS=${INVITE_TOKEN_EXPIRES_DAYS:-7}
      # Feature flags
      - FEATURE_REALTIME_COLLAB=${FEATURE_REALTIME_COLLAB:-false}
      - FEATURE_AI_TRANSLATION=${FEATURE_AI_TRANSLATION:-false}
      - FEATURE_REDMINE_INTEGRATION=${FEATURE_REDMINE_INTEGRATION:-false}
      - FEATURE_DASHBOARD_MAP=${FEATURE_DASHBOARD_MAP:-false}
    depends_on:
      - redis  # redis는 VM-04이지만 네트워크로 연결
    restart: unless-stopped

  ws-gateway:
    image: easymindmap/ws-gateway:latest
    container_name: easymindmap-ws
    env_file: .env
    ports:
      - "${WS_PORT:-3100}:3100"
    environment:
      - SUPABASE_URL=${SUPABASE_URL}
      - SUPABASE_SERVICE_ROLE_KEY=${SUPABASE_SERVICE_ROLE_KEY}
      - REDIS_HOST=${REDIS_HOST}
      - REDIS_PORT=${REDIS_PORT:-6379}
      - REDIS_PASSWORD=${REDIS_PASSWORD}
      - WS_ALLOWED_ORIGINS=${WS_ALLOWED_ORIGINS}
    restart: unless-stopped
```

---

## 5. Worker VM-05 Compose

파일 경로: `deploy/vm05-worker/docker-compose.yml`

```yaml
version: "3.9"

services:
  worker-core:
    image: easymindmap/worker-core:latest
    container_name: easymindmap-worker-core
    env_file: .env
    restart: unless-stopped

  worker-ai:
    image: easymindmap/worker-ai:latest
    container_name: easymindmap-worker-ai
    env_file: .env
    restart: unless-stopped

  worker-export:
    image: easymindmap/worker-export:latest
    container_name: easymindmap-worker-export
    env_file: .env
    restart: unless-stopped

  worker-translation:
    image: easymindmap/worker-translation:latest
    container_name: easymindmap-worker-translation
    env_file: .env
    restart: unless-stopped

  worker-redmine:
    image: easymindmap/worker-redmine:latest
    container_name: easymindmap-worker-redmine
    env_file: .env
    environment:
      - REDMINE_SYNC_QUEUE_CONCURRENCY=3
      - REDMINE_SYNC_RETRY_TIMES=3
    restart: unless-stopped
```

---

## 5-1. 개발용 BullMQ Worker (단일 컨테이너)

단일 컨테이너로 빠르게 실행하는 통합 worker (개발/스테이징 환경용):

```yaml
  worker:
    build: ./backend
    command: node dist/worker/main.js
    environment:
      - NODE_ENV=production
      - REDIS_URL=redis://redis:6379
    depends_on:
      - redis
      - postgres
    restart: unless-stopped
```

> 운영 환경(VM-05)에서는 위의 개별 worker 서비스(worker-core, worker-ai, worker-export, worker-translation, worker-redmine)를 각각 실행하여 큐별 독립 스케일링을 권장한다.

---

## 6. Redis VM-04 Compose

파일 경로: `deploy/vm04-redis/docker-compose.yml`

```yaml
version: "3.9"

services:
  redis:
    image: redis:7-alpine
    container_name: easymindmap-redis
    command: redis-server --appendonly yes --requirepass ${REDIS_PASSWORD}
    volumes:
      - ./data:/data
    ports:
      - "6379:6379"   # 내부망에서만 접근 가능하도록 방화벽 설정 필수
    restart: unless-stopped
```

---

## 7. Edge VM-01 Nginx 라우팅

파일 경로: `deploy/vm01-edge/nginx/conf.d/easymindmap.conf`

```nginx
# Nginx 라우팅 요약
upstream api     { server VM-02-IP:3000; }
upstream frontend { server VM-02-IP:8080; }
upstream ws      { server VM-02-IP:3100; }
upstream supabase { server VM-03-IP:8000; }  # Supabase Kong Gateway

server {
    listen 443 ssl;
    server_name example.com;

    location /api/     { proxy_pass http://api; }
    location /ws/      { proxy_pass http://ws; upgrade websocket; }
    location /         { proxy_pass http://frontend; }
}

server {
    listen 443 ssl;
    server_name supabase.example.com;

    location / { proxy_pass http://supabase; }   # Supabase Studio + API
}
```

---

## 8. 개발용 통합 Compose (로컬 개발)

파일 경로: `deploy/docker-compose.dev.yml`

```yaml
version: "3.9"

services:
  api:
    build: { context: ../apps/api, dockerfile: Dockerfile.dev }
    volumes: ["../apps/api:/app"]
    command: npm run start:dev
    env_file: .env.local
    ports: ["3000:3000"]

  frontend:
    build: { context: ../apps/frontend, dockerfile: Dockerfile.dev }
    volumes: ["../apps/frontend:/app"]
    command: npm run dev
    ports: ["8080:8080"]

  redis:
    image: redis:7-alpine
    ports: ["6379:6379"]

  # 로컬 개발 시 Supabase는 클라우드 무료 티어 또는 로컬 Supabase CLI 사용
  # supabase start (Supabase CLI)
```

---

## 9. 실행 절차

```bash
# 1. 환경변수 설정
cp .env.example .env
# .env 편집 (Supabase URL, Key, Redis 비밀번호, AI API 키 등)

# 2. Supabase VM-03 먼저 시작
cd /opt/supabase && docker compose up -d

# 3. Redis VM-04 시작
cd /opt/redis && docker compose up -d

# 4. Worker VM-05 시작
cd /opt/worker && docker compose up -d

# 5. App VM-02 시작
cd /opt/app && docker compose up -d

# 6. Edge VM-01 Nginx 시작
systemctl restart nginx
```

---

## 10. 백업 전략

| 대상 | 방법 | 주기 |
|------|------|------|
| Supabase DB | `supabase db dump` or pg_dump | 매일 |
| Redis | AOF 파일 자동 저장 + 정기 복사 | 매일 |
| Supabase Storage | 버킷 sync → 별도 NAS | 매일 |
| ESXi VM 전체 | ESXi 스냅샷 | 주간 |

```bash
# Supabase DB 백업 예시
docker exec supabase-db pg_dump -U postgres postgres \
  > /backup/supabase_$(date +%Y%m%d).sql
```
